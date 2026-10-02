# Recite Mode Mistake Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In recite mode — the Mushaf viewer and the recite quizzes — show words the reciter skipped or said wrongly in red, instead of revealing them as if recited.

**Architecture:** Two new pure modules do the work. `recite-spelling.service.ts` reduces a Uthmani word to a comparable skeleton and classifies a spoken word as *said*, *sound-alike* or *wrong*. `recite-aligner.service.ts` aligns each Deepgram phrase against the verse text by dynamic programming, from a committed state, into said / missed / wrong / extra steps; it keeps the red-word marks and wraps everything in a tracker that both the Mushaf driver and the quiz use. The Deepgram driver, identify session, `useReciteMode`, `MushafPage` and the quiz hook and pages are rewired onto the tracker, and the old greedy `matchFromPosition` is deleted.

**Tech Stack:** TypeScript + React 18 (Create React App / `react-scripts`), Ionic + Capacitor, Jest through `react-scripts test`, Deepgram nova-3 streaming.

**Spec:** `docs/superpowers/specs/2026-10-01-recite-mistake-detection-design.md` — read its "Amendments from planning" section; it records the decisions this plan's code implements.

**Already verified:** every code block below was applied to a scratch copy of `src/` before this plan was written. `npx tsc --noEmit` exits 0, and the 4 new test files pass (81 tests). Whole-Quran checks on the same code (appendix): of 70,344 words, 70,272 *said*, 71 *sound-alike*, 1 *wrong* (18:77, handled as lenient); all 6,216 verses recited cleanly produce no red words; injected mistakes in 1,000 random verses — 1,000/1,000 skipped words and 998/1,000 wrong words marked exactly.

## Global Constraints

- Work only in the worktree `.claude/worktrees/recite-mistake-detection` (branch `recite-mistake-detection`, off `main` at 7286c01). All paths below are relative to it. Never switch branches or stage files in the shared checkout, which another session uses.
- Test command (worktree): `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern <pattern>`. The explicit `--testMatch` is required: on Windows, Jest turns the `\.claude` path segment into an escaped dot and finds no tests without it.
- Test baseline: 34 of 36 suites pass. The 9 failing tests in `trackerLogic.test.ts` and `prayer-times.service.test.ts` fail on `main` too. No new failures.
- Type gate: `npx tsc --noEmit -p tsconfig.json` exits 0. With `--noUnusedLocals --noUnusedParameters`, the only hits in touched files are the pre-existing `getSurahStartPage` / `isSurahStart` (`PageViewer.tsx`) and `showBismillah` (`MushafContextViewer.tsx`).
- No ESLint disable comments of any kind (CLAUDE.md).
- Don't run `npm run build`, `npx cap sync` or Gradle — the user builds the app.
- Deepgram stays the only speech engine. Whole-Quran identify is unchanged: `normalizeArabic`, `wordsMatch`, `matchTranscript`, `scoreCorpusAnchors`, `findVerseByStartingPhrase`.
- Aligner constants: `SOUND_ALIKE_COST` 0.25, `WRONG_COST` 1.0, `MISSED_COST` 0.8, `EXTRA_COST` 0.7, `RESTART_COST_PER_WORD` 0.15, `RESTART_WINDOW` 10, `LOOKAHEAD` 60, `CONFIRM_AFTER` 2, `RESUME_MIN_SAID` 3, `LENIENT_TOKEN_COST` 0.05, `JOIN_COST` 0.05; `LOW_CONFIDENCE` 0.6 in the spelling module.
- Red words: `#d32f2f` by day, `#ff6b6b` under `[data-theme="night"]`, plus a dotted underline. Classes `mushaf-word-mistake`, `aa-mistake-inline`, `mst-mistake-inline`. (Designed with the frontend-design skill during planning: 5.0:1 contrast on the white page, 6.3:1 on `#1a1a1a`; the underline is the non-colour cue for colour-blind readers.)
- Mistake keys: the tracker's marks are keyed `sura:aya:wordIndex` (`wordIndex` as in `RecitePosition`); `MushafPage` and the context viewer take `sura:aya:position` keys (`VerseWord.position`), converted with `markPositionKeys`.
- Every commit message ends with a second paragraph `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`).

## Review Focus

What the tests below don't exercise and is most likely to bite someone using the app, most likely first:

1. **Deepgram mishearing correct recitation on a real device** — expected: false red words are rare, and each shows up in a `[recite-align]` log line. No unit test can pin Deepgram's behaviour; Task 7's device checklist covers it, and any misfire becomes a fixture test in Task 2's test file.
2. **Tapping "reveal next word" while recording, then reciting on** — expected: the tapped word is not later marked as skipped. Pinned by Task 2's test "commits on a final and keeps marks across a reset to a new cursor" (`tracker.reset` is what `moveCursor` calls); wired in Task 4.
3. **Reciting across a page turn** — expected: tracking continues into the next page without marks. Pinned by Task 2's test "marks a wrong verse ending once the next verse is recited, across a page boundary" (2:5 → 2:6 crosses pages 2 → 3).
4. **A re-search relocating forward past a forgotten verse** — expected: the skipped words turn red; a backward relocation marks nothing. Pinned by Task 2's `markSkipped` test; wired in Task 4's `beginOnPage`.
5. **Moving to the next quiz question** — expected: the previous attempt's red words never show on the new question. Logic pinned by Task 5's `quizProgress` tests; the `reset()` on Next/Skip/typed answer is wired in Task 5 and checked on device in Task 7.

---

### Task 1: Uthmani spelling and word verdicts

**Files:**
- Create: `src/app/core/services/quran/recite-spelling.service.ts`
- Test: `src/app/core/services/quran/__tests__/recite-spelling.service.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exports of `recite-spelling.service.ts`):
  - `interface Slot { chars: string; optional: boolean; softChars?: string; softOptional?: boolean }`
  - `type Skeleton = Slot[]`
  - `type WordVerdict = "said" | "soundAlike" | "wrong"`
  - `const LOW_CONFIDENCE = 0.6`
  - `uthmaniSkeleton(uthmani: string, nextUthmani?: string): Skeleton`
  - `spokenLetters(text: string): string`
  - `isUnrecitable(skeleton: Skeleton): boolean`
  - `plainLetters(skeleton: Skeleton): string`
  - `joinedSpellings(first: string, second: string): string[]`
  - `compareWord(expected: Skeleton, spoken: string, confidence?: number): WordVerdict`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/quran/__tests__/recite-spelling.service.test.ts`:

```ts
import {
  compareWord,
  isUnrecitable,
  joinedSpellings,
  plainLetters,
  spokenLetters,
  uthmaniSkeleton,
} from "../recite-spelling.service";

const verdict = (uthmani: string, spoken: string, next?: string, confidence?: number) =>
  compareWord(uthmaniSkeleton(uthmani, next), spoken, confidence);

describe("Uthmani spelling vs the recognizer's standard spelling", () => {
  it.each([
    ["ٱلْكِتَـٰبُ", "الكتاب"], // dagger alif (after tatweel) may be written ا
    ["ٱلْكِتَـٰبُ", "الكتب"], // …or left out
    ["ٱلْعَـٰلَمِينَ", "العالمين"],
    ["رَزَقْنَـٰهُمْ", "رزقناهم"],
    ["ٱلصَّلَوٰةَ", "الصلاة"], // و + dagger alif is written ا
    ["هَدَىٰكُمْ", "هداكم"], // ى + dagger alif mid-word is written ا
    ["عَلَىٰ", "على"], // …but a word-final ىٰ stays ى
    ["أُو۟لَـٰٓئِكَ", "أولئك"], // silent-letter mark
    ["مِا۟ئَةَ", "مائة"],
    ["مِا۟ئَةَ", "مئة"],
    ["حَوْلَهُۥ", "حوله"], // small waw
    ["بِهِۦ", "به"], // small yeh
    ["دَاوُۥدُ", "داوود"],
    ["يُحْىِۦ", "يحيي"],
    ["يُحْىِ", "يحيي"], // ى carrying a kasra stands for يي
    ["ٱلنَّبِيِّـۧنَ", "النبيين"], // small high yeh
    ["إِبْرَٰهِـۧمَ", "إبراهيم"],
    ["نُـۨجِى", "ننجي"], // small high noon (21:88)
    ["وَبِٱلْـَٔاخِرَةِ", "وبالآخرة"], // hamza on a tatweel
    ["يَسْـَٔلُونَكَ", "يسألونك"],
    ["ٱلَّيْلِ", "الليل"], // article ل merged with a root ل
    ["ٱلَّذِينَ", "الذين"],
    ["وَبَآءُو", "وباءوا"], // plural و without its alif
    ["ءَامَنُوا۟", "آمنوا"], // ءَا is written آ
    ["وَسْـَٔلُوا۟", "واسألوا"], // connecting alif after و
    ["رَءَا", "رأى"], // final alif written ى
    ["لْـَٔيْكَةِ", "الأيكة"],
    ["يَـٰٓأَيُّهَا", "ياأيها"],
  ])("%s ↔ %s is said", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("said");
  });

  it.each([
    ["يَعْلَمُونَ", "تعلمون"],
    ["رَبُّكَ", "ربكم"],
    ["عَلَيْهِمْ", "عليكم"],
    ["فِيهِ", "فيها"],
    ["قَالَ", "قل"],
    ["عَلِيمٌ", "عظيم"],
    ["وَيُقِيمُونَ", "يقيمون"], // a dropped leading و
    ["ٱلْمُفْلِحُونَ", "الخاسرون"],
  ])("%s vs %s is a real slip", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("wrong");
  });

  it.each([
    ["ٱلصِّرَٰطَ", "السراط"], // ص/س
    ["وَيَبْصُۜطُ", "ويبسط"],
    ["ضَلَّ", "دل"], // ض/د
    ["ٱلْحَمْدُ", "الهمد"], // ح/ه
    ["يَـٰٓأَيُّهَا", "أيها"], // vocative يا heard in the previous phrase
  ])("%s vs %s is sound-alike", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("soundAlike");
  });

  it("forgives a word-final ن assimilated into the next word", () => {
    expect(verdict("مِن", "مر", "رَّبِّهِمْ")).toBe("soundAlike");
    expect(verdict("مِن", "م", "رَّبِّهِمْ")).toBe("soundAlike");
    expect(verdict("مِن", "مر")).toBe("wrong");
  });

  it("gives one real letter change the benefit of the doubt only when Deepgram was unsure", () => {
    expect(verdict("يَعْلَمُونَ", "تعلمون", undefined, 0.4)).toBe("soundAlike");
    expect(verdict("يَعْلَمُونَ", "تعلمون", undefined, 0.9)).toBe("wrong");
    expect(verdict("يَعْلَمُونَ", "تعلمو", undefined, 0.4)).toBe("wrong");
  });

  it("treats ayah markers and bare marks as unrecitable", () => {
    expect(isUnrecitable(uthmaniSkeleton("٢٥٥"))).toBe(true);
    expect(isUnrecitable(uthmaniSkeleton("ۖ"))).toBe(true);
    expect(isUnrecitable(uthmaniSkeleton("ٱللَّهُ"))).toBe(false);
  });

  it("joins two spoken words, also with an assimilated ن", () => {
    expect(joinedSpellings("أن", "لا")).toEqual(["انلا", "الا"]);
    expect(joinedSpellings("يا", "أيها")).toEqual(["ياايها"]);
  });

  it("reduces text to comparison letters", () => {
    expect(spokenLetters("الآخرة، مَالِكِ")).toBe("الاخرهمالك");
    expect(plainLetters(uthmaniSkeleton("يَبْنَؤُمَّ"))).toBe("يبنءم");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern recite-spelling`
Expected: FAIL — `Cannot find module '../recite-spelling.service'`.

- [ ] **Step 3: Implement the module**

Create `src/app/core/services/quran/recite-spelling.service.ts`. The mark constants are written as `\uXXXX` escapes on purpose — raw combining marks inside string literals are invisible in editors:

```ts
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
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern recite-spelling`
Expected: PASS — 46 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/quran/recite-spelling.service.ts src/app/core/services/quran/__tests__/recite-spelling.service.test.ts
git commit -m "Add Uthmani spelling comparison for recite mistake detection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Phrase alignment, red-word marks and the tracker

**Files:**
- Create: `src/app/core/services/quran/recite-aligner.service.ts`
- Test: `src/app/core/services/quran/__tests__/recite-aligner.service.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `Verse` / `VerseWord` from `src/app/shared/models/verse.model.ts`; `RecitePosition` (`{ sura; aya; wordIndex }`) from `src/app/core/services/quran/recite-matcher.service.ts`.
- Produces (exports of `recite-aligner.service.ts`):
  - Constants `SOUND_ALIKE_COST`, `WRONG_COST`, `MISSED_COST`, `EXTRA_COST`, `RESTART_COST_PER_WORD`, `RESTART_WINDOW`, `LOOKAHEAD`, `CONFIRM_AFTER`, `RESUME_MIN_SAID`.
  - `interface ExpectedWord { sura; aya; wordIndex; position; text; skeleton; lenient }`
  - `interface SpokenWord { text: string; confidence?: number }`
  - `type MarkKind = "missed" | "wrong"`, `interface Mark { kind: MarkKind; position: number }`, `type Marks = ReadonlyMap<string, Mark>` (keys `sura:aya:wordIndex`)
  - `interface TrackerState { cursor: RecitePosition; marks: Marks }`
  - `type StepKind`, `interface AlignStep { kind; expected: ExpectedWord[]; spoken: SpokenWord[] }`
  - `interface AlignResult { state: TrackerState; newSaid: number; saidTotal: number; added: string[]; cleared: string[]; steps: AlignStep[] }`
  - `interface AlignOptions { freeStartUntil?: RecitePosition; protectBefore?: RecitePosition }`
  - `buildExpectedWords(verses: Verse[]): ExpectedWord[]`
  - `wordKey(w: { sura; aya; wordIndex }): string`
  - `spokenWordsFrom(text: string, words?: { word: string; confidence: number }[]): SpokenWord[]`
  - `alignPhrase(state: TrackerState, spoken: SpokenWord[], verses: Verse[], options?: AlignOptions): AlignResult`
  - `interface ReciteTracker { committed(): TrackerState; onPartial(spoken, verses): AlignResult; onFinal(spoken, verses): AlignResult; reset(state: TrackerState, options?: AlignOptions): void }`
  - `createReciteTracker(initial: TrackerState, options?: AlignOptions): ReciteTracker`
  - `markSkipped(marks: Marks, verses: Verse[], from: RecitePosition, to: RecitePosition): Marks`
  - `markPositionKeys(marks: Marks): Set<string>` (keys `sura:aya:position`)
  - `formatAlignLog(result: AlignResult): string`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/quran/__tests__/recite-aligner.service.test.ts`. The fixture is the app's real page-data form — Quran.com `text_uthmani`, word-aligned with its standard spelling — and `recite()` feeds phrases the way Deepgram does (word-by-word partials, then a final):

