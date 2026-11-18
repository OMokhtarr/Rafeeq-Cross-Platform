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
  | "silent";

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

const TAG = /<rule class=([A-Za-z_]+)>|<\/rule>/g;

export function parseTajweed(markup: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  // Innermost open rule wins; the data is flat today, the stack keeps a
  // nested tag from leaking its colour past its own close.
  const open: (TajweedColor | undefined)[] = [];
  const push = (text: string) => {
    if (!text) return;
    const rule = open[open.length - 1];
    segments.push(rule ? { text, rule } : { text });
  };

  let cursor = 0;
  for (const match of markup.matchAll(TAG)) {
    push(markup.slice(cursor, match.index));
    if (match[1] !== undefined) open.push(RULE_TO_COLOR[match[1]]);
    else open.pop();
    cursor = match.index! + match[0].length;
  }
  push(markup.slice(cursor));
  return segments;
}

/** The markup's text with every rule tag removed. */
export function stripTajweed(markup: string): string {
  return parseTajweed(markup)
    .map((s) => s.text)
    .join("");
}
