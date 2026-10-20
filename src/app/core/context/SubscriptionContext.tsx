/**
 * SUBSCRIPTION CONTEXT
 *
 * App-wide Rafeeq Pro state: whether this person is subscribed, the store
 * packages for the subscribe page, purchase/restore, and the open state of
 * the subscriber note any recite surface can raise.
 *
 * On native, the last known answer is cached in localStorage and used as the
 * starting value, so a subscriber never sees the PRO badge flash while
 * RevenueCat answers (or while offline). The live answer replaces it, and
 * renewals/expiries arrive through RevenueCat's listener. On web there is no
 * store billing, so recite stays unlocked for development.
 *
 * The RevenueCat app-user id is handed to the token broker client, which
 * sends it with every speech request so the broker can check the
 * subscription server-side.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import {
  buyPackage,
  configureRevenueCat,
  CustomerInfo,
  fetchAppUserId,
  fetchCustomerInfo,
  fetchOfferingPackages,
  isProFromCustomerInfo,
  isUserCancelled,
  managementUrl as managementUrlOf,
  onCustomerInfo,
  PurchasesPackage,
  restore as restorePurchases,
} from "../services/subscription/revenuecat.service";
import { setBrokerUserId } from "../services/audio/stt/broker";

const CACHE_KEY = "rafiq_pro_v1";

export type PurchaseOutcome = "purchased" | "cancelled";

interface SubscriptionCtx {
  isPro: boolean;
  /** RevenueCat has given a real answer this session. */
  ready: boolean;
  appUserId: string | null;
  managementUrl: string | null;
  packages: PurchasesPackage[];
  /** Fetches the store plans again — the startup fetch fails when the app
   *  opens offline, and the subscribe page must not stay empty after that. */
  refreshPackages: () => Promise<void>;
  /** Resolves "cancelled" when the user backs out; throws on other failures. */
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  /** Resolves to whether the restore found an active Pro subscription. */
  restore: () => Promise<boolean>;
  /** The broker refused this session as not subscribed — trust it until the
   *  next real answer. Does not touch the cache. */
  markNotPro: () => void;
  noteOpen: boolean;
  openNote: () => void;
  closeNote: () => void;
}

const SubscriptionContext = createContext<SubscriptionCtx | null>(null);

const isNative = () => Capacitor.getPlatform() !== "web";

function readCache(): boolean {
  try {
    return localStorage.getItem(CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCache(pro: boolean): void {
  try {
    localStorage.setItem(CACHE_KEY, pro ? "1" : "0");
  } catch {
    // Storage unavailable — the live answer still applies for this session.
  }
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const native = isNative();
  const [isPro, setIsPro] = useState<boolean>(() => (native ? readCache() : true));
  const [ready, setReady] = useState(!native);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);

  const apply = useCallback((info: CustomerInfo) => {
    const pro = isProFromCustomerInfo(info);
    setIsPro(pro);
    setManagementUrl(managementUrlOf(info));
    setReady(true);
    writeCache(pro);
    return pro;
  }, []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    configureRevenueCat()
      .then(() => {
        if (cancelled) return;
        fetchCustomerInfo()
          .then((info) => {
            if (!cancelled) apply(info);
          })
          .catch((err) => console.error("[pro] customer info failed", err));
        onCustomerInfo((info) => {
          if (!cancelled) apply(info);
        })
          .then((unsub) => {
            if (cancelled) unsub();
            else unsubscribe = unsub;
          })
          .catch((err) => console.error("[pro] listener failed", err));
        fetchAppUserId()
          .then((id) => {
            if (cancelled) return;
            setAppUserId(id);
            setBrokerUserId(id);
          })
          .catch((err) => console.error("[pro] app user id failed", err));
        fetchOfferingPackages()
          .then((pkgs) => {
            if (!cancelled) setPackages(pkgs);
          })
          .catch((err) => console.error("[pro] offerings failed", err));
      })
      .catch((err) => console.error("[pro] RevenueCat configure failed", err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [native, apply]);

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
      try {
        apply(await buyPackage(pkg));
        return "purchased";
      } catch (err) {
        if (isUserCancelled(err)) return "cancelled";
        throw err;
      }
    },
    [apply],
  );

  const restore = useCallback(async () => apply(await restorePurchases()), [apply]);

  const refreshPackages = useCallback(async () => {
    if (!native) return;
    try {
      await configureRevenueCat();
      setPackages(await fetchOfferingPackages());
    } catch (err) {
      console.error("[pro] offerings failed", err);
    }
  }, [native]);

  const markNotPro = useCallback(() => setIsPro(false), []);
  const openNote = useCallback(() => setNoteOpen(true), []);
  const closeNote = useCallback(() => setNoteOpen(false), []);

  const value = useMemo<SubscriptionCtx>(
    () => ({
      isPro,
      ready,
      appUserId,
      managementUrl,
      packages,
      refreshPackages,
      purchase,
      restore,
      markNotPro,
      noteOpen,
      openNote,
      closeNote,
    }),
    [isPro, ready, appUserId, managementUrl, packages, refreshPackages, purchase, restore, markNotPro, noteOpen, openNote, closeNote],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionCtx {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return ctx;
}
