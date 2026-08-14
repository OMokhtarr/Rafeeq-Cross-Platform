/**
 * The freeze explainer sheet.
 *
 * The card's meter says how many freezes are held and how to earn another; it
 * has no room to say what a freeze *is*. This sheet answers that once, on
 * demand, so the mechanic is discoverable without the card carrying a
 * paragraph of copy it would show forever.
 *
 * The pair is drawn with the shared FreezeSnowflake at MAX_FREEZES, one slot
 * per freeze, dimmed when spent — so the sheet, the CTA and the week strip all
 * show the user the same mark for the same thing.
 *
 * Deliberately reuses AccountModal rather than defining its own sheet: the
 * portal, backdrop, drag handle and slide-up are already solved there.
 */
import React from "react";
import AccountModal from "./AccountModal";
import { MAX_FREEZES } from "../../core/services/storage/streak-freeze.service";
import FreezeSnowflake from "./FreezeSnowflake";

interface Props {
  /** Freezes currently held. */
  count: number;
  lang: string;
  onClose: () => void;
}

const StreakFreezeSheet: React.FC<Props> = ({ count, lang, onClose }) => {
  const ar = lang === "ar";

  const title = ar ? "تجميد السلسلة" : "Streak freezes";
  const headline = ar ? "تجميد السلسلة" : "streak freezes";
  const available = ar
    ? `لديك ${count} ${count === 1 ? "تجميد متاح" : "تجميدات متاحة"}`
    : `You have ${count} available`;
  const blurb = ar
    ? "يحفظ سلسلتك إذا فاتك يوم."
    : "Keeps your streak if you miss a day.";
  const autoNote = ar ? "تُطبَّق تلقائياً" : "Applied automatically";
  const earnNote = ar
    ? "أكمل أكثر من جلسة في اليوم لكسب تجميد."
    : "Finish more than one session in a day to earn one.";
  const got = ar ? "فهمت" : "Got it";

  return (
    <AccountModal title={title} onClose={onClose}>
      <div className="ac-fz-sheet">
        <div
          className="ac-fz-mark"
          role="img"
          aria-label={`${count} / ${MAX_FREEZES}`}
        >
          {Array.from({ length: MAX_FREEZES }, (_, i) => (
            <FreezeSnowflake key={i} className="ac-fz-flake" held={i < count} />
          ))}
        </div>

        <p className="ac-fz-count">{available}</p>
        <p className="ac-fz-headline">{headline}</p>
        <p className="ac-fz-blurb">{blurb}</p>

        <div className="ac-fz-notes">
          <p className="ac-fz-note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M20 6L9 17l-5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{autoNote}</span>
          </p>
          <p className="ac-fz-note ac-fz-note--muted">{earnNote}</p>
        </div>

        <button className="ac-fz-got" onClick={onClose}>
          {got}
        </button>
      </div>
    </AccountModal>
  );
};

export default StreakFreezeSheet;
