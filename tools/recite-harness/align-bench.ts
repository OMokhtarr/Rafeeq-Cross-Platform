// Times the recite aligner on two consecutive pages, the cursor near the
// bottom of the first: one alignPhrase call with RESTART_WINDOW (the old
// viewer) and with restartAnywhere (the viewer now), and the per-interim
// cost of a phrase fed through the tracker interim by interim, as Deepgram
// does. Usage, from the repo root, after fetch-words.js has written
// qf-words.json next to this script:
//   npx ts-node --transpile-only -O '{"module":"commonjs"}' tools/recite-harness/align-bench.ts
import * as fs from "fs";
import * as path from "path";
import type { Verse, VerseWord } from "../../src/app/shared/models/verse.model";
import {
  alignPhrase,
  buildExpectedWords,
  createReciteTracker,
  type AlignOptions,
  type SpokenWord,
  type TrackerState,
} from "../../src/app/core/services/quran/recite-aligner.service";

const PAGES = [40, 50, 580];
const PHRASE_WORDS = [5, 15, 30];
/** Recitable words between the cursor and the end of the first page. */
const CURSOR_FROM_PAGE_END = 10;
const RUNS = 15;
const CONFIDENCE = 0.95;

// [verse_key, position, char_type_name, text_uthmani, text_imlaei, page]
type Row = [string, number, string, string, string, number];

interface PageData {
  verses: Verse[];
  /** Spoken (imlaei) text of each recitable word, keyed `sura:aya:position`. */
  spoken: Map<string, string>;
}

/** Verses as the app's page data carries them, from Quran.com word rows. */
function loadPages(): Map<number, PageData> {
  const rows: Row[] = JSON.parse(fs.readFileSync(path.join(__dirname, "qf-words.json"), "utf8"));
  const byVerse = new Map<string, Row[]>();
  for (const row of rows) byVerse.set(row[0], [...(byVerse.get(row[0]) ?? []), row]);
  const pages = new Map<number, PageData>();
  byVerse.forEach((verseRows, key) => {
    const [sura, aya] = key.split(":").map(Number);
    const page = verseRows[0][5];
    const words: VerseWord[] = verseRows.map(([, position, type, uthmani]) => ({
      position,
      // Inverted charType model: "end" is a recitable word (quran.service).
      charType: type === "end" ? "word" : "end",
      text_uthmani: uthmani,
      codeV2: "",
      lineNumber: 0,
      pageNumber: page,
    }));
    const data = pages.get(page) ?? { verses: [], spoken: new Map() };
    data.verses.push({ sura, aya, text: "", page, suraNameAr: "", words });
    for (const [, position, type, , imlaei] of verseRows) {
      if (type === "word") data.spoken.set(`${key}:${position}`, imlaei);
    }
    pages.set(page, data);
  });
  pages.forEach((d) => d.verses.sort((a, b) => a.sura - b.sura || a.aya - b.aya));
  return pages;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function time(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

interface Case {
  verses: Verse[];
  state: TrackerState;
  spoken: SpokenWord[];
}

function buildCase(pages: Map<number, PageData>, page: number, words: number): Case {
  const first = pages.get(page)!;
  const second = pages.get(page + 1)!;
  const verses = [...first.verses, ...second.verses];
  const firstCount = buildExpectedWords(first.verses).length;
  const all = buildExpectedWords(verses);
  const cursorIdx = firstCount - CURSOR_FROM_PAGE_END;
  const c = all[cursorIdx];
  const spokenText = new Map([...first.spoken, ...second.spoken]);
  const spoken = all
    .slice(cursorIdx)
    .flatMap((w) => spokenText.get(`${w.sura}:${w.aya}:${w.position}`)!.split(/\s+/))
    .slice(0, words)
    .map((text) => ({ text, confidence: CONFIDENCE }));
  return { verses, state: { cursor: { sura: c.sura, aya: c.aya, wordIndex: c.wordIndex }, marks: new Map() }, spoken };
}

/** Median ms of one alignPhrase call over the whole phrase. */
function singleCall({ verses, state, spoken }: Case, options: AlignOptions): number {
  return median(Array.from({ length: RUNS }, () => time(() => alignPhrase(state, spoken, verses, options))));
}

/** Median ms of a phrase's last interim and mean ms per interim, the phrase
 *  fed one more word per interim through one tracker, then a final. */
function interims({ verses, state, spoken }: Case, options: AlignOptions): { last: number; mean: number } {
  const lasts: number[] = [];
  const means: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const tracker = createReciteTracker(state, options);
    let total = 0;
    let last = 0;
    for (let k = 1; k <= spoken.length; k++) {
      last = time(() => tracker.onPartial(spoken.slice(0, k), verses));
      total += last;
    }
    tracker.onFinal(spoken, verses);
    lasts.push(last);
    means.push(total / spoken.length);
  }
  return { last: median(lasts), mean: median(means) };
}

const pages = loadPages();
const fmt = (ms: number) => ms.toFixed(1).padStart(6);
// Warm up the JIT so the first row is not an outlier.
for (let k = 0; k < 3; k++) interims(buildCase(pages, PAGES[0], 15), { restartAnywhere: true });

console.log("ms per call — cursor", CURSOR_FROM_PAGE_END, "words before the end of the first page");
console.log("pages    words | window: call | anywhere: call  interim(last)  interim(mean)");
for (const page of PAGES) {
  for (const words of PHRASE_WORDS) {
    const c = buildCase(pages, page, words);
    const windowed = singleCall(c, {});
    const anywhere = singleCall(c, { restartAnywhere: true });
    const fed = interims(c, { restartAnywhere: true });
    console.log(
      `${page}/${page + 1}`.padEnd(8),
      String(words).padStart(5),
      "|",
      `       ${fmt(windowed)} |`,
      `         ${fmt(anywhere)}`,
      `        ${fmt(fed.last)}`,
      `        ${fmt(fed.mean)}`,
    );
  }
}
