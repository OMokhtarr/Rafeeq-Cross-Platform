import React, { useEffect, useState } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect } from "react-router-dom";
import { initMetadata } from "./app/core/services/data/metadata.service";
import { preloadAllPages } from "./app/core/services/data/quran.service";

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
import PlaybackSettings from "./app/features/playback/PlaybackSettings";

// App-wide context
import { ThemeProvider } from "./app/core/context/ThemeContext";
import { LanguageProvider } from "./app/core/context/LanguageContext";
import { VerseVisibilityProvider } from "./app/core/context/VerseVisibilityContext";

setupIonicReact({ mode: "md" });

const App: React.FC = () => {
  const [metaReady, setMetaReady] = useState(false);

  // inside the component
  useEffect(() => {
    initMetadata()
      .then(() => {
        setMetaReady(true);
        // Fire background preload (non‑blocking)
        preloadAllPages((done, total) => {
          // Optional: update a global progress state if you want to show a tiny loader
          console.debug(`Preloaded page ${done}/${total}`);
        });
      })
      .catch((err) => {
        console.error("Metadata init failed:", err);
        setMetaReady(true);
        // Still try to preload (will use cache if available)
        preloadAllPages();
      });
  }, []);

  if (!metaReady) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-app, #0d1f14)",
          color: "var(--color-text-primary, #e8e8e8)",
          fontFamily: "var(--font-arabic, 'Scheherazade New', serif)",
          fontSize: "1.2rem",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(212,180,140,0.3)",
              borderTopColor: "#d4b48c",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <span>جاري التحميل…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

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
                <Route exact path="/playback" component={PlaybackSettings} />
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
