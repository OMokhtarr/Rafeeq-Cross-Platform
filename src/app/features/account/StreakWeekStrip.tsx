/**
 * The last seven days as a row of leaves.
 *
 * A streak is a run of consecutive days, and a bare number says nothing about
 * where the run sits or where it broke. The strip shows both: which days were
 * kept, which were covered by a freeze, and where the gaps are.
 *
 * The connector between two days is drawn only when both are active, so a gap
 * reads as a break in the branch rather than as an unbroken line with a pale
 * bead on it.
 */
import React from "react";
import type { StreakDay } from "../hifz/hifz.service";
import { todayStr } from "../../core/utils/local-date.util";

interface Props {
  days: StreakDay[];
  lang: string;
}

/** Narrow weekday initial in the user's locale — "S"/"M" in en, "ح"/"ن" in ar. */
export function weekdayInitial(date: string, lang: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(lang === "ar" ? "ar" : "en", {
    weekday: "narrow",
  });
}

const StreakWeekStrip: React.FC<Props> = ({ days, lang }) => {
  const today = todayStr();

  return (
    <div className="ac-week">
      {days.map((day, i) => {
        const prev = days[i - 1];
        // Only bridge two days that are both counted — see the file comment.
        const linked = i > 0 && day.active && prev.active;

        const cls = [
          "ac-week-day",
          day.active ? "ac-week-day--on" : "",
          day.frozen ? "ac-week-day--frozen" : "",
          day.date === today ? "ac-week-day--today" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div className="ac-week-cell" key={day.date}>
            <span className="ac-week-lbl">
              {weekdayInitial(day.date, lang)}
            </span>
            <span className="ac-week-mark">
              {linked && <span className="ac-week-link" aria-hidden="true" />}
              <span className={cls}>
                {day.active && (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {day.frozen ? (
                      /* A held, dormant day: the leaf, filled like the check
                         so both marks carry the same weight. A symmetric
                         teardrop reads as a circle at this size, so the
                         silhouette is asymmetric and the midrib is cut out of
                         the fill to make the shape legible at 15px. */
                      <>
                        <path
                          d="M20 4C10 4 4 9 4 15.5c0 2 .6 3.4 1.4 4.2C9 16 12.5 13.6 17 12c-3.6 2.2-6.6 5-8.7 8.6.9.3 1.9.4 3 .4C18 21 20 12.5 20 4z"
                          fill="currentColor"
                        />
                        <path
                          d="M17.5 7.5C13 10 9.5 13.5 7 18"
                          fill="none"
                          stroke="var(--color-bg-card)"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          opacity="0.55"
                        />
                      </>
                    ) : (
                      <path
                        d="M20 6L9 17l-5-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default StreakWeekStrip;
