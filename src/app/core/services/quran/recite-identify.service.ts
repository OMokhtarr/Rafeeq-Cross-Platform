/**
 * Recite Mode's whole-Quran "which verse am I reciting" decision, as a pure
 * function of the spoken text and the flattened corpus. No storage or app
 * imports, so the measuring harness (tools/recite-harness) can run it under
 * ts-node; `findVerseByStartingPhrase` in quran.service.ts wraps it and
 * resolves the chosen verse to a page.
 */

import {
  normalizeArabic,
  scoreCorpusAnchors,
  wordsMatch,
  type CorpusToken,
} from "./recite-matcher.service";

/** The whole Quran flattened into one canonical-order token sequence plus
 *  the indices where each verse starts. */
export interface IdentifyCorpus {
  tokens: CorpusToken[];
  verseStarts: number[];
  startIndexByVerse: Map<string, number>;
}

export type IdentifyDecision =
  | {
      status: "found";
      sura: number;
      aya: number;
      /** True when no independent near-duplicate competed with the match. */
      unique: boolean;
    }
  | { status: "ambiguous" }
  | { status: "none" };

export interface IdentifyOptions {
  minMatched?: number;
  nearPosition?: { sura: number; aya: number } | null;
  /** Receives the decision's diagnostic lines; omitted by the harness. */
  log?: (line: string) => void;
}

/** Window (in words) used both by the anchor scorer and the head-to-head
 *  disambiguation — a candidate's "continuation" for comparison. */
const IDENTIFY_WINDOW = 30;

/**
 * Decides which verse a spoken phrase most likely starts from, or that it
 * can't *confidently* tell yet. It never forces a low-confidence guess: a
 * wrong navigation is worse than admitting "I can't tell yet."
 *
 * Verses are ranked by how much of the transcript matches forward from them
 * (see `scoreCorpusAnchors`). Several verses open with near-identical
 * phrasing, so a near-tied top score is "ambiguous" until the recitation
 * moves past the shared opening.
 */
