# Recite accuracy and word highlight — design

Date: 2026-10-21
Status: approved by the owner in conversation (this document records it)

## Why

The owner tested the three speech engines on a phone (Xiaomi, via Android
Studio) once the Worker served all of them. Whisper is usable but slow, because
it transcribes short chunks; the owner accepts that and is not asking for
changes there. Soniox and Deepgram transcribe well, but both show the same
problems, which means the problems are in the shared logic that turns a
transcript into "where is the reciter and what did they say", not in either
engine.

Rafeeq Pro (branch `subscription-pro`) makes recite mode the paid feature, so
it has to feel at least as good as Tarteel, which the owner uses as the
reference.

## What the owner reported

1. **Repeated openings look like a restart.** When consecutive verses start
   with the same words, the app sometimes decides the reciter went back to the
   previous verse instead of moving on to the next one.
2. **Finding the place is slow.** When the reciter starts somewhere other than
   the page that is open, the toolbar shows "جاري تحديد الآية" for two or more
   verses (depending on verse length). Tarteel usually locks on during the
   second verse. The owner normally starts at the beginning of a verse but
   wants starting partway through a verse to work as well.
3. **Separated letters fail.** Verses opening with muqatta'at (الم، كهيعص، يس،
   حم، طسم…) are not accepted as correctly recited.
4. **Word highlight.** The owner wants each recited word to light up and then
   return to its normal colour. When the reciter goes back and recites a verse
   again, the verse must stay on screen and its words light up again — today
   it is hidden and revealed again.
5. **Close-sounding letters (lower priority).** Some correctly recited words
   are marked wrong, e.g. a ط heard as ت. The owner wants more tolerance **only
   if it does not weaken the detection of real mistakes**; otherwise skip it.
6. **The last word waits for the next verse** (raised after the first
   draft). Sometimes, after the last word of a verse is recited, it doesn't
   appear until the reciter starts the next verse.

## Goals

- Fix 1–4 and 6 for Soniox and Deepgram, in the page viewer and both quizzes
  (أكمل الآية and المتشابهات). The quizzes share the matching code; the owner
  confirmed the highlight should appear in the quizzes too.
- Attempt 5 behind a measurement; ship it only if mistake detection does not
  get worse.
- Prove each change with an offline test that feeds text (not audio) into the
  matching code, so improvements are measured, not guessed.

## Non-goals

- Whisper's latency (owner accepted it for now).
- Engine changes (models, endpoints, Worker routes).
- Changing what counts as a mistake beyond item 5.
- The subscription work, which stays on `subscription-pro`.

## Anti-goals (would make this a failure even if it "works")

- Locking on faster but landing on the wrong page more often than today.
- Revealing words the reciter did not say.
- Accepting real mistakes as correct in order to look friendlier.
- Any new flicker: words disappearing and reappearing.

## Background: what the code does today

All of this was read from the code on 2026-10-21. Paths are under
`src/app/core`.

- **Identify** (`hooks/recite/deepgram/useIdentifySession.ts` →
  `services/data/quran.service.ts` `findVerseByStartingPhrase` →
  `services/quran/recite-matcher.service.ts` `scoreCorpusAnchors`):
  - Anchors only at verse starts. Each verse's 30-word window is scored by
    how many distinct spoken words (longer than 2 letters) appear anywhere in
    it, plus how far the transcript follows the verse in order.
  - Needs at least 4 matched words (`IDENTIFY_MIN_MATCHED`). If a far-away
    rival is within 1 word, it is "ambiguous" until a head-to-head on each
    candidate's unique words reaches a margin of 2 (`DECISIVE_MARGIN`).
  - Common words (الله، الذين، قال…) match hundreds of windows. This is the
    likely main cause of item 2.
  - A page-first fast path exists, but only for the page that is open.
- **Tracking** (`services/quran/recite-aligner.service.ts`): dynamic-programming
  alignment from the committed cursor.
  - A phrase may restart up to `RESTART_WINDOW` = 10 words back, at
    `RESTART_COST_PER_WORD` = 0.15 per word. `MISSED_COST` is 0.8.
  - *Hypothesis for item 1, to confirm with a test:* when the cursor lags even
    one word behind the end of the previous verse (a pending gap, the
    holdback), a restart to that verse's identical opening costs about
    0.15 × 3 = 0.45. Moving forward costs 0.8 for the one unconfirmed word. So
    the restart wins.
  - Re-reciting a whole verse longer than 10 words falls outside the restart
    window. It produces mismatches, then a re-search, then a fresh landing.
