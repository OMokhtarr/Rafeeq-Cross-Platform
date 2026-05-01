import { stripDiacritics } from "../../../../../core/utils/arabic.util";
import { getSurahNameArabic } from "../../../../../core/services/data/metadata.service";
import type { Verse } from "../../../../../shared/models/verse.model";

// Remove pageData import and getPageForVerse function.

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

// The function now receives an array of Verse objects (with page property)
export function getAllMutashabihatGroups(verses: Verse[]): MutashabihatGroup[] {
  // Build phrase map from verses array
  const phraseMap = new Map<
    string,
    {
      sura: number;
      aya: number;
      text: string;
      page: number;
      juz: number;
      normWords: string[];
    }[]
  >();

  for (const v of verses) {
    const norm = stripDiacritics(v.text);
    const words = norm.split(/\s+/).filter(Boolean);
    if (words.length < 5) continue;
    for (const window of [3, 4]) {
      if (words.length < window + 2) continue;
      const phrase = words.slice(0, window).join(" ");
      const mapKey = `${window}|${phrase}`;
      if (!phraseMap.has(mapKey)) phraseMap.set(mapKey, []);
      phraseMap.get(mapKey)!.push({
        sura: v.sura,
        aya: v.aya,
        text: v.text,
        page: v.page,
        juz: v.juz ?? Math.ceil(v.page / 20),
        normWords: words,
      });
    }
  }

  const groups: MutashabihatGroup[] = [];
  for (const [mapKey, entries] of phraseMap.entries()) {
    if (entries.length < 2) continue;
    const { window, phrase } = {
      window: parseInt(mapKey.split("|")[0]),
      phrase: mapKey.split("|")[1],
    };
    const continuations = new Set(
      entries.map((e) => e.normWords.slice(window, window + 5).join(" ")),
    );
    if (continuations.size < 2) continue;

    groups.push({
      id: mapKey,
      sharedPhrase: phrase,
      sharedPhraseRaw: entries[0].text.split(/\s+/).slice(0, window).join(" "),
      windowSize: window,
      verses: entries.map((e) => ({
        sura: e.sura,
        aya: e.aya,
        text: e.text,
        page: e.page,
        juz: e.juz,
        suraNameAr: getSurahNameArabic(e.sura),
        hiddenStart: e.normWords.slice(window).join(" "),
      })),
    });
  }

  // sort as before
  groups.sort((a, b) => {
    if (b.windowSize !== a.windowSize) return b.windowSize - a.windowSize;
    return a.verses[0].sura - b.verses[0].sura;
  });

  return groups;
}

// filter functions unchanged, but they rely on verse.page which is now present
export function filterGroupsBySurahs(
  groups: MutashabihatGroup[],
  surahs: number[],
): MutashabihatGroup[] {
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
