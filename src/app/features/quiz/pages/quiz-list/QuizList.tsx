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
  {
    id: "akmel-alnehayat",
    route: "/akmel-alnehayat-setup",
    color: "var(--color-gold)",
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
                    style={
                      { "--card-accent": quiz.color } as React.CSSProperties
                    }
                    onClick={() => history.push(quiz.route)}
                  >
                    <div className="ql-card-body" dir={isRTL ? "rtl" : "ltr"}>
                      <h2 className="ql-card-name">{title}</h2>
                      <p className="ql-card-desc-ar">{desc}</p>
                    </div>
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
