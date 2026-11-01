/**
 * ACCOUNT → SUBSCRIPTION
 *
 * Shows whether this person has Rafeeq Pro and the ways to act on it:
 * subscribers open RevenueCat's Customer Center (cancel, change plan,
 * restore, refund requests); everyone else can open the Paywall or restore a
 * purchase made on another device. Works whether or not the app-side paywall
 * switch is on, so purchases can be tested before launch.
 *
 * Pro always belongs to an account, so a release build with accounts off
 * offers no way to buy or restore it: a purchase there would land on an
 * anonymous id. Debug builds keep both rows for store testing, and an
 * existing subscriber can still reach Manage.
 *
 * The Support ID is the RevenueCat app-user id, shown shortened and copied
 * in full. The owner needs it to grant free Pro (testers, family, a store
 * reviewer) or to sort out "I paid but it's still locked".
 */

import React, { useState } from "react";
import { useIonToast } from "@ionic/react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { useSignedInAction, useStartSubscribe } from "../subscription/useStartSubscribe";

/** Characters of the Support ID shown on screen; the full id is copied. */
const SHORT_ID_LENGTH = 8;

const SubscriptionRow: React.FC = () => {
  const { t } = useLang();
  const ts = t.subscription;
  const { isPro, appUserId, restore, showCustomerCenter } = useSubscription();
  const { enabled: accountsEnabled } = useAuth();
  const canBuy = accountsEnabled || Capacitor.DEBUG === true;
  const startSubscribe = useStartSubscribe();
  const whenSignedIn = useSignedInAction();
  const [presentToast] = useIonToast();
  const [restoring, setRestoring] = useState(false);

  const toast = (message: string) =>
    presentToast({ message, duration: 2000, position: "bottom" });

  const onManage = async () => {
    try {
      await showCustomerCenter();
    } catch (err) {
      console.error("[pro] customer center failed", err);
      toast(ts.manageFailed);
    }
  };

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      if (!(await restore())) toast(ts.restoreNone);
    } catch (err) {
      // A failed restore says nothing about whether a subscription exists.
      console.error("[pro] restore failed", err);
      toast(ts.restoreFailed);
    } finally {
      setRestoring(false);
    }
  };

  const onCopyId = async () => {
    if (!appUserId) return;
    try {
      await navigator.clipboard.writeText(appUserId);
      toast(ts.copied);
    } catch (err) {
      console.error("[pro] copy support id failed", err);
    }
  };

  return (
    <>
      <p className="ac-section-label">{ts.accountTitle}</p>
      <div className="ac-group">
        <div className="ac-row ac-row--static">
          <span className="ac-row-label">{ts.plan}</span>
          <span className={`ac-plan-pill${isPro ? " ac-plan-pill--pro" : ""}`}>
            {isPro ? ts.planPro : ts.planFree}
          </span>
        </div>

        {(isPro || canBuy) && <div className="ac-row-divider" />}
        {isPro ? (
          <button className="ac-row" onClick={onManage}>
            <span className="ac-row-label">{ts.manage}</span>
            <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="17" x2="20" y2="17" />
              <circle cx="9" cy="7" r="2.2" fill="var(--color-bg-card)" /><circle cx="15" cy="17" r="2.2" fill="var(--color-bg-card)" />
            </svg>
          </button>
        ) : canBuy ? (
          <>
            <button className="ac-row" onClick={() => void startSubscribe()}>
              <span className="ac-row-label">{ts.view}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3.5 3.5 0 013.5 3.5v6a3.5 3.5 0 01-7 0v-6A3.5 3.5 0 0112 2z" />
                <path d="M18.5 10.5v1a6.5 6.5 0 01-13 0v-1" /><line x1="12" y1="18" x2="12" y2="22" />
              </svg>
            </button>
            <div className="ac-row-divider" />
            <button className="ac-row" onClick={() => void whenSignedIn(onRestore)} disabled={restoring}>
              <span className="ac-row-label">{ts.restore}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" />
              </svg>
            </button>
          </>
        ) : null}

        {appUserId && (
          <>
            <div className="ac-row-divider" />
            <button className="ac-row" onClick={onCopyId}>
              <span className="ac-row-label">{ts.supportId}</span>
              <span className="ac-support-id">…{appUserId.slice(-SHORT_ID_LENGTH)}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
              </svg>
            </button>
          </>
        )}
      </div>
    </>
  );
};

export default SubscriptionRow;
