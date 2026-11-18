/**
 * QUIZ LIST PAGE
 * Entry point for all quizzes. Each card navigates to its own setup page.
 * A quiz left in progress shows as a "continue" card above them.
 */

import React, { useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../../../core/context/LanguageContext";
import { toHindiNumbers } from "../../../../core/utils/arabic.util";
import BottomNavBar from "../../../../shared/components/bottom-nav/BottomNavBar";
import QuizExitModal from "../../components/QuizExitModal";
import { readQuizPrefill, quizPrefillQuery } from "../../quiz-prefill";
import { peekQuizSession, useActiveQuizKind, QuizKind } from "../../quiz-session";
import { usePageTour } from "../../../onboarding/usePageTour";
import { tourAttr } from "../../../onboarding/tourCatalog";
import "./QuizList.css";

interface QuizEntry {
  id: QuizKind;
  route: string;
}

const QUIZZES: QuizEntry[] = [
  { id: "akmel-alayah", route: "/akmel-alayah-setup" },
  { id: "mutashabihat", route: "/mutashabihat-setup" },
  { id: "akmel-alnehayat", route: "/akmel-alnehayat-setup" },
];

const ArrowIcon: React.FC<{ isRTL: boolean }> = ({ isRTL }) => (
  <div className="ql-card-arrow" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {isRTL
        ? <path d="M19 12H5M12 19l-7-7 7-7" />
        : <path d="M5 12h14M12 5l7 7-7 7" />}
    </svg>
  </div>
);

const QuizList: React.FC = () => {
  usePageTour(["quizList"]);
  const history = useHistory();
  const location = useLocation();
  const { t, isRTL } = useLang();
  const tql = t.quizList;

  // When the user arrived here from a completed Hifz session, carry its page
  // range on to whichever quiz setup they pick so it's pre-filled there.
  const prefill = readQuizPrefill(location.search);
  const prefillQuery = prefill ? quizPrefillQuery(prefill) : "";

  // Subscribing re-renders this page when a session starts or ends.
  const activeKind = useActiveQuizKind();
  const session = activeKind ? peekQuizSession() : null;
  // Setup route the user picked while a quiz is in progress (awaiting confirm).
  const [pendingSetup, setPendingSetup] = useState<string | null>(null);

  const titleOf = (id: QuizKind) =>
    id === "akmel-alayah"
      ? tql.akmelTitle
      : id === "mutashabihat"
      ? tql.mutashabihatTitle
      : tql.nehayatTitle;
  const descOf = (id: QuizKind) =>
    id === "akmel-alayah"
      ? tql.akmelDesc
      : id === "mutashabihat"
      ? tql.mutashabihatDesc
      : tql.nehayatDesc;
  const num = (n: number) => (isRTL ? toHindiNumbers(n) : String(n));

  const openSetup = (route: string) => {
    // The old quiz is only discarded once the new one actually starts (the
    // setup page's Start), so backing out of setup still keeps it.
    if (session) setPendingSetup(route);
    else history.push(route);
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ql-page-wrapper">
          {/* ── Quiz cards ── */}
          <div className="ql-container" dir={isRTL ? "rtl" : "ltr"}>
            {session && (
              <button
                className="ql-card ql-resume"
                dir={isRTL ? "rtl" : "ltr"}
                onClick={() => history.replace(session.route)}
              >
                <div className="ql-card-body">
                  <h2 className="ql-card-name">{tql.resumeTitle}</h2>
                  <p className="ql-card-desc-ar">{titleOf(session.kind)}</p>
                  <div className="ql-resume-progress">
                    <div className="ql-resume-bar" aria-hidden="true">
                      <div
                        className="ql-resume-fill"
                        style={{ width: `${((session.idx + 1) / session.total) * 100}%` }}
                      />
                    </div>
                    <span className="ql-resume-count">
                      {tql.resumeProgress
                        .replace("{n}", num(session.idx + 1))
                        .replace("{total}", num(session.total))}
                    </span>
                  </div>
                </div>
                <ArrowIcon isRTL={isRTL} />
              </button>
            )}
            {QUIZZES.map((quiz) => (
              <button
                key={quiz.id}
                {...tourAttr(quiz.id === "akmel-alayah" ? "quizList.ayah" : quiz.id === "mutashabihat" ? "quizList.mutashabihat" : "quizList.nehayat")}
                className="ql-card"
                dir={isRTL ? "rtl" : "ltr"}
                onClick={() => openSetup(quiz.route + prefillQuery)}
              >
                <div className="ql-card-body">
                  <h2 className="ql-card-name">{titleOf(quiz.id)}</h2>
                  <p className="ql-card-desc-ar">{descOf(quiz.id)}</p>
                </div>
                <ArrowIcon isRTL={isRTL} />
              </button>
            ))}
            <div className="ql-bottom-spacer" />
          </div>
          <QuizExitModal
            isOpen={pendingSetup !== null}
            message={tql.replaceConfirm}
            confirmLabel={tql.replaceStart}
            cancelLabel={tql.replaceCancel}
            onCancel={() => setPendingSetup(null)}
            onConfirm={() => {
              const route = pendingSetup;
              setPendingSetup(null);
              if (route) history.push(route);
            }}
          />
        </div>
      </IonContent>
      <BottomNavBar active="quiz" fixed />
    </IonPage>
  );
};

export default QuizList;
