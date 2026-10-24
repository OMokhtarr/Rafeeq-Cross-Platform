/**
 * The streak read-out: current and longest run, the week centred on today
 * (which opens into the month-by-month calendar), and the freeze row that
 * opens the explainer.
 *
 * Shared by the Account tab (as a card body) and the Hifz page (inside a
 * sheet), so the two can never drift apart. It loads its own data rather than
 * taking it as props: Hifz already computes the streak for its stat chip, but
 * not the longest run, the week strip or the freeze pool, and threading four
 * more values through that page only to hand them straight back here would
 * couple it to this panel's internals.
 *
 * The Hifz plan has to be passed in, though — it is the one input this cannot
 * get cheaply. Both host pages have already loaded it, and re-reading it here
 * would mean an async load inside a synchronous render.
 */
import React, { useState } from "react";
import {
  computeStreakPersistent,
  computeLongestStreakPersistent,
  streakWindow,
  loadStreakDates,
  type PlanSession,
} from "../hifz/hifz.service";
import { loadFreezePool } from "../../core/services/storage/streak-freeze.service";
import FreezeSnowflake from "./FreezeSnowflake";
import StreakFreezeMeter from "./StreakFreezeMeter";
import StreakFreezeSheet from "./StreakFreezeSheet";
import StreakWeekStrip from "./StreakWeekStrip";
import StreakCalendar from "./StreakCalendar";
// The panel's own styles live in Account.css alongside the card that first
// used them. Imported here rather than by the host page, so rendering this
// anywhere brings its styling with it.
import { tourAttr } from "../onboarding/tourCatalog";
import "./Account.css";

interface Props {
  /** Sessions from the loaded Hifz plan; [] is valid and means "no plan yet". */
  sessions: PlanSession[];
  lang: string;
}

/** Newest date in a streak store, or null when the streak was never started. */
function latestDate(dates: string[]): string | null {
  return dates.length ? dates.slice().sort().pop() ?? null : null;
}

const StreakPanel: React.FC<Props> = ({ sessions, lang }) => {
  const [freezeSheet, setFreezeSheet] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Cheap synchronous reads over localStorage, recomputed on each render so a
  // session completed while a host page is mounted is reflected on reopen.
  const streak = computeStreakPersistent(sessions);
  const longest = computeLongestStreakPersistent(sessions);
  const week = streakWindow(sessions);
  const freezeCount = loadFreezePool("hifz").count;
  const lastActive = latestDate(loadStreakDates());

  const ar = lang === "ar";
  const t = {
    current: ar ? "الحالية" : "Current",
    longest: ar ? "الأطول" : "Longest",
    noStreak: ar ? "لا توجد سلسلة بعد — ابدأ اليوم!" : "No streak yet — start today!",
    freezesReady: ar ? "تجميدات جاهزة للاستخدام" : "streak freezes ready to use",
    freezeOneReady: ar ? "تجميد جاهز للاستخدام" : "streak freeze ready to use",
    freezesNone: ar ? "لا تجميدات متبقية" : "No streak freezes left",
    showCalendar: ar ? "عرض التقويم" : "Show calendar",
    hideCalendar: ar ? "إخفاء التقويم" : "Hide calendar",
  };

  return (
    <>
      <div className="ac-streak-stats">
        <div className="ac-streak-stat">
          <span className="ac-streak-stat-val">{streak}</span>
          <span className="ac-streak-stat-lbl">{t.current}</span>
        </div>
        <div className="ac-streak-stat-div" />
        <div className="ac-streak-stat">
          <span className="ac-streak-stat-val">{longest}</span>
          <span className="ac-streak-stat-lbl">{t.longest}</span>
        </div>
      </div>

      {/* The week is the at-a-glance view; tapping it opens the whole history
          month by month. The toggle below is the labelled control for the
          same thing, so the strip itself needs no button semantics. */}
      {calendarOpen ? (
        <StreakCalendar sessions={sessions} lang={lang} />
      ) : (
        <div className="ac-week-open" onClick={() => setCalendarOpen(true)}>
          <StreakWeekStrip days={week} lang={lang} />
        </div>
      )}
      <button
        type="button"
        className="ac-cal-toggle"
        onClick={() => setCalendarOpen((o) => !o)}
        aria-expanded={calendarOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
        </svg>
        <span>{calendarOpen ? t.hideCalendar : t.showCalendar}</span>
      </button>

      {/* Freeze row — only once the streak has actually been started. A meter
          for a feature they never use is a standing nag. The row opens the
          explainer sheet; the meter below it says how to earn the next one. */}
      {lastActive && (
        <>
          <button className="ac-freeze-cta" onClick={() => setFreezeSheet(true)} {...tourAttr("account.streak")}>
            <span className="ac-freeze-cta-pips" aria-hidden="true">
              {Array.from({ length: freezeCount }, (_, i) => (
                <FreezeSnowflake key={i} className="ac-freeze-cta-pip" />
              ))}
            </span>
            <span className="ac-freeze-cta-lbl">
              {freezeCount === 0
                ? t.freezesNone
                : `${freezeCount} ${freezeCount === 1 ? t.freezeOneReady : t.freezesReady}`}
            </span>
            <svg
              className="ac-freeze-cta-arrow"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <div className="ac-freeze-row">
            <StreakFreezeMeter
              pool="hifz"
              lang={lang}
              lastActiveDate={lastActive}
            />
          </div>
        </>
      )}

      {streak === 0 && <p className="ac-streak-empty">{t.noStreak}</p>}

      {freezeSheet && (
        <StreakFreezeSheet
          count={freezeCount}
          lang={lang}
          onClose={() => setFreezeSheet(false)}
        />
      )}
    </>
  );
};

export default StreakPanel;
