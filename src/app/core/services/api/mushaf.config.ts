/**
 * Mushaf rendering kinds.
 *
 * Each kind selects (a) which per-word field the API should return and
 * (b) which font(s) the renderer pairs that field with. The verse-level
 * Uthmani text is always fetched too, because quizzes / search read it.
 */

export type MushafKind = "qpc_v4_tajweed" | "uthmani" | "indopak" | "imlaei";

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
}

export const MUSHAFS: Record<MushafKind, MushafSpec> = {
  qpc_v4_tajweed: {
    kind: "qpc_v4_tajweed",
    labelAr: "مصحف التجويد (KFGQPC V4)",
    labelEn: "Tajweed Mushaf (KFGQPC V4)",
    wordFields: "code_v2,text_uthmani,line_number,page_number",
    mushafId: 19,
  },
  uthmani: {
    kind: "uthmani",
    labelAr: "النص العثماني",
    labelEn: "Uthmani text",
    wordFields: "text_uthmani,line_number,page_number",
    mushafId: 4,
  },
  indopak: {
    kind: "indopak",
    labelAr: "الرسم الهندي",
    labelEn: "IndoPak",
    wordFields: "text_indopak,text_uthmani,line_number,page_number",
    mushafId: 3,
  },
  imlaei: {
    kind: "imlaei",
    labelAr: "الإملائي",
    labelEn: "Imlaei",
    wordFields: "text_imlaei,text_uthmani,line_number,page_number",
  },
};

/** Numeric Mushaf id for a kind, or undefined when the API should choose. */
export function mushafIdFor(kind: MushafKind): number | undefined {
  return MUSHAFS[kind]?.mushafId;
}

export const DEFAULT_MUSHAF: MushafKind = "qpc_v4_tajweed";
