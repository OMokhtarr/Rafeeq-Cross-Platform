import { useCallback, useEffect, useRef, useState } from "react";
import type { Verse } from "../../shared/models/verse.model";
import { getPage, findVerseByStartingPhrase } from "../services/data/quran.service";
import { transcribeChunk, RateLimitedError } from "../services/audio/speech-to-text.service";
import { useMicChunks } from "./useMicChunks";
import {
  firstWordPosition,
  matchTranscript,
  normalizeArabic,
  precedingWordsText,
  verseWordCount,
  type RecitePosition,
} from "../services/quran/recite-matcher.service";

/** Give up (stop, or resume tracking if mid-session) after this many chunks
 *  that yield *no* viable candidate — silence, noise, or non-Quran speech. */
const MAX_NO_PROGRESS_CHUNKS = 3;

/** Hard ceiling on identify attempts even while progressing. Near-duplicate
 *  verses (mutashabihat, e.g. 2:38 vs 20:123) stay "ambiguous" until the
 *  recitation passes the shared phrasing, so we allow more chunks than the
 *  no-progress limit — but not forever, in case the STT never disambiguates. */
const MAX_IDENTIFY_CHUNKS = 8;

/** Chunk length while identifying. The very first chunk is longer — one
 *  good look at the opening of the recitation identifies far better than
 *  two fragments of it — and the mic's speech gate keeps pre-recitation
 *  silence from eating into it, so it holds ~6s of actual recitation.
 *  Once the page is known, matching only has to track forward from a known
 *  point, so shorter chunks give near-live word-by-word reveal instead of
 *  waiting for a long chunk. */
const FIRST_IDENTIFY_CHUNK_MS = 6000;
const IDENTIFY_CHUNK_MS = 4000;
const TRACKING_CHUNK_MS = 4000;

/** Newly-matched words are not revealed as one per-chunk batch: the display
 *  trails the matcher and uncovers one word per step, so a 4s chunk still
 *  *shows* as a word-by-word flow. The matcher's own position is never
 *  delayed — only what's on screen. */
const WORD_REVEAL_STEP_MS = 160;

/** How many matched words the display holds back from the matcher. Whisper
 *  sometimes *continues* past what was actually said when a chunk trails
 *  off into silence — it knows the Quran and finishes the phrase — so a
 *  chunk's last couple of matched words are treated as unconfirmed until a
 *  newer chunk moves the matcher further (chunks overlap by half, so real
 *  speech at a chunk's tail is re-heard ~2s later). Ghost words therefore
 *  never reach the screen; the matcher itself is not held back and
 *  self-corrects via the rewind check if it overshot. */
const REVEAL_HOLDBACK_WORDS = 2;

/** Matched words on the current page (after landing on it) beyond which the
 *  identification is considered confirmed — the recitation has tracked well
 *  past the shared phrasing any near-duplicate could explain. Before this
 *  point, a re-search that resolves to a different page is treated as
 *  correcting a wrong landing (mutashabihat) and relocates; after it, it
 *  means the reciter deliberately moved to another passage, and the session
 *  stops instead of chasing them around the mushaf. */
const ESTABLISHED_WORDS_ON_PAGE = 15;

/** Consecutive tracking-chunk mismatches before flagging `noMatchHint`,
 *  and before giving up on the current page and re-searching the whole
 *  Quran — a run this long means the recitation has likely moved to a
 *  verse the current page/position can no longer explain. */
const NO_MATCH_HINT_STREAK = 2;
const NO_MATCH_REIDENTIFY_STREAK = 4;

/** The strict (maxSkip: 0) reveal pass can get permanently stuck when the
 *  STT garbles one expected word — no later chunk can ever advance past it.
 *  A loose fallback pass may skip a couple of expected words, but only when
 *  it matches at least this many spoken words as evidence the recitation
 *  really is past the stuck word. The skipped word *was* recited (just
 *  misheard), so accepting the fallback never reveals ahead of the reciter. */
const LOOSE_MATCH_MAX_SKIP = 2;
const LOOSE_MATCH_MIN_CONSUMED = 3;

/** Stop capturing after this long with no recognized speech — the user has
 *  stopped reciting, so there's no point holding the mic open. */
const SILENCE_TIMEOUT_MS = 10000;

/**
 * USE RECITE MODE
 *
 * Orchestrates Recite Mode: listens to the mic in rolling chunks,
 * transcribes each chunk, and fuzzy-matches the running transcript
 * against the current (and, near the bottom, next) page's verses to
 * figure out how far the user has recited. Exposes hide/reveal state in
 * the same shape PageViewer's existing manual hint system already knows
 * how to render (`partialTarget` + a set of fully-hidden verse keys), but
 * kept entirely separate from the persisted Hifz `hidden` state — this is
 * a transient, in-session reveal that must not touch `rafiq_hidden_verses_v1`.
 */

/**
 * "armed": recite mode is entered (words hidden, ready to match) but the
 *   mic is not capturing yet.
 * "recording": mic is actively capturing and chunks are being transcribed.
 */
