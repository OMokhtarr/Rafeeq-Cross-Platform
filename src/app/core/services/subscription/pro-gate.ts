import { isAccountsOn } from "../auth/accounts-switch";

/**
 * PRO GATE SWITCH
 *
 * Build-time switch for the Rafeeq Pro paywall. While it is off (the
 * default), recite is free for everyone: no PRO badge, no subscriber note.
 * The subscribe page and the Account subscription row still work, so
 * purchases can be tested before launch. Set REACT_APP_PRO_GATE=on in
 * .env.production for the store release, then turn on the broker's
 * REQUIRE_PRO.
 *
 * The gate also needs accounts (REACT_APP_ACCOUNTS=on): Pro is always on an
 * account, so with accounts off there is nothing to gate against.
 */
export function isProGateOn(): boolean {
  return isAccountsOn() && process.env.REACT_APP_PRO_GATE === "on";
}