- **Reveal** (`hooks/recite/shared/useRevealAnimator.ts`): when the aligned
  cursor moves backwards, `advanceTo` sets the display position back and
  `applyPosition` hides everything after it. This is the "hides and shows the
  verse again" in item 4. A re-search landing (`landOnPage`) does the same.
- **Muqatta'at:**
  - In tracking, the first word of these verses is `lenient`: it absorbs up to
    5 spoken tokens, is never marked, but **never counts as said**. A verse
    that is only الم (2:1) therefore never registers as recited, never
    advances on its own and would never light up.
  - In identify, `hooks/recite/deepgram/muqattaat.ts` rewrites spelled-out
    letter names, but only at the start of the buffer and only for separate
    words. It misses joined forms (ياسين، طاها، حاميم، طاسين), stretched letters
    (عيييين) and the opener عسق (42:2).
- **Word verdicts** (`services/quran/recite-spelling.service.ts`
  `compareWord`):
  - Sound-alike pairs already include ط/ت (`SOUND_ALIKE_PAIRS`).
  - The number of soft differences allowed is 1 for words with ≤ 4 core
    letters and 2 otherwise. A word with ط→ت plus one other soft difference
    may therefore be marked wrong.
  - Deepgram supplies per-word confidence (`LOW_CONFIDENCE` = 0.6), and Soniox
    supplies token confidence through its assembler.
- **Quiz highlight** (`shared/components/mushaf-context/MushafContextViewer.tsx`
  → `MushafPage` `recitedPositions`): recited words stay green permanently
  (`.mushaf-word-recited`). The page viewer has no highlight; words just
  appear.

## Decisions

### 1. Repeated openings: prefer moving forward

- When a phrase fits both "continue into the next verse" and "restart an
  earlier verse with the same words", the tracker chooses forward.
- It restarts only when the phrase contains words that fit the earlier verse
  and not the next one.
- The fix must hold when the cursor lags a word or two behind (the
  hypothesised cause), and for runs of identical openings (e.g. فبأي آلاء ربكما
  تكذبان in Ar-Rahman, ويل يومئذ للمكذبين in Al-Mursalat).
- How to get there (cost changes, a forward tie-break, treating pending words
  differently) is left to the builder, under the measurements below.

### 2. Faster identify, from any word position

- Search every word position in the Quran, not only verse starts, so starting
  partway through a verse works.
- Match the transcript **in order** against the text, weighting rare words
  much more than common ones (e.g. by how many places in the Quran a word or
  word pair occurs).