```ts
import type { Verse, VerseWord } from "../../../../shared/models/verse.model";
import type { RecitePosition } from "../recite-matcher.service";
import {
  alignPhrase,
  createReciteTracker,
  markPositionKeys,
  markSkipped,
  spokenWordsFrom,
  type AlignOptions,
  type TrackerState,
} from "../recite-aligner.service";

// Verse text exactly as the app's page data carries it (Quran.com
// text_uthmani), word-aligned with Quran.com's standard spelling. "|"
// separates words because a word can carry a pause mark after a space.
const FIXTURE: Record<string, { uthmani: string; standard: string }> = {
  "2:1": {
    uthmani: "الٓمٓ",
    standard: "الم",
  },
  "2:2": {
    uthmani: "ذَٰلِكَ|ٱلْكِتَـٰبُ|لَا|رَيْبَ ۛ|فِيهِ ۛ|هُدًۭى|لِّلْمُتَّقِينَ",
    standard: "ذَٰلِكَ|الْكِتَابُ|لَا|رَيْبَ ۛ|فِيهِ ۛ|هُدًى|لِّلْمُتَّقِينَ",
  },
  "2:3": {
    uthmani: "ٱلَّذِينَ|يُؤْمِنُونَ|بِٱلْغَيْبِ|وَيُقِيمُونَ|ٱلصَّلَوٰةَ|وَمِمَّا|رَزَقْنَـٰهُمْ|يُنفِقُونَ",
    standard: "الَّذِينَ|يُؤْمِنُونَ|بِالْغَيْبِ|وَيُقِيمُونَ|الصَّلَاةَ|وَمِمَّا|رَزَقْنَاهُمْ|يُنفِقُونَ",
  },
  "2:4": {
    uthmani: "وَٱلَّذِينَ|يُؤْمِنُونَ|بِمَآ|أُنزِلَ|إِلَيْكَ|وَمَآ|أُنزِلَ|مِن|قَبْلِكَ|وَبِٱلْـَٔاخِرَةِ|هُمْ|يُوقِنُونَ",
    standard: "وَالَّذِينَ|يُؤْمِنُونَ|بِمَا|أُنزِلَ|إِلَيْكَ|وَمَا|أُنزِلَ|مِن|قَبْلِكَ|وَبِالْآخِرَةِ|هُمْ|يُوقِنُونَ",
  },
  "2:5": {
    uthmani: "أُو۟لَـٰٓئِكَ|عَلَىٰ|هُدًۭى|مِّن|رَّبِّهِمْ ۖ|وَأُو۟لَـٰٓئِكَ|هُمُ|ٱلْمُفْلِحُونَ",
    standard: "أُولَٰئِكَ|عَلَىٰ|هُدًى|مِّن|رَّبِّهِمْ ۖ|وَأُولَٰئِكَ|هُمُ|الْمُفْلِحُونَ",
  },
  "2:6": {
    uthmani: "إِنَّ|ٱلَّذِينَ|كَفَرُوا۟|سَوَآءٌ|عَلَيْهِمْ|ءَأَنذَرْتَهُمْ|أَمْ|لَمْ|تُنذِرْهُمْ|لَا|يُؤْمِنُونَ",
    standard: "إِنَّ|الَّذِينَ|كَفَرُوا|سَوَاءٌ|عَلَيْهِمْ|أَأَنذَرْتَهُمْ|أَمْ|لَمْ|تُنذِرْهُمْ|لَا|يُؤْمِنُونَ",
  },
  "2:7": {
    uthmani: "خَتَمَ|ٱللَّهُ|عَلَىٰ|قُلُوبِهِمْ|وَعَلَىٰ|سَمْعِهِمْ ۖ|وَعَلَىٰٓ|أَبْصَـٰرِهِمْ|غِشَـٰوَةٌۭ ۖ|وَلَهُمْ|عَذَابٌ|عَظِيمٌۭ",
    standard: "خَتَمَ|اللَّهُ|عَلَىٰ|قُلُوبِهِمْ|وَعَلَىٰ|سَمْعِهِمْ ۖ|وَعَلَىٰ|أَبْصَارِهِمْ|غِشَاوَةٌ ۖ|وَلَهُمْ|عَذَابٌ|عَظِيمٌ",
  },
  "2:255": {
    uthmani: "ٱللَّهُ|لَآ|إِلَـٰهَ|إِلَّا|هُوَ|ٱلْحَىُّ|ٱلْقَيُّومُ ۚ|لَا|تَأْخُذُهُۥ|سِنَةٌۭ|وَلَا|نَوْمٌۭ ۚ|لَّهُۥ|مَا|فِى|ٱلسَّمَـٰوَٰتِ|وَمَا|فِى|ٱلْأَرْضِ ۗ|مَن|ذَا|ٱلَّذِى|يَشْفَعُ|عِندَهُۥٓ|إِلَّا|بِإِذْنِهِۦ ۚ|يَعْلَمُ|مَا|بَيْنَ|أَيْدِيهِمْ|وَمَا|خَلْفَهُمْ ۖ|وَلَا|يُحِيطُونَ|بِشَىْءٍۢ|مِّنْ|عِلْمِهِۦٓ|إِلَّا|بِمَا|شَآءَ ۚ|وَسِعَ|كُرْسِيُّهُ|ٱلسَّمَـٰوَٰتِ|وَٱلْأَرْضَ ۖ|وَلَا|يَـُٔودُهُۥ|حِفْظُهُمَا ۚ|وَهُوَ|ٱلْعَلِىُّ|ٱلْعَظِيمُ",
    standard: "اللَّهُ|لَا|إِلَٰهَ|إِلَّا|هُوَ|الْحَيُّ|الْقَيُّومُ ۚ|لَا|تَأْخُذُهُ|سِنَةٌ|وَلَا|نَوْمٌ ۚ|لَّهُ|مَا|فِي|السَّمَاوَاتِ|وَمَا|فِي|الْأَرْضِ ۗ|مَن|ذَا|الَّذِي|يَشْفَعُ|عِندَهُ|إِلَّا|بِإِذْنِهِ ۚ|يَعْلَمُ|مَا|بَيْنَ|أَيْدِيهِمْ|وَمَا|خَلْفَهُمْ ۖ|وَلَا|يُحِيطُونَ|بِشَيْءٍ|مِّنْ|عِلْمِهِ|إِلَّا|بِمَا|شَاءَ ۚ|وَسِعَ|كُرْسِيُّهُ|السَّمَاوَاتِ|وَالْأَرْضَ ۖ|وَلَا|يَئُودُهُ|حِفْظُهُمَا ۚ|وَهُوَ|الْعَلِيُّ|الْعَظِيمُ",
  },
  "78:8": {
    uthmani: "وَخَلَقْنَـٰكُمْ|أَزْوَٰجًۭا",
    standard: "وَخَلَقْنَاكُمْ|أَزْوَاجًا",
  },
  "78:9": {
    uthmani: "وَجَعَلْنَا|نَوْمَكُمْ|سُبَاتًۭا",
    standard: "وَجَعَلْنَا|نَوْمَكُمْ|سُبَاتًا",
  },
  "78:10": {
    uthmani: "وَجَعَلْنَا|ٱلَّيْلَ|لِبَاسًۭا",
    standard: "وَجَعَلْنَا|اللَّيْلَ|لِبَاسًا",
  },
  "78:11": {
    uthmani: "وَجَعَلْنَا|ٱلنَّهَارَ|مَعَاشًۭا",
    standard: "وَجَعَلْنَا|النَّهَارَ|مَعَاشًا",
  },
  "78:12": {
    uthmani: "وَبَنَيْنَا|فَوْقَكُمْ|سَبْعًۭا|شِدَادًۭا",
    standard: "وَبَنَيْنَا|فَوْقَكُمْ|سَبْعًا|شِدَادًا",
  },
  "9:113": {
    uthmani: "مَا|كَانَ|لِلنَّبِىِّ|وَٱلَّذِينَ|ءَامَنُوٓا۟|أَن|يَسْتَغْفِرُوا۟|لِلْمُشْرِكِينَ|وَلَوْ|كَانُوٓا۟|أُو۟لِى|قُرْبَىٰ|مِنۢ|بَعْدِ|مَا|تَبَيَّنَ|لَهُمْ|أَنَّهُمْ|أَصْحَـٰبُ|ٱلْجَحِيمِ",
    standard: "مَا|كَانَ|لِلنَّبِيِّ|وَالَّذِينَ|آمَنُوا|أَن|يَسْتَغْفِرُوا|لِلْمُشْرِكِينَ|وَلَوْ|كَانُوا|أُولِي|قُرْبَىٰ|مِن|بَعْدِ|مَا|تَبَيَّنَ|لَهُمْ|أَنَّهُمْ|أَصْحَابُ|الْجَحِيمِ",
  },
  "67:20": {
    uthmani: "أَمَّنْ|هَـٰذَا|ٱلَّذِى|هُوَ|جُندٌۭ|لَّكُمْ|يَنصُرُكُم|مِّن|دُونِ|ٱلرَّحْمَـٰنِ ۚ|إِنِ|ٱلْكَـٰفِرُونَ|إِلَّا|فِى|غُرُورٍ",
    standard: "أَمَّنْ|هَٰذَا|الَّذِي|هُوَ|جُندٌ|لَّكُمْ|يَنصُرُكُم|مِّن|دُونِ|الرَّحْمَٰنِ ۚ|إِنِ|الْكَافِرُونَ|إِلَّا|فِي|غُرُورٍ",
  },
  "10:1": {
    uthmani: "الٓر ۚ|تِلْكَ|ءَايَـٰتُ|ٱلْكِتَـٰبِ|ٱلْحَكِيمِ",
    standard: "الر ۚ|تِلْكَ|آيَاتُ|الْكِتَابِ|الْحَكِيمِ",
  },
  "11:78": {
    uthmani: "وَجَآءَهُۥ|قَوْمُهُۥ|يُهْرَعُونَ|إِلَيْهِ|وَمِن|قَبْلُ|كَانُوا۟|يَعْمَلُونَ|ٱلسَّيِّـَٔاتِ ۚ|قَالَ|يَـٰقَوْمِ|هَـٰٓؤُلَآءِ|بَنَاتِى|هُنَّ|أَطْهَرُ|لَكُمْ ۖ|فَٱتَّقُوا۟|ٱللَّهَ|وَلَا|تُخْزُونِ|فِى|ضَيْفِىٓ ۖ|أَلَيْسَ|مِنكُمْ|رَجُلٌۭ|رَّشِيدٌۭ",
    standard: "وَجَاءَهُ|قَوْمُهُ|يُهْرَعُونَ|إِلَيْهِ|وَمِن|قَبْلُ|كَانُوا|يَعْمَلُونَ|السَّيِّئَاتِ ۚ|قَالَ|يَا قَوْمِ|هَٰؤُلَاءِ|بَنَاتِي|هُنَّ|أَطْهَرُ|لَكُمْ ۖ|فَاتَّقُوا|اللَّهَ|وَلَا|تُخْزُونِ|فِي|ضَيْفِي ۖ|أَلَيْسَ|مِنكُمْ|رَجُلٌ|رَّشِيدٌ",
  },
  "72:16": {
    uthmani: "وَأَلَّوِ|ٱسْتَقَـٰمُوا۟|عَلَى|ٱلطَّرِيقَةِ|لَأَسْقَيْنَـٰهُم|مَّآءً|غَدَقًۭا",
    standard: "وَأَن لَّوِ|اسْتَقَامُوا|عَلَى|الطَّرِيقَةِ|لَأَسْقَيْنَاهُم|مَّاءً|غَدَقًا",
  },
  "20:94": {
    uthmani: "قَالَ|يَبْنَؤُمَّ|لَا|تَأْخُذْ|بِلِحْيَتِى|وَلَا|بِرَأْسِىٓ ۖ|إِنِّى|خَشِيتُ|أَن|تَقُولَ|فَرَّقْتَ|بَيْنَ|بَنِىٓ|إِسْرَٰٓءِيلَ|وَلَمْ|تَرْقُبْ|قَوْلِى",
    standard: "قَالَ|يَا ابْنَ أُمَّ|لَا|تَأْخُذْ|بِلِحْيَتِي|وَلَا|بِرَأْسِي ۖ|إِنِّي|خَشِيتُ|أَن|تَقُولَ|فَرَّقْتَ|بَيْنَ|بَنِي|إِسْرَائِيلَ|وَلَمْ|تَرْقُبْ|قَوْلِي",
  },
};

function verse(key: string): Verse {
  const [sura, aya] = key.split(":").map(Number);
  const words: VerseWord[] = FIXTURE[key].uthmani.split("|").map((text, i) => ({
    position: i + 1,
    charType: "end", // recitable word in the app's inverted charType model
    text_uthmani: text,
    codeV2: "",
    lineNumber: 0,
    pageNumber: 0,
  }));
  // The ayah-end marker (charType "word" in the inverted model).
  words.push({ position: words.length + 1, charType: "word", text_uthmani: "", codeV2: "", lineNumber: 0, pageNumber: 0 });
  return { sura, aya, text: "", page: 0, suraNameAr: "", words };
}
const verses = (...keys: string[]) => keys.map(verse);
const standard = (key: string) => FIXTURE[key].standard.replace(/\|/g, " ");
const at = (sura: number, aya: number, wordIndex = 0): RecitePosition => ({ sura, aya, wordIndex });
const pos = (p: RecitePosition) => `${p.sura}:${p.aya}:${p.wordIndex}`;
const marked = (s: TrackerState) => [...s.marks.keys()].sort();

/** Feeds phrases the way Deepgram does: word-by-word partials, then a final. */
function recite(
  vs: Verse[],
  from: RecitePosition,
  phrases: string[],
  options: AlignOptions = {},
  onPartial?: (cursor: RecitePosition) => void,
): TrackerState {
  const tracker = createReciteTracker({ cursor: from, marks: new Map() }, options);
  for (const phrase of phrases) {
    const words = phrase.split(" ").filter(Boolean);
    for (let k = 1; k < words.length; k++) {
      onPartial?.(tracker.onPartial(spokenWordsFrom(words.slice(0, k).join(" ")), vs).state.cursor);
    }
    tracker.onFinal(spokenWordsFrom(phrase), vs);
  }
  return tracker.committed();
}

const BAQARAH = verses("2:2", "2:3", "2:4", "2:5", "2:6", "2:7");
const S23 = "الذين يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون";

describe("recite aligner: what turns red", () => {
  it("reveals a clean recitation with nothing red", () => {
    const s = recite(BAQARAH, at(2, 3), [S23, standard("2:4")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:4:12");
  });

  it("marks a skipped word", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
    expect(s.marks.get("2:3:2")!.kind).toBe("missed");
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("marks two skipped words without revealing the next verse", () => {
    let furthestAya = 0;
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون الصلاة ومما رزقناهم ينفقون"], {}, (c) => {
      furthestAya = Math.max(furthestAya, c.aya);
    });
    expect(marked(s)).toEqual(["2:3:2", "2:3:3"]);
    expect(furthestAya).toBe(3);
  });

  it("marks a wrong word", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
    expect(s.marks.get("2:3:2")!.kind).toBe("wrong");
  });

  it("marks a word skipped at a pause between phrases", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون", "ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
  });

  it("marks a wrong verse ending once the next verse is recited, across a page boundary", () => {
    const s = recite(BAQARAH, at(2, 5), ["أولئك على هدى من ربهم وأولئك هم الخاسرون", standard("2:6")]);
    expect(marked(s)).toEqual(["2:5:7"]);
    expect(s.cursor.aya).toBe(6);
  });

  it("does not mark an extra word or an immediate self-correction", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق بالغيب ويقيمون الصلاة"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:5");
  });

  it("clears a red word when the reciter goes back and says it", () => {
    const s = recite(BAQARAH, at(2, 3), [
      "الذين يؤمنون ويقيمون الصلاة ومما",
      "يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون",
    ]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("marks nothing when the reciter stops right after a slip", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:2");
  });

  it("ignores isti'adha, basmalah and sadaqa", () => {
    const s = recite(BAQARAH, at(2, 3), [
      "أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم",
      S23,
      "صدق الله العظيم",
    ]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("does not mark a word Deepgram was unsure about", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    const heard = ["الذين", "يؤمنون", "بالقيب", "ويقيمون", "الصلاة"].map((word) => ({
      word,
      confidence: word === "بالقيب" ? 0.3 : 0.95,
    }));
    tracker.onFinal(spokenWordsFrom("", heard), BAQARAH);
    expect(marked(tracker.committed())).toEqual([]);
    expect(pos(tracker.committed().cursor)).toBe("2:3:5");
  });
});

describe("recite aligner: phrases and partial results", () => {
  it("follows Deepgram revising a partial result, and partials never commit", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    expect(pos(tracker.onPartial(spokenWordsFrom("الذين يؤمنون بالغيب ويقيمون"), BAQARAH).state.cursor)).toBe("2:3:4");
    expect(pos(tracker.onPartial(spokenWordsFrom("الذين يؤمنون بالغيب ويقيم"), BAQARAH).state.cursor)).toBe("2:3:3");
    expect(pos(tracker.committed().cursor)).toBe("2:3:0");
  });

  it("commits on a final and keeps marks across a reset to a new cursor", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    tracker.onFinal(spokenWordsFrom("الذين يؤمنون ويقيمون الصلاة"), BAQARAH);
    const { marks } = tracker.committed();
    expect([...marks.keys()]).toEqual(["2:3:2"]);
    tracker.reset({ cursor: at(2, 3, 6), marks });
    tracker.onFinal(spokenWordsFrom("رزقناهم ينفقون"), BAQARAH);
    expect(pos(tracker.committed().cursor)).toBe("2:3:8");
    expect(marked(tracker.committed())).toEqual(["2:3:2"]);
  });

  it("leaves the state unchanged for an empty phrase", () => {
    const state: TrackerState = { cursor: at(2, 3, 2), marks: new Map() };
    const result = alignPhrase(state, spokenWordsFrom("  "), BAQARAH);
    expect(result.state).toBe(state);
    expect(result.newSaid).toBe(0);
  });

  it("does not stall on verses that share an opening word (78:9–11)", () => {
    const naba = verses("78:8", "78:9", "78:10", "78:11", "78:12");
    const s = recite(naba, at(78, 9), [standard("78:9"), standard("78:10"), standard("78:11")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("78:11:3");
  });
});

describe("recite aligner: spelling and tajweed joins", () => {
  it("accepts muqatta'at spelled out as letter names", () => {
    const s = recite(verses("2:1", "2:2", "2:3"), at(2, 1), ["الف لام ميم ذلك الكتاب لا ريب فيه هدى للمتقين"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:2:7");
  });

  it("does not let a muqatta'at word swallow the rest of its verse", () => {
    const s = recite(verses("10:1"), at(10, 1), [standard("10:1")]);
    expect(pos(s.cursor)).toBe("10:1:5");
  });

  it("does not mark a vocative يا heard at the end of the previous phrase (11:78)", () => {
    const words = standard("11:78").split(" ");
    const cut = words.indexOf("يَا") + 1;
    const s = recite(verses("11:78"), at(11, 78), [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("11:78:26");
  });

  it("does not let a skipped short word vanish into its neighbour (9:113)", () => {
    const words = standard("9:113").split(" ");
    words.splice(5, 1); // skip أَن
    const s = recite(verses("9:113"), at(9, 113), [words.join(" ")]);
    expect(marked(s)).toEqual(["9:113:5"]);
  });

  it("prefers two separate words over joining them (67:20)", () => {
    const words = standard("67:20").split(" ");
    const cut = words.indexOf("إِنِ") + 1;
    const s = recite(verses("67:20"), at(67, 20), [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("67:20:15");
  });

  it("matches two spoken words joined by idgham to one Uthmani word (72:16)", () => {
    const s = recite(verses("72:16"), at(72, 16), [standard("72:16")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("72:16:7");
  });

  it("never marks a known irregular spelling (20:94)", () => {
    const s = recite(verses("20:94"), at(20, 94), [standard("20:94")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("20:94:18");
  });

  it("leaves every fixture verse clean when recited in standard spelling", () => {
    for (const key of Object.keys(FIXTURE)) {
      if (key === "2:1") continue; // a lone muqatta'at verse waits for the next word
      const v = verse(key);
      const words = standard(key).split(" ");
      const phrases: string[] = [];
      for (let k = 0; k < words.length; k += 12) phrases.push(words.slice(k, k + 12).join(" "));
      const s = recite([v], at(v.sura, v.aya), phrases);
      expect({ key, marks: marked(s) }).toEqual({ key, marks: [] });
      expect({ key, cursor: pos(s.cursor) }).toEqual({ key, cursor: `${key}:${v.words!.length - 1}` });
    }
  });
});

describe("recite aligner: quiz options", () => {
  const ayatAlKursi = verses("2:255");
  const hiddenStart = at(2, 255, 6);
  const quiz: AlignOptions = { freeStartUntil: hiddenStart, protectBefore: hiddenStart };
  // Standard words with the separate pause-mark tokens dropped, so index k
  // is verse word k.
  const words = standard("2:255")
    .split(" ")
    .filter((w) => !["ۚ", "ۗ", "ۖ"].includes(w));

  it("lets the reciter start at the hidden part", () => {
    const s = recite(ayatAlKursi, at(2, 255), [words.slice(6, 14).join(" ")], quiz);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:255:14");
  });

  it("never marks a skipped word of the shown snippet", () => {
    const s = recite(ayatAlKursi, at(2, 255), [[...words.slice(0, 2), ...words.slice(3, 10)].join(" ")], quiz);
    expect(marked(s)).toEqual([]);
  });

  it("marks a skipped word of the hidden part", () => {
    const s = recite(ayatAlKursi, at(2, 255), [[...words.slice(6, 8), ...words.slice(9, 14)].join(" ")], quiz);
    expect(marked(s)).toEqual(["2:255:8"]);
  });
});

describe("recite aligner: helpers", () => {
  it("markSkipped marks every recitable word in [from, to) as missed", () => {
    const marks = markSkipped(new Map(), BAQARAH, at(2, 3, 6), at(2, 4, 1));
    expect([...marks.keys()].sort()).toEqual(["2:3:6", "2:3:7", "2:4:0"]);
    expect([...marks.values()].every((m) => m.kind === "missed")).toBe(true);
  });

  it("markPositionKeys converts to the page's word positions", () => {
    const marks = markSkipped(new Map(), BAQARAH, at(2, 3, 2), at(2, 3, 3));
    expect([...markPositionKeys(marks)]).toEqual(["2:3:3"]); // word index 2 is position 3
  });

  it("spokenWordsFrom prefers Deepgram's word list and drops empty tokens", () => {
    expect(
      spokenWordsFrom("الحمد لله", [
        { word: "الحمد", confidence: 0.9 },
        { word: "لله", confidence: 0.8 },
      ]),
    ).toEqual([
      { text: "الحمد", confidence: 0.9 },
      { text: "لله", confidence: 0.8 },
    ]);
    expect(spokenWordsFrom("الحمد ، لله")).toEqual([{ text: "الحمد" }, { text: "لله" }]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern recite-aligner`
