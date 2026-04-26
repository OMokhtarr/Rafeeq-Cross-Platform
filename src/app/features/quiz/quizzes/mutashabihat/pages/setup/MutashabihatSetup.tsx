/**
 * MUTASHABIHAT SETUP PAGE
 * Migrated from: src/features/mutashabihat/MutashabihatSetup.js
 *
 * Changes:
 *  1. Wrapped in IonPage + IonContent
 *  2. useNavigate → useHistory
 *  3. Config stored in Capacitor Preferences instead of location.state
 *  4. toHindi → toHindiNumbers from arabic.util.ts
 *  5. All UI logic preserved exactly
 */

import React, { useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import { surahNamesArabic } from "../../../../../../core/services/data/repositories/ayah.repository";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import { useLang } from "../../../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import type { MutashabihatConfig } from "../../../../../../shared/models/verse.model";
import "./MutashabihatSetup.css";

const JUZS = Array.from({ length: 30 }, (_, i) => i + 1);

const MutashabihatSetup: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tq = t.quizSetup;

  const [scopeType, setScopeType] =
    useState<MutashabihatConfig["scopeType"]>("surah");
  const [selectedSurahs, setSelectedSurahs] = useState<number[]>([]);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(10);
  const [selectedJuzs, setSelectedJuzs] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(10);

  const toggleSurah = (num: number) =>
    setSelectedSurahs((prev) =>
      prev.includes(num) ? prev.filter((s) => s !== num) : [...prev, num],
    );

  const toggleJuz = (j: number) =>
    setSelectedJuzs((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j],
    );

  const handleStart = async () => {
    const config: MutashabihatConfig = {
      mode: "mutashabihat",
      scopeType,
      selectedSurahs: scopeType === "surah" ? selectedSurahs : [],
      pageFrom: scopeType === "page" ? pageFrom : null,
      pageTo: scopeType === "page" ? pageTo : null,
      selectedJuzs: scopeType === "juz" ? selectedJuzs : [],
      questionCount,
    };

    await Preferences.set({
      key: "mutashabihatConfig",
      value: JSON.stringify(config),
    });

    history.push("/mutashabihat-test");
  };

  const isReady = () => {
    if (scopeType === "surah") return selectedSurahs.length > 0;
    if (scopeType === "page") return pageTo >= pageFrom;
    if (scopeType === "juz") return selectedJuzs.length > 0;
    return false;
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ms-setup-page-wrapper">
        <div className="ms-setup-container">
          <div className="ms-setup-card">
            {/* ── Header ── */}
            <div className="ms-header">
              <h1 className="ms-title">{tq.mutashabihatTitle}</h1>
              <p className="ms-subtitle">{tq.mutashabihatSubtitle}</p>
            </div>

            {/* ── Info ── */}
            <div className="ms-info-box">
              <span className="ms-info-icon">💡</span>
              <p>{tq.mutashabihatInfo}</p>
            </div>

            {/* ── Scope selector ── */}
            <div className="ms-section">
              <label className="ms-label">{tq.scope}</label>
              <div className="ms-type-row">
                {[
                  { key: "surah" as const, icon: "📖", label: tq.scopeSurah },
                  { key: "page" as const, icon: "📄", label: tq.scopePages },
                  { key: "juz" as const, icon: "📚", label: tq.scopeJuz },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    className={`ms-type-btn ${scopeType === opt.key ? "active" : ""}`}
                    onClick={() => setScopeType(opt.key)}
                  >
                    <span className="ms-type-icon">{opt.icon}</span>
                    <span className="ms-type-ar">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Surah multi-select grid ── */}
            {scopeType === "surah" && (
              <div className="ms-section ms-section-scrollable">
                <label className="ms-label">
                  {tq.selectSurahs}
                  {selectedSurahs.length > 0 && (
                    <span className="ms-count-badge">
                      {toHindi(selectedSurahs.length)} {tq.pickedSurahs}
                    </span>
                  )}
                </label>
                <div className="ms-surah-grid">
                  {surahNamesArabic.slice(1, 115).map((name, i) => {
                    const num = i + 1;
                    return (
                      <button
                        key={num}
                        className={`ms-surah-chip ${selectedSurahs.includes(num) ? "active" : ""}`}
                        onClick={() => toggleSurah(num)}
                      >
                        <span className="ms-chip-name" lang="ar" dir="rtl">{name}</span>
                        <span className="ms-chip-num">{toHindi(num)}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedSurahs.length === 0 && (
                  <p className="ms-hint-text">{tq.hintOneSurahMin}</p>
                )}
              </div>
            )}

            {/* ── Page range ── */}
            {scopeType === "page" && (
              <div className="ms-section">
                <label className="ms-label">{tq.pageRange}</label>
                <div className="ms-page-row">
                  <div className="ms-page-input">
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
                  <div className="ms-page-input">
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
                <p className="ms-range-info">
                  {tq.pageCount}: {toHindi(pageTo - pageFrom + 1)}
                </p>
              </div>
            )}

            {/* ── Juz multi-select ── */}
            {scopeType === "juz" && (
              <div className="ms-section">
                <label className="ms-label">
                  {tq.selectJuzs}
                  {selectedJuzs.length > 0 && (
                    <span className="ms-count-badge">
                      {toHindi(selectedJuzs.length)} {tq.pickedJuzs}
                    </span>
                  )}
                </label>
                <div className="ms-juz-grid">
                  {JUZS.map((j) => (
                    <button
                      key={j}
                      className={`ms-juz-chip ${selectedJuzs.includes(j) ? "active" : ""}`}
                      onClick={() => toggleJuz(j)}
                    >
                      <span className="ms-juz-label">{tq.juzWord}</span>
                      <span className="ms-juz-num">{toHindi(j)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Question count ── */}
            <div className="ms-section">
              <label className="ms-label">{tq.questionCount}</label>
              <div className="ms-count-row">
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    className={`ms-count-btn ${questionCount === n ? "active" : ""}`}
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
                  className="ms-count-custom"
                />
              </div>
            </div>

            {/* ── Start ── */}
            <button
              className="ms-start-btn"
              onClick={handleStart}
              disabled={!isReady()}
            >
              <span>{tq.start}</span>
              <span className="ms-btn-en">{isRTL ? "→" : "←"}</span>
            </button>

            <button
              className="ms-back-btn"
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

export default MutashabihatSetup;
