/**
 * ACCOUNT → SUBSCRIPTION
 *
 * Rafeeq Pro and the ways to act on it. Pro always belongs to an account, so
 * the card only appears once someone is signed in. Subscribers open
 * RevenueCat's Customer Center (cancel, change plan, restore, refund
 * requests); everyone else can open the Paywall or restore a purchase made on
 * another device. Works whether or not the app-side paywall switch is on, so
 * purchases can be tested before launch.
 *
 * The Support ID is the RevenueCat app-user id, shown shortened and copied
 * in full. The owner needs it to grant free Pro (testers, family, a store
 * reviewer) or to sort out "I paid but it's still locked".
 */

import React, { useState } from "react";
import { useIonToast } from "@ionic/react";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { useStartSubscribe } from "../subscription/useStartSubscribe";

/** Characters of the Support ID shown on screen; the full id is copied. */
const SHORT_ID_LENGTH = 8;

/** The eight-pointed star of the rub el hizb, Rafeeq Pro's mark. */
const ProStar: React.FC = () => (
  <svg className="ac-pro-star" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="1" />
    <rect x="5" y="5" width="14" height="14" rx="1" transform="rotate(45 12 12)" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

const SubscriptionRow: React.FC = () => {
  const { t } = useLang();
  const ts = t.subscription;
  const { user } = useAuth();
  const { isPro, appUserId, restore, showCustomerCenter } = useSubscription();
  const startSubscribe = useStartSubscribe();
  const [presentToast] = useIonToast();
  const [restoring, setRestoring] = useState(false);

  if (!user) return null;

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
      <section className={`ac-card ac-pro${isPro ? " ac-pro--active" : ""}`}>
        <div className="ac-pro-head">
          <ProStar />
          <div className="ac-pro-text">
            <h2 className="ac-pro-title">{ts.planPro}</h2>
            <p className="ac-pro-line">{isPro ? ts.proActiveLine : ts.proLine}</p>
          </div>
          {isPro && <span className="ac-plan-pill ac-plan-pill--pro">{ts.proActive}</span>}
        </div>

        {isPro ? (
          <>
            <div className="ac-row-divider" />
            <button className="ac-row" onClick={onManage}>
              <span className="ac-row-label">{ts.manage}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="17" x2="20" y2="17" />
                <circle cx="9" cy="7" r="2.2" fill="var(--color-bg-card)" /><circle cx="15" cy="17" r="2.2" fill="var(--color-bg-card)" />
              </svg>
            </button>
          </>
        ) : (
          <div className="ac-pro-actions">
            <button className="ac-acct-cta" onClick={() => void startSubscribe()}>
              {ts.view}
            </button>
            <button className="ac-pro-restore" onClick={() => void onRestore()} disabled={restoring}>
              {ts.restore}
            </button>
          </div>
        )}

        {appUserId && (
          <>
            <div className="ac-row-divider" />
            <button className="ac-row ac-row--quiet" onClick={onCopyId}>
              <span className="ac-row-label">{ts.supportId}</span>
              <span className="ac-support-id">…{appUserId.slice(-SHORT_ID_LENGTH)}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
              </svg>
            </button>
          </>
        )}
      </section>
    </>
  );
};

export default SubscriptionRow;
