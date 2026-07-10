/**
 * DEEPGRAM TRACKING MATCH — forked from shared/reciteCore.ts's
 * matchFromPosition so Deepgram can change the strict-vs-loose preference
 * without touching Groq (whose copy stays byte-for-byte in reciteCore.ts).
 *
 * Why the fork exists — the "repeated opener" stall:
 *   Runs of consecutive verses often share their first word (An-Naba' 78:9,
 *   78:10, 78:11 all begin "وجعلنا"; ...). The shared matcher takes the STRICT
 *   pass (maxSkip: 0) the instant it matches *anything*, even a single word.
 *   So when the reciter is on 78:10 but the reveal is still parked on 78:9,
 *   the leading "وجعلنا" of the spoken text matches 78:9's own "وجعلنا"
 *   (consumed = 1) and returns — the position crawls one word instead of
 *   jumping to 78:10, and every following word falls off. The loose pass,
 *   which *would* have stepped over 78:9's tail and landed correctly on
 *   78:10, never gets to run. Streaming hits this constantly because it
 *   matches one short final at a time, so a coincidental first-word hit
 *   dominates the whole match; Groq's multi-word chunks rarely let it.
 *
 * The fix, contained entirely here: when strict barely advanced (a trivial
 * 1-word hit) but loose consumed clearly more, in-order, prefer loose. Loose
 * still has to clear its own consumed-words bar (proof the reciter is
 * genuinely further along), so this never reveals ahead of the reciter — it
 * only breaks the coincidental-opener tie in favor of real forward progress.
 * Every other case falls through to exactly the shared behavior.
 */

import {
  matchTranscript,
  type RecitePosition,
} from "../../../services/quran/recite-matcher.service";
import type { Verse } from "../../../../shared/models/verse.model";
import { LOOSE_MATCH_MIN_CONSUMED, type MatchOutcome } from "../shared/reciteCore";

/** How many expected words the loose pass may step over between two matched
 *  spoken words. The shared matcher uses 2; Deepgram needs 3 to bridge a
 *  *whole short verse's tail* in the repeated-opener case: parked on 78:9
 *  ("وجعلنا نومكم سباتا") while reciting 78:10 ("وجعلنا الليل لباسا"), the
 *  target word "الليل" sits 3 expected words past the coincidentally-matched
 *  leading "وجعلنا" (نومكم، سباتا، then next وجعلنا) — a skip of 2 can't reach
 *  it, so loose stays weak and the trivial strict hit wins, stalling. Still
 *  gated by LOOSE_MATCH_MIN_CONSUMED, so this only tolerates one more
 *  garbled/missed word between real matches; it never reveals ahead. */
const DEEPGRAM_LOOSE_MAX_SKIP = 3;

/** A strict match that consumed no more than this is "trivial" — likely just
 *  a coincidental shared opener word (وجعلنا/…) matched against the stuck
 *  verse itself, not real forward progress. When loose beats it clearly,
 *  loose wins. Kept at 1 so only the pure single-word case is overridden; a
 *  strict match of 2+ in-order words is genuine tracking and always wins. */
const TRIVIAL_STRICT_CONSUMED = 1;

/** How much further (in consumed words) loose must reach than a trivial
 *  strict match before we trust it over strict — a clear margin so one
 *  fuzzy-matched stray word can't flip the decision. */
const LOOSE_OVER_STRICT_MARGIN = 2;

export function matchFromPosition(
  text: string,
  combinedVerses: Verse[],
  from: RecitePosition,
): MatchOutcome | null {
  const strict = matchTranscript(text, combinedVerses, from, { maxSkip: 0 });
  const loose = matchTranscript(text, combinedVerses, from, {
    maxSkip: DEEPGRAM_LOOSE_MAX_SKIP,
  });

  const looseUsable =
    loose.position !== null && loose.consumedTokens >= LOOSE_MATCH_MIN_CONSUMED;

  if (strict.position) {
    // Repeated-opener override: strict latched onto a lone coincidental word
    // while loose followed the recitation clearly further in order — trust
    // loose so the reveal jumps to the verse actually being recited instead
    // of crawling one word on the stuck one.
    if (
      looseUsable &&
      strict.consumedTokens <= TRIVIAL_STRICT_CONSUMED &&
      loose.consumedTokens - strict.consumedTokens >= LOOSE_OVER_STRICT_MARGIN
    ) {
      return { position: loose.position!, consumed: loose.consumedTokens };
    }
    return { position: strict.position, consumed: strict.consumedTokens };
  }

  if (looseUsable) {
    return { position: loose.position!, consumed: loose.consumedTokens };
  }
  return null;
}
