/**
 * ACCOUNT → SUBSCRIPTION
 *
 * Shows whether this person has Rafeeq Pro and the ways to act on it:
 * subscribers open RevenueCat's Customer Center (cancel, change plan,
 * restore, refund requests); everyone else can open the Paywall or restore a
 * purchase made on another device. Works whether or not the app-side paywall
 * switch is on, so purchases can be tested before launch.
 *
 * The Support ID is the RevenueCat app-user id, shown shortened and copied
 * in full. The owner needs it to grant free Pro (testers, family, a store
 * reviewer) or to sort out "I paid but it's still locked".
 */

import React, { useState } from "react";
import { useIonToast } from "@ionic/react";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { usePaywall } from "../subscription/usePaywall";

/** Characters of the Support ID shown on screen; the full id is copied. */
const SHORT_ID_LENGTH = 8;

const SubscriptionRow: React.FC = () => {
  const { t } = useLang();
  const ts = t.subscription;
  const { isPro, appUserId, restore, showCustomerCenter } = useSubscription();
  const openPaywall = usePaywall();
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
    <div className="ac-card ac-subscription-card">
      <div className="ac-streak-header ac-streak-header--static">
        <div className="ac-streak-header-left">
          <span className="ac-streak-flame">🎙️</span>
          <div>
            <p className="ac-streak-title">{ts.accountTitle}</p>
            <p className="ac-streak-summary">{isPro ? ts.accountActive : ts.accountFree}</p>
          </div>
        </div>
      </div>

      {isPro ? (
        <button className="ac-row" onClick={onManage}>
          <span className="ac-row-label">{ts.manage}</span>
        </button>
      ) : (
        <>
          <button className="ac-row" onClick={() => void openPaywall()}>
            <span className="ac-row-label">{ts.view}</span>
          </button>
          <div className="ac-row-divider" />
          <button className="ac-row" onClick={onRestore} disabled={restoring}>
            <span className="ac-row-label">{ts.restore}</span>
          </button>
        </>
      )}

      {appUserId && (
        <>
          <div className="ac-row-divider" />
          <button className="ac-row" onClick={onCopyId}>
            <span className="ac-row-label">{ts.supportId}</span>
            <span className="ac-support-id">…{appUserId.slice(-SHORT_ID_LENGTH)}</span>
          </button>
        </>
      )}
    </div>
  );
};

export default SubscriptionRow;
