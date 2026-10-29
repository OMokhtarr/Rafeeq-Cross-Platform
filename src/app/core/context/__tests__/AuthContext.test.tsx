import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { AuthProvider, useAuth } from "../AuthContext";
import { isAccountsOn } from "../../services/auth/accounts-switch";
import * as auth from "../../services/auth/auth.service";
import { isAuthConfigured } from "../../services/auth/supabase.client";

jest.mock("../../services/auth/accounts-switch", () => ({ isAccountsOn: jest.fn() }));
jest.mock("../../services/auth/auth.service", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  currentUser: jest.fn(),
  onAccountChange: jest.fn(),
}));

jest.mock("../../services/auth/supabase.client", () => ({ isAuthConfigured: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const on = isAccountsOn as jest.Mock;
const configured = isAuthConfigured as jest.Mock;
const svc = auth as unknown as Record<string, jest.Mock>;

const alice = { id: "u1", email: "a@x.com", name: "Alice", provider: "google" as const };
const bob = { id: "u2", email: "b@x.com", name: "Bob", provider: "google" as const };

type Ctx = ReturnType<typeof useAuth>;
let ctx: Ctx;
const Probe = () => {
  ctx = useAuth();
  return null;
};

let root: Root;
let emit: ((u: typeof alice | null) => void) | null;
const unsubscribe = jest.fn();

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

async function mount() {
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  emit = null;
  on.mockReturnValue(true);
  configured.mockReturnValue(true);
  svc.currentUser.mockResolvedValue(null);
  svc.signOut.mockResolvedValue(undefined);
  svc.onAccountChange.mockImplementation((cb: (u: typeof alice | null) => void) => {
    emit = cb;
    return unsubscribe;
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe("AuthProvider", () => {
  it("is ready with no user and never reads a session when accounts are off", async () => {
    on.mockReturnValue(false);
    await mount();
    expect(ctx.enabled).toBe(false);
    expect(ctx.ready).toBe(true);
    expect(ctx.user).toBeNull();
    expect(svc.currentUser).not.toHaveBeenCalled();
  });

  it("is disabled when the auth backend isn't configured", async () => {
    configured.mockReturnValue(false);
    await mount();
    expect(ctx.enabled).toBe(false);
    expect(ctx.ready).toBe(true);
    expect(svc.currentUser).not.toHaveBeenCalled();
  });

  it("takes the stored session, then follows account events", async () => {
    svc.currentUser.mockResolvedValue(alice);
    await mount();
    expect(ctx.enabled).toBe(true);
    expect(ctx.ready).toBe(true);
    expect(ctx.user).toEqual(alice);

    await act(async () => emit?.(bob));
    expect(ctx.user).toEqual(bob);

    await act(async () => emit?.(null));
    expect(ctx.user).toBeNull();
  });

  it("is not ready until the stored session has been read", async () => {
    let resolve!: (u: typeof alice | null) => void;
    svc.currentUser.mockReturnValue(new Promise((r) => (resolve = r)));
    await mount();
    expect(ctx.ready).toBe(false);
    await act(async () => resolve(alice));
    expect(ctx.ready).toBe(true);
    expect(ctx.user).toEqual(alice);
  });

  it("still becomes ready when reading the session fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    svc.currentUser.mockRejectedValue(new Error("boom"));
    await mount();
    expect(ctx.ready).toBe(true);
    expect(ctx.user).toBeNull();
    spy.mockRestore();
  });

  it("unsubscribes from account events on unmount", async () => {
    await mount();
    await act(async () => root.unmount());
    expect(unsubscribe).toHaveBeenCalled();
    root = createRoot(document.createElement("div"));
  });

  describe("signIn", () => {
    it("maps a cancelled sign-in", async () => {
      svc.signIn.mockResolvedValue(null);
      await mount();
      let out: string | undefined;
      await act(async () => {
        out = await ctx.signIn("google");
      });
      expect(out).toBe("cancelled");
      expect(ctx.user).toBeNull();
    });

    it("maps a thrown error to failed", async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      svc.signIn.mockRejectedValue(new Error("nope"));
      await mount();
      let out: string | undefined;
      await act(async () => {
        out = await ctx.signIn("google");
      });
      expect(out).toBe("failed");
      spy.mockRestore();
    });

    it("sets the user on success", async () => {
      svc.signIn.mockResolvedValue(alice);
      await mount();
      let out: string | undefined;
      await act(async () => {
        out = await ctx.signIn("google");
      });
      expect(out).toBe("signed_in");
      expect(ctx.user).toEqual(alice);
    });
  });

  it("signOut clears the user", async () => {
    svc.currentUser.mockResolvedValue(alice);
    await mount();
    await act(async () => ctx.signOut());
    expect(svc.signOut).toHaveBeenCalled();
    expect(ctx.user).toBeNull();
  });

  describe("requestSignIn", () => {
    it("opens the sheet and resolves true after a successful signIn", async () => {
      svc.signIn.mockResolvedValue(alice);
      await mount();
      let result: boolean | undefined;
      await act(async () => {
        ctx.requestSignIn().then((v) => (result = v));
      });
      expect(ctx.signInOpen).toBe(true);
      await act(async () => {
        await ctx.signIn("google");
      });
      await flush();
      expect(result).toBe(true);
      expect(ctx.signInOpen).toBe(false);
    });

    it("resolves false after closeSignIn", async () => {
      await mount();
      let result: boolean | undefined;
      await act(async () => {
        ctx.requestSignIn().then((v) => (result = v));
      });
      expect(ctx.signInOpen).toBe(true);
      await act(async () => ctx.closeSignIn());
      await flush();
      expect(result).toBe(false);
      expect(ctx.signInOpen).toBe(false);
    });

    it("returns the same promise for a second call while open", async () => {
      await mount();
      let a!: Promise<boolean>;
      let b!: Promise<boolean>;
      await act(async () => {
        a = ctx.requestSignIn();
        b = ctx.requestSignIn();
      });
      expect(a).toBe(b);
      await act(async () => ctx.closeSignIn());
    });

    it("resolves true without opening when already signed in", async () => {
      svc.currentUser.mockResolvedValue(alice);
      await mount();
      let result: boolean | undefined;
      await act(async () => {
        result = await ctx.requestSignIn();
      });
      expect(result).toBe(true);
      expect(ctx.signInOpen).toBe(false);
    });
  });
});
