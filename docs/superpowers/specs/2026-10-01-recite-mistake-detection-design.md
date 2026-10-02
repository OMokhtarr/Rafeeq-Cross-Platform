# Recite Mode Mistake Detection — Design

Date: 2026-10-01 (amended 2026-10-02 while planning — see "Amendments from planning")
Status: Approved; implementation plan in `docs/superpowers/plans/2026-10-02-recite-mistake-detection.md`
Branch: `recite-mistake-detection`, off `main`

## Problem

Two reported failures in recite mode (Mushaf viewer and quiz recite):

1. Saying a **wrong word** inside an otherwise correct sentence is not detected.
2. **Skipping a word or two** and carrying on is often not detected, and the
   skipped words are revealed as if they had been recited.

Both reproduce deterministically. Replaying Deepgram-style partial results and
finals through the real `matchFromPosition`, starting at 2:3 word 0:

| Recited | Shown as recited but never said |
|---|---|
| الذين يؤمنون ويقيمون الصلاة ومما رزقناهم ينفقون (skip بالغيب) | بِٱلْغَيْبِ |
| الذين يؤمنون الصلاة ومما رزقناهم ينفقون (skip two words) | بِٱلْغَيْبِ، وَيُقِيمُونَ, **plus 6 words of 2:4** (وَٱلَّذِينَ … وَمَآ) |
| الذين يؤمنون بالحق ويقيمون … (wrong word) | بِٱلْغَيْبِ |
| الذين يؤمنون ‖ ويقيمون … (skip at a pause) | بِٱلْغَيْبِ |
| 2:5 ending هم الخاسرون, then 2:6 | ٱلْمُفْلِحُونَ |

## Root causes

1. **Every gap is assumed to be a recognition error.** When the strict pass
   (`maxSkip: 0`) stalls, a loose pass (`maxSkip: 3`) steps over unmatched
   verse words once 3 later words match, and they are revealed as recited
   (`hooks/recite/deepgram/matchFromPosition.ts:62-88`). The rationale in
   `hooks/recite/shared/reciteCore.ts:59-66` — "the skipped word *was*
   recited (just misheard)" — is false whenever the reciter actually skipped
   or substituted it.
2. **Word comparison forgives real one-letter mistakes.** `wordsMatch`
   (`services/quran/recite-matcher.service.ts:56-63`) allows one edit for any
   word up to 6 letters, so يعلمون/تعلمون, عليم/عظيم, قال/قل, ربك/ربكم,
   عليهم/عليكم and فيه/فيها all match. The slack exists because diacritic-
   stripped Uthmani spelling differs from Deepgram's standard spelling
   (الكتب/الكتاب, العلمين/العالمين): `removeDiacritics` deletes the dagger
   alif (9,838 occurrences) and leaves ۥ (1,257), ۦ (957) and tatweel in.
3. **Partial results are matched twice.** Each Deepgram partial result repeats
   the whole phrase so far, and `deepgramDriver.ts:153-156` re-matches all of
   it from the position the previous partial advanced to. Already-used words
   get a second chance further ahead. In the replay, "الذين يؤمنون" from 2:3
   matched 2:4's "والذين يؤمنون": the reveal jumped 8 words ahead of the
   reciter, 6 of which (in 2:4) were never said at all.
4. **The page cannot show a mistake.** Recite progress is one cursor —
   everything before it shown, everything after hidden
   (`hooks/useReciteMode.ts:171-192`). A detected mistake could only freeze the
   reveal or show as correct.

Quiz recite (`features/quiz/hooks/useQuizRecite.ts`) uses the same matcher and
inherits all four.

## Decisions

Made with the user during design:

- **Display:** a missed or wrong word is **revealed in red**; the reveal keeps
  following the reciter. Re-reciting the word correctly clears the red.
