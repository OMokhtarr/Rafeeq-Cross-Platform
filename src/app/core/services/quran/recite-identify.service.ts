/**
 * Recite Mode's whole-Quran "which verse am I reciting" decision, as a pure
 * function of the spoken text and the flattened corpus. No storage or app
 * imports, so the measuring harness (tools/recite-harness) can run it under
 * ts-node; `findVerseByStartingPhrase` in quran.service.ts wraps it and
 * resolves the chosen verse to a page.
 */

import {
  matchAgainstSequence,
  normalizeArabic,
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

/** Flattens verse rows into the identify corpus: sorted into true canonical
 *  order (the store returns "10:1" before "2:1"; sequence matching depends on
 *  order), one normalized token per word, verses with no words skipped. */
export function buildIdentifyCorpus(
  rows: { sura: number; aya: number; text: string }[],
): IdentifyCorpus {
  const sorted = [...rows].sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  const tokens: CorpusToken[] = [];
  const verseStarts: number[] = [];
  const startIndexByVerse = new Map<string, number>();
  for (const r of sorted) {
    const words = normalizeArabic(r.text || "")
      .split(" ")
      .filter(Boolean);
    if (!words.length) continue;
    startIndexByVerse.set(`${r.sura}:${r.aya}`, tokens.length);
    verseStarts.push(tokens.length);
    words.forEach((token, wordIndex) => {
      tokens.push({ sura: r.sura, aya: r.aya, wordIndex, token });
    });
  }
  return { tokens, verseStarts, startIndexByVerse };
}

/** Per corpus word: where it occurs and how rare it is. Built once per
 *  corpus (see `buildIdentifyIndex`) and reused by every identify call. */
export interface IdentifyIndex {
  /** Corpus positions of each `searchKey`, in canonical order (the
   *  basmalah folded into sura openers left out, see `searchOrder`). */
  positionsByKey: Map<string, number[]>;
  /** Corpus occurrences of each `searchKey`, basmalah included. */
  countByKey: Map<string, number>;
  /** `looseKey` of every corpus token, precomputed for `sameWord`. */
  looseKeyByToken: Map<string, string>;
  /** Rarity of the token at each corpus position: log(N / count of its
   *  `searchKey`), so spelling variants of one word share one rarity. */
  weights: Float64Array;
  /** log(N), the weight of a word that occurs once. Thresholds are in this
   *  unit so they mean the same on any corpus size (the tests' fixture too). */
  hapaxWeight: number;
  /** Corpus positions the in-order follow walks: every word except the
   *  basmalah the corpus folds into each sura's first verse, so a passage
   *  running from one sura into the next (68:52 → 69:1) isn't broken by
   *  four words the reciter may not say. */
  searchOrder: number[];
  /** Index into `searchOrder` of each corpus position (-1 if left out). */
  rankOf: Int32Array;
}

/**
 * A looser spelling key. Spoken text arrives in standard spelling while
 * the corpus is Uthmani: after `normalizeArabic` (which already folds
 * alif/hamza seats, alif maqsura and ta marbuta) the two still differ by
 * written or dropped alifs (السموت / السماوات, الكتب / الكتاب), the hamza
 * letter (ءامنوا / امنوا), tatweel (الـاخره), the small waw/ya of a pronoun
 * (بهۦ / به) and doubled seats (شيـا / شييا). Dropping those and collapsing
 * doubled letters lines up ~99% of word pairs.
 */
function looseKey(token: string): string {
  return token.replace(/[اءـۥۦ]/g, "").replace(/(.)\1+/g, "$1");
}

/** Lookup key for candidate places and rarity: the loose key, or the token
 *  itself when nothing of it survives the fold (ءا). */
function searchKey(token: string): string {
  return looseKey(token) || token;
}

/** Corpus positions of the basmalah folded into sura openers: the first
 *  four words of every first verse after Al-Fatiha's that repeat 1:1. */
function foldedBasmalah(corpus: IdentifyCorpus): Set<number> {
  const out = new Set<number>();
  const fatiha = corpus.startIndexByVerse.get("1:1");
  if (fatiha === undefined) return out;
  const basmalah = corpus.tokens.slice(fatiha, fatiha + 4).map((t) => t.token);
  corpus.startIndexByVerse.forEach((start, key) => {
    if (key === "1:1" || !key.endsWith(":1")) return;
    if (basmalah.every((word, i) => corpus.tokens[start + i]?.token === word)) {
      for (let i = 0; i < basmalah.length; i++) out.add(start + i);
    }
  });
  return out;
}

export function buildIdentifyIndex(corpus: IdentifyCorpus): IdentifyIndex {
  const { tokens } = corpus;
  const skipped = foldedBasmalah(corpus);
  const looseKeyByToken = new Map<string, string>();
  const keys = tokens.map(({ token }) => {
    let loose = looseKeyByToken.get(token);
    if (loose === undefined) {
      loose = looseKey(token);
      looseKeyByToken.set(token, loose);
    }
    return loose || token;
  });

  const positionsByKey = new Map<string, number[]>();
  const counts = new Map<string, number>();
  const searchOrder: number[] = [];
  const rankOf = new Int32Array(tokens.length).fill(-1);
  keys.forEach((key, i) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (skipped.has(i)) return;
    rankOf[i] = searchOrder.length;
    searchOrder.push(i);
    const list = positionsByKey.get(key);
    if (list) list.push(i);
    else positionsByKey.set(key, [i]);
  });

  const n = Math.max(tokens.length, 1);
  const weights = Float64Array.from(keys, (key) => Math.log(n / counts.get(key)!));
  return {
    positionsByKey,
    countByKey: counts,
    looseKeyByToken,
    weights,
    hapaxWeight: Math.log(n),
    searchOrder,
    rankOf,
  };
}

