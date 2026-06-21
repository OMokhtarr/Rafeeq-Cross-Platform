/**
 * AKMEL AL-AYAH TEST PAGE
 * Immersive mode: when context viewer is open, the question card collapses
 * to show only a compact row of action buttons (Hint, Submit, Skip).
 * The header becomes minimal, and the Mushaf viewer fills the rest.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent, useIonToast } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import MushafContextViewer from "../../../../../../shared/components/mushaf-context/MushafContextViewer";
import { toHindiNumbers as toHindi } from "../../../../../../core/utils/arabic.util";
import { removeDiacritics } from "../../../../../../core/utils/arabic.util";
import { ensureSeeded } from "../../../../../../core/services/data/quran.service";
import {
  getSurahVersesList,
  getJuzVerses,
  getPageRangeVerses,
} from "../../../../../../core/services/data/quran.service";
import { useLang } from "../../../../../../core/context/LanguageContext";
import { useVerseVisibility } from "../../../../../../core/context/VerseVisibilityContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import { useFeedbackBeep } from "../../../../../../core/hooks/useFeedbackBeep";
import { useWakeLock } from "../../../../../../core/hooks/useWakeLock";
import QuizExitModal from "../../../../components/QuizExitModal";
import type {
  QuizConfig,
  QuizQuestion,
} from "../../../../../../shared/models/verse.model";
import "./AkmelAlAyah.css";

const SETTINGS_KEY = "rafiq_settings_v1";
function isSoundOn(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw).soundEffects !== false;
  } catch {}
  return true;
}

// ── Inline verse splitter ─────────────────────────────────────────────────────

function splitVerse(text: string): { displayed: string; hidden: string } {
  if (!text) return { displayed: "", hidden: "" };
  const words = text.split(" ");
  const mid = Math.max(2, Math.floor(words.length / 2));
  return {
    displayed: words.slice(0, mid).join(" "),
    hidden: words.slice(mid).join(" "),
  };
}

function buildQuestion(verse: any): QuizQuestion {
  const { displayed, hidden } = splitVerse(verse.text);
  return {
    id: `${verse.sura}:${verse.aya}`,
    sura: verse.sura,
    aya: verse.aya,
    suraName: verse.suraName ?? "",
    suraNameAr: verse.suraNameAr ?? `سورة ${verse.sura}`,
    page: verse.page,
    fullText: verse.text,
    displayedPortion: displayed,
    hiddenPortion: hidden,
    splitPoint: displayed.split(" ").length,
    splitMethod: "firstHalf",
    previousVersesContext: [],
    nextVersesForProgression: [],
    correctAnswer: hidden.trim(),
    difficulty: "medium",
    versePart: displayed,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const AkmelAlAyah: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tt = t.quizTest;
  const [presentToast] = useIonToast();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showContext, setShowContext] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const beep = useFeedbackBeep();
  useWakeLock();
  const { showAll: showAllVerses } = useVerseVisibility();

  // Quiz depends on every verse being visible — clear any hide state the user
  // may have left behind in the page viewer before the quiz starts.
  useEffect(() => {
    showAllVerses();
  }, [showAllVerses]);

  // Intercept hardware/browser back — show exit confirmation instead of navigating away.
  useEffect(() => {
    const handler = (ev: Event) => {
      (ev as CustomEvent).detail.register(10, () => setShowExitModal(true));
    };
    document.addEventListener("ionBackButton", handler);
    return () => document.removeEventListener("ionBackButton", handler);
  }, []);

  // ── Load config + generate questions ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);

        const { value } = await Preferences.get({ key: "quizConfig" });
        if (!value) {
          setError(tt.errorNoConfig);
          setLoading(false);
          return;
        }

        const config: QuizConfig = JSON.parse(value);
        await ensureSeeded();

        let allVerses: any[] = [];

        if (config.type === "surah" && config.surah) {
          allVerses = await getSurahVersesList(config.surah);
        } else if (config.type === "juz") {
          allVerses = await getJuzVerses(config.juzs);
        } else if (
          config.type === "page" &&
          config.pageFrom != null &&
          config.pageTo != null
        ) {
          allVerses = await getPageRangeVerses(config.pageFrom, config.pageTo);
        }

        if (cancelled) return;

        if (allVerses.length === 0) {
          setError(tt.errorNoVerses);
          setLoading(false);
          return;
        }

        const count = Math.min(config.questionCount, allVerses.length);
        const shuffled = [...allVerses].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, count);

        if (!cancelled) {
          setQuestions(chosen.map(buildQuestion));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError(tt.errorLoadingAkmel);
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
    const correctAnswer = (q.hiddenPortion ?? q.correctAnswer ?? "").trim();
    const user = userAnswer.trim();
    const isCorrect =
      correctAnswer.includes(user) ||
      correctAnswer === user ||
      removeDiacritics(correctAnswer).includes(removeDiacritics(user));
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
    setShowContext(false); // ← Close immersive mode on skip
  };

  const handleNext = () => {
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
      setUserAnswer("");
      setAnswered(false);
      setCorrect(false);
      setSkipped(false);
      setHintLevel(0);
      setShowContext(false); // ← Already closing immersive mode
    } else {
      setQuizComplete(true);
    }
  };

  const handleHint = () => {
    if (!q) return;
    const words = (q.hiddenPortion ?? q.correctAnswer ?? "")
      .trim()
      .split(" ")
      .filter(Boolean);
    if (hintLevel < words.length) setHintLevel((l) => l + 1);
  };

  const handleExit = () => setShowExitModal(true);

  const handleToggleContext = () => {
    setShowContext((prev) => !prev);
  };

  const getHintText = () => {
    if (!q || hintLevel === 0) return "";
    return (q.hiddenPortion ?? q.correctAnswer ?? "")
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, hintLevel)
      .join(" ");
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <IonPage>
        <IonContent>
          <div className="aa-test-page-wrapper">
            <div className="aa-loading">
              <div className="aa-spinner"></div>
              <p>{tt.loadingAkmel}</p>
            </div>
            <BottomNavBar active="quiz" />
          </div>
        </IonContent>
      </IonPage>
    );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error)
    return (
      <IonPage>
        <IonContent>
          <div className="aa-test-page-wrapper">
            <div className="aa-error">
              <div className="aa-error-box">
                <p>{error}</p>
                <button onClick={() => history.push("/akmel-alayah-setup")}>
                  {tt.backToSetup}
                </button>
              </div>
            </div>
            <BottomNavBar active="quiz" />
          </div>
        </IonContent>
      </IonPage>
    );

  if (!q) return null;

  // ── Complete ───────────────────────────────────────────────────────────────
  if (quizComplete) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <IonPage>
        <IonContent>
          <div className="aa-test-page-wrapper">
            <div className="aa-complete">
              <div className="aa-complete-card">
                <h2>{tt.completeTitle}</h2>
                <p className="aa-complete-sub">{tt.completeAkmelSub}</p>
                <div className="aa-score-ring">
                  <span className="aa-score-num">{score}</span>
                  <span className="aa-score-sep">/</span>
                  <span className="aa-score-total">{questions.length}</span>
                </div>
                <p className="aa-score-pct">{pct}%</p>
                <div className="aa-complete-actions">
                  <button onClick={() => history.push("/akmel-alayah-setup")}>
                    {tt.newQuiz}
                  </button>
                  <button onClick={() => history.push("/quiz-list")}>
                    {tt.quizListLink}
                  </button>
                </div>
              </div>
            </div>
            <BottomNavBar active="quiz" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const maxHints = (q.hiddenPortion ?? q.correctAnswer ?? "")
    .trim()
    .split(" ")
    .filter(Boolean).length;
  const immersiveMode = showContext;

  // ── Main quiz render ───────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent>
        <div className="aa-test-page-wrapper">
          <div className="aa-container">
            {/* Header – becomes minimal when immersive */}
            <div
              className={`aa-header ${
                immersiveMode ? "aa-header-minimal" : ""
              }`}
            >
              <div className="aa-progress">
                <span className="aa-progress-text">
                  {tt.questionOf} {isRTL ? toHindi(idx + 1) : idx + 1} /{" "}
                  {isRTL ? toHindi(questions.length) : questions.length}
                </span>
                <div className="aa-bar">
                  <div
                    className="aa-bar-fill"
                    style={{
                      width: `${((idx + 1) / questions.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="aa-score-pill">
                {tt.score}: {score}
              </div>
              <div className="aa-header-actions">
                <button
                  className="aa-exit-btn"
                  onClick={handleExit}
                  aria-label={tt.exit}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Question card – full or minimized (buttons only) */}
            <div
              className={`aa-card ${
                immersiveMode ? "aa-card-buttons-only" : ""
              }`}
            >
              {/* Info strip – hidden in immersive mode (already in page-edge-top) */}
              {!immersiveMode && (
                <div className="aa-info-strip">
                  <span className="aa-surah-badge">
                    {isRTL ? (
                      <>
                        <span lang="ar" dir="rtl">{q.suraNameAr}</span>
                        {q.suraName && <span dir="ltr"> · {q.suraName}</span>}
                      </>
                    ) : (
                      <>
                        {q.suraName && <span>{q.suraName}</span>}
                        <span lang="ar" dir="rtl"> · {q.suraNameAr}</span>
                      </>
                    )}
                  </span>
                  <span className="aa-meta">
                    {tt.ayahLabel} {isRTL ? toHindi(q.aya) : q.aya}
                  </span>
                  <span className="aa-meta">
                    {tt.pageLabel} {isRTL ? toHindi(q.page) : q.page}
                  </span>
                  <span className="aa-meta">
                    {tt.hizbLabel} {isRTL ? toHindi(Math.ceil(q.page / 4)) : Math.ceil(q.page / 4)}
                  </span>
                </div>
              )}

              <div className="aa-card-body">
                <div className="aa-card-main">
                  {/* Action buttons – always visible */}
                  <div className="aa-actions">
                    <button
                      className="aa-btn aa-hint"
                      onClick={handleHint}
                      disabled={hintLevel >= maxHints || answered}
                    >
                      {tt.hint}
                      {hintLevel > 0 && (
                        <span className="aa-btn-en">
                          ({hintLevel}/{maxHints})
                        </span>
                      )}
                    </button>
                    <button
                      className="aa-btn aa-context"
                      onClick={handleToggleContext}
                    >
                      {tt.context}
                    </button>

                    <button
                      className="aa-btn aa-submit"
                      onClick={handleSubmit}
                      disabled={!userAnswer.trim() || answered}
                    >
                      {tt.submit}
                    </button>
                    <button
                      className="aa-btn aa-skip"
                      onClick={handleSkip}
                      disabled={answered}
                    >
                      {tt.skip}
                    </button>
                    <button
                      className="aa-btn aa-recite"
                      onClick={() =>
                        presentToast({
                          message: tt.comingSoon,
                          duration: 2000,
                          position: "bottom",
                        })
                      }
                      aria-label="Recite"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="3" width="6" height="12" rx="3" />
                        <path d="M5 11a7 7 0 0014 0" />
                        <line x1="12" y1="18" x2="12" y2="22" />
                        <line x1="9" y1="22" x2="15" y2="22" />
                      </svg>
                    </button>
                  </div>

                  {/* Full content – hidden in immersive mode */}
                  {!immersiveMode && (
                    <>
                      <div className="aa-verse-box">
                        <p className="aa-verse-shared" lang="ar" dir="rtl">
                          {q.versePart ?? q.displayedPortion}
                        </p>
                        {hintLevel > 0 && (
                          <span className="aa-hint-inline" lang="ar" dir="rtl">
                            {" "}
                            {getHintText()}
                          </span>
                        )}
                      </div>

                      <div className="aa-answer-row">
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
                          className={`aa-input ${answered ? "answered" : ""}`}
                        />
                      </div>

                      {answered && (
                        <div
                          className={`aa-result ${
                            correct ? "correct" : skipped ? "skipped" : "wrong"
                          }`}
                        >
                          <span className="aa-result-icon">
                            {correct ? "✅" : skipped ? "⏭" : "❌"}
                          </span>
                          <span className="aa-result-text">
                            {correct
                              ? tt.correctMsg
                              : skipped
                              ? tt.skippedMsg
                              : tt.wrongMsg}
                          </span>
                          {!correct && (
                            <div className="aa-correct-answer">
                              <span className="aa-correct-label">
                                {tt.correctAnswer}{" "}
                              </span>
                              <span
                                className="aa-correct-text"
                                lang="ar"
                                dir="rtl"
                              >
                                {q.hiddenPortion ?? q.correctAnswer}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {answered && (
                        <button className="aa-next-btn" onClick={handleNext}>
                          {idx + 1 < questions.length
                            ? tt.nextQuestion
                            : tt.finishQuiz}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Context Viewer – fills remaining space */}
            {showContext && (
              <div className="aa-context-viewer">
                <MushafContextViewer
                  verse={{
                    sura: q.sura,
                    aya: q.aya,
                    text: q.fullText,
                    page: q.page,
                    suraName: q.suraName,
                    suraNameAr: q.suraNameAr,
                  }}
                  snippet={q.versePart ?? q.displayedPortion}
                  hiddenPortion={q.hiddenPortion}
                  hintLevel={hintLevel}
                  showAnswer={answered}
                  isOpen={showContext}
                  onClose={() => setShowContext(false)}
                  mode="sidebar"
                />
              </div>
            )}
          </div>
          <QuizExitModal
            isOpen={showExitModal}
            onCancel={() => setShowExitModal(false)}
            onConfirm={() => history.push("/quiz-list")}
          />
          <BottomNavBar active="quiz" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AkmelAlAyah;