- **Strictness: Balanced** — flag skipped words and real letter changes
  (يعلمون→تعلمون, ربك→ربكم, a missing or extra leading و/ف); forgive
  sound-alike letters and words Deepgram itself was unsure of.
- **Quiz:** red words keep the question open. Only a recitation with no red
  words left counts as correct; a false alarm never costs the answer.
- **Approach:** replace the greedy matcher with an alignment tracker (below).
  The alternative — patching the greedy scan and colouring its skips red — was
  rejected: it cannot tell an extra word from a skip, so a stray word that
  happens to match a few words ahead would turn the words in between red.

## Amendments from planning (2026-10-02)

Planning prototyped the design and checked it against the whole Quran (using
Quran.com's word-aligned `text_uthmani` and `text_imlaei`). These results
changed details below; the sections have been updated to match.

- **More spelling rules.** The whole-Quran check found patterns the original
  table missed: ىٰ mid-word written ا; ٱلَّ taking an optional second ل;
  an optional alif after a word-final و; ۥ ۦ treated as optional letters
  rather than dropped (they are real letters in داوود، يحيي); ى with a kasra
  standing for يي; the connecting alif after a leading و/ف (واسألوا); a
  word-final ا also accepting ى; ءَا written آ; a leading لْ taking an optional
  ا; and the vocative يـٰ dropping softly when Deepgram puts يا in the previous
  phrase.
- **Two irregular words are lenient.** لَتَّخَذْتَ (18:77) and يَبْنَؤُمَّ
  (20:94) match no rule, so they are never marked. They are matched by their
  letters, because word positions differ between data sources.
- **Merges and splits must match exactly**, and cost 0.05 more than one-to-one
  matches. A sound-alike join let a skipped أَن vanish into its neighbour
  (9:113). When joining two spoken words, the form with an assimilated final
  ن is also tried (وأن لو ↔ وَأَلَّوِ).
- **Muqatta'at absorb spoken words at 0.05 each**, so they can't swallow the
  rest of their verse (10:1).
- **`LOOKAHEAD` is 60** (was 40), leaving room for a long phrase Deepgram has
  not finalized yet. It costs about 1.5 ms per alignment.
- **Red is #d32f2f by day, with a dotted underline.** #e53935 gives 4.2:1 on
  the white page, below the 4.5:1 the quiz cards' ~16px text needs; #d32f2f
  gives 5.0:1. Night is #ff6b6b (6.3:1 on #1a1a1a). The underline is a
  non-colour cue for readers who can't tell this red from the green recited
  highlight. No glow.
- **Interfaces settled:**
  - `compareWord(expected, spoken, confidence?)`, with the tajweed join context
    built into `uthmaniSkeleton(uthmani, nextUthmani?)`.
  - `tracker.reset(state, options?)`.
  - `AlignOptions { freeStartUntil?, protectBefore? }`.
- **The quiz uses `freeStartUntil` + `protectBefore`** set to the hidden part's
  start, instead of trying two seed positions. The shown snippet may be
  recited or skipped, and is never marked.
- **The manual reveal buttons move the tracker too** (`ReciteDriver.moveCursor`),
  so words revealed by tapping are not later marked as skipped.
- **Measured results:**
  - Spelling: of 70,344 words in verses that line up word-for-word, 70,272 are
    *said*, 71 *sound-alike* and 1 *wrong* (18:77, handled as lenient).
  - Clean recitation: all 6,216 verses, recited in 12-word phrases, produce no
    red words.
  - Injected mistakes in 1,000 random verses: 1,000/1,000 skipped words and
    998/1,000 wrong words marked exactly. The two misses are an ع/ا swap that
    Balanced forgives, and a replacement that was the same word.

## Amendments from the final review (2026-10-02)

A fresh review of the finished branch found faults that no test covered. Each
fix below started from a test that failed first. The sections below have been
updated to match.

- **A word said between a slip and a pause turned red too.** The committed
  state kept only the cursor and the marks. Take "…وأولئك هو المفلحون" and a
  pause, with هو said for هُمُ. The cursor waited at the slip, and the next
  phrase counted the correctly said المفلحون as missed. The state now keeps
  `pending`: what a phrase found for the words past the cursor. A later
  phrase passes over those words at no cost and keeps their outcome (see
  Result rules).
- **The same happened after a skip, for a different reason.** At a phrase's
  end, dropping the last word as extra (0.7) cost less than a skip followed
  by that word (0.8), so the word was never recorded. The phrase's last word
  now costs `LAST_EXTRA_COST` (0.9) as an extra word.
- **The quiz could not clear a red word more than 10 words back.** After
  finishing a long verse with an early red word, the question could only be
  left open or restarted. The quiz now restarts anywhere in its verse
  (`restartAnywhere`).
- **Quiz cards put the red on the wrong word.** The verse text carries each
  pause mark as a space-separated token of its own, so the card's token i was
  not word i. A red mark landed on a pause mark or a neighbouring word, and
  the word said wrongly showed green. `hiddenCardTokens` now maps tokens to
  words. Across all 6,236 verses, the lettered tokens match the word count in
  6,232. The other four (2:181, 8:6, 13:37, 37:130) write one word as two
  tokens, so their card can still be one token off after that word.
- **Measured** with a new whole-Quran check (in the plan's appendix). In
  1,000 random verses the second-to-last word is skipped or replaced, the
  verse ends the phrase, and the next verse follows.
  - Before these fixes, 0/1,000 skips and 0/1,000 replacements were marked
    exactly: the correctly said last word always turned red as well.
  - After: 999/1,000 and 989/1,000. Of the misses, 8 replacements were the
    same word, 1 was a spelling the rules accept (لي for لا), and 1 a
    forgiven sound-alike (إن for عن). The other 2 (one skip, one replacement)
    are in 56:26, where the verse repeats سلاما and the other copy was marked.
  - The earlier checks are unchanged: 70,272 / 71 / 1, 6,216/6,216, and
    1,000/1,000 and 998/1,000.

## Design

### 1. Word comparison — `services/quran/recite-spelling.service.ts`

A new pure module. It reduces verse words and spoken words to comparable
skeletons and classifies a pair.

**Uthmani skeleton (verse words).** Starting from `text_uthmani`:

| Uthmani feature | Rule | Example |
|---|---|---|
| Tashkeel, waqf and annotation marks | Removed (as `removeDiacritics` does today) | |
| Dagger alif ٰ (U+0670) | **Optional alif**: matches with or without ا | الكتٰب ↔ الكتاب / الكتب; العٰلمين; رزقنٰهم |
| و followed by dagger alif | Matches و **or** ا | الصلوٰة ↔ الصلاة; الزكوٰة; الحيوٰة |
| Letter followed by ۟ (U+06DF) or ۠ (U+06E0) | Letter becomes optional (silent) | أو۟لٰٓئك ↔ أولئك; مِا۟ئة ↔ مائة / مئة |
| Small waw ۥ, small yeh ۦ, small high yeh ۧ, small high noon ۨ (U+06E5–E8) | Optional و / ي / ي / ن | حولهۥ ↔ حوله; داوۥد ↔ داوود; إبرٰهـۧم ↔ إبراهيم; نُـۨجِى ↔ ننجي |
| Tatweel ـ (U+0640) | Removed | |
| Hamza above (U+0654) on a tatweel | Optional hamza seat | يسـَٔلونك ↔ يسألونك; الـَٔاخرة ↔ الآخرة |
| ى + dagger alif mid-word | Matches ى **or** ا | هدىٰكم ↔ هداكم; التورىٰة ↔ التوراة |
| ٱلَّ (article ل merged with a root ل) | Optional second ل | ٱلَّيل ↔ الليل, while ٱلَّذين ↔ الذين |
| ى carrying a kasra | Optional extra ي | يُحْىِ ↔ يحيي |
| Leading و/ف before a sukun letter | Optional connecting ا | وَسْـَٔلوا ↔ واسألوا |
| Leading لْ | Optional ا before it | لْـَٔيْكَة ↔ الأيكة |
| ءَا | Hamza optional | ءامنوا ↔ آمنوا |
| Word-final ا | Also accepts ى | رءا ↔ رأى; طغا ↔ طغى |
| Word-final و | Optional ا after it | جآءو ↔ جاءوا |
| Vocative يـٰ at the start | ي may drop at sound-alike cost | يَـٰقَوْمِ ↔ قوم (يا heard in the previous phrase) |

**Both sides:** أ إ آ ٱ → ا; ؤ ئ ء → one hamza letter; ى → ي; ة → ه;
whitespace collapsed.

**Unrecitable tokens.** A verse token whose skeleton is empty or only
Arabic-Indic digits (the ayah-number marker some data paths carry as a word)
is never expected to be spoken and never flagged.

**Muqatta'at.** These verse words are **lenient**: they may align to zero to
five spoken tokens at no cost and are never flagged, because Deepgram spells
them out as letter names. The set is defined **by position**, not by
spelling:

- word 0 of verse 1 of surahs 2, 3, 7, 10–15, 19, 20, 26–32, 36, 38, 40–46,
  50 and 68 (29 surahs);
- word 0 of 42:2 (عسق), which `deepgram/muqattaat.ts`'s
  `CANONICAL_OPENERS` lacks.

A spelling lookup would also catch أَلَمْ, which opens 94:1, 105:1 and 105:2
with the same skeleton as الٓمٓ (checked against `quran-text.json`).

**Irregular spellings.** لَتَّخَذْتَ (18:77) and يَبْنَؤُمَّ (20:94) are lenient
too, matched by their letters.

**Verdict** — `compareWord(expected, spoken, confidence?)` returns one of the
following. The tajweed join context is built into
`uthmaniSkeleton(uthmani, nextUthmani?)`.

- `said` — skeletons equal (optional letters may be present or absent).
- `soundAlike` — differs only by letters in one of these groups: ص/س,
  ض/د/ظ, ط/ت, ذ/ز, ث/س, ق/ك, ح/ه, ع/ء/ا, and hamza-seat variants (ء/ا/و/ي).
  At most one such difference when the verse word's skeleton has up to 4
  letters, two when it is longer. Counts as correctly said.
- `soundAlike` also covers **tajweed at word joins**: a word-final ن before a
  word starting with ر ل م ن ي و (idgham) or ب (iqlab, heard as م) may be
  missing, heard as that next letter, or heard as م.
- `soundAlike` also covers a **low-confidence near miss**: exactly one other
  letter difference when Deepgram's confidence for that word is below
  `LOW_CONFIDENCE`.
- `wrong` — anything else, including one-letter changes outside the groups
  above (يعلمون/تعلمون, ربك/ربكم, عليهم/عليكم, فيه/فيها, قال/قل, عليم/عظيم,
  a missing or extra leading و/ف).

`normalizeArabic`, `wordsMatch`, `matchTranscript` and `scoreCorpusAnchors`
stay unchanged: whole-Quran identify should remain forgiving.

### 2. Alignment — `services/quran/recite-aligner.service.ts`

A new pure module with two layers.

**`alignPhrase(state, spoken, verses)`** aligns one phrase.

- `state` is the committed tracker state: `cursor` (a `RecitePosition`, one
  past the last word said — today's convention) and `marks` (the red words,
  keyed `sura:aya:wordIndex`, `wordIndex` counting recitable words as
  `RecitePosition` does).
- `spoken` is the phrase's words, each with an optional Deepgram confidence.
- The expected window runs from `RESTART_WINDOW` words before the cursor to
  `LOOKAHEAD` words after it, crossing verse and page boundaries through the
  combined verse list as today, with unrecitable tokens removed.

A dynamic-programming alignment picks the cheapest explanation using:

| Step | Meaning | Cost |
|---|---|---|
| said | verse word ↔ spoken word, verdict `said` | 0 |
| sound-alike | verdict `soundAlike` | `SOUND_ALIKE_COST` |
| wrong | verse word ↔ spoken word, verdict `wrong` | `WRONG_COST` |
| missed | verse word, nothing spoken | `MISSED_COST` |
| kept | a pending verse word passed over again (see Result rules) | 0 |
| extra | spoken word, no verse word | `EXTRA_COST`; the phrase's last word `LAST_EXTRA_COST` |
| merged | one spoken word ↔ two verse words of one verse, concatenation exactly `said` | `JOIN_COST` |
| split | two spoken words ↔ one verse word, concatenation (or with the first word's final ن assimilated) exactly `said` | `JOIN_COST` |
| lenient | muqatta'at or irregular verse word ↔ 0–5 spoken words | `LENIENT_TOKEN_COST` per word |

- **Open end.** Verse words after the last aligned spoken word are "not
  reached yet", never missed.
- **Restarts.** The alignment may begin up to `RESTART_WINDOW` words *before*
  the cursor, at `RESTART_COST_PER_WORD` per word, so going back a few words
  after a breath or to fix a slip aligns as a restart instead of as extra
  words. With `restartAnywhere` (the quiz) it may begin anywhere in the
  verses, and going back further than `RESTART_WINDOW` words costs the same
  as going back `RESTART_WINDOW` words.
- **Last word.** Deepgram ends a phrase at a pause, after a word the reciter
  said, so the phrase's last word costs `LAST_EXTRA_COST` as an extra word:
  more than `MISSED_COST`, so "…وأولئك المفلحون" with هُمُ skipped places
  المفلحون after the skip; less than `WRONG_COST`, so a stray last word is not
  forced onto the next verse word.

**Result rules.** *Correctly said* means aligned as `said` or `soundAlike`,
including merged and split. Lenient words are transparent: they neither
count as said nor confirm a gap, and the cursor passes them when a later word
is said.

- **Gap:** a run of consecutive verse words aligned `wrong` or `missed`.
- **Confirmed gap:** at least `CONFIRM_AFTER` correctly said verse words follow
  it, before the next gap.
- **New cursor:** one past the last correctly said verse word *before the first
  unconfirmed gap*. It is never behind the committed cursor. Words in an
  unconfirmed gap are pending: not marked, and not revealed.
- **Pending words.** The state keeps what the phrase found for each word past
  the new cursor (`pending`: said, or in an unconfirmed gap). A later phrase
  may pass over a pending word at no cost (`kept`), and the word keeps that
  outcome. So a word said between a slip and a pause is not counted missed
  when the reciter carries on, and the slip's gap is confirmed by it. Once the
  word before them is said, the cursor also moves past pending words that were
  said. A forward relocation does not mark pending words that were said.
- **Marks are created** for the words of confirmed gaps at or after the
  committed cursor.
- **Marks are cleared** for any verse word aligned as correctly said, including
  inside a restart.
- **Re-recited words** (inside a restart, before the committed cursor) are
  never newly marked.
- The result also reports `newSaid` (correctly said verse words beyond the
  committed cursor) and a per-word trace for logging.

**`createReciteTracker()`** is a small stateful wrapper that both the Mushaf
driver and the quiz use, so phrase handling lives in one place:

- `onPartial(spoken)` aligns from the **committed** state and returns the
  tentative state. Each partial replaces the previous tentative state, so a
  phrase's words are used once, and a revised earlier word just changes the
  tentative result.
- `onFinal(spoken)` aligns the final text from the committed state and commits
  the result. An empty final commits nothing.
- `reset(state, options?)` starts over at a landing, or moves the cursor
  after a manual reveal (marks kept).
- `AlignOptions`: `freeStartUntil` lets a phrase start anywhere up to a
  position at no cost (the first landing; a quiz's shown snippet).
  `protectBefore` never marks words before a position (a quiz's snippet).
  `restartAnywhere` lets a phrase restart anywhere in the verses (the quiz).

**Starting parameters** (constants in the aligner, tuned against the replay
tests):

| Constant | Value |
|---|---|
| `SOUND_ALIKE_COST` | 0.25 |
| `WRONG_COST` | 1.0 |
| `MISSED_COST` | 0.8 |
| `EXTRA_COST` | 0.7 |
| `LAST_EXTRA_COST` | 0.9 |
| `RESTART_COST_PER_WORD` | 0.15 |
| `RESTART_WINDOW` | 10 words |
| `LOOKAHEAD` | 60 words |
| `CONFIRM_AFTER` | 2 words |
| `LOW_CONFIDENCE` | 0.6 (in `recite-spelling.service.ts`) |
| `RESUME_MIN_SAID` | 3 words |
| `LENIENT_TOKEN_COST` | 0.05 |
| `JOIN_COST` | 0.05 |

### 3. Deepgram stream — word confidences

`SttStreamEvent` gains `words?: { word: string; confidence: number }[]`, read
from `channel.alternatives[0].words`, which the service currently ignores.
When it is missing, the transcript is split on spaces and each word is treated
as confident.

### 4. Mushaf driver and identify wiring

`hooks/recite/deepgram/deepgramDriver.ts`:

- Owns one tracker per session.
- A partial result advances the reveal to the tentative cursor with the
  existing 1-word holdback.
- A final commits, advances the reveal to the committed cursor and calls
  `reveal.confirm`, as today.
- Marks flow to `useReciteMode` through a new driver dependency,
  `setMarks(marks)`. The page shows the *tentative* state's marks: they
  already require confirmation, so a red word can appear before the phrase's
  final.
- A final in which no word aligns as correctly said (anywhere — a restart
  over revealed words counts as on-track), with at least 3 usable words,
  counts toward the existing mismatch streak; partial-result mismatch counting
  keeps its current throttle. Re-search thresholds are unchanged.
- The manual reveal buttons and `syncPage`'s fallback call
  `ReciteDriver.moveCursor(pos)`, which resets the tracker's cursor and keeps
  its marks.

`hooks/recite/deepgram/useIdentifySession.ts`:

- **Landing replay** (`beginOnPage`): the identify buffer is aligned from the
  landing verse's first word with `alignPhrase`, so skips inside the opening
  words are marked too. The tracker is reset to the result.
- **Resume check:** a re-search resumes in place only if `alignPhrase` from
  the old cursor yields at least `RESUME_MIN_SAID` correctly said words.
- **Forward relocation:** when a mid-session re-search lands on the same page
  or the next page *after* the old cursor, the recitable words between the old
  cursor and the landing verse are marked missed. Backward relocation and the
  initial landing mark nothing.

`matchFromPosition.ts` and the `LOOSE_MATCH_*` constants in `reciteCore.ts`
are removed once nothing uses them. `matchTranscript` stays for page-first
identify (`findVerseOnPage`).

### 5. Display — Mushaf recite mode

- `useReciteMode` exposes `reciteMistakes: Set<string>`, keyed
  `sura:aya:position` (`VerseWord.position`, what `MushafPage` renders by),
  converted from the tracker's marks.
- Marks are cleared on `startRecording` and `disarm`, and **kept after
  `stopRecording`** so the finished page can be reviewed.
- `PageViewer` passes them to `MushafPage` whenever recite mode is armed.
- `MushafPage` gains an optional `mistakes?: Set<string>` prop. A recitable word
  whose key is in it gets the `mushaf-word-mistake` class.
- A hidden word stays hidden; a red word appears once the reveal reaches it.
- Style: red `#d32f2f` by day and `#ff6b6b` at night, with a dotted underline
  as a non-colour cue and no glow (see "Amendments from planning" for the
  contrast figures).
- Reveal speed and the 1-word holdback are unchanged. The "show whole page"
  toggle keeps marks visible.

### 6. Display and completion — quiz recite

`useQuizRecite` drives the shared tracker from the verse start with
`freeStartUntil` and `protectBefore` both set to the hidden part's start, and
with `restartAnywhere` (`quizAlignOptions`). The reciter may begin anywhere in
the shown snippet (or skip it), a snippet word is never marked, and the
reciter can go back anywhere in the verse to fix a red word, even after
finishing it. This replaces the old two-seed logic. It exposes:

- `mistakeWordIndexes: Set<number>`, indexed like `revealedWordCount` (into the
  hidden portion);
- `mistakePositions: Set<string>` for the Mushaf context viewer.

**Completion.** `isVerseComplete` is true only when the verse end is reached
and no marks remain. With red words:

- stopping the mic just stops, and the question stays open;
- going back and re-saying the red words correctly clears them, and stopping
  then counts as correct.

**Stop versus reset.** These become separate actions:

- `stop()` releases the mic but keeps the attempt's green and red words on the
  card;
- a new `reset()` clears them, called by Next, Skip, a typed answer, and a
  question change;
- `startVerseMode` (a new attempt) starts clean.

**Rendering:**

- **Question cards** (`AkmelAlAyah.tsx`, `MutashabihatTest.tsx`): red words get
  `aa-mistake-inline` / `mst-mistake-inline`. The card splits the verse text
  on spaces, and the verse text carries each pause mark (ۖ ۗ ۚ ۛ …) as a token
  of its own, so `hiddenCardTokens` maps tokens to words: a pause mark goes
  with the word before it.
- **Context viewer:** `MushafContextViewer` passes `mistakePositions` through to
  `MushafPage` as `mistakes`.

### 7. Logging

Each final logs one `[recite-align]` line with:

- the heard words and their confidences;
- each verse word's outcome (said, sound-alike, wrong, missed, extra,
  restart);
- the resulting cursor.

A false red word on device can be turned straight into a test case. The
existing `[recite-stream]`, `[recite-track]` and `[recite-identify]` logs stay.

## Testing

Unit tests run with Jest. Inside the `.claude/worktrees/` worktree, the run
needs an explicit `--testMatch`:
`CI=true npx react-scripts test --watchAll=false --testMatch "**/__tests__/**/*.test.ts" --testPathPattern recite`.
They live in `__tests__/` beside each module. The aligner's verse fixtures are
embedded in its test file, in the app's page-data form (Quran.com
`text_uthmani`, word-aligned with `text_imlaei`).

**`recite-spelling.service.test.ts`:**

- Every Uthmani example in §1's table, against its standard spelling, is
  `said`.
- يعلمون/تعلمون, ربك/ربكم, عليهم/عليكم, فيه/فيها, قال/قل, عليم/عظيم and a
  leading و are `wrong`.
- Sound-alike pairs, idgham/iqlab joins and a low-confidence one-letter miss
  are `soundAlike`.
- Muqatta'at and ayah markers are never flagged.

**`recite-aligner.service.test.ts`.** Scenarios are fed as Deepgram does: word
by word as partials, then a final.

| Scenario | Expected |
|---|---|
| Clean recitation | Nothing red; reveal reaches the end |
| Skip one word | That word marked |
| Skip two words | Both marked; cursor never enters 2:4 |
| Wrong word | That word marked |
| Skip at a pause | That word marked |
| Wrong verse ending, then next verse | Ending marked |
| Slip or skip one word before a pause, then the next verse (also as a one-word phrase) | Only the slip marked |
| Slip before a pause, then going back for it | Nothing red; the word said before the pause is revealed |
| Extra word, or an immediate self-correction | Nothing red |
| Restart to fix a red word | Mark cleared |
| Stop right after a slip | Nothing marked |
| Isti'adha, basmalah, صدق الله العظيم | Nothing red |
| Recitation across a verse and a page boundary | Continues normally |
| Deepgram revises an earlier word in a partial | Tentative state follows the revision |
| An-Naba' 78:9–11 (repeated opener وجعلنا) | No stall, nothing red |

**Quiz completion:** reaching the verse end with a mark is not complete;
clearing the mark makes it complete, including after going back more than
`RESTART_WINDOW` words from the verse end. Card tokens put a red word on that
word, never on a pause mark before it.

**Whole-Quran spelling check** (one-off script in the scratchpad; neither the
script nor its data is committed):

- Fetch every page from `api.quran.com/api/v4/verses/by_page/{page}` with
  `words=true&word_fields=text_uthmani,text_imlaei`. Both fields come per word,
  so they are already word-aligned.
- Run `compareWord(uthmani, imlaei)` on all ~77,000 words and list every word
  not judged `said` or `soundAlike`.
- Each recurring pattern gets a skeleton rule and a unit test.
- Done when no unexplained mismatches remain, or each one is listed in the
  test file as a deliberate exception.
- Done during planning; results are under "Amendments from planning". The
  plan's appendix keeps the script for re-tuning.

**Type check:** `npx tsc --noEmit -p tsconfig.json` shows no new errors in
touched files.

**On device** (the user builds):

1. A clean passage shows no red.
2. Skipping a word marks it.
3. A wrong word marks it.
4. Going back to fix a red word clears it.
5. A quiz answer with a red word stays open, and fixing it settles it correct.
6. A slip on a verse's second-to-last word, then carrying on with the next
   verse, marks only the slip.
7. In a quiz on a long verse (Ayat al-Kursi), a red word near the start can be
   fixed after finishing the verse.
8. In a quiz whose hidden part has a pause mark (ۖ ۚ …) before a mistake, the
   red lands on the word said wrongly.

## Out of scope

- Tajweed and pronunciation errors (madd length, ghunnah, makharij).
  Sound-alike letters are deliberately forgiven.
- Flagging extra words: the page has no slot to show a word that is not in the
  text.
- A Quran-specific speech model. Deepgram mishearing correct recitation stays
  the main source of false red words.
- Saving mistakes across sessions, mistake history or statistics.
- Sounds or haptics on a mistake.
- Changes to whole-Quran identify scoring.

## Risks

- **False red words** from Deepgram mishearing correct recitation. Mitigated
  by:
  - the spelling cleanup and the whole-Quran spelling check;
  - sound-alike forgiveness and the low-confidence rule;
  - the confirmation rule;
  - `[recite-align]` logs that turn device misfires into tests.
- **Detection delay:** a red word appears once `CONFIRM_AFTER` (2) later words
  are said, roughly a second after the slip.
- **Restarts beyond 10 words** are not seen as restarts in the Mushaf (the
  quiz restarts anywhere in its verse). The spoken words align as extra
  words, so nothing is marked, but the cursor waits until the reciter is back
  at new text.
- **Two or more skipped words right before a phrase's last word** still drop
  that word as an extra word (two skips cost 1.6, more than
  `LAST_EXTRA_COST`), so it is marked missed along with them.

## Order of work

1. `recite-spelling.service.ts` with its tests, plus the whole-Quran spelling
   check.
2. `recite-aligner.service.ts` and the tracker, with the replay tests.
3. Deepgram word confidences.
4. Mushaf wiring:
   - driver and identify session;
   - `useReciteMode`, `PageViewer`, `MushafPage` and CSS.
5. Quiz wiring:
   - `useQuizRecite`;
   - both quiz pages, `MushafContextViewer` and CSS.
6. Remove `matchFromPosition.ts` and the `LOOSE_MATCH_*` constants.
7. Type check and the on-device checklist.
