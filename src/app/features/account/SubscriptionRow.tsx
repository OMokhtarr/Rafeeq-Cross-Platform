/**
 * ACCOUNT → SUBSCRIPTION
 *
 * Shows whether this person has Rafeeq Pro and the ways to act on it:
 * subscribers can open the store's own management page (to cancel or change
 * plan); everyone else can view the subscription or restore a purchase made
 * on another device. Works whether or not the app-side paywall switch is on,
 * so purchases can be tested before launch.
 *
 * The Support ID is the RevenueCat app-user id, shown shortened and copied
 * in full. The owner needs it to grant free Pro (testers, family, a store
 * reviewer) or to sort out "I paid but it's still locked".
 */

import React, { useState } from "react";
import { useIonToast } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";

/** Characters of the Support ID shown on screen; the full id is copied. */
const SHORT_ID_LENGTH = 8;

const SubscriptionRow: React.FC = () => {
  const { t } = useLang();
  const ts = t.subscription;
  const history = useHistory();
  const { isPro, managementUrl, appUserId, restore } = useSubscription();
  const [presentToast] = useIonToast();
  const [restoring, setRestoring] = useState(false);

  const toast = (message: string) =>
    presentToast({ message, duration: 2000, position: "bottom" });

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      if (!(await restore())) toast(ts.restoreNone);
    } catch (err) {
      console.error("[pro] restore failed", err);
      toast(ts.restoreNone);
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
        managementUrl && (
          <button className="ac-row" onClick={() => window.open(managementUrl, "_system")}>
            <span className="ac-row-label">{ts.manage}</span>
          </button>
        )
      ) : (
        <>
          <button className="ac-row" onClick={() => history.push("/subscribe")}>
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
