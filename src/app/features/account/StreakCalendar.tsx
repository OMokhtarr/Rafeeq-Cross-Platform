/**
 * The whole streak history, one calendar month at a time.
 *
 * Opened from the week strip. Each day uses the strip's own marks — a gold
 * disc for a kept day, blue for a day a freeze held, an empty well for a miss,
 * a dashed well for a day still ahead, a ring on today — but carries its date,
 * because a month of unlabelled discs can't be read back. Kept days that sit
 * side by side in a row are joined by the same gold branch.
 *
 * Navigation runs from the month of the first streak day to the current one:
 * there is nothing to see before the history starts, and nothing yet after
 * today's month.
 */
import React, { useMemo, useState } from "react";
import { firstStreakDate, streakMonth, type PlanSession } from "../hifz/hifz.service";
import { localDateStr, todayStr } from "../../core/utils/local-date.util";
import { weekdayInitial } from "./StreakWeekStrip";

interface Props {
  sessions: PlanSession[];
  lang: string;
}

/** Saturday in Arabic, Sunday in English — the week each locale's readers expect. */
const weekStartFor = (lang: string) => (lang === "ar" ? 6 : 0);

/** A Sunday, from which any weekday's date is a fixed offset away. */
const A_SUNDAY = new Date(2026, 0, 4);

const monthIndex = (year: number, month: number) => year * 12 + month;

const StreakCalendar: React.FC<Props> = ({ sessions, lang }) => {
  const ar = lang === "ar";
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const days = streakMonth(sessions, view.year, view.month);
  const first = firstStreakDate(sessions);
  const firstMonth = first
    ? monthIndex(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1)
    : monthIndex(now.getFullYear(), now.getMonth());
  const currentMonth = monthIndex(view.year, view.month);
  const canBack = currentMonth > firstMonth;
  const canForward = currentMonth < monthIndex(now.getFullYear(), now.getMonth());

  const weekStart = weekStartFor(lang);
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(A_SUNDAY);
        d.setDate(A_SUNDAY.getDate() + ((weekStart + i) % 7));
        return weekdayInitial(localDateStr(d), lang);
      }),
    [weekStart, lang],
  );
  const leadingBlanks = (new Date(view.year, view.month, 1).getDay() - weekStart + 7) % 7;

  const title = new Date(view.year, view.month, 1).toLocaleDateString(ar ? "ar-u-nu-latn" : "en", {
    month: "long",
    year: "numeric",
  });
  const kept = days.filter((d) => d.active).length;
  const today = todayStr();

  const step = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    // Its own direction: the Hifz page shows this inside a modal that may sit
    // outside the page's dir, and the grid's reading order depends on it.
    <div className="ac-cal" dir={ar ? "rtl" : "ltr"}>
      <div className="ac-cal-head">
        <button
          type="button"
          className="ac-cal-nav"
          onClick={() => step(-1)}
          disabled={!canBack}
          aria-label={ar ? "الشهر السابق" : "Previous month"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="ac-cal-title" aria-live="polite">{title}</p>
        <button
          type="button"
          className="ac-cal-nav"
          onClick={() => step(1)}
          disabled={!canForward}
          aria-label={ar ? "الشهر التالي" : "Next month"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="ac-cal-grid" role="grid" aria-label={title}>
        {weekdays.map((w, i) => (
          <span className="ac-cal-wd" key={`wd-${i}`}>{w}</span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day, i) => {
          // Join to the previous day only when both count and share a row.
          const startsRow = (leadingBlanks + i) % 7 === 0;
          const linked = i > 0 && !startsRow && day.active && days[i - 1].active;
          const cls = [
            "ac-week-day",
            "ac-cal-day",
            day.active ? "ac-week-day--on" : "",
            day.frozen ? "ac-week-day--frozen" : "",
            day.future ? "ac-week-day--future" : "",
            day.date === today ? "ac-week-day--today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span className="ac-week-mark" key={day.date} role="gridcell">
              {linked && <span className="ac-week-link" aria-hidden="true" />}
              <span className={cls}>{Number(day.date.slice(8))}</span>
            </span>
          );
        })}
      </div>

      <p className="ac-cal-sum">
        {ar ? `أيام السلسلة في هذا الشهر: ${kept}` : `Streak days this month: ${kept}`}
      </p>
    </div>
  );
};

export default StreakCalendar;