/** Index built on demand for callers that don't pass one (the harness),
 *  kept per corpus so it's still built only once. */
const lazyIndexes = new WeakMap<IdentifyCorpus, IdentifyIndex>();

function indexFor(corpus: IdentifyCorpus): IdentifyIndex {
  let index = lazyIndexes.get(corpus);
  if (!index) {
    index = buildIdentifyIndex(corpus);
    lazyIndexes.set(corpus, index);
  }
  return index;
}

/** Spoken words whose occurrences seed the candidate places, rarest first. */
const ANCHOR_WORDS = 3;
/** Candidate places scored per call, rarest anchor's occurrences first. */
const MAX_CANDIDATES = 300;
/** Corpus words the in-order follow may skip per spoken word (STT drops). */
const ALIGN_MAX_SKIP = 3;
/** Score (sum of matched words' rarity, in hapax units) the best place needs. */
const FOUND_SCORE = 2.6;
/** How far (in hapax units) the best must beat an independent rival to be
 *  decided on score alone; closer rivals go to the head-to-head. */
const FOUND_MARGIN = 0.5;
/** Cost (in hapax units) of each corpus word the follow skips over. */
const SKIP_COST = 0.02;
/** More places than this within the margin is a refrain, not a pair of
 *  near-duplicates: no head-to-head, only the position tie-break. */
const MAX_CLOSE = 6;

/** `wordsMatch`, plus the spelling folds of `looseKey` (ءايتنا / اياتنا is
 *  two edits apart, too far for `wordsMatch` on a six-letter word). Short
 *  keys are left to `wordsMatch`: "ما", "ام" and "اما" all fold to "م". */
function sameWordWith(index: IdentifyIndex): (a: string, b: string) => boolean {
  const keyOf = (w: string) => index.looseKeyByToken.get(w) ?? looseKey(w);
  return (a, b) => {
    if (wordsMatch(a, b)) return true;
    const key = keyOf(a);
    return key.length >= 3 && key === keyOf(b);
  };
}

interface Candidate {
  score: number;
  /** `searchOrder` ranks of the matched words, ascending. */
  ranks: number[];
  /** Corpus index of the first matched word; its verse is the answer. */
  first: number;
  /** Spoken word indices the follow matched, and the one matched at `first`. */
  said: Set<number>;
  firstSaid: number;
}

/** Follows the spoken words in order outward from one anchor (spoken word
 *  `at` = corpus word `anchor`): forward for the words after it, backward for
 *  the words before it, so drops and insertions on either side don't shift
 *  the place. */
