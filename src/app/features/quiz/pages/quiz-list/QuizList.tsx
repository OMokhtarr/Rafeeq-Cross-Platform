/**
 * QUIZ LIST PAGE
 * Entry point for all quizzes. Each card navigates to its own setup page.
 */

import React from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../../../core/context/LanguageContext";
import BottomNavBar from "../../../../shared/components/bottom-nav/BottomNavBar";
import "./QuizList.css";

interface QuizEntry {
  id: "akmel-alayah" | "mutashabihat" | "akmel-alnehayat";
  route: string;
}

const QUIZZES: QuizEntry[] = [
  { id: "akmel-alayah", route: "/akmel-alayah-setup" },
  { id: "mutashabihat", route: "/mutashabihat-setup" },
  { id: "akmel-alnehayat", route: "/akmel-alnehayat-setup" },
];

const QuizList: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tql = t.quizList;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ql-page-wrapper">
          {/* ── Header ── */}
          <div className="ql-header">
            <div className="ql-header-text" dir={isRTL ? "rtl" : "ltr"}>
              <h1 className="ql-title">{tql.titleHeader}</h1>
            </div>
          </div>

          {/* ── Quiz cards ── */}
          <div className="ql-container" dir={isRTL ? "rtl" : "ltr"}>
            {QUIZZES.map((quiz) => {
              const title =
                quiz.id === "akmel-alayah"
                  ? tql.akmelTitle
                  : quiz.id === "mutashabihat"
                  ? tql.mutashabihatTitle
                  : tql.nehayatTitle;
              const desc =
                quiz.id === "akmel-alayah"
                  ? tql.akmelDesc
                  : quiz.id === "mutashabihat"
                  ? tql.mutashabihatDesc
                  : tql.nehayatDesc;
              return (
                <button
                  key={quiz.id}
                  className="ql-card"
                  dir={isRTL ? "rtl" : "ltr"}
                  onClick={() => history.push(quiz.route)}
                >
                  <div className="ql-card-body">
                    <h2 className="ql-card-name">{title}</h2>
                    <p className="ql-card-desc-ar">{desc}</p>
                  </div>
                  <div className="ql-card-arrow" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {isRTL
                        ? <path d="M19 12H5M12 19l-7-7 7-7" />
                        : <path d="M5 12h14M12 5l7 7-7 7" />}
                    </svg>
                  </div>
                </button>
              );
            })}
            <div className="ql-bottom-spacer" />
          </div>
        </div>
      </IonContent>
      <BottomNavBar active="quiz" fixed />
    </IonPage>
  );
};

export default QuizList;
