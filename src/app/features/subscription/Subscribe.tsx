/**
 * SUBSCRIBE — the Rafeeq Pro page.
 *
 * Reached from the subscriber note on a recite mic, or from Account →
 * Subscription. Lists what Pro gives, the store's plans (prices are always
 * the store's own localized strings), Subscribe and Restore. A successful
 * purchase or restore returns to the page that opened this one; the person
 * taps the mic again to recite. A cancelled store sheet is silent.
 */

import React, { useEffect, useMemo, useState } from "react";
import { IonContent, IonPage, useIonToast } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";
import type { PurchasesPackage } from "../../core/services/subscription/revenuecat.service";
import "./Subscribe.css";

/** Yearly first, then monthly, then anything else the offering holds. */
const ORDER: Record<string, number> = { ANNUAL: 0, MONTHLY: 1 };

const Subscribe: React.FC = () => {
  const { t } = useLang();
  const ts = t.subscription;
  const history = useHistory();
  const { packages, refreshPackages, purchase, restore } = useSubscription();
  const [presentToast] = useIonToast();
  const [busy, setBusy] = useState(false);

  // Plans fetched at startup are missing when the app opened offline; ask
  // again whenever the page opens without any.
  const hasPlans = packages.length > 0;
  useEffect(() => {
    if (!hasPlans) void refreshPackages();
  }, [hasPlans, refreshPackages]);

  const plans = useMemo(
    () =>
      [...packages].sort(
        (a, b) => (ORDER[a.packageType] ?? 9) - (ORDER[b.packageType] ?? 9),
      ),
    [packages],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen =
    plans.find((p) => p.identifier === chosenId) ??
    plans.find((p) => p.packageType === "ANNUAL") ??
    plans[0] ??
    null;

  const annual = plans.find((p) => p.packageType === "ANNUAL");
  const monthly = plans.find((p) => p.packageType === "MONTHLY");
  const yearlySaves =
    !!annual && !!monthly && annual.product.price / 12 < monthly.product.price;

  const label = (p: PurchasesPackage) =>
    p.packageType === "ANNUAL" ? ts.yearly : p.packageType === "MONTHLY" ? ts.monthly : p.product.title;

  const close = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/");
  };

  const toast = (message: string) =>
    presentToast({ message, duration: 2500, position: "bottom" });

  const onSubscribe = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      if ((await purchase(chosen)) === "purchased") close();
    } catch (err) {
      console.error("[pro] purchase failed", err);
      toast(ts.purchaseFailed);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await restore()) close();
      else toast(ts.restoreNone);
    } catch (err) {
      console.error("[pro] restore failed", err);
      toast(ts.restoreNone);
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <IonContent>
        <div className="subscribe-page" dir={t.dir}>
          <button type="button" className="subscribe-close" onClick={close} aria-label={ts.close}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <header className="subscribe-hero">
            <div className="subscribe-seal" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3.5 3.5 0 013.5 3.5v6a3.5 3.5 0 01-7 0v-6A3.5 3.5 0 0112 2z" />
                <path d="M18.5 10.5v1a6.5 6.5 0 01-13 0v-1" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
            </div>
            <h1 className="subscribe-title">{ts.title}</h1>
            <p className="subscribe-pitch">{ts.pitch}</p>
          </header>

          <ul className="subscribe-points">
            {[ts.point1, ts.point2, ts.point3].map((point) => (
              <li key={point}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{point}</span>
              </li>
            ))}
          </ul>

          {plans.length > 0 ? (
            <div className="subscribe-plans" role="radiogroup" aria-label={ts.title}>
              {plans.map((p) => {
                const selected = chosen?.identifier === p.identifier;
                return (
                  <button
                    key={p.identifier}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`subscribe-plan${selected ? " subscribe-plan--selected" : ""}`}
                    onClick={() => setChosenId(p.identifier)}
                  >
                    <span className="subscribe-plan-name">
                      {label(p)}
                      {p.packageType === "ANNUAL" && yearlySaves && (
                        <span className="subscribe-save">{ts.save}</span>
                      )}
                    </span>
                    <span className="subscribe-plan-price">{p.product.priceString}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="subscribe-no-plans">{ts.noPlans}</p>
          )}

          <button
            type="button"
            className="subscribe-cta"
            onClick={onSubscribe}
            disabled={!chosen || busy}
          >
            {ts.subscribe}
          </button>
          <button type="button" className="subscribe-restore" onClick={onRestore} disabled={busy}>
            {ts.restore}
          </button>
          <p className="subscribe-legal">{ts.legal}</p>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Subscribe;