function scoreAround(
  spoken: string[],
  at: number,
  anchor: number,
  tokens: CorpusToken[],
  index: IdentifyIndex,
  spokenWeights: number[],
  sameWord: (a: string, b: string) => boolean,
): Candidate {
  const { searchOrder, rankOf, weights } = index;
  const reach = ALIGN_MAX_SKIP + 1;
  const rank = rankOf[anchor];
  const after = spoken.slice(at + 1);
  const forward = matchAgainstSequence(
    after,
    searchOrder.slice(rank + 1, rank + 1 + after.length * reach).map((p) => tokens[p]),
    ALIGN_MAX_SKIP,
    sameWord,
  );
  const before = spoken.slice(0, at).reverse();
  const backward = matchAgainstSequence(
    before,
    searchOrder
      .slice(Math.max(0, rank - before.length * reach), rank)
      .reverse()
      .map((p) => tokens[p]),
    ALIGN_MAX_SKIP,
    sameWord,
  );
  // Matched (rank, spoken word) pairs in corpus order.
  const pairs: [number, number][] = [
    ...backward.matchedIndices
      .map((k, j): [number, number] => [rank - 1 - k, at - 1 - backward.spokenIndices[j]])
      .reverse(),
    [rank, at],
    ...forward.matchedIndices.map((k, j): [number, number] => [
      rank + 1 + k,
      at + 1 + forward.spokenIndices[j],
    ]),
  ];
  const ranks = pairs.map(([r]) => r);
  // Each match is worth the rarer-looking of its two sides only as far as
  // both agree: a common spoken word fuzzily matching a rare corpus word
  // ("ان" / "ابن", "ابراهيم" / "وابرهيم") earns the common word's weight.
  let score = 0;
  for (const [r, w] of pairs) score += Math.min(weights[searchOrder[r]], spokenWeights[w]);
  // Corpus words skipped inside the follow cost a little, so where the same
  // words line up both tightly and loosely (102:4 "كلا سوف تعلمون" vs 102:5
  // "كلا لو تعلمون") the tight one wins.
  const skipped = ranks[ranks.length - 1] - ranks[0] + 1 - ranks.length;
  // A lone short first word in an earlier verse, reached across a gap, is
  // weak evidence of where the passage began (`wordsMatch` lets a 3-letter
  // word differ by a letter: a garbled قل matches the "بكل" two words before
  // 28:49), so the answer starts at the next matched word.
  let firstPair = 0;
  if (ranks.length > 1 && ranks[1] - ranks[0] > 1) {
    const lone = tokens[searchOrder[ranks[0]]];
    const next = tokens[searchOrder[ranks[1]]];
    if (lone.token.length <= 3 && (next.sura !== lone.sura || next.aya !== lone.aya)) {
      firstPair = 1;
    }
  }
  return {
    score: score - skipped * SKIP_COST * index.hapaxWeight,
    ranks,
    first: searchOrder[ranks[firstPair]],
    said: new Set(pairs.map(([, w]) => w)),
    firstSaid: pairs[firstPair][1],
  };
}

/** Candidate places: every occurrence of the rarest spoken words, each
 *  scored by how much of the recitation follows it in order. */
function rankCandidates(
  spoken: string[],
  corpus: IdentifyCorpus,
  index: IdentifyIndex,
  sameWord: (a: string, b: string) => boolean,
): Candidate[] {
  const spokenWeights = spoken.map((w) => {
    const count = index.countByKey.get(searchKey(w));
    return count ? Math.log(index.weights.length / count) : index.hapaxWeight;
  });
  const anchors = spoken
    .map((token, at) => ({ at, positions: index.positionsByKey.get(searchKey(token)) }))
    .filter((a): a is { at: number; positions: number[] } => a.positions !== undefined)
    .sort((a, b) => a.positions.length - b.positions.length)
    .slice(0, ANCHOR_WORDS);

  const seenStarts = new Set<number>();
  const ranked: Candidate[] = [];
  for (const { at, positions } of anchors) {
    for (const anchor of positions) {
      if (ranked.length >= MAX_CANDIDATES) break;
      // Two anchors implying the same start would follow identically.
      const start = index.rankOf[anchor] - at;
      if (seenStarts.has(start)) continue;
      seenStarts.add(start);
      ranked.push(
        scoreAround(spoken, at, anchor, corpus.tokens, index, spokenWeights, sameWord),
      );
    }
  }
  return ranked.sort(
    (a, b) => b.score - a.score || b.ranks.length - a.ranks.length || a.first - b.first,
  );
}

