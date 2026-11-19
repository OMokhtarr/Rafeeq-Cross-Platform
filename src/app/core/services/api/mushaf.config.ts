/**
 * Mushaf rendering kinds.
 *
 * Each kind selects (a) which per-word field the API should return and
 * (b) which font(s) the renderer pairs that field with. The verse-level
 * Uthmani text is always fetched too, because quizzes / search read it.
 */

import type { PageLayout } from "../data/metadata.service";

export type MushafKind =
  | "qpc_v4_tajweed"
  | "uthmani"
  | "indopak"
  | "imlaei"
  | "madani_1405_tajweed";

export interface MushafSpec {
  kind: MushafKind;
  /** Human-facing label shown in Settings (Arabic). */
  labelAr: string;
  /** Human-facing label shown in Settings (English). */
  labelEn: string;
  /**
   * Comma-separated value passed to the API as `word_fields`. Always includes
   * `text_uthmani` so we have a stable Arabic string for quizzes and search,
   * regardless of which mushaf is selected.
   */
  wordFields: string;
  /**
   * Numeric Mushaf id passed to the API as `mushaf`. This selects the page
   * LAYOUT — the `line_number` the API assigns to each word — independently
   * of which text field we ask for.
   *
   * It matters: omitting it makes the API fall back to its default layout,
   * which disagrees with the V4 layout on a large share of pages (measured
   * against the live API: 9 of 16 sampled pages had at least one word on a
   * different line, page 350 had 89 of 148). Because we draw the glyphs with
   * the per-page V4 font, the line breaks must come from the V4 layout too,
   * or the page renders with lines split in the wrong places.
   *
   * Ids are from the official Mushaf table (QCF Tajweed V4 = 19, IndoPak = 3,
   * Uthmani Hafs = 4). All of these are 604-page layouts, which is what the
   * font loader and TOTAL_PAGES assume — do not use the 610/548-page IndoPak
   * variants (ids 6 and 7) without revisiting both.
   *
   * `undefined` means "send no `mushaf` param": the imlaei script has no id in
   * the published table, so we let the API pick rather than guess wrong.
   */
  mushafId?: number;
  /** Page layout (which page-start table) this kind is laid out on. */
  layout: PageLayout;
  /** How words are drawn: per-page V4 glyph fonts, or Unicode tajweed markup. */
  renderer: "v4-glyph" | "unicode-tajweed";
  /**
   * `false` draws the Mushaf in plain text and hides the Tajweed colours
   * option while it is selected. Omitted means the colours are offered.
   */
  tajweedColors?: false;
}

export const MUSHAFS: Record<MushafKind, MushafSpec> = {
  qpc_v4_tajweed: {
    kind: "qpc_v4_tajweed",
    labelAr: "مصحف المدينة ١٤٢١",
    labelEn: "Madani 1421",
    wordFields: "code_v2,text_uthmani,line_number,page_number",
    mushafId: 19,
    layout: "1421",
    renderer: "v4-glyph",
  },
  uthmani: {
    kind: "uthmani",
    labelAr: "النص العثماني",
    labelEn: "Uthmani text",
    wordFields: "text_uthmani,line_number,page_number",
    mushafId: 4,
    layout: "1421",
    renderer: "v4-glyph",
  },
  indopak: {
    kind: "indopak",
    labelAr: "الرسم الهندي",
    labelEn: "IndoPak",
    wordFields: "text_indopak,text_uthmani,line_number,page_number",
    mushafId: 3,
    layout: "1421",
    renderer: "v4-glyph",
  },
  imlaei: {
    kind: "imlaei",
    labelAr: "الإملائي",
    labelEn: "Imlaei",
    wordFields: "text_imlaei,text_uthmani,line_number,page_number",
    layout: "1421",
    renderer: "v4-glyph",
  },
  madani_1405_tajweed: {
    kind: "madani_1405_tajweed",
    labelAr: "مصحف المدينة ١٤٠٥",
    labelEn: "Madani 1405",
    // The 1421 V4 glyphs (each word's own 1421 page font, `v2_page`) laid out
    // on the 1405 lines, so the tajweed colours are exactly 1421's.
    wordFields: "code_v2,v2_page,text_uthmani,line_number,page_number",
    mushafId: 2,
    layout: "1405",
    renderer: "v4-glyph",
  },
};

/** Whether a kind offers tajweed colours (see `MushafSpec.tajweedColors`). */
export function offersTajweedColors(kind: MushafKind): boolean {
  return MUSHAFS[kind]?.tajweedColors !== false;
}

/** Numeric Mushaf id for a kind, or undefined when the API should choose. */
export function mushafIdFor(kind: MushafKind): number | undefined {
  return MUSHAFS[kind]?.mushafId;
}

/** Page layout a kind is laid out on. */
export function layoutFor(kind: MushafKind): PageLayout {
  return MUSHAFS[kind]?.layout ?? "1421";
}

/** Renderer a kind uses. */
export function rendererFor(kind: MushafKind): MushafSpec["renderer"] {
  return MUSHAFS[kind]?.renderer ?? "v4-glyph";
}

export const DEFAULT_MUSHAF: MushafKind = "madani_1405_tajweed";
