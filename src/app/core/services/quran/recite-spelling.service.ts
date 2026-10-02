/**
 * RECITE SPELLING
 *
 * Word comparison for Recite Mode's mistake detection. Verse words arrive in
 * Uthmani script (`text_uthmani`), while the speech recognizer writes
 * standard modern spelling — so a plain string compare would flag hundreds
 * of correctly recited words (الكتٰب vs الكتاب, الصلوٰة vs الصلاة). This
 * module reduces a Uthmani word to a "skeleton" of letter slots, some of
 * them optional, and compares a spoken word against it with a small
 * weighted edit distance that forgives sound-alike letters but not real
 * letter changes (يعلمون vs تعلمون).
 *
 * Deliberately separate from recite-matcher.service's normalizeArabic /
 * wordsMatch: whole-Quran identify should stay forgiving; this is strict.
 */

/** One letter position of a verse word's skeleton. */
export interface Slot {
  /** Letters accepted here at no cost (already folded). */
  chars: string;
  /** May be absent from the spoken word at no cost (dagger alif, silent letter). */
  optional: boolean;
  /** Extra letters accepted at sound-alike cost (tajweed at word joins). */
  softChars?: string;
  /** May be absent at sound-alike cost (tajweed at word joins). */
  softOptional?: boolean;
}

export type Skeleton = Slot[];

export type WordVerdict = "said" | "soundAlike" | "wrong";

/** Below this Deepgram word confidence, a single real letter change is given
 *  the benefit of the doubt (likely a mishearing, not a recitation slip). */
export const LOW_CONFIDENCE = 0.6;

const HAMZA = "ء";
const ALIF = "ا";
const DAGGER_ALIF = "\u0670";
const HAMZA_ABOVE = "\u0654";
const SHADDA = "\u0651";
const SUKUN = "\u0652";
const KASRA = "\u0650";
const TATWEEL = "\u0640";
const ALIF_WASLA = "ٱ";
const SILENT_MARKS = new Set(["\u06DF", "\u06E0"]); // ۟ ۠ — letter not pronounced
/** Small letters standing for a letter the Uthmani spelling leaves out —
 *  standard spelling sometimes writes it (يحيي، داوود، النبيين، ننجي) and
 *  sometimes not (به، حوله), so each becomes an optional slot. */
const SMALL_LETTERS: Record<string, string> = {
  "\u06E5": "و", // ۥ small waw
  "\u06E6": "ي", // ۦ small yeh
  "\u06E7": "ي", // ۧ small high yeh
  "\u06E8": "ن", // ۨ small high noon (21:88)
};

/** Letters that assimilate a preceding word-final ن (idgham: يرملون), plus ب
 *  (iqlab, where the ن is heard as م). */
const NOON_JOIN_LETTERS = new Set(["ي", "ر", "م", "ل", "و", "ن", "ب"]);

/** Letter pairs the recognizer mixes up on correct recitation — forgiven as
 *  sound-alike (see the Balanced strictness decision in the design spec). */
const SOUND_ALIKE_PAIRS = [
  "صس", "ثس", "ضد", "ضظ", "دظ", "طت", "ذز", "قك", "حه",
  "عء", "عا", "ءا", "ءو", "ءي", "ته",
];
const SOUND_ALIKE = new Set<string>();
for (const [a, b] of SOUND_ALIKE_PAIRS) {
  SOUND_ALIKE.add(a + b);
  SOUND_ALIKE.add(b + a);
}

/** Folds one character to its comparison letter, or null if it is not a
 *  letter (diacritic, Quranic mark, punctuation, space). */
function foldLetter(ch: string): string | null {
  switch (ch) {
    case "أ":
    case "إ":
    case "آ":
    case "ٱ":
    case "ا":
      return ALIF;
    case "ؤ":
    case "ئ":
    case "ء":
      return HAMZA;
    case "ى":
      return "ي";
    case "ة":
      return "ه";
  }
  const c = ch.codePointAt(0)!;
  if ((c >= 0x0621 && c <= 0x063a) || (c >= 0x0641 && c <= 0x064a)) return ch;
  if (c >= 0x0660 && c <= 0x0669) return ch; // Arabic-Indic digits (ayah numbers)
  return null;
}

/**
 * Builds the skeleton of one Uthmani verse word. `nextUthmani` is the next
 * word of the same verse, if any — it enables the tajweed join rule for a
 * word-final ن.
 */
