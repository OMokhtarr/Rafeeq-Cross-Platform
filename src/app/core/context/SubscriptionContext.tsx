/**
 * SUBSCRIPTION CONTEXT
 *
 * App-wide Rafeeq Pro state: whether this person is subscribed, the
 * RevenueCat Paywall and Customer Center, restore, and the open state of the
 * subscriber note any recite surface can raise.
 *
 * On native, the last known answer is cached in localStorage and used as the
 * starting value, so a subscriber never sees the PRO badge flash while
 * RevenueCat answers (or while offline). With accounts on, that cache counts
 * only while an account is cached too: Pro lives on the account, so a
 * signed-out launch starts from not-Pro. The live answer replaces it, and
 * renewals/expiries arrive through RevenueCat's listener. On web there is no
 * store billing, so recite stays unlocked for development.
 *
 * With accounts on, RevenueCat's identity follows the signed-in account
 * (logIn/logOut), so Pro belongs to the account; with them off it stays on
 * RevenueCat's anonymous id.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import {
  configureRevenueCat,
  CustomerInfo,
  fetchAppUserId,
  fetchCustomerInfo,
  isProFromCustomerInfo,
  logInRevenueCat,
  logOutRevenueCat,
  onCustomerInfo,
  PaywallResult,
  presentCustomerCenter,
  presentPaywall,
  restore as restorePurchases,
  setRevenueCatLocale,
} from "../services/subscription/revenuecat.service";
import { hasCachedAccount } from "../services/auth/auth.service";
import { useAuth } from "./AuthContext";
import { useLang } from "./LanguageContext";

const CACHE_KEY = "rafiq_pro_v1";

/** Longest a purchase or restore waits for RevenueCat to move onto the account. */
const IDENTITY_WAIT_MS = 8000;

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
  // RevenueCat follows the account only when accounts are on; it is configured
  // once auth has read the stored session, so the first identity is right.
  const auth = useAuth();
  const [isPro, setIsPro] = useState<boolean>(() => {
    if (!native) return true;
    if (auth.enabled && !hasCachedAccount()) return false;
    return readCache();
  });
  const [ready, setReady] = useState(!native);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const authReady = !auth.enabled || auth.ready;
  const accountId = auth.enabled ? auth.user?.id ?? null : null;
  const currentUserId = auth.currentUserId;
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  // The account RevenueCat is on (undefined until configured), and a counter
  // so a slow logIn/logOut can't overwrite a later change.
  const identityRef = useRef<string | null | undefined>(undefined);
  // Identity switches run one at a time: RevenueCat's logIn/logOut overlap
  // badly (isAnonymous lags a pending logIn, and two can finish out of order).
  // Each step reads the latest target when it runs; only the last queued step
  // applies its result, and the customer-info listener is muted meanwhile.
  const identityChain = useRef<Promise<void>>(Promise.resolve());
  const identityPending = useRef(0);
  const sdkAccountId = useRef<string | null>(null);
  // Drops isPro in the very render where the account changes, so no frame
  // shows the previous account's Pro to the next one.
  const [seenAccountId, setSeenAccountId] = useState(accountId);
  if (seenAccountId !== accountId) {
    setSeenAccountId(accountId);
    if (native && identityRef.current !== undefined) setIsPro(false);
  }

  const apply = useCallback((info: CustomerInfo) => {
    const pro = isProFromCustomerInfo(info);
    setIsPro(pro);
    setReady(true);
    writeCache(pro);
    return pro;
  }, []);

  /** Queues a move of RevenueCat onto whichever account is current when it runs. */
  const syncIdentity = useCallback(() => {
    identityPending.current += 1;
    identityChain.current = identityChain.current
      .then(async () => {
        // Read live: the render-lagged accountIdRef can miss a sign-in that
        // has just landed.
        const target = auth.enabled ? currentUserId() : null;
        let info: CustomerInfo;
        if (!target) {
          // No-op when RevenueCat is already anonymous.
          info = await logOutRevenueCat();
        } else if (sdkAccountId.current === target) {
          info = await fetchCustomerInfo();
        } else {
          info = await logInRevenueCat(target);
        }
        sdkAccountId.current = target;
        const id = target ?? (await fetchAppUserId());
        if (identityPending.current === 1) {
          apply(info);
          setAppUserId(id);
        }
      })
      .catch((err) => console.error("[pro] switching account failed", err))
      .then(() => {
        identityPending.current -= 1;
      });
  }, [apply, auth.enabled, currentUserId]);

  useEffect(() => {
    if (!native || !authReady) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    identityRef.current = accountIdRef.current;
    sdkAccountId.current = accountIdRef.current;
    configureRevenueCat(accountIdRef.current)
      .then(() => {
        if (cancelled) return;
        if (auth.enabled) {
          // Also puts a stale identified SDK back to anonymous when signed out.
          syncIdentity();
        } else {
          fetchCustomerInfo()
            .then((info) => {
              if (!cancelled) apply(info);
            })
            .catch((err) => console.error("[pro] customer info failed", err));
          fetchAppUserId()
            .then((id) => {
              if (!cancelled) setAppUserId(id);
            })
            .catch((err) => console.error("[pro] app user id failed", err));
        }
        onCustomerInfo((info) => {
          if (!cancelled && identityPending.current === 0) apply(info);
        })
          .then((unsub) => {
            if (cancelled) unsub();
            else unsubscribe = unsub;
          })
          .catch((err) => console.error("[pro] listener failed", err));
      })
      .catch((err) => console.error("[pro] RevenueCat configure failed", err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [native, authReady, auth.enabled, apply, syncIdentity]);

  // A later sign-in or sign-out moves RevenueCat to the new identity. The Pro
  // cache is cleared first (isPro is dropped during render, above), so the
  // next account never sees the previous one's Pro while RevenueCat answers.
  useEffect(() => {
    if (!native || !authReady || !auth.enabled) return;
    if (identityRef.current === undefined || identityRef.current === accountId) return;
    identityRef.current = accountId;
    writeCache(false);
    syncIdentity();
  }, [native, authReady, auth.enabled, accountId, syncIdentity]);

  // The Paywall and Customer Center speak the app's language, not the phone's,
  // and follow it when it's switched in Settings.
  const { lang } = useLang();
  useEffect(() => {
    if (!native || !authReady) return;
    configureRevenueCat(accountIdRef.current)
      .then(() =>
        setRevenueCatLocale(lang).catch((err) => console.error("[pro] paywall language failed", err)),
      )
      // A failed configure is already reported by the effect above.
      .catch(() => {});
  }, [native, authReady, lang]);

  /** Resolves true once RevenueCat is on the account that is signed in right
   *  now. A sign-in that has just landed only queues its logIn after React
   *  renders, so when nothing is pending but the SDK is on another account this
   *  queues the switch itself. False when the switch fails or takes too long. */
  const identitySettled = useCallback(async (): Promise<boolean> => {
    if (!auth.enabled) return true;
    const deadline = Date.now() + IDENTITY_WAIT_MS;
    let queuedOwn = false;
    while (Date.now() < deadline) {
      if (identityPending.current > 0) {
        await Promise.race([
          identityChain.current,
          new Promise((resolve) => setTimeout(resolve, deadline - Date.now())),
        ]);
        continue;
      }
      if (sdkAccountId.current === currentUserId()) return true;
      if (queuedOwn) return false;
      queuedOwn = true;
      syncIdentity();
    }
    return false;
  }, [auth.enabled, currentUserId, syncIdentity]);

  const refresh = useCallback(async () => apply(await fetchCustomerInfo()), [apply]);

  const showPaywall = useCallback(async (): Promise<PaywallOutcome> => {
    // Configuring before auth is read would lock RevenueCat to an anonymous id.
    if (!native || !authReady) return "unavailable";
    let result: PaywallResult;
    try {
      await configureRevenueCat();
      // A purchase made before logIn finishes would attach to the anonymous id.
      if (!(await identitySettled())) return "failed";
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
  }, [native, authReady, refresh, identitySettled]);

  const showCustomerCenter = useCallback(async () => {
    // Configuring before auth is read would lock RevenueCat to an anonymous id.
    if (!authReady) throw new Error("auth is not ready");
    await configureRevenueCat();
    await presentCustomerCenter();
    // A cancel or plan change made there also arrives through the listener;
    // this makes the Account row current the moment the screen closes.
    refresh().catch((err) => console.error("[pro] customer info failed", err));
  }, [authReady, refresh]);

  const restore = useCallback(async () => {
    if (!(await identitySettled())) throw new Error("RevenueCat is not on the signed-in account");
    return apply(await restorePurchases());
  }, [apply, identitySettled]);

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