Expected: FAIL — `Cannot find module '../recite-aligner.service'`.

- [ ] **Step 3: Implement the module**

Create `src/app/core/services/quran/recite-aligner.service.ts`:

```ts
/**
 * RECITE ALIGNER
 *
 * Tracks a recitation against the verse text and decides, word by word,
 * what was said, missed, or said wrongly. Each spoken phrase is aligned
 * once — by dynamic programming, like scoring a transcript against a
 * reference — from where the previous phrase ended. That replaces the old
 * greedy matcher, which assumed every gap was a recognition error (revealing
 * skipped words as recited) and re-matched Deepgram's cumulative partial
 * results from an already-advanced position (leaping ahead on repeated
 * phrases).
 *
 * Design: docs/superpowers/specs/2026-10-01-recite-mistake-detection-design.md
 */

import type { Verse } from "../../../shared/models/verse.model";
import type { RecitePosition } from "./recite-matcher.service";
import {
  compareWord,
  isUnrecitable,
  joinedSpellings,
  plainLetters,
  spokenLetters,
  uthmaniSkeleton,
  type Skeleton,
  type WordVerdict,
} from "./recite-spelling.service";

// ─── Tuning (starting values from the design spec) ───────────────────────────

export const SOUND_ALIKE_COST = 0.25;
export const WRONG_COST = 1.0;
export const MISSED_COST = 0.8;
export const EXTRA_COST = 0.7;
/** Cost per word of starting a phrase behind the committed position. */
export const RESTART_COST_PER_WORD = 0.15;
/** How far behind the committed position a phrase may restart. */
export const RESTART_WINDOW = 10;
/** How far ahead of the committed position a phrase is aligned — room for a
 *  long phrase Deepgram has not finalized yet. */
export const LOOKAHEAD = 60;
/** Correctly said words needed after a gap before it is marked. */
export const CONFIRM_AFTER = 2;
/** Correctly said words a re-search needs before resuming in place. */
export const RESUME_MIN_SAID = 3;
/** Spoken tokens one lenient word may absorb ("الف لام ميم"). */
const LENIENT_MAX_TOKENS = 5;
/** Per absorbed token — small, so a lenient word never out-competes real
 *  words for the tokens that follow it. */
const LENIENT_TOKEN_COST = 0.05;
/** Added to merged/split steps so one-to-one matches win ties (a phrase
 *  ending "الرحمن إن" must not join the two into الرحمان). */
const JOIN_COST = 0.05;

/** Surahs whose verse 1 opens with muqatta'at; 42:2 (عسق) is added
 *  separately. Defined by position — أَلَمْ (94:1, 105:1, 105:2) shares
 *  الٓمٓ's spelling but is an ordinary word. */
const MUQATTAAT_SURAS = new Set([
  2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38,
  40, 41, 42, 43, 44, 45, 46, 50, 68,
]);

/** One-off Uthmani spellings no skeleton rule maps to what the recognizer
 *  writes, matched by their required letters: لَتَّخَذْتَ (18:77, written
 *  لاتخذت) and يَبْنَؤُمَّ (20:94, spoken as three words يا ابن أم). Lenient,
 *  so they are never marked. Found by the whole-Quran spelling check. */
const IRREGULAR_SPELLINGS = new Set(["لتخذت", "يبنءم"]);

// ─── Types ───────────────────────────────────────────────────────────────────

/** One recitable verse word, in reading order. */
export interface ExpectedWord {
  sura: number;
  aya: number;
  /** Index among the verse's recitable entries — the RecitePosition convention. */
  wordIndex: number;
  /** VerseWord.position — what MushafPage renders by. */
  position: number;
  /** Uthmani text, for logs. */
  text: string;
  skeleton: Skeleton;
  /** Muqatta'at: never marked, absorbs letter names. */
  lenient: boolean;
}

export interface SpokenWord {
  text: string;
  /** Deepgram's per-word confidence, when known. */
  confidence?: number;
}

export type MarkKind = "missed" | "wrong";

export interface Mark {
  kind: MarkKind;
  /** VerseWord.position of the marked word. */
  position: number;
}

/** Red words, keyed `sura:aya:wordIndex`. */
export type Marks = ReadonlyMap<string, Mark>;

export interface TrackerState {
  /** One past the last word said (the existing RecitePosition convention). */
  cursor: RecitePosition;
  marks: Marks;
}

export type StepKind =
  | "said"
  | "soundAlike"
  | "wrong"
  | "missed"
  | "extra"
  | "merged"
  | "split"
  | "lenient";

export interface AlignStep {
  kind: StepKind;
  /** 0 (extra), 1, or 2 (merged) verse words. */
  expected: ExpectedWord[];
  /** 0 (missed), 1, 2 (split), or 0–5 (lenient) spoken words. */
  spoken: SpokenWord[];
}

export interface AlignResult {
  state: TrackerState;
  /** Correctly said words between the old cursor and the new one. */
  newSaid: number;
  /** Correctly said words anywhere in the alignment, including a restart and
   *  words still pending behind an unconfirmed gap — "the reciter is on this
   *  text", which is what the mismatch streak needs. */
  saidTotal: number;
  /** Keys newly marked. */
  added: string[];
  /** Keys whose marks were cleared by saying the word correctly. */
  cleared: string[];
  steps: AlignStep[];
}

export interface AlignOptions {
  /** The phrase may start anywhere from the cursor up to this position at no
   *  cost and without marks — a reciter starting mid-verse on the first
   *  landing, or skipping a quiz's shown snippet. */
  freeStartUntil?: RecitePosition;
  /** Words before this position are never marked (a quiz's shown snippet). */
  protectBefore?: RecitePosition;
}

// ─── Expected words ──────────────────────────────────────────────────────────

const expectedCache = new WeakMap<Verse, ExpectedWord[]>();

function verseExpectedWords(verse: Verse): ExpectedWord[] {
  const cached = expectedCache.get(verse);
  if (cached) return cached;
  // Inverted charType model: "end" is a recitable word (see recite-matcher.service).
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  const isMuqattaatVerse =
    (verse.aya === 1 && MUQATTAAT_SURAS.has(verse.sura)) || (verse.sura === 42 && verse.aya === 2);
  const out: ExpectedWord[] = [];
  words.forEach((w, i) => {
    const skeleton = uthmaniSkeleton(w.text_uthmani ?? "", words[i + 1]?.text_uthmani);
    if (isUnrecitable(skeleton)) return;
    out.push({
      sura: verse.sura,
      aya: verse.aya,
      wordIndex: i,
      position: w.position,
      text: w.text_uthmani,
      skeleton,
      lenient: (isMuqattaatVerse && i === 0) || IRREGULAR_SPELLINGS.has(plainLetters(skeleton)),
    });
  });
  expectedCache.set(verse, out);
  return out;
}

/** Every recitable word of `verses` (ascending order), unrecitable tokens removed. */
export function buildExpectedWords(verses: Verse[]): ExpectedWord[] {
  return verses.flatMap(verseExpectedWords);
}

export function wordKey(w: { sura: number; aya: number; wordIndex: number }): string {
  return `${w.sura}:${w.aya}:${w.wordIndex}`;
}

function cmp(a: { sura: number; aya: number; wordIndex: number }, b: RecitePosition): number {
  return a.sura - b.sura || a.aya - b.aya || a.wordIndex - b.wordIndex;
}

/** Index of the first expected word at or after `pos` (length if none). */
function indexAtOrAfter(expected: ExpectedWord[], pos: RecitePosition): number {
  let lo = 0;
  let hi = expected.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(expected[mid], pos) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function positionAfter(w: ExpectedWord): RecitePosition {
  return { sura: w.sura, aya: w.aya, wordIndex: w.wordIndex + 1 };
}

/** Recognizer output as aligner input — Deepgram's per-word list when present
 *  (it carries confidences), else the transcript split on spaces. */
export function spokenWordsFrom(
  text: string,
  words?: { word: string; confidence: number }[],
): SpokenWord[] {
  const list: SpokenWord[] =
    words && words.length
      ? words.map((w) => ({ text: w.word, confidence: w.confidence }))
      : text.split(/\s+/).map((t) => ({ text: t }));
  return list.filter((w) => spokenLetters(w.text).length > 0);
}

// ─── Alignment ───────────────────────────────────────────────────────────────

const OP_DIAG = 1;
const OP_MERGED = 2;
const OP_SPLIT = 3;
const OP_LENIENT = 4;
const OP_MISSED = 5;
const OP_EXTRA = 6;
const OP_START = 7;

function verdictCost(v: WordVerdict): number {
  return v === "said" ? 0 : v === "soundAlike" ? SOUND_ALIKE_COST : WRONG_COST;
}

function isCorrect(kind: StepKind): boolean {
  return kind === "said" || kind === "soundAlike" || kind === "merged" || kind === "split";
}

/**
 * Aligns one spoken phrase against the verse text from `state.cursor` and
 * returns the resulting state. Pure — the caller decides whether the result
 * is tentative (a partial result) or committed (a final).
 */
export function alignPhrase(
  state: TrackerState,
  spoken: SpokenWord[],
  verses: Verse[],
  options: AlignOptions = {},
): AlignResult {
  const all = buildExpectedWords(verses);
  const cursorIdx = indexAtOrAfter(all, state.cursor);
  const freeIdx = options.freeStartUntil
    ? Math.max(cursorIdx, indexAtOrAfter(all, options.freeStartUntil))
    : cursorIdx;
  const from = Math.max(0, cursorIdx - RESTART_WINDOW);
  const to = Math.min(all.length, freeIdx + LOOKAHEAD);
  const E = all.slice(from, to);
  const S = spoken;
  const n = S.length;
  const m = E.length;
  const r = cursorIdx - from; // window index of the committed cursor
  const f = freeIdx - from; // a start up to here is free
  if (n === 0 || m === 0) {
    return { state, newSaid: 0, saidTotal: 0, added: [], cleared: [], steps: [] };
  }

  const width = m + 1;
  const cost = new Float64Array((n + 1) * width).fill(Infinity);
  const op = new Uint8Array((n + 1) * width);
  const opK = new Uint8Array((n + 1) * width);
  const at = (i: number, j: number) => i * width + j;

  const diagCache = new Map<number, WordVerdict>();
  const diag = (i: number, j: number): WordVerdict => {
    const key = at(i, j);
    let v = diagCache.get(key);
    if (v === undefined) {
      v = compareWord(E[j].skeleton, S[i].text, S[i].confidence);
      diagCache.set(key, v);
    }
    return v;
  };
  // Merges and splits bridge pure spelling joins (يا أيها ↔ يٰٓأيها), so they
  // must match exactly — a sound-alike join let a skipped short word vanish
  // into its neighbour (ءامنوا + أن ≈ "آمنوا").
  const merged = (i: number, j: number): boolean => {
    const a = E[j];
    const b = E[j + 1];
    if (a.lenient || b.lenient || a.sura !== b.sura || a.aya !== b.aya) return false;
    return compareWord([...a.skeleton, ...b.skeleton], S[i].text) === "said";
  };
  const split = (i: number, j: number): boolean => {
    if (E[j].lenient) return false;
    return joinedSpellings(S[i].text, S[i + 1].text).some(
      (joined) => compareWord(E[j].skeleton, joined) === "said",
    );
  };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = Infinity;
      let bestOp = 0;
      let bestK = 0;
      const consider = (c: number, o: number, k = 0) => {
        if (c < best - 1e-9) {
          best = c;
          bestOp = o;
          bestK = k;
        }
      };
      const ej = j > 0 ? E[j - 1] : null;
      if (i > 0 && ej && !ej.lenient) {
        consider(cost[at(i - 1, j - 1)] + verdictCost(diag(i - 1, j - 1)), OP_DIAG);
      }
      if (i > 0 && j > 1 && merged(i - 1, j - 2)) {
        consider(cost[at(i - 1, j - 2)] + JOIN_COST, OP_MERGED);
      }
      if (i > 1 && ej && split(i - 2, j - 1)) {
        consider(cost[at(i - 2, j - 1)] + JOIN_COST, OP_SPLIT);
      }
      if (ej && ej.lenient) {
        for (let k = 0; k <= Math.min(LENIENT_MAX_TOKENS, i); k++) {
          consider(cost[at(i - k, j - 1)] + LENIENT_TOKEN_COST * k, OP_LENIENT, k);
        }
      }
      if (ej && !ej.lenient) consider(cost[at(i, j - 1)] + MISSED_COST, OP_MISSED);
      if (i > 0) consider(cost[at(i - 1, j)] + EXTRA_COST, OP_EXTRA);
      if (i === 0 && j <= f) consider(j <= r ? RESTART_COST_PER_WORD * (r - j) : 0, OP_START);
      cost[at(i, j)] = best;
      op[at(i, j)] = bestOp;
      opK[at(i, j)] = bestK;
    }
  }

  // Open end: verse words after the last spoken word are not reached yet.
  let endJ = 0;
  for (let j = 1; j <= m; j++) if (cost[at(n, j)] < cost[at(n, endJ)] - 1e-9) endJ = j;

  // Backtrace into reading-order steps.
  const steps: AlignStep[] = [];
  const stepWindow: number[] = []; // window index of each step's first verse word (-1 for extra)
  let i = n;
  let j = endJ;
  while (!(i === 0 && op[at(i, j)] === OP_START)) {
    const o = op[at(i, j)];
    if (o === OP_DIAG) {
      const v = diag(i - 1, j - 1);
      steps.push({ kind: v, expected: [E[j - 1]], spoken: [S[i - 1]] });
      stepWindow.push(j - 1);
      i -= 1;
      j -= 1;
    } else if (o === OP_MERGED) {
      steps.push({ kind: "merged", expected: [E[j - 2], E[j - 1]], spoken: [S[i - 1]] });
      stepWindow.push(j - 2);
      i -= 1;
      j -= 2;
    } else if (o === OP_SPLIT) {
      steps.push({ kind: "split", expected: [E[j - 1]], spoken: [S[i - 2], S[i - 1]] });
      stepWindow.push(j - 1);
      i -= 2;
      j -= 1;
    } else if (o === OP_LENIENT) {
      const k = opK[at(i, j)];
      steps.push({ kind: "lenient", expected: [E[j - 1]], spoken: S.slice(i - k, i) });
      stepWindow.push(j - 1);
      i -= k;
      j -= 1;
    } else if (o === OP_MISSED) {
      steps.push({ kind: "missed", expected: [E[j - 1]], spoken: [] });
      stepWindow.push(j - 1);
      j -= 1;
    } else {
      steps.push({ kind: "extra", expected: [], spoken: [S[i - 1]] });
      stepWindow.push(-1);
      i -= 1;
    }
  }
  steps.reverse();
  stepWindow.reverse();

  // ─── Result rules ───
  // One outcome per verse word, in reading order. Lenient words are
  // transparent: they neither count as said nor confirm or break a gap.
  type Outcome = { idx: number; ok: boolean; kind: StepKind };
  const outcomes: Outcome[] = [];
  steps.forEach((step, s) => {
    if (step.kind === "extra" || step.kind === "lenient") return;
    step.expected.forEach((_, k) => {
      outcomes.push({ idx: stepWindow[s] + k, ok: isCorrect(step.kind), kind: step.kind });
    });
  });

  const protectIdx = options.protectBefore
    ? indexAtOrAfter(all, options.protectBefore) - from
    : -1;
  const markableFrom = Math.max(r, protectIdx);
  const relevantGap = (o: Outcome) => !o.ok && o.idx >= markableFrom;

  let lastOkBeforeBlock = -1;
  const toMark: Outcome[] = [];
  for (let k = 0; k < outcomes.length; k++) {
    const o = outcomes[k];
    if (o.ok) {
      lastOkBeforeBlock = o.idx;
      continue;
    }
    if (!relevantGap(o)) continue;
    // A gap: the run of relevant wrong/missed words starting here.
    let end = k;
    while (end + 1 < outcomes.length && relevantGap(outcomes[end + 1])) end++;
    let okAfter = 0;
    for (let q = end + 1; q < outcomes.length && !relevantGap(outcomes[q]); q++) {
      if (outcomes[q].ok) okAfter++;
    }
    if (okAfter < CONFIRM_AFTER) break; // unconfirmed: pending, the cursor stops here
    for (let q = k; q <= end; q++) toMark.push(outcomes[q]);
    k = end;
  }

  const cursorWindowIdx = Math.max(r, lastOkBeforeBlock + 1);
  const cursor = cursorWindowIdx > r ? positionAfter(E[cursorWindowIdx - 1]) : state.cursor;

  const marks = new Map(state.marks);
  const cleared: string[] = [];
  const added: string[] = [];
  let newSaid = 0;
  let saidTotal = 0;
  for (const o of outcomes) {
    if (!o.ok) continue;
    saidTotal++;
    if (o.idx >= r && o.idx < cursorWindowIdx) newSaid++;
    const key = wordKey(E[o.idx]);
    if (marks.delete(key)) cleared.push(key);
  }
  for (const o of toMark) {
    const w = E[o.idx];
    const key = wordKey(w);
    marks.set(key, { kind: o.kind === "missed" ? "missed" : "wrong", position: w.position });
    added.push(key);
  }

  return { state: { cursor, marks }, newSaid, saidTotal, added, cleared, steps };
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

/**
 * Phrase handling shared by the Mushaf driver and the quiz. Every partial
 * result of a phrase is aligned from the same committed state (so each
 * spoken word is used once, and a revised word just changes the tentative
 * result); a final commits.
 */
export interface ReciteTracker {
  committed: () => TrackerState;
  onPartial: (spoken: SpokenWord[], verses: Verse[]) => AlignResult;
  onFinal: (spoken: SpokenWord[], verses: Verse[]) => AlignResult;
  reset: (state: TrackerState, options?: AlignOptions) => void;
}

export function createReciteTracker(initial: TrackerState, options: AlignOptions = {}): ReciteTracker {
  let committed = initial;
  let opts = options;
  return {
    committed: () => committed,
    onPartial: (spoken, verses) => alignPhrase(committed, spoken, verses, opts),
    onFinal: (spoken, verses) => {
      const result = alignPhrase(committed, spoken, verses, opts);
      committed = result.state;
      return result;
    },
    reset: (state, nextOptions = {}) => {
      committed = state;
      opts = nextOptions;
    },
  };
}

// ─── Helpers for callers ─────────────────────────────────────────────────────

/** Marks every recitable word in [from, to) as missed — used when a re-search
 *  relocates forward past words the reciter skipped. */
export function markSkipped(
  marks: Marks,
  verses: Verse[],
  from: RecitePosition,
  to: RecitePosition,
): Marks {
  const next = new Map(marks);
  for (const w of buildExpectedWords(verses)) {
    if (w.lenient) continue;
    if (cmp(w, from) >= 0 && cmp(w, to) < 0) {
      next.set(wordKey(w), { kind: "missed", position: w.position });
    }
  }
  return next;
}

/** Marks as `sura:aya:position` keys — what MushafPage's `mistakes` prop takes. */
export function markPositionKeys(marks: Marks): Set<string> {
  const keys = new Set<string>();
  marks.forEach((mark, key) => {
    const [sura, aya] = key.split(":");
    keys.add(`${sura}:${aya}:${mark.position}`);
  });
  return keys;
}

/** One-line summary for the `[recite-align]` console log. */
export function formatAlignLog(result: AlignResult): string {
  const parts = result.steps.map((s) => {
    const exp = s.expected.map((w) => w.text).join("+");
    const spk = s.spoken
      .map((w) => (w.confidence !== undefined ? `${w.text}(${w.confidence.toFixed(2)})` : w.text))
      .join("+");
    if (s.kind === "extra") return `+${spk}`;
    if (s.kind === "missed") return `-${exp}`;
    if (s.kind === "said") return exp;
    return `${s.kind}:${exp}=${spk}`;
  });
  const c = result.state.cursor;
  return (
    `${parts.join(" ")} → ${c.sura}:${c.aya}:${c.wordIndex} ` +
    `(+${result.newSaid} said, ${result.added.length} marked, ${result.cleared.length} cleared)`
  );
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern "recite-(aligner|spelling)"`
Expected: PASS — 75 tests (29 aligner + 46 spelling).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/quran/recite-aligner.service.ts src/app/core/services/quran/__tests__/recite-aligner.service.test.ts
git commit -m "Add the recite aligner: phrase alignment, mistake marks and a shared tracker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Deepgram per-word confidences

