/**
 * SIGN IN BEFORE SUBSCRIBING
 *
 * Rafeeq Pro lives on an account, so anything that starts a purchase or a
 * restore first makes sure someone is signed in. While signed out (and
 * accounts are on) the sign-in sheet opens; if it is dismissed the action
 * never runs. Without accounts the action runs straight away.
 */

import { useCallback } from "react";
import { useAuth } from "../../core/context/AuthContext";
import { usePaywall } from "./usePaywall";

/** Wraps an action so it runs only once the person is signed in. */
export function useSignedInAction(): (action: () => void | Promise<void>) => Promise<void> {
  const { enabled, user, requestSignIn } = useAuth();
  return useCallback(
    async (action) => {
      if (enabled && !user && !(await requestSignIn())) return;
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
