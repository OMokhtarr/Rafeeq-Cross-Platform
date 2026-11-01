import { webcrypto } from "crypto";
import { TextEncoder as NodeTextEncoder } from "util";

const mockSignInWithIdToken = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockCreateClient = jest.fn();
const mockInitialize = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockPlatform = jest.fn();
const mockBrowserOpen = jest.fn();
const mockBrowserClose = jest.fn();
const mockBrowserAddListener = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));
jest.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: (...a: unknown[]) => mockInitialize(...a),
    login: (...a: unknown[]) => mockLogin(...a),
    logout: (...a: unknown[]) => mockLogout(...a),
  },
}));
jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mockPlatform() },
}));
jest.mock("@capacitor/browser", () => ({
  Browser: {
    open: (...a: unknown[]) => mockBrowserOpen(...a),
    close: (...a: unknown[]) => mockBrowserClose(...a),
    addListener: (...a: unknown[]) => mockBrowserAddListener(...a),
  },
}));

const USER = {
  id: "u1",
  email: "a@b.c",
  app_metadata: { provider: "google" },
  user_metadata: { full_name: "Ahmad Ali" },
};

function load() {
  jest.resetModules();
  return require("../auth.service") as typeof import("../auth.service");
}

async function sha256Hex(s: string) {
  const d = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(d), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has neither TextEncoder nor crypto; real webviews do.
  Object.defineProperty(globalThis, "TextEncoder", {
    value: NodeTextEncoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  process.env.REACT_APP_SUPABASE_URL = "https://x.supabase.co";
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
  process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID = "web-id";
  mockInitialize.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue({ error: null });
  mockPlatform.mockReturnValue("web");
  mockCreateClient.mockReturnValue({
    auth: {
      signInWithIdToken: mockSignInWithIdToken,
      signInWithOAuth: mockSignInWithOAuth,
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: mockGetSession,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  });
});

// Some suites below stub fetch; put back whatever jsdom had (possibly none).
const realFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");

afterEach(() => {
  if (realFetch) Object.defineProperty(globalThis, "fetch", realFetch);
  else delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env.REACT_APP_SUPABASE_URL;
  delete process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID;
});

describe("signIn google", () => {
  it("hashes the nonce for Google, sends the raw one to Supabase, maps the user", async () => {
    mockLogin.mockResolvedValue({
      provider: "google",
      result: { idToken: "tok" },
    });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: USER },
      error: null,
    });
    const { signIn } = load();

    const user = await signIn("google");

    const hashed = mockLogin.mock.calls[0][0].options.nonce;
    const raw = mockSignInWithIdToken.mock.calls[0][0].nonce;
    expect(mockLogin.mock.calls[0][0].provider).toBe("google");
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(await sha256Hex(raw));
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "tok",
      nonce: raw,
    });
    expect(mockInitialize).toHaveBeenCalledWith({
      google: { webClientId: "web-id", mode: "online" },
    });
    expect(user).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "Ahmad Ali",
      provider: "google",
    });
  });

  it("returns null when the person cancels", async () => {
    mockLogin.mockRejectedValue({ code: "USER_CANCELLED" });
    const { signIn } = load();
    await expect(signIn("google")).resolves.toBeNull();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("throws when signInWithIdToken returns an error", async () => {
    mockLogin.mockResolvedValue({
      provider: "google",
      result: { idToken: "tok" },
    });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: null },
      error: new Error("bad nonce"),
    });
    const { signIn } = load();
    await expect(signIn("google")).rejects.toThrow("bad nonce");
  });

});

const APPLE_USER = {
  id: "u2",
  email: "x@privaterelay.appleid.com",
  app_metadata: { provider: "apple" },
  user_metadata: { full_name: "Sara Omar" },
};
const APPLE_ACCOUNT = {
  id: "u2",
  email: "x@privaterelay.appleid.com",
  name: "Sara Omar",
  provider: "apple",
};

