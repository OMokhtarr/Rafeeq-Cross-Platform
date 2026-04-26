/**
 * SURAH / JUZ SELECTION
 *
 * Full-screen quick-navigation page reachable from the PageViewer hamburger.
 * Two tabs: Chapters (السور — all 114 surahs) and Juz (الأجزاء — all 30).
 * Tapping an item navigates to /viewer?page=N where N is the start page.
 *
 * Visual reference: rafeeq-design-system — light parchment background, navy
 * gradient header with 3px gold bottom border, white cards with right-edge
 * gold accent, RTL-first layout.
 */

import React, { useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { pageData } from "../../../../data/quranData";
import { surahNamesArabic } from "../../../core/services/data/quran.service";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import { useLang } from "../../../core/context/LanguageContext";
import "./SurahJuzSelection.css";

// ─── Static metadata ──────────────────────────────────────────────────────────
// English transliterations + verse counts + revelation type. Index 0 unused so
// indices line up with surahNamesArabic.

interface SurahMeta {
  name: string;
  meaning: string;
  ayahs: number;
  revelation: "meccan" | "medinan";
}

const SURAH_META: SurahMeta[] = [
  { name: "", meaning: "", ayahs: 0, revelation: "meccan" }, // 0
  { name: "Al-Fatihah",     meaning: "The Opening",       ayahs: 7,   revelation: "meccan" },
  { name: "Al-Baqarah",     meaning: "The Cow",            ayahs: 286, revelation: "medinan" },
  { name: "Aal-E-Imran",    meaning: "Family of Imran",    ayahs: 200, revelation: "medinan" },
  { name: "An-Nisa",        meaning: "The Women",          ayahs: 176, revelation: "medinan" },
  { name: "Al-Maidah",      meaning: "The Table Spread",   ayahs: 120, revelation: "medinan" },
  { name: "Al-An'am",       meaning: "The Cattle",         ayahs: 165, revelation: "meccan" },
  { name: "Al-A'raf",       meaning: "The Heights",        ayahs: 206, revelation: "meccan" },
  { name: "Al-Anfal",       meaning: "The Spoils of War",  ayahs: 75,  revelation: "medinan" },
  { name: "At-Tawbah",      meaning: "The Repentance",     ayahs: 129, revelation: "medinan" },
  { name: "Yunus",          meaning: "Jonah",              ayahs: 109, revelation: "meccan" },
  { name: "Hud",            meaning: "Hud",                ayahs: 123, revelation: "meccan" },
  { name: "Yusuf",          meaning: "Joseph",             ayahs: 111, revelation: "meccan" },
  { name: "Ar-Ra'd",        meaning: "The Thunder",        ayahs: 43,  revelation: "medinan" },
  { name: "Ibrahim",        meaning: "Abraham",            ayahs: 52,  revelation: "meccan" },
  { name: "Al-Hijr",        meaning: "The Rocky Tract",    ayahs: 99,  revelation: "meccan" },
  { name: "An-Nahl",        meaning: "The Bee",            ayahs: 128, revelation: "meccan" },
  { name: "Al-Isra",        meaning: "The Night Journey",  ayahs: 111, revelation: "meccan" },
  { name: "Al-Kahf",        meaning: "The Cave",           ayahs: 110, revelation: "meccan" },
  { name: "Maryam",         meaning: "Mary",               ayahs: 98,  revelation: "meccan" },
  { name: "Ta-Ha",          meaning: "Ta-Ha",              ayahs: 135, revelation: "meccan" },
  { name: "Al-Anbiya",      meaning: "The Prophets",       ayahs: 112, revelation: "meccan" },
  { name: "Al-Hajj",        meaning: "The Pilgrimage",     ayahs: 78,  revelation: "medinan" },
  { name: "Al-Mu'minun",    meaning: "The Believers",      ayahs: 118, revelation: "meccan" },
  { name: "An-Nur",         meaning: "The Light",          ayahs: 64,  revelation: "medinan" },
  { name: "Al-Furqan",      meaning: "The Criterion",      ayahs: 77,  revelation: "meccan" },
  { name: "Ash-Shu'ara",    meaning: "The Poets",          ayahs: 227, revelation: "meccan" },
  { name: "An-Naml",        meaning: "The Ant",            ayahs: 93,  revelation: "meccan" },
  { name: "Al-Qasas",       meaning: "The Stories",        ayahs: 88,  revelation: "meccan" },
  { name: "Al-Ankabut",     meaning: "The Spider",         ayahs: 69,  revelation: "meccan" },
  { name: "Ar-Rum",         meaning: "The Romans",         ayahs: 60,  revelation: "meccan" },
  { name: "Luqman",         meaning: "Luqman",             ayahs: 34,  revelation: "meccan" },
  { name: "As-Sajdah",      meaning: "The Prostration",    ayahs: 30,  revelation: "meccan" },
  { name: "Al-Ahzab",       meaning: "The Confederates",   ayahs: 73,  revelation: "medinan" },
  { name: "Saba",           meaning: "Sheba",              ayahs: 54,  revelation: "meccan" },
  { name: "Fatir",          meaning: "Originator",         ayahs: 45,  revelation: "meccan" },
  { name: "Ya-Sin",         meaning: "Ya-Sin",             ayahs: 83,  revelation: "meccan" },
  { name: "As-Saffat",      meaning: "Those Ranged in Ranks", ayahs: 182, revelation: "meccan" },
  { name: "Sad",            meaning: "Sad",                ayahs: 88,  revelation: "meccan" },
  { name: "Az-Zumar",       meaning: "The Groups",         ayahs: 75,  revelation: "meccan" },
  { name: "Ghafir",         meaning: "The Forgiver",       ayahs: 85,  revelation: "meccan" },
  { name: "Fussilat",       meaning: "Explained in Detail", ayahs: 54, revelation: "meccan" },
  { name: "Ash-Shuraa",     meaning: "Consultation",       ayahs: 53,  revelation: "meccan" },
  { name: "Az-Zukhruf",     meaning: "The Gold Adornments", ayahs: 89, revelation: "meccan" },
  { name: "Ad-Dukhan",      meaning: "The Smoke",          ayahs: 59,  revelation: "meccan" },
  { name: "Al-Jathiyah",    meaning: "The Kneeling",       ayahs: 37,  revelation: "meccan" },
  { name: "Al-Ahqaf",       meaning: "The Curved Sand-Hills", ayahs: 35, revelation: "meccan" },
  { name: "Muhammad",       meaning: "Muhammad",           ayahs: 38,  revelation: "medinan" },
  { name: "Al-Fath",        meaning: "The Victory",        ayahs: 29,  revelation: "medinan" },
  { name: "Al-Hujurat",     meaning: "The Dwellings",      ayahs: 18,  revelation: "medinan" },
  { name: "Qaf",            meaning: "Qaf",                ayahs: 45,  revelation: "meccan" },
  { name: "Adh-Dhariyat",   meaning: "The Winnowing Winds", ayahs: 60, revelation: "meccan" },
  { name: "At-Tur",         meaning: "The Mount",          ayahs: 49,  revelation: "meccan" },
  { name: "An-Najm",        meaning: "The Star",           ayahs: 62,  revelation: "meccan" },
  { name: "Al-Qamar",       meaning: "The Moon",           ayahs: 55,  revelation: "meccan" },
  { name: "Ar-Rahman",      meaning: "The Most Merciful",  ayahs: 78,  revelation: "medinan" },
  { name: "Al-Waqi'ah",     meaning: "The Inevitable",     ayahs: 96,  revelation: "meccan" },
  { name: "Al-Hadid",       meaning: "Iron",               ayahs: 29,  revelation: "medinan" },
  { name: "Al-Mujadilah",   meaning: "The Pleading Woman", ayahs: 22,  revelation: "medinan" },
  { name: "Al-Hashr",       meaning: "The Gathering",      ayahs: 24,  revelation: "medinan" },
  { name: "Al-Mumtahanah",  meaning: "She that is to be examined", ayahs: 13, revelation: "medinan" },
  { name: "As-Saff",        meaning: "The Ranks",          ayahs: 14,  revelation: "medinan" },
  { name: "Al-Jumu'ah",     meaning: "Friday",             ayahs: 11,  revelation: "medinan" },
  { name: "Al-Munafiqun",   meaning: "The Hypocrites",     ayahs: 11,  revelation: "medinan" },
  { name: "At-Taghabun",    meaning: "Mutual Disillusion", ayahs: 18,  revelation: "medinan" },
  { name: "At-Talaq",       meaning: "The Divorce",        ayahs: 12,  revelation: "medinan" },
  { name: "At-Tahrim",      meaning: "The Prohibition",    ayahs: 12,  revelation: "medinan" },
  { name: "Al-Mulk",        meaning: "The Sovereignty",    ayahs: 30,  revelation: "meccan" },
  { name: "Al-Qalam",       meaning: "The Pen",            ayahs: 52,  revelation: "meccan" },
  { name: "Al-Haqqah",      meaning: "The Reality",        ayahs: 52,  revelation: "meccan" },
  { name: "Al-Ma'arij",     meaning: "The Ascending Stairways", ayahs: 44, revelation: "meccan" },
  { name: "Nuh",            meaning: "Noah",               ayahs: 28,  revelation: "meccan" },
  { name: "Al-Jinn",        meaning: "The Jinn",           ayahs: 28,  revelation: "meccan" },
  { name: "Al-Muzzammil",   meaning: "The Enshrouded One", ayahs: 20,  revelation: "meccan" },
  { name: "Al-Muddaththir", meaning: "The Cloaked One",    ayahs: 56,  revelation: "meccan" },
  { name: "Al-Qiyamah",     meaning: "The Resurrection",   ayahs: 40,  revelation: "meccan" },
  { name: "Al-Insan",       meaning: "Man",                ayahs: 31,  revelation: "medinan" },
  { name: "Al-Mursalat",    meaning: "Those Sent Forth",   ayahs: 50,  revelation: "meccan" },
  { name: "An-Naba",        meaning: "The Great News",     ayahs: 40,  revelation: "meccan" },
  { name: "An-Nazi'at",     meaning: "Those Who Pull Out", ayahs: 46,  revelation: "meccan" },
  { name: "'Abasa",         meaning: "He Frowned",         ayahs: 42,  revelation: "meccan" },
  { name: "At-Takwir",      meaning: "The Folding Up",     ayahs: 29,  revelation: "meccan" },
  { name: "Al-Infitar",     meaning: "The Cleaving",       ayahs: 19,  revelation: "meccan" },
  { name: "Al-Mutaffifin",  meaning: "Those Who Deal in Fraud", ayahs: 36, revelation: "meccan" },
  { name: "Al-Inshiqaq",    meaning: "The Splitting Asunder", ayahs: 25, revelation: "meccan" },
  { name: "Al-Buruj",       meaning: "The Big Stars",      ayahs: 22,  revelation: "meccan" },
  { name: "At-Tariq",       meaning: "The Night-Comer",    ayahs: 17,  revelation: "meccan" },
  { name: "Al-A'la",        meaning: "The Most High",      ayahs: 19,  revelation: "meccan" },
  { name: "Al-Ghashiyah",   meaning: "The Overwhelming",   ayahs: 26,  revelation: "meccan" },
  { name: "Al-Fajr",        meaning: "The Dawn",           ayahs: 30,  revelation: "meccan" },
  { name: "Al-Balad",       meaning: "The City",           ayahs: 20,  revelation: "meccan" },
  { name: "Ash-Shams",      meaning: "The Sun",            ayahs: 15,  revelation: "meccan" },
  { name: "Al-Layl",        meaning: "The Night",          ayahs: 21,  revelation: "meccan" },
  { name: "Adh-Dhuha",      meaning: "The Forenoon",       ayahs: 11,  revelation: "meccan" },
  { name: "Ash-Sharh",      meaning: "The Opening Forth",  ayahs: 8,   revelation: "meccan" },
  { name: "At-Tin",          meaning: "The Fig",            ayahs: 8,   revelation: "meccan" },
  { name: "Al-'Alaq",       meaning: "The Clot",           ayahs: 19,  revelation: "meccan" },
  { name: "Al-Qadr",        meaning: "The Power",          ayahs: 5,   revelation: "meccan" },
  { name: "Al-Bayyinah",    meaning: "The Clear Evidence", ayahs: 8,   revelation: "medinan" },
  { name: "Az-Zalzalah",    meaning: "The Earthquake",     ayahs: 8,   revelation: "medinan" },
  { name: "Al-'Adiyat",     meaning: "The Runners",        ayahs: 11,  revelation: "meccan" },
  { name: "Al-Qari'ah",     meaning: "The Striking Hour",  ayahs: 11,  revelation: "meccan" },
  { name: "At-Takathur",    meaning: "Piling Up",          ayahs: 8,   revelation: "meccan" },
  { name: "Al-'Asr",        meaning: "Time",               ayahs: 3,   revelation: "meccan" },
  { name: "Al-Humazah",     meaning: "The Slanderer",      ayahs: 9,   revelation: "meccan" },
  { name: "Al-Fil",         meaning: "The Elephant",       ayahs: 5,   revelation: "meccan" },
  { name: "Quraish",        meaning: "Quraish",            ayahs: 4,   revelation: "meccan" },
  { name: "Al-Ma'un",       meaning: "Small Kindnesses",   ayahs: 7,   revelation: "meccan" },
  { name: "Al-Kawthar",     meaning: "Abundance",          ayahs: 3,   revelation: "meccan" },
  { name: "Al-Kafirun",     meaning: "The Disbelievers",   ayahs: 6,   revelation: "meccan" },
  { name: "An-Nasr",        meaning: "The Help",           ayahs: 3,   revelation: "medinan" },
  { name: "Al-Masad",       meaning: "The Palm Fiber",     ayahs: 5,   revelation: "meccan" },
  { name: "Al-Ikhlas",      meaning: "Sincerity",          ayahs: 4,   revelation: "meccan" },
  { name: "Al-Falaq",       meaning: "The Daybreak",       ayahs: 5,   revelation: "meccan" },
  { name: "An-Nas",         meaning: "Mankind",            ayahs: 6,   revelation: "meccan" },
];

// ─── Standard Mushaf juz starting pages ──────────────────────────────────────
// Madani Mushaf 15-line layout — these are the canonical first-page numbers
// for each juz. Used so list shows accurate page ranges (not (X-1)*20+1).
const JUZ_START_PAGES: number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSurahStartPage(surahIndex: number): number {
  for (let page = 1; page < pageData.length; page++) {
    const [sura, aya] = pageData[page];
    if (sura === surahIndex && aya === 1) return page;
  }
  return 1;
}

function juzPageRange(juz: number, totalPages: number): [number, number] {
  const start = JUZ_START_PAGES[juz - 1];
  const end = juz < 30 ? JUZ_START_PAGES[juz] - 1 : totalPages;
  return [start, end];
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = "surah" | "juz";

const SurahJuzSelection: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const [tab, setTab] = useState<Tab>("surah");

  const totalPages = pageData.length - 1;
  const showArabic = lang === "ar";
  const showEnglish = lang === "en";
  // Bilingual shows both — current LanguageContext is binary, so we render
  // the small Latin row beneath the Arabic in Arabic mode and vice-versa.

  const surahs = useMemo(
    () =>
      surahNamesArabic.slice(1, 115).map((ar, i) => {
        const num = i + 1;
        return {
          num,
          ar,
          ...SURAH_META[num],
          startPage: getSurahStartPage(num),
        };
      }),
    [],
  );

  const goToPage = (page: number) => {
    history.push(`/viewer?page=${page}`);
  };

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/viewer");
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="sjs-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* ── Header ── */}
          <header className="sjs-header">
            <button
              className="sjs-back"
              onClick={handleBack}
              aria-label={lang === "ar" ? "رجوع" : "Back"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isRTL ? (
                  <path d="M5 12h14M13 5l7 7-7 7" />
                ) : (
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                )}
              </svg>
            </button>
            <div className="sjs-header-titles">
              <h1 className="sjs-title">
                {lang === "ar" ? "السور والأجزاء" : "Chapters & Juz"}
              </h1>
              <div className="sjs-subtitle">
                {lang === "ar" ? "انتقال سريع" : "Quick navigation"}
              </div>
            </div>
            <div className="sjs-back" aria-hidden="true" style={{ visibility: "hidden" }} />
          </header>

          {/* ── Tabs ── */}
          <div className="sjs-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "surah"}
              className={"sjs-tab" + (tab === "surah" ? " sjs-tab-active" : "")}
              onClick={() => setTab("surah")}
            >
              <span className="sjs-tab-ar">السور</span>
              <span className="sjs-tab-en">Chapters</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "juz"}
              className={"sjs-tab" + (tab === "juz" ? " sjs-tab-active" : "")}
              onClick={() => setTab("juz")}
            >
              <span className="sjs-tab-ar">الأجزاء</span>
              <span className="sjs-tab-en">Juz</span>
            </button>
          </div>

          {/* ── List ── */}
          <div className="sjs-list-wrap">
            {tab === "surah" ? (
              <ul className="sjs-list">
                {surahs.map((s) => (
                  <li key={s.num}>
                    <button
                      className="sjs-row sjs-row-surah"
                      onClick={() => goToPage(s.startPage)}
                    >
                      <span
                        className={
                          "sjs-num " +
                          (s.revelation === "meccan" ? "sjs-num-meccan" : "sjs-num-medinan")
                        }
                      >
                        {showArabic ? toHindiNumbers(s.num) : s.num}
                      </span>

                      <span className="sjs-row-main">
                        {!showEnglish && (
                          <span className="sjs-name-ar" lang="ar">
                            {s.ar}
                          </span>
                        )}
                        {!showArabic && (
                          <span className="sjs-name-en">{s.name}</span>
                        )}
                        {showArabic && (
                          <span className="sjs-name-en sjs-name-en-sub">{s.name}</span>
                        )}
                      </span>

                      <span className="sjs-row-meta">
                        <span
                          className={
                            "sjs-pill " +
                            (s.revelation === "meccan" ? "sjs-pill-meccan" : "sjs-pill-medinan")
                          }
                        >
                          {lang === "ar"
                            ? s.revelation === "meccan"
                              ? "مكية"
                              : "مدنية"
                            : s.revelation === "meccan"
                              ? "Meccan"
                              : "Medinan"}
                        </span>
                        <span className="sjs-ayahs">
                          {lang === "ar"
                            ? `${toHindiNumbers(s.ayahs)} آية`
                            : `${s.ayahs} ${s.ayahs === 1 ? "verse" : "verses"}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="sjs-list">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
                  const [start, end] = juzPageRange(j, totalPages);
                  return (
                    <li key={j}>
                      <button
                        className="sjs-row sjs-row-juz"
                        onClick={() => goToPage(start)}
                      >
                        <span className="sjs-num sjs-num-juz">
                          {showArabic ? toHindiNumbers(j) : j}
                        </span>
                        <span className="sjs-row-main">
                          {!showEnglish && (
                            <span className="sjs-name-ar" lang="ar">
                              {`الجزء ${toHindiNumbers(j)}`}
                            </span>
                          )}
                          {!showArabic && (
                            <span className="sjs-name-en">{`Juz ${j}`}</span>
                          )}
                          {showArabic && (
                            <span className="sjs-name-en sjs-name-en-sub">{`Juz ${j}`}</span>
                          )}
                        </span>
                        <span className="sjs-row-meta">
                          <span className="sjs-ayahs">
                            {lang === "ar"
                              ? `${t.mushaf.page} ${toHindiNumbers(start)}–${toHindiNumbers(end)}`
                              : `${t.mushaf.page} ${start}–${end}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SurahJuzSelection;
