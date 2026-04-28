/**
 * APP.TSX
 *
 * Routes:
 *   /                     → Home (Basmalah-centric entry, replaces splash)
 *   /viewer               → Mushaf page viewer
 *   /surah-juz            → Surah / Juz quick navigation (from viewer hamburger)
 *   /azkar                → Azkar
 *   /quiz-list            → Quiz catalogue
 *   /akmel-alayah-setup   → Akmel Al-Ayah setup
 *   /akmel-alayah         → Akmel Al-Ayah test runner
 *   /mutashabihat-setup   → Mutashabihat setup
 *   /mutashabihat-test    → Mutashabihat test runner
 *   /settings             → App settings
 */

import React, { useEffect } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect } from "react-router-dom";

// Core Ionic CSS
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

import "./App.css";

// Feature pages
import Home from "./app/features/home/pages/Home";
import Azkar from "./app/features/azkar/Azkar";
import PageViewer from "./app/features/viewer/PageViewer";
import SurahJuzSelection from "./app/features/viewer/pages/SurahJuzSelection";
import QuizList from "./app/features/quiz/pages/quiz-list/QuizList";
import AkmelAlAyahSetup from "./app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup";
import AkmelAlAyah from "./app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah";
import MutashabihatSetup from "./app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup";
import MutashabihatTest from "./app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest";
import Settings from "app/features/settings/Settings";

// Data seeding
import { ensureSeeded } from "./app/core/services/data/quran.service";

// App-wide context
import { ThemeProvider } from "./app/core/context/ThemeContext";
import { LanguageProvider } from "./app/core/context/LanguageContext";
import { VerseVisibilityProvider } from "./app/core/context/VerseVisibilityContext";

setupIonicReact({ mode: "md" });

const App: React.FC = () => {
  useEffect(() => {
    ensureSeeded().catch((err) =>
      console.error("[App] IDB seeding failed:", err),
    );
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <VerseVisibilityProvider>
          <IonApp>
            <IonReactRouter>
            <IonRouterOutlet id="main">
              <Route exact path="/" component={Home} />
              <Route exact path="/viewer" component={PageViewer} />
              <Route exact path="/surah-juz" component={SurahJuzSelection} />
              <Route exact path="/azkar" component={Azkar} />
              <Route exact path="/quiz-list" component={QuizList} />
              <Route
                exact
                path="/akmel-alayah-setup"
                component={AkmelAlAyahSetup}
              />
              <Route exact path="/akmel-alayah" component={AkmelAlAyah} />
              <Route
                exact
                path="/mutashabihat-setup"
                component={MutashabihatSetup}
              />
              <Route
                exact
                path="/mutashabihat-test"
                component={MutashabihatTest}
              />
              <Route exact path="/settings" component={Settings} />
              <Redirect exact from="/home" to="/" />
            </IonRouterOutlet>
            </IonReactRouter>
          </IonApp>
        </VerseVisibilityProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
