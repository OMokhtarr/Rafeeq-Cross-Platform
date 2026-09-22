/**
 * MORE PAGE
 * Hub for secondary destinations that don't earn a tab of their own:
 * Prayer Times & Qibla, Account and Settings.
 *
 * Prayer times and the qibla share one entry because they share one page —
 * /prayer-times renders the compass in its header above the times, so two
 * cards pointing at the same route only made the grid look busier.
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
  id: "account" | "settings" | "prayerTimes";
  icon: React.ReactNode;
  route: string;
  comingSoon?: boolean;
}

const ENTRIES: MoreEntry[] = [
  {
    id: "prayerTimes",
    // Compass rose with a crescent: the qibla needle and the times in one mark.
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="13" r="8.5" />
        <path d="M14.4 9.6l-2 4.8-4.8 2 2-4.8z" />
        <path d="M19.6 2.2a2.8 2.8 0 1 0 2.2 3.4 2.2 2.2 0 0 1-2.2-3.4z" />
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
