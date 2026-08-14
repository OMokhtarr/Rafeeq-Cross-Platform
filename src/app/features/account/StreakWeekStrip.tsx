/**
 * Seven days centred on today, as a row of marks.
 *
 * A streak is a run of consecutive days, and a bare number says nothing about
 * where the run sits or where it broke. The strip shows both: which days were
 * kept, which were covered by a freeze, and where the gaps are — with the days
 * ahead drawn as plain wells so the run has somewhere to continue into.
 *
 * The connector between two days is drawn only when both are active, so a gap
 * reads as a break in the branch rather than as an unbroken line with a pale
 * bead on it.
 */
import React from "react";
import type { StreakDay } from "../hifz/hifz.service";
import { todayStr } from "../../core/utils/local-date.util";
import FreezeSnowflake from "./FreezeSnowflake";

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
          day.future ? "ac-week-day--future" : "",
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
                {day.active &&
                  (day.frozen ? (
                    <FreezeSnowflake />
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M20 6L9 17l-5-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ))}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default StreakWeekStrip;
