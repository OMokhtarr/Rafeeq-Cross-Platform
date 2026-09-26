/**
 * Month calendar for picking a past tracking day to view. Days with saved
 * ticks carry a dot; days after today can't be picked. Opens on the month
 * of the day currently shown.
 */
import React, { useState } from "react";
import AccountModal from "../account/AccountModal";
import { useLang } from "../../core/context/LanguageContext";
import { monthGrid, toDayKey } from "./trackerLogic";

interface Props {
  /** The day currently shown; the calendar opens on its month. */
  selected: Date;
  /** The current tracking day: nothing after it can be picked. */
  today: Date;
  /** Day keys that have at least one tick. */
  logged: Set<string>;
  /** Oldest pickable day key; null when there is no floor. */
  earliest: string | null;
  onPick: (d: Date) => void;
  onClose: () => void;
}

const TrackerCalendarSheet: React.FC<Props> = ({ selected, today, logged, earliest, onPick, onClose }) => {
  const { t, lang, isRTL } = useLang();
  const tt = t.tracker;
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  // Saturday-first in Arabic, Sunday-first in English.
  const weekStart = lang === "ar" ? 6 : 0;
  const cells = monthGrid(month.getFullYear(), month.getMonth(), weekStart);
  const todayKey = toDayKey(today);
  const selectedKey = toDayKey(selected);
  const atCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const atEarliestMonth =
    earliest !== null && toDayKey(month).slice(0, 7) <= earliest.slice(0, 7);

  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  // 4 Jan 2026 is a Sunday, so 4 + weekday offset lands on that weekday.
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2026, 0, 4 + weekStart + i)),
  );
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const chevron = (back: boolean) => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={back !== isRTL ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <AccountModal title={tt.openCalendar} onClose={onClose}>
      <div className="wt-sheet" dir={isRTL ? "rtl" : "ltr"}>
        <div className="wt-cal-head">
          <button
            className="wt-round-btn"
            onClick={() => shift(-1)}
            disabled={atEarliestMonth}
            aria-label={tt.prevMonth}
          >
            {chevron(true)}
          </button>
          <span className="wt-cal-title">{title}</span>
          <button
            className="wt-round-btn"
            onClick={() => shift(1)}
            disabled={atCurrentMonth}
            aria-label={tt.nextMonth}
          >
            {chevron(false)}
          </button>
        </div>
        <div className="wt-cal-grid">
          {dayNames.map((n, i) => (
            <span key={`h${i}`} className="wt-cal-dayname">{n}</span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const key = toDayKey(d);
            const outOfRange = key > todayKey || (earliest !== null && key < earliest);
            return (
              <button
                key={key}
                className={
                  "wt-cal-day" +
                  (key === todayKey ? " is-today" : "") +
                  (key === selectedKey ? " is-selected" : "")
                }
                disabled={outOfRange}
                onClick={() => onPick(d)}
                aria-label={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(d)}
              >
                {new Intl.NumberFormat(locale).format(d.getDate())}
                {logged.has(key) && <span className="wt-cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </AccountModal>
  );
};

export default TrackerCalendarSheet;
