/**
 * AUTH CONTEXT
 *
 * App-wide sign-in state: who is signed in (if anyone), sign-in and sign-out,
 * and the open state of the sign-in sheet any gated feature can raise.
 *
 * Accounts are optional. When the accounts switch is off or the auth backend
 * isn't configured, `enabled` is false, nobody is ever signed in and `ready` is
 * true from the start. Otherwise the stored session is read once at launch
 * (a cached user is used when offline) and then follows account events.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isAccountsOn } from "../services/auth/accounts-switch";
import {
  AccountUser,
  AuthProviderId,
  accessToken,
  currentUser,
  deleteAccount as authDeleteAccount,
  onAccountChange,
  signIn as authSignIn,
  signOut as authSignOut,
} from "../services/auth/auth.service";
import { isAuthConfigured } from "../services/auth/supabase.client";
import { setBrokerTokenSource } from "../services/audio/stt/broker";

export type SignInOutcome = "signed_in" | "cancelled" | "failed";

interface AuthCtx {
  /** Accounts are switched on and the auth backend is configured. */
  enabled: boolean;
  /** The stored session has been read (immediately when not enabled). */
  ready: boolean;
  user: AccountUser | null;
  signIn: (provider: AuthProviderId) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  /** Deletes the account on the server, then signs out. Rejects (still
   *  signed in) when any server step fails. */
  deleteAccount: () => Promise<void>;
  /** The signed-in account id right now, read synchronously. Unlike `user` it
   *  is never a render behind a sign-in or sign-out that just landed. */
  currentUserId: () => string | null;
  /** Opens the sign-in sheet; resolves true once signed in, false if it is
   *  dismissed. A second call while it is open returns the same promise. */
  requestSignIn: () => Promise<boolean>;
  signInOpen: boolean;
  /** Dismisses the sheet, resolving the pending request with false. */
  closeSignIn: () => void;
}

interface PendingRequest {
  promise: Promise<boolean>;
  resolve: (signedIn: boolean) => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = useMemo(() => isAccountsOn() && isAuthConfigured(), []);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [ready, setReady] = useState(!enabled);
  const [signInOpen, setSignInOpen] = useState(false);
  const userRef = useRef<AccountUser | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);

  // Speech requests carry the signed-in account's token.
  useEffect(() => {
    setBrokerTokenSource(enabled ? accessToken : null);
    return () => setBrokerTokenSource(null);
  }, [enabled]);

  const settle = useCallback((signedIn: boolean) => {
    pendingRef.current?.resolve(signedIn);
    pendingRef.current = null;
    setSignInOpen(false);
  }, []);

  const applyUser = useCallback(
    (next: AccountUser | null) => {
      userRef.current = next;
      setUser(next);
      if (next) settle(true);
    },
    [settle],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    currentUser()
      .then((u) => {
        // An account event that landed first is newer than the stored session.
        if (cancelled) return;
        if (!userRef.current) applyUser(u);
        // Same batch as the user, so `ready` never shows before a stored user.
        setReady(true);
      })
      .catch((err) => console.error("[auth] reading session failed", err))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    const unsubscribe = onAccountChange((u) => {
      if (!cancelled) applyUser(u);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, applyUser]);

  const signIn = useCallback(
    async (provider: AuthProviderId): Promise<SignInOutcome> => {
      try {
        const u = await authSignIn(provider);
        if (!u) return "cancelled";
        applyUser(u);
        return "signed_in";
      } catch (err) {
        console.error("[auth] sign-in failed", err);
        return "failed";
      }
    },
    [applyUser],
  );

  const signOut = useCallback(async () => {
    await authSignOut();
    applyUser(null);
  }, [applyUser]);

  const deleteAccount = useCallback(async () => {
    await authDeleteAccount();
    applyUser(null);
  }, [applyUser]);

  const currentUserId = useCallback(() => userRef.current?.id ?? null, []);

  const requestSignIn = useCallback((): Promise<boolean> => {
    if (userRef.current) return Promise.resolve(true);
    if (pendingRef.current) return pendingRef.current.promise;
    let resolve!: (signedIn: boolean) => void;
    const promise = new Promise<boolean>((r) => (resolve = r));
    pendingRef.current = { promise, resolve };
    setSignInOpen(true);
    return promise;
  }, []);

  const closeSignIn = useCallback(() => settle(false), [settle]);

  const value = useMemo<AuthCtx>(
    () => ({
      enabled,
      ready,
      user,
      signIn,
      signOut,
      deleteAccount,
      currentUserId,
      requestSignIn,
      signInOpen,
      closeSignIn,
    }),
    [enabled, ready, user, signIn, signOut, deleteAccount, currentUserId, requestSignIn, signInOpen, closeSignIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
