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
  id: "akmel-alayah" | "mutashabihat";
  route: string;
  color: string;
}

const QUIZZES: QuizEntry[] = [
  {
    id: "akmel-alayah",
    route: "/akmel-alayah-setup",
    color: "var(--color-quran)",
  },
  {
    id: "mutashabihat",
    route: "/mutashabihat-setup",
    color: "var(--color-quiz)",
  },
];

const QuizList: React.FC = () => {
  const history = useHistory();
  const { t, isRTL } = useLang();
  const tql = t.quizList;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ql-page-wrapper">
          <div className="ql-container">
            <div className="ql-header" dir={isRTL ? "rtl" : "ltr"}>
              <h1 className="ql-title">{tql.titleHeader}</h1>
            </div>

            <div className="ql-grid">
              {QUIZZES.map((quiz) => {
                const title = quiz.id === "akmel-alayah" ? tql.akmelTitle : tql.mutashabihatTitle;
                const desc = quiz.id === "akmel-alayah" ? tql.akmelDesc : tql.mutashabihatDesc;
                return (
                  <button
                    key={quiz.id}
                    className="ql-card"
                    style={
                      { "--card-accent": quiz.color } as React.CSSProperties
                    }
                    onClick={() => history.push(quiz.route)}
                  >
                    <div className="ql-card-body" dir={isRTL ? "rtl" : "ltr"}>
                      <h2 className="ql-card-name">{title}</h2>
                      <p className="ql-card-desc-ar">{desc}</p>
                    </div>
                    <span className="ql-card-arrow">{isRTL ? "←" : "→"}</span>
                  </button>
                );
              })}
            </div>

            <button className="ql-back-btn" onClick={() => history.push("/")}>
              {t.quiz.backHome}
            </button>
          </div>
          <BottomNavBar active="quiz" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default QuizList;
