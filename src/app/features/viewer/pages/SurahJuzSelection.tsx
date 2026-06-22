import React, { useEffect, useMemo, useRef, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import { useLang } from "../../../core/context/LanguageContext";
import BottomNavBar from "../../../shared/components/bottom-nav/BottomNavBar";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
  getHizbStart,
  getHizbEnd,
  estimatePageForVerse,
  getSuraForPage,
} from "../../../core/services/data/metadata.service";
import "./SurahJuzSelection.css";

type Tab = "surah" | "juz" | "hizb";

// ── Rub item derived entirely from hizb data (getRubStart/getRubEnd are
//    unreliable — they return hizb boundaries for all 4 quarters).
//    We interpolate page ranges within each hizb instead.
interface RubItem {
  rubNum: number;
  hizbNum: number;
  quarterInHizb: number; // 1 = ¼, 2 = ½, 3 = ¾, 4 = End
  startPage: number;
  endPage: number;
  // Start verse is only accurate for Q1 (= hizb start)
  startSura: number;
  startAya: number;
  startSuraAr: string;
  startSuraEn: string;
  // End verse is only accurate for Q4 (= hizb end)
  endSura: number;
  endAya: number;
  endSuraAr: string;
  endSuraEn: string;
}

const JUZ_START_PAGES: readonly number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

