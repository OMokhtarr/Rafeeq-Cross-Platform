// One-off: fetch word-aligned text_uthmani + text_imlaei for all 604 pages
// from the public Quran.com API into a compact JSON.
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "qf-words.json");
const PAGES = 604;
const CONCURRENCY = 4;

async function fetchPage(page, attempt = 1) {
  const url =
    `https://api.quran.com/api/v4/verses/by_page/${page}` +
    `?words=true&word_fields=text_uthmani,text_imlaei&per_page=300`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const rows = [];
    for (const v of j.verses) {
      for (const w of v.words) {
        rows.push([v.verse_key, w.position, w.char_type_name, w.text_uthmani, w.text_imlaei, page]);
      }
    }
    return rows;
  } catch (e) {
    if (attempt >= 5) throw new Error(`page ${page}: ${e.message}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return fetchPage(page, attempt + 1);
  }
}

(async () => {
  const results = new Array(PAGES + 1);
  let next = 1;
  async function worker() {
    while (next <= PAGES) {
      const p = next++;
      results[p] = await fetchPage(p);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const all = results.slice(1).flat();
  fs.writeFileSync(OUT, JSON.stringify(all));
  const words = all.filter((r) => r[2] === "word").length;
  console.log(`saved ${all.length} rows (${words} words) to ${OUT}`);
})().catch((e) => {
  console.error("FAILED", e.message);
  process.exit(1);
});
