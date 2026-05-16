import React, { useState, useMemo } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import {
  getChapters,
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../../../../../core/services/data/metadata.service";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import { useLang } from "../../../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import InlineSelect from "../../../../../../shared/components/inline-select/InlineSelect";
import type { QuizConfig } from "../../../../../../shared/models/verse.model";
import "./AkmelAlAyahSetup.css";

const JUZS = Array.from({ length: 30 }, (_, i) => i + 1);

const AkmelAlAyahSetup: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tq = t.quizSetup;

  const [scopeType, setScopeType] = useState<QuizConfig["type"]>("surah");
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(10);
  const [selectedJuzs, setSelectedJuzs] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(5);

  const pageOptions = useMemo(
    () =>
      Array.from({ length: 604 }, (_, i) => ({
        value: String(i + 1),
        label: isRTL ? toHindi(i + 1) : String(i + 1),
      })),
    [isRTL],
  );

  const countOptions = useMemo(
    () =>
      [25, 30, 35, 40, 45, 50].map((n) => ({
        value: String(n),
        label: isRTL ? toHindi(n) : String(n),
      })),
    [isRTL],
  );

  // Build surah names list from metadata service
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

    history.push("/akmel-alayah");
  };

  const isReady = () => {
    if (scopeType === "surah") return selectedSurah !== null;
    if (scopeType === "page") return pageTo >= pageFrom;
    if (scopeType === "juz") return selectedJuzs.length > 0;
    return false;
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="aa-setup-page-wrapper">
          <div className="aa-container">
            <div className="aa-card">
              {/* ── Scope selector ── */}
              <div className="aa-section">
                <label className="aa-label">{tq.scope}</label>
                <div className="aa-type-row">
                  {[
                    { key: "surah" as const, icon: "📖", label: tq.scopeSurah },
                    { key: "page" as const, icon: "📄", label: tq.scopePages },
                    { key: "juz" as const, icon: "📚", label: tq.scopeJuz },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      className={`aa-type-btn ${
                        scopeType === opt.key ? "active" : ""
                      }`}
                      onClick={() => setScopeType(opt.key)}
                    >
                      <span className="aa-type-icon">{opt.icon}</span>
                      <span className="aa-type-ar">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Surah grid (single-select) ── */}
              {scopeType === "surah" && (
                <div className="aa-section aa-section-scrollable">
                  <label className="aa-label">
                    {tq.selectSurah}
                    {selectedSurah && (
                      <span className="aa-selected-badge" lang="ar" dir="rtl">
                        {getSurahNameArabic(selectedSurah)}
                      </span>
                    )}
                  </label>
                  <div className="aa-surah-grid">
                    {surahNames.slice(1, 115).map((entry, i) => {
                      const num = i + 1;
                      return (
                        <button
                          key={num}
                          className={`aa-surah-chip ${
                            selectedSurah === num ? "active" : ""
                          }`}
                          onClick={() => setSelectedSurah(num)}
                        >
                          <span className="aa-chip-text">
                            {isRTL ? (
                              <>
                                <span className="aa-chip-name" lang="ar" dir="rtl">
                                  {entry!.arabic}
                                </span>
                                <span className="aa-chip-en">{entry!.english}</span>
                              </>
                            ) : (
                              <>
                                <span className="aa-chip-en">{entry!.english}</span>
                                <span className="aa-chip-name" lang="ar" dir="rtl">
                                  {entry!.arabic}
                                </span>
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
                </div>
              )}

              {/* ── Page range ── */}
              {scopeType === "page" && (
                <div className="aa-section">
                  <label className="aa-label">{tq.pageRange}</label>
                  <div className="aa-page-row">
                    <div className="aa-page-input">
                      <span>{tq.to}</span>
                      <InlineSelect
                        value={String(pageTo)}
                        options={pageOptions.filter((o) => Number(o.value) >= pageFrom)}
                        onChange={(v) => setPageTo(Number(v))}
                        fullWidth
                      />
                    </div>
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
                  </div>
                  <p className="aa-range-info">
                    {tq.pageCount}: {isRTL ? toHindi(pageTo - pageFrom + 1) : String(pageTo - pageFrom + 1)}
                  </p>
                </div>
              )}

              {/* ── Juz grid (multi-select) ── */}
              {scopeType === "juz" && (
                <div className="aa-section">
                  <label className="aa-label">
                    {tq.selectJuzs}
                    {selectedJuzs.length > 0 && (
                      <span className="aa-selected-badge">
                        {toHindi(selectedJuzs.length)} {tq.pickedJuzs}
                      </span>
                    )}
                  </label>
                  <div className="aa-juz-grid">
                    {JUZS.map((j) => (
                      <button
                        key={j}
                        className={`aa-juz-chip ${
                          selectedJuzs.includes(j) ? "active" : ""
                        }`}
                        onClick={() => toggleJuz(j)}
                      >
                        <span className="aa-juz-label">{tq.juzWord}</span>
                        <span className="aa-juz-num">{toHindi(j)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Question count ── */}
              <div className="aa-section">
                <label className="aa-label">{tq.questionCount}</label>
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
              </div>

              {/* ── Start ── */}
              <button
                className="aa-start-btn"
                onClick={handleStart}
                disabled={!isReady()}
              >
                {tq.start}
              </button>

              <button
                className="aa-back-btn"
                onClick={() => history.push("/quiz-list")}
              >
                {tq.backToList}
              </button>
            </div>
          </div>
          <BottomNavBar active="quiz" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AkmelAlAyahSetup;