export type ReciteStatus = "idle" | "armed" | "recording" | "mic-error";

export interface RecitePartialTarget {
  sura: number;
  aya: number;
  revealedWordCount: number;
  hiddenPositions: Set<number>;
}

export interface UseReciteModeResult {
  status: ReciteStatus;
  /** Verse keys ("sura:aya") on the current page that are fully hidden (not yet reached). */
  reciteHidden: Set<string>;
  /** Word-level reveal state for the verse currently being recited, or undefined. */
  recitePartialTarget: RecitePartialTarget | undefined;
  micError: string | null;
  /** Seconds elapsed since the current recording started, ticking once per second. 0 when not recording. */
  recordingSeconds: number;
  /** Text recognized from the most recently transcribed chunk. */
  lastChunkText: string;
  /** True once several chunks in a row contained speech that didn't match the expected page/verse. */
  noMatchHint: boolean;
  /** True while recording has started but the starting verse hasn't been located yet. */
  identifying: boolean;
  /** True while backing off after Groq returned 429 (rate limited) — transcription is paused. */
  rateLimited: boolean;
  /** True while the whole-page reveal override is active (toggled by the hide button). */
  showingAll: boolean;
  /** Toggles between showing the whole page and showing only what's been revealed by recitation so far. */
  toggleShowAll: () => void;
  /** Manually advances the reveal position by one word, as if it had just been recited. */
  revealNextWord: () => void;
  /** Manually advances the reveal position to the end of the current verse (or the start of the next). */
  revealNextVerse: () => void;
  /** Enter recite mode: hides page words and gets matching state ready, but does not start the mic. */
  arm: (page: number, verses: Verse[]) => void;
  /** Exit recite mode entirely: stops any recording and clears all reveal state. */
  disarm: () => void;
  /** Start mic capture while armed. */
  startRecording: () => void;
  /** Stop mic capture without leaving recite mode. */
  stopRecording: () => void;
  /**
   * Called when PageViewer's own page-load effect lands on a new page while
   * recite mode is still active (i.e. after `onAdvancePage` triggered a
   * `setCurrentPage`). Keeps the session's verse list in sync with the
   * newly-rendered page without resetting the already-matched position.
   */
  syncPage: (page: number, verses: Verse[]) => void;
}

function verseKey(sura: number, aya: number) {
  return `${sura}:${aya}`;
}

/** Verse keys strictly after `pos.sura:pos.aya` within `verses` (the active verse itself excluded). */
function keysAfterPosition(verses: Verse[], pos: RecitePosition): Set<string> {
  const keys = new Set<string>();
  for (const v of verses) {
    if (v.sura === pos.sura && v.aya === pos.aya) continue;
    const isBefore = v.sura < pos.sura || (v.sura === pos.sura && v.aya < pos.aya);
    if (!isBefore) keys.add(verseKey(v.sura, v.aya));
  }
  return keys;
}

/** Canonical order: negative when `a` is before `b`, 0 when equal. */
function cmpPos(a: RecitePosition, b: RecitePosition): number {
  return a.sura - b.sura || a.aya - b.aya || a.wordIndex - b.wordIndex;
}

/** The position one revealed word after `pos` within `verses`, crossing into
 *  the next verse when the current one is fully revealed. Past the last
 *  loaded verse it synthesizes the past-page marker `applyPosition`
 *  understands; returns null only when `pos`'s verse isn't in `verses`. */
function nextWordPosition(verses: Verse[], pos: RecitePosition): RecitePosition | null {
  const idx = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
  if (idx === -1) return null;
  if (pos.wordIndex < verseWordCount(verses[idx])) {
    return { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
  }
  const next = verses[idx + 1];
  if (next) return { sura: next.sura, aya: next.aya, wordIndex: 1 };
  return { sura: pos.sura, aya: pos.aya + 1, wordIndex: 1 };
}

/** Positions of `activeVerse`'s words not yet reached by `wordIndex`. */
function unrevealedWordPositions(activeVerse: Verse, wordIndex: number): Set<number> {
  const words = (activeVerse.words ?? []).filter((w) => w.charType === "end");
  const positions = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (i >= wordIndex) positions.add(words[i].position);
  }
  return positions;
}