**Files:**
- Modify: `src/app/core/services/audio/speech-to-text-stream.service.ts`
- Test: `src/app/core/services/audio/__tests__/speech-to-text-stream.service.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface SttWord { word: string; confidence: number }`; `SttStreamEvent.words?: SttWord[]`; `parseStreamMessage(raw: string): SttStreamEvent | null`.

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/audio/__tests__/speech-to-text-stream.service.test.ts`:

```ts
import { parseStreamMessage } from "../speech-to-text-stream.service";

describe("parseStreamMessage", () => {
  it("reads the transcript, finality and per-word confidences", () => {
    const frame = JSON.stringify({
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [
          {
            transcript: "الحمد لله",
            words: [
              { word: "الحمد", confidence: 0.91, start: 0, end: 0.4 },
              { word: "لله", confidence: 0.62 },
            ],
          },
        ],
      },
    });
    expect(parseStreamMessage(frame)).toEqual({
      text: "الحمد لله",
      isFinal: true,
      words: [
        { word: "الحمد", confidence: 0.91 },
        { word: "لله", confidence: 0.62 },
      ],
    });
  });

  it("ignores frames that are not results", () => {
    expect(parseStreamMessage(JSON.stringify({ type: "Metadata" }))).toBeNull();
    expect(parseStreamMessage("not json")).toBeNull();
  });

  it("tolerates a result without a word list", () => {
    const frame = JSON.stringify({ type: "Results", channel: { alternatives: [{ transcript: "" }] } });
    expect(parseStreamMessage(frame)).toEqual({ text: "", isFinal: false, words: undefined });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern speech-to-text-stream`
Expected: FAIL — `parseStreamMessage` is not exported (`TypeError: ... is not a function`).

- [ ] **Step 3: Implement**

In `src/app/core/services/audio/speech-to-text-stream.service.ts`, make these replacements:

Edit 1 — replace:

```ts
const RECORDER_TIMESLICE_MS = 250;

export interface SttStreamEvent {
  /** Transcript of the current utterance window. Interims are cumulative
```

with:

```ts
const RECORDER_TIMESLICE_MS = 250;

export interface SttWord {
  word: string;
  /** Deepgram's 0–1 confidence for this word. */
  confidence: number;
}

export interface SttStreamEvent {
  /** Transcript of the current utterance window. Interims are cumulative
```

Edit 2 — replace:

```ts
  text: string;
  isFinal: boolean;
}
```

with:

```ts
  text: string;
  isFinal: boolean;
  /** The same words with per-word confidences, when Deepgram sent them —
   *  recite mode's mistake detection forgives a word Deepgram was unsure of. */
  words?: SttWord[];
}

/** The parts of a Deepgram `Results` frame this service reads. */
interface DeepgramResults {
  type?: string;
  is_final?: boolean;
  channel?: {
    alternatives?: {
      transcript?: unknown;
      words?: { word?: unknown; confidence?: unknown }[];
    }[];
  };
}

/** Parses one websocket frame into an event, or null for frames that are not
 *  transcription results (metadata, keep-alives, malformed text). */
export function parseStreamMessage(raw: string): SttStreamEvent | null {
  let data: DeepgramResults;
  try {
    data = JSON.parse(raw) as DeepgramResults;
  } catch {
    return null;
  }
  if (data?.type !== "Results") return null;
  const alt = data.channel?.alternatives?.[0];
  if (!alt) return null;
  const text = typeof alt.transcript === "string" ? alt.transcript : "";
  const words = Array.isArray(alt.words)
    ? alt.words.map((w) => ({
        word: typeof w.word === "string" ? w.word : "",
        confidence: typeof w.confidence === "number" ? w.confidence : 1,
      }))
    : undefined;
  return { text, isFinal: data.is_final === true, words };
}
```

Edit 3 — replace:

```ts
  socket.onmessage = (msg: MessageEvent) => {
    if (stopped) return;
    try {
      const data = JSON.parse(String(msg.data));
      if (data.type !== "Results") return;
      const alt = data.channel?.alternatives?.[0];
      if (!alt) return;
      const text = typeof alt.transcript === "string" ? alt.transcript : "";
      // Dev logging (finals only — interims arrive several times a second).
      if (data.is_final === true && text.trim()) {
        console.log(`[recite-stream] final: "${text.trim()}"`);
      }
      onEvent({ text, isFinal: data.is_final === true });
    } catch {
      // Non-JSON frame — ignore.
    }
  };
  socket.onerror = () => {
```

with:

```ts
  socket.onmessage = (msg: MessageEvent) => {
    if (stopped) return;
    const event = parseStreamMessage(String(msg.data));
    if (!event) return;
    // Dev logging (finals only — interims arrive several times a second).
    if (event.isFinal && event.text.trim()) {
      console.log(`[recite-stream] final: "${event.text.trim()}"`);
    }
    onEvent(event);
  };
  socket.onerror = () => {
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern speech-to-text-stream`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/audio/speech-to-text-stream.service.ts src/app/core/services/audio/__tests__/speech-to-text-stream.service.test.ts
git commit -m "Pass Deepgram per-word confidences through the recite stream" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mushaf recite mode on the tracker

Rewires the main viewer: the driver aligns every Deepgram event through the tracker, the identify session replays and resumes through the aligner, `useReciteMode` exposes the red words, and `MushafPage` draws them. Behaviour is pinned by Task 2's tests; this task's gate is the type-check plus the full suite.

**Files:**
- Modify: `src/app/core/hooks/recite/shared/reciteCore.ts`
- Modify: `src/app/core/hooks/recite/deepgram/useIdentifySession.ts`
- Replace: `src/app/core/hooks/recite/deepgram/deepgramDriver.ts`
- Modify: `src/app/core/hooks/useReciteMode.ts`
- Modify: `src/app/shared/components/mushaf-page/MushafPage.tsx`
- Modify: `src/app/shared/components/mushaf-page/MushafPage.css`
- Modify: `src/app/features/viewer/PageViewer.tsx`

**Interfaces:**
- Consumes: Task 2 (`createReciteTracker`, `alignPhrase`, `markSkipped`, `markPositionKeys`, `spokenWordsFrom`, `formatAlignLog`, `RESUME_MIN_SAID`, `TrackerState`, `Marks`, `ReciteTracker`); Task 3 (`SttStreamEvent.words`).
- Produces:
  - `ReciteDriverDeps.setMarks: (marks: Marks) => void`
  - `ReciteDriver.moveCursor: (pos: RecitePosition) => void`
  - `IdentifySessionDeps.tryResume: (text: string, isFinal: boolean) => number`, `getTrackerState: () => TrackerState | null`, `onLanded: (state: TrackerState | null) => void` (replaces `resumeTrackingAt` and the old `onLanded(pos)`)
  - `UseReciteModeResult.reciteMistakes: Set<string>` (`sura:aya:position` keys)
  - `MushafPage` prop `mistakes?: Set<string>` (`sura:aya:position` keys) and CSS class `mushaf-word-mistake`

- [ ] **Step 1: Extend the driver contract (`reciteCore.ts`)**

In `src/app/core/hooks/recite/shared/reciteCore.ts`:

Replace:

```ts
import {
  verseWordCount,
  type RecitePosition,
} from "../../../services/quran/recite-matcher.service";
import type { RevealAnimator } from "./useRevealAnimator";
```

with:

```ts
import {
  verseWordCount,
  type RecitePosition,
} from "../../../services/quran/recite-matcher.service";
import type { Marks } from "../../../services/quran/recite-aligner.service";
import type { RevealAnimator } from "./useRevealAnimator";
```

Replace:

```ts
  setNoMatchHint: (v: boolean) => void;
  touchLastSpeechAt: () => void;
  stopRecording: () => void;
}
```

with:

```ts
  setNoMatchHint: (v: boolean) => void;
  touchLastSpeechAt: () => void;
  stopRecording: () => void;
  /** The session's red words changed (recite mistake detection). */
  setMarks: (marks: Marks) => void;
}
```

Replace:

```ts
  /** Ends the session (called from stopRecording/disarm/unmount). */
  stop: () => void;
}
```

with:

```ts
  /** Ends the session (called from stopRecording/disarm/unmount). */
  stop: () => void;
  /** The reveal position jumped without speech (manual reveal buttons, a
   *  page landing under the session) — continue matching from `pos` so the
   *  words passed over are not treated as skipped. */
  moveCursor: (pos: RecitePosition) => void;
}
```

- [ ] **Step 2: Route the identify session through the aligner (`useIdentifySession.ts`)**

In `src/app/core/hooks/recite/deepgram/useIdentifySession.ts`:

Edit 1 — replace:

```ts
import type { Verse } from "../../../../shared/models/verse.model";
import { getPage, findVerseByStartingPhrase } from "../../../services/data/quran.service";
import { firstWordPosition, matchTranscript } from "../../../services/quran/recite-matcher.service";
import { correctMuqattaatOpening } from "./muqattaat";
import { stripOpeningPhrases } from "./openingPhrases";
import {
  ESTABLISHED_WORDS_ON_PAGE,
  LOOSE_MATCH_MAX_SKIP,
  LOOSE_MATCH_MIN_CONSUMED,
  cmpPos,
  type RecitePosition,
```

with:

```ts
import type { Verse } from "../../../../shared/models/verse.model";
import { getPage, findVerseByStartingPhrase } from "../../../services/data/quran.service";
import {
  firstWordPosition,
  matchTranscript,
  verseWordCount,
} from "../../../services/quran/recite-matcher.service";
import {
  alignPhrase,
  markSkipped,
  spokenWordsFrom,
  type Marks,
  type TrackerState,
} from "../../../services/quran/recite-aligner.service";
import { correctMuqattaatOpening } from "./muqattaat";
import { stripOpeningPhrases } from "./openingPhrases";
import {
  ESTABLISHED_WORDS_ON_PAGE,
  cmpPos,
  type RecitePosition,
```

Edit 2 — replace:

```ts
  onSwitchToTracking: () => void;
  /**
   * A mid-session re-search turned out to be a false alarm — this text
   * matched forward from where tracking already was. Lets the driver
   * resume with its own holdback/corroboration rules (e.g. Groq resets its
   * chunk-overlap anchor) instead of the identify session reaching into
   * reveal state with a one-size-fits-all holdback.
   */
  resumeTrackingAt: (pos: RecitePosition, consumed: number) => void;
  /** Fires once a page is freshly landed on (identify succeeded), with the
   *  position the replay reveal ended up at (may be null if the page had no
   *  verses). Lets a driver seed its own per-session anchors — e.g. Groq's
   *  chunk-overlap corroboration anchor — the same instant the shared
   *  position/reveal state is seeded. */
  onLanded: (pos: RecitePosition | null) => void;
  /** Clears the driver's own consecutive-mismatch streak — called whenever
   *  identify hands control back to tracking, so a stale streak from before
```

with:

```ts
  onSwitchToTracking: () => void;
  /**
   * A mid-session re-search may be a false alarm: if `text` (the current
   * utterance, from the event being handled) aligns from where tracking was
   * with enough correctly said words, the driver resumes tracking with it
   * and returns how many words it said; otherwise it changes nothing and
   * returns 0.
   */
  tryResume: (text: string, isFinal: boolean) => number;
  /** The tracker's committed state — where tracking was and its red words —
   *  or null before the first landing. */
  getTrackerState: () => TrackerState | null;
  /** Fires once a page is freshly landed on (identify succeeded) with the
   *  tracking state the landing replay produced — the driver starts its
   *  tracker from it. Null if the page had no verses. */
  onLanded: (state: TrackerState | null) => void;
  /** Clears the driver's own consecutive-mismatch streak — called whenever
   *  identify hands control back to tracking, so a stale streak from before
```

Edit 3 — replace:

```ts
  const beginOnPage = useCallback(
    async (page: number, startSura: number, startAya: number, spokenSoFar?: string) => {
      const verses = await getPage(page);
      if (!deps.isActive()) return;
```

with:

```ts
  const beginOnPage = useCallback(
    async (page: number, startSura: number, startAya: number, spokenSoFar?: string) => {
      // Captured before the new page replaces them: where tracking was (null
      // on the first landing) and the page it was on — a forward relocation
      // marks the words the reciter skipped to get here.
      const prior = hasIdentifiedRef.current ? deps.getTrackerState() : null;
      const priorPage = deps.getPage();
      const priorVerses = deps.getPageVerses();
      const verses = await getPage(page);
      if (!deps.isActive()) return;
```

Edit 4 — replace:

```ts
      deps.clearNextPageVerses();
      const startVerse = verses.find((v) => v.sura === startSura && v.aya === startAya);
      let pos = startVerse
        ? firstWordPosition(startVerse)
        : verses.length
          ? firstWordPosition(verses[0])
          : null;
      if (pos && spokenSoFar) {
        // Everything in the replay text was already recited, so skipping
        // words the STT garbled just catches the reveal up to where the
        // reciter actually is — it can't reveal ahead of them. Strict
        // maxSkip: 0 here would stall the seed at the first garbled word.
        const advanced = matchTranscript(spokenSoFar, verses, pos, {
          maxSkip: LOOSE_MATCH_MAX_SKIP,
        });
        if (advanced.position) pos = advanced.position;
      }
      hasIdentifiedRef.current = true;
      wordsSinceLandingRef.current = 0;
      if (pos) {
        const landing = startVerse ? firstWordPosition(startVerse) : pos;
        deps.reveal.landOnPage(verses, landing, pos);
      } else {
        deps.reveal.reset(null);
        deps.hideWholePage(verses);
      }
      deps.onLanded(pos);
      deps.onNavigateToPage(page);
      deps.prefetchNextPage(page);
```

with:

```ts
      deps.clearNextPageVerses();
      const startVerse = verses.find((v) => v.sura === startSura && v.aya === startAya);
      const landing = startVerse
        ? firstWordPosition(startVerse)
        : verses.length
          ? firstWordPosition(verses[0])
          : null;
      hasIdentifiedRef.current = true;
      wordsSinceLandingRef.current = 0;
      if (!landing) {
        deps.reveal.reset(null);
        deps.hideWholePage(verses);
        deps.onLanded(null);
        deps.onNavigateToPage(page);
        deps.prefetchNextPage(page);
        return;
      }
      let marks: Marks = prior ? prior.marks : new Map();
      const nearby = page === priorPage || page === priorPage + 1;
      if (prior && nearby && cmpPos(landing, prior.cursor) > 0) {
        const span = page === priorPage ? verses : [...priorVerses, ...verses];
        marks = markSkipped(marks, span, prior.cursor, landing);
      }
      let state: TrackerState = { cursor: landing, marks };
      if (spokenSoFar) {
        // The text that identified the page was recited — replay it so the
        // reveal (and any red words) catch up. On the first landing the
        // reciter may have begun anywhere in the landing verse, so skipping
        // its opening words costs nothing and marks nothing.
        const freeStartUntil =
          !prior && startVerse
            ? { sura: startVerse.sura, aya: startVerse.aya, wordIndex: verseWordCount(startVerse) }
            : undefined;
        state = alignPhrase(state, spokenWordsFrom(spokenSoFar), verses, { freeStartUntil }).state;
      }
      deps.reveal.landOnPage(verses, landing, state.cursor);
      deps.onLanded(state);
      deps.onNavigateToPage(page);
      deps.prefetchNextPage(page);
```

Edit 5 — replace:

```ts
      }

      // Mid-session re-search only: if this text matches forward from the
      // position we were tracking, the re-search was a false alarm — cancel
      // it and resume right where we were instead of waiting for a
      // whole-Quran identification to play out. Uses just the current
      // utterance's text (not the full accumulated buffer) since that's the
      // freshest signal of what's being said right now.
      const truePos = deps.reveal.getTruePosition();
      if (hasIdentifiedRef.current && truePos) {
        const resume = matchTranscript(text, deps.getCombinedVerses(), truePos, {
          maxSkip: LOOSE_MATCH_MAX_SKIP,
        });
        if (resume.position && resume.consumedTokens >= LOOSE_MATCH_MIN_CONSUMED) {
          // Reciter is back on their tracked position — any armed move-away
          // candidate was a false alarm.
```

with:

```ts
      }

      // Mid-session re-search only: if this text aligns from the position we
      // were tracking, the re-search was a false alarm — cancel it and resume
      // right where we were instead of waiting for a whole-Quran
      // identification to play out. Uses just the current utterance's text
      // (not the full accumulated buffer) since that's the freshest signal
      // of what's being said right now.
      if (hasIdentifiedRef.current) {
        const resumedWords = deps.tryResume(text, isFinal);
        if (resumedWords > 0) {
          // Reciter is back on their tracked position — any armed move-away
          // candidate was a false alarm.
```

Edit 6 — replace:

```ts
          deps.resetMismatchStreak();
          deps.setNoMatchHint(false);
          wordsSinceLandingRef.current += resume.consumedTokens;
          deps.resumeTrackingAt(resume.position, resume.consumedTokens);
          return;
        }
```

with:

```ts
          deps.resetMismatchStreak();
          deps.setNoMatchHint(false);
          wordsSinceLandingRef.current += resumedWords;
          return;
        }
```

- [ ] **Step 3: Replace the Deepgram driver**

Replace the whole of `src/app/core/hooks/recite/deepgram/deepgramDriver.ts` with:

```ts
/**
 * DEEPGRAM DRIVER — live-streaming Recite Mode engine.
 *
 * Owns everything specific to the Deepgram websocket pipeline: opening the
 * stream, handling interim/final events, and the reveal holdback tuned for
 * streaming's failure mode (a settling window's *last* word can still be
 * revised, so the newest matched word is held back by one until the window
 * settles).
 *
 * Matching itself lives in the recite aligner
 * (services/quran/recite-aligner.service.ts): every interim of a phrase is
 * aligned from the same committed state — so each spoken word is used once —
 * and a final commits it. The aligner decides which words were said, missed
 * or said wrongly; missed and wrong words come back as marks (red words).
 *
 * Owns its own `useIdentifySession` instance, since only one driver is ever
 * active per recording session.
 */

import { useCallback, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamEvent,
  type SttStreamHandle,
} from "../../../services/audio/speech-to-text-stream.service";
import { normalizeArabic } from "../../../services/quran/recite-matcher.service";
import {
  RESUME_MIN_SAID,
  createReciteTracker,
  formatAlignLog,
  spokenWordsFrom,
  type ReciteTracker,
  type TrackerState,
} from "../../../services/quran/recite-aligner.service";
import {
  cmpPos,
  usableWordCount,
  type RecitePosition,
  type ReciteDriver,
  type ReciteDriverDeps,
} from "../shared/reciteCore";
import { useIdentifySession } from "./useIdentifySession";

/** Consecutive mismatched segments before flagging `noMatchHint` / giving up
 *  and re-searching. Interims count toward the streak too (throttled to one
 *  per MISMATCH_INTERIM_THROTTLE_MS below), so the same *count* of
 *  mismatches represents a short span of real time; without the higher
 *  re-search count, a couple of garbled interim revisions mid-utterance
 *  could trigger a re-search almost instantly. */
const NO_MATCH_HINT_STREAK = 3;
const NO_MATCH_REIDENTIFY_STREAK = 6;

/** Holdback while the streaming engine is driving. Streamed interims don't
 *  hallucinate a continuation — the only instability is that a window's last
 *  word may still be revised — so one word of margin suffices, and each
 *  final releases it. */
const STREAM_REVEAL_HOLDBACK_WORDS = 1;

/** Minimum gap between whole-Quran identify searches while accumulating
 *  interim text. Deepgram can emit several interim revisions per second;
 *  re-scoring the whole corpus on every single one is wasted work since
 *  consecutive interims usually differ by a word or less. Finals (which
 *  settle a window) always search immediately regardless of this gap. */
const IDENTIFY_INTERIM_THROTTLE_MS = 400;

/** Same throttle, applied to interim-driven wrong-page detection — see
 *  handleStreamEvent's mismatch counting below. */
const MISMATCH_INTERIM_THROTTLE_MS = 400;

export function useDeepgramDriver(deps: ReciteDriverDeps): ReciteDriver {
  const [micError, setMicError] = useState<string | null>(null);
  const streamHandleRef = useRef<SttStreamHandle | null>(null);
  const noMatchStreakRef = useRef(0);
  const recentTextsRef = useRef<string[]>([]);
  // The phrase tracker for the page being recited; null until the first
  // landing (identify phase).
  const trackerRef = useRef<ReciteTracker | null>(null);
  // Per-word confidences of the event being handled — tryResume (called by
  // the identify session with that event's text) reads them from here.
  const eventWordsRef = useRef<SttStreamEvent["words"]>(undefined);
  // Throttle clocks (Date.now() ms) for interim-driven identify/mismatch
  // checks — see the two constants above.
  const lastIdentifyAttemptAtRef = useRef(0);
  const lastMismatchCheckAtRef = useRef(0);
  // The exact text last sent to findVerseByStartingPhrase during identify —
  // an interim that repeats the same words as the last attempt (very common
  // since interims of the same utterance overlap heavily) is skipped even
  // if the throttle window has passed, since re-scoring unchanged text can
  // only produce the same outcome.
  const lastIdentifyTextRef = useRef("");

  // Shows an aligned state: the red words, and the reveal moved to its
  // cursor (forward word by word with the holdback, or snapped back when a
  // revised interim retracted a word).
  const showState = useCallback(
    (state: TrackerState) => {
      deps.setMarks(state.marks);
      const truePos = deps.reveal.getTruePosition();
      if (!truePos || cmpPos(state.cursor, truePos) !== 0) {
        deps.reveal.advanceTo(state.cursor, STREAM_REVEAL_HOLDBACK_WORDS);
      }
    },
    [deps],
  );

  const identify = useIdentifySession({
    isActive: deps.isActive,
    isRecording: deps.isRecording,
    getPage: deps.getPage,
    setPage: deps.setPage,
    getPageVerses: deps.getPageVerses,
    setPageVerses: deps.setPageVerses,
    clearNextPageVerses: deps.clearNextPageVerses,
    getCombinedVerses: deps.getCombinedVerses,
    reveal: deps.reveal,
    hideWholePage: deps.hideWholePage,
    applyPosition: deps.applyPosition,
    onNavigateToPage: deps.onNavigateToPage,
    prefetchNextPage: deps.prefetchNextPage,
    setIdentifying: deps.setIdentifying,
    setNoMatchHint: deps.setNoMatchHint,
    // Streaming has no chunk cadence to switch — one continuous socket
    // carries both phases.
    onSwitchToTracking: () => {},
    tryResume: (text, isFinal) => {
      const tracker = trackerRef.current;
      if (!tracker) return 0;
      const spoken = spokenWordsFrom(text, eventWordsRef.current);
      const verses = deps.getCombinedVerses();
      // Probe without committing — only a strong in-place match resumes.
      const probe = tracker.onPartial(spoken, verses);
      if (probe.newSaid < RESUME_MIN_SAID) return 0;
      const result = isFinal ? tracker.onFinal(spoken, verses) : probe;
      showState(result.state);
      if (isFinal) deps.reveal.confirm(result.state.cursor);
      return result.newSaid;
    },
    getTrackerState: () => trackerRef.current?.committed() ?? null,
    onLanded: (state) => {
      trackerRef.current = state ? createReciteTracker(state) : null;
      if (state) deps.setMarks(state.marks);
    },
    resetMismatchStreak: () => {
      noMatchStreakRef.current = 0;
    },
    stopRecording: deps.stopRecording,
  });

  // Every Results frame lands here. Interims are cumulative revisions of
  // the current utterance window, arriving a few hundred ms behind the
  // voice — they drive both the near-live reveal AND the identify search and
  // wrong-page detection, throttled so the whole-Quran scorer isn't re-run
  // on every single revision. A final settles the window: it commits the
  // tracker, releases the reveal holdback, and always triggers an immediate,
  // unthrottled check.
  const handleStreamEvent = useCallback(
    (event: SttStreamEvent) => {
      if (!deps.isActive() || !deps.isRecording()) return;
      const text = event.text.trim();
      if (text) {
        deps.setLastChunkText(text);
        deps.touchLastSpeechAt();
      }
      eventWordsRef.current = event.words;

      if (identify.isIdentifying()) {
        if (!text) return;
        const now = Date.now();
        const dueByTime =
          now - lastIdentifyAttemptAtRef.current >= IDENTIFY_INTERIM_THROTTLE_MS;
        const textChanged = text !== lastIdentifyTextRef.current;
        // Finals always run (they're the settled, final word of a phrase);
        // interims run only when both the throttle window has passed AND
        // the text actually changed since the last attempt — an unchanged
        // interim can only re-produce the same search outcome.
        if (event.isFinal || (dueByTime && textChanged)) {
          lastIdentifyAttemptAtRef.current = now;
          lastIdentifyTextRef.current = text;
          void identify.handleIdentifyChunk(text, event.isFinal);
        }
        return;
      }

      const tracker = trackerRef.current;
      if (!tracker) return;
      if (!text && !event.isFinal) return;
      const verses = deps.getCombinedVerses();
      const spoken = spokenWordsFrom(text, event.words);
      const result = event.isFinal ? tracker.onFinal(spoken, verses) : tracker.onPartial(spoken, verses);
      // Also on an empty final: it settles the window at the committed
      // state, retracting anything an interim showed that the final dropped.
      showState(result.state);

      if (event.isFinal) {
        // The window settled: its words are confirmed speech — release them
        // from the holdback.
        deps.reveal.confirm(result.state.cursor);
        if (result.newSaid > 0) identify.addWordsSinceLanding(result.newSaid);
        if (text) console.log(`[recite-align] ${formatAlignLog(result)}`);
      }

      // Any correctly said word means the reciter is on this text (a restart
      // over already-revealed words included) — not a mismatch.
      if (result.saidTotal > 0) {
        noMatchStreakRef.current = 0;
        recentTextsRef.current = [];
        deps.setNoMatchHint(false);
        return;
      }

      // No match. A final always counts as one mismatch tick. An interim
      // counts too — throttled, so a long unmatching utterance doesn't wait
      // for its own final to start building the wrong-page streak — but only
      // once its text has enough real words to be meaningful and the
      // throttle window has passed, so it isn't scored many times a second.
      if (!text) return;
      if (usableWordCount(text, normalizeArabic) < 3) return;
      if (!event.isFinal) {
        const now = Date.now();
        if (now - lastMismatchCheckAtRef.current < MISMATCH_INTERIM_THROTTLE_MS) return;
        lastMismatchCheckAtRef.current = now;
      }

      // Tracking-phase mismatches are otherwise silent — the reveal just
      // freezes. Surface which final failed to match, and where tracking was.
      if (event.isFinal) {
        const stuckAt = tracker.committed().cursor;
        console.log(
          `[recite-track] no match: "${text}" (stuck at ${stuckAt.sura}:${stuckAt.aya}, ` +
            `streak ${noMatchStreakRef.current + 1})`,
        );
      }

      recentTextsRef.current = [...recentTextsRef.current, text].slice(-3);
      noMatchStreakRef.current += 1;
      if (noMatchStreakRef.current >= NO_MATCH_REIDENTIFY_STREAK) {
        // Fresh identify phase starting now — the seed text below is new,
        // so the interim-identify throttle must not carry over stale state
        // from before (it would otherwise block the very first search of
        // the re-search until the old throttle window happens to elapse).
        lastIdentifyAttemptAtRef.current = 0;
        lastIdentifyTextRef.current = "";
        identify.reidentify(recentTextsRef.current.join(" "));
        recentTextsRef.current = [];
      } else if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) {
        deps.setNoMatchHint(true);
      }
    },
    [deps, identify, showState],
  );

  const start = useCallback(() => {
    noMatchStreakRef.current = 0;
    recentTextsRef.current = [];
    trackerRef.current = null;
    eventWordsRef.current = undefined;
    lastIdentifyAttemptAtRef.current = 0;
    lastMismatchCheckAtRef.current = 0;
    lastIdentifyTextRef.current = "";
    setMicError(null);
    identify.startIdentifying();
    deps.setIdentifying(true);
    // Streaming engine: one continuous socket, words arrive near-live. No
    // speech gate or chunk cadence needed — leading silence just streams
    // until the silence timeout ends the session.
    openSttStream(handleStreamEvent, (message) => {
      // Socket died mid-session (auth rejection, network drop) — no more
      // words will arrive, so surface it instead of sitting there.
      if (!deps.isRecording()) return;
      setMicError(message);
      deps.stopRecording();
    })
      .then((handle) => {
        if (deps.isRecording()) streamHandleRef.current = handle;
        else handle.stop();
      })
      .catch((err) => {
        setMicError(err instanceof Error ? err.message : "Microphone access denied");
        deps.stopRecording();
      });
  }, [deps, handleStreamEvent, identify]);

  const stop = useCallback(() => {
    streamHandleRef.current?.stop();
    streamHandleRef.current = null;
  }, []);

  const moveCursor = useCallback((pos: RecitePosition) => {
    const tracker = trackerRef.current;
    if (tracker) tracker.reset({ cursor: pos, marks: tracker.committed().marks });
  }, []);

  return { micError, start, stop, moveCursor };
}
```

- [ ] **Step 4: Expose red words from `useReciteMode.ts`**

In `src/app/core/hooks/useReciteMode.ts`:

Edit 1 — replace:

```ts
  type RecitePosition,
} from "../services/quran/recite-matcher.service";
import { SILENCE_TIMEOUT_MS, type ReciteDriverDeps } from "./recite/shared/reciteCore";
import { useRevealAnimator } from "./recite/shared/useRevealAnimator";
```

with:

```ts
  type RecitePosition,
} from "../services/quran/recite-matcher.service";
import { markPositionKeys } from "../services/quran/recite-aligner.service";
import { SILENCE_TIMEOUT_MS, type ReciteDriverDeps } from "./recite/shared/reciteCore";
import { useRevealAnimator } from "./recite/shared/useRevealAnimator";
```

Edit 2 — replace:

```ts
  /** Word-level reveal state for the verse currently being recited, or undefined. */
  recitePartialTarget: RecitePartialTarget | undefined;
  micError: string | null;
  /** Seconds elapsed since the current recording started, ticking once per second. 0 when not recording. */