/** Normalized spoken words, with a standalone vocative "يا" / "ويا" joined
 *  to the word it calls: the Uthmani corpus never writes it apart (يايها,
 *  ويقوم, يحسرتي), and on its own "حسرتا" is two edits from "يحسرتي". */
function spokenWords(text: string): string[] {
  const words = normalizeArabic(text).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const vocative = words[i] === "يا" || words[i] === "ويا";
    if (vocative && i + 1 < words.length) out.push(words[i] + words[++i]);
    else out.push(words[i]);
  }
  return out;
}

/** True when two candidates matched any of the same corpus words. */
const shareWords = (a: Candidate, b: Candidate) => {
  const set = new Set(a.ranks);
  return b.ranks.some((r) => set.has(r));
};

/**
 * Decides which verse a spoken phrase was recited from, or that it can't
 * *confidently* tell yet. It never forces a low-confidence guess: a wrong
 * navigation is worse than admitting "I can't tell yet."
 *
 * Candidate places come from where the rarest spoken words occur (any
 * word, not just a verse opening, so a passage started mid-verse is found
 * too). Each is scored by the rarity of the words the recitation follows in
 * order from there: a rare word pins the place far more than "الله" or
 * "من", so a few rare words decide sooner and common words alone never do.
 * The answer is the verse holding the first matched word.
 *
 * Several passages are near-identical across the Quran (mutashabihat), so a
 * rival place scoring close to the best goes to a head-to-head on the words
 * that differ, then to the caller's last known position, and stays
 * "ambiguous" until the recitation moves past the shared phrasing.
 */
