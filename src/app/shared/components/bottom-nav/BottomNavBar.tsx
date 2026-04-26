/**
 * BOTTOM NAV BAR
 * Persistent bottom tab bar shared across every primary surface.
 * Mirrors the design system's TabBar (filled rounded-square icon containers,
 * gold/category-tinted active state, Arabic label + small Latin sublabel).
 *
 * Tabs: Quran · Quiz · Azkar · Ahadith (coming soon) · Settings
 *
 * The "active" prop highlights one tab. Pages without a matching tab can
 * pass `active={undefined}` (e.g. PageViewer is highlighted as 'quran').
 */

import React from "react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../../core/context/LanguageContext";
import "./BottomNavBar.css";

export type NavTabKey = "home" | "quran" | "quiz" | "azkar" | "ahadith" | "settings";

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
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5z" />
      </svg>
    ),
    route: "/",
    color: "var(--color-gold, #d4b48c)",
    filled: true,
  },
  {
    id: "quran",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2V3z" />
        <path d="M22 3h-9a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9V3z" />
      </svg>
    ),
    route: "/viewer",
    color: "var(--color-quran)",
    filled: true,
  },
  {
    id: "quiz",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6l-.7.5V18H9v-2.5l-.7-.5A7 7 0 0 1 12 2z" />
        <rect x="9" y="18" width="6" height="2" rx="1" />
        <rect x="10" y="20" width="4" height="2" rx="1" />
      </svg>
    ),
    route: "/quiz-list",
    color: "var(--color-quiz)",
    filled: true,
  },
  {
    id: "azkar",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="18.5" cy="9" r="2" />
        <circle cx="19" cy="15.5" r="2" />
        <circle cx="14" cy="20" r="2" />
        <circle cx="7.5" cy="19.5" r="2" />
        <circle cx="4" cy="14" r="2" />
        <circle cx="5" cy="8" r="2" />
      </svg>
    ),
    route: "/azkar",
    color: "var(--color-azkar)",
    filled: true,
  },
  {
    id: "ahadith",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <line x1="8" y1="8" x2="16" y2="8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="12" x2="16" y2="12" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="16" x2="13" y2="16" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    route: "/ahadith",
    color: "var(--color-ahadith)",
    filled: true,
    comingSoon: true,
  },
  {
    id: "settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

  const labels: Record<NavTabKey, { primary: string; secondary: string }> = {
    home:     { primary: lang === "ar" ? "الرئيسية" : "Home",      secondary: lang === "ar" ? "Home"    : "الرئيسية" },
    quran:    { primary: t.tabs.quran,    secondary: lang === "ar" ? "Quran"    : "القرآن" },
    quiz:     { primary: t.tabs.quiz,     secondary: lang === "ar" ? "Quizzes"  : "اختبارات" },
    azkar:    { primary: t.tabs.azkar,    secondary: lang === "ar" ? "Azkar"    : "أذكار" },
    ahadith:  { primary: t.tabs.ahadith,  secondary: lang === "ar" ? "Ahadith"  : "أحاديث" },
    settings: { primary: t.tabs.settings, secondary: lang === "ar" ? "Settings" : "إعدادات" },
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
            onClick={() => !tab.comingSoon && history.push(route)}
            disabled={tab.comingSoon}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.comingSoon ? `${l.primary} (${t.tabs.comingSoon})` : l.primary}
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
            <span className="rfq-tab-label-primary">{l.primary}</span>
            <span className="rfq-tab-label-secondary">{l.secondary}</span>
            {tab.comingSoon && <span className="rfq-tab-soon">{t.tabs.comingSoon}</span>}
            {isActive && <span className="rfq-tab-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNavBar;
