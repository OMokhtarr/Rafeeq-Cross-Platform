import { Capacitor } from "@capacitor/core";

/**
 * Sign in with Apple is always offered on iOS (store rule: it must sit
 * beside any other social sign-in). On Android it needs its own opt-in,
 * REACT_APP_APPLE_SIGNIN=on, once the Apple web flow is configured.
 */
export function isAppleSignInOn(): boolean {
  if (Capacitor.getPlatform() === "ios") return true;
  return process.env.REACT_APP_APPLE_SIGNIN === "on";
}
