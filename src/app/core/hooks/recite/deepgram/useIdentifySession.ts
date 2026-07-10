/**
 * IDENTIFY SESSION — Deepgram engine's own copy of the "which verse am I
 * reciting" state machine.
 *
 * This file is a fork of ../groq/useIdentifySession.ts — they started
 * identical but are independently editable per-engine copies, not a shared
 * module. Free to change Deepgram's identify behavior here (timing,
 * confirmation rules, re-search patience, etc.) without touching Groq's
 * copy or reciteCore.ts.
 *
 * Two things this copy already diverges on, both because Deepgram feeds it
 * interim (partial, revised-in-place) text instead of Groq's genuinely-new
 * chunk text — see the buffer-accumulation comment in handleIdentifyChunk
 * and the MAX_IDENTIFY_CHUNKS/MAX_NO_PROGRESS_CHUNKS comment below.
 */

import { useCallback, useRef } from "react";
import type { Verse } from "../../../../shared/models/verse.model";
import { getPage, findVerseByStartingPhrase } from "../../../services/data/quran.service";
import { firstWordPosition, matchTranscript } from "../../../services/quran/recite-matcher.service";
import { correctMuqattaatOpening } from "./muqattaat";
import {
  ESTABLISHED_WORDS_ON_PAGE,
  LOOSE_MATCH_MAX_SKIP,
  LOOSE_MATCH_MIN_CONSUMED,
  cmpPos,
  type RecitePosition,
  type RevealAnimator,
} from "../shared/reciteCore";

/**
 * Deepgram's own identify-attempt budget — NOT reciteCore's
 * MAX_IDENTIFY_CHUNKS/MAX_NO_PROGRESS_CHUNKS (those are Groq's, tuned for
 * one attempt per ~4s chunk). An "attempt" here can fire as often as every
 * IDENTIFY_INTERIM_THROTTLE_MS (deepgramDriver.ts), so counting attempts
 * the same way Groq does would hit the ceiling in a couple of seconds
 * instead of the intended tens-of-seconds patience window. Scaled up
 * roughly by the throttle-vs-chunk-length ratio (~4000ms / 400ms = 10x)
 * plus headroom, and reconsider these two together if the throttle ever
 * changes.
 */
const MAX_NO_PROGRESS_CHUNKS = 12;
const MAX_IDENTIFY_CHUNKS = 30;

/**
 * Lower than quran.service.ts's default (5): Deepgram retries the search
 * every ~400ms on fresh interim text (see IDENTIFY_INTERIM_THROTTLE_MS in
 * deepgramDriver.ts), so it gets many more attempts per second than Groq's
 * one-per-4s-chunk. A slightly lower per-attempt bar resolves sooner without
 * meaningfully raising false-identification risk — if a 4-word coincidence
 * were going to falsely match, the very next attempt (400ms later, with
 * more real words accumulated) would very likely change the ranking anyway.
 * Not lowered further than this: much below 4, short/ambiguous phrases
 * shared across many verse openings could commit too early.
 */
const IDENTIFY_MIN_MATCHED = 4;

export interface IdentifySessionDeps {
  isActive: () => boolean;
  isRecording: () => boolean;
  getPage: () => number;
  setPage: (page: number) => void;
  getPageVerses: () => Verse[];
  setPageVerses: (verses: Verse[]) => void;
  clearNextPageVerses: () => void;
  getCombinedVerses: () => Verse[];
  reveal: RevealAnimator;
  hideWholePage: (verses: Verse[]) => void;
  applyPosition: (verses: Verse[], pos: RecitePosition) => void;
  onNavigateToPage: (page: number) => void;
  prefetchNextPage: (page: number) => void;
  /** Reflects identify-phase UI state (mic/identifying indicators). */
  setIdentifying: (v: boolean) => void;
  setNoMatchHint: (v: boolean) => void;
  /** Engine switches its own cadence when identify hands off to tracking
   *  (Groq: chunk length; Deepgram: no-op, streaming has no cadence). */
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
   *  the re-search doesn't immediately re-trigger another one. */
  resetMismatchStreak: () => void;
  /** Stops the whole recording session (initial identify failure). */
  stopRecording: () => void;
}

