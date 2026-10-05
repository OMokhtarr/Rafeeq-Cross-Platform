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
  getRubStart,
  getRubEnd,
  estimatePageForVerse,
  getSuraForPage,
} from "../../../core/services/data/metadata.service";
import { usePageTour } from "../../onboarding/usePageTour";
import { tourAttr } from "../../onboarding/tourCatalog";
import "./SurahJuzSelection.css";

type Tab = "surah" | "juz" | "hizb";

interface RubItem {
  rubNum: number;
  hizbNum: number;
  quarterInHizb: number; // 1 = ¼, 2 = ½, 3 = ¾, 4 = End
  startPage: number;
  endPage: number;
  startSura: number;
  startAya: number;
  startSuraAr: string;
  startSuraEn: string;
}

const JUZ_START_PAGES: readonly number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

const SurahJuzSelection: React.FC = () => {
  usePageTour(["surahJuz"]);
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  // English captions sit under the Arabic ones only outside Arabic mode.
  const showEn = lang !== "ar";
  const [tab, setTab] = useState<Tab>("surah");
  const [pendingJuzNum, setPendingJuzNum] = useState<number | null>(null);
  const [pendingSurahNum, setPendingSurahNum] = useState<number | null>(null);

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
      const startVerse = getHizbStart(juzNum * 2 - 1);
      return { num: juzNum, start, end, startVerse };
    });
  }, []);

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

  const rubs = useMemo((): RubItem[] => {
    return Array.from({ length: 240 }, (_, i) => {
      const rubNum = i + 1;
      const start = getRubStart(rubNum);
      const end = getRubEnd(rubNum);
      return {
        rubNum,
        hizbNum: Math.ceil(rubNum / 4),
        quarterInHizb: (i % 4) + 1,
        startPage: estimatePageForVerse(start.sura, start.aya),
        endPage: estimatePageForVerse(end.sura, end.aya),
        startSura: start.sura,
        startAya: start.aya,
        startSuraAr: getSurahNameArabic(start.sura),
        startSuraEn: getSurahNameEnglish(start.sura),
      };
    });
  }, []);

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
    // First rub touching this page (a rub mark often falls mid-page)
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
    () => pendingSurahNum ?? relevantIds?.surahNum ?? null,
    [pendingSurahNum, relevantIds],
  );

  const highlightJuz = useMemo(
    () => pendingJuzNum ?? relevantIds?.juzNum ?? null,
    [pendingJuzNum, relevantIds],
  );

  // ── Auto-scroll to the relevant item whenever the active tab changes ───────
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!relevantIds) return;
    // Clear pending state once URL has updated (so highlight stays green)
    setPendingSurahNum(null);
    setPendingJuzNum(null);
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

  // Opens the viewer on `page` and flashes `verse` there — the same `v` param
  // bookmark and search navigation use.
  const goToPage = (
    page: number,
    verse: { sura: number; aya: number },
    itemType?: "surah" | "juz",
  ) => {
    if (itemType === "surah") {
      setPendingSurahNum(getSuraForPage(page) ?? 1);
    } else if (itemType === "juz") {
      const juz = juzs.find((j) => page >= j.start && page <= j.end);
      if (juz) setPendingJuzNum(juz.num);
    }
    // Replace, don't push: this screen is a picker the reader passes through,
    // not a place to come back to. Pushing would stack /viewer?page=N on top of
    // /surah-juz, so backing out of the chosen surah would land on the picker
    // again and need a second back to reach the viewer. /viewer is a root tab
    // and must be one back away from exiting.
    history.replace(`/viewer?page=${page}&v=${verse.sura}:${verse.aya}`);
  };

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.replace("/viewer");
  };

  const quarterLabelsAr = ["ربع", "نصف", "ثلاثة أرباع", "كمال"];
  const quarterLabelsEn = ["¼", "½", "¾", "End"];

  // Each quarter row shows the verse it starts at — where tapping it lands.
  const rubVerseLabel = (r: RubItem): string =>
    lang === "ar"
      ? `${r.startSuraAr} : ${toHindiNumbers(r.startAya)}`
      : `${r.startSuraEn} : ${r.startAya}`;

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
          <div className="sjs-tabs" role="tablist" {...tourAttr("surahJuz.tabs")}>
            <button
              role="tab"
              aria-selected={tab === "surah"}
              className={"sjs-tab" + (tab === "surah" ? " sjs-tab-active" : "")}
              onClick={() => setTab("surah")}
            >
              <span className="sjs-tab-ar">السور</span>
              {showEn && <span className="sjs-tab-en">Chapters</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "juz"}
              className={"sjs-tab" + (tab === "juz" ? " sjs-tab-active" : "")}
              onClick={() => setTab("juz")}
            >
              <span className="sjs-tab-ar">الأجزاء</span>
              {showEn && <span className="sjs-tab-en">Juz</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "hizb"}
              className={"sjs-tab" + (tab === "hizb" ? " sjs-tab-active" : "")}
              onClick={() => setTab("hizb")}
            >
              <span className="sjs-tab-ar">الأحزاب</span>
              {showEn && <span className="sjs-tab-en">Hizb</span>}
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
                      onClick={() =>
                        goToPage(s.startPage, { sura: s.num, aya: 1 }, "surah")
                      }
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
                        {showEn && <span className="sjs-name-en">{s.en}</span>}
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
                      onClick={() => goToPage(j.start, j.startVerse, "juz")}
                    >
                      <span className="sjs-num sjs-num-juz">
                        {lang === "ar" ? toHindiNumbers(j.num) : j.num}
                      </span>
                      <span className="sjs-row-main">
                        <span className="sjs-name-ar" lang="ar">
                          {`الجزء ${toHindiNumbers(j.num)}`}
                        </span>
                        {showEn && (
                          <span className="sjs-name-en">{`Juz ${j.num}`}</span>
                        )}
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
                        onClick={() =>
                          goToPage(h.startPage, {
                            sura: h.startSura,
                            aya: h.startAya,
                          })
                        }
                      >
                        <span className="sjs-num sjs-num-hizb">
                          {lang === "ar" ? toHindiNumbers(h.num) : h.num}
                        </span>
                        <span className="sjs-row-main">
                          <span className="sjs-name-ar" lang="ar">
                            {`الحزب ${toHindiNumbers(h.num)}`}
                          </span>
                          {showEn && (
                            <span className="sjs-name-en">{`Hizb ${h.num}`}</span>
                          )}
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
                                onClick={() =>
                                  goToPage(r.startPage, {
                                    sura: r.startSura,
                                    aya: r.startAya,
                                  })
                                }
                              >
                                <span className="sjs-rub-main">
                                  <span className="sjs-rub-label-ar" lang="ar">
                                    {quarterLabelsAr[r.quarterInHizb - 1]}
                                  </span>
                                  {showEn && (
                                    <span className="sjs-rub-label-en">
                                      {quarterLabelsEn[r.quarterInHizb - 1]}
                                    </span>
                                  )}
                                </span>
                                <span className="sjs-rub-verse">
                                  {verseLabel}
                                </span>
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

        </div>
      </IonContent>
      <BottomNavBar active="quran" fixed />
    </IonPage>
  );
};

export default SurahJuzSelection;
