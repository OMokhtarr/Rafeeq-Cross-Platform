/**
 * MUTASHABIHAT TEST PAGE
 * Immersive mode: when context viewer is open, the question card collapses
 * to show only the compact row of action buttons (Hint, Context, Submit, Skip).
 * The Mushaf viewer fills the rest of the screen.
 *
 * CHIP UPDATES: Click any info‑strip chip to switch the context viewer to that verse.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent, useIonToast } from "@ionic/react";
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
import { useVerseVisibility } from "../../../../../../core/context/VerseVisibilityContext";
import BottomNavBar from "../../../../../../shared/components/bottom-nav/BottomNavBar";
import { useFeedbackBeep } from "../../../../../../core/hooks/useFeedbackBeep";
import { useWakeLock } from "../../../../../../core/hooks/useWakeLock";
import QuizExitModal from "../../../../components/QuizExitModal";
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
  const { t, isRTL } = useLang();
  const tt = t.quizTest;
  const [presentToast] = useIonToast();

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
  const [showExitModal, setShowExitModal] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState(0);
  const [selectedVerseIdx, setSelectedVerseIdx] = useState(0); // 0 = target verse

  const inputRef = useRef<HTMLInputElement>(null);
  const beep = useFeedbackBeep();
  useWakeLock();
  const { showAll: showAllVerses } = useVerseVisibility();

  // Quiz depends on every verse being visible — clear any hide state the user
  // may have left behind in the page viewer before the quiz starts.
  useEffect(() => {
    showAllVerses();
  }, [showAllVerses]);

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
        // Ensure every selected group has at least 2 verses (safety)
        const chosen = shuffled
          .filter((g) => g.verses.length >= 2)
          .slice(0, config.questionCount);

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
    setShowContext(false);
    setSelectedVerseIdx(0); // reset to target
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
      setSelectedVerseIdx(0);
    } else {
      setQuizComplete(true);
    }
  };

  const handleHint = () => {
    if (!q) return;
    if (hintLevel < q.hints.length) setHintLevel((l) => l + 1);
  };

  const handleExit = () => setShowExitModal(true);

  const handleToggleContext = () => {
    setShowContext((prev) => !prev);
  };

  const getHintText = () => {
    if (!q || hintLevel === 0) return "";
    return q.hints.slice(0, hintLevel).join(" ");
  };

  // ── Loading / error / complete screens ────────────────────────────────────

  if (loading)
    return (
      <IonPage>
        <IonContent>
          <div className="mst-test-page-wrapper">
            <div className="mst-loading">
              <div className="mst-spinner"></div>
              <p>{tt.loadingMutashabihat}</p>
            </div>
            <BottomNavBar active="quiz" />
          </div>
        </IonContent>
      </IonPage>
    );

  if (error)
    return (
      <IonPage>
        <IonContent>
          <div className="mst-test-page-wrapper">
            <div className="mst-error">
              <div className="mst-error-box">
                <p>{error}</p>
                <button onClick={() => history.push("/mutashabihat-setup")}>
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

  if (quizComplete) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <IonPage>
        <IonContent>
          <div className="mst-test-page-wrapper">
            <div className="mst-complete">
              <div className="mst-complete-card">
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
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const maxHints = q.hints.length;
  const immersiveMode = showContext;
  const siblings = q.siblingVerses ?? [];

  // Build toolbar verses with full data for the context viewer
  const toolbarVerses = [
    {
      sura: q.sura,
      aya: q.aya,
      text: q.fullText,
      page: q.page,
      suraName: q.suraName ?? "",
      suraNameAr: q.suraNameAr,
      isTarget: true,
      hiddenPortion: q.hiddenPortion,
    },
    ...siblings.map((sv: any) => ({
      sura: sv.sura,
      aya: sv.aya,
      text: sv.text,
      page: sv.page,
      suraName: sv.suraName ?? "",
      suraNameAr: sv.suraNameAr,
      isTarget: false,
      hiddenPortion: sv.hiddenStart,
    })),
  ];

  // ── Main quiz render ───────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent>
        <div className="mst-test-page-wrapper">
          <div className="mst-container">
            {/* Header – minimal when immersive */}
            <div
              className={`mst-header ${
                immersiveMode ? "mst-header-minimal" : ""
              }`}
            >
              <div className="mst-progress">
                <span className="mst-progress-text">
                  {tt.questionOf} {isRTL ? toHindi(idx + 1) : idx + 1} /{" "}
                  {isRTL ? toHindi(questions.length) : questions.length}
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
              <div className="mst-header-actions">
                <button
                  className="mst-exit-btn"
                  onClick={handleExit}
                  aria-label={tt.exit}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Question card – full or minimized (buttons only) */}
            <div
              className={`mst-card ${
                immersiveMode ? "mst-card-buttons-only" : ""
              }`}
            >
              {/* Info strip – hidden in immersive mode */}
              {!immersiveMode && (
                <div className="mst-info-strip">
                  <div className="mst-info-top-row">
                    <span className="mst-surah-badge">
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
                    <span className="mst-meta">
                      {tt.ayahLabel} {isRTL ? toHindi(q.aya) : q.aya}
                    </span>
                    <span className="mst-meta">
                      {tt.pageLabel} {isRTL ? toHindi(q.page) : q.page}
                    </span>
                    <span className="mst-meta">
                      {tt.hizbLabel} {isRTL ? toHindi(Math.ceil(q.page / 4)) : Math.ceil(q.page / 4)}
                    </span>
                    {siblings.length > 0 && (
                      <span className="mst-similar-badge">
                        🔗 {siblings.length}
                      </span>
                    )}
                  </div>

                  {toolbarVerses.length > 0 && (
                    <div className="mst-inline-chips">
                      {toolbarVerses.map((tv, ti) => (
                        <button
                          key={ti}
                          className={`mst-inline-chip ${
                            selectedVerseIdx === ti ? "active-chip" : ""
                          }`}
                          onClick={() => {
                            console.log("Chip clicked:", ti, toolbarVerses[ti]);

                            setSelectedVerseIdx(ti);
                            if (!showContext) setShowContext(true);
                          }}
                        >
                          <span className="mst-chip-surah">
                            {isRTL ? (
                              <>
                                <span lang="ar" dir="rtl">{tv.suraNameAr}</span>
                                {tv.suraName && <span dir="ltr"> · {tv.suraName}</span>}
                              </>
                            ) : (
                              <>
                                {tv.suraName && <span>{tv.suraName}</span>}
                                <span lang="ar" dir="rtl"> · {tv.suraNameAr}</span>
                              </>
                            )}
                          </span>
                          <span className="mst-chip-meta">
                            {tt.ayahLabel} {isRTL ? toHindi(tv.aya) : tv.aya} · {tt.pageLabel}{" "}
                            {isRTL ? toHindi(tv.page) : tv.page}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mst-card-body">
                <div className="mst-card-main">
                  {/* Action buttons – always visible */}
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
                      className="mst-btn mst-context"
                      onClick={handleToggleContext}
                    >
                      {tt.context}
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
                    <button
                      className="mst-btn mst-recite"
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

                      {answered && (
                        <div
                          className={`mst-result ${
                            correct ? "correct" : skipped ? "skipped" : "wrong"
                          }`}
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
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Context Viewer – fills remaining space */}
            {showContext && (
              <div className="mst-context-viewer">
                <MushafContextViewer
                  key={selectedVerseIdx} // ← forces re‑mount when selected verse changes
                  verse={toolbarVerses[selectedVerseIdx]}
                  snippet={q.sharedPhraseRaw}
                  hiddenPortion={toolbarVerses[selectedVerseIdx].hiddenPortion}
                  hintLevel={hintLevel}
                  showAnswer={answered && selectedVerseIdx === 0}
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

export default MutashabihatTest;