export interface IdentifySession {
  /** True while accumulating transcript and searching the whole Quran for
   *  the starting verse, instead of tracking against a known position. */
  isIdentifying: () => boolean;
  /**
   * Feed one segment of recognized text into the identify state machine.
   *
   * IMPORTANT (Deepgram-specific, unlike Groq's copy of this file): Deepgram
   * interims are *cumulative revisions of the current utterance window* —
   * each one is the full transcript-so-far of that utterance, not just new
   * words (e.g. "الحمد", then "الحمد لله", then "الحمد لله رب" are three
   * events for one utterance, not three new words). Pass `isFinal` so this
   * function can tell "this settles the current utterance, permanently
   * commit it" from "this revises the utterance still in progress, replace
   * the previous guess for it" — naively concatenating every event's text
   * (as Groq's chunked-append model does) would duplicate words and make
   * the search buffer grow unboundedly.
   */
  handleIdentifyChunk: (text: string, isFinal: boolean) => Promise<void>;
  /** Begins a fresh identify phase (recording just started). */
  startIdentifying: () => void;
  /** Gives up on the current position and re-enters the identify phase,
   *  seeded with recent context. Used by both drivers' wrong-page logic. */
  reidentify: (seedText: string) => void;
  /** Words matched on the current page since landing on it — exposed so
   *  each driver's tracking loop can feed it on every successful match. */
  addWordsSinceLanding: (n: number) => void;
}

