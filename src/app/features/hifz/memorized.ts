/**
 * The "what is memorized" list: adding to it and editing its page ranges.
 *
 * A page range belongs to one surah (the add sheet picks the surah first).
 * Adding pages that overlap or touch a range of the same surah widens that
 * row instead of adding another, pages already inside a whole surah or juz
 * row add nothing, and a range that grows to the whole surah becomes a surah
 * row.
 */
import type { MemorizedUnit } from "./hifz.service";
import { juzToPages } from "./hifz.service";

type PagesUnit = Extract<MemorizedUnit, { type: "pages" }>;

/** First and last page of a surah. */
export type SurahBounds = (surah: number) => { from: number; to: number };

/**
 * The surah a page-range row was picked from. Rows saved before the surah was
 * stored fall back to the surah holding the whole range — the one starting
 * latest when a shared page fits two. Null when no single surah holds it.
 */
export function pagesUnitSurah(u: PagesUnit, bounds: SurahBounds): number | null {
  if (u.surah) return u.surah;
  for (let s = 114; s >= 1; s--) {
    const b = bounds(s);
    if (b.from <= u.from && u.to <= b.to) return s;
  }
  return null;
}

function covers(u: MemorizedUnit, from: number, to: number, bounds: SurahBounds): boolean {
  if (u.type === "pages") return false;
  const span = u.type === "juz" ? juzToPages(u.juz) : bounds(u.surah);
  return span.from <= from && to <= span.to;
}

/**
 * Puts a page range for `surah` into the list at `at` (or the end), merged
 * with the rows of the same surah it overlaps or touches.
 */
function placePages(
  list: MemorizedUnit[],
  surah: number,
  range: { from: number; to: number },
  at: number,
  bounds: SurahBounds,
): MemorizedUnit[] {
  if (list.some((u) => covers(u, range.from, range.to, bounds))) return list;
  let { from, to } = range;
  let insertAt = at;
  const kept: MemorizedUnit[] = [];
  list.forEach((u) => {
    const joins =
      u.type === "pages" &&
      pagesUnitSurah(u, bounds) === surah &&
      u.from <= to + 1 &&
      from <= u.to + 1;
    if (!joins) {
      kept.push(u);
      return;
    }
    from = Math.min(from, u.from);
    to = Math.max(to, u.to);
    // The merged row takes the place of the first row it absorbs.
    insertAt = Math.min(insertAt, kept.length);
  });
  const whole = bounds(surah);
  const unit: MemorizedUnit =
    from <= whole.from && to >= whole.to
      ? { type: "surah", surah }
      : { type: "pages", surah, from, to };
  if (unit.type === "surah" && kept.some((u) => u.type === "surah" && u.surah === surah)) {
    return kept;
  }
  const out = [...kept];
  out.splice(Math.min(insertAt, out.length), 0, unit);
  return out;
}

/** Adds units to the list, without duplicates (see the file comment). */
export function addMemorized(
  list: MemorizedUnit[],
  added: MemorizedUnit[],
  bounds: SurahBounds,
): MemorizedUnit[] {
  let out = list;
  for (const a of added) {
    if (a.type === "juz") {
      if (!out.some((u) => u.type === "juz" && u.juz === a.juz)) out = [...out, a];
    } else if (a.type === "surah") {
      if (out.some((u) => u.type === "surah" && u.surah === a.surah)) continue;
      // The whole surah replaces its page ranges, at the first one's place.
      const firstRange = out.findIndex(
        (u) => u.type === "pages" && pagesUnitSurah(u, bounds) === a.surah,
      );
      const rest = out.filter(
        (u) => !(u.type === "pages" && pagesUnitSurah(u, bounds) === a.surah),
      );
      out = [...rest];
      out.splice(firstRange === -1 ? out.length : firstRange, 0, a);
    } else {
      const surah = pagesUnitSurah(a, bounds);
      out =
        surah === null
          ? [...out, a]
          : placePages(out, surah, { from: a.from, to: a.to }, out.length, bounds);
    }
  }
  return out;
}

/** Changes the pages of the range row at `index`, keeping its place. */
export function editMemorizedRange(
  list: MemorizedUnit[],
  index: number,
  range: { from: number; to: number },
  bounds: SurahBounds,
): MemorizedUnit[] {
  const row = list[index];
  if (!row || row.type !== "pages") return list;
  const surah = pagesUnitSurah(row, bounds);
  const from = Math.min(range.from, range.to);
  const to = Math.max(range.from, range.to);
  const rest = list.filter((_, i) => i !== index);
  if (surah === null) {
    rest.splice(index, 0, { type: "pages", from, to });
    return rest;
  }
  return placePages(rest, surah, { from, to }, index, bounds);
}