const SurahJuzSelection: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  const [tab, setTab] = useState<Tab>("surah");

  // Read current page from URL (?page=N passed by PageViewer)
  const currentPage = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 && raw <= 604 ? raw : null;
  }, [location.search]);

  const totalPages = 604;

  const chapters = useMemo(() => getChapters(), []);

  const surahs = useMemo(() => {
    return chapters.map((ch) => ({
      num: ch.id,
      ar: ch.name_arabic,
      en: ch.name_simple ?? ch.translated_name?.name ?? "",
      ayahs: ch.verses_count,
      revelation: ch.revelation_place === "makkah" ? "meccan" : "medinan",
      startPage: ch.pages[0],
    }));
  }, [chapters]);

  const juzs = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const juzNum = i + 1;
      const start = JUZ_START_PAGES[juzNum - 1];
      const end = juzNum < 30 ? JUZ_START_PAGES[juzNum] - 1 : totalPages;
      return { num: juzNum, start, end };
    });
  }, []);

  // Hizbs – exact API boundaries (these ARE correct)
  const hizbs = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const hizbNum = i + 1;
      const start = getHizbStart(hizbNum);
      const end = getHizbEnd(hizbNum);
      const juzNum = Math.ceil(hizbNum / 2);
      const startPage = estimatePageForVerse(start.sura, start.aya);
      const endPage = estimatePageForVerse(end.sura, end.aya);
      return {
        num: hizbNum,
        juzNum,
        startSura: start.sura,
        startAya: start.aya,
        endSura: end.sura,
        endAya: end.aya,
        startPage,
        endPage,
        startSuraAr: getSurahNameArabic(start.sura),
        startSuraEn: getSurahNameEnglish(start.sura),
        endSuraAr: getSurahNameArabic(end.sura),
        endSuraEn: getSurahNameEnglish(end.sura),
      };
    });
  }, []);

  // ── Rubs derived from hizb data ──────────────────────────────────────────
  // getRubStart / getRubEnd are broken: they return the hizb boundary for
  // all four quarters instead of the actual quarter start/end.
  // Fix: interpolate page ranges within each hizb and use hizb verse
  // boundaries only where they're accurate (Q1 start, Q4 end).
  const rubs = useMemo((): RubItem[] => {
    return Array.from({ length: 240 }, (_, i) => {
      const rubNum = i + 1;
      const hizbNum = Math.ceil(rubNum / 4);
      const quarterInHizb = ((rubNum - 1) % 4) + 1;
      const h = hizbs[hizbNum - 1];
      if (!h) return null;

      // Interpolate start / end page within the hizb page span
      const span = Math.max(0, h.endPage - h.startPage);
      const startPage =
        h.startPage + Math.floor(((quarterInHizb - 1) * span) / 4);
      const endPage =
        quarterInHizb === 4
          ? h.endPage
          : h.startPage + Math.floor((quarterInHizb * span) / 4);

      return {
        rubNum,
        hizbNum,
        quarterInHizb,
        startPage,
        endPage,
        // These verse fields are only accurate for Q1 (start) and Q4 (end)
        startSura: h.startSura,
        startAya: h.startAya,
        startSuraAr: h.startSuraAr,
        startSuraEn: h.startSuraEn,
        endSura: h.endSura,
        endAya: h.endAya,
        endSuraAr: h.endSuraAr,
        endSuraEn: h.endSuraEn,
      } as RubItem;
    }).filter(Boolean) as RubItem[];
  }, [hizbs]);

  const rubsByHizb = useMemo(() => {
    const map = new Map<number, RubItem[]>();
    for (const rub of rubs) {
      if (!map.has(rub.hizbNum)) map.set(rub.hizbNum, []);
      map.get(rub.hizbNum)!.push(rub);
    }
    return map;
  }, [rubs]);

  // ── Compute which item in each tab corresponds to currentPage ─────────────
  const relevantIds = useMemo(() => {
    if (!currentPage) return null;
    const surahNum = getSuraForPage(currentPage) ?? 1;
    const juz = juzs.find(
      (j) => currentPage >= j.start && currentPage <= j.end,
    );
    // Find rub by interpolated page range
    const rub = rubs.find(
      (r) => r.startPage <= currentPage && r.endPage >= currentPage,
    );
    return {
      surahNum,
      juzNum: juz?.num ?? 1,
      hizbNum:
        rub?.hizbNum ??
        Math.min(60, Math.ceil((currentPage * 60) / totalPages)),
      rubNum: rub?.rubNum ?? null,
    };
  }, [currentPage, juzs, rubs]);

  // Which rub to highlight (sticky — doesn't clear on tab change)
  const highlightRub = useMemo(
    () => relevantIds?.rubNum ?? null,
    [relevantIds],
  );

  const highlightSurah = useMemo(
    () => relevantIds?.surahNum ?? null,
    [relevantIds],
  );

  const highlightJuz = useMemo(
    () => relevantIds?.juzNum ?? null,
    [relevantIds],
  );

  // ── Auto-scroll to the relevant item whenever the active tab changes ───────
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!relevantIds) return;
    const timer = setTimeout(() => {
      if (tab === "surah") {
        document
          .getElementById(`surah-${relevantIds.surahNum}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (tab === "juz") {
        document
          .getElementById(`juz-${relevantIds.juzNum}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        // Hizb tab: scroll to the parent hizb card first …
        const hizbEl = document.getElementById(`hizb-${relevantIds.hizbNum}`);
        hizbEl?.scrollIntoView({ behavior: "smooth", block: "start" });
        // … then to the specific rub row inside it
        if (relevantIds.rubNum) {
          setTimeout(() => {
            document
              .getElementById(`rub-${relevantIds.rubNum}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 160);
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [tab, relevantIds]); // re-runs every time tab changes → always scrolls to right place

  const goToPage = (page: number) => {
    history.push(`/viewer?page=${page}`);
  };

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/viewer");
  };

  const quarterLabelsAr = ["ربع", "نصف", "ثلاثة أرباع", "كمال"];
  const quarterLabelsEn = ["¼", "½", "¾", "End"];

  // ── Rub verse-range helper ──────────────────────────────────────────────
  // Only Q1 has an accurate start verse (= hizb start).
  // Only Q4 has an accurate end verse (= hizb end).
  // For Q2 & Q3 we cannot derive the verse from the broken API, so we
  // show nothing in the verse column (the page badge is enough).
  const rubVerseLabel = (r: RubItem): string => {
    if (r.quarterInHizb === 1) {
      return lang === "ar"
        ? `${r.startSuraAr} : ${toHindiNumbers(r.startAya)}`
        : `${r.startSuraEn} : ${r.startAya}`;
    }
    if (r.quarterInHizb === 4) {
      return lang === "ar"
        ? `${r.endSuraAr} : ${toHindiNumbers(r.endAya)}`
        : `${r.endSuraEn} : ${r.endAya}`;
    }
    // Q2 / Q3: no reliable verse data
    return "";
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="sjs-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* ── Header ── */}
          <div className="sjs-header">
            <button
              className="sjs-back"
              onClick={handleBack}
              aria-label={t.mushaf.backLabel}
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
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </button>
            <div className="sjs-header-titles">
              <p className="sjs-title">
                {isRTL ? "السور والأجزاء والأحزاب" : "Surahs, Juz & Hizb"}
              </p>
              <p className="sjs-subtitle">
                {isRTL ? "انتقال سريع" : "Quick Navigation"}
              </p>
            </div>
            <div style={{ width: 44, flexShrink: 0 }} />
          </div>

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
          <div className="sjs-list-wrap sjs-list-wrap-with-nav" ref={listRef}>
            {tab === "surah" ? (
              <ul className="sjs-list">
                {surahs.map((s) => (
                  <li key={s.num} id={`surah-${s.num}`}>
                    <button
                      className={`sjs-row sjs-row-surah${
                        highlightSurah === s.num ? " sjs-row--highlight" : ""
                      }`}
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
                            : `${s.ayahs} ${
                                s.ayahs === 1 ? "verse" : "verses"
                              }`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : tab === "juz" ? (
              <ul className="sjs-list">
                {juzs.map((j) => (
                  <li key={j.num} id={`juz-${j.num}`}>
                    <button
                      className={`sjs-row sjs-row-juz${
                        highlightJuz === j.num ? " sjs-row--highlight" : ""
                      }`}
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
                            ? `${t.mushaf.page} ${toHindiNumbers(
                                j.start,
                              )}–${toHindiNumbers(j.end)}`
                            : `${t.mushaf.page} ${j.start}–${j.end}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              /* ── Hizb / Rub tab ── */
              <ul className="sjs-list">
                {hizbs.map((h) => {
                  const quarters = rubsByHizb.get(h.num) ?? [];
                  return (
                    <li
                      key={h.num}
                      className="sjs-hizb-group"
                      id={`hizb-${h.num}`}
                    >
                      {/* Hizb header row */}
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
                          <span className="sjs-name-en-sub">
                            {lang === "ar"
                              ? `${h.startSuraAr} : ${toHindiNumbers(
                                  h.startAya,
                                )} – ${h.endSuraAr} : ${toHindiNumbers(
                                  h.endAya,
                                )}`
                              : `${h.startSuraEn} : ${h.startAya} – ${h.endSuraEn} : ${h.endAya}`}
                          </span>
                        </span>
                        <span className="sjs-row-meta">
                          <span className="sjs-hizb-juz-badge">
                            {lang === "ar"
                              ? `ج ${toHindiNumbers(h.juzNum)}`
                              : `Juz ${h.juzNum}`}
                          </span>
                          <span className="sjs-ayahs">
                            {lang === "ar"
                              ? `${t.mushaf.page} ${toHindiNumbers(
                                  h.startPage,
                                )}–${toHindiNumbers(h.endPage)}`
                              : `${t.mushaf.page} ${h.startPage}–${h.endPage}`}
                          </span>
                        </span>
                      </button>

                      {/* Rub (quarter) sub-rows */}
                      <ul className="sjs-rub-list">
                        {quarters.map((r) => {
                          const verseLabel = rubVerseLabel(r);
                          const isHighlighted = highlightRub === r.rubNum;
                          return (
                            <li key={r.quarterInHizb} id={`rub-${r.rubNum}`}>
                              <button
                                className={`sjs-rub-row${
                                  isHighlighted ? " sjs-rub-row--highlight" : ""
                                }`}
                                onClick={() => goToPage(r.startPage)}
                              >
                                <span className="sjs-rub-main">
                                  <span className="sjs-rub-label-ar" lang="ar">
                                    {quarterLabelsAr[r.quarterInHizb - 1]}
                                  </span>
                                  <span className="sjs-rub-label-en">
                                    {quarterLabelsEn[r.quarterInHizb - 1]}
                                  </span>
                                </span>
                                {/* Verse label — only shown where data is accurate */}
                                {verseLabel ? (
                                  <span className="sjs-rub-verse">
                                    {verseLabel}
                                  </span>
                                ) : (
                                  <span className="sjs-rub-verse" />
                                )}
                                <span className="sjs-rub-page">
                                  {lang === "ar"
                                    ? `${t.mushaf.page} ${toHindiNumbers(
                                        r.startPage,
                                      )}`
                                    : `p. ${r.startPage}`}
                                </span>
                              </button>
                            </li>
                          );
                        })}
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