- Commit as soon as one region clearly beats every independent rival.
- Keep the existing protections:
  - opening-phrase stripping (isti'adha, basmalah);
  - the mutashabihat head-to-head and the tie-break toward the last tracked
    position on a re-search;
  - the page-first fast path;
  - the two-sighting rule before a move-away stops the session;
  - stopping when nothing is found.
- Landing partway through a verse lands on that word.
  - **First landing:** the words before it in that verse are revealed and not
    marked (`freeStartUntil` already does this).
  - **Mid-session re-search** that lands ahead of where tracking was: keep
    today's rule. `beginOnPage` → `markSkipped` marks the words between the old
    cursor and the landing as skipped, for a forward move on the same or next
    page. A skip after the session is established is a real skip, and hiding
    it would break the "no accepting real mistakes" anti-goal. The new
    restart range (decision 4) means re-searches happen less often, so this
    fires less often too.
- The algorithm and data structures are the builder's choice. An index built
  from the bundled corpus at first use is fine, as long as it doesn't stall the
  UI. Measure build time on a mid-range phone, or estimate it from desktop with
  a stated factor.

### 3. Muqatta'at accepted everywhere

- A muqatta'at opener counts as **said** (it lights up and advances) when the
  spoken tokens spell its letters.
- Accepted forms:
  - separate letter names (ألف لام ميم);
  - joined forms (ياسين، طاها، حاميم، طاسين ميم، كاف ها يا عين صاد or partly
    joined);
  - stretched vowels (عيييين، ميييم);
  - the engine writing the compact form itself (الم، يس).
- Applies to every opener, including عسق (42:2) and the combined 42:1–2
  (حم / عسق).
- Applies in identify, tracking and both quizzes.
- Leniency stays scoped to the opener's position. Ordinary words such as أَلَمْ
  (94:1) are untouched.
- Tokens that do **not** spell the letters keep today's behaviour: absorbed,
  not marked, not counted as said.

### 4. Word highlight

**Look (chosen by the owner from mockups):**

| | Light page (`#ffffff`, text `#111111`) | Dark page (`#1a1a1a`, text `#e8e0d0`) |
|---|---|---|
| Colour | vivid green `#00a33d` | mint `#4cff9a` |
| Strokes | drawn slightly heavier while lit (`-webkit-text-stroke: 0.5px` in the same green) | normal |
| Glow | **none** (a glow made the light page look hazy) | soft glow `0 0 10px rgba(76,255,154,.6)` |

- **Tajweed mushaf (the default, `qpc_v4_tajweed`): the whole word turns
  green, tajweed colours included** (owner's decision), then fades back to its
  normal tajweed colours.
  - The glyphs are COLRv1 colour fonts coloured through `font-palette`, so CSS
    `color` alone only recolours the black layer.
  - Build a green `@font-palette-values` override per page family, the same way
    `font.loader.ts` already builds the mono palette with `override-colors`.
  - WebView may not animate `font-palette`, so the fade can be done by
    cross-fading layered copies of the word. The method is the builder's
    choice.
  - The same applies to the plain mushafs, which already use the mono palette
    or plain ink.
- The word holds the colour for about 0.45 s, then fades back to the normal
  ink over about 1.2 s.
- With reduced motion, it switches colour on and off with no fade.

**Behaviour:**

- A word lights up when the tracker accepts it as correctly recited,
  including sound-alike and muqatta'at. It lights up as it is revealed. With
  the one-word holdback, the light follows the reveal.
- **Re-reciting:**
  - Words already revealed stay revealed for the rest of the session on that
    page. Going back never hides them.
  - The re-recited words light up again as they are said.
  - The tracker must recognise re-reciting any verse the reciter has already
    recited on the current page as a restart, without a re-search. Today's
    10-word window is not enough for a long verse.
  - The forward preference from decision 1 still applies.
- **Mistake words are marked by the dotted underline only** (owner's decision:
  "the dotted underline is enough").
  - The letters keep their normal colours (tajweed or plain ink) on every
    mushaf. `.mushaf-word-mistake` stops recolouring the text.
  - The dotted underline stays and takes the mistake red (`#d32f2f` light,
    `#ff6b6b` dark) as its own colour, at today's 2px thickness and 0.3em
    offset. The red underline colour is the builder's reading of the owner's
    answer.
  - The quiz question cards' `.aa-mistake-inline` / `.mst-mistake-inline`
    styling is out of scope and stays as it is.
  - Reciting a marked word correctly **clears the mark** (owner's decision).
  - The aligner already reports `cleared`; it must work across the wider
    restart range.
- **Quizzes:**
  - Same light-then-fade effect on the mushaf context view
    (`MushafContextViewer`).
  - The permanent green of `.mushaf-word-recited` there goes away. A recited
    word settles to normal ink.
  - Re-reciting in a quiz already uses `restartAnywhere`, and it lights words
    up the same way.
  - **The question cards fade too** (owner's decision):
    - Recited words in `.aa-recited-inline` / `.mst-recited-inline` light up
      the same vivid green, then settle to the card's normal text colour.
    - Gold hint words stay gold.
    - The cards need per-word "just accepted" events from the quiz recite hook
      (`useQuizRecite`), the same events the mushaf views use.
- **"Show whole page" toggle and Hifz hide state:** keep working as today.
  The highlight is only an overlay on revealed words.

### 5. Close-sounding letters (gated)

- Possible changes, all to be measured before shipping:
  - allow one more soft difference for short words;
  - add sound-alike pairs the engines actually confuse on correct
    recitation;
  - use Soniox confidence the way Deepgram's is used.
- **Ship gate:** the mistake-detection measurements below must not get worse.
  If they do, drop item 5 and say so in the PR. This is the owner's explicit
  rule.
- **No real device data exists yet** (no logs or fixtures in the repo).
  Testing with invented noise would only measure the builder's own guesses. So
  (builder's call):
  - This round ships only the confidence change: Soniox confidence used like
    Deepgram's. It is measured against the real-mistake cases.
  - Soft-limit and new-pair changes wait for real data. The owner recites known
    passages correctly on the device and sends the `[recite-align]` lines from
    `chrome://inspect`. Those lines become test fixtures, and pairs or limits
    change only for confusions that actually appear in them.

### 6. The last word appears when it is said

- After the final word of a phrase is accepted, it must appear (and light up)
  when the engine settles the phrase at the reciter's pause, without waiting
  for more speech.
- **Likely root cause (from reading the code; prove it with a failing test
  first):**
  - `useRevealAnimator` holds the newest word back (`holdbackWords` = 1 for
    streaming), and its interval timer **stops** when the only word left is
    the held one.
  - A final calls `reveal.confirm(cursor)`, which only records the confirmed
    position and **does not restart the timer**.
  - `deepgramDriver.showState` calls `advanceTo` only when the cursor
    changed. A final that settles at the same cursor as the last interim
    therefore never restarts the timer.
  - Result: the held word stays hidden until the next `advanceTo`, which is
    the next verse's first words.
- **Second candidate, to check in the same test pass:**
  - The aligner holds the cursor before an unconfirmed gap until
    `CONFIRM_AFTER` = 2 correct words follow.
  - A verse's last word heard as "wrong" (e.g. pronounced in pause form)
    would also wait for the next verse.
  - The device logs (`[recite-align]`) will show which case happens. Fix both
    if both occur.
- Check the quiz path (`useQuizRecite`) for the same pattern.

## Measurements (the offline test)

Build a repeatable harness that feeds text into the real matching code, with
no microphone or network. It extends the whole-Quran tuning harness described
in `docs/superpowers/plans/2026-10-02-recite-mistake-detection.md` (appendix).
It reports before and after numbers in the PR.

**Inputs:**
- verse text from the bundled corpus, starting at verse starts and at random
  mid-verse positions;
- a "noisy" variant with some words replaced by sound-alike spellings or
  dropped, the way the engines garble them;
- the owner's real device phrases where available, e.g. `[recite-align]` and
  `[recite-identify]` lines from `chrome://inspect`.

**Metrics:**

| Area | Metric | Target |
|---|---|---|
| Identify | words needed to lock on (median and 90th percentile) from a verse start and from mid-verse, clean and noisy | clearly fewer words than today; aim ≤ 6 words median from a verse start on clean text |
| Identify | wrong-place rate | not higher than today |
| Repeated openings | consecutive pairs and runs of verses with the same opening (found by scanning the corpus), with the cursor 0–2 words behind | tracker moves forward in all cases where the phrase goes past the shared words; never restarts on shared words alone |
| Muqatta'at | every opener in every accepted form | counted as said in identify, tracking and quiz alignment |
| Mistake detection (gate for item 5) | real-mistake test cases (wrong word substituted, word skipped, neighbouring-verse word) | caught at least as often as today; false "wrong" on correct text goes down |

## Constraints

- Follow `CLAUDE.md`:
  - no visible scrollbars;
  - no eslint-disable comments;
  - page widths via `var(--max-width-mobile, 600px)`;
  - bottom-nav padding;
  - green only as fills in controls. Mushaf word colours are their own
    established exception, like today's red and green.
- Tests: Jest via `CI=true npx react-scripts test --watchAll=false`, with
  `resetMocks: true`.
- The owner builds and deploys. Don't run `npm run build`, `cap sync`,
  gradle or a real `wrangler deploy`.
- Keep the existing `[recite-*]` debug logs. Add similar lines for the new
  identify path so device sessions can be diagnosed.
- Keep Deepgram's and Soniox's behaviour identical where they share code.
- Don't silently fall back between engines.

## Builder's calls (marked as mine, not the owner's)

- **Branch:** work on a new branch `recite-accuracy` from `main`.
  `subscription-pro` is unmerged, and its only overlap is a small wrapper
  around the mic tap in `PageViewer`, `AkmelAlAyah` and `MutashabihatTest`.
  Merge conflicts there are expected to be trivial.
- Exact costs, thresholds and data structures, under the measurements above.
- Order of work: the last-word fix (6) first, then muqatta'at and repeated
  openings (small, contained),
  then the highlight, then identify, then item 5.
- The mistake underline stays red; only the letters stop turning red
  (decision 4).
- A mid-session re-search that lands ahead still marks the skipped words
  (decision 2).
- Item 5 is limited to Soniox confidence until device logs exist (decision 5).
- The highlight timing values above are starting points. The builder may tune
  them by ±30% after device feedback.