```

with:

```ts
  /** Word-level reveal state for the verse currently being recited, or undefined. */
  recitePartialTarget: RecitePartialTarget | undefined;
  /** Words recited wrongly or skipped this session, as `sura:aya:position`
   *  keys — shown red. Kept after recording stops (for review); cleared when
   *  a new recording starts or recite mode is exited. */
  reciteMistakes: Set<string>;
  micError: string | null;
  /** Seconds elapsed since the current recording started, ticking once per second. 0 when not recording. */
```

Edit 3 — replace:

```ts
    RecitePartialTarget | undefined
  >(undefined);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
```

with:

```ts
    RecitePartialTarget | undefined
  >(undefined);
  const [reciteMistakes, setReciteMistakes] = useState<Set<string>>(new Set());
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
```

Edit 4 — replace:

```ts
  // exists. Broken via the same ref-indirection pattern as stopRecordingRef.
  const driverStopRef = useRef<() => void>(() => {});

  // Position has moved past the last verse on this page (matched across the
```

with:

```ts
  // exists. Broken via the same ref-indirection pattern as stopRecordingRef.
  const driverStopRef = useRef<() => void>(() => {});
  // Holds the driver's .moveCursor() for the manual reveal buttons and
  // syncPage, declared before the driver exists (same pattern as above).
  const driverMoveCursorRef = useRef<(pos: RecitePosition) => void>(() => {});

  // Position has moved past the last verse on this page (matched across the
