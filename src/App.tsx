import React, { useEffect, useState } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect, useHistory } from "react-router-dom";
import { initMetadata } from "./app/core/services/data/metadata.service";
import {
  preloadAllPages,
  seedTextCorpus,
} from "./app/core/services/data/quran.service";
import { preloadAllPageFonts } from "./app/core/services/api/font.loader";
import { Capacitor } from "@capacitor/core";

import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

import "./App.css";

import Home from "./app/features/home/pages/Home";
import Azkar from "./app/features/azkar/Azkar";
import PageViewer from "./app/features/viewer/PageViewer";
import SurahJuzSelection from "./app/features/viewer/pages/SurahJuzSelection";
import Search from "./app/features/viewer/pages/Search";
import SearchResults from "./app/features/viewer/pages/SearchResults";
import QuizList from "./app/features/quiz/pages/quiz-list/QuizList";
import AkmelAlAyahSetup from "./app/features/quiz/quizzes/akmel-alayah/pages/setup/AkmelAlAyahSetup";
import AkmelAlAyah from "./app/features/quiz/quizzes/akmel-alayah/pages/test/AkmelAlAyah";
import MutashabihatSetup from "./app/features/quiz/quizzes/mutashabihat/pages/setup/MutashabihatSetup";
import MutashabihatTest from "./app/features/quiz/quizzes/mutashabihat/pages/test/MutashabihatTest";
import Settings from "app/features/settings/Settings";
import PlaybackSettings from "./app/features/playback/PlaybackSettings";
import Account from "./app/features/account/Account";
import Bookmarks from "./app/features/bookmarks/Bookmarks";

import { ThemeProvider } from "./app/core/context/ThemeContext";
import { LanguageProvider } from "./app/core/context/LanguageContext";
import { VerseVisibilityProvider } from "./app/core/context/VerseVisibilityContext";
import { PlaybackProvider } from "./app/core/context/PlaybackContext";
import AuthCallback from "./app/core/services/auth/AuthCallback";
import { exchangeCodeForToken } from "./app/core/services/auth/oauth.service";

setupIonicReact({ mode: "md" });

const App: React.FC = () => {
  const [metaReady, setMetaReady] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState({
    done: 0,
    total: 604,
  });

  const history = useHistory();

  useEffect(() => {
    // Seed Quran text corpus (works offline from bundled JSON)
    seedTextCorpus().catch(() => {});

    // Quick network check to avoid long timeouts when offline
    const networkOk = navigator.onLine;

    if (!networkOk) {
      // Skip API preloads entirely – metadata will load from IDB
      initMetadata()
        .then(() => setMetaReady(true))
        .catch(() => setMetaReady(true));
      return;
    }

    // Online path: init metadata, then preload pages and fonts
    initMetadata()
      .then(() => {
        setMetaReady(true);
        // Start page preload
        preloadAllPages((done, total) => {
          setPreloadProgress({ done, total });
        });
        // Start font preload in background (doesn't block UI)
        preloadAllPageFonts().catch(() => {});
      })
      .catch((err) => {
        console.error("Metadata init failed:", err);
        setMetaReady(true);
      });
  }, []);

  // appUrlOpen listener (unchanged)
  useEffect(() => {
    if (Capacitor.getPlatform() === "web") return;

    const handleUrlOpen = async (data: any) => {
      const url = new URL(data.url);
      const code = url.searchParams.get("code");
      if (code) {
        await exchangeCodeForToken(code);
        history.replace("/account");
      }
    };

    const app = Capacitor.Plugins?.App as any;
    if (app?.addListener) {
      app.addListener("appUrlOpen", handleUrlOpen);
      return () => app.removeListener("appUrlOpen", handleUrlOpen);
    }
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
          <PlaybackProvider>
            <IonApp>
              {preloadProgress.done < preloadProgress.total && (
                <div className="global-preload-bar">
                  <div
                    className="global-preload-fill"
                    style={{
                      width: `${
                        (preloadProgress.done / preloadProgress.total) * 100
                      }%`,
                    }}
                  />
                </div>
              )}
              <IonReactRouter>
                <IonRouterOutlet id="main">
                  <Route exact path="/" component={Home} />
                  <Route exact path="/auth/callback" component={AuthCallback} />
                  <Route exact path="/viewer" component={PageViewer} />
                  <Route
                    exact
                    path="/surah-juz"
                    component={SurahJuzSelection}
                  />
                  <Route exact path="/search" component={Search} />
                  <Route
                    exact
                    path="/search/results"
                    component={SearchResults}
                  />
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
                  <Route exact path="/account" component={Account} />
                  <Route exact path="/bookmarks" component={Bookmarks} />
                  <Route exact path="/settings" component={Settings} />
                  <Route exact path="/playback" component={PlaybackSettings} />
                  <Redirect exact from="/home" to="/" />
                </IonRouterOutlet>
              </IonReactRouter>
            </IonApp>
          </PlaybackProvider>
        </VerseVisibilityProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
