/**
 * SUBSCRIPTION CONTEXT
 *
 * App-wide Rafeeq Pro state: whether this person is subscribed, the
 * RevenueCat Paywall and Customer Center, restore, and the open state of the
 * subscriber note any recite surface can raise.
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
  configureRevenueCat,
  CustomerInfo,
  fetchAppUserId,
  fetchCustomerInfo,
  isProFromCustomerInfo,
  onCustomerInfo,
  PaywallResult,
  presentCustomerCenter,
  presentPaywall,
  restore as restorePurchases,
  setRevenueCatLocale,
} from "../services/subscription/revenuecat.service";
import { useLang } from "./LanguageContext";
import { expectBrokerUserId, setBrokerUserId } from "../services/audio/stt/broker";

const CACHE_KEY = "rafiq_pro_v1";

/** How the paywall ended: "unavailable" when it couldn't be shown at all (no
 *  key, offline, no offering), "failed" when a purchase or restore errored. */
export type PaywallOutcome = "subscribed" | "dismissed" | "failed" | "unavailable";

interface SubscriptionCtx {
  isPro: boolean;
  /** RevenueCat has given a real answer this session. */
  ready: boolean;
  appUserId: string | null;
  /** Shows RevenueCat's Paywall; resolves once it is closed. */
  showPaywall: () => Promise<PaywallOutcome>;
  /** Shows RevenueCat's Customer Center; throws when it can't be shown. */
  showCustomerCenter: () => Promise<void>;
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
  const [noteOpen, setNoteOpen] = useState(false);

  const apply = useCallback((info: CustomerInfo) => {
    const pro = isProFromCustomerInfo(info);
    setIsPro(pro);
    setReady(true);
    writeCache(pro);
    return pro;
  }, []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // Speech requests hold until the id arrives, so a mic tap in the first
    // moment after launch isn't sent without one and refused as not Pro.
    expectBrokerUserId();
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
          .catch((err) => {
            console.error("[pro] app user id failed", err);
            setBrokerUserId(null);
          });
      })
      .catch((err) => {
        console.error("[pro] RevenueCat configure failed", err);
        setBrokerUserId(null);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [native, apply]);

  // The Paywall and Customer Center speak the app's language, not the phone's,
  // and follow it when it's switched in Settings.
  const { lang } = useLang();
  useEffect(() => {
    if (!native) return;
    configureRevenueCat()
      .then(() =>
        setRevenueCatLocale(lang).catch((err) => console.error("[pro] paywall language failed", err)),
      )
      // A failed configure is already reported by the effect above.
      .catch(() => {});
  }, [native, lang]);

  const refresh = useCallback(async () => apply(await fetchCustomerInfo()), [apply]);

  const showPaywall = useCallback(async (): Promise<PaywallOutcome> => {
    if (!native) return "unavailable";
    let result: PaywallResult;
    try {
      await configureRevenueCat();
      result = await presentPaywall();
    } catch (err) {
      console.error("[pro] paywall failed", err);
      return "unavailable";
    }
    if (result === "error") return "failed";
    if (result === "cancelled") return "dismissed";
    try {
      // A restore that found nothing also reports "restored".
      return (await refresh()) ? "subscribed" : "dismissed";
    } catch (err) {
      // The purchase stands; the listener delivers it once RevenueCat answers.
      console.error("[pro] customer info failed", err);
      return "subscribed";
    }
  }, [native, refresh]);

  const showCustomerCenter = useCallback(async () => {
    await configureRevenueCat();
    await presentCustomerCenter();
    // A cancel or plan change made there also arrives through the listener;
    // this makes the Account row current the moment the screen closes.
    refresh().catch((err) => console.error("[pro] customer info failed", err));
  }, [refresh]);

  const restore = useCallback(async () => apply(await restorePurchases()), [apply]);

  const markNotPro = useCallback(() => setIsPro(false), []);
  const openNote = useCallback(() => setNoteOpen(true), []);
  const closeNote = useCallback(() => setNoteOpen(false), []);

  const value = useMemo<SubscriptionCtx>(
    () => ({
      isPro,
      ready,
      appUserId,
      showPaywall,
      showCustomerCenter,
      restore,
      markNotPro,
      noteOpen,
      openNote,
      closeNote,
    }),
    [isPro, ready, appUserId, showPaywall, showCustomerCenter, restore, markNotPro, noteOpen, openNote, closeNote],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionCtx {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return ctx;
}