```

Edit 5 — replace:

```ts
        : { sura: activePos.sura, aya: activePos.aya + 1, wordIndex: 0 };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
    },
```

with:

```ts
        : { sura: activePos.sura, aya: activePos.aya + 1, wordIndex: 0 };
      reveal.reset(nextPos);
      driverMoveCursorRef.current(nextPos);
      applyPosition(verses, nextPos);
    },
```

Edit 6 — replace:

```ts
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
      return;
```

with:

```ts
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
      reveal.reset(nextPos);
      driverMoveCursorRef.current(nextPos);
      applyPosition(verses, nextPos);
      return;
```

Edit 7 — replace:

```ts
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: total };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
      return;
```

with:

```ts
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: total };
      reveal.reset(nextPos);
      driverMoveCursorRef.current(nextPos);
      applyPosition(verses, nextPos);
      return;
```

Edit 8 — replace:

```ts
    // revealing unrecited words is the one thing this mode must never do.
    // The held word or two — if genuinely recited — is a tap on the reveal
    // button away.
    reveal.stop();
    // Recording no longer owns the page's visibility (the toolbar falls
```

with:

```ts
    // revealing unrecited words is the one thing this mode must never do.
    // The held word or two — if genuinely recited — is a tap on the reveal
    // button away. Red words (reciteMistakes) stay, for review.
    reveal.stop();
    // Recording no longer owns the page's visibility (the toolbar falls
```

Edit 9 — replace:

```ts
    touchLastSpeechAt,
    stopRecording: () => stopRecordingRef.current(),
  };

  const deepgramDriver = useDeepgramDriver(driverDeps);
  driverStopRef.current = deepgramDriver.stop;

  const clearDurationTimer = useCallback(() => {
```

with:

```ts
    touchLastSpeechAt,
    stopRecording: () => stopRecordingRef.current(),
    setMarks: (marks) => setReciteMistakes(markPositionKeys(marks)),
  };

  const deepgramDriver = useDeepgramDriver(driverDeps);
  driverStopRef.current = deepgramDriver.stop;
  driverMoveCursorRef.current = deepgramDriver.moveCursor;

  const clearDurationTimer = useCallback(() => {
```

Edit 10 — replace:

```ts
    setNoMatchHint(false);
    setIdentifying(true);
    // Starting to recite: hide the page and reveal word-by-word as matched.
    reveal.reset(versesRef.current.length ? firstWordPosition(versesRef.current[0]) : null);
```

with:

```ts
    setNoMatchHint(false);
    setIdentifying(true);
    setReciteMistakes(new Set());
    // Starting to recite: hide the page and reveal word-by-word as matched.
    reveal.reset(versesRef.current.length ? firstWordPosition(versesRef.current[0]) : null);
```

Edit 11 — replace:

```ts
      reveal.reconcile(posOnPage ? null : fallback, dOnPage ? null : (posOnPage ? pos : fallback));

      const displayPos = reveal.getDisplayPosition();
```

with:

```ts
      reveal.reconcile(posOnPage ? null : fallback, dOnPage ? null : (posOnPage ? pos : fallback));
      if (!posOnPage && fallback) driverMoveCursorRef.current(fallback);

      const displayPos = reveal.getDisplayPosition();
```

Edit 12 — replace:

```ts
    setReciteHidden(new Set());
    setRecitePartialTarget(undefined);
    setRecordingSeconds(0);
    setLastChunkText("");
```

with:

```ts
    setReciteHidden(new Set());
    setRecitePartialTarget(undefined);
    setReciteMistakes(new Set());
    setRecordingSeconds(0);
    setLastChunkText("");
```

Edit 13 — replace:

```ts
    reciteHidden,
    recitePartialTarget,
    micError,
    recordingSeconds,
```

with:

```ts
    reciteHidden,
    recitePartialTarget,
    reciteMistakes,
    micError,
    recordingSeconds,
```

- [ ] **Step 5: Draw red words in `MushafPage`**

In `src/app/shared/components/mushaf-page/MushafPage.tsx`:

Edit 1 — replace:

```tsx
    recitedPositions?: Set<number>;
  };
  onVerseTap?: (verseKey: string) => void;
  onVerseLongPress?: (verseKey: string) => void;
```

with:

```tsx
    recitedPositions?: Set<number>;
  };
  /** Recite mode's red words — skipped or said wrongly — as
   *  `sura:aya:position` keys. A hidden word stays hidden. */
  mistakes?: Set<string>;
  onVerseTap?: (verseKey: string) => void;
  onVerseLongPress?: (verseKey: string) => void;
```

Edit 2 — replace:

```tsx
  grey,
  partialTarget,
  onVerseTap,
  onVerseLongPress,
```

with:

```tsx
  grey,
  partialTarget,
  mistakes,
  onVerseTap,
  onVerseLongPress,
```

Edit 3 — replace:

```tsx
      !!partialTarget!.recitedPositions?.has(tw.word.position);

    const isEndMarker =
      tw.word.charType === "end" &&
```

with:

```tsx
      !!partialTarget!.recitedPositions?.has(tw.word.position);

    // Recite mistake: skipped or said wrongly — red once revealed, and red
    // wins over the green "recited" highlight.
    const isMistake =
      tw.word.charType === "end" &&
      !isHidden &&
      !isWordPastReveal &&
      !!mistakes?.has(`${key}:${tw.word.position}`);

    const isEndMarker =
      tw.word.charType === "end" &&
```

Edit 4 — replace:

```tsx
      isWordPastReveal ? "mushaf-verse-hidden" : "",
      isWordHinted ? "mushaf-word-hinted" : "",
      isWordRecited ? "mushaf-word-recited" : "",
      isEndMarker ? "mushaf-verse-end-marker" : "",
    ]
```

with:

```tsx
      isWordPastReveal ? "mushaf-verse-hidden" : "",
      isWordHinted ? "mushaf-word-hinted" : "",
      isWordRecited && !isMistake ? "mushaf-word-recited" : "",
      isMistake ? "mushaf-word-mistake" : "",
      isEndMarker ? "mushaf-verse-end-marker" : "",
    ]
```

In `src/app/shared/components/mushaf-page/MushafPage.css` (the new rule must come after `.mushaf-word-recited`):

Edit 1 — replace:

```css
}

/* Surah name font. Each surah is a single ornamental glyph — the calligraphic
   name and its decorative frame are drawn into the character itself, exactly
```

with:

```css
}

/* Recite mistake: a word the reciter skipped or said wrongly, revealed in
   red. The dotted underline is a second cue for readers who can't tell this
   red from the green "recited" highlight. Day red is #d32f2f (5:1 on the
   white page); offset/thickness need WebView 87 — older engines still draw
   the dotted underline. */
.mushaf-word-mistake {
  color: #d32f2f !important;
  -webkit-text-fill-color: #d32f2f !important;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: currentColor;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.3em;
}
[data-theme="night"] .mushaf-word-mistake {
  color: #ff6b6b !important;
  -webkit-text-fill-color: #ff6b6b !important;
}

/* Surah name font. Each surah is a single ornamental glyph — the calligraphic
   name and its decorative frame are drawn into the character itself, exactly
```

In `src/app/features/viewer/PageViewer.tsx`:

Edit 1 — replace:

```tsx
                  hidden={displayHiddenForPage}
                  partialTarget={displayPartialTargetForPage}
                  green={greenVerse ? new Set([greenVerse]) : undefined}
                  onVerseLongPress={handleVerseLongPress}
```

with:

```tsx
                  hidden={displayHiddenForPage}
                  partialTarget={displayPartialTargetForPage}
                  mistakes={recite.status !== "idle" ? recite.reciteMistakes : undefined}
                  green={greenVerse ? new Set([greenVerse]) : undefined}
                  onVerseLongPress={handleVerseLongPress}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no output.

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts"`
Expected: only the 9 baseline failures (`trackerLogic.test.ts`, `prayer-times.service.test.ts`); everything else passes, including the 78 new tests from Tasks 1–3.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/hooks/recite src/app/core/hooks/useReciteMode.ts src/app/shared/components/mushaf-page src/app/features/viewer/PageViewer.tsx
git commit -m "Track Mushaf recitation with the aligner and show skipped or wrong words in red" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Quiz recite on the tracker

**Files:**
- Create: `src/app/features/quiz/hooks/quizReciteProgress.ts`
- Test: `src/app/features/quiz/hooks/__tests__/quizReciteProgress.test.ts`
- Replace: `src/app/features/quiz/hooks/useQuizRecite.ts`
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx`, `AkmelAlAyah.css`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx`, `MutashabihatTest.css`
- Modify: `src/app/shared/components/mushaf-context/MushafContextViewer.tsx`

**Interfaces:**
- Consumes: Task 2 (`createReciteTracker`, `markPositionKeys`, `spokenWordsFrom`, `TrackerState`, `ReciteTracker`, `Mark`); Task 3 (`SttWord`); Task 4 (`MushafPage` prop `mistakes`).
- Produces:
  - `quizProgress(state: TrackerState, target: { completeAt: number; wordCount: number }, snippetWords: number): { revealedWordCount: number; mistakeWordIndexes: Set<number>; complete: boolean }`
  - `UseQuizReciteResult.mistakeWordIndexes: Set<number>`, `mistakePositions: Set<string>`, `reset(): void`; `isVerseComplete` now also requires no red words; `stop()` keeps the attempt on screen.
  - `MushafContextViewer` prop `reciteMistakes?: Set<string>`.

- [ ] **Step 1: Write the failing test**

Create `src/app/features/quiz/hooks/__tests__/quizReciteProgress.test.ts`:

```ts
import type { Mark } from "../../../../core/services/quran/recite-aligner.service";
import { quizProgress } from "../quizReciteProgress";

const target = { completeAt: 10, wordCount: 10 };
const at = (wordIndex: number) => ({ sura: 2, aya: 255, wordIndex });
const red = (wordIndex: number, kind: Mark["kind"] = "missed"): [string, Mark] => [
  `2:255:${wordIndex}`,
  { kind, position: wordIndex + 1 },
];

describe("quizProgress", () => {
  it("is complete only at the verse end with no red words left", () => {
    expect(quizProgress({ cursor: at(10), marks: new Map() }, target, 4).complete).toBe(true);
    expect(quizProgress({ cursor: at(10), marks: new Map([red(6)]) }, target, 4).complete).toBe(false);
    expect(quizProgress({ cursor: at(9), marks: new Map() }, target, 4).complete).toBe(false);
  });

  it("reports progress and red words relative to the hidden portion", () => {
    const p = quizProgress({ cursor: at(8), marks: new Map([red(6, "wrong")]) }, target, 4);
    expect(p.revealedWordCount).toBe(4);
    expect([...p.mistakeWordIndexes]).toEqual([2]);
  });

  it("reveals nothing new while the reciter is still in the shown snippet", () => {
    expect(quizProgress({ cursor: at(3), marks: new Map() }, target, 4).revealedWordCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern quizReciteProgress`
Expected: FAIL — `Cannot find module '../quizReciteProgress'`.

- [ ] **Step 3: Implement `quizReciteProgress.ts`**

Create `src/app/features/quiz/hooks/quizReciteProgress.ts`:

```ts
import type { TrackerState } from "../../../core/services/quran/recite-aligner.service";

export interface QuizReciteProgress {
  /** Words recited past the shown snippet (0 while still in the snippet). */
  revealedWordCount: number;
  /** Red words as indexes into the hidden portion — counted like
   *  revealedWordCount, so the card can style word `i` directly. */
  mistakeWordIndexes: Set<number>;
  /** Verse end reached with no red words left. */
  complete: boolean;
}

/**
 * What a quiz shows for a recite tracker state on its single target verse.
 * `completeAt` is the verse's recitable word count (the ayah-number marker
 * excluded); `wordCount` caps the cursor; `snippetWords` is how many of the
 * verse's words the question already shows.
 */
