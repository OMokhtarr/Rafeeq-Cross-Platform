/**
 * MORE PAGE
 * Hub for secondary destinations that don't earn a tab of their own:
 * Account, Settings, and (once built) Qibla and Prayer Times.
 *
 * Entries navigate with `push`, not the nav bar's `replace`, so hardware back
 * returns here rather than exiting — these are sub-pages of More, and /account
 * and /settings were removed from ROOT_TAB_PATHS for that reason.
 *
 * Unbuilt entries carry `comingSoon` and render disabled with the same badge
 * the nav bar uses, rather than routing to an empty screen.
 *
 * Array order is grid order: the daily-use features lead, and Account and
 * Settings sit on the bottom row where utility destinations belong.
 */

import React from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import "./More.css";

interface MoreEntry {
  id: "account" | "settings" | "qibla" | "prayerTimes";
  icon: React.ReactNode;
  route: string;
  comingSoon?: boolean;
}

const ENTRIES: MoreEntry[] = [
  {
    id: "qibla",
    // Compass: the needle points to the Kaaba rather than north.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
      </svg>
    ),
    route: "/qibla",
    comingSoon: true,
  },
  {
    id: "prayerTimes",
    // Crescent over a clock face — the two ideas the feature joins.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13.5" r="7.5" />
        <path d="M12 9.5v4.2l2.7 1.6" />
        <path d="M19.5 2.2a3 3 0 1 0 2.3 3.6 2.4 2.4 0 0 1-2.3-3.6z" />
      </svg>
    ),
    route: "/prayer-times",
  },
  {
    id: "account",
    // Same mark the nav bar used for this destination before it moved here.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    route: "/account",
  },
  {
    id: "settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    route: "/settings",
  },
];

const More: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tm = t.more;

  const labels: Record<MoreEntry["id"], string> = {
    account: tm.account,
    settings: tm.settings,
    qibla: tm.qibla,
    prayerTimes: tm.prayerTimes,
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="more-page-wrapper">
          <div className="more-container" dir={isRTL ? "rtl" : "ltr"}>
            <h1 className="more-title">{tm.title}</h1>

            <div className="more-grid">
              {ENTRIES.map((entry) => {
                const label = labels[entry.id];
                return (
                  <button
                    key={entry.id}
                    className={
                      "more-card" + (entry.comingSoon ? " more-card-disabled" : "")
                    }
                    onClick={() => !entry.comingSoon && history.push(entry.route)}
                    disabled={entry.comingSoon}
                    aria-label={
                      entry.comingSoon
                        ? `${label} (${t.tabs.comingSoon})`
                        : label
                    }
                  >
                    <span className="more-card-icon" aria-hidden="true">
                      {entry.icon}
                    </span>
                    <span className="more-card-label">{label}</span>
                    {entry.comingSoon && (
                      <span className="more-card-soon">{t.tabs.comingSoon}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </IonContent>
      <BottomNavBar active="more" fixed />
    </IonPage>
  );
};

export default More;
