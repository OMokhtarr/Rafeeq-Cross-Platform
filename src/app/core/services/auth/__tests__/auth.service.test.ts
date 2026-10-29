import { webcrypto } from "crypto";
import { TextEncoder as NodeTextEncoder } from "util";

const mockSignInWithIdToken = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockCreateClient = jest.fn();
const mockInitialize = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();

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
  mockCreateClient.mockReturnValue({
    auth: {
      signInWithIdToken: mockSignInWithIdToken,
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  });
});

afterEach(() => {
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

  it("throws for apple until it is implemented", async () => {
    const { signIn } = load();
    await expect(signIn("apple")).rejects.toThrow(
      "apple sign-in not available"
    );
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
    mockSignOut.mockRejectedValue(new Error("net"));
    mockLogout.mockRejectedValue(new Error("plugin"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { signOut } = load();
    await expect(signOut()).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    warn.mockRestore();
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