export function uthmaniSkeleton(uthmani: string, nextUthmani?: string): Skeleton {
  const slots: Slot[] = [];
  // The Uthmani character each slot came from — some rules depend on it
  // (ى vs ي both fold to ي; ٱ vs ا both fold to ا).
  const raw: string[] = [];
  const push = (slot: Slot, from: string) => {
    slots.push(slot);
    raw.push(from);
  };
  let afterTatweel = false;
  for (const ch of uthmani) {
    const last = slots[slots.length - 1];
    if (ch === TATWEEL) {
      afterTatweel = true;
      continue;
    }
    if (ch === DAGGER_ALIF) {
      // و/ى + dagger alif (الصلوٰة، هدىٰكم، التورىٰة) is written ا in
      // standard spelling — except a word-final ىٰ, which stays ى (على).
      const lastRaw = raw[raw.length - 1];
      if (last && !afterTatweel && (lastRaw === "و" || lastRaw === "ى")) {
        last.chars += ALIF;
      }
      // Vocative يـٰ (يَـٰقَوْمِ، وَيَـٰقَوْمِ، يَـٰٓأَيُّهَا) is spoken and written
      // as a separate يا — the recognizer may put it in the previous phrase.
      const atStart = slots.length === 1 || (slots.length === 2 && (raw[0] === "و" || raw[0] === "ف"));
      if (last && lastRaw === "ي" && atStart) last.softOptional = true;
      push({ chars: ALIF, optional: true }, ch);
      afterTatweel = false;
      continue;
    }
    if (ch === HAMZA_ABOVE) {
      // A hamza sitting on a tatweel (يسـَٔلونك، الـَٔاخرة) has no seat letter;
      // standard spelling writes it on ا/و/ي or leaves it out.
      if (afterTatweel || !last) push({ chars: HAMZA + "اوي", optional: true }, ch);
      afterTatweel = false;
      continue;
    }
    if (ch === SHADDA) {
      // ٱلَّيل، ٱلَّـٰتى: the article's ل merges with a root ل in Uthmani
      // spelling; standard spelling writes both (الليل، اللاتي) — but not in
      // ٱلَّذين (الذين), so the second ل is optional.
      if (last && raw[raw.length - 1] === "ل" && raw[raw.length - 2] === ALIF_WASLA) {
        push({ chars: "ل", optional: true }, ch);
      }
      continue;
    }
    if (ch === SUKUN) {
      // وَسْـَٔلوا، فَسْـَٔل: Uthmani drops the connecting alif after a
      // leading و/ف that standard spelling keeps (واسألوا، فاسأل).
      if (slots.length === 2 && (raw[0] === "و" || raw[0] === "ف")) {
        slots.splice(1, 0, { chars: ALIF, optional: true });
        raw.splice(1, 0, "");
      }
      // لْـَٔيْكَةِ: an article written without its alif (الأيكة).
      if (slots.length === 1 && raw[0] === "ل") {
        slots.unshift({ chars: ALIF, optional: true });
        raw.unshift("");
      }
      continue;
    }
    if (ch === KASRA) {
      // يُحْىِ، لَمُحْىِ: a ى carrying a kasra stands for يي (يحيي).
      if (last && raw[raw.length - 1] === "ى") push({ chars: "ي", optional: true }, ch);
      continue;
    }
    if (SILENT_MARKS.has(ch)) {
      if (last) last.optional = true;
      continue;
    }
    if (SMALL_LETTERS[ch]) {
      push({ chars: SMALL_LETTERS[ch], optional: true }, ch);
      continue;
    }
    const letter = foldLetter(ch);
    if (letter === null) continue; // tashkeel, waqf marks, spaces
    push({ chars: letter, optional: false }, ch);
    afterTatweel = false;
  }

  for (let i = 0; i < slots.length - 1; i++) {
    // ءَا (ءامنوا، ءادم) is written آ in standard spelling, which folds to ا.
    if (slots[i].chars === HAMZA && !slots[i].optional && slots[i + 1].chars === ALIF) {
      slots[i] = { chars: HAMZA + ALIF, optional: true };
    }
  }
  const final = slots[slots.length - 1];
  // A word-final alif is written ى in standard spelling (رءا/رأى، طغا/طغى).
  if (final && final.chars === ALIF && !final.optional) final.chars = ALIF + "ي";
  // Standard spelling adds an alif after a word-final plural و (جاءوا، باءوا)
  // that Uthmani spelling sometimes leaves out (جَآءُو).
  if (final && final.chars === "و" && !final.optional) push({ chars: ALIF, optional: true }, "");

  // Tajweed at the join: a word-final ن assimilates into a following
  // ي ر م ل و ن, or turns to م before ب — the recognizer may drop it or hear
  // the next letter / م instead.
  const last = slots[slots.length - 1];
  if (last && last.chars === "ن" && !last.optional && nextUthmani) {
    const next = uthmaniSkeleton(nextUthmani).find((s) => !s.optional);
    if (next && NOON_JOIN_LETTERS.has(next.chars[0])) {
      last.softChars = next.chars[0] + "م";
      last.softOptional = true;
    }
  }
  return slots;
}