export function quizProgress(
  state: TrackerState,
  target: { completeAt: number; wordCount: number },
  snippetWords: number,
): QuizReciteProgress {
  const wordsIntoVerse = Math.min(state.cursor.wordIndex, target.wordCount);
  const mistakeWordIndexes = new Set<number>();
  state.marks.forEach((_, key) => {
    mistakeWordIndexes.add(Number(key.split(":")[2]) - snippetWords);
  });
  return {
    revealedWordCount: Math.max(0, wordsIntoVerse - snippetWords),
    mistakeWordIndexes,
    complete:
      target.completeAt > 0 && wordsIntoVerse >= target.completeAt && state.marks.size === 0,
  };
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern quizReciteProgress`
Expected: PASS — 3 tests.

- [ ] **Step 5: Replace the quiz recite hook**

Replace the whole of `src/app/features/quiz/hooks/useQuizRecite.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamHandle,
  type SttWord,
} from "../../../core/services/audio/speech-to-text-stream.service";
import { getPage } from "../../../core/services/data/quran.service";
import { removeDiacritics } from "../../../core/utils/arabic.util";
import {
  firstWordPosition,
  verseWordCount,
  type RecitePosition,
} from "../../../core/services/quran/recite-matcher.service";
import {
  createReciteTracker,
  markPositionKeys,
  spokenWordsFrom,
  type ReciteTracker,
  type TrackerState,
} from "../../../core/services/quran/recite-aligner.service";
import { useLang } from "../../../core/context/LanguageContext";
import { isNetworkReachable } from "../../../core/services/api/network.service";
import type { Verse } from "../../../shared/models/verse.model";
import { quizProgress } from "./quizReciteProgress";

/**
 * QUIZ RECITE
 *
 * A quiz question already knows exactly which verse (and which word within
 * it) the user must recite — unlike the main Quran viewer's Recite Mode,
 * there is nothing to *identify* by searching the whole Quran. This talks to
 * Deepgram's live-streaming transcription directly
 * (../../../core/services/audio/speech-to-text-stream.service) and tracks the
 * recitation with the same recite aligner the main viewer uses
 * (../../../core/services/quran/recite-aligner.service), skipping the
 * identify phase.
 *
 * Recitation is always bounded to the single target verse. The user may
 * recite the whole verse from its start, or jump straight into the hidden
 * continuation they're being tested on: the shown snippet may be recited or
 * skipped, and a word missed inside it is never marked. Words of the hidden
 * part that are skipped or said wrongly turn red, and the question counts as
 * complete only once the verse end is reached with no red words left.
 */
export type QuizReciteStatus = "idle" | "armed" | "recording" | "mic-error";

export interface UseQuizReciteResult {
  status: QuizReciteStatus;
  isRecording: boolean;
  isArmed: boolean;
  micError: string | null;
  recordingSeconds: number;
  lastChunkText: string;
  noMatchHint: boolean;
  /** True once the target verse has been recited to its end with no red
   *  words left. */
  isVerseComplete: boolean;
  /**
   * How many words of the *hidden* continuation the user has recited so far
   * — i.e. words in the target verse past the already-displayed snippet.
   * Zero while the user is still reciting the shown portion. This is the
   * same origin the manual hint level uses (words into `hiddenPortion`), so
   * the two can be combined with `Math.max` without double-counting the
   * snippet.
   */
  revealedWordCount: number;
  /** Words of the hidden continuation skipped or said wrongly, as indexes
   *  counted like `revealedWordCount` — shown red on the question card. */
  mistakeWordIndexes: Set<number>;
  /** The same red words as `sura:aya:position` keys, for the Mushaf context
   *  viewer. */
  mistakePositions: Set<string>;
  /** The matcher's live position within the target verse; null when idle.
   *  Used to drive the green "you said this" highlight. */
  livePosition: RecitePosition | null;
  /**
   * Starts listening: bounded to the single target verse, accepting either a
   * full-verse or hidden-portion-only recitation. `displayedPortion` is the
   * verse text already shown to the user (used to locate where the hidden
   * portion begins).
   */
  startVerseMode: (question: {
    sura: number;
    aya: number;
    page: number;
    displayedPortion: string;
  }) => Promise<void>;
  /** Stops the mic. The attempt's green and red words stay (and
   *  isVerseComplete stays readable) until reset() or the next
   *  startVerseMode. */
  stop: () => void;
  /** Stops the mic and clears the attempt — call on Next, Skip, a typed
   *  answer, or any other question change. */
  reset: () => void;
}

/** Consecutive non-matching finals before surfacing the "didn't catch that"
 *  hint — short enough to feel responsive, long enough that one garbled
 *  word doesn't flash a warning. */
const NO_MATCH_HINT_STREAK = 3;

const SILENCE_TIMEOUT_MS = 10000;

/** How many of the verse's word-tokens are actually recitable — i.e. the
 *  matcher's token count minus the trailing ayah-end marker. That marker is
 *  the last `charType === "end"` entry and its text is the ayah-number glyph
 *  (Arabic-Indic digits, e.g. "٢٦٦"), which the reciter never speaks, so the
 *  matcher's wordIndex tops out one short of `verseWordCount`. Completion
 *  must gate on THIS count, not verseWordCount, or it can never fire. */
function recitableWordCount(verse: Verse): number {
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  if (words.length === 0) return 0;
  const last = words[words.length - 1];
  // The ayah marker's text is only Arabic-Indic digits (٠-٩) once whitespace
  // is stripped. If so, it's not a spoken word — exclude it.
  const lastText = (last.text_uthmani || "").replace(/\s+/g, "");
  const isAyahMarker = lastText.length > 0 && /^[٠-٩]+$/.test(lastText);
  return isAyahMarker ? words.length - 1 : words.length;
}

/** Finds how many of `verse`'s words the already-displayed `snippet` text
 *  covers, by accumulating the verse's own words (diacritic-stripped) until
 *  their combined length reaches the snippet's — same technique
 *  MushafContextViewer uses to align a hint snippet to word boundaries. */
function snippetWordCount(verse: Verse, snippet: string): number {
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  const target = removeDiacritics(snippet).replace(/\s+/g, "");
  if (!target) return 0;
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    acc += removeDiacritics(words[i].text_uthmani || "").replace(/\s+/g, "");
    if (acc.length >= target.length) return i + 1;
  }
  return 0;
}

