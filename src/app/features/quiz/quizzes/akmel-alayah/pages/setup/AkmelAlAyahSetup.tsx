/**
 * AKMEL AL-AYAH SETUP PAGE
 * src/app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup.tsx
 *
 * Direct TypeScript/Ionic port of QuizSetup.js.
 * Uses the same aa- CSS classes from QuizSetup.css.
 * Only changes from QuizSetup.js:
 *  1. Wrapped in IonPage + IonContent
 *  2. useNavigate → useHistory
 *  3. Config stored in Capacitor Preferences instead of location.state
 *  4. toHindi → toHindiNumbers from arabic.util.ts
 *  5. surahNamesArabic from ayah.repository instead of quranLoader
 */

import React, { useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import { surahNamesArabic } from "../../../../../../core/services/data/repositories/ayah.repository";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import { useLang } from "../../../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
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
  const [questionCount, setQuestionCount] = useState(10);

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
            {/* ── Header ── */}
            <div className="aa-header">
              <h1 className="aa-title">{tq.akmelTitle}</h1>
              <p className="aa-subtitle">{tq.akmelSubtitle}</p>
            </div>

            {/* ── Info ── */}
            <div className="aa-info-box">
              <span className="aa-info-icon">📖</span>
              <p>{tq.akmelInfo}</p>
            </div>

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
                    className={`aa-type-btn ${scopeType === opt.key ? "active" : ""}`}
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
                      {surahNamesArabic[selectedSurah]}
                    </span>
                  )}
                </label>
                <div className="aa-surah-grid">
                  {surahNamesArabic.slice(1, 115).map((name, i) => {
                    const num = i + 1;
                    return (
                      <button
                        key={num}
                        className={`aa-surah-chip ${selectedSurah === num ? "active" : ""}`}
                        onClick={() => setSelectedSurah(num)}
                      >
                        <span className="aa-chip-name" lang="ar" dir="rtl">{name}</span>
                        <span className="aa-chip-num">{toHindi(num)}</span>
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
                    <input
                      type="number"
                      min={pageFrom}
                      max="604"
                      value={pageTo}
                      onChange={(e) =>
                        setPageTo(parseInt(e.target.value) || pageFrom)
                      }
                    />
                  </div>
                  <div className="aa-page-input">
                    <span>{tq.from}</span>
                    <input
                      type="number"
                      min="1"
                      max="604"
                      value={pageFrom}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 1;
                        setPageFrom(v);
                        if (v > pageTo) setPageTo(v);
                      }}
                    />
                  </div>
                </div>
                <p className="aa-range-info">
                  {tq.pageCount}: {toHindi(pageTo - pageFrom + 1)}
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
                      className={`aa-juz-chip ${selectedJuzs.includes(j) ? "active" : ""}`}
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
                    {toHindi(n)}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={questionCount}
                  onChange={(e) =>
                    setQuestionCount(parseInt(e.target.value) || 10)
                  }
                  className="aa-count-custom"
                />
              </div>
            </div>

            {/* ── Start ── */}
            <button
              className="aa-start-btn"
              onClick={handleStart}
              disabled={!isReady()}
            >
              <span>{tq.start}</span>
              <span className="aa-btn-en">{isRTL ? "→" : "←"}</span>
            </button>

            <button
              className="aa-back-btn"
              onClick={() => history.push("/quiz-list")}
            >
              {tq.backToList}
            </button>
          </div>
        </div>
        </div>
        <BottomNavBar active="quiz" fixed />
      </IonContent>
    </IonPage>
  );
};

export default AkmelAlAyahSetup;
