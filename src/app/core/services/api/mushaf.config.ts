/**
 * Mushaf rendering kinds.
 *
 * Each kind selects (a) which per-word field the API should return and
 * (b) which font(s) the renderer pairs that field with. The verse-level
 * Uthmani text is always fetched too, because quizzes / search read it.
 */

export type MushafKind = "qpc_v1" | "uthmani" | "indopak" | "imlaei";

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
}

export const MUSHAFS: Record<MushafKind, MushafSpec> = {
  qpc_v1: {
    kind: "qpc_v1",
    labelAr: "مصحف المدينة (KFGQPC V1)",
    labelEn: "Madani Mushaf (KFGQPC V1)",
    wordFields: "code_v1,text_uthmani,line_number,page_number",
  },
  uthmani: {
    kind: "uthmani",
    labelAr: "النص العثماني",
    labelEn: "Uthmani text",
    wordFields: "text_uthmani,line_number,page_number",
  },
  indopak: {
    kind: "indopak",
    labelAr: "الرسم الهندي",
    labelEn: "IndoPak",
    wordFields: "text_indopak,text_uthmani,line_number,page_number",
  },
  imlaei: {
    kind: "imlaei",
    labelAr: "الإملائي",
    labelEn: "Imlaei",
    wordFields: "text_imlaei,text_uthmani,line_number,page_number",
  },
};

export const DEFAULT_MUSHAF: MushafKind = "qpc_v1";
