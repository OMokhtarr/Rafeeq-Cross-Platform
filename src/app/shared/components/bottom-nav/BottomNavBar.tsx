/**
 * BOTTOM NAV BAR
 * Persistent bottom tab bar shared across every primary surface.
 * Mirrors the design system's TabBar (filled rounded-square icon containers,
 * gold/category-tinted active state, Arabic label + small Latin sublabel).
 *
 * Tabs: Quran · Quiz · Azkar · Hifz · Settings
 *
 * The "active" prop highlights one tab. Pages without a matching tab can
 * pass `active={undefined}` (e.g. PageViewer is highlighted as 'quran').
 */

import React from "react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../../core/context/LanguageContext";
import "./BottomNavBar.css";

export type NavTabKey =
  | "home"
  | "quran"
  | "quiz"
  | "azkar"
  | "hifz"
  | "account"
  | "settings";

interface TabDef {
  id: NavTabKey;
  icon: React.ReactNode;
  route: string;
  color: string;
  filled: boolean;
  comingSoon?: boolean;
}

const TABS: TabDef[] = [
  {
    id: "home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 8.5V20h4.5v-4.5h5V20H19V8.5" />
      </svg>
    ),
    route: "/",
    color: "var(--color-gold, #d4b48c)",
    filled: false,
  },
  {
    id: "quran",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5a2 2 0 0 1 2-2h5.5v18H5a2 2 0 0 1-2-2V5z" />
        <path d="M21 5a2 2 0 0 0-2-2h-5.5v18H19a2 2 0 0 0 2-2V5z" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    ),
    route: "/viewer",
    color: "var(--color-quran)",
    filled: false,
  },
  {
    id: "quiz",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" />
      </svg>
    ),
    route: "/quiz-list",
    color: "var(--color-quiz)",
    filled: false,
  },
  {
    id: "azkar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* 8 beads evenly spaced on a circle of r=8.5 centred at 12,12 */}
        <circle cx="12"    cy="3.5"  r="1.7" />
        <circle cx="18.5"  cy="5.5"  r="1.7" />
        <circle cx="20.5"  cy="12"   r="1.7" />
        <circle cx="18.5"  cy="18.5" r="1.7" />
        <circle cx="12"    cy="20.5" r="1.7" />
        <circle cx="5.5"   cy="18.5" r="1.7" />
        <circle cx="3.5"   cy="12"   r="1.7" />
        <circle cx="5.5"   cy="5.5"  r="1.7" />
      </svg>
    ),
    route: "/azkar",
    color: "var(--color-azkar)",
    filled: false,
  },
  {
    id: "hifz",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* brain — shifted left to make room for book */}
        <path d="M8 2A3 3 0 0 0 5 5c0 .45.09.88.26 1.26A3 3 0 0 0 3 9c0 1.2.7 2.3 1.75 2.8V13.5a2.5 2.5 0 0 0 5 0V12" />
        <path d="M12 2A3 3 0 0 1 15 5c0 .45-.09.88-.26 1.26A3 3 0 0 1 17 9c0 1.2-.7 2.3-1.75 2.8V13.5a2.5 2.5 0 0 1-5 0V12" />
        <line x1="10" y1="5.5" x2="10" y2="11" />
        {/* small open book bottom-right — left page */}
        <path d="M14 15.5C13 15 11.5 15 10.5 15.5V22c1-.4 2.5-.4 3.5 0" />
        {/* right page */}
        <path d="M14 15.5C15 15 16.5 15 17.5 15.5V22c-1-.4-2.5-.4-3.5 0" />
      </svg>
    ),
    route: "/hifz",
    color: "var(--color-hifz, #7c6cd4)",
    filled: false,
  },
  {
    id: "account",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    route: "/account",
    color: "var(--color-steel-blue, #c8d6e5)",
    filled: false,
  },
  {
    id: "settings",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    route: "/settings",
    color: "var(--color-settings)",
    filled: false,
  },
];

interface Props {
  /** Highlights one tab. Omit for no highlight (e.g. transient pages). */
  active?: NavTabKey;
  /** Override Quran route — useful if you want the tab to land elsewhere. */
  quranHref?: string;
  /**
   * When true, the nav bar pins itself to the bottom of its containing
   * positioned ancestor (typically IonContent's wrapper). Use this for
   * pages whose body uses native scrolling — they don't have a flex shell
   * to push the bar down naturally. The page is responsible for adding
   * bottom padding so content isn't hidden underneath the bar.
   */
  fixed?: boolean;
}

const BottomNavBar: React.FC<Props> = ({ active, quranHref, fixed }) => {
  const history = useHistory();
  const { t, lang } = useLang();

  // Navigate to a tab with replace (not push) so the current entry is swapped
  // out rather than stacked on top. Main tab pages must never go back (no
  // swipe, no hardware back to whatever pushed them, e.g. a Hifz session →
  // viewer). useHistory is used instead of useIonRouter because BottomNavBar is
  // rendered deep inside pages where the IonRouterContext is not always present
  // (it throws "An Ionic Router is required"); the React Router history context
  // is always available under IonReactRouter.
  const goToTab = (route: string) => history.replace(route);

  const labels: Record<NavTabKey, string> = {
    home: lang === "ar" ? "الرئيسية" : "Home",
    quran: t.tabs.quran,
    quiz: t.tabs.quiz,
    azkar: t.tabs.azkar,
    hifz: t.tabs.hifz,
    account: lang === "ar" ? "حسابي" : "Account",
    settings: t.tabs.settings,
  };

  return (
    <nav
      className={"rfq-tab-bar" + (fixed ? " rfq-tab-bar-fixed" : "")}
      aria-label="Primary"
    >
      {TABS.map((tab) => {
        const l = labels[tab.id];
        const isActive = active === tab.id;
        const route = tab.id === "quran" && quranHref ? quranHref : tab.route;
        return (
          <button
            key={tab.id}
            className={
              "rfq-tab" +
              (tab.comingSoon ? " rfq-tab-disabled" : "") +
              (isActive ? " rfq-tab-active" : "")
            }
            style={{ "--tab-color": tab.color } as React.CSSProperties}
            onClick={() => !tab.comingSoon && goToTab(route)}
            disabled={tab.comingSoon}
            aria-current={isActive ? "page" : undefined}
            aria-label={
              tab.comingSoon ? `${l} (${t.tabs.comingSoon})` : l
            }
          >
            <span
              className={
                "rfq-tab-icon-box" +
                (tab.filled ? " rfq-tab-icon-filled" : " rfq-tab-icon-stroke")
              }
              aria-hidden="true"
            >
              {tab.icon}
            </span>
            <span className="rfq-tab-label-primary">{l}</span>
            {tab.comingSoon && (
              <span className="rfq-tab-soon">{t.tabs.comingSoon}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNavBar;
