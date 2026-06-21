import React, { useState, useEffect, useCallback } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Preferences } from "@capacitor/preferences";
import MushafContextViewer from "../../../../../../shared/components/mushaf-context/MushafContextViewer";
import { toHindiNumbers as toHindi, removeDiacritics } from "../../../../../../core/utils/arabic.util";
import { ensureSeeded } from "../../../../../../core/services/data/quran.service";
import {
  getSurahVersesList,
  getJuzVerses,
  getPageRangeVerses,
  getAllVerses,
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
import "./AkmelAlNehayat.css";

// ── Waqf symbols present in the Quran text data ────────────────────────────
// These are the Unicode characters used for stop signs in the mushaf text.
const WAQF_SYMBOLS = [
  "ۖ", // ۖ  قلى  — preferable stop
  "ۗ", // ۗ  صلي  — preferable continue
  "ۘ", // ۘ  Mim (مـ) mandatory stop in some encodings
  "ۙ", // ۙ  لا   — forbidden stop
  "ۚ", // ۚ  ج    — permissible stop
  "ۛ", // ۛ  Embrace stop (∴)
  "ۜ", // ۜ  End of ayah marker (used as sajdah in some)
  "۝", // ۝  End of ayah number sign
  "۞", // ۞  Hizb marker (not a waqf but sometimes adjacent)
  "۟", // ۟  small circle above (in some encodings)
  "۠", // ۠  small high upright rectangular zero
];

// Regex that matches any waqf symbol
const WAQF_RE = new RegExp(`[${WAQF_SYMBOLS.join("")}]`, "g");

/**
 * Find the last waqf symbol in the text and split there.
 * Returns { displayed, hidden, found } where:
 *   displayed = text up to and NOT including the last waqf symbol
 *   hidden    = text after the last waqf symbol (trimmed)
 *   found     = whether a waqf symbol was actually found
 */
function splitAtLastWaqf(text: string): {
  displayed: string;
  hidden: string;
  found: boolean;
} {
  if (!text) return { displayed: "", hidden: "", found: false };

  let lastIdx = -1;
  let lastLen = 0;
  let match: RegExpExecArray | null;
  WAQF_RE.lastIndex = 0;

  while ((match = WAQF_RE.exec(text)) !== null) {
    lastIdx = match.index;
    lastLen = match[0].length;
  }

  if (lastIdx === -1) {
    // No waqf symbol — fall back to splitting at the midpoint
    const words = text.split(" ");
    const mid = Math.max(2, Math.floor(words.length / 2));
    return {
      displayed: words.slice(0, mid).join(" "),
      hidden: words.slice(mid).join(" "),
      found: false,
    };
  }

  return {
    displayed: text.slice(0, lastIdx).trim(),
    hidden: text.slice(lastIdx + lastLen).trim(),
    found: true,
  };
}

// ── MCQ question shape ──────────────────────────────────────────────────────
interface NehayatQuestion extends QuizQuestion {
  options: string[]; // 4 shuffled choices
  correctIndex: number; // index into options that is correct
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Common Arabic particles that appear in almost every verse — excluded from
// the shared-word score so they don't make unrelated endings look similar.
const STOP_WORDS = new Set([
  "في", "من", "على", "إن", "و", "ا", "ان", "وا", "ما", "لا", "هو", "هي",
  "هم", "ان", "أن", "عن", "إلى", "الى", "عند", "قد", "كان", "لم", "لن",
  "ثم", "أو", "او", "بل", "قل", "وقل", "كل", "وكل", "به", "بها", "بهم",
  "له", "لها", "لهم", "فإن", "فان", "إذ", "إذا", "اذا", "حتى", "حتي",
]);

/**
 * Score a candidate ending against the correct answer.
 * Returns a score where higher = more similar / better distractor.
 *   - Shared content words (after stripping diacritics) contribute +10 each.
 *   - Word-count closeness contributes 0–3 bonus points.
 *   - Score of 0 means no content-word overlap (word-count fallback still used).
 */
function scoreDistractor(candidate: string, correct: string): number {
  const correctWords = removeDiacritics(correct).split(/\s+/).filter(Boolean);
  const candidateWords = removeDiacritics(candidate).split(/\s+/).filter(Boolean);
  const correctSet = new Set(correctWords);

  let shared = 0;
  for (const w of candidateWords) {
    if (!STOP_WORDS.has(w) && correctSet.has(w)) shared++;
  }

  const lenDiff = Math.abs(candidateWords.length - correctWords.length);
  const lenScore = Math.max(0, 3 - lenDiff);

  return shared * 10 + lenScore;
}

/**
 * Build one MCQ question from a verse + a mushaf-wide distractor pool.
 * Only endings that share at least one content word (root match) with the
 * correct answer are used as distractors. We pick from the top 4 scored
 * candidates, shuffled for variety across runs.
 */
function buildQuestion(verse: any, pool: any[]): NehayatQuestion {
  const { displayed, hidden } = splitAtLastWaqf(verse.text);

  // Score every candidate ending in the pool
  const seen = new Set<string>([hidden]);
  const scored: { text: string; score: number }[] = [];

  for (const candidate of pool) {
    if (candidate.sura === verse.sura && candidate.aya === verse.aya) continue;
    const { hidden: ch } = splitAtLastWaqf(candidate.text);
    if (!ch || seen.has(ch)) continue;
    seen.add(ch);

    const s = scoreDistractor(ch, hidden);
    // Only keep candidates with at least one shared content word
    if (s >= 10) scored.push({ text: ch, score: s });
  }

  // Sort by score desc, take the top 4, shuffle for variety, pick 3
  scored.sort((a, b) => b.score - a.score);
  const distractors = shuffleArray(scored.slice(0, 4))
    .slice(0, 3)
    .map((c) => c.text);

  while (distractors.length < 3) distractors.push("…");

  const optionsRaw = shuffleArray([hidden, ...distractors]);
  const correctIndex = optionsRaw.indexOf(hidden);

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
    splitMethod: "lastWaqf",
    previousVersesContext: [],
    nextVersesForProgression: [],
    correctAnswer: hidden,
    difficulty: "medium",
    versePart: displayed,
    options: optionsRaw,
    correctIndex,
  };
}

// ── Sound helper ────────────────────────────────────────────────────────────
const SETTINGS_KEY = "rafiq_settings_v1";
function isSoundOn(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw).soundEffects !== false;
  } catch {}
  return true;
}

