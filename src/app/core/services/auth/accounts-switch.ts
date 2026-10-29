import { Capacitor } from "@capacitor/core";

/**
 * ACCOUNTS SWITCH
 *
 * Build-time switch for sign-in. While it is off (the default) the app has
 * no accounts: no sign-in UI, and the Pro gate stays off too, since Pro
 * always lives on an account. Set REACT_APP_ACCOUNTS=on to enable it.
 */
export function isAccountsOn(): boolean {
  return process.env.REACT_APP_ACCOUNTS === "on";
}

/**
 * Sign in with Apple is always offered on iOS (store rule: it must sit
 * beside any other social sign-in). On Android it needs its own opt-in,
 * REACT_APP_APPLE_SIGNIN=on.
 */
export function isAppleSignInOn(): boolean {
  if (!isAccountsOn()) return false;
  if (Capacitor.getPlatform() === "ios") return true;
  return process.env.REACT_APP_APPLE_SIGNIN === "on";
}
