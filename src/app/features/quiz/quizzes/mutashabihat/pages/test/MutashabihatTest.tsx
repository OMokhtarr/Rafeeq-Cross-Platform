/**
 * MUTASHABIHAT TEST PAGE
 * Migrated from: src/features/mutashabihat/MutashabihatTest.js
 *
 * Changes:
 *  1. Wrapped in IonPage + IonContent
 *  2. useNavigate → useHistory; location.state → Capacitor Preferences
 *  3. getAllMutashabihatGroups now receives verse map from quran.service
 *     (was using require() directly — now uses the in-memory cache)
 *  4. toHindi → toHindiNumbers from arabic.util.ts
 *  5. All quiz UI, sibling display, hint, feedback logic preserved exactly
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import MushafContextViewer from "../../../../../../shared/components/mushaf-context/MushafContextViewer";
import {
  getAllMutashabihatGroups,
  filterGroupsBySurahs,
  filterGroupsByPages,
  filterGroupsByJuzs,
  buildMutashabihatQuestion,
  checkMutashabihatAnswer,
} from "../../services/mutashabihat.service";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import {
  ensureSeeded,
  getAllVerses,
} from "../../../../../../core/services/data/quran.service";
import { useLang } from "../../../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import { useFeedbackBeep } from "../../../../../../core/hooks/useFeedbackBeep";
import type { MutashabihatConfig } from "../../../../../../shared/models/verse.model";
import "./MutashabihatTest.css";

const SETTINGS_KEY = "rafiq_settings_v1";
function isSoundOn(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw).soundEffects !== false;
  } catch {}
  return true;
}

const MutashabihatTest: React.FC = () => {
  const history = useHistory();
  const { t } = useLang();
  const tt = t.quizTest;

  const [questions, setQuestions] = useState<
    ReturnType<typeof buildMutashabihatQuestion>[]
  >([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showContext, setShowContext] = useState(false);
  // Which verse is shown in the context viewer (target verse or a sibling)
  const [contextVerseIdx, setContextVerseIdx] = useState<number>(-1); // -1 = target verse

  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const beep = useFeedbackBeep();

  // ── Load config + build questions ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);

        const { value } = await Preferences.get({ key: "mutashabihatConfig" });
        if (!value) {
          setError(tt.errorNoConfig);
          setLoading(false);
          return;
        }

        const config: MutashabihatConfig = JSON.parse(value);

        await ensureSeeded();

        // Build full verse map by walking pages 1..604 via the API/IDB path.
        // First run downloads all pages (slow); subsequent runs hit IDB.
        const allVerses = await getAllVerses();
        const allGroups = getAllMutashabihatGroups(allVerses);
        let filtered =
          config.scopeType === "surah"
            ? filterGroupsBySurahs(allGroups, config.selectedSurahs)
            : config.scopeType === "page"
              ? filterGroupsByPages(allGroups, config.pageFrom!, config.pageTo!)
              : filterGroupsByJuzs(allGroups, config.selectedJuzs);

        if (filtered.length === 0) {
          setError(tt.errorNoMutashabihat);
          setLoading(false);
          return;
        }

        const shuffled = [...filtered].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, config.questionCount);

        if (!cancelled) {
          setQuestions(chosen.map((g) => buildMutashabihatQuestion(g)));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError(tt.errorLoadingMutashabihat);
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auto-focus ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!answered) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [idx, answered]);

  const q = questions[idx];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    if (!userAnswer.trim() || answered || !q) return;
    const isCorrect = checkMutashabihatAnswer(userAnswer, q);
    setCorrect(isCorrect);
    if (isCorrect) setScore((s) => s + 1);
    setAnswered(true);
    if (isSoundOn()) beep(isCorrect ? "correct" : "wrong");
  }, [userAnswer, answered, q, beep]);

  const handleSkip = () => {
    if (answered || !q) return;
    setSkipped(true);
    setAnswered(true);
    setCorrect(false);
    if (isSoundOn()) beep("wrong");
  };

  const handleNext = () => {
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
      setUserAnswer("");
      setAnswered(false);
      setCorrect(false);
      setSkipped(false);
      setHintLevel(0);
      setShowContext(false);
      setContextVerseIdx(-1);
    } else {
      setQuizComplete(true);
    }
  };

  const handleHint = () => {
    if (!q) return;
    if (hintLevel < q.hints.length) setHintLevel((l) => l + 1);
  };

  const handleExit = () => {
    if (window.confirm(tt.confirmExit)) history.push("/mutashabihat-setup");
  };

  const getHintText = () => {
    if (!q || hintLevel === 0) return "";
    return q.hints.slice(0, hintLevel).join(" ");
  };

  // ── Loading / error / complete screens ────────────────────────────────────

  if (loading)
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="mst-loading">
            <div className="mst-spinner"></div>
            <p>{tt.loadingMutashabihat}</p>
          </div>
          <BottomNavBar active="quiz" />
        </IonContent>
      </IonPage>
    );

  if (error)
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="mst-error">
            <div className="mst-error-box">
              <p>{error}</p>
              <button onClick={() => history.push("/mutashabihat-setup")}>
                {tt.backToSetup}
              </button>
            </div>
          </div>
          <BottomNavBar active="quiz" />
        </IonContent>
      </IonPage>
    );

  if (!q) return null;

  if (quizComplete) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="mst-complete">
            <div className="mst-complete-card">
              <div className="mst-complete-badge">🎯</div>
              <h2>{tt.completeTitle}</h2>
              <p className="mst-complete-sub">{tt.completeMutashabihatSub}</p>
              <div className="mst-score-ring">
                <span className="mst-score-num">{score}</span>
                <span className="mst-score-sep">/</span>
                <span className="mst-score-total">{questions.length}</span>
              </div>
              <p className="mst-score-pct">{pct}%</p>
              <div className="mst-complete-actions">
                <button onClick={() => history.push("/mutashabihat-setup")}>
                  {tt.newQuiz}
                </button>
                <button onClick={() => history.push("/quiz-list")}>
                  {tt.quizListLink}
                </button>
              </div>
            </div>
          </div>
          <BottomNavBar active="quiz" />
        </IonContent>
      </IonPage>
    );
  }

  const siblings = q.siblingVerses ?? [];
  const maxHints = q.hints.length;

  // Build the full list of verses shown in the toolbar:
  // index 0 = target verse (the question), 1..n = sibling verses
  const toolbarVerses = [
    {
      sura: q.sura,
      aya: q.aya,
      text: q.fullText,
      page: q.page,
      suraName: q.suraName,
      suraNameAr: q.suraNameAr,
      isTarget: true,
    },
    ...siblings.map((sv: any) => ({ ...sv, isTarget: false })),
  ];
  // The verse currently shown in the viewer
  const activeViewerVerseIdx = contextVerseIdx < 0 ? 0 : contextVerseIdx;
  const activeViewerVerse =
    toolbarVerses[activeViewerVerseIdx] ?? toolbarVerses[0];

  // ── Main quiz render (JSX preserved from MutashabihatTest.js) ─────────────
  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="mst-test-page-wrapper">
          <div className={`mst-container ${showContext ? "with-sidebar" : ""}`}>
            {/* Context Viewer — no toolbar here, chips are in info-strip */}
            {showContext && (
              <div className="mst-sidebar-wrapper">
                <div className="mst-page-viewer">
                  <MushafContextViewer
                    verse={{
                      sura: activeViewerVerse.sura,
                      aya: activeViewerVerse.aya,
                      text: activeViewerVerse.text ?? "",
                      page: activeViewerVerse.page,
                      suraName: activeViewerVerse.suraName,
                      suraNameAr: activeViewerVerse.suraNameAr,
                    }}
                    snippet={q?.displayedPortion}
                    hiddenPortion={q?.hiddenPortion}
                    hintLevel={hintLevel}
                    showAnswer={answered}
                    isOpen={showContext}
                    onClose={() => setShowContext(false)}
                    mode="sidebar"
                  />
                </div>
              </div>
            )}

            {/* Main quiz panel */}
            <div className="mst-main">
              {/* Header */}
              <div className="mst-header">
                <div className="mst-progress">
                  <span className="mst-progress-text">
                    {tt.questionOf} {toHindi(idx + 1)} /{" "}
                    {toHindi(questions.length)}
                  </span>
                  <div className="mst-bar">
                    <div
                      className="mst-bar-fill"
                      style={{
                        width: `${((idx + 1) / questions.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mst-score-pill">
                  {tt.score}: {score}
                </div>
                <button className="mst-exit-btn" onClick={handleExit}>
                  {tt.exit}
                </button>
              </div>

              {/* Question card */}
              <div className="mst-card">
                {/* Info strip — surah/page/hizb top row + inline chips below */}
                <div className="mst-info-strip">
                  {/* Row 1: surah + meta pills */}
                  <div className="mst-info-top-row">
                    <span className="mst-surah-badge" lang="ar" dir="rtl">
                      {q.suraNameAr}
                    </span>
                    <span className="mst-meta">
                      {tt.ayahLabel} {toHindi(q.aya)}
                    </span>
                    <span className="mst-meta">
                      {tt.pageLabel} {toHindi(q.page)}
                    </span>
                    <span className="mst-meta">
                      {tt.hizbLabel} {toHindi(Math.ceil(q.page / 4))}
                    </span>
                    {siblings.length > 0 && (
                      <span className="mst-similar-badge">
                        🔗 {siblings.length}
                      </span>
                    )}
                  </div>

                  {/* Row 2: verse chips — target + siblings (always visible, tap to open context) */}
                  {toolbarVerses.length > 0 && (
                    <div className="mst-inline-chips">
                      {toolbarVerses.map((tv, ti) => (
                        <button
                          key={ti}
                          className={`mst-inline-chip ${activeViewerVerseIdx === ti && showContext ? "active" : ""} ${tv.isTarget ? "target" : "sibling"}`}
                          onClick={() => {
                            setContextVerseIdx(ti);
                            setShowContext(true);
                          }}
                          title={`${tv.suraNameAr} — ${tt.ayahLabel} ${tv.aya}`}
                        >
                          <span className="mst-chip-surah" lang="ar" dir="rtl">
                            {tv.suraNameAr}
                          </span>
                          <span className="mst-chip-meta">
                            {tt.ayahLabel} {toHindi(tv.aya)} · {tt.pageLabel}{" "}
                            {toHindi(tv.page)}
                          </span>
                          <span
                            className="mst-chip-preview"
                            lang="ar"
                            dir="rtl"
                          >
                            {(tv.text ?? "").slice(0, 18)}…
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card body: [actions column (left)] + [main content (right)] */}
                <div className="mst-card-body">
                  {/* Left column: action buttons */}
                  <div className="mst-actions">
                    <button
                      className="mst-btn mst-hint"
                      onClick={handleHint}
                      disabled={hintLevel >= maxHints || answered}
                    >
                      {tt.hint}
                      {hintLevel > 0 && (
                        <span className="mst-btn-en">
                          ({hintLevel}/{maxHints})
                        </span>
                      )}
                    </button>

                    <button
                      className={`mst-btn mst-context ${showContext ? "active" : ""}`}
                      onClick={() => setShowContext((v) => !v)}
                    >
                      {showContext ? tt.hide : tt.context}
                    </button>

                    <button
                      className="mst-btn mst-submit"
                      onClick={handleSubmit}
                      disabled={!userAnswer.trim() || answered}
                    >
                      {tt.submit}
                    </button>

                    <button
                      className="mst-btn mst-skip"
                      onClick={handleSkip}
                      disabled={answered}
                    >
                      {tt.skip}
                    </button>
                  </div>

                  {/* Right: verse + input + result + next */}
                  <div className="mst-card-main">
                    <div className="mst-verse-box">
                      <p className="mst-verse-shared" lang="ar" dir="rtl">
                        {q.displayedPortion}
                      </p>
                      {hintLevel > 0 && (
                        <span className="mst-hint-inline" lang="ar" dir="rtl">
                          {" "}
                          {getHintText()}
                        </span>
                      )}
                      <p className="mst-prompt">{tt.promptComplete}</p>
                    </div>

                    <div className="mst-answer-row">
                      <input
                        ref={inputRef}
                        type="text"
                        dir="rtl"
                        inputMode="text"
                        enterKeyHint={answered ? "done" : "send"}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && !answered && handleSubmit()
                        }
                        onFocus={(e) => {
                          const el = e.currentTarget;
                          setTimeout(
                            () =>
                              el.scrollIntoView({
                                block: "center",
                                behavior: "smooth",
                              }),
                            250,
                          );
                        }}
                        readOnly={answered}
                        placeholder={tt.inputPlaceholder}
                        className={`mst-input ${answered ? "answered" : ""}`}
                      />
                    </div>

                    {/* Result feedback */}
                    {answered && (
                      <div
                        className={`mst-result ${correct ? "correct" : skipped ? "skipped" : "wrong"}`}
                      >
                        <span className="mst-result-icon">
                          {correct ? "✅" : skipped ? "⏭" : "❌"}
                        </span>
                        <span className="mst-result-text">
                          {correct
                            ? tt.correctMsg
                            : skipped
                              ? tt.skippedMsg
                              : tt.wrongMsg}
                        </span>
                        {!correct && (
                          <div className="mst-correct-answer">
                            <span className="mst-correct-label">
                              {tt.completionVerse}{" "}
                            </span>
                            <span
                              className="mst-correct-text"
                              lang="ar"
                              dir="rtl"
                            >
                              {q.hiddenPortion}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {answered && (
                      <button className="mst-next-btn" onClick={handleNext}>
                        {idx + 1 < questions.length
                          ? tt.nextQuestion
                          : tt.finishQuiz}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <BottomNavBar active="quiz" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default MutashabihatTest;
