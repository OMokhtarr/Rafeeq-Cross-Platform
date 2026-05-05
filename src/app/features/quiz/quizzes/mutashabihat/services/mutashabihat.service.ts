import { stripDiacritics } from "../../../../../core/utils/arabic.util";
import { getSurahNameArabic } from "../../../../../core/services/data/metadata.service";
import type { Verse } from "../../../../../shared/models/verse.model";

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

export function getAllMutashabihatGroups(verses: Verse[]): MutashabihatGroup[] {
  const groups: MutashabihatGroup[] = [];
  // Try window size 3 (most common for similar verses)
  const WINDOW = 3;
  const MIN_WORDS = 5; // need at least one completion word after the window

  const phraseMap = new Map<
    string,
    {
      sura: number;
      aya: number;
      text: string;
      page: number;
      juz: number;
      words: string[];
    }[]
  >();

  for (const v of verses) {
    // Extract word strings from the verse's words array (skip end markers)
    let wordStrings: string[];
    if (v.words && v.words.length > 0) {
      wordStrings = v.words
        .filter((w) => w.charType === "end")
        .map((w) => w.text_uthmani);
    } else {
      // Fallback to splitting the text (less accurate)
      wordStrings = v.text.split(/\s+/).filter((w) => w.length > 0);
    }

    // Need at least MIN_WORDS total words to have a completion after the window
    if (wordStrings.length < MIN_WORDS) continue;

    const phrase = wordStrings.slice(0, WINDOW).join(" ");
    if (!phraseMap.has(phrase)) {
      phraseMap.set(phrase, []);
    }
    phraseMap.get(phrase)!.push({
      sura: v.sura,
      aya: v.aya,
      text: v.text,
      page: v.page,
      juz: v.juz ?? Math.ceil(v.page / 20),
      words: wordStrings,
    });
  }

  for (const [phrase, entries] of phraseMap.entries()) {
    if (entries.length < 2) continue;

    // Check that the completions (after the window) are not all identical
    const completions = entries.map((e) =>
      stripDiacritics(e.words.slice(WINDOW).join(" ")),
    );
    if (new Set(completions).size < 2) continue;

    groups.push({
      id: `${WINDOW}|${stripDiacritics(phrase)}`,
      sharedPhrase: stripDiacritics(phrase),
      sharedPhraseRaw: phrase,
      windowSize: WINDOW,
      verses: entries.map((e) => ({
        sura: e.sura,
        aya: e.aya,
        text: e.text,
        page: e.page,
        juz: e.juz,
        suraNameAr: getSurahNameArabic(e.sura),
        hiddenStart: e.words.slice(WINDOW).join(" "),
      })),
    });
  }

  return groups;
}

// Filtering functions – each ensures at least MIN_GROUP_SIZE verses remain
const MIN_GROUP_SIZE = 2;

export function filterGroupsBySurahs(
  groups: MutashabihatGroup[],
  surahs: number[],
): MutashabihatGroup[] {
  const set = new Set(surahs);
  const filtered: MutashabihatGroup[] = [];
  for (const g of groups) {
    const matching = g.verses.filter((v) => set.has(v.sura));
    if (matching.length >= MIN_GROUP_SIZE) {
      filtered.push({ ...g, verses: matching });
    }
  }
  return filtered;
}

export function filterGroupsByPages(
  groups: MutashabihatGroup[],
  pageFrom: number,
  pageTo: number,
): MutashabihatGroup[] {
  const filtered: MutashabihatGroup[] = [];
  for (const g of groups) {
    const matching = g.verses.filter(
      (v) => v.page >= pageFrom && v.page <= pageTo,
    );
    if (matching.length >= MIN_GROUP_SIZE) {
      filtered.push({ ...g, verses: matching });
    }
  }
  return filtered;
}

export function filterGroupsByJuzs(
  groups: MutashabihatGroup[],
  juzs: number[],
): MutashabihatGroup[] {
  const set = new Set(juzs);
  const filtered: MutashabihatGroup[] = [];
  for (const g of groups) {
    const matching = g.verses.filter((v) => set.has(v.juz));
    if (matching.length >= MIN_GROUP_SIZE) {
      filtered.push({ ...g, verses: matching });
    }
  }
  return filtered;
}

export function buildMutashabihatQuestion(group: MutashabihatGroup) {
  // Safety guard: group must have at least 2 verses to have a meaningful sibling
  if (group.verses.length < 2) {
    throw new Error("Mutashabihat group must contain at least 2 verses");
  }

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
    sharedPhraseRaw: group.sharedPhraseRaw, // raw Arabic phrase (with diacritics)
    displayedPortion,
    hiddenPortion,
    hints: hiddenWords,
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
