/**
 * SIGN IN BEFORE SUBSCRIBING
 *
 * Rafeeq Pro lives on an account, so anything that starts a purchase or a
 * restore first makes sure someone is signed in. While signed out the
 * sign-in sheet opens; if it is dismissed the action never runs. A build
 * without sign-in configured can't sign anyone in, so it refuses rather than
 * buy on RevenueCat's anonymous id.
 */

import { useCallback } from "react";
import { useAuth } from "../../core/context/AuthContext";
import { usePaywall } from "./usePaywall";

/** Wraps an action so it runs only once the person is signed in. */
export function useSignedInAction(): (action: () => void | Promise<void>) => Promise<void> {
  const { enabled, user, requestSignIn } = useAuth();
  return useCallback(
    async (action) => {
      if (!enabled) {
        console.error("[pro] sign-in isn't configured, so Pro can't be bought or restored");
        return;
      }
      if (!user && !(await requestSignIn())) return;
      await action();
    },
    [enabled, user, requestSignIn],
  );
}

/** Opens the Paywall, signing in first when needed. */
export function useStartSubscribe(): () => Promise<void> {
  const openPaywall = usePaywall();
  const whenSignedIn = useSignedInAction();
  return useCallback(() => whenSignedIn(openPaywall), [whenSignedIn, openPaywall]);
}
