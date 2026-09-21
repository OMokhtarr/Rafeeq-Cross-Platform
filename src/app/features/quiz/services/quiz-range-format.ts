/**
 * RANGE FORMATTING
 *
 * Pure display helpers for advanced quiz ranges. Labels are injected rather
 * than imported so these stay testable without the i18n context or the
 * chapter-metadata cache.
 */

import type { QuizRange } from "../../../shared/models/verse.model";

export interface RangeLabels {
  juzWord: string;
  pageWord: string;
  others: string;
  juzPlural: string;
  surahPlural: string;
  pagePlural: string;
  surahName: (n: number) => string;
  toNum: (n: number) => string;
}

/** Stable identity for a range — used for dedupe and as a React key. */
export function rangeKey(range: QuizRange): string {
  switch (range.kind) {
    case "juz":
      return `juz:${range.juz}`;
    case "surah":
      return `surah:${range.surah}`;
    case "pages":
      return `pages:${range.from}-${range.to}`;
  }
}

/** One range's display text, e.g. "الجزء ٣٠" or "ص ١٠٠–١٢٠". */
export function rangeLabel(range: QuizRange, labels: RangeLabels): string {
  switch (range.kind) {
    case "juz":
      return `${labels.juzWord} ${labels.toNum(range.juz)}`;
    case "surah":
      return labels.surahName(range.surah);
    case "pages":
      return range.from === range.to
        ? `${labels.pageWord} ${labels.toNum(range.from)}`
        : `${labels.pageWord} ${labels.toNum(range.from)}–${labels.toNum(range.to)}`;
  }
}

function pluralFor(kind: QuizRange["kind"], labels: RangeLabels): string {
  if (kind === "juz") return labels.juzPlural;
  if (kind === "surah") return labels.surahPlural;
  return labels.pagePlural;
}

/**
 * The auto-name for a saved set.
 *
 * One range keeps its own label; several of one kind collapse to a count;
 * a mixed list names its first range and counts the rest. A numeric suffix is
 * appended when the result collides, so two similar sets stay distinguishable.
 */
export function deriveName(
  ranges: QuizRange[],
  labels: RangeLabels,
  existingNames: string[],
): string {
  if (ranges.length === 0) return "";

  let base: string;
  if (ranges.length === 1) {
    base = rangeLabel(ranges[0], labels);
  } else {
    const kinds = new Set(ranges.map((r) => r.kind));
    base =
      kinds.size === 1
        ? `${labels.toNum(ranges.length)} ${pluralFor(ranges[0].kind, labels)}`
        : `${rangeLabel(ranges[0], labels)} + ${labels.toNum(ranges.length - 1)} ${labels.others}`;
  }

  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base} (${labels.toNum(n)})`)) n++;
  return `${base} (${labels.toNum(n)})`;
}
