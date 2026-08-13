/**
 * What to do to earn another freeze, and whether one was recently spent.
 *
 * The count itself is not shown here: the freeze row above this in the card
 * already carries the pips and the total, and repeating them immediately below
 * showed the same number twice in the space of a few lines. What that row
 * cannot say is what to do next, so this keeps the state line — the only place
 * earning is explained — and the spend notice.
 */
import React from "react";
import {
  MAX_FREEZES,
  loadFreezePool,
  lastFrozenDate,
  type PoolId,
} from "../../core/services/storage/streak-freeze.service";
import { daysBetween, todayStr } from "../../core/utils/local-date.util";

interface Props {
  pool: PoolId;
  lang: string;
  /** Latest day with real activity, to decide if a spend notice is still news. */
  lastActiveDate: string | null;
}

/** Weekday name for the spend notice — "Thursday" reads better than a date. */
export function weekdayName(date: string, lang: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(lang === "ar" ? "ar" : "en", { weekday: "long" });
}

/**
 * The line telling the user what their freezes mean and what to do next.
 * Exported so it can be tested without a DOM renderer.
 */
export function freezeStateLine(
  pool: PoolId,
  count: number,
  lang: string,
): string {
  const activity = lang === "ar" ? "جلسة" : "session";

  if (count >= MAX_FREEZES) {
    return lang === "ar"
      ? "التجميدتان جاهزتان. يوم فائت لن يقطع سلسلتك."
      : "Both freezes ready. A missed day won't break your streak.";
  }
  if (count > 0) {
    return lang === "ar"
      ? `أكمل ${activity} إضافية اليوم لكسب أخرى.`
      : `Do an extra ${activity} today to earn another.`;
  }
  return lang === "ar"
    ? `لا تجميد متبقٍ. كل ${activity} إضافية اليوم تكسبك واحدة.`
    : `No freezes left. Every extra ${activity} today earns one back.`;
}

/**
 * Whether a spent freeze is still worth reporting: it must be more recent than
 * the user's last real activity, and recent enough to still be news. A freeze
 * never covers today, so the first activity today retires the notice on its
 * own — no extra stored state.
 */
export function shouldShowSpendNotice(
  frozen: string | null,
  lastActiveDate: string | null,
  today: string,
): boolean {
  if (frozen === null) return false;
  if (lastActiveDate !== null && daysBetween(lastActiveDate, frozen) <= 0) {
    return false;
  }
  return daysBetween(frozen, today) <= 7;
}

const StreakFreezeMeter: React.FC<Props> = ({ pool, lang, lastActiveDate }) => {
  const { count } = loadFreezePool(pool);
  const frozen = lastFrozenDate(pool);

  const showNotice = shouldShowSpendNotice(frozen, lastActiveDate, todayStr());
  const stateLine = freezeStateLine(pool, count, lang);

  return (
    <div className="ac-freeze">
      <p className="ac-freeze-state">{stateLine}</p>

      {showNotice && (
        <p className="ac-freeze-notice">
          {lang === "ar"
            ? `تجميد غطّى يوم ${weekdayName(frozen!, lang)}.`
            : `A freeze covered ${weekdayName(frozen!, lang)}.`}
        </p>
      )}
    </div>
  );
};

export default StreakFreezeMeter;
