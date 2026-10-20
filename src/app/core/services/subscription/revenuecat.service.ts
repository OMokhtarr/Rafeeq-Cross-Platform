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
 * Only call these on native platforms — store billing doesn't exist on web.
 */

import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import type {
  CustomerInfo,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

export type { CustomerInfo, PurchasesPackage };

/** Must match the entitlement id in the RevenueCat dashboard. */
const PRO_ENTITLEMENT = "pro";

let configured: Promise<void> | null = null;

/** Configures the SDK once, with the platform's public key. */
export function configureRevenueCat(): Promise<void> {
  if (!configured) {
    const apiKey =
      Capacitor.getPlatform() === "ios"
        ? process.env.REACT_APP_REVENUECAT_IOS_KEY ?? ""
        : process.env.REACT_APP_REVENUECAT_ANDROID_KEY ?? "";
    configured = Purchases.configure({ apiKey });
  }
  return configured;
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

export async function fetchOfferingPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function buyPackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
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

/** The store's own subscription-management page, when RevenueCat has one. */
export function managementUrl(info: CustomerInfo): string | null {
  return info.managementURL ?? null;
}

/** True when a purchase rejection is the user backing out of the store sheet. */
export function isUserCancelled(err: unknown): boolean {
  return (err as { userCancelled?: boolean } | null)?.userCancelled === true;
}
