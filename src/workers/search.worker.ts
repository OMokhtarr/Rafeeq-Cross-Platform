export {};
/* eslint-disable no-restricted-globals */

/**
 * SEARCH WEB WORKER
 * Migrated from: src/features/viewer/PageViewer.js → buildSearchIndex()
 *
 * The original code ran buildSearchIndex() synchronously at module load time,
 * iterating all 6,236 verses before React even mounted. This froze the UI
 * for 300–800 ms on mid-range hardware.
 *
 * This worker:
 *  1. Receives verse data from the main thread (after IDB seed)
 *  2. Builds the normalised search index off the main thread
 *  3. Accepts SEARCH messages and returns results
 *
 * Usage in PageViewer.tsx:
 *   const worker = new Worker(new URL('./search.worker.ts', import.meta.url));
 *   worker.postMessage({ type: 'BUILD_INDEX', verses: allVerses });
 *   worker.postMessage({ type: 'SEARCH', query: 'بسم الله' });
 */

// Inline the diacritics regex — workers can't import from the main bundle
// without a bundler that supports it. Copy is intentional.
const DIACRITIC_RE =
  /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
const PAUSE_RE = /[ۚۖۗۘۙۛ۝]/g;

function removeDiacritics(text: string): string {
  if (!text) return "";
  return text
    .replace(DIACRITIC_RE, "")
    .replace(PAUSE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Index ────────────────────────────────────────────────────────────────────

interface SearchEntry {
  sura: number;
  aya: number;
  page: number;
  text: string;
  normalized: string;
  suraNameAr: string;
}

let index: SearchEntry[] = [];

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (
  e: MessageEvent<
    | {
        type: "BUILD_INDEX";
        verses: Array<{
          sura: number;
          aya: number;
          page: number;
          text: string;
          suraNameAr: string;
        }>;
      }
    | { type: "SEARCH"; query: string }
  >,
) => {
  const { type } = e.data;

  if (type === "BUILD_INDEX") {
    const { verses } = e.data as { type: "BUILD_INDEX"; verses: SearchEntry[] };
    // Build normalised index — same logic as PageViewer.js buildSearchIndex()
    index = verses.map((v) => ({
      ...v,
      normalized: removeDiacritics(v.text),
    }));
    self.postMessage({ type: "INDEX_READY", count: index.length });
    return;
  }

  if (type === "SEARCH") {
    const { query } = e.data as { type: "SEARCH"; query: string };
    if (!query || query.trim().length < 2) {
      self.postMessage({ type: "RESULTS", results: [] });
      return;
    }

    const q = removeDiacritics(query.trim());
    const qOriginal = query.trim();

    // Filter — same logic as PageViewer.js search handler
    const results = index
      .filter((v) => v.normalized.includes(q) || v.text.includes(qOriginal))
      .slice(0, 50); // Cap at 50 results (matches original UI limit)

    self.postMessage({ type: "RESULTS", results });
  }
};
