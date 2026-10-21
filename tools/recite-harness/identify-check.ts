// Measures Recite Mode's whole-Quran identify (decideIdentify): how many
// words it needs, how often it never decides, and how often it decides the
// wrong place. Usage, from the repo root, after fetch-words.js has written
// qf-words.json next to this script:
//   npx ts-node --transpile-only -O '{"module":"commonjs"}' tools/recite-harness/identify-check.ts
import * as fs from "fs";
import * as path from "path";
import { normalizeArabic } from "../../src/app/core/services/quran/recite-matcher.service";
import { buildIdentifyCorpus, decideIdentify, type IdentifyCorpus } from "../../src/app/core/services/quran/recite-identify.service";
import { SOUND_ALIKE_PAIRS } from "../../src/app/core/services/quran/recite-spelling.service";

const SEED = 1;
const PASSAGES = 300;
const PASSAGE_WORDS = 12;
const MIN_MATCHED = 4; // the Deepgram value
const IDENTIFY_WINDOW = 30; // the scorer's window, in words
const SWAP_RATE = 0.15;
const DROP_RATE = 0.1;

// [verse_key, position, char_type_name, text_uthmani, text_imlaei, page]
type Row = [string, number, string, string, string, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The app's own corpus: normalizeArabic over the bundled Uthmani text. */
function buildAppCorpus(): IdentifyCorpus {
  const file = path.join(__dirname, "../../public/data/quran-text.json");
  return buildIdentifyCorpus(JSON.parse(fs.readFileSync(file, "utf8")).verses);
}

interface SpokenWord {
  key: string;
  /** Index within the verse's imlaei words. */
  offset: number;
  token: string;
}

/** The spoken side: Quran.com imlaei words in canonical order, normalized,
 *  with the stray hizb mark and anything without an Arabic letter dropped. */
function buildSpoken(): SpokenWord[] {
  const rows: Row[] = JSON.parse(fs.readFileSync(path.join(__dirname, "qf-words.json"), "utf8"));
  const byVerse = new Map<string, string[]>();
  for (const [key, , type, , imlaei] of rows) {
    if (type !== "word") continue;
    const words = byVerse.get(key) ?? [];
    for (const w of normalizeArabic(imlaei).split(" ")) {
      if (/[ء-ي]/.test(w)) words.push(w);
    }
    byVerse.set(key, words);
  }
  const keys = [...byVerse.keys()]
    .map((k) => k.split(":").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: SpokenWord[] = [];
  for (const [sura, aya] of keys) {
    byVerse.get(`${sura}:${aya}`)!.forEach((token, offset) => out.push({ key: `${sura}:${aya}`, offset, token }));
  }
  return out;
}

// Letter -> sound-alike letters, from the spelling check's own pairs.
const ALIKES = new Map<string, string[]>();
for (const [a, b] of SOUND_ALIKE_PAIRS) {
  ALIKES.set(a, [...(ALIKES.get(a) ?? []), b]);
  ALIKES.set(b, [...(ALIKES.get(b) ?? []), a]);
}

/** Drops ~DROP_RATE of the words and swaps one letter in ~SWAP_RATE of the
 *  rest for a sound-alike (when the word has a swappable letter). */
function addNoise(words: string[], rand: () => number): string[] {
  const out: string[] = [];
  for (const w of words) {
    if (rand() < DROP_RATE) continue;
    if (rand() < SWAP_RATE) {
      const swappable = [...w].map((c, i) => (ALIKES.has(c) ? i : -1)).filter((i) => i >= 0);
      if (swappable.length) {
        const i = swappable[Math.floor(rand() * swappable.length)];
        const options = ALIKES.get(w[i])!;
        out.push(w.slice(0, i) + options[Math.floor(rand() * options.length)] + w.slice(i + 1));
        continue;
      }
    }
    out.push(w);
  }
  return out;
}

interface Passage {
  words: string[];
  /** Verse of the first word, and the verses the passage spans. */
  key: string;
  spans: Set<string>;
  /** Corpus index of the passage's first word (verse start + offset, clamped). */
  startToken: number;
}

function samplePassages(
  spoken: SpokenWord[],
  corpus: IdentifyCorpus,
  kind: "start" | "mid",
  rand: () => number,
): Passage[] {
  const out: Passage[] = [];
  while (out.length < PASSAGES) {
    const idx = Math.floor(rand() * spoken.length);
    const first = spoken[idx];
    if (idx + PASSAGE_WORDS > spoken.length) continue;
    if (kind === "start" ? first.offset !== 0 : first.offset === 0) continue;
    const verseStart = corpus.startIndexByVerse.get(first.key);
    if (verseStart === undefined) continue;
    const next = corpus.verseStarts.find((v) => v > verseStart) ?? corpus.tokens.length;
    const slice = spoken.slice(idx, idx + PASSAGE_WORDS);
    out.push({
      words: slice.map((w) => w.token),
      key: first.key,
      spans: new Set(slice.map((w) => w.key)),
      startToken: Math.min(verseStart + first.offset, next - 1),
    });
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function measure(corpus: IdentifyCorpus, passages: Passage[], noisy: boolean, rand: () => number) {
  const needed: number[] = [];
  let never = 0;
  let wrong = 0;
  let adjacent = 0;
  for (const p of passages) {
    const words = noisy ? addNoise(p.words, rand) : p.words;
    let hit: { key: string; at: number } | null = null;
    for (let n = 1; n <= words.length; n++) {
      const d = decideIdentify(words.slice(0, n).join(" "), corpus, { minMatched: MIN_MATCHED });
      if (d.status === "found") {
        hit = { key: `${d.sura}:${d.aya}`, at: n };
        break;
      }
    }
    if (!hit) {
      never++;
      continue;
    }
    needed.push(hit.at);
    if (hit.key === p.key) continue;
    // Wrong: more than a scoring window from where the passage began, or a
    // verse the passage never reached. Otherwise a benign adjacent landing.
    const at = corpus.startIndexByVerse.get(hit.key) ?? Infinity;
    if (Math.abs(at - p.startToken) > IDENTIFY_WINDOW || !p.spans.has(hit.key)) wrong++;
    else adjacent++;
  }
  needed.sort((a, b) => a - b);
  const pct = (n: number) => `${((100 * n) / passages.length).toFixed(1)}%`;
  return {
    median: percentile(needed, 0.5),
    p90: percentile(needed, 0.9),
    never: pct(never),
    wrong: pct(wrong),
    adjacent: pct(adjacent),
  };
}

const t0 = Date.now();
const corpus = buildAppCorpus();
const spoken = buildSpoken();
console.log(
  `corpus (app, Uthmani): ${corpus.tokens.length} words, ${corpus.verseStarts.length} verses; ` +
    `spoken (imlaei): ${spoken.length} words`,
);
const rand = mulberry32(SEED);
const startPassages = samplePassages(spoken, corpus, "start", rand);
const midPassages = samplePassages(spoken, corpus, "mid", rand);

console.log(
  `seed ${SEED}, ${PASSAGES} passages per kind, ${PASSAGE_WORDS} words, minMatched ${MIN_MATCHED}; ` +
    `noise: ${SWAP_RATE * 100}% sound-alike swaps, ${DROP_RATE * 100}% drops`,
);
console.log("median/p90 are words until found, over passages that were found; the % columns are of all passages");
console.log("wrong: landed over 30 words from the passage start or on a verse it never reached; adjacent: found a neighbouring verse (benign)");
console.log("noisy counts are in heard words (after drops)");
const table: Record<string, unknown>[] = [];
for (const [label, passages] of [["start", startPassages], ["mid", midPassages]] as const) {
  for (const noisy of [false, true]) {
    const r = measure(corpus, passages, noisy, mulberry32(SEED + 1));
    table.push({ passages: label, input: noisy ? "noisy" : "clean", ...r });
  }
}
console.table(table);
console.log(`runtime ${((Date.now() - t0) / 1000).toFixed(1)}s`);
