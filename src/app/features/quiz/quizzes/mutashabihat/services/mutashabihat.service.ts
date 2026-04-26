/**
 * MUTASHABIHAT SERVICE
 * Migrated from: src/shared/utils/mutashabihatUtils.js
 *
 * All logic preserved exactly. Changes:
 *  1. TypeScript types added
 *  2. `require("../../data/quran-text.json")` replaced with import from verseCache
 *     (quranLoader's verseCache is now the single source of truth for verse text)
 *  3. Moved into features/mutashabihat/services/ — only used by mutashabihat feature
 *  4. stripDiacritics/removeDiacritics imported from shared arabic.util.ts
 */

import { stripDiacritics } from "../../../../../core/utils/arabic.util";
import { surahNamesArabic } from "../../../../../core/services/data/repositories/ayah.repository";
import { pageData } from "../../../../../../data/quranData";

// Re-export for consumers that imported from the old location
export { stripDiacritics };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MutashabihatGroup {
  id: string;
  sharedPhrase: string;
  sharedPhraseRaw: string;
  windowSize: number;
  verses: RichVerse[];
}

interface RichVerse {
  sura: number;
  aya: number;
  text: string;
  page: number;
  juz: number;
  suraNameAr: string;
  hiddenStart: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the page number for a given sura:aya pair */
function getPageForVerse(sura: number, aya: number): number {
  for (let p = pageData.length - 1; p >= 1; p--) {
    const [pSura, pAya] = pageData[p];
    if (sura > pSura || (sura === pSura && aya >= pAya)) return p;
  }
  return 1;
}

function getJuzForPage(page: number): number {
  return Math.ceil(page / 20);
}

// ─── Group builder ────────────────────────────────────────────────────────────

let _cachedGroups: MutashabihatGroup[] | null = null;

/**
 * Build and cache all mutashabihat groups from the verse cache.
 * Logic identical to mutashabihatUtils.js → getAllMutashabihatGroups().
 *
 * Requires quran.service.ts ensureSeeded() to have run first so that
 * the in-memory verseCache in ayah.repository.ts is populated.
 * Call this from a useEffect / async context, not at module load time.
 */
export function getAllMutashabihatGroups(
  verses: Record<string, string>,
): MutashabihatGroup[] {
  if (_cachedGroups) return _cachedGroups;

  const phraseMap = new Map<
    string,
    Array<{
      sura: number;
      aya: number;
      text: string;
      normWords: string[];
      window: number;
      phrase: string;
    }>
  >();

  for (const [key, text] of Object.entries(verses)) {
    const [suraStr, ayaStr] = key.split(":");
    const sura = parseInt(suraStr);
    const aya = parseInt(ayaStr);
    const norm = stripDiacritics(text);
    const words = norm.split(/\s+/).filter(Boolean);

    if (words.length < 5) continue;

    for (const window of [3, 4]) {
      if (words.length < window + 2) continue;
      const phrase = words.slice(0, window).join(" ");
      const mapKey = `${window}|${phrase}`;
      if (!phraseMap.has(mapKey)) phraseMap.set(mapKey, []);
      phraseMap
        .get(mapKey)!
        .push({ sura, aya, text, normWords: words, window, phrase });
    }
  }

  const groups: MutashabihatGroup[] = [];
  const usedVerseKeys = new Set<string>();

  for (const [mapKey, entries] of phraseMap.entries()) {
    if (entries.length < 2) continue;

    const { window, phrase } = entries[0];

    const continuations = new Set(
      entries.map((e) => e.normWords.slice(window, window + 5).join(" ")),
    );
    if (continuations.size < 2) continue;

    const pairKey = entries
      .map((e) => `${e.sura}:${e.aya}`)
      .sort()
      .join(",");
    if (window === 3 && usedVerseKeys.has(pairKey)) continue;
    if (window === 4) usedVerseKeys.add(pairKey);

    const richVerses: RichVerse[] = entries.map((e) => {
      const page = getPageForVerse(e.sura, e.aya);
      return {
        sura: e.sura,
        aya: e.aya,
        text: e.text,
        page,
        juz: getJuzForPage(page),
        suraNameAr: surahNamesArabic[e.sura] ?? `سورة ${e.sura}`,
        hiddenStart: e.normWords.slice(window).join(" "),
      };
    });

    groups.push({
      id: mapKey,
      sharedPhrase: phrase,
      sharedPhraseRaw: entries[0].text.split(/\s+/).slice(0, window).join(" "),
      windowSize: window,
      verses: richVerses,
    });
  }

  groups.sort((a, b) => {
    if (b.windowSize !== a.windowSize) return b.windowSize - a.windowSize;
    return a.verses[0].sura - b.verses[0].sura;
  });

  _cachedGroups = groups;
  return groups;
}

/** Invalidate the cached groups (call if quiz data changes) */
export function clearMutashabihatCache(): void {
  _cachedGroups = null;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
// Identical to mutashabihatUtils.js — logic unchanged.

export function filterGroupsBySurahs(
  groups: MutashabihatGroup[],
  surahs: number[],
): MutashabihatGroup[] {
  if (!surahs || surahs.length === 0) return groups;
  const set = new Set(surahs);
  return groups.filter((g) => g.verses.every((v) => set.has(v.sura)));
}

export function filterGroupsByPages(
  groups: MutashabihatGroup[],
  pageFrom: number,
  pageTo: number,
): MutashabihatGroup[] {
  return groups.filter((g) =>
    g.verses.every((v) => v.page >= pageFrom && v.page <= pageTo),
  );
}

export function filterGroupsByJuzs(
  groups: MutashabihatGroup[],
  juzs: number[],
): MutashabihatGroup[] {
  if (!juzs || juzs.length === 0) return groups;
  const set = new Set(juzs);
  return groups.filter((g) => g.verses.every((v) => set.has(v.juz)));
}

// ─── Question builder ─────────────────────────────────────────────────────────
// Identical to mutashabihatUtils.js → buildMutashabihatQuestion()

export function buildMutashabihatQuestion(group: MutashabihatGroup) {
  const idx = Math.floor(Math.random() * group.verses.length);
  const target = group.verses[idx];
  const siblings = group.verses.filter((_, i) => i !== idx);

  const rawWords = target.text.split(/\s+/).filter(Boolean);
  const displayedPortion = rawWords.slice(0, group.windowSize).join(" ");
  const hiddenPortion = rawWords.slice(group.windowSize).join(" ");
  const hiddenWords = hiddenPortion.split(/\s+/).filter(Boolean);

  return {
    groupId: group.id,
    targetVerse: target,
    siblingVerses: siblings,
    sharedPhrase: displayedPortion,
    displayedPortion,
    hiddenPortion,
    hints: hiddenWords,
    // Legacy compat fields used by VerseContextViewer
    sura: target.sura,
    aya: target.aya,
    suraNameAr: target.suraNameAr,
    suraName: target.suraNameAr,
    page: target.page,
    fullText: target.text,
    versePart: displayedPortion,
    correctAnswer: hiddenPortion,
  };
}

// ─── Answer checker ───────────────────────────────────────────────────────────
// Identical to mutashabihatUtils.js → checkMutashabihatAnswer()

export function checkMutashabihatAnswer(
  userAnswer: string,
  question: { hiddenPortion: string },
): boolean {
  if (!userAnswer || !question.hiddenPortion) return false;

  const normalize = (t: string) =>
    stripDiacritics(t).replace(/\s+/g, " ").trim().toLowerCase();

  const user = normalize(userAnswer);
  const correct = normalize(question.hiddenPortion);

  if (user === correct) return true;

  const correctWords = correct.split(" ").filter(Boolean);
  const userWords = user.split(" ").filter(Boolean);
  if (userWords.length === 0) return false;

  let matched = 0;
  userWords.forEach((w, i) => {
    if (
      correctWords[i] &&
      (correctWords[i].includes(w) || w.includes(correctWords[i]))
    )
      matched++;
  });

  return matched / correctWords.length >= 0.6;
}
