import React, { useState, useMemo } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
  getSurahStartPage,
  getSurahEndPage,
} from "../../../../../../core/services/data/metadata.service";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import { useLang } from "../../../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import InlineSelect from "../../../../../../shared/components/inline-select/InlineSelect";
import type { QuizConfig } from "../../../../../../shared/models/verse.model";
import { readQuizPrefill } from "../../../../quiz-prefill";
import "./AkmelAlAyahSetup.css";

const JUZS = Array.from({ length: 30 }, (_, i) => i + 1);

const AkmelAlAyahSetup: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, isRTL } = useLang();
  const tq = t.quizSetup;

  // Pre-fill from a Hifz session range, if provided in the URL.
  const prefill = readQuizPrefill(location.search);

  const [scopeType, setScopeType] = useState<QuizConfig["type"]>(
    prefill ? "page" : "surah",
  );
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [pageFrom, setPageFrom] = useState(prefill?.fromPage ?? 1);
  const [pageTo, setPageTo] = useState(prefill?.toPage ?? 10);
  const [pageFilterSurah, setPageFilterSurah] = useState<number | null>(null);
  const [selectedJuzs, setSelectedJuzs] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(5);

  const allPageOptions = useMemo(
    () =>
      Array.from({ length: 604 }, (_, i) => ({
        value: String(i + 1),
        label: isRTL ? toHindi(i + 1) : String(i + 1),
      })),
    [isRTL],
  );

  const pageOptions = useMemo(() => {
    if (pageFilterSurah === null) return allPageOptions;
    const start = getSurahStartPage(pageFilterSurah);
    const end = getSurahEndPage(pageFilterSurah);
    return allPageOptions.filter((o) => {
      const n = Number(o.value);
      return n >= start && n <= end;
    });
  }, [allPageOptions, pageFilterSurah]);

  const countOptions = useMemo(
    () =>
      [25, 30, 35, 40, 45, 50].map((n) => ({
        value: String(n),
        label: isRTL ? toHindi(n) : String(n),
      })),
    [isRTL],
  );

  const surahNames = useMemo(() => {
    const chapters = getChapters();
    return [
      null,
      ...chapters.map((ch, i) => ({
        arabic: ch.name_arabic,
        english: getSurahNameEnglish(i + 1),
      })),
    ];
  }, []);

  const toggleJuz = (j: number) =>
    setSelectedJuzs((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j],
    );

  const handlePageFilterSurahChange = (surahNum: number | null) => {
    setPageFilterSurah(surahNum);
    if (surahNum !== null) {
      const start = getSurahStartPage(surahNum);
      const end = getSurahEndPage(surahNum);
      setPageFrom(start);
      setPageTo(end);
    } else {
      setPageFrom(1);
      setPageTo(10);
    }
  };

  const handleStart = async () => {
    const quizConfig: QuizConfig = {
      type: scopeType,
      surah: scopeType === "surah" ? selectedSurah : null,
      pageFrom: scopeType === "page" ? pageFrom : null,
      pageTo: scopeType === "page" ? pageTo : null,
      juzs: scopeType === "juz" ? selectedJuzs : [],
      questionCount,
      difficulty: "medium",
    };

    await Preferences.set({
      key: "quizConfig",
      value: JSON.stringify(quizConfig),
    });

    history.replace("/akmel-alayah");
  };

  const isReady = () => {
    if (scopeType === "surah") return selectedSurah !== null;
    if (scopeType === "page") return pageTo >= pageFrom;
    if (scopeType === "juz") return selectedJuzs.length > 0;
    return false;
  };

  const scrollZoneLabel = () => {
    if (scopeType === "surah") {
      return (
        <>
          {tq.selectSurah}
          {selectedSurah && (
            <span className="aa-selected-badge" lang="ar" dir="rtl">
              {getSurahNameArabic(selectedSurah)}
            </span>
          )}
        </>
      );
    }
    if (scopeType === "page") return tq.pageRange;
    if (scopeType === "juz") {
      return (
        <>
          {tq.selectJuzs}
          {selectedJuzs.length > 0 && (
            <span className="aa-selected-badge">
              {toHindi(selectedJuzs.length)} {tq.pickedJuzs}
            </span>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <IonPage>
      <IonContent class="aa-setup-content">
        <div className="aa-setup-page-wrapper">
          {/* ── Header ── */}
          <div className="aa-setup-header">
            <button
              className="aa-setup-back-btn"
              onClick={() => history.goBack()}
              aria-label={tq.backToList}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isRTL
                  ? <path d="M5 12h14M12 5l7 7-7 7" />
                  : <path d="M19 12H5M12 19l-7-7 7-7" />}
              </svg>
            </button>
            <div className="aa-setup-header-text">
              <h1 className="aa-setup-title">{tq.akmelTitle}</h1>
            </div>
            <div style={{ width: 44 }} />
          </div>

          {/* ── Body ── */}
          <div className="aa-body" dir={isRTL ? "rtl" : "ltr"}>
            {/* Scope selector */}
            <div className="aa-scope-section">
              <div className="aa-label">{tq.scope}</div>
              <div className="aa-type-row">
                {[
                  { key: "surah" as const, label: tq.scopeSurah },
                  { key: "page" as const, label: tq.scopePages },
                  { key: "juz" as const, label: tq.scopeJuz },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    className={`aa-type-btn ${scopeType === opt.key ? "active" : ""}`}
                    onClick={() => setScopeType(opt.key)}
                  >
                    <span className="aa-type-ar">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable selection zone */}
            <div className="aa-scroll-zone">
              <div className="aa-scroll-zone-label">{scrollZoneLabel()}</div>

              {/* Page pickers — always visible above the surah scroll list */}
              {scopeType === "page" && (
                <div className="aa-page-picker-bar">
                  <div className="aa-page-row">
                    <div className="aa-page-input">
                      <span>{tq.from}</span>
                      <InlineSelect
                        value={String(pageFrom)}
                        options={pageOptions}
                        onChange={(v) => {
                          const n = Number(v);
                          setPageFrom(n);
                          if (n > pageTo) setPageTo(n);
                        }}
                        fullWidth
                      />
                    </div>
                    <div className="aa-page-input">
                      <span>{tq.to}</span>
                      <InlineSelect
                        value={String(pageTo)}
                        options={pageOptions.filter((o) => Number(o.value) >= pageFrom)}
                        onChange={(v) => setPageTo(Number(v))}
                        fullWidth
                      />
                    </div>
                  </div>
                  <p className="aa-range-info">
                    {tq.pageCount}: {isRTL ? toHindi(pageTo - pageFrom + 1) : String(pageTo - pageFrom + 1)}
                  </p>
                </div>
              )}

              <div className="aa-scroll-inner">

                {/* Surah grid */}
                {scopeType === "surah" && (
                  <>
                    <div className="aa-surah-grid">
                      {surahNames.slice(1, 115).map((entry, i) => {
                        const num = i + 1;
                        return (
                          <button
                            key={num}
                            className={`aa-surah-chip ${selectedSurah === num ? "active" : ""}`}
                            onClick={() => setSelectedSurah(num)}
                          >
                            <span className="aa-chip-text">
                              {isRTL ? (
                                <>
                                  <span className="aa-chip-name" lang="ar" dir="rtl">{entry!.arabic}</span>
                                  <span className="aa-chip-en">{entry!.english}</span>
                                </>
                              ) : (
                                <>
                                  <span className="aa-chip-en">{entry!.english}</span>
                                  <span className="aa-chip-name" lang="ar" dir="rtl">{entry!.arabic}</span>
                                </>
                              )}
                            </span>
                            <span className="aa-chip-num">{isRTL ? toHindi(num) : String(num)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {!selectedSurah && (
                      <p className="aa-hint-text">{tq.hintOneSurah}</p>
                    )}
                  </>
                )}

                {/* Page range — surah filter only; pickers are above */}
                {scopeType === "page" && (
                  <>
                    <div className="aa-surah-filter-row">
                      <button
                        className={`aa-filter-all-btn${pageFilterSurah === null ? " active" : ""}`}
                        onClick={() => handlePageFilterSurahChange(null)}
                      >
                        {tq.allPages}
                      </button>
                    </div>
                    <div className="aa-surah-grid aa-surah-grid-compact">
                      {surahNames.slice(1, 115).map((entry, i) => {
                        const num = i + 1;
                        return (
                          <button
                            key={num}
                            className={`aa-surah-chip${pageFilterSurah === num ? " active" : ""}`}
                            onClick={() => handlePageFilterSurahChange(num)}
                          >
                            <span className="aa-chip-text">
                              {isRTL ? (
                                <>
                                  <span className="aa-chip-name" lang="ar" dir="rtl">{entry!.arabic}</span>
                                  <span className="aa-chip-en">{entry!.english}</span>
                                </>
                              ) : (
                                <>
                                  <span className="aa-chip-en">{entry!.english}</span>
                                  <span className="aa-chip-name" lang="ar" dir="rtl">{entry!.arabic}</span>
                                </>
                              )}
                            </span>
                            <span className="aa-chip-num">{isRTL ? toHindi(num) : String(num)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Juz grid */}
                {scopeType === "juz" && (
                  <div className="aa-juz-grid">
                    {JUZS.map((j) => (
                      <button
                        key={j}
                        className={`aa-juz-chip ${selectedJuzs.includes(j) ? "active" : ""}`}
                        onClick={() => toggleJuz(j)}
                      >
                        <span className="aa-juz-label">{tq.juzWord}</span>
                        <span className="aa-juz-num">{toHindi(j)}</span>
                      </button>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* ── Footer: always visible ── */}
          <div className="aa-footer">
            <div className="aa-footer-label">{tq.questionCount}</div>
            <div className="aa-count-row">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  className={`aa-count-btn ${questionCount === n ? "active" : ""}`}
                  onClick={() => setQuestionCount(n)}
                >
                  {isRTL ? toHindi(n) : String(n)}
                </button>
              ))}
              <div className={`aa-count-select${[25, 30, 35, 40, 45, 50].includes(questionCount) ? " active" : ""}`}>
                <InlineSelect
                  value={String([5, 10, 15, 20].includes(questionCount) ? 25 : questionCount)}
                  options={countOptions}
                  onChange={(v) => setQuestionCount(Number(v))}
                  fullWidth
                />
              </div>
            </div>
            <button
              className="aa-start-btn"
              onClick={handleStart}
              disabled={!isReady()}
            >
              {tq.start}
            </button>
          </div>

        </div>
      </IonContent>
      <BottomNavBar active="quiz" fixed />
    </IonPage>
  );
};

export default AkmelAlAyahSetup;