export function decideIdentify(
  spokenText: string,
  corpus: IdentifyCorpus,
  options: IdentifyOptions = {},
): IdentifyDecision {
  const { tokens, verseStarts, startIndexByVerse } = corpus;
  const log = options.log ?? (() => {});
  if (!tokens.length) return { status: "none" };

  const ranked = scoreCorpusAnchors(spokenText, tokens, verseStarts);
  if (!ranked.length) {
    log(`no sequence anchor matched — waiting for more`);
    return { status: "none" };
  }

  const best = ranked[0];
  // The highest-scoring rival that's an *independent* competitor — far enough
  // away in the mushaf that its scoring window doesn't overlap the winner's.
  // Judged by canonical token distance, NOT sura/aya: adjacent verses (even
  // straddling a sura boundary, e.g. the last verse of Al-Mulk and the first
  // of Al-Qalam) have overlapping windows and correlated scores, so they must
  // count as the *same* region — otherwise they'd forever tie as fake
  // "duplicates" with no unique words to tell them apart. Only a competitor a
  // full window away means we genuinely can't tell where we are.
  const bestStart = startIndexByVerse.get(`${best.sura}:${best.aya}`) ?? -1;
  const rival = ranked.find((c) => {
    const s = startIndexByVerse.get(`${c.sura}:${c.aya}`);
    return s !== undefined && Math.abs(s - bestStart) > IDENTIFY_WINDOW;
  });
  const rivalScore = rival ? rival.matchedWords : null;

  // Require an absolute number of matched words before trusting an
  // identification — enough that noise or ordinary (non-Quran) speech
  // coinciding with a verse opening won't trip it. A fixed floor, NOT a
  // share of the (ever-growing) transcript: the window only spans ~30 words,
  // so demanding a ratio of a long buffer becomes impossible to satisfy the
  // more the user recites. Callers with a faster/fresher feedback loop
  // (Deepgram's streaming driver — see
  // hooks/recite/deepgram/useIdentifySession.ts) may pass a lower value:
  // they get more attempts per second, so a slightly lower per-attempt bar
  // still keeps false-identification rare while resolving sooner overall.
  const MIN_MATCHED = options.minMatched ?? 5;
  if (best.matchedWords < MIN_MATCHED) {
    log(
      `best=${best.sura}:${best.aya} matched=${best.matchedWords} ` +
        `< min ${MIN_MATCHED} — waiting`,
    );
    return { status: "none" };
  }

  // Ambiguous on the raw score: a near-duplicate verse elsewhere is within a
  // word of the winner. Shared words inflate both equally, so the raw gap is
  // a weak signal. Decide it with a targeted head-to-head instead — compare
  // only each candidate's *unique* window words (in one's continuation but
  // not the other's) against the recitation. Whichever candidate's
  // discriminating words the reciter actually said wins. This keys entirely
  // on the divergence point (e.g. 2:38 "خوف عليهم يحزنون" vs 20:123 "يضل
  // يشقى"), so it resolves as soon as you recite past the shared phrasing and
  // shrugs off STT noise on the shared part.
  const ambiguous = rival !== undefined && rivalScore !== null && best.matchedWords - rivalScore <= 1;
  if (ambiguous && rival) {
    const windowWords = (sura: number, aya: number): string[] => {
      const start = startIndexByVerse.get(`${sura}:${aya}`);
      if (start === undefined) return [];
      return [
        ...new Set(tokens.slice(start, start + IDENTIFY_WINDOW).map((tok) => tok.token)),
      ];
    };
    // "Unique" must be fuzzy, not exact: near-duplicate verses differ in
    // form on shared words too (اهبطوا/اهبطا, تبع/اتبع), and those must NOT
    // count as discriminating — only genuinely different words (خوف/يضل …).
    const bestW = windowWords(best.sura, best.aya);
    const rivalW = windowWords(rival.sura, rival.aya);
    const bestUnique = bestW.filter((w) => !rivalW.some((r) => wordsMatch(r, w)));
    const rivalUnique = rivalW.filter((w) => !bestW.some((b) => wordsMatch(b, w)));

    const spoken = [
      ...new Set(normalizeArabic(spokenText).split(" ").filter((w) => w.length > 2)),
    ];
    const countHits = (unique: string[]) =>
      unique.filter((u) => spoken.some((s) => wordsMatch(u, s))).length;
    const bestHits = countHits(bestUnique);
    const rivalHits = countHits(rivalUnique);

    // Need a clear margin on the discriminating words before committing, so a
    // single garbled/coincidental word can't flip the choice.
    const DECISIVE_MARGIN = 2;
    if (Math.abs(bestHits - rivalHits) < DECISIVE_MARGIN) {
      // The unique-word test can't separate these yet (often 0/0 because the
      // two candidates are word-for-word identical for many verses — e.g.
      // "وإذ قلنا للملائكة اسجدوا لآدم…" is verbatim at 2:34 / 17:61 / 18:50 /
      // 20:116). But this is a *re-identify*, so the caller may already know
      // roughly where the reciter was tracking a moment ago. If so, prefer the
      // candidate whose canonical position is closest to that — a re-identify
      // almost always resumes near where it stalled, not in a distant sura —
      // and decide now instead of waiting for the reciter to reach a
      // distinguishing word. A genuine jump to a far-away duplicate still
      // works: once they recite past the shared text, the normal wrong-page /
      // re-identify path corrects it.
      if (options.nearPosition) {
        const anchor = startIndexByVerse.get(
          `${options.nearPosition.sura}:${options.nearPosition.aya}`,
        );
        const bestIdx = startIndexByVerse.get(`${best.sura}:${best.aya}`);
        const rivalIdx = startIndexByVerse.get(`${rival.sura}:${rival.aya}`);
        if (anchor !== undefined && bestIdx !== undefined && rivalIdx !== undefined) {
          const nearer =
            Math.abs(bestIdx - anchor) <= Math.abs(rivalIdx - anchor) ? best : rival;
          log(
            `ambiguous ${best.sura}:${best.aya} vs ${rival.sura}:${rival.aya}` +
              ` — tie-broken toward last position ${options.nearPosition.sura}:` +
              `${options.nearPosition.aya} → ${nearer.sura}:${nearer.aya}`,
          );
          // A rival existed (these are exact-text duplicates) — not unique.
          return { status: "found", sura: nearer.sura, aya: nearer.aya, unique: false };
        }
      }
      log(
        `ambiguous: ${best.sura}:${best.aya} vs ${rival.sura}:${rival.aya} — ` +
          `unique-word hits ${bestHits}/${rivalHits}, not decisive yet — waiting`,
      );
      return { status: "ambiguous" };
    }
    const winner = bestHits > rivalHits ? best : rival;
    log(
      `head-to-head ${best.sura}:${best.aya}(${bestHits}) vs ` +
        `${rival.sura}:${rival.aya}(${rivalHits}) → ${winner.sura}:${winner.aya}`,
    );
    // A competing near-duplicate existed and was resolved by discriminating
    // words — not unique, so the caller should still wait past shared phrasing.
    return { status: "found", sura: winner.sura, aya: winner.aya, unique: false };
  }

  // No independent rival competed with the winner — the passage is unique.
  return { status: "found", sura: best.sura, aya: best.aya, unique: true };
}
