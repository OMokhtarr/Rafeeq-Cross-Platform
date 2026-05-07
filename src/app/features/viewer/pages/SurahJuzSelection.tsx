import React, { useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import { useLang } from "../../../core/context/LanguageContext";
import BottomNavBar from "../../../shared/components/bottom-nav/BottomNavBar";
import {
  getChapters,
  getSurahStartPage,
  getJuzStart,
  getPageStart,
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../../core/services/data/metadata.service";
import "./SurahJuzSelection.css";

type Tab = "surah" | "juz" | "hizb";

// We'll keep a small constant for juz start pages for performance
const JUZ_START_PAGES: readonly number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

// Each juz has 2 hizbs → 60 hizbs total. The second hizb of each juz starts
// at roughly the midpoint of that juz's page range.
function buildHizbStartPages(): readonly number[] {
  const pages: number[] = [];
  for (let i = 0; i < 30; i++) {
    const juzStart = JUZ_START_PAGES[i];
    const juzEnd = i < 29 ? JUZ_START_PAGES[i + 1] - 1 : 604;
    pages.push(juzStart);
    pages.push(Math.round((juzStart + juzEnd) / 2));
  }
  return pages;
}

const HIZB_START_PAGES: readonly number[] = buildHizbStartPages();

// Each hizb has 4 quarters (rub' al-hizb) → 240 rub's total.
function buildRubStartPages(): readonly number[] {
  const pages: number[] = [];
  for (let i = 0; i < 60; i++) {
    const hizbStart = HIZB_START_PAGES[i];
    const hizbEnd = i < 59 ? HIZB_START_PAGES[i + 1] - 1 : 604;
    const span = hizbEnd - hizbStart + 1;
    for (let q = 0; q < 4; q++) {
      pages.push(hizbStart + Math.round((span * q) / 4));
    }
  }
  return pages;
}

const RUB_START_PAGES: readonly number[] = buildRubStartPages();

const SurahJuzSelection: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const [tab, setTab] = useState<Tab>("surah");

  const totalPages = 604;

  const surahs = useMemo(() => {
    const chapters = getChapters();
    return chapters.map((ch) => ({
      num: ch.id,
      ar: ch.name_arabic,
      en: ch.translated_name?.name ?? "",
      ayahs: ch.verses_count,
      revelation: ch.revelation_place === "makkah" ? "meccan" : "medinan",
      startPage: ch.pages[0],
    }));
  }, []);

  const juzs = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const juzNum = i + 1;
      const start = JUZ_START_PAGES[juzNum - 1];
      const end = juzNum < 30 ? JUZ_START_PAGES[juzNum] - 1 : totalPages;
      return { num: juzNum, start, end };
    });
  }, []);

  const hizbs = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const hizbNum = i + 1;
      const startPage = HIZB_START_PAGES[i];
      const endPage = i < 59 ? HIZB_START_PAGES[i + 1] - 1 : totalPages;
      const juzNum = Math.ceil(hizbNum / 2);
      const ps = getPageStart(startPage);
      return {
        num: hizbNum,
        juzNum,
        startPage,
        endPage,
        startSura: ps?.sura ?? 0,
        startAya: ps?.aya ?? 0,
        startSuraAr: ps ? getSurahNameArabic(ps.sura) : "",
        startSuraEn: ps ? getSurahNameEnglish(ps.sura) : "",
      };
    });
  }, []);

  // 4 rub's per hizb, keyed by hizbNum (1-based)
  const rubsByHizb = useMemo(() => {
    const map = new Map<number, { quarterInHizb: number; startPage: number; startSura: number; startAya: number; startSuraAr: string; startSuraEn: string }[]>();
    for (let i = 0; i < 240; i++) {
      const hizbNum = Math.floor(i / 4) + 1;
      const quarterInHizb = (i % 4) + 1;
      const startPage = RUB_START_PAGES[i];
      const ps = getPageStart(startPage);
      const entry = {
        quarterInHizb,
        startPage,
        startSura: ps?.sura ?? 0,
        startAya: ps?.aya ?? 0,
        startSuraAr: ps ? getSurahNameArabic(ps.sura) : "",
        startSuraEn: ps ? getSurahNameEnglish(ps.sura) : "",
      };
      if (!map.has(hizbNum)) map.set(hizbNum, []);
      map.get(hizbNum)!.push(entry);
    }
    return map;
  }, []);

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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {isRTL ? (
                  <path d="M5 12h14M13 5l7 7-7 7" />
                ) : (
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                )}
              </svg>
            </button>
            <div className="sjs-header-titles">
              <h1 className="sjs-title">
                {lang === "ar" ? "السور والأجزاء والأحزاب" : "Chapters & Navigation"}
              </h1>
              <div className="sjs-subtitle">
                {lang === "ar" ? "انتقال سريع" : "Quick navigation"}
              </div>
            </div>
            <div
              className="sjs-back"
              aria-hidden="true"
              style={{ visibility: "hidden" }}
            />
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
            <button
              role="tab"
              aria-selected={tab === "hizb"}
              className={"sjs-tab" + (tab === "hizb" ? " sjs-tab-active" : "")}
              onClick={() => setTab("hizb")}
            >
              <span className="sjs-tab-ar">الأحزاب</span>
              <span className="sjs-tab-en">Hizb</span>
            </button>
          </div>

          {/* ── List ── */}
          <div className="sjs-list-wrap sjs-list-wrap-with-nav">
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
                          (s.revelation === "meccan"
                            ? "sjs-num-meccan"
                            : "sjs-num-medinan")
                        }
                      >
                        {lang === "ar" ? toHindiNumbers(s.num) : s.num}
                      </span>

                      <span className="sjs-row-main">
                        <span className="sjs-name-ar" lang="ar">
                          {s.ar}
                        </span>
                        <span className="sjs-name-en">{s.en}</span>
                      </span>

                      <span className="sjs-row-meta">
                        <span
                          className={
                            "sjs-pill " +
                            (s.revelation === "meccan"
                              ? "sjs-pill-meccan"
                              : "sjs-pill-medinan")
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
            ) : tab === "juz" ? (
              <ul className="sjs-list">
                {juzs.map((j) => (
                  <li key={j.num}>
                    <button
                      className="sjs-row sjs-row-juz"
                      onClick={() => goToPage(j.start)}
                    >
                      <span className="sjs-num sjs-num-juz">
                        {lang === "ar" ? toHindiNumbers(j.num) : j.num}
                      </span>
                      <span className="sjs-row-main">
                        <span className="sjs-name-ar" lang="ar">
                          {`الجزء ${toHindiNumbers(j.num)}`}
                        </span>
                        <span className="sjs-name-en">{`Juz ${j.num}`}</span>
                      </span>
                      <span className="sjs-row-meta">
                        <span className="sjs-ayahs">
                          {lang === "ar"
                            ? `${t.mushaf.page} ${toHindiNumbers(j.start)}–${toHindiNumbers(j.end)}`
                            : `${t.mushaf.page} ${j.start}–${j.end}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="sjs-list">
                {hizbs.map((h) => {
                  const quarters = rubsByHizb.get(h.num) ?? [];
                  const quarterLabelsAr = ["ربع", "نصف", "ثلاثة أرباع", "كمال"];
                  const quarterLabelsEn = ["¼", "½", "¾", "End"];
                  return (
                    <li key={h.num} className="sjs-hizb-group">
                      <button
                        className="sjs-row sjs-row-hizb"
                        onClick={() => goToPage(h.startPage)}
                      >
                        <span className="sjs-num sjs-num-hizb">
                          {lang === "ar" ? toHindiNumbers(h.num) : h.num}
                        </span>
                        <span className="sjs-row-main">
                          <span className="sjs-name-ar" lang="ar">
                            {`الحزب ${toHindiNumbers(h.num)}`}
                          </span>
                          <span className="sjs-name-en">{`Hizb ${h.num}`}</span>
                          {h.startSura > 0 && (
                            <span className="sjs-name-en-sub">
                              {lang === "ar"
                                ? `${h.startSuraAr} : ${toHindiNumbers(h.startAya)}`
                                : `${h.startSuraEn} : ${h.startAya}`}
                            </span>
                          )}
                        </span>
                        <span className="sjs-row-meta">
                          <span className="sjs-hizb-juz-badge">
                            {lang === "ar"
                              ? `ج ${toHindiNumbers(h.juzNum)}`
                              : `Juz ${h.juzNum}`}
                          </span>
                          <span className="sjs-ayahs">
                            {lang === "ar"
                              ? `${t.mushaf.page} ${toHindiNumbers(h.startPage)}–${toHindiNumbers(h.endPage)}`
                              : `${t.mushaf.page} ${h.startPage}–${h.endPage}`}
                          </span>
                        </span>
                      </button>
                      <ul className="sjs-rub-list">
                        {quarters.map((r) => (
                          <li key={r.quarterInHizb}>
                            <button
                              className="sjs-rub-row"
                              onClick={() => goToPage(r.startPage)}
                            >
                              <span className="sjs-rub-icon">◆</span>
                              <span className="sjs-rub-main">
                                <span className="sjs-rub-label-ar" lang="ar">
                                  {quarterLabelsAr[r.quarterInHizb - 1]}
                                </span>
                                <span className="sjs-rub-label-en">
                                  {quarterLabelsEn[r.quarterInHizb - 1]}
                                </span>
                              </span>
                              {r.startSura > 0 && (
                                <span className="sjs-rub-verse">
                                  {lang === "ar"
                                    ? `${r.startSuraAr} : ${toHindiNumbers(r.startAya)}`
                                    : `${r.startSuraEn} : ${r.startAya}`}
                                </span>
                              )}
                              <span className="sjs-rub-page">
                                {lang === "ar"
                                  ? `${t.mushaf.page} ${toHindiNumbers(r.startPage)}`
                                  : `p. ${r.startPage}`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <BottomNavBar active="quran" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SurahJuzSelection;