/** Lets pending promise chains run (real timers only). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("signIn apple on iOS (native)", () => {
  const TOKEN_URL = "https://x.supabase.co/functions/v1/apple-token";
  const mockFetch = jest.fn();

  beforeEach(() => {
    mockPlatform.mockReturnValue("ios");
    Object.defineProperty(globalThis, "fetch", { value: mockFetch, configurable: true });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockLogin.mockResolvedValue({
      provider: "apple",
      result: { idToken: "apple-id", authorizationCode: "auth-code" },
    });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: APPLE_USER, session: { access_token: "at-2" } },
      error: null,
    });
  });

  it("signs in with Apple's id token and posts the authorization code", async () => {
    const { signIn } = load();

    const user = await signIn("apple");

    const login = mockLogin.mock.calls[0][0];
    const raw = mockSignInWithIdToken.mock.calls[0][0].nonce;
    expect(login.provider).toBe("apple");
    expect(login.options.scopes).toEqual(["email", "name"]);
    expect(login.options.nonce).toBe(await sha256Hex(raw));
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "apple-id",
      nonce: raw,
    });
    // The plugin only returns the code when asked for a proper token exchange.
    expect(mockInitialize.mock.calls[0][0].apple).toEqual({
      useProperTokenExchange: true,
    });
    expect(mockFetch).toHaveBeenCalledWith(TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: "Bearer at-2",
        apikey: "sb_publishable_x",
        "content-type": "application/json",
      },
      body: JSON.stringify({ authorizationCode: "auth-code" }),
    });
    expect(user).toEqual(APPLE_ACCOUNT);
  });

  it("still resolves the user when posting the code fails", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { signIn } = load();

    await expect(signIn("apple")).resolves.toEqual(APPLE_ACCOUNT);
    await flush();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still resolves the user when the token function answers with an error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { signIn } = load();

    await expect(signIn("apple")).resolves.toEqual(APPLE_ACCOUNT);
    await flush();
    expect(warn).toHaveBeenCalledWith(
      "[auth] storing the Apple token failed",
      expect.objectContaining({ message: "apple-token failed: 502" })
    );
    warn.mockRestore();
  });

  it("returns null when the person cancels", async () => {
    mockLogin.mockRejectedValue({ code: "USER_CANCELLED" });
    const { signIn } = load();
    await expect(signIn("apple")).resolves.toBeNull();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("signIn apple on Android (web flow)", () => {
  const AUTHORIZE_URL = "https://x.supabase.co/auth/v1/authorize?provider=apple";
  let browserFinished: () => void;

  beforeEach(() => {
    mockPlatform.mockReturnValue("android");
    browserFinished = () => {
      throw new Error("no browserFinished listener");
    };
    mockBrowserAddListener.mockImplementation(async (event, cb) => {
      if (event === "browserFinished") browserFinished = cb;
      return { remove: jest.fn() };
    });
    mockBrowserOpen.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: "apple", url: AUTHORIZE_URL },
      error: null,
    });
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: APPLE_USER, session: { access_token: "at-2" } },
      error: null,
    });
  });

  /** Starts the sign-in and waits until the browser has been opened. */
  async function startSignIn() {
    const auth = load();
    const result = auth.signIn("apple");
    // Each test asserts on `result`; this only keeps an early rejection
    // from surfacing as unhandled while the loop below waits.
    result.catch(() => {});
    for (let i = 0; i < 20 && mockBrowserOpen.mock.calls.length === 0; i++) {
      await flush();
    }
    expect(mockBrowserOpen).toHaveBeenCalled();
    return { auth, result };
  }

  it("opens Supabase's Apple URL and resolves the user from the callback", async () => {
    const { auth, result } = await startSignIn();

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: "rafeeq://auth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(mockBrowserOpen).toHaveBeenCalledWith({ url: AUTHORIZE_URL });

    await auth.completeOAuthRedirect("rafeeq://auth/callback?code=abc");

    await expect(result).resolves.toEqual(APPLE_ACCOUNT);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(mockBrowserClose).toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("returns null once the browser has been closed for the grace period with no callback", async () => {
    const { result } = await startSignIn();
    let settled = false;
    result.then(
      () => (settled = true),
      () => (settled = true)
    );
    // Promise callbacks are microtasks, which fake timers leave alone.
    const drain = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };

    jest.useFakeTimers();
    try {
      browserFinished();
      jest.advanceTimersByTime(1499);
      await drain();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(1);
      await drain();
      expect(settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }

    await expect(result).resolves.toBeNull();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("still resolves the user when the browser reports closing just before the callback", async () => {
    const { auth, result } = await startSignIn();

    browserFinished();
    await auth.completeOAuthRedirect("rafeeq://auth/callback?code=abc");

    await expect(result).resolves.toEqual(APPLE_ACCOUNT);
  });

  it("returns null when the person taps Cancel on Apple's page", async () => {
    const { auth, result } = await startSignIn();

    await auth.completeOAuthRedirect(
      "rafeeq://auth/callback?error=user_cancelled_authorize&error_description=user_cancelled_authorize"
    );

    await expect(result).resolves.toBeNull();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("returns null when the callback says the person denied access", async () => {
    const { auth, result } = await startSignIn();

    await auth.completeOAuthRedirect(
      "rafeeq://auth/callback?error=access_denied&error_description=User+cancelled"
    );

    await expect(result).resolves.toBeNull();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("rejects with the description when the callback carries another error", async () => {
    const { auth, result } = await startSignIn();

    await auth.completeOAuthRedirect(
      "rafeeq://auth/callback?error=server_error&error_description=Unable+to+exchange+external+code"
    );

    await expect(result).rejects.toThrow("Unable to exchange external code");
  });

  it("completes a callback that arrives with no sign-in waiting (cold start)", async () => {
    const { completeOAuthRedirect } = load();

    await completeOAuthRedirect("rafeeq://auth/callback?code=abc");

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(
      JSON.parse(localStorage.getItem("rafiq_account_v1") as string)
    ).toEqual(APPLE_ACCOUNT);
  });
});

describe("session", () => {
  it("currentUser returns the stored user without signing out", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } } });
    const { currentUser } = load();
    await expect(currentUser()).resolves.toMatchObject({
      id: "u1",
      provider: "google",
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signOut swallows errors from both layers", async () => {
    localStorage.setItem(
      "rafiq_account_v1",
      JSON.stringify({ id: "u1", provider: "google" })
    );
    mockSignOut.mockRejectedValue(new Error("net"));
    mockLogout.mockRejectedValue(new Error("plugin"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { signOut } = load();
    await expect(signOut()).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockLogout).toHaveBeenCalledWith({ provider: "google" });
    warn.mockRestore();
  });

  it.each([
    ["google", "android", { provider: "google" }],
    ["apple", "ios", { provider: "apple" }],
    ["apple", "android", null],
  ])(
    "signOut for a %s account on %s: plugin logout %p (null = none)",
    async (provider, platform, expected) => {
      mockPlatform.mockReturnValue(platform);
      localStorage.setItem(
        "rafiq_account_v1",
        JSON.stringify({ id: "u1", provider })
      );
      const { signOut } = load();
      await signOut();
      if (expected) expect(mockLogout).toHaveBeenCalledWith(expected);
      else expect(mockLogout).not.toHaveBeenCalled();
    }
  );
});

describe("offline launch cache", () => {
  const CACHED = {
    id: "u1",
    email: "a@b.c",
    name: "Ahmad Ali",
    provider: "google",
  };

  function seedCache() {
    localStorage.setItem("rafiq_account_v1", JSON.stringify(CACHED));
  }

  it("returns the cached user when a failed refresh yields no session", async () => {
    seedCache();
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error("fetch failed"),
    });
    const { currentUser } = load();
    await expect(currentUser()).resolves.toEqual(CACHED);
    expect(localStorage.getItem("rafiq_account_v1")).not.toBeNull();
  });

  it("returns null and clears the cache when truly signed out", async () => {
    seedCache();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    const { currentUser } = load();
    await expect(currentUser()).resolves.toBeNull();
    expect(localStorage.getItem("rafiq_account_v1")).toBeNull();
  });

  it("caches the user when a session exists", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } } });
    const { currentUser } = load();
    await currentUser();
    expect(
      JSON.parse(localStorage.getItem("rafiq_account_v1") as string)
    ).toEqual(CACHED);
  });

  it("signOut clears the cache", async () => {
    seedCache();
    const { signOut } = load();
    await signOut();
    expect(localStorage.getItem("rafiq_account_v1")).toBeNull();
  });

  it("hasCachedAccount reports whether an account is cached", () => {
    const { hasCachedAccount } = load();
    expect(hasCachedAccount()).toBe(false);
    seedCache();
    expect(hasCachedAccount()).toBe(true);
  });

  it("emits null and clears the cache only on SIGNED_OUT", () => {
    seedCache();
    let handler: (e: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      handler = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    const { onAccountChange } = load();
    const cb = jest.fn();
    onAccountChange(cb);

    handler("TOKEN_REFRESHED", null);
    expect(cb).not.toHaveBeenCalled();
    expect(localStorage.getItem("rafiq_account_v1")).not.toBeNull();

    handler("SIGNED_OUT", null);
    expect(cb).toHaveBeenCalledWith(null);
    expect(localStorage.getItem("rafiq_account_v1")).toBeNull();
  });

  it("emits and caches the user when a session arrives", () => {
    let handler: (e: string, s: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation((cb) => {
      handler = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    const { onAccountChange } = load();
    const cb = jest.fn();
    onAccountChange(cb);
    handler("SIGNED_IN", { user: USER });
    expect(cb).toHaveBeenCalledWith(CACHED);
    expect(localStorage.getItem("rafiq_account_v1")).not.toBeNull();
  });
});

describe("deleteAccount", () => {
  const FUNCTION_URL = "https://x.supabase.co/functions/v1/delete-account";
  const mockFetch = jest.fn();

  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", { value: mockFetch, configurable: true });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "at-1", user: USER } },
    });
    localStorage.setItem("rafiq_account_v1", JSON.stringify({ id: "u1" }));
  });

  it("posts to the function with the bearer token, then signs out locally", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const { deleteAccount } = load();

    await deleteAccount();

    expect(mockFetch).toHaveBeenCalledWith(FUNCTION_URL, {
      method: "POST",
      headers: { authorization: "Bearer at-1", apikey: "sb_publishable_x" },
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem("rafiq_account_v1")).toBeNull();
  });

  it("signs out and resolves on a 401: the account is already gone", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const { deleteAccount } = load();

    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem("rafiq_account_v1")).toBeNull();
  });

  it("throws on a 502 and keeps the person signed in", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    const { deleteAccount } = load();

    await expect(deleteAccount()).rejects.toThrow("502");
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(localStorage.getItem("rafiq_account_v1")).not.toBeNull();
  });

  it("throws without calling the function when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { deleteAccount } = load();

    await expect(deleteAccount()).rejects.toThrow("not signed in");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("configuration", () => {
  it("is unconfigured with no URL", () => {
    delete process.env.REACT_APP_SUPABASE_URL;
    jest.resetModules();
    const { getSupabase, isAuthConfigured } = require("../supabase.client");
    expect(getSupabase()).toBeNull();
    expect(isAuthConfigured()).toBe(false);
  });

  it("creates the client once with PKCE and persisted sessions", () => {
    jest.resetModules();
    const { getSupabase } = require("../supabase.client");
    getSupabase();
    getSupabase();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient.mock.calls[0][2]).toEqual({
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  });
});
