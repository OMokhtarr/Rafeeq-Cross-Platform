# Recite Accuracy and Word Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recite mode feel at least as good as Tarteel with Soniox and Deepgram. That means:
- the last word shows when it is said;
- repeated openings move forward;
- separated letters count;
- the place is found within a few words, from any word;
- each recited word glows vivid green and fades;
- re-reciting keeps the verse on screen.

**Architecture:**
- All matching stays in the shared aligner and identify code. Both streaming engines and both quizzes use it.
- The glow is a per-word "accepted" event that the aligner reports. A small shared hook turns those events into a fading `Map<key, generation>`, which `MushafPage` (and the quiz cards) render as an overlay copy of the word in a green font palette.
- Identify becomes a pure, measurable function that ranks every word position in the Quran, weighting rare words.
- A committed text-only harness measures identify before and after.

**Tech Stack:** React 18 + Ionic, TypeScript, Jest (react-scripts), COLRv1 page fonts with `@font-palette-values`, ts-node for the harness.

**Spec:** `docs/superpowers/specs/2026-10-21-recite-accuracy-design.md`

## Global Constraints

- Branch `recite-accuracy` (already created from `main`; the spec is committed as `bd21698`).
- Tests: `CI=true npx react-scripts test --watchAll=false <path>`. Jest runs with `resetMocks: true`. Use `act` and `createRoot` from `react` / `react-dom/client`. Variables used in `jest.mock` factories must be prefixed `mock`.
- Type check: `npx tsc --noEmit -p .`.
- Don't run `npm run build`, `cap sync`, gradle or a real `wrangler deploy`. The owner builds.
- No eslint-disable comments of any kind. No visible scrollbars.
- Light glow: `#00a33d` with a `0.5px` stroke in the same colour and **no** blur. Dark glow: `#4cff9a` with `text-shadow: 0 0 10px rgba(76,255,154,.6)`.
- Glow timing: hold ~450 ms, fade ~1200 ms (total `GLOW_TOTAL_MS = 1650`). With reduced motion: switch on, then off, with no fade.
- Tajweed mushaf: the whole word turns green, tajweed colours included (a green `override-colors` palette).
- Mistakes: dotted underline only, red (`#d32f2f` light, `#ff6b6b` dark), 2px thick, 0.3em offset. The letters keep their normal colours. Quiz-card mistake styles are unchanged.
- Recited words stay revealed when the reciter goes back. Reciting a marked word correctly clears its mark.
- Keep the existing `[recite-*]` logs, and add `[recite-identify]` lines for the new search.
- Keep Deepgram and Soniox identical where they share code. Whisper latency is out of scope.

## Review Focus

1. **Interim revisions.** The same word is accepted by several interims of one phrase. Expected: it glows once per phrase, not on every interim. Pinned in Task 6.
2. **Glow for a held-back word.** The aligner accepts the newest word while the reveal still holds it back. Expected: it glows when it appears, not before. Pinned in Task 6.
3. **Page boundary.** A word accepted on the next page's portion of the combined verses, before the page turns. Expected: no crash, no glow on the wrong page, and the glow is dropped if the word is never shown on this page. Pinned in Task 6.
4. **Ordinary words that look like openers.** أَلَمْ (94:1, 105:1) next to the separated-letter decoding. Expected: an ordinary word, never lenient, still markable. Pinned in Task 3.
5. **Common words only.** An identify buffer of only very common words (e.g. "الله الذين قال إن"). Expected: never decides. Pinned in Task 9.

---

### Task 1: Release the held last word when the phrase settles

**Files:**
- Modify: `src/app/core/hooks/recite/shared/useRevealAnimator.ts` (`confirm`, ~line 174)
- Test: `src/app/core/hooks/recite/shared/__tests__/useRevealAnimator.test.tsx` (new)

**Interfaces:**
- Produces: `RevealAnimator.confirm(pos)` now also resumes the reveal when words up to `pos` are still hidden. No signature change.

- [ ] **Step 1: Write the failing test** `"reveals the held-back last word when the phrase is confirmed"`
  - Set up a harness component calling `useRevealAnimator` with:
    - a 1-verse `Verse[]` of 4 words (built like `verse()` in `recite-aligner.service.test.ts`);
    - `applyPosition = jest.fn()`;
    - `isActive: () => true`;
    - fake timers.
  - `landOnPage(verses, at(1,1,0), at(1,1,0))`, then `advanceTo(at(1,1,4), 1)`. Advance timers by 2000 ms. Expect the last `applyPosition` call to be at `wordIndex` 3 (held back).
  - `confirm(at(1,1,4))`, then advance timers by 2000 ms. Expect the last `applyPosition` call to be at `wordIndex` 4.