// ── Component ───────────────────────────────────────────────────────────────
const AkmelAlNehayat: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tt = t.quizTest;

  const [questions, setQuestions] = useState<NehayatQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState(0);

  const beep = useFeedbackBeep();
  useWakeLock();
  const { showAll: showAllVerses } = useVerseVisibility();

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

        const { value } = await Preferences.get({ key: "akmelAlNehayatConfig" });
        if (!value) {
          setError(tt.errorNoConfig);
          setLoading(false);
          return;
        }

        const config: QuizConfig = JSON.parse(value);
        await ensureSeeded();

        // Fetch scoped verses (for questions) and full mushaf (for distractors) in parallel
        const scopePromise = (async () => {
          if (config.type === "surah" && config.surah)
            return getSurahVersesList(config.surah);
          if (config.type === "juz")
            return getJuzVerses(config.juzs);
          if (config.type === "page" && config.pageFrom != null && config.pageTo != null)
            return getPageRangeVerses(config.pageFrom, config.pageTo);
          return [] as any[];
        })();

        const [allVerses, fullMushaf] = await Promise.all([
          scopePromise,
          getAllVerses(),
        ]);

        if (cancelled) return;

        if (allVerses.length === 0) {
          setError(tt.errorNoVerses);
          setLoading(false);
          return;
        }

        // Only use verses whose ending (after last waqf) is ≤7 words
        const eligible = allVerses.filter((v) => {
          const { hidden } = splitAtLastWaqf(v.text);
          return hidden.split(/\s+/).filter(Boolean).length <= 7;
        });

        if (eligible.length === 0) {
          setError(tt.errorNoVerses);
          setLoading(false);
          return;
        }

        const count = Math.min(config.questionCount, eligible.length);
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, count);

        // Use the full mushaf as distractor pool for best similarity matching
        const distractorPool = fullMushaf.length > 0 ? fullMushaf : allVerses;
        const built = chosen.map((v) => buildQuestion(v, distractorPool));

        if (!cancelled) {
          setQuestions(built);
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
    return () => { cancelled = true; };
  }, []);

  const q = questions[idx];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (optionIdx: number) => {
      if (answered || !q) return;
      setSelectedOption(optionIdx);
      const isCorrect = optionIdx === q.correctIndex;
      setCorrect(isCorrect);
      setAnswered(true);
      if (isCorrect) setScore((s) => s + 1);
      if (isSoundOn()) beep(isCorrect ? "correct" : "wrong");
    },
    [answered, q, beep],
  );

  const handleSkip = () => {
    if (answered || !q) return;
    setSkipped(true);
    setAnswered(true);
    setCorrect(false);
    if (isSoundOn()) beep("wrong");
    setShowContext(false);
  };

  const handleNext = () => {
    if (idx + 1 < questions.length) {
      setIdx((i) => i + 1);
      setSelectedOption(null);
      setAnswered(false);
      setCorrect(false);
      setSkipped(false);
      setShowContext(false);
    } else {
      setQuizComplete(true);
    }
  };

  const handleExit = () => setShowExitModal(true);
  const handleToggleContext = () => setShowContext((prev) => !prev);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <IonPage>
        <IonContent>
          <div className="an-test-page-wrapper">
            <div className="an-loading">
              <div className="an-spinner"></div>
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
          <div className="an-test-page-wrapper">
            <div className="an-error">
              <div className="an-error-box">
                <p>{error}</p>
                <button onClick={() => history.push("/akmel-alnehayat-setup")}>
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
          <div className="an-test-page-wrapper">
            <div className="an-complete">
              <div className="an-complete-card">
                <h2>{tt.completeTitle}</h2>
                <p className="an-complete-sub">Akmel Al-Nehayat Quiz Complete</p>
                <div className="an-score-ring">
                  <span className="an-score-num">{score}</span>
                  <span className="an-score-sep">/</span>
                  <span className="an-score-total">{questions.length}</span>
                </div>
                <p className="an-score-pct">{pct}%</p>
                <div className="an-complete-actions">
                  <button onClick={() => history.push("/akmel-alnehayat-setup")}>
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

  const immersiveMode = showContext;

  // ── Main quiz render ───────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent>
        <div className="an-test-page-wrapper">
          <div className="an-container">
            {/* Header */}
            <div className={`an-header ${immersiveMode ? "an-header-minimal" : ""}`}>
              <div className="an-progress">
                <span className="an-progress-text">
                  {tt.questionOf} {isRTL ? toHindi(idx + 1) : idx + 1} /{" "}
                  {isRTL ? toHindi(questions.length) : questions.length}
                </span>
                <div className="an-bar">
                  <div
                    className="an-bar-fill"
                    style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="an-score-pill">
                {tt.score}: {score}
              </div>
              <div className="an-header-actions">
                <button className="an-exit-btn" onClick={handleExit} aria-label={tt.exit}>
                  ✕
                </button>
              </div>
            </div>

            {/* Question card */}
            <div className={`an-card ${immersiveMode ? "an-card-buttons-only" : ""}`}>
              {/* Info strip */}
              {!immersiveMode && (
                <div className="an-info-strip">
                  <span className="an-surah-badge">
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
                  <span className="an-meta">
                    {tt.ayahLabel} {isRTL ? toHindi(q.aya) : q.aya}
                  </span>
                  <span className="an-meta">
                    {tt.pageLabel} {isRTL ? toHindi(q.page) : q.page}
                  </span>
                  <span className="an-meta">
                    {tt.hizbLabel} {isRTL ? toHindi(Math.ceil(q.page / 4)) : Math.ceil(q.page / 4)}
                  </span>
                </div>
              )}

              <div className="an-card-body">
                <div className="an-card-main">
                  {/* Action buttons */}
                  <div className="an-actions">
                    <button className="an-btn an-context" onClick={handleToggleContext}>
                      {tt.context}
                    </button>
                    <button
                      className="an-btn an-skip"
                      onClick={handleSkip}
                      disabled={answered}
                    >
                      {tt.skip}
                    </button>
                  </div>

                  {/* Full content */}
                  {!immersiveMode && (
                    <>
                      {/* Verse display */}
                      <div className="an-verse-box">
                        <p className="an-verse-text" lang="ar" dir="rtl">
                          {q.displayedPortion}
                        </p>
                        <span className="an-verse-ellipsis" lang="ar" dir="rtl">…</span>
                      </div>

                      {/* MCQ options */}
                      <div className="an-options" dir="rtl">
                        {q.options.map((opt, i) => {
                          let cls = "an-option";
                          if (answered) {
                            if (i === q.correctIndex) cls += " correct";
                            else if (i === selectedOption) cls += " wrong";
                            else cls += " dimmed";
                          } else if (selectedOption === i) {
                            cls += " selected";
                          }
                          return (
                            <button
                              key={i}
                              className={cls}
                              onClick={() => handleSelect(i)}
                              disabled={answered}
                              lang="ar"
                              dir="rtl"
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {/* Result */}
                      {answered && (
                        <div
                          className={`an-result ${
                            correct ? "correct" : skipped ? "skipped" : "wrong"
                          }`}
                        >
                          <span className="an-result-icon">
                            {correct ? "✅" : skipped ? "⏭" : "❌"}
                          </span>
                          <span className="an-result-text">
                            {correct
                              ? tt.correctMsg
                              : skipped
                              ? tt.skippedMsg
                              : tt.wrongMsg}
                          </span>
                        </div>
                      )}

                      {answered && (
                        <button className="an-next-btn" onClick={handleNext}>
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

            {/* Context viewer */}
            {showContext && (
              <div className="an-context-viewer">
                <MushafContextViewer
                  verse={{
                    sura: q.sura,
                    aya: q.aya,
                    text: q.fullText,
                    page: q.page,
                    suraName: q.suraName,
                    suraNameAr: q.suraNameAr,
                  }}
                  snippet={q.displayedPortion}
                  hiddenPortion={q.hiddenPortion}
                  hintLevel={0}
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

export default AkmelAlNehayat;
