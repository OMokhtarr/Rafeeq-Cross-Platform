import { isAuthConfigured } from "../auth/supabase.client";

/**
 * PRO GATE SWITCH
 *
 * Build-time switch for the Rafeeq Pro paywall. While it is off (the
 * default), recite is free for everyone: no PRO badge, no subscriber note.
 * The subscribe page and the Account subscription card still work, so
 * purchases can be tested before launch. Set REACT_APP_PRO_GATE=on in
 * .env.production for the store release, then turn on the broker's
 * REQUIRE_PRO.
 *
 * The gate also needs sign-in configured (Supabase URL and key set): Pro is
 * always on an account, so without sign-in there is nothing to gate against.
 */
export function isProGateOn(): boolean {
  return isAuthConfigured() && process.env.REACT_APP_PRO_GATE === "on";
}
