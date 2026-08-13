/**
 * The freeze explainer sheet.
 *
 * The card's meter says how many freezes are held and how to earn another; it
 * has no room to say what a freeze *is*. This sheet answers that once, on
 * demand, so the mechanic is discoverable without the card carrying a
 * paragraph of copy it would show forever.
 *
 * Deliberately reuses AccountModal rather than defining its own sheet: the
 * portal, backdrop, drag handle and slide-up are already solved there.
 */
import React from "react";
import AccountModal from "./AccountModal";
import { MAX_FREEZES } from "../../core/services/storage/streak-freeze.service";

interface Props {
  /** Freezes currently held. */
  count: number;
  lang: string;
  onClose: () => void;
}

/**
 * A leaf held in reserve — the same silhouette the week strip uses for a day a
 * freeze covered, drawn large. Inline SVG so it inherits the gold token in
 * both themes; held and spent differ by fill, so the pair reads as a count
 * without needing two separate glyphs.
 *
 * The outline is asymmetric with a curved midrib: a symmetric teardrop reads
 * as a seed or a droplet, which is the wrong plant and the wrong metaphor.
 */
const DormantLeaf: React.FC<{ held: boolean }> = ({ held }) => (
  <svg
    className={"ac-fz-leaf" + (held ? " ac-fz-leaf--held" : "")}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      d="M20 4C10 4 4 9 4 15.5c0 2 .6 3.4 1.4 4.2C9 16 12.5 13.6 17 12c-3.6 2.2-6.6 5-8.7 8.6.9.3 1.9.4 3 .4C18 21 20 12.5 20 4z"
      fill={held ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={held ? 0 : 1.4}
      strokeLinejoin="round"
    />
  </svg>
);

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
            <DormantLeaf key={i} held={i < count} />
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