export function useReciteMode(
  onAdvancePage: (fromPage: number) => void,
  onNavigateToPage: (page: number) => void,
): UseReciteModeResult {
  const [status, setStatus] = useState<ReciteStatus>("idle");
  const [reciteHidden, setReciteHidden] = useState<Set<string>>(new Set());
  const [recitePartialTarget, setRecitePartialTarget] = useState<
    RecitePartialTarget | undefined
  >(undefined);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
  const [showingAll, setShowingAll] = useState(false);
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const noMatchStreakRef = useRef(0);

  // Mutable session state — avoids re-subscribing the mic callback on every match.
  const versesRef = useRef<Verse[]>([]);
  const pageRef = useRef<number>(0);
  const positionRef = useRef<RecitePosition | null>(null);
  const nextPageVersesRef = useRef<Verse[] | null>(null);
  const transcribingRef = useRef(false);
  const pendingChunksRef = useRef<Blob[]>([]);
  // True once armed (recite mode entered), independent of whether the mic is recording.
  const activeRef = useRef(false);
  // True only while the mic is actively capturing.
  const recordingRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // True while a recording session hasn't yet located its starting verse —
  // accumulates transcript across chunks and searches the whole Quran
  // instead of matching against the armed page.
  const identifyingRef = useRef(false);
  const identifyBufferRef = useRef("");
  const identifyChunkCountRef = useRef(0);
  // Consecutive identify chunks that produced *no* viable candidate (vs.
  // "ambiguous", which is progress). Drives the fast give-up on non-Quran.
  const identifyNoProgressRef = useRef(0);
  // Always holds the latest mic.setChunkMs — lets callbacks defined before
  // `mic` exists (handleIdentifyChunk) switch chunk cadence without a
  // circular dependency on the mic object itself.
  const setChunkMsRef = useRef<(ms: number) => void>(() => {});
  // Holds the latest stopRecording — lets earlier-defined callbacks
  // (handleIdentifyChunk, the silence timer) auto-stop without a forward
  // reference to a function declared later.
  const stopRecordingRef = useRef<() => void>(() => {});
  // Timestamp (ms) of the last chunk that produced real transcript text —
  // drives the "stopped talking" auto-stop.
  const lastSpeechAtRef = useRef(0);
  // True once we've successfully identified a page at least once this
  // session. Distinguishes the *initial* identify (failure → stop) from a
  // *mid-session* re-search (failure → just resume tracking, never stop —
  // a mis-recitation must not end the session).
  const hasIdentifiedRef = useRef(false);
  // Last few substantial tracking transcripts — used to seed a re-search
  // with enough context instead of just the single failing chunk.
  const recentTextsRef = useRef<string[]>([]);
  // Words successfully matched on the current page since landing on it
  // (replay excluded — it can be shared mutashabihat phrasing). Decides
  // whether a re-search that lands elsewhere is a correction (relocate)
  // or a deliberate move (stop the session).
  const wordsSinceLandingRef = useRef(0);
  // True until the first chunk of a recording session arrives — that chunk
  // uses the longer FIRST_IDENTIFY_CHUNK_MS, then the cadence drops to the
  // regular identify length.
  const firstChunkPendingRef = useRef(false);
  // What's currently *shown*, trailing positionRef (the matcher's true
  // position) by up to a chunk's worth of words while the word-by-word
  // reveal animation catches up.
  const displayPosRef = useRef<RecitePosition | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Furthest position corroborated by two different chunks. Chunks overlap
  // by half, so real speech at one chunk's tail is re-heard by the next —
  // while a hallucinated tail (Whisper finishing the phrase over silence)
  // is not. Words at or before this point are certainly real and may be
  // shown without the holdback margin, so pausing mid-verse doesn't keep
  // genuinely-recited words covered until the reciter continues.
  const confirmedPosRef = useRef<RecitePosition | null>(null);
  // Endpoint of the previous chunk's match, for the corroboration above.
  const prevChunkEndRef = useRef<RecitePosition | null>(null);

  // Position has moved past the last verse on this page (matched across the
  // page boundary within one chunk) — reveal the whole page and ask
  // PageViewer to advance; syncPage() re-derives state once the new page's
  // verses land.
  const advancePastPage = useCallback(
    (verses: Verse[], pos: RecitePosition) => {
      const last = verses[verses.length - 1];
      const isAfterPage =
        pos.sura > last.sura || (pos.sura === last.sura && pos.aya > last.aya);
      if (!isAfterPage) return false;
      setReciteHidden(new Set());
      setRecitePartialTarget(undefined);
      onAdvancePage(pageRef.current);
      return true;
    },
    [onAdvancePage],
  );

  const applyPosition = useCallback(
    (verses: Verse[], pos: RecitePosition) => {
      if (!verses.length) return;

      const activeVerse = verses.find(
        (v) => v.sura === pos.sura && v.aya === pos.aya,
      );
      if (!activeVerse) {
        advancePastPage(verses, pos);
        return;
      }

      setReciteHidden(keysAfterPosition(verses, pos));
      setRecitePartialTarget({
        sura: pos.sura,
        aya: pos.aya,
        revealedWordCount: pos.wordIndex,
        hiddenPositions: unrevealedWordPositions(activeVerse, pos.wordIndex),
      });
    },
    [advancePastPage],
  );

  const hideWholePage = useCallback((verses: Verse[]) => {
    setReciteHidden(new Set(verses.map((v) => verseKey(v.sura, v.aya))));
    setRecitePartialTarget(undefined);
  }, []);

  const toggleShowAll = useCallback(() => {
    setShowingAll((v) => !v);
  }, []);

  const stopRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  // Word-by-word display: steps displayPosRef one word toward positionRef
  // per tick, applying each intermediate position, so a whole chunk's worth
  // of matched words unfolds on screen one at a time instead of appearing
  // as a block. Steps through combined (current + next page) verses so the
  // animation flows across the page boundary the same way matching does.
  const ensureRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) return;
    revealTimerRef.current = setInterval(() => {
      const target = positionRef.current;
      const display = displayPosRef.current;
      if (!activeRef.current || !target || !display || cmpPos(display, target) >= 0) {
        stopRevealTimer();
        return;
      }
      const combined = nextPageVersesRef.current
        ? [...versesRef.current, ...nextPageVersesRef.current]
        : versesRef.current;
      const next = nextWordPosition(combined, display);
      // If the display position got orphaned (page changed under it), snap
      // to the target instead of stalling.
      if (!next || cmpPos(next, target) > 0) {
        displayPosRef.current = target;
        applyPosition(versesRef.current, target);
        return;
      }
      // Words two chunks have both matched are certainly real — reveal them
      // without the holdback margin. Beyond that, hold the matcher's newest
      // words back (see REVEAL_HOLDBACK_WORDS) until a later chunk either
      // corroborates them, pushes the target further, or rewinds away from
      // them (they were never said); the timer restarts on the next match.
      const confirmed = confirmedPosRef.current;
      if (!confirmed || cmpPos(next, confirmed) > 0) {
        let probe: RecitePosition | null = next;
        for (let i = 0; i < REVEAL_HOLDBACK_WORDS && probe; i++) {
          probe = nextWordPosition(combined, probe);
        }
        if (!probe || cmpPos(probe, target) > 0) {
          stopRevealTimer();
          return;
        }
      }
      displayPosRef.current = next;
      applyPosition(versesRef.current, next);
    }, WORD_REVEAL_STEP_MS);
  }, [applyPosition, stopRevealTimer]);

  // Single entry point for "the matcher advanced to `pos`": moves the true
  // position immediately (prompt biasing and further matching must not
  // wait for the animation) and lets the display catch up word by word.
  // A rewind (correction) renders immediately — re-hiding words shouldn't
  // trickle.
  const setMatchedPosition = useCallback(
    (pos: RecitePosition) => {
      const display = displayPosRef.current;
      positionRef.current = pos;
      if (display && cmpPos(pos, display) >= 0) {
        ensureRevealTimer();
        return;
      }
      // Rewinding: anything corroborated beyond the rewind point no longer
      // holds — the correction just re-hid those words, and they must not
      // resurface without fresh evidence.
      if (confirmedPosRef.current && cmpPos(confirmedPosRef.current, pos) > 0) {
        confirmedPosRef.current = pos;
      }
      stopRevealTimer();
      displayPosRef.current = pos;
      applyPosition(versesRef.current, pos);
    },
    [applyPosition, ensureRevealTimer, stopRevealTimer],
  );

  // Moves `positionRef` to the verse after `activeIndex` (or, if it was
  // the last verse on the page, synthesizes a position that satisfies
  // applyPosition's "past the last verse" check to trigger the
  // page-advance flow via advancePastPage).
  const advanceToNextVerse = useCallback(
    (verses: Verse[], activeIndex: number, activePos: RecitePosition) => {
      const nextVerse = verses[activeIndex + 1];
      const nextPos: RecitePosition = nextVerse
        ? firstWordPosition(nextVerse)
        : { sura: activePos.sura, aya: activePos.aya + 1, wordIndex: 0 };
      stopRevealTimer();
      positionRef.current = nextPos;
      displayPosRef.current = nextPos;
      applyPosition(verses, nextPos);
    },
    [applyPosition, stopRevealTimer],
  );

  // Manually advances `positionRef` by one word — same effect as if that
  // word had just been recited, so subsequent speech matching picks up
  // seamlessly from the new position. Once the active verse is fully
  // revealed, further calls advance into the next verse (matches the
  // manual Hifz reveal-next-word control's behavior).
  const revealNextWord = useCallback(() => {
    if (!activeRef.current || !positionRef.current) return;
    const pos = positionRef.current;
    const verses = versesRef.current;
    const activeIndex = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
    if (activeIndex === -1) return;

    const total = verseWordCount(verses[activeIndex]);
    if (pos.wordIndex < total) {
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
      stopRevealTimer();
      positionRef.current = nextPos;
      displayPosRef.current = nextPos;
      applyPosition(verses, nextPos);
      return;
    }

    advanceToNextVerse(verses, activeIndex, pos);
  }, [applyPosition, advanceToNextVerse, stopRevealTimer]);

  // Manually advances `positionRef` to the end of the active verse (if not
  // already there) or into the verse after it — mirrors the manual Hifz
  // reveal-next-verse control's "finish current verse before moving on."
  const revealNextVerse = useCallback(() => {
    if (!activeRef.current || !positionRef.current) return;
    const pos = positionRef.current;
    const verses = versesRef.current;
    const activeIndex = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
    if (activeIndex === -1) return;

    const total = verseWordCount(verses[activeIndex]);
    if (pos.wordIndex < total) {
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: total };
      stopRevealTimer();
      positionRef.current = nextPos;
      displayPosRef.current = nextPos;
      applyPosition(verses, nextPos);
      return;
    }

    advanceToNextVerse(verses, activeIndex, pos);
  }, [applyPosition, advanceToNextVerse, stopRevealTimer]);

  // Best-effort prefetch of the page after `page`, for cross-page
  // continuation matching. Stores into nextPageVersesRef only if the
  // session is still active and hasn't since moved to another page.
  const prefetchNextPage = useCallback((page: number) => {
    getPage(page + 1)
      .then((nextVerses) => {
        if (activeRef.current && pageRef.current === page) {
          nextPageVersesRef.current = nextVerses;
        }
      })
      .catch(() => {});
  }, []);

  // Adopts an identified page as the active matching target: loads its
  // verses, seeds position at the identified verse, reveals/hides
  // accordingly, and tells PageViewer to navigate there. `spokenSoFar` is
  // the transcript that identified the page — it's itself recited content,
  // so we replay it through the tracker to advance the reveal to where the
  // recitation has already reached, instead of leaving the just-recited
  // words of the identified verse hidden until the next chunk.
  const beginOnPage = useCallback(
    async (page: number, startSura: number, startAya: number, spokenSoFar?: string) => {
      const verses = await getPage(page);
      if (!activeRef.current) return;
      pageRef.current = page;
      versesRef.current = verses;
      nextPageVersesRef.current = null;
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
        // maxSkip: 0 here would stall the seed at the first garbled word
        // and leave the position behind, making every following tracking
        // chunk fail at that same word.
        const advanced = matchTranscript(spokenSoFar, verses, pos, {
          maxSkip: LOOSE_MATCH_MAX_SKIP,
        });
        if (advanced.position) pos = advanced.position;
      }
      positionRef.current = pos;
      hasIdentifiedRef.current = true;
      wordsSinceLandingRef.current = 0;
      // Fresh landing: nothing corroborated yet; the replay endpoint stands
      // in as the "previous chunk" so the first tracking chunk can
      // corroborate the replayed tail.
      confirmedPosRef.current = null;
      prevChunkEndRef.current = pos;
      if (pos) {
        // Land showing the identified verse still covered, then let the
        // reveal animation walk through the replayed (already-recited)
        // words one by one — the same word-by-word flow as live tracking.
        const landing = startVerse ? firstWordPosition(startVerse) : pos;
        stopRevealTimer();
        displayPosRef.current = landing;
        applyPosition(verses, landing);
        if (cmpPos(pos, landing) > 0) ensureRevealTimer();
      } else {
        hideWholePage(verses);
      }
      onNavigateToPage(page);
      prefetchNextPage(page);
    },
    [applyPosition, hideWholePage, onNavigateToPage, prefetchNextPage, stopRevealTimer, ensureRevealTimer],
  );

  // During the identify phase, accumulate transcript across chunks (a
  // single 6s chunk is often too short to contain a confidently-unique
  // phrase) and search the whole Quran corpus for where it starts.
  const handleIdentifyChunk = useCallback(
    async (text: string) => {
      // A silent chunk carries no new information — don't burn the chunk
      // budget or re-score an unchanged buffer on it. A user who has stopped
      // talking entirely is handled by the silence timeout, not here.
      if (!text.trim()) return;

      // Mid-session re-search only: if this chunk matches forward from the
      // position we were tracking, the re-search was a false alarm (a couple
      // of noisy chunks in a row) — cancel it and resume right where we were
      // instead of waiting for a whole-Quran identification to play out.
      if (hasIdentifiedRef.current && positionRef.current) {
        const combinedVerses = nextPageVersesRef.current
          ? [...versesRef.current, ...nextPageVersesRef.current]
          : versesRef.current;
        const resume = matchTranscript(text, combinedVerses, positionRef.current, {
          maxSkip: LOOSE_MATCH_MAX_SKIP,
        });
        if (resume.position && resume.consumedTokens >= LOOSE_MATCH_MIN_CONSUMED) {
          identifyingRef.current = false;
          setIdentifying(false);
          setChunkMsRef.current(TRACKING_CHUNK_MS);
          noMatchStreakRef.current = 0;
          recentTextsRef.current = [];
          setNoMatchHint(false);
          wordsSinceLandingRef.current += resume.consumedTokens;
          prevChunkEndRef.current = resume.position;
          setMatchedPosition(resume.position);
          return;
        }
      }

      identifyBufferRef.current = `${identifyBufferRef.current} ${text}`.trim();
      identifyChunkCountRef.current += 1;

      const outcome = await findVerseByStartingPhrase(identifyBufferRef.current);
      if (!activeRef.current || !recordingRef.current) return;

      if (outcome.status === "found") {
        // Mid-session re-search resolving to a *different* page: relocating
        // is only wanted while the original landing could still be wrong
        // (similar verses). Once the recitation has tracked well on this
        // page, a divergence elsewhere means the reciter moved on purpose —
        // end the session rather than yank them across the mushaf. The next
        // page is exempt: that's normal forward progression, not a move.
        const isMoveAway =
          hasIdentifiedRef.current &&
          outcome.match.page !== pageRef.current &&
          outcome.match.page !== pageRef.current + 1;
        if (isMoveAway && wordsSinceLandingRef.current >= ESTABLISHED_WORDS_ON_PAGE) {
          stopRecordingRef.current();
          return;
        }

        identifyingRef.current = false;
        setIdentifying(false);
        setChunkMsRef.current(TRACKING_CHUNK_MS);
        await beginOnPage(
          outcome.match.page,
          outcome.match.sura,
          outcome.match.aya,
          identifyBufferRef.current,
        );
        return;
      }

      // "ambiguous" is progress (a real candidate exists) — only "none"
      // counts toward the fast give-up. Give up on a run of no-candidate
      // chunks, or at the hard ceiling even while still ambiguous.
      if (outcome.status === "none") identifyNoProgressRef.current += 1;
      else identifyNoProgressRef.current = 0;

      if (
        identifyNoProgressRef.current >= MAX_NO_PROGRESS_CHUNKS ||
        identifyChunkCountRef.current >= MAX_IDENTIFY_CHUNKS
      ) {
        if (hasIdentifiedRef.current) {
          // Mid-session re-search failed — resume tracking from the last
          // known position instead of stopping. A mis-recitation or a few
          // bad chunks must never end the session.
          identifyingRef.current = false;
          setIdentifying(false);
          setChunkMsRef.current(TRACKING_CHUNK_MS);
          noMatchStreakRef.current = 0;
          setNoMatchHint(false);
          if (positionRef.current) {
            displayPosRef.current = positionRef.current;
            applyPosition(versesRef.current, positionRef.current);
          }
        } else {
          // Initial identification failed — stop listening rather than guess
          // or silently track the wrong page. Returns to armed so the user
          // can retry with a tap.
          stopRecordingRef.current();
        }
      }
    },
    [beginOnPage, applyPosition, setMatchedPosition],
  );

  // Gives up on the current page/position and re-enters the identify phase,
  // seeded with the text that just failed to match. Triggered after several
  // consecutive tracking-chunk mismatches — a run that long means the
  // recitation has moved somewhere the current page can no longer explain
  // (e.g. the initial identification landed on the wrong one).
  //
  // The current reveal is left on screen (not hidden) during the re-search:
  // if this turns out to be a false trigger and re-identification fails, the
  // user's place is preserved with no visible disruption.
  const reidentify = useCallback((seedText: string) => {
    identifyingRef.current = true;
    identifyBufferRef.current = seedText;
    identifyChunkCountRef.current = 0;
    identifyNoProgressRef.current = 0;
    noMatchStreakRef.current = 0;
    setNoMatchHint(false);
    setIdentifying(true);
    setChunkMsRef.current(IDENTIFY_CHUNK_MS);
  }, []);

  const processQueue = useCallback(async () => {
    if (transcribingRef.current) return;
    const blob = pendingChunksRef.current.shift();
    if (!blob) return;
    transcribingRef.current = true;
    try {
      const combinedVerses = nextPageVersesRef.current
        ? [...versesRef.current, ...nextPageVersesRef.current]
        : versesRef.current;
      const prompt =
        !identifyingRef.current && positionRef.current
          ? precedingWordsText(combinedVerses, positionRef.current) || undefined
          : undefined;

      const text = await transcribeChunk(blob, { language: "ar", prompt });
      // recordingRef too: a chunk that finishes transcribing after the user
      // pressed stop must not keep matching (or worse, navigate pages).
      if (!activeRef.current || !recordingRef.current) return;
      setRateLimited(false);
      if (text.trim()) {
        setLastChunkText(text.trim());
        lastSpeechAtRef.current = Date.now();
      }

      if (identifyingRef.current) {
        await handleIdentifyChunk(text);
        return;
      }

      if (!text.trim() || !positionRef.current) return;

      // maxSkip: 0 → strict reveal: only advance through words the reciter
      // actually said, in order, never revealing an expected word that
      // hasn't been matched yet (no "showing it before you recite it").
      const strict = matchTranscript(text, combinedVerses, positionRef.current, {
        maxSkip: 0,
      });
      let matchedPos = strict.position;
      let matchedConsumed = strict.consumedTokens;
      if (!matchedPos) {
        // Strict pass stuck — usually the STT garbled the one word the
        // cursor is waiting on, and no later chunk could ever get past it.
        // The loose pass may step over a couple of expected words, but only
        // counts with enough consecutively-matched words as proof the
        // recitation is genuinely past the stuck word.
        const loose = matchTranscript(text, combinedVerses, positionRef.current, {
          maxSkip: LOOSE_MATCH_MAX_SKIP,
        });
        if (loose.position && loose.consumedTokens >= LOOSE_MATCH_MIN_CONSUMED) {
          matchedPos = loose.position;
          matchedConsumed = loose.consumedTokens;
        }
      }
      if (matchedPos) {
        noMatchStreakRef.current = 0;
        recentTextsRef.current = [];
        setNoMatchHint(false);
        wordsSinceLandingRef.current += matchedConsumed;
        // Everything reached by both this chunk's match and the previous
        // one's has been heard twice (the chunks overlap) — corroborated,
        // so the display may show it without the holdback margin. This is
        // what releases a phrase's tail words after a pause: the next
        // overlapping chunk re-hears them even though the position itself
        // doesn't advance.
        const prevEnd = prevChunkEndRef.current;
        if (prevEnd) {
          const corroborated = cmpPos(prevEnd, matchedPos) <= 0 ? prevEnd : matchedPos;
          if (
            !confirmedPosRef.current ||
            cmpPos(corroborated, confirmedPosRef.current) > 0
          ) {
            confirmedPosRef.current = corroborated;
          }
        }
        prevChunkEndRef.current = matchedPos;
        setMatchedPosition(matchedPos);
        return;
      }

      // No match. Only a chunk with enough *real* words counts as a "not on
      // this page" signal — short or garbled chunks (mis-hearings, filler
      // like "بكم"/"اه"/"نعم") must never build toward a disruptive
      // re-search. Poor STT on the correct page should just pause the reveal,
      // not tear the session down.
      const usableWords = normalizeArabic(text)
        .split(" ")
        .filter((w) => w.length > 2).length;
      if (usableWords < 3) return;

      recentTextsRef.current = [...recentTextsRef.current, text].slice(-3);
      noMatchStreakRef.current += 1;
      if (noMatchStreakRef.current >= NO_MATCH_REIDENTIFY_STREAK) {
        // Several substantial chunks in a row match nowhere on this page —
        // the reciter has genuinely moved. Re-search seeded with the recent
        // context, not just this one chunk.
        reidentify(recentTextsRef.current.join(" "));
        recentTextsRef.current = [];
      } else if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) {
        setNoMatchHint(true);
      }
    } catch (err) {
      if (err instanceof RateLimitedError) {
        setRateLimited(true);
        // Drop everything already queued — it would just hit the same
        // cooldown — and stretch the capture cadence so we don't
        // immediately re-trigger the limit once it lifts.
        pendingChunksRef.current = [];
        setChunkMsRef.current(Math.max(TRACKING_CHUNK_MS, err.retryAfterMs));
        // No transcripts arrive during the cooldown, so keep the silence
        // clock alive — the user may well still be reciting, and the
        // auto-stop must not fire just because transcription is paused.
        lastSpeechAtRef.current = Date.now();
      }
      // Transcription failure for this chunk — keep listening, try the next one.
    } finally {
      transcribingRef.current = false;
      if (pendingChunksRef.current.length > 0) processQueue();
    }
  }, [setMatchedPosition, handleIdentifyChunk, reidentify]);

  const onChunk = useCallback(
    (blob: Blob) => {
      if (!recordingRef.current) return;
      pendingChunksRef.current.push(blob);
      // The extra-long first chunk has been captured — drop to the regular
      // identify cadence for the rest of the phase.
      if (firstChunkPendingRef.current) {
        firstChunkPendingRef.current = false;
        if (identifyingRef.current) setChunkMsRef.current(IDENTIFY_CHUNK_MS);
      }
      processQueue();
    },
    [processQueue],
  );

  const mic = useMicChunks(onChunk, IDENTIFY_CHUNK_MS);
  setChunkMsRef.current = mic.setChunkMs;

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const arm = useCallback(
    (page: number, verses: Verse[]) => {
      activeRef.current = true;
      pageRef.current = page;
      versesRef.current = verses;
      pendingChunksRef.current = [];
      nextPageVersesRef.current = null;
      stopRevealTimer();
      positionRef.current = verses.length ? firstWordPosition(verses[0]) : null;
      displayPosRef.current = positionRef.current;
      // Populate the hidden set so the hide button has something to reveal
      // against, but start *shown*: arming (before recording) must not hide
      // the page — visibility is the hide/show button's job until the user
      // actually starts reciting.
      hideWholePage(verses);
      setShowingAll(true);
      setLastChunkText("");
      noMatchStreakRef.current = 0;
      setNoMatchHint(false);
      setStatus("armed");
      prefetchNextPage(page);
    },
    [hideWholePage, prefetchNextPage, stopRevealTimer],
  );

  const startRecording = useCallback(() => {
    if (!activeRef.current || recordingRef.current) return;
    recordingRef.current = true;
    setLastChunkText("");
    setRecordingSeconds(0);
    noMatchStreakRef.current = 0;
    setNoMatchHint(false);
    setRateLimited(false);
    identifyingRef.current = true;
    identifyBufferRef.current = "";
    identifyChunkCountRef.current = 0;
    identifyNoProgressRef.current = 0;
    hasIdentifiedRef.current = false;
    recentTextsRef.current = [];
    wordsSinceLandingRef.current = 0;
    firstChunkPendingRef.current = true;
    setIdentifying(true);
    // Starting to recite: hide the page and reveal word-by-word as matched.
    stopRevealTimer();
    positionRef.current = versesRef.current.length
      ? firstWordPosition(versesRef.current[0])
      : null;
    displayPosRef.current = positionRef.current;
    confirmedPosRef.current = null;
    prevChunkEndRef.current = null;
    hideWholePage(versesRef.current);
    setShowingAll(false);
    setStatus("recording");
    lastSpeechAtRef.current = Date.now();
    mic.setChunkMs(FIRST_IDENTIFY_CHUNK_MS);
    // Speech-gated: the first chunk's clock starts when the reciter actually
    // starts, so pre-recitation silence never eats into it.
    mic.start(true);
    durationTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
      // Auto-stop if the user has gone quiet — no recognized speech for a
      // while means they've stopped reciting.
      if (Date.now() - lastSpeechAtRef.current >= SILENCE_TIMEOUT_MS) {
        stopRecordingRef.current();
      }
    }, 1000);
  }, [mic, hideWholePage, stopRevealTimer]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    mic.stop();
    clearDurationTimer();
    pendingChunksRef.current = [];
    setRecordingSeconds(0);
    identifyingRef.current = false;
    setIdentifying(false);
    // Deliberately NOT flushed to the matcher's position: the matcher's
    // newest words are exactly the ones that may be Whisper "finishing the
    // phrase" over trailing silence (a session usually ends with silence),
    // and revealing unrecited words is the one thing this mode must never
    // do. The held word or two — if genuinely recited — is a tap on the
    // reveal button away.
    stopRevealTimer();
    if (activeRef.current) setStatus("armed");
  }, [mic, clearDurationTimer, stopRevealTimer]);

  // Expose the latest stopRecording to earlier-defined callbacks (identify
  // give-up, silence timer) via a ref, avoiding a forward reference.
  stopRecordingRef.current = stopRecording;

  const syncPage = useCallback(
    (page: number, verses: Verse[]) => {
      if (!activeRef.current || pageRef.current === page) return;
      pageRef.current = page;
      versesRef.current = verses;
      nextPageVersesRef.current = null;

      // If the matched position isn't actually on this new page (matching
      // hasn't reached it yet — shouldn't normally happen since we only
      // advance once the previous page's last verse is fully matched, but
      // guard anyway), fall back to the new page's first word.
      const pos = positionRef.current;
      const posOnPage =
        pos && verses.some((v) => v.sura === pos.sura && v.aya === pos.aya);
      if (!posOnPage) {
        positionRef.current = verses.length ? firstWordPosition(verses[0]) : null;
      }
      // Same reconciliation for the display position: keep it (and any
      // running reveal animation) when it's already on this page, otherwise
      // snap it to the matcher's position.
      const dPos = displayPosRef.current;
      const dOnPage =
        dPos && verses.some((v) => v.sura === dPos.sura && v.aya === dPos.aya);
      if (!dOnPage) displayPosRef.current = positionRef.current;
      if (displayPosRef.current) applyPosition(verses, displayPosRef.current);
      else hideWholePage(verses);

      prefetchNextPage(page);
    },
    [applyPosition, hideWholePage, prefetchNextPage],
  );

  const disarm = useCallback(() => {
    activeRef.current = false;
    recordingRef.current = false;
    mic.stop();
    clearDurationTimer();
    stopRevealTimer();
    pendingChunksRef.current = [];
    positionRef.current = null;
    displayPosRef.current = null;
    confirmedPosRef.current = null;
    prevChunkEndRef.current = null;
    setReciteHidden(new Set());
    setRecitePartialTarget(undefined);
    setRecordingSeconds(0);
    setLastChunkText("");
    noMatchStreakRef.current = 0;
    setNoMatchHint(false);
    setRateLimited(false);
    setShowingAll(false);
    identifyingRef.current = false;
    identifyBufferRef.current = "";
    recentTextsRef.current = [];
    setIdentifying(false);
    setStatus("idle");
  }, [mic, clearDurationTimer, stopRevealTimer]);

  useEffect(() => {
    if (mic.error) setStatus("mic-error");
  }, [mic.error]);

  // Stop cleanly on unmount (navigating away mid-recitation). mic.stop is
  // read via a ref so this effect doesn't need to depend on the (stable
  // but hook-identity-changing) mic object.
  const micStopRef = useRef(mic.stop);
  micStopRef.current = mic.stop;
  useEffect(() => {
    return () => {
      activeRef.current = false;
      recordingRef.current = false;
      clearDurationTimer();
      stopRevealTimer();
      micStopRef.current();
    };
  }, [clearDurationTimer, stopRevealTimer]);

  return {
    status,
    reciteHidden,
    recitePartialTarget,
    micError: mic.error,
    recordingSeconds,
    lastChunkText,
    noMatchHint,
    identifying,
    rateLimited,
    showingAll,
    toggleShowAll,
    revealNextWord,
    revealNextVerse,
    arm,
    disarm,
    startRecording,
    stopRecording,
    syncPage,
  };
}
