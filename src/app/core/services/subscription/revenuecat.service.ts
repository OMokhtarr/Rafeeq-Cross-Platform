/**
 * REVENUECAT SERVICE
 *
 * Thin wrapper over the RevenueCat Capacitor SDK for the Rafeeq Pro
 * subscription. RevenueCat verifies store receipts on its own servers, so
 * it is the source of truth for "is this person Pro?"; the app only caches
 * its answer.
 *
 * There is no login: RevenueCat's anonymous app-user id is the identity, and
 * "Restore purchases" re-attaches a store purchase to it on a new device.
 * Buying happens on RevenueCat's Paywall and managing an active subscription
 * in its Customer Center — both native screens designed in the RevenueCat
 * dashboard, so plans and wording change without an app release.
 * Only call these on native platforms — store billing doesn't exist on web.
 */

import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import { PAYWALL_RESULT, RevenueCatUI } from "@revenuecat/purchases-capacitor-ui";

export type { CustomerInfo };

/** Must match the entitlement id in the RevenueCat dashboard (and the token
 *  broker's PRO_ENTITLEMENT). */
const PRO_ENTITLEMENT = "com_rafeeq_quranquiz_pro";

/** RevenueCat Test Store keys start with this. The SDK deliberately crashes a
 *  release build (any non-debuggable APK, Play testing tracks included) that
 *  is configured with one. */
const TEST_STORE_KEY_PREFIX = "test_";

let configured: Promise<void> | null = null;

/** Configures the SDK once, with the platform's public key. A build without
 *  a key never starts RevenueCat, so it sends nothing to it (the privacy
 *  declarations change only for builds that carry a key). A Test Store key is
 *  refused outside debug builds, which then behave like a build without a key
 *  instead of crashing at launch. */
export function configureRevenueCat(): Promise<void> {
  if (!configured) {
    const apiKey =
      Capacitor.getPlatform() === "ios"
        ? process.env.REACT_APP_REVENUECAT_IOS_KEY ?? ""
        : process.env.REACT_APP_REVENUECAT_ANDROID_KEY ?? "";
    if (!apiKey) {
      configured = Promise.reject(new Error("RevenueCat is not configured for this build"));
    } else if (apiKey.startsWith(TEST_STORE_KEY_PREFIX) && !Capacitor.DEBUG) {
      configured = Promise.reject(
        new Error("A RevenueCat Test Store key only works in debug builds — use the store key for release"),
      );
    } else {
      configured = Purchases.configure({ apiKey });
    }
  }
  return configured;
}

/** RevenueCat's screens follow the phone's language unless told otherwise.
 *  The app has its own language setting, so the Paywall and Customer Center
 *  follow that instead. */
export async function setRevenueCatLocale(lang: "ar" | "en"): Promise<void> {
  await configureRevenueCat();
  await Purchases.overridePreferredUILocale({ locale: lang });
}

export async function fetchCustomerInfo(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

/** Calls `cb` whenever RevenueCat learns of a renewal, expiry or purchase.
 *  Resolves to an unsubscribe function. */
export async function onCustomerInfo(cb: (info: CustomerInfo) => void): Promise<() => void> {
  const id = await Purchases.addCustomerInfoUpdateListener(cb);
  return () => {
    void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id }).catch(() => {});
  };
}

export async function restore(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export async function fetchAppUserId(): Promise<string> {
  const { appUserID } = await Purchases.getAppUserID();
  return appUserID;
}

export function isProFromCustomerInfo(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export type PaywallResult = "purchased" | "restored" | "cancelled" | "error";

/** Shows the current offering's paywall and resolves once it is dismissed. */
export async function presentPaywall(): Promise<PaywallResult> {
  const { result } = await RevenueCatUI.presentPaywall();
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return "purchased";
    case PAYWALL_RESULT.RESTORED:
      return "restored";
    case PAYWALL_RESULT.ERROR:
      return "error";
    default:
      return "cancelled";
  }
}

/** Shows the Customer Center (cancel, change plan, restore, refund requests)
 *  and resolves once it is dismissed. */
export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}