export function useQuizRecite(
  /** Called once the target verse has been fully recited (session keeps running). */
  onVerseComplete: () => void,
): UseQuizReciteResult {
  const { t } = useLang();
  const [status, setStatus] = useState<QuizReciteStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [revealedWordCount, setRevealedWordCount] = useState(0);
  const [mistakeWordIndexes, setMistakeWordIndexes] = useState<Set<number>>(new Set());
  const [mistakePositions, setMistakePositions] = useState<Set<string>>(new Set());
  const [livePosition, setLivePosition] = useState<RecitePosition | null>(null);
  const [isVerseComplete, setIsVerseComplete] = useState(false);

  const targetRef = useRef<{
    sura: number;
    aya: number;
    /** Total tokens the matcher sees for this verse, INCLUDING the trailing
     *  ayah-end marker (which is a token but is never spoken/matched). */
    wordCount: number;
    /** Words the reciter can actually say = wordCount minus the ayah marker.
     *  Completion is measured against this. */
    completeAt: number;
  } | null>(null);
  // Word count of the already-displayed snippet within the target verse —
  // recited words up to here are the shown prompt and reveal nothing new.
  const snippetWordsRef = useRef(0);
  const verseRef = useRef<Verse[]>([]);
  const trackerRef = useRef<ReciteTracker | null>(null);
  const verseCompletedRef = useRef(false);
  const onVerseCompleteRef = useRef(onVerseComplete);
  onVerseCompleteRef.current = onVerseComplete;

  const activeRef = useRef(false);
  const recordingRef = useRef(false);
  const streamRef = useRef<SttStreamHandle | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechAtRef = useRef(0);
  const noMatchStreakRef = useRef(0);
  const stopRef = useRef<() => void>(() => {});

  // Shows a tracker state. Interims show immediately, with no holdback: in a
  // quiz the user recites known text and wants each word the instant it
  // matches — the aligner itself never reveals past the last word said.
  const showState = useCallback((state: TrackerState) => {
    const target = targetRef.current;
    if (!target) return;
    const progress = quizProgress(state, target, snippetWordsRef.current);
    setRevealedWordCount(progress.revealedWordCount);
    setMistakeWordIndexes(progress.mistakeWordIndexes);
    setMistakePositions(markPositionKeys(state.marks));
    setLivePosition(state.cursor);
    if (progress.complete !== verseCompletedRef.current) {
      verseCompletedRef.current = progress.complete;
      setIsVerseComplete(progress.complete);
      if (progress.complete) onVerseCompleteRef.current();
    }
  }, []);

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    recordingRef.current = false;
    streamRef.current?.stop();
    streamRef.current = null;
    clearDurationTimer();
    trackerRef.current = null;
    setRecordingSeconds(0);
    setLastChunkText("");
    setNoMatchHint(false);
    // NB: the attempt's revealed words, red words and isVerseComplete are
    // intentionally kept — the quiz reads isVerseComplete right after
    // stopping to decide correct/open, and the card keeps showing the
    // attempt. reset() (or the next startVerseMode) clears them.
    setStatus("idle");
  }, [clearDurationTimer]);
  stopRef.current = stop;

  const reset = useCallback(() => {
    stop();
    targetRef.current = null;
    snippetWordsRef.current = 0;
    verseRef.current = [];
    verseCompletedRef.current = false;
    setIsVerseComplete(false);
    setRevealedWordCount(0);
    setMistakeWordIndexes(new Set());
    setMistakePositions(new Set());
    setLivePosition(null);
  }, [stop]);

  /** Shared session bring-up once the target verse is set: opens the
   *  Deepgram stream and wires it to `handleEvent`. */
  const beginSession = useCallback(
    async (handleEvent: (text: string, isFinal: boolean, words?: SttWord[]) => void) => {
      // Recite matching runs on a live streaming STT service. Check before
      // asking for the microphone, so an offline user gets a clear reason
      // instead of a mic prompt followed by a socket failure.
      if (!(await isNetworkReachable())) {
        setMicError(t.offline.recite);
        setStatus("mic-error");
        activeRef.current = false;
        recordingRef.current = false;
        return;
      }

      recordingRef.current = true;
      setRecordingSeconds(0);
      lastSpeechAtRef.current = Date.now();
      setStatus("recording");

      try {
        const handle = await openSttStream(
          (event) => {
            if (!activeRef.current || !recordingRef.current) return;
            const text = event.text.trim();
            if (text) {
              setLastChunkText(text);
              lastSpeechAtRef.current = Date.now();
            }
            handleEvent(text, event.isFinal, event.words);
          },
          (message) => {
            if (!recordingRef.current) return;
            setMicError(message);
            stopRef.current();
          },
        );
        if (!activeRef.current) {
          handle.stop();
          return;
        }
        streamRef.current = handle;
      } catch (err) {
        setMicError(err instanceof Error ? err.message : "Microphone access denied");
        setStatus("mic-error");
        activeRef.current = false;
        recordingRef.current = false;
        return;
      }

      durationTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
        if (Date.now() - lastSpeechAtRef.current >= SILENCE_TIMEOUT_MS) {
          stopRef.current();
        }
      }, 1000);
    },
    [t],
  );

  const startVerseMode = useCallback(
    async (question: { sura: number; aya: number; page: number; displayedPortion: string }) => {
      reset();
      noMatchStreakRef.current = 0;
      setNoMatchHint(false);
      setMicError(null);

      const pageVerses = await getPage(question.page);
      const target = pageVerses.find(
        (v) => v.sura === question.sura && v.aya === question.aya,
      );
      if (!target) return;

      activeRef.current = true;
      verseRef.current = [target];
      targetRef.current = {
        sura: question.sura,
        aya: question.aya,
        wordCount: verseWordCount(target),
        completeAt: recitableWordCount(target),
      };

      const hiddenStart = snippetWordCount(target, question.displayedPortion);
      snippetWordsRef.current = hiddenStart;
      const verseStart = firstWordPosition(target);
      const hiddenStartPos: RecitePosition = {
        sura: question.sura,
        aya: question.aya,
        wordIndex: hiddenStart,
      };
      // Either start point is fine: the shown snippet may be recited or
      // skipped (a free start up to the hidden part), and a word missed
      // inside it is never marked.
      trackerRef.current = createReciteTracker(
        { cursor: verseStart, marks: new Map() },
        { freeStartUntil: hiddenStartPos, protectBefore: hiddenStartPos },
      );
      setLivePosition(verseStart);
      setStatus("armed");

      await beginSession((text, isFinal, words) => {
        const tracker = trackerRef.current;
        if (!tracker || (!text && !isFinal)) return;
        const spoken = spokenWordsFrom(text, words);
        const result = isFinal
          ? tracker.onFinal(spoken, verseRef.current)
          : tracker.onPartial(spoken, verseRef.current);
        showState(result.state);
        if (result.saidTotal > 0) {
          noMatchStreakRef.current = 0;
          setNoMatchHint(false);
          return;
        }
        if (!text || !isFinal) return;
        noMatchStreakRef.current += 1;
        if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) setNoMatchHint(true);
      });
    },
    [beginSession, reset, showState],
  );

  // Clean up if the component unmounts mid-recording (e.g. exiting the quiz).
  const stopOnUnmountRef = useRef(stop);
  stopOnUnmountRef.current = stop;
  useEffect(() => () => stopOnUnmountRef.current(), []);

  useEffect(() => {
    if (micError) setStatus("mic-error");
  }, [micError]);

  return {
    status,
    isRecording: status === "recording",
    isArmed: status === "armed" || status === "recording",
    micError,
    recordingSeconds,
    lastChunkText,
    noMatchHint,
    isVerseComplete,
    revealedWordCount,
    mistakeWordIndexes,
    mistakePositions,
    livePosition,
    startVerseMode,
    stop,
    reset,
  };
}
```

- [ ] **Step 6: Wire the two quiz pages and the context viewer**

`src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx` — `reset()` on a typed answer, Skip and Next (the mic toggle and closing the context keep `stop()`); red words on the card; red words to the context viewer:

Edit 1 — replace:

```tsx
  const handleSubmit = useCallback(() => {
    if (!userAnswer.trim() || answered || !q) return;
    recite.stop(); // typing an answer abandons any in-progress recite session
    const correctAnswer = (q.hiddenPortion ?? q.correctAnswer ?? "").trim();
    const user = userAnswer.trim();
```

with:

```tsx
  const handleSubmit = useCallback(() => {
    if (!userAnswer.trim() || answered || !q) return;
    recite.reset(); // typing an answer abandons any recite attempt
    const correctAnswer = (q.hiddenPortion ?? q.correctAnswer ?? "").trim();
    const user = userAnswer.trim();
```

Edit 2 — replace:

```tsx
  const handleSkip = () => {
    if (answered || !q) return;
    recite.stop();
    setSkipped(true);
    setAnswered(true);
```

with:

```tsx
  const handleSkip = () => {
    if (answered || !q) return;
    recite.reset();
    setSkipped(true);
    setAnswered(true);
```

Edit 3 — replace:

```tsx
  const handleNext = () => {
    recite.stop();
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
```

with:

```tsx
  const handleNext = () => {
    recite.reset();
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
```

Edit 4 — replace:

```tsx
                        </p>
                        {/* Hidden-portion words revealed so far, per word:
                            recited words are green, hint-button words use the
                            hint style. Recitation and hints are independent —
                            a word can come from either source. */}
                        {(() => {
                          const words = (q.hiddenPortion ?? q.correctAnswer ?? "")
```

with:

```tsx
                        </p>
                        {/* Hidden-portion words revealed so far, per word:
                            recited words are green, words skipped or said
                            wrongly are red, hint-button words use the hint
                            style. Recitation and hints are independent — a
                            word can come from either source. */}
                        {(() => {
                          const words = (q.hiddenPortion ?? q.correctAnswer ?? "")
```

Edit 5 — replace:

```tsx
                                  key={i}
                                  className={
                                    i < recite.revealedWordCount
                                      ? "aa-recited-inline"
                                      : "aa-hint-inline"
                                  }
                                >
```

with:

```tsx
                                  key={i}
                                  className={
                                    recite.mistakeWordIndexes.has(i)
                                      ? "aa-mistake-inline"
                                      : i < recite.revealedWordCount
                                        ? "aa-recited-inline"
                                        : "aa-hint-inline"
                                  }
                                >
```

Edit 6 — replace:

```tsx
                  mode="sidebar"
                  liveRecitePosition={recite.isArmed ? recite.livePosition : null}
                />
              </div>
```

with:

```tsx
                  mode="sidebar"
                  liveRecitePosition={recite.isArmed ? recite.livePosition : null}
                  reciteMistakes={recite.mistakePositions}
                />
              </div>
```

`src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.css`:

Edit 1 — replace:

```css
  font-weight: 600;
}
.prompt {
  color: var(--color-text-muted);
```

with:

```css
  font-weight: 600;
}
/* Words the reciter skipped or said wrongly — red with a dotted underline
   (the underline keeps them distinct from green for readers who can't tell
   the two colours apart). */
.aa-mistake-inline {
  font-family: var(--font-arabic-display);
  font-size: clamp(0.9rem, 2.5vw, 1.1rem);
  color: #d32f2f;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.3em;
}
[data-theme="night"] .aa-mistake-inline {
  color: #ff6b6b;
}
.prompt {
  color: var(--color-text-muted);
```

`src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx` — same changes; the context viewer shows marks only for the target verse (`selectedVerseIdx === 0`):

Edit 1 — replace:

```tsx
  const handleSubmit = useCallback(() => {
    if (!userAnswer.trim() || answered || !q) return;
    recite.stop(); // typing an answer abandons any in-progress recite session
    const isCorrect = checkMutashabihatAnswer(userAnswer, q);
    setCorrect(isCorrect);
```

with:

```tsx
  const handleSubmit = useCallback(() => {
    if (!userAnswer.trim() || answered || !q) return;
    recite.reset(); // typing an answer abandons any recite attempt
    const isCorrect = checkMutashabihatAnswer(userAnswer, q);
    setCorrect(isCorrect);
```

Edit 2 — replace:

```tsx
  const handleSkip = () => {
    if (answered || !q) return;
    recite.stop();
    setSkipped(true);
    setAnswered(true);
```

with:

```tsx
  const handleSkip = () => {
    if (answered || !q) return;
    recite.reset();
    setSkipped(true);
    setAnswered(true);
```

Edit 3 — replace:

```tsx
  const handleNext = () => {
    recite.stop();
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
```

with:

```tsx
  const handleNext = () => {
    recite.reset();
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
```

Edit 4 — replace:

```tsx
                        </p>
                        {/* Hidden-portion words revealed so far, per word:
                            recited words are green, hint-button words use the
                            hint style. Recitation and hints are independent. */}
                        {(() => {
                          const shown = Math.max(hintLevel, recite.revealedWordCount);
```

with:

```tsx
                        </p>
                        {/* Hidden-portion words revealed so far, per word:
                            recited words are green, words skipped or said
                            wrongly are red, hint-button words use the hint
                            style. Recitation and hints are independent. */}
                        {(() => {
                          const shown = Math.max(hintLevel, recite.revealedWordCount);
```

Edit 5 — replace:

```tsx
                                  key={i}
                                  className={
                                    i < recite.revealedWordCount
                                      ? "mst-recited-inline"
                                      : "mst-hint-inline"
                                  }
                                >
```

with:

```tsx
                                  key={i}
                                  className={
                                    recite.mistakeWordIndexes.has(i)
                                      ? "mst-mistake-inline"
                                      : i < recite.revealedWordCount
                                        ? "mst-recited-inline"
                                        : "mst-hint-inline"
                                  }
                                >
```

Edit 6 — replace:

```tsx
                    recite.isArmed && selectedVerseIdx === 0 ? recite.livePosition : null
                  }
                />
              </div>
```

with:

```tsx
                    recite.isArmed && selectedVerseIdx === 0 ? recite.livePosition : null
                  }
                  reciteMistakes={selectedVerseIdx === 0 ? recite.mistakePositions : undefined}
                />
              </div>
```

`src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.css`:

Edit 1 — replace:

```css
  font-weight: 600;
}

.mst-prompt {
```

with:

```css
  font-weight: 600;
}
/* Words the reciter skipped or said wrongly — red with a dotted underline
   (the underline keeps them distinct from green for readers who can't tell
   the two colours apart). */
.mst-mistake-inline {
  font-family: var(--font-arabic-display);
  font-size: clamp(0.9rem, 2.5vw, 1.1rem);
  color: #d32f2f;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.3em;
}
[data-theme="night"] .mst-mistake-inline {
  color: #ff6b6b;
}

.mst-prompt {
```

`src/app/shared/components/mushaf-context/MushafContextViewer.tsx`:

Edit 1 — replace:

```tsx
   *  high-water mark, so it stays on screen after recitation stops. */
  liveRecitePosition?: { sura: number; aya: number; wordIndex: number } | null;
}
```

with:

```tsx
   *  high-water mark, so it stays on screen after recitation stops. */
  liveRecitePosition?: { sura: number; aya: number; wordIndex: number } | null;
  /** Recite mistakes on the target verse (`sura:aya:position` keys), shown
   *  red once revealed. */
  reciteMistakes?: Set<string>;
}
```

Edit 2 — replace:

```tsx
  onClose,
  liveRecitePosition,
}) => {
  const { t } = useLang();
```

with:

```tsx
  onClose,
  liveRecitePosition,
  reciteMistakes,
}) => {
  const { t } = useLang();
```

Edit 3 — replace:

```tsx
              grey={greySet}
              partialTarget={partialForPage}
              onVerseTap={handleVerseTap}
              bigTextMode={bigTextMode}
```

with:

```tsx
              grey={greySet}
              partialTarget={partialForPage}
              mistakes={reciteMistakes}
              onVerseTap={handleVerseTap}
              bigTextMode={bigTextMode}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts"`
Expected: only the 9 baseline failures.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/quiz src/app/shared/components/mushaf-context/MushafContextViewer.tsx
git commit -m "Show recite mistakes in quizzes and keep a question open until they are fixed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove the greedy matcher

**Files:**
- Delete: `src/app/core/hooks/recite/deepgram/matchFromPosition.ts`
- Modify: `src/app/core/hooks/recite/shared/reciteCore.ts`
- Modify: `src/app/core/hooks/recite/deepgram/useIdentifySession.ts`

**Interfaces:** removes `matchFromPosition`, `LOOSE_MATCH_MAX_SKIP` and `LOOSE_MATCH_MIN_CONSUMED`; nothing else changes.

- [ ] **Step 1: Confirm nothing uses them**

Run: `git grep -n "matchFromPosition\|LOOSE_MATCH" -- src`
Expected: only `matchFromPosition.ts` itself, the two constants in `reciteCore.ts`, and one comment in `useIdentifySession.ts`.

- [ ] **Step 2: Delete the old matcher and its constants**

Run: `git rm src/app/core/hooks/recite/deepgram/matchFromPosition.ts`

In `src/app/core/hooks/recite/shared/reciteCore.ts`, remove this block (including the blank line after it):

```ts
/** The strict (maxSkip: 0) reveal pass can get permanently stuck when the
 *  STT garbles one expected word — no later input can ever advance past it.
 *  A loose fallback pass may skip a couple of expected words, but only when
 *  it matches at least this many spoken words as evidence the recitation
 *  really is past the stuck word. The skipped word *was* recited (just
 *  misheard), so accepting the fallback never reveals ahead of the reciter. */
export const LOOSE_MATCH_MAX_SKIP = 2;
export const LOOSE_MATCH_MIN_CONSUMED = 3;
```

In `src/app/core/hooks/recite/deepgram/useIdentifySession.ts`:

Edit 1 — replace:

```ts
/**
 * Skip budget for the page-first anchor scan — deliberately larger than the
 * tracking matcher's LOOSE_MATCH_MAX_SKIP. Some verses carry a leading
 * basmalah in the bundled corpus (e.g. An-Naba' 78:1 is stored as "بسم الله
 * الرحمن الرحيم عم يتساءلون"), so the reciter's actual first word can sit
```

with:

```ts
/**
 * Skip budget for the page-first anchor scan — deliberately generous. Some
 * verses carry a leading
 * basmalah in the bundled corpus (e.g. An-Naba' 78:1 is stored as "بسم الله
 * الرحمن الرحيم عم يتساءلون"), so the reciter's actual first word can sit
```

- [ ] **Step 3: Verify**

Run: `git grep -n "matchFromPosition\|LOOSE_MATCH" -- src`
Expected: no output.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts"`
Expected: only the 9 baseline failures.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/core/hooks/recite
git commit -m "Remove the greedy recite matcher replaced by the aligner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification and the device checklist

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit -p tsconfig.json` — expected exit 0.

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` — expected: in files this plan touched, only the pre-existing `getSurahStartPage`, `isSurahStart` (`PageViewer.tsx`) and `showBismillah` (`MushafContextViewer.tsx`).

Run: `CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts"` — expected: 9 failures, all in `trackerLogic.test.ts` and `prayer-times.service.test.ts`; 81 more passing tests than the baseline.

Run: `git grep -n "eslint-disable" -- src/app/core/services/quran src/app/core/hooks/recite src/app/features/quiz/hooks` — expected: no output.

- [ ] **Step 2 (optional): Re-run the whole-Quran checks** — see the appendix. Expected output:

```
1. spelling: { said: 70272, soundAlike: 71, wrong: 1 }
   wrong: 18:77 لَتَّخَذْتَ ↔ لَاتَّخَذْتَ
2. clean sweep: 6216/6216 verses clean
3. injection: skipped 1000/1000, replaced 998/1000 caught exactly
```

- [ ] **Step 3: Hand the device checklist to the user** (they build the app; don't run builds):

1. Recite a passage correctly — nothing turns red.
2. Skip one word and carry on — it turns red about two words later.
3. Say a wrong word and carry on — it turns red.
4. Go back a few words and say the red word correctly — the red clears.
5. Tap "reveal next word" mid-recitation, then keep reciting — the tapped word does not turn red.
6. Recite across a page turn — tracking continues, nothing red.
7. Quiz: finish with a red word and stop — the question stays open with the red word shown; start again, recite it correctly, stop — it counts as correct. Press Next — the new question shows no red.
8. Switch to the night theme — red words are readable and visibly underlined.
9. Watch the console for `[recite-align]` lines; any false red word there becomes a fixture test in `recite-aligner.service.test.ts`.

---

## Appendix: whole-Quran checks (for re-tuning; not committed)

Both scripts live in a scratch folder outside the repo. `fetch-words.js` downloads every page's word-aligned `text_uthmani` and `text_imlaei` from the public Quran.com API (no auth) into `qf-words.json` beside it; `whole-quran-check.ts` then runs the spelling check, the clean sweep and the mistake injection against the modules in the given repo root.

Run from the worktree root:

```bash
node <scratch>/fetch-words.js
npx ts-node --transpile-only -O '{"module":"commonjs"}' <scratch>/whole-quran-check.ts .
```

`fetch-words.js`:

```js
// One-off: fetch word-aligned text_uthmani + text_imlaei for all 604 pages
// from the public Quran.com API into a compact JSON (scratchpad only).
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "qf-words.json");
const PAGES = 604;
const CONCURRENCY = 4;

async function fetchPage(page, attempt = 1) {
  const url =
    `https://api.quran.com/api/v4/verses/by_page/${page}` +
    `?words=true&word_fields=text_uthmani,text_imlaei&per_page=300`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const rows = [];
    for (const v of j.verses) {
      for (const w of v.words) {
        rows.push([v.verse_key, w.position, w.char_type_name, w.text_uthmani, w.text_imlaei, page]);
      }
    }
    return rows;
  } catch (e) {
    if (attempt >= 5) throw new Error(`page ${page}: ${e.message}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return fetchPage(page, attempt + 1);
  }
}

(async () => {
  const results = new Array(PAGES + 1);
  let next = 1;
  async function worker() {
    while (next <= PAGES) {
      const p = next++;
      results[p] = await fetchPage(p);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const all = results.slice(1).flat();
  fs.writeFileSync(OUT, JSON.stringify(all));
  const words = all.filter((r) => r[2] === "word").length;
  console.log(`saved ${all.length} rows (${words} words) to ${OUT}`);
})().catch((e) => {
  console.error("FAILED", e.message);
  process.exit(1);
});
```

`whole-quran-check.ts`:

```ts
// Whole-Quran checks for recite mistake detection (not committed).
// Usage, from the repo (or worktree) root, after fetch-words.js has written
// qf-words.json next to this script:
//   npx ts-node --transpile-only -O '{"module":"commonjs"}' <this file> <repo root>
import * as fs from "fs";
import * as path from "path";

const ROOT = process.argv[2] ?? process.cwd();
const spelling = require(path.resolve(ROOT, "src/app/core/services/quran/recite-spelling.service"));
const aligner = require(path.resolve(ROOT, "src/app/core/services/quran/recite-aligner.service"));

type Row = [string, number, string, string, string, number];
const rows: Row[] = JSON.parse(fs.readFileSync(path.join(__dirname, "qf-words.json"), "utf8"));

// App-shaped verses (inverted charType model: recitable words are "end").
const verses = new Map<string, any>();
const standard = new Map<string, string[]>();
for (const [key, position, type, uthmani, imlaei, page] of rows) {
  const [sura, aya] = key.split(":").map(Number);
  if (!verses.has(key)) {
    verses.set(key, { sura, aya, text: "", page, suraNameAr: "", words: [] });
    standard.set(key, []);
  }
  verses.get(key).words.push({
    position,
    charType: type === "end" ? "word" : "end",
    text_uthmani: uthmani,
    codeV2: "",
    lineNumber: 0,
    pageNumber: page,
  });
  if (type === "word") standard.get(key)!.push(imlaei);
}

function recite(vs: any[], from: any, phrases: string[]) {
  const tracker = aligner.createReciteTracker({ cursor: from, marks: new Map() });
  for (const phrase of phrases) {
    const words = phrase.split(" ").filter(Boolean);
    for (let k = 1; k < words.length; k++) tracker.onPartial(aligner.spokenWordsFrom(words.slice(0, k).join(" ")), vs);
    tracker.onFinal(aligner.spokenWordsFrom(phrase), vs);
  }
  return tracker.committed();
}

// 1. Spelling: each Uthmani word vs its standard spelling (verses where the
//    standard text splits a word are skipped — the aligner's split step covers them).
{
  const multiWord = new Set(
    rows
      .filter((r) => r[2] === "word" && r[4].trim().split(/\s+/).filter((t) => spelling.spokenLetters(t)).length > 1)
      .map((r) => r[0]),
  );
  const tally: Record<string, number> = { said: 0, soundAlike: 0, wrong: 0 };
  const wrong: string[] = [];
  const words = rows.filter((r) => r[2] === "word");
  words.forEach(([key, , , uthmani, imlaei], i) => {
    if (multiWord.has(key)) return;
    const next = words[i + 1]?.[0] === key ? words[i + 1][3] : undefined;
    const skeleton = spelling.uthmaniSkeleton(uthmani, next);
    if (spelling.isUnrecitable(skeleton)) return;
    const verdict = spelling.compareWord(skeleton, imlaei);
    tally[verdict]++;
    if (verdict === "wrong") wrong.push(`${key} ${uthmani} ↔ ${imlaei}`);
  });
  console.log("1. spelling:", tally, wrong.length ? `\n   wrong: ${wrong.join("\n          ")}` : "");
}

// 2. Clean sweep: every verse recited in standard spelling, 12-word phrases.
{
  const lonely = /^(2|3|7|1[0-5]|19|20|2[6-9]|3[0-2]|36|38|4[0-6]|50|68):1$|^42:2$/; // lone muqatta'at verses
  const flagged: string[] = [];
  let count = 0;
  for (const [key, v] of verses) {
    const recitable = v.words.filter((w: any) => w.charType === "end").length;
    if (recitable === 1 && lonely.test(key)) continue;
    const words = standard.get(key)!.join(" ").split(/\s+/).filter(Boolean);
    const phrases: string[] = [];
    for (let k = 0; k < words.length; k += 12) phrases.push(words.slice(k, k + 12).join(" "));
    const s = recite([v], { sura: v.sura, aya: v.aya, wordIndex: 0 }, phrases);
    count++;
    if (s.marks.size > 0 || s.cursor.aya !== v.aya || s.cursor.wordIndex !== recitable) flagged.push(key);
  }
  console.log(`2. clean sweep: ${count - flagged.length}/${count} verses clean`, flagged.length ? flagged.slice(0, 20) : "");
}

// 3. Injection: one skipped or replaced word per verse, seeded sampling.
{
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const keys = [...verses.keys()].filter((k) => {
    const n = verses.get(k).words.filter((w: any) => w.charType === "end").length;
    const std = standard.get(k)!;
    return n >= 6 && std.length === n && std.every((t) => !/\s/.test(t.trim()));
  });
  const pool = [...standard.values()].flat();
  let skipped = 0;
  let replaced = 0;
  const N = 1000;
  for (let s = 0; s < N; s++) {
    const key = keys[Math.floor(rand() * keys.length)];
    const v = verses.get(key);
    const words = standard.get(key)!;
    const k = 1 + Math.floor(rand() * (words.length - 3));
    const target = `${v.sura}:${v.aya}:${k}`;
    const start = { sura: v.sura, aya: v.aya, wordIndex: 0 };
    const a = recite([v], start, [[...words.slice(0, k), ...words.slice(k + 1)].join(" ")]);
    if (a.marks.has(target) && a.marks.size === 1) skipped++;
    const other = pool[Math.floor(rand() * pool.length)];
    const b = recite([v], start, [[...words.slice(0, k), other, ...words.slice(k + 1)].join(" ")]);
    if (b.marks.has(target) && b.marks.size === 1) replaced++;
  }
  console.log(`3. injection: skipped ${skipped}/${N}, replaced ${replaced}/${N} caught exactly`);
}
```
