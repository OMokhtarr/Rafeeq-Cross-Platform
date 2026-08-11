/**
 * The freeze meter for one streak: how many freezes are held, what to do to
 * earn another, and whether one was recently spent.
 *
 * The count alone does not explain the mechanic, so the state line always says
 * what the next action is — that line is the only place freezes are explained.
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
  const activity =
    pool === "hifz"
      ? lang === "ar" ? "جلسة" : "session"
      : lang === "ar" ? "اختبار" : "quiz";

  if (count >= MAX_FREEZES) {
    return lang === "ar"
      ? "التجميدتان جاهزتان. يوم فائت لن يقطع سلسلتك."
      : "Both freezes ready. A missed day won't break your streak.";
  }
  if (count > 0) {
    return lang === "ar"
      ? `${count} من ${MAX_FREEZES}. أكمل ${activity} إضافية اليوم لكسب أخرى.`
      : `${count} of ${MAX_FREEZES} freezes. Do an extra ${activity} today to earn another.`;
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
  const label = lang === "ar" ? "تجميد السلسلة" : "Streak freezes";

  return (
    <div className="ac-freeze">
      <div
        className="ac-freeze-meter"
        role="img"
        aria-label={`${label}: ${count} / ${MAX_FREEZES}`}
      >
        {Array.from({ length: MAX_FREEZES }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={
              "ac-freeze-pip" + (i < count ? " ac-freeze-pip--held" : "")
            }
          />
        ))}
        <span className="ac-freeze-count">
          {count}/{MAX_FREEZES}
        </span>
      </div>

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