- [ ] **Step 2: Run it.** `CI=true npx react-scripts test --watchAll=false src/app/core/hooks/recite/shared/__tests__/useRevealAnimator.test.tsx`. Expected: FAIL, because the last call stays at `wordIndex` 3.
- [ ] **Step 3: Make `confirm` restart the timer** (`ensureTimer()`) after raising `confirmedPosRef` when the display is behind the true position.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Check the second candidate from the spec** (the aligner holding a verse's last word).
  - Add the aligner test `"a phrase ending on a verse's last word moves the cursor past it"` to `recite-aligner.service.test.ts`. Recite `[standard("2:2")]` from `at(2,2)` against `BAQARAH` and expect cursor `2:2:7`.
  - Add a second one with the last word in pause form: recite `"ذلك الكتاب لا ريب فيه هدى للمتقين"`, then `"الذين يؤمنون بالغيب ويقيمون الصلاه ومما رزقناهم ينفقون"` as two phrases (الصلاه for الصلاة). Expect cursor `2:3:8` after the second final, and also after only the second phrase's final.
  - If both pass, the aligner is not the cause; say so in the commit message. If either fails, stop and report the failing case. Fixing it needs device logs, not guesswork.
- [ ] **Step 6: Commit.** `fix(recite): show the last word when the phrase settles`

### Task 2: Recited words stay on screen when the reciter goes back

**Files:**
- Modify: `src/app/core/hooks/recite/shared/useRevealAnimator.ts` (`advanceTo` rewind branch, `landOnPage`)
- Modify: `src/app/core/hooks/recite/deepgram/useIdentifySession.ts` (`beginOnPage` call to `landOnPage`)
- Test: `src/app/core/hooks/recite/shared/__tests__/useRevealAnimator.test.tsx`

**Interfaces:**
- Produces: `landOnPage(verses: Verse[], landing: RecitePosition, pos: RecitePosition, samePage: boolean): void`. When `samePage` is true, the display never moves below the current confirmed position.
- Produces: `advanceTo` rewind semantics. The display rewinds no further than the confirmed position, and the confirmed position is never lowered. A rewind beyond the confirmed position (an interim retracting unconfirmed words) still hides those words, as today.

- [ ] **Step 1: Write the failing tests:**
  - `"keeps confirmed words revealed when the cursor restarts behind them"`: confirm `at(1,1,4)` with the display at 4, then `advanceTo(at(1,1,1), 1)`. Expect no `applyPosition` call below `wordIndex` 4.
  - `"still retracts unconfirmed words a revised interim dropped"`: confirm `at(1,1,1)`, `advanceTo(at(1,1,4),0)`, run timers, then `advanceTo(at(1,1,2),0)`. Expect the last `applyPosition` at `wordIndex` 2.
  - `"a same-page landing behind the display keeps the page revealed"`: confirmed at 4, `landOnPage(verses, at(1,1,0), at(1,1,1), true)`. Expect the last `applyPosition` at 4.
- [ ] **Step 2: Run.** Expected: the first and third tests FAIL, the second passes.
- [ ] **Step 3: Implement.**
  - **Rewind:** set the display to `max(pos, confirmed)` and stop lowering `confirmedPosRef`.
  - **`landOnPage`:** add the `samePage` parameter. In `useIdentifySession.beginOnPage`, pass `prior !== null && page === priorPage`, using the locals it already computes before the landing.
- [ ] **Step 4: Run** this file plus `src/app/core/hooks/__tests__`. Expected: PASS.
- [ ] **Step 5: Commit.** `fix(recite): going back keeps recited words on screen`

### Task 3: Separated letters count as said, in every form

**Files:**
- Create: `src/app/core/services/quran/recite-muqattaat.ts`
- Modify: `src/app/core/services/quran/recite-aligner.service.ts` (lenient step, `isCorrect`, result rules)
- Modify: `src/app/core/hooks/recite/deepgram/muqattaat.ts` (use the new decoder)
- Test: `src/app/core/services/quran/__tests__/recite-muqattaat.test.ts` (new), `recite-aligner.service.test.ts`, `src/app/core/hooks/recite/deepgram/__tests__/muqattaat.test.ts` (new)

**Interfaces:**
- Produces `recite-muqattaat.ts`:
  - `MUQATTAAT_OPENERS: readonly string[]` holds every opener in `normalizeArabic` form. That is the current 13 plus `"عسق"`: الم، المص، الر، المر، كهيعص، طه، طسم، طس، يس، ص، حم، عسق، ق، ن.
  - `spelledLetters(spoken: string[]): string | null` decodes spoken tokens (letter names written separately, joined or stretched) into the letters they spell, or returns null when the tokens are not entirely letter names.
- Produces in the aligner: `StepKind` gains `"letters"`. It is a lenient step whose absorbed tokens spell the opener (`spelledLetters(tokens) === plainLetters(skeleton)`), or a single token whose letters equal the opener. `isCorrect("letters") === true`. Other absorptions stay `"lenient"`: transparent, never marked, never said.
- Consumed by Task 5: `acceptedWords` treats `"letters"` as accepted.

- [ ] **Step 1: Write the decoder tests** in `recite-muqattaat.test.ts`. Expected:

| Input | `spelledLetters` result |
|---|---|
| `["الف","لام","ميم"]` | `"الم"` |
| `["ألف","لاميم"]` | `"الم"` |
| `["ياسين"]` | `"يس"` |
| `["يا","سين"]` | `"يس"` |
| `["طاها"]` | `"طه"` |
| `["حاميم"]` | `"حم"` |
| `["طاسين","ميم"]` | `"طسم"` |
| `["كاف","ها","يا","عين","صاد"]` | `"كهيعص"` |
| `["كافهايا","عيييين","صاد"]` | `"كهيعص"` |
| `["عين","سين","قاف"]` | `"عسق"` |
| `["مييييم"]` | `"م"` |
| `["قال","لهم"]` | `null` |
| `[]` | `null` |

- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `spelledLetters`.**
  - Normalize each token and join them without spaces.
  - Collapse runs of the same letter.
  - Parse the result as a sequence of letter names, backtracking over the alternatives in today's `LETTER_NAMES`, with each name also collapsed.
  - Return the letters, or null if any part fails to parse.
  - Move `CANONICAL_OPENERS` and `LETTER_NAMES` here. `deepgram/muqattaat.ts` keeps `correctMuqattaatOpening` but decodes with `spelledLetters` over growing prefixes of the buffer (up to 5 tokens), accepting only a result in `MUQATTAAT_OPENERS`.
- [ ] **Step 4: Write the aligner tests:**
  - `"counts الم as said when it is the whole verse (2:1)"`: `recite(verses("2:1","2:2"), at(2,1), ["الف لام ميم"])`. Cursor `2:1:1`, no marks.
  - `"counts ياسين as said (36:1)"`: needs a `"36:1"` fixture (`يسٓ` / `يس`). Cursor `36:1:1`.
  - `"counts عسق spelled out (42:2)"`: fixture `"42:2"` (`عٓسٓقٓ` / `عسق`). Cursor `42:2:1`.
  - `"keeps أَلَمْ an ordinary, markable word (94:1)"`: fixture `"94:1"` (`أَلَمْ|نَشْرَحْ|لَكَ|صَدْرَكَ` / `أَلَمْ|نَشْرَحْ|لَكَ|صَدْرَكَ`). Recite `"الف لام ميم نشرح لك صدرك"` and expect the mark `94:1:0`.
  - Fetch each fixture's exact `text_uthmani` / `text_imlaei` from `https://api.quran.com/api/v4/verses/by_key/<key>?words=true&word_fields=text_uthmani,text_imlaei`, joining words with `|`.
- [ ] **Step 5: Run.** Expected: the first three FAIL, the أَلَمْ test passes.
- [ ] **Step 6: Implement the `"letters"` step** in `alignPhrase`.
  - Classify `OP_LENIENT` steps during the backtrace.
  - Let a `"letters"` step count as ok in the result rules. Lenient stays transparent.
- [ ] **Step 7: Write the identify-correction test** in `muqattaat.test.ts`: `correctMuqattaatOpening("ياسين والقران الحكيم")` returns `"يس والقران الحكيم"`, and `("كافهايا عيييين صاد ذكر")` returns `"كهيعص ذكر"`. Run; expect PASS after Step 3.
- [ ] **Step 8: Run** `src/app/core/services/quran` and `src/app/core/hooks`. Expected: PASS, including `"accepts muqatta'at spelled out as letter names"` and `"does not let a muqatta'at word swallow the rest of its verse"`.
- [ ] **Step 9: Commit.** `fix(recite): separated letters count as recited in every form`

### Task 4: Repeated openings move forward, and any recited verse can be re-recited

**Files:**
- Modify: `src/app/core/services/quran/recite-aligner.service.ts` (restart cost constants and the `OP_START` rule)
- Modify: `src/app/core/hooks/recite/deepgram/deepgramDriver.ts` (`onLanded` tracker options)
- Test: `src/app/core/services/quran/__tests__/recite-aligner.service.test.ts`

**Interfaces:**
- Produces: the viewer tracker is created with `{ restartAnywhere: true }`, via `createReciteTracker(state, { restartAnywhere: true })` in `onLanded` and in `moveCursor`'s `reset`.
- The restart cost model is the implementer's choice. Constraint: a restart must cost more than moving forward over the words a lagging cursor still has to cover (up to `CONFIRM_AFTER` = 2 unconfirmed words, `MISSED_COST` 0.8 each). It must stay cheaper than a 3-word phrase of extras (≈ 2.3).

- [ ] **Step 1: Add fixtures** (fetched as in Task 3): `94:5`, `94:6`, `82:17`, `82:18`, `97:2`, `97:3`, `109:2`–`109:5`, `101:1`–`101:3`.
- [ ] **Step 2: Write the failing tests** (`describe("recite aligner: repeated openings")`):
  - `"moves on to 94:6 when the cursor lags one word behind 94:5"`. Start the tracker at `at(94,5,3)` (one word of 94:5 unconfirmed) and recite `[standard("94:6")]`. Expect cursor `94:6:4` and no marks.
  - `"moves on through 109:3 → 109:5 (identical verses)"`. Recite 109:2, 109:3, 109:4, 109:5 as four phrases from `at(109,2)`. Expect cursor at the end of 109:5.
  - `"moves on from 97:2 into 97:3, whose opening repeats 97:2's ending"`. Recite `standard("97:2")`, then `standard("97:3")`. Expect cursor at the end of 97:3.
  - Same pattern for `82:17 → 82:18` and `101:2 → 101:3`.
  - `"re-reciting a long verse from its start restarts in place (2:255)"`. Recite `standard("2:255")` from `at(2,255)` with tracker option `{ restartAnywhere: true }`, then recite its first 8 words again. Expect cursor `2:255:8` and `saidTotal > 0` on that phrase. (Today the window is 10 words, so this fails.)
  - `"going back over a red word clears it, past the old 10-word window"`. Use 2:255 with word 3 skipped, then re-recite from the verse start. Expect the mark cleared.
- [ ] **Step 3: Run.** Expected: the lag, 2:255 and red-word tests FAIL.
- [ ] **Step 4: Implement the cost change and the viewer option.** Every existing aligner and quiz test must keep passing, notably `"does not mark an extra word or an immediate self-correction"`, `"clears a red word when the reciter goes back and says it"` and `"does not stall on verses that share an opening word (78:9–11)"`.
- [ ] **Step 5: Run** `src/app/core/services/quran` and `src/app/features/quiz`. Expected: PASS.
- [ ] **Step 6: Commit.** `fix(recite): repeated openings move forward; re-reciting any verse restarts in place`

### Task 5: Accepted-word events and the glow hook

**Files:**
- Modify: `src/app/core/services/quran/recite-aligner.service.ts`
- Create: `src/app/core/hooks/recite/shared/useWordGlow.ts`
- Test: `recite-aligner.service.test.ts`, `src/app/core/hooks/recite/shared/__tests__/useWordGlow.test.tsx` (new)

**Interfaces:**
- Produces `acceptedWords(result: AlignResult): ExpectedWord[]`, in the aligner.
  - Returns the verse words that `result.steps` say were said correctly (`said`, `soundAlike`, `merged`, `split`, `letters`), in reading order.
  - `kept`, `missed`, `wrong`, `extra` and `lenient` are excluded.
- Produces `glowKey(w: { sura: number; aya: number; position: number }): string`, which returns `` `${sura}:${aya}:${position}` `` (the `MushafPage` mistake-key format).
- Produces in `useWordGlow.ts`:
  - `GLOW_TOTAL_MS = 1650`.
  - `useWordGlow(): { glow: ReadonlyMap<string, number>; light: (keys: string[]) => void; clear: () => void }`.
  - `light` sets each key to a new generation number, increasing per call, and schedules its removal `GLOW_TOTAL_MS` later. Removal only happens if no newer generation has been set for that key.
  - `clear` empties the map and cancels pending timers.

- [ ] **Step 1: Write the tests:**
  - `acceptedWords` on a clean `standard("2:2")` phrase lists all 7 words.
  - With one wrong word, it lists the other 6.
  - With `"الف لام ميم"` on 2:1, it lists `2:1:0`.
  - `useWordGlow`: `light(["1:1:1"])` gives the map entry generation 1. Advancing 1649 ms keeps it; at 1650 ms it is removed. Lighting it again at 1000 ms gives generation 2, and it survives until 2650 ms. `clear()` empties the map at once.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(recite): accepted-word events and a fading glow map`

### Task 6: Glow in the page viewer

**Files:**
- Modify: `src/app/core/hooks/recite/shared/reciteCore.ts` (`ReciteDriverDeps`)
- Modify: `src/app/core/hooks/recite/deepgram/deepgramDriver.ts`
- Modify: `src/app/core/hooks/useReciteMode.ts`
- Create: `src/app/core/hooks/recite/shared/glowQueue.ts`
- Modify: `src/app/features/viewer/PageViewer.tsx`
- Test: `src/app/core/hooks/recite/shared/__tests__/glowQueue.test.ts` (new)

**Interfaces:**
- Consumes `acceptedWords` and `glowKey` (Task 5), and `useWordGlow` (Task 5).
- Produces `ReciteDriverDeps.glowWords: (words: ExpectedWord[]) => void`.
- Produces `UseReciteModeResult.reciteGlow: ReadonlyMap<string, number>`, cleared on start, stop and disarm.
- Produces in `glowQueue.ts`:
  - `createGlowQueue(): { phraseAccepted(words: ExpectedWord[], isFinal: boolean): ExpectedWord[]; due(display: RecitePosition | null, pageVerses: Verse[]): ExpectedWord[]; reset(): void }`.
  - `phraseAccepted` returns the words not yet queued in the current phrase and queues them. A final ends the phrase.
  - `due` removes and returns the queued words that are revealed at `display`: an earlier verse, or the same verse with `wordIndex < display.wordIndex`. Words not in `pageVerses` are dropped.
- The driver calls `glowWords(acceptedWords(result))` for every interim and final in tracking and in `tryResume`.
- `useReciteMode` passes them through the queue, and lights `due(...)` after every `applyPosition` and on every `glowWords`.
  - The display used is the high-water display, so re-recited words glow immediately.

- [ ] **Step 1: Write the tests** for `glowQueue`:
  - The same word in three successive interims is returned by `phraseAccepted` only the first time.
  - After a final, the same word can be queued again (a re-recitation).
  - A queued word at `wordIndex` 3, with the display at 3, is not due; at 4 it is due once.
  - A word whose verse is not in `pageVerses` is dropped and never due.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `glowQueue`, the dependency, the driver calls and the `useReciteMode` wiring.
- [ ] **Step 4: Pass `reciteGlow` to `MushafPage`** in `PageViewer.tsx`, as the `glow` prop added in Task 7. Pass it only while recording, and keep it passed when `showingAll` is on.
- [ ] **Step 5: Run** `src/app/core` and `src/app/features/viewer`, then `npx tsc --noEmit -p .`. Expected: PASS and clean.
- [ ] **Step 6: Commit.** `feat(recite): recited words glow in the page viewer`

### Task 7: Render the glow and the underline-only mistakes on the mushaf

**Files:**
- Modify: `src/app/core/services/api/font.loader.ts`
- Modify: `src/app/shared/components/mushaf-page/MushafPage.tsx`, `MushafPage.css`
- Test: `src/app/core/services/api/__tests__/font.loader.glow.test.ts` (new), `src/app/shared/components/mushaf-page/__tests__/MushafPage.glow.test.tsx` (new)

**Interfaces:**
- Produces: `paletteNameForPage(page, variant: "day" | "night" | "mono" | "glow-day" | "glow-night")`. The new variants are named `--tw-P###-glow-light` and `--tw-P###-glow-dark`.
  - `injectPalettesForPage` also appends both glow rules: `override-colors` slots 0–9 set to `#00a33d` and `#4cff9a` respectively.
- Produces the `MushafPage` prop `glow?: ReadonlyMap<string, number>`, keyed `sura:aya:position`.
  - A recitable word in the map renders as today, plus a child overlay `<span className="mushaf-word-glow" aria-hidden="true" key={generation}>` containing the same glyph text.
  - The overlay's `fontPalette` is the page's glow palette for the theme. The parent span gets `mushaf-word--glowing` (`position: relative`).
  - Hidden words never get the overlay.
- Removes: `partialTarget.recitedPositions` and `.mushaf-word-recited`. Task 8 replaces their one user.

- [ ] **Step 1: Write the tests:**
  - **font.loader:** export `injectPalettesForPage(page: number, family: string): void`, which is module-private today. After `injectPalettesForPage(3, fontFamilyForPage(3))`, `document.head` contains `--tw-P003-glow-light` with `override-colors: 0 #00a33d` and `--tw-P003-glow-dark` with `0 #4cff9a`.
  - **MushafPage:** render with 2 verse fixtures, `glow = new Map([["1:1:2", 7]])` and a light theme. Expect exactly one `.mushaf-word-glow` element, with `font-palette` `--tw-P001-glow-light`, inside the word span for position 2. A word in `hidden` with a glow entry renders no overlay.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the palettes, prop and overlay. Add this CSS:**
  - `.mushaf-word--glowing { position: relative; }`.
  - `.mushaf-word-glow`:
    - `position: absolute; inset: 0`;
    - `color` and `-webkit-text-fill-color` set to `#00a33d`, with `-webkit-text-stroke: 0.5px #00a33d`;
    - `pointer-events: none`;
    - `animation: mushaf-glow 1650ms linear forwards`.
  - `@keyframes mushaf-glow { 0%, 27% { opacity: 1 } 100% { opacity: 0 } }`.
  - Night: `#4cff9a`, no stroke, `text-shadow: 0 0 10px rgba(76,255,154,.6)`.
  - `@media (prefers-reduced-motion: reduce)`: `animation-timing-function: steps(1, end)`.
  - `.mushaf-word-mistake`: remove `color` and `-webkit-text-fill-color`. Set `text-decoration-color` to `#d32f2f` (night `#ff6b6b`), keeping the dotted style, 2px thickness and 0.3em offset. Update its comment.
- [ ] **Step 4: Run** the two tests and `src/app/shared`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(recite): green glow overlay and underline-only mistakes on the mushaf`

### Task 8: Glow in both quizzes, on the mushaf view and the question card

**Files:**
- Modify: `src/app/features/quiz/hooks/useQuizRecite.ts`
- Modify: `src/app/features/quiz/hooks/quizReciteProgress.ts`
- Modify: `src/app/shared/components/mushaf-context/MushafContextViewer.tsx`
- Modify: `src/app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah.tsx` and `.css`
- Modify: `src/app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest.tsx` and `.css`
- Test: `src/app/features/quiz/hooks/__tests__/quizReciteProgress.test.ts`

**Interfaces:**
- Consumes `acceptedWords`, `glowKey` and `useWordGlow` (Task 5), and `MushafPage`'s `glow` (Task 7).
- Produces new `UseQuizReciteResult` fields:
  - `glow: ReadonlyMap<string, number>` (mushaf keys);
  - `cardGlow: ReadonlyMap<number, number>` (hidden-part word index → generation, index = `wordIndex - snippetWords`, non-negative only).
  - Each tracker result lights the words that `acceptedWords` newly accepts in the current phrase. Reuse `createGlowQueue().phraseAccepted` from Task 6; there is no holdback in quizzes, so nothing waits on `due`.
- Produces: `hiddenCardTokens(tokens, progress, hintLevel, cardGlow?: ReadonlyMap<number, number>)` returns `{ text; style; glow?: number }[]`, where `glow` is the owning word's generation.
- `MushafContextViewer` gains a `glow` prop passed to `MushafPage`, and drops `recitedWordCount` / `recitedPositions`.
- Card CSS:
  - `.aa-recited-inline` / `.mst-recited-inline` take the card's normal text colour.
  - A token with `glow` renders with class `aa-word-glow` / `mst-word-glow` and `key={glow}`. The class animates `color` from `#00a33d` (night `#4cff9a` plus the dark glow shadow) to the normal text colour over the same 1650 ms keyframe shape, with the same reduced-motion rule.
  - Gold hints and the mistake styles are unchanged.

- [ ] **Step 1: Write the tests:**
  - `hiddenCardTokens` with `cardGlow = new Map([[1, 4]])` sets `glow: 4` on word 1's token. It also sets `glow: 4` on a pause-mark token that follows word 1, and leaves it absent on the others.
  - Existing `quizReciteProgress` tests still pass.
- [ ] **Step 2: Run.** Expected: FAIL on the new case.
- [ ] **Step 3: Implement the hook fields, the `hiddenCardTokens` change, the `MushafContextViewer` prop, and the card markup and CSS in both quizzes.**
- [ ] **Step 4: Run** `src/app/features/quiz` and `src/app/shared`, then `npx tsc --noEmit -p .`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(quiz): recited words glow on the card and the mushaf view`

### Task 9: Identify as a pure function, plus the measuring harness (baseline)

**Files:**
- Create: `src/app/core/services/quran/recite-identify.service.ts`
- Modify: `src/app/core/services/data/quran.service.ts` (`findVerseByStartingPhrase` becomes a thin wrapper)
- Create: `tools/recite-harness/fetch-words.js` (the appendix script from `docs/superpowers/plans/2026-10-02-recite-mistake-detection.md`, writing `tools/recite-harness/qf-words.json`)
- Create: `tools/recite-harness/identify-check.ts`
- Modify: `.gitignore` (add `tools/recite-harness/qf-words.json`)
- Test: `src/app/core/services/quran/__tests__/recite-identify.service.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export interface IdentifyCorpus { tokens: CorpusToken[]; verseStarts: number[]; startIndexByVerse: Map<string, number> }
  export type IdentifyDecision =
    | { status: "found"; sura: number; aya: number; unique: boolean }
    | { status: "ambiguous" }
    | { status: "none" };
  export function decideIdentify(
    spokenText: string,
    corpus: IdentifyCorpus,
    options?: { minMatched?: number; nearPosition?: { sura: number; aya: number } | null },
  ): IdentifyDecision;
  ```
- **This task moves today's logic unchanged:** `scoreCorpusAnchors`, the minimum-matched check, the rival, the head-to-head and the `nearPosition` tie-break. `findVerseByStartingPhrase` calls `decideIdentify` on `getCorpusSequence()`. It resolves the row via `decideVerse` and keeps every log line and the `IdentifyOutcome` type.
- Harness usage: `npx ts-node --transpile-only -O '{"module":"commonjs"}' tools/recite-harness/identify-check.ts`.
  - It builds an `IdentifyCorpus` from `qf-words.json` (`text_imlaei` per word, `normalizeArabic`, canonical order).
  - Run with a fixed seed of 1, it samples 300 passages from verse starts and 300 from random mid-verse words, each 12 words long.
  - It feeds growing prefixes (word by word) to `decideIdentify` with `minMatched: 4` (the Deepgram value).
  - It records the words needed until `"found"` (or "never" within 12) and whether the found verse is the passage's starting verse.
  - It repeats this on a noisy copy: a fixed-seed 15% of words have one letter swapped by a pair from `SOUND_ALIKE_PAIRS` in `recite-spelling.service.ts`, and 10% of words are dropped.
  - It prints, per case (start or mid, clean or noisy): median and 90th-percentile words, the never-found percentage and the wrong-place percentage.

- [ ] **Step 1: Write the tests** for `decideIdentify` on a small fixture corpus built from the aligner test fixtures (2:2–2:7, 78:8–78:12).
  - The full text of 2:3 decides `2:3`.
  - Two words decide `"none"`.
  - The shared "وجعلنا" opening of 78:9 / 78:10 alone is not `found` for the wrong verse.
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Move the logic** into `decideIdentify`, and make `findVerseByStartingPhrase` the wrapper.
- [ ] **Step 4: Run** the new test and `src/app/core`. Expected: PASS.
- [ ] **Step 5: Write the harness, run `fetch-words.js` once, and run the harness.** Paste the baseline table into the commit message body.
- [ ] **Step 6: Commit.** `refactor(recite): pure identify decision and a whole-Quran harness (baseline)`

### Task 10: Faster identify, from any word, weighted by rare words

**Files:**
- Modify: `src/app/core/services/quran/recite-identify.service.ts`
- Modify: `src/app/core/services/data/quran.service.ts` (cache the index next to `corpusSequenceCache`)
- Modify: `src/app/core/hooks/recite/deepgram/useIdentifySession.ts` (only if a constant moves)
- Test: `recite-identify.service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IdentifyIndex { /* per normalized token: corpus positions and a rarity weight */ }
  export function buildIdentifyIndex(corpus: IdentifyCorpus): IdentifyIndex;
  ```
- `decideIdentify(spokenText, corpus, options, index?: IdentifyIndex)` builds the index lazily when it is not passed. `findVerseByStartingPhrase` passes the cached one.
- `IdentifyDecision` is unchanged. The found verse is the verse containing the first matched corpus token, so a mid-verse start lands on that verse. `beginOnPage`'s existing `freeStartUntil` replay reveals its earlier words without marking them.
- **Algorithm (the implementer tunes the numbers with the harness):**
  1. **Weights:** weight(token) = log(N / count of that normalized token in the corpus).
  2. **Candidates:** take the 3 rarest spoken tokens that occur in the index. Exact-match the normalized token, then fall back to a looser key (alif, hamza and ya forms folded) when it is absent. Each occurrence minus the token's offset in the spoken text gives a candidate start. Cap at 300 candidates.
  3. **Score:** align the spoken tokens in order from each candidate start with `matchAgainstSequence` (max skip 3, `wordsMatch`). Score = sum of the weights of the matched tokens.
  4. **Decide:**
     - `found` when the best score reaches a threshold and beats the best *independent* rival (start more than `IDENTIFY_WINDOW` = 30 tokens away) by a margin.
     - Otherwise run today's head-to-head and `nearPosition` tie-break on the two candidates' verses (`ambiguous` when still undecided).
     - `none` below the threshold or with fewer than 3 usable spoken tokens.
  5. **Log:** `[recite-identify] ranked best=<s:a> score=<x> rival=<s:a> score=<y> → <decision>`.

- [ ] **Step 1: Write the tests:**
  - `"finds a passage started mid-verse"`: the last 6 words of 2:4 decide `2:4`.
  - `"never decides on common words alone"`: `"الله الذين قال إن من"` gives `none` or `ambiguous` (Review Focus 5).
  - `"rare words decide sooner than common ones"`: the first 4 words of 2:3 decide `2:3`.
  - The Task 9 tests still pass.
- [ ] **Step 2: Run.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, then tune the threshold and margin with the harness until all of these hold:
  - the median from a verse start on clean text is ≤ 6 words;
  - every case needs fewer words than the baseline;
  - the wrong-place percentage is not higher than the baseline in any case.
  - Measure `buildIdentifyIndex` time on desktop. If it is over 150 ms, build it in idle chunks or on first recite arm, never on the UI thread during a session.
- [ ] **Step 4: Run** `src/app/core` and `npx tsc --noEmit -p .`. Expected: PASS and clean.
- [ ] **Step 5: Commit.** `feat(recite): find the place from any word, weighting rare words`. Put the before and after harness tables in the body.

### Task 11: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Run the full suite and the type check.**
  - `CI=true npx react-scripts test --watchAll=false`, expecting all suites to pass.
  - `npx tsc --noEmit -p .`, expecting it to be clean.
- [ ] **Step 2: Confirm Soniox confidence reaches the aligner** (spec item 5's only change this round).
  - `soniox.assembler.ts` builds `words` with per-word confidence, and the driver passes `event.words` to `spokenWordsFrom`.
  - If no test covers a low-confidence Soniox word becoming `soundAlike`, add `"a doubtful Soniox word is forgiven like Deepgram's"` to `soniox.assembler.test.ts`. Assemble tokens with confidence 0.4 for a one-letter-off word, then check `compareWord` on the resulting `SttWord` gives `soundAlike`.
- [ ] **Step 3: Run the harness one final time** and keep the tables for the owner's summary.
- [ ] **Step 4: Commit any test added in Step 2.** `test(recite): Soniox confidence forgives doubtful words`
