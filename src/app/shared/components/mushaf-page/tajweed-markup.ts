/**
 * Tajweed markup for the Unicode (Madani 1405) Mushaf.
 *
 * The API's `text_uthmani_tajweed` marks each rule as
 * `<rule class=NAME>text</rule>` (unquoted class). We split it into text
 * segments that the page renders as plain React text children, so nothing in
 * the API string can ever become a DOM element: only that exact tag pair is
 * recognised, and anything else, `<script>` included, stays literal text.
 */

export type TajweedColor =
  | "necessary"
  | "obligatory"
  | "permissible"
  | "normal"
  | "ghunnah"
  | "qalqalah"
  | "silent"
  | "heavy";

export interface TajweedSegment {
  text: string;
  rule?: TajweedColor;
}

/** Rule class → colour group. Hexes live in tokens.css as `--tajweed-*`. */
const RULE_TO_COLOR: Readonly<Record<string, TajweedColor>> = {
  madda_necessary: "necessary",
  madda_obligatory_mottasel: "obligatory",
  madda_obligatory_monfasel: "obligatory",
  madda_permissible: "permissible",
  madda_normal: "normal",
  ghunnah: "ghunnah",
  ikhafa: "ghunnah",
  ikhafa_shafawi: "ghunnah",
  iqlab: "ghunnah",
  idgham_ghunnah: "ghunnah",
  idgham_shafawi: "ghunnah",
  qalaqah: "qalqalah",
  ham_wasl: "silent",
  laam_shamsiyah: "silent",
  slnt: "silent",
  idgham_wo_ghunnah: "silent",
  idgham_mutajanisayn: "silent",
  idgham_mutaqaribayn: "silent",
};

// Class names can be hyphenated: the API nests `custom-alef-maksora` inside
// `madda_normal` (`<rule class=madda_normal><rule class=custom-alef-maksora>ٰ
// </rule></rule>`).
const TAG = /<rule class=([A-Za-z_-]+)>|<\/rule>/g;

export function parseTajweed(markup: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  // Innermost coloured rule wins. A nested class with no colour of its own
  // (custom-alef-maksora) keeps the enclosing rule's colour; the stack stops
  // a nested tag's colour leaking past its own close.
  const open: (TajweedColor | undefined)[] = [];
  const push = (text: string) => {
    if (!text) return;
    const rule = open[open.length - 1];
    segments.push(rule ? { text, rule } : { text });
  };

  let cursor = 0;
  for (const match of markup.matchAll(TAG)) {
    push(markup.slice(cursor, match.index));
    if (match[1] !== undefined) {
      open.push(RULE_TO_COLOR[match[1]] ?? open[open.length - 1]);
    }
    else open.pop();
    cursor = match.index! + match[0].length;
  }
  push(markup.slice(cursor));
  return segments.flatMap(markHeavyLetters);
}

/**
 * The always-heavy (isti'la) letters with their vowel and Quranic marks. The
 * API tags no tafkheem rule, but the V4 (1421) fonts colour these letters, so
 * they are coloured here too, wherever no tagged rule already covers them.
 * Measured against the V4 glyphs over 26 pages, this matches 520 of 526
 * words. ر and the lam of the Name are left out on purpose: whether they are
 * heavy depends on the surrounding vowels, which this does not model.
 */
const HEAVY_LETTER = /[خصضغطقظ][ً-ٰٟۖ-ۭ]*/g;

function markHeavyLetters(seg: TajweedSegment): TajweedSegment[] {
  if (seg.rule) return [seg];
  const out: TajweedSegment[] = [];
  let cursor = 0;
  for (const match of seg.text.matchAll(HEAVY_LETTER)) {
    if (match.index! > cursor) out.push({ text: seg.text.slice(cursor, match.index) });
    out.push({ text: match[0], rule: "heavy" });
    cursor = match.index! + match[0].length;
  }
  if (cursor < seg.text.length) out.push({ text: seg.text.slice(cursor) });
  return out;
}

/** The markup's text with every rule tag removed. */
export function stripTajweed(markup: string): string {
  return parseTajweed(markup)
    .map((s) => s.text)
    .join("");
}
