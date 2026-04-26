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
  const { t, lang, isRTL } = useLang();
  const tql = t.quizList;

  // For each card show "primary" in current language and "secondary" in the
  // other language, mirroring the dual-line look of the design.
  const labels: Record<QuizEntry["id"], { primary: string; secondary: string; descPrimary: string; descSecondary: string }> = {
    "akmel-alayah": {
      primary: lang === "ar" ? "أكمل الآية" : "Complete the Verse",
      secondary: lang === "ar" ? "Complete the Verse" : "أكمل الآية",
      descPrimary: lang === "ar" ? "تُعرض عليك بداية آية وعليك إكمالها من حفظك" : "Complete the verse from memory",
      descSecondary: lang === "ar" ? "Complete the verse from memory" : "تُعرض عليك بداية آية وعليك إكمالها من حفظك",
    },
    "mutashabihat": {
      primary: lang === "ar" ? "المتشابهات" : "Mutashabihat",
      secondary: lang === "ar" ? "Mutashabihat" : "المتشابهات",
      descPrimary: lang === "ar" ? "ميّز بين الآيات المتشابهة وأكمل الآية الصحيحة" : "Distinguish and complete similar-opening verses",
      descSecondary: lang === "ar" ? "Distinguish and complete similar-opening verses" : "ميّز بين الآيات المتشابهة وأكمل الآية الصحيحة",
    },
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="ql-page-wrapper">
          <div className="ql-container">
            <div className="ql-header" dir={isRTL ? "rtl" : "ltr"}>
              <h1 className="ql-title">{tql.titleHeader}</h1>
              <p className="ql-subtitle">{tql.subtitleHeader}</p>
            </div>

            <div className="ql-grid">
              {QUIZZES.map((quiz) => {
                const l = labels[quiz.id];
                return (
                  <button
                    key={quiz.id}
                    className="ql-card"
                    style={{ "--card-accent": quiz.color } as React.CSSProperties}
                    onClick={() => history.push(quiz.route)}
                  >
                    <div className="ql-card-body" dir={isRTL ? "rtl" : "ltr"}>
                      <h2 className="ql-card-name">{l.primary}</h2>
                      <p className="ql-card-desc-ar">{l.descPrimary}</p>
                      <p className="ql-card-name-en">{l.secondary}</p>
                      <p className="ql-card-desc-en">{l.descSecondary}</p>
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
        </div>
        <BottomNavBar active="quiz" fixed />
      </IonContent>
    </IonPage>
  );
};

export default QuizList;