export function useIdentifySession(deps: IdentifySessionDeps): IdentifySession {
  const identifyingRef = useRef(false);
  // Text from utterances that have already settled (received a final) —
  // permanent, never rewritten. The live search buffer is this plus
  // currentInterimRef appended on top (see handleIdentifyChunk); Groq's
  // copy of this file only needs a single bufferRef because each chunk it
  // receives is genuinely new text, never a revision of the previous one.
  const committedBufferRef = useRef("");
  // The latest interim text for the utterance still in progress — replaced
  // wholesale on each interim (it's a revision, not new text), and folded
  // into committedBufferRef once a final arrives for it.
  const currentInterimRef = useRef("");
  const bufferRef = useRef(""); // committed + current interim — what's searched
  const chunkCountRef = useRef(0);
  // Consecutive identify attempts that produced *no* viable candidate (vs.
  // "ambiguous", which is progress). Drives the fast give-up on non-Quran.
  const noProgressRef = useRef(0);
  // True once we've successfully identified a page at least once this
  // session. Distinguishes the *initial* identify (failure → stop) from a
  // *mid-session* re-search (failure → just resume tracking, never stop —
  // a mis-recitation must not end the session).
  const hasIdentifiedRef = useRef(false);
  const wordsSinceLandingRef = useRef(0);
  // Where tracking was when a *re-identify* began — captured before any
  // reset so the whole-Quran search can break exact-text ties (mutashabihat
  // like 2:34 vs 20:116) toward wherever the reciter just was, instead of
  // stalling on "ambiguous … waiting". null during the initial identify,
  // which has no prior position to lean on.
  const reidentifyFromRef = useRef<{ sura: number; aya: number } | null>(null);

  // Adopts an identified page as the active matching target: loads its
  // verses, seeds position at the identified verse, reveals/hides
  // accordingly, and tells PageViewer to navigate there. `spokenSoFar` is
  // the transcript that identified the page — it's itself recited content,
  // so it's replayed through the tracker to advance the reveal to where the
  // recitation has already reached, instead of leaving the just-recited
  // words of the identified verse hidden until the next segment.
  const beginOnPage = useCallback(
    async (page: number, startSura: number, startAya: number, spokenSoFar?: string) => {
      const verses = await getPage(page);
      if (!deps.isActive()) return;
      deps.setPage(page);
      deps.setPageVerses(verses);
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
    },
    [deps],
  );

  const handleIdentifyChunk = useCallback(
    async (text: string, isFinal: boolean) => {
      // A silent segment carries no new information — don't burn the
      // budget or re-score an unchanged buffer on it. A user who has
      // stopped talking entirely is handled by the silence timeout.
      if (!text.trim()) return;

      // Deepgram's `text` is the FULL transcript of the current utterance
      // window, not just new words — replace, don't append, the in-progress
      // slice; only fold it permanently into committed history once it
      // settles (isFinal). Appending every event's text here (as Groq's
      // copy of this file correctly does for its genuinely-incremental
      // chunks) would duplicate every word many times over as an utterance
      // grows across several interim revisions.
      currentInterimRef.current = text;
      const combinedBuffer = `${committedBufferRef.current} ${currentInterimRef.current}`.trim();
      if (isFinal) {
        committedBufferRef.current = combinedBuffer;
        currentInterimRef.current = "";
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
          identifyingRef.current = false;
          deps.setIdentifying(false);
          deps.onSwitchToTracking();
          deps.resetMismatchStreak();
          deps.setNoMatchHint(false);
          wordsSinceLandingRef.current += resume.consumedTokens;
          deps.resumeTrackingAt(resume.position, resume.consumedTokens);
          return;
        }
      }

      // Muqatta'at (disconnected-letter openers like الم، يس، طه) are the
      // one place Deepgram reliably mis-transcribes Quranic text — see
      // ./muqattaat.ts. Only worth checking at the very start of the
      // buffer: these openers are always the first thing recited on the
      // ~90 verses that have one, never appearing mid-recitation.
      bufferRef.current = correctMuqattaatOpening(combinedBuffer);
      if (bufferRef.current !== combinedBuffer) {
        console.log(
          `[recite-identify] muqatta'at correction: "${combinedBuffer}" -> "${bufferRef.current}"`,
        );
      }
      chunkCountRef.current += 1;

      const outcome = await findVerseByStartingPhrase(bufferRef.current, {
        minMatched: IDENTIFY_MIN_MATCHED,
        nearPosition: reidentifyFromRef.current,
      });
      if (!deps.isActive() || !deps.isRecording()) return;

      if (outcome.status === "found") {
        // Mid-session re-search resolving to a *different* page: relocating
        // is only wanted while the original landing could still be wrong
        // (similar verses). Once the recitation has tracked well on this
        // page, a divergence elsewhere means the reciter deliberately moved
        // — end the session rather than yank them across the mushaf. The
        // next page is exempt: that's normal forward progression.
        const isMoveAway =
          hasIdentifiedRef.current &&
          outcome.match.page !== deps.getPage() &&
          outcome.match.page !== deps.getPage() + 1;
        if (isMoveAway && wordsSinceLandingRef.current >= ESTABLISHED_WORDS_ON_PAGE) {
          deps.stopRecording();
          return;
        }

        identifyingRef.current = false;
        deps.setIdentifying(false);
        deps.onSwitchToTracking();
        await beginOnPage(
          outcome.match.page,
          outcome.match.sura,
          outcome.match.aya,
          bufferRef.current,
        );
        return;
      }

      // "ambiguous" is progress (a real candidate exists) — only "none"
      // counts toward the fast give-up. Give up on a run of no-candidate
      // attempts, or at the hard ceiling even while still ambiguous.
      if (outcome.status === "none") noProgressRef.current += 1;
      else noProgressRef.current = 0;

      if (
        noProgressRef.current >= MAX_NO_PROGRESS_CHUNKS ||
        chunkCountRef.current >= MAX_IDENTIFY_CHUNKS
      ) {
        if (hasIdentifiedRef.current) {
          // Mid-session re-search failed — resume tracking from the last
          // known position instead of stopping. A mis-recitation or a few
          // bad segments must never end the session.
          identifyingRef.current = false;
          deps.setIdentifying(false);
          deps.onSwitchToTracking();
          deps.resetMismatchStreak();
          deps.setNoMatchHint(false);
          const pos = deps.reveal.getTruePosition();
          if (pos) {
            // Snap display to the true position with no animation (matches
            // the original "resume tracking" behavior exactly) — do NOT use
            // reveal.reset(), which would also clear confirmedPos; anything
            // already corroborated before the re-search still holds.
            deps.reveal.reconcile(pos, pos);
            deps.applyPosition(deps.getPageVerses(), pos);
          }
        } else {
          // Initial identification failed — stop listening rather than
          // guess or silently track the wrong page. Returns to armed so
          // the user can retry with a tap.
          deps.stopRecording();
        }
      }
    },
    [deps, beginOnPage],
  );

  const startIdentifying = useCallback(() => {
    identifyingRef.current = true;
    committedBufferRef.current = "";
    currentInterimRef.current = "";
    bufferRef.current = "";
    chunkCountRef.current = 0;
    noProgressRef.current = 0;
    hasIdentifiedRef.current = false;
    wordsSinceLandingRef.current = 0;
    // Initial identify: no prior tracking position to bias toward.
    reidentifyFromRef.current = null;
  }, []);

  const reidentify = useCallback(
    (seedText: string) => {
      identifyingRef.current = true;
      // Capture where tracking was *before* we tear it down, so the search
      // can tie-break exact-text-duplicate candidates toward here (see
      // findVerseByStartingPhrase's nearPosition). A re-identify almost
      // always resumes near where it stalled.
      const from = deps.reveal.getTruePosition();
      reidentifyFromRef.current = from ? { sura: from.sura, aya: from.aya } : null;
      // The seed is recent tracking context, already "said" — treat it as
      // committed rather than a still-changing interim, so the very next
      // interim event (which is its own fresh utterance window) appends to
      // it instead of overwriting it.
      committedBufferRef.current = seedText;
      currentInterimRef.current = "";
      bufferRef.current = seedText;
      chunkCountRef.current = 0;
      noProgressRef.current = 0;
      deps.resetMismatchStreak();
      deps.setNoMatchHint(false);
      deps.setIdentifying(true);
    },
    [deps],
  );

  return {
    isIdentifying: () => identifyingRef.current,
    handleIdentifyChunk,
    startIdentifying,
    reidentify,
    addWordsSinceLanding: (n) => {
      wordsSinceLandingRef.current += n;
    },
  };
}
