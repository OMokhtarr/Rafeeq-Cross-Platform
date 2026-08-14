/**
 * The freeze mark, in one place.
 *
 * A freeze shows up on three surfaces — the day a freeze covered in the week
 * strip, the count on the freeze CTA, and the pair drawn large in the explainer
 * sheet. They were three separate glyphs before, and the sheet's comment claimed
 * it drew "the same silhouette the week strip uses" while the two had already
 * diverged. One component means that claim stays true by construction.
 *
 * Drawn as strokes rather than a silhouette: six spokes fill in to a solid blob
 * at the strip's 14px. The barbs are arcs on all three axes rather than straight
 * ticks on one — that is what separates a snowflake from an asterisk, and it
 * matters most in the sheet, where the mark is drawn at 54px and a sparse glyph
 * has nowhere to hide.
 *
 * Geometry adapted from Ionicons' `snow-outline` (MIT), scaled from its 512
 * viewBox to the 24 this codebase draws in. Inlined rather than imported: no
 * other icon here comes from the package, and inlining keeps `currentColor`
 * theming and lets each surface tune its own stroke weight.
 *
 * Size and colour come from CSS so each surface can set its own; `held` is what
 * distinguishes a freeze in hand from an empty slot in the sheet's pair.
 */
import React from "react";

interface Props {
  /** Held freezes are drawn at full strength; spent ones are dimmed by CSS. */
  held?: boolean;
  className?: string;
}

const FreezeSnowflake: React.FC<Props> = ({ held = true, className }) => (
  <svg
    className={[className, held ? "" : "is-spent"].filter(Boolean).join(" ")}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 1.5v21M14.71 3.75A5.23 5.23 0 0 1 12 4.5a5.23 5.23 0 0 1-2.71-.75M9.29 20.25a5.26 5.26 0 0 1 5.41 0M21.09 6.75L2.91 17.25M20.5 10.22a5.25 5.25 0 0 1-2.71-4.69M3.5 13.78a5.25 5.25 0 0 1 2.71 4.69M2.91 6.75l18.19 10.5M3.5 10.22a5.25 5.25 0 0 0 2.71-4.69M20.5 13.78a5.25 5.25 0 0 0-2.71 4.69"
    />
  </svg>
);

export default FreezeSnowflake;