/** Folds recognizer text (one word or several) to comparison letters. */
export function spokenLetters(text: string): string {
  let out = "";
  for (const ch of text) {
    const letter = foldLetter(ch);
    if (letter !== null) out += letter;
  }
  return out;
}

/** True when a verse token is never expected to be spoken: no letters at all,
 *  or only digits (an ayah-number marker carried as a word). */
export function isUnrecitable(skeleton: Skeleton): boolean {
  return !skeleton.some((s) => !s.optional && !/^[\u0660-\u0669]+$/.test(s.chars));
}

/** The skeleton's required letters as plain text (يَبْنَؤُمَّ → يبنءم). */
export function plainLetters(skeleton: Skeleton): string {
  return skeleton
    .filter((s) => !s.optional)
    .map((s) => s.chars[0])
    .join("");
}

/** Joins two spoken words for comparison against one verse word. Returns the
 *  candidates to try: plain concatenation, plus — when the first word ends in
 *  ن — the form with that ن assimilated (أن لا → أَلَّا، من ما → مِمَّا،
 *  وأن لو → وَأَلَّوِ). */
export function joinedSpellings(first: string, second: string): string[] {
  const a = spokenLetters(first);
  const b = spokenLetters(second);
  return a.endsWith("ن") ? [a + b, a.slice(0, -1) + b] : [a + b];
}

interface EditCost {
  total: number;
  hard: number;
  soft: number;
}

const SOFT_WEIGHT = 0.3;

function substitution(slot: Slot, ch: string): "match" | "soft" | "hard" {
  if (slot.chars.includes(ch)) return "match";
  if (slot.softChars?.includes(ch)) return "soft";
  for (const c of slot.chars) if (SOUND_ALIKE.has(c + ch)) return "soft";
  return "hard";
}

function deletion(slot: Slot): "free" | "soft" | "hard" {
  if (slot.optional) return "free";
  if (slot.softOptional || slot.chars === HAMZA) return "soft";
  return "hard";
}

function add(base: EditCost, kind: "match" | "free" | "soft" | "hard"): EditCost {
  if (kind === "soft") return { total: base.total + SOFT_WEIGHT, hard: base.hard, soft: base.soft + 1 };
  if (kind === "hard") return { total: base.total + 1, hard: base.hard + 1, soft: base.soft };
  return base;
}

function better(a: EditCost, b: EditCost): boolean {
  return a.total < b.total - 1e-9 || (Math.abs(a.total - b.total) < 1e-9 && a.hard < b.hard);
}

/** Weighted edit distance between a skeleton and spoken letters. */
function editCost(slots: Skeleton, spoken: string): EditCost {
  const m = slots.length;
  const n = spoken.length;
  let prev: EditCost[] = new Array(n + 1);
  prev[0] = { total: 0, hard: 0, soft: 0 };
  // Extra spoken letters before any slot: hamza is a soft insertion.
  for (let j = 1; j <= n; j++) prev[j] = add(prev[j - 1], spoken[j - 1] === HAMZA ? "soft" : "hard");
  for (let i = 1; i <= m; i++) {
    const curr: EditCost[] = new Array(n + 1);
    curr[0] = add(prev[0], deletion(slots[i - 1]));
    for (let j = 1; j <= n; j++) {
      let best = add(prev[j - 1], substitution(slots[i - 1], spoken[j - 1]));
      const del = add(prev[j], deletion(slots[i - 1]));
      if (better(del, best)) best = del;
      const ins = add(curr[j - 1], spoken[j - 1] === HAMZA ? "soft" : "hard");
      if (better(ins, best)) best = ins;
      curr[j] = best;
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Classifies a spoken word (recognizer text, already one word or a
 * concatenation for merged/split alignment) against a verse word skeleton.
 * `confidence` is Deepgram's per-word confidence when known.
 */
export function compareWord(expected: Skeleton, spoken: string, confidence?: number): WordVerdict {
  const letters = spokenLetters(spoken);
  if (!letters) return "wrong";
  const cost = editCost(expected, letters);
  if (cost.hard === 0 && cost.soft === 0) return "said";
  const coreLength = expected.filter((s) => !s.optional).length;
  const softLimit = coreLength <= 4 ? 1 : 2;
  if (cost.hard === 0 && cost.soft <= softLimit) return "soundAlike";
  if (cost.hard === 1 && cost.soft === 0 && confidence !== undefined && confidence < LOW_CONFIDENCE) {
    return "soundAlike";
  }
  return "wrong";
}