export function decideIdentify(
  spokenText: string,
  corpus: IdentifyCorpus,
  options: IdentifyOptions = {},
  index: IdentifyIndex = indexFor(corpus),
): IdentifyDecision {
  const { tokens, startIndexByVerse } = corpus;
  const log = options.log ?? (() => {});
  if (!tokens.length) return { status: "none" };

  const spoken = spokenWords(spokenText);
  if (spoken.filter((w) => w.length > 2).length < 3) return { status: "none" };

  const sameWord = sameWordWith(index);
  const ranked = rankCandidates(spoken, corpus, index, sameWord);
  if (!ranked.length) {
    log(`no sequence anchor matched — waiting for more`);
    return { status: "none" };
  }

  const best = ranked[0];
  const margin = FOUND_MARGIN * index.hapaxWeight;
  // Independent places, best first: each shares no matched word with a
  // higher-ranked one. Candidates that do share words are the same passage
  // anchored differently (or a skip-ridden echo of it), not a competitor;
  // two that don't are the same words found in two places, even when the
  // places are only a verse apart (2:149 / 2:150).
  const places: Candidate[] = [best];
  for (const c of ranked) {
    if (best.score - c.score >= margin && places.length > 1) break;
    if (places.every((p) => !shareWords(p, c))) places.push(c);
  }
  const rival = places[1] as Candidate | undefined;
  const at = (c: Candidate) => `${tokens[c.first].sura}:${tokens[c.first].aya}`;
  const units = (score: number) => (score / index.hapaxWeight).toFixed(2);
  const ranking =
    `ranked best=${at(best)} score=${units(best.score)} ` +
    `rival=${rival ? `${at(rival)} score=${units(rival.score)}` : "none"}`;

  // Require both enough rarity and an absolute number of matched words,
  // enough that noise or ordinary (non-Quran) speech coinciding with a
  // passage won't trip it. Callers with a faster/fresher feedback loop
  // (Deepgram's streaming driver — see
  // hooks/recite/deepgram/useIdentifySession.ts) may pass a lower count:
  // they get more attempts per second, so a slightly lower per-attempt bar
  // still keeps false-identification rare while resolving sooner overall.
  const MIN_MATCHED = options.minMatched ?? 5;
  if (best.score < FOUND_SCORE * index.hapaxWeight || best.ranks.length < MIN_MATCHED) {
    log(`${ranking} matched=${best.ranks.length} → none (waiting)`);
    return { status: "none" };
  }

  if (!rival || best.score - rival.score >= margin) {
    log(`${ranking} → found ${at(best)}`);
    const t = tokens[best.first];
    return { status: "found", sura: t.sura, aya: t.aya, unique: true };
  }
  log(`${ranking} → too close, head-to-head`);

  // Near-duplicate places score within the margin. Shared words inflate
  // them equally, so the raw gap is a weak signal. Decide it with a targeted
  // head-to-head instead: the words each place's own in-order follow
  // matched and the other's didn't. Whichever place's discriminating words
  // the reciter actually said wins. This keys entirely on the divergence
  // point (e.g. 2:38 "خوف عليهم يحزنون" vs 20:123 "يضل يشقى"), so it
  // resolves as soon as you recite past the shared phrasing and shrugs off
  // STT noise on the shared part.
  const close = places.filter((p) => best.score - p.score < margin);
  // Words said before the later of the two places begins (stale words left
  // in a re-identify buffer, leading junk) don't count for either: they'd
  // let a place win on words the other was never asked to follow.
  const hits = (a: Candidate, b: Candidate) => {
    const from = Math.max(a.firstSaid, b.firstSaid);
    const words = new Set<string>();
    a.said.forEach((w) => {
      if (w >= from && !b.said.has(w) && spoken[w].length > 2) words.add(spoken[w]);
    });
    return words.size;
  };
  // Need a clear margin on the discriminating words before committing, so a
  // single garbled/coincidental word can't flip the choice. Only the top two
  // may win, and only by beating every close place: the rest can block a
  // decision (a phrase like "له ملك السماوات والارض" recurs in many suras)
  // but never take it from places that scored higher.
  const DECISIVE_MARGIN = 2;
  const beatsAll = (c: Candidate) =>
    close.every((r) => r === c || hits(c, r) - hits(r, c) >= DECISIVE_MARGIN);
  const winner = close.length > MAX_CLOSE ? undefined : [best, rival].find(beatsAll);
  if (winner) {
    const t = tokens[winner.first];
    const tally = close.map((c) => `${at(c)}(${hits(c, c === best ? rival : best)})`);
    log(`head-to-head ${tally.join(" vs ")} → ${t.sura}:${t.aya}`);
    // A competing near-duplicate existed and was resolved by discriminating
    // words — not unique, so the caller should still wait past shared phrasing.
    return { status: "found", sura: t.sura, aya: t.aya, unique: false };
  }

  // The unique-word test can't separate these yet (often 0/0 because the
  // places are word-for-word identical for many verses — e.g. "وإذ قلنا
  // للملائكة اسجدوا لآدم…" is verbatim at 2:34 / 17:61 / 18:50 / 20:116). But
  // this may be a *re-identify*, so the caller may already know roughly
  // where the reciter was tracking a moment ago. If so, prefer the place
  // closest to that — a re-identify almost always resumes near where it
  // stalled, not in a distant sura — and decide now instead of waiting for
  // the reciter to reach a distinguishing word. A genuine jump to a far-away
  // duplicate still works: once they recite past the shared text, the normal
  // wrong-page / re-identify path corrects it.
  if (options.nearPosition) {
    const anchor = startIndexByVerse.get(
      `${options.nearPosition.sura}:${options.nearPosition.aya}`,
    );
    if (anchor !== undefined) {
      const nearest = close.reduce((a, b) =>
        Math.abs(b.first - anchor) < Math.abs(a.first - anchor) ? b : a,
      );
      const t = tokens[nearest.first];
      log(
        `ambiguous ${close.map(at).join(" vs ")}` +
          ` — tie-broken toward last position ${options.nearPosition.sura}:` +
          `${options.nearPosition.aya} → ${t.sura}:${t.aya}`,
      );
      // A rival existed (these are exact-text duplicates) — not unique.
      return { status: "found", sura: t.sura, aya: t.aya, unique: false };
    }
  }
  log(
    `ambiguous: ${close.map(at).join(" vs ")} — ` +
      `unique-word hits ${hits(best, rival)}/${hits(rival, best)}, not decisive yet — waiting`,
  );
  return { status: "ambiguous" };
}
