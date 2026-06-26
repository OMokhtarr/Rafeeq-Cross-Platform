import React, { useEffect, useRef, useState } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect, useLocation } from "react-router-dom";
import { initMetadata } from "./app/core/services/data/metadata.service";
import {
  preloadAllPages,
  seedTextCorpus,
} from "./app/core/services/data/quran.service";
import { preloadAllPageFonts } from "./app/core/services/api/font.loader";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

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
import AkmelAlNehayatSetup from "./app/features/quiz/quizzes/akmel-alnehayat/pages/setup/AkmelAlNehayatSetup";
import AkmelAlNehayat from "./app/features/quiz/quizzes/akmel-alnehayat/pages/test/AkmelAlNehayat";
import Settings from "app/features/settings/Settings";
import PlaybackSettings from "./app/features/playback/PlaybackSettings";
import Account from "./app/features/account/Account";
import Bookmarks from "./app/features/bookmarks/Bookmarks";
import TafsirSettings from "./app/features/tafsir/TafsirSettings";
import Hifz from "./app/features/hifz/Hifz";

import { ThemeProvider } from "./app/core/context/ThemeContext";
import { LanguageProvider } from "./app/core/context/LanguageContext";
import { VerseVisibilityProvider } from "./app/core/context/VerseVisibilityContext";
import { PlaybackProvider } from "./app/core/context/PlaybackContext";
import AuthCallback from "./app/core/services/auth/AuthCallback";
import { exchangeCodeForToken } from "./app/core/services/auth/oauth.service";

setupIonicReact({ mode: "md" });

// Main tab destinations that must never go back: disable the edge swipe-back
// gesture while one of them is the active route, so an accidental edge swipe
// can't pop the user to whatever pushed the tab (e.g. a quiz).
const ROOT_TAB_PATHS = new Set<string>([
  "/",
  "/quiz-list",
  "/azkar",
  "/hifz",
  "/settings",
  "/account",
]);

const MainRouterOutlet: React.FC = () => {
  const location = useLocation();
  // Keep a live ref to whether the *current* route is a root tab. The outlet's
  // swipe handler is created once, so we gate it through this ref rather than
  // re-binding the handler on every navigation.
  const isRootTabRef = useRef(false);
  isRootTabRef.current = ROOT_TAB_PATHS.has(location.pathname);

  useEffect(() => {
    let patched: { canStart: (...a: unknown[]) => boolean } | null = null;
    let original: ((...a: unknown[]) => boolean) | null = null;

    // The outlet's swipeHandler is assigned by IonReactRouter shortly after
    // mount, so poll briefly until it exists, then wrap its canStart to block
    // the gesture while on a root tab page.
    const tryPatch = () => {
      const outlet = document.querySelector(
        "ion-router-outlet#main",
      ) as (HTMLIonRouterOutletElement & {
        swipeHandler?: { canStart: (...a: unknown[]) => boolean };
      }) | null;
      const handler = outlet?.swipeHandler;
      if (!handler || patched) return;
      patched = handler;
      original = handler.canStart.bind(handler);
      handler.canStart = (...args: unknown[]) =>
        isRootTabRef.current ? false : original!(...args);
    };

    tryPatch();
    const interval = patched ? null : window.setInterval(() => {
      tryPatch();
      if (patched && interval) window.clearInterval(interval);
    }, 200);

    return () => {
      if (interval) window.clearInterval(interval);
      if (patched && original) patched.canStart = original;
    };
  }, []);

  return (
    <IonRouterOutlet id="main">
      <Route exact path="/" component={Home} />
      <Route exact path="/auth/callback" component={AuthCallback} />
      <Route exact path="/viewer" component={PageViewer} />
      <Route exact path="/surah-juz" component={SurahJuzSelection} />
      <Route exact path="/search" component={Search} />
      <Route exact path="/search/results" component={SearchResults} />
      <Route exact path="/azkar" component={Azkar} />
      <Route exact path="/azkar/:categoryId" component={Azkar} />
      <Route exact path="/quiz-list" component={QuizList} />
      <Route exact path="/akmel-alayah-setup" component={AkmelAlAyahSetup} />
      <Route exact path="/akmel-alayah" component={AkmelAlAyah} />
      <Route exact path="/mutashabihat-setup" component={MutashabihatSetup} />
      <Route exact path="/mutashabihat-test" component={MutashabihatTest} />
      <Route exact path="/akmel-alnehayat-setup" component={AkmelAlNehayatSetup} />
      <Route exact path="/akmel-alnehayat" component={AkmelAlNehayat} />
      <Route exact path="/hifz" component={Hifz} />
      <Route exact path="/account" component={Account} />
      <Route exact path="/bookmarks" component={Bookmarks} />
      <Route exact path="/settings" component={Settings} />
      <Route exact path="/playback" component={PlaybackSettings} />
      <Route exact path="/tafsir-settings" component={TafsirSettings} />
      <Redirect exact from="/home" to="/" />
    </IonRouterOutlet>
  );
};

const App: React.FC = () => {
  const [preloadProgress, setPreloadProgress] = useState({
    done: 0,
    total: 604,
  });

  useEffect(() => {
    // Seed Quran text corpus (works offline from bundled JSON)
    seedTextCorpus().catch(() => {});

    // Quick network check to avoid long timeouts when offline
    const networkOk = navigator.onLine;

    if (!networkOk) {
      // Skip API preloads entirely – metadata will load from IDB
      initMetadata().catch(() => {});
      return;
    }

    // Online path: init metadata, then preload pages and fonts
    initMetadata()
      .then(() => {
        // Start page preload
        preloadAllPages((done, total) => {
          setPreloadProgress({ done, total });
        });
        // Start font preload in background (doesn't block UI)
        preloadAllPageFonts().catch(() => {});
      })
      .catch((err) => {
        console.error("Metadata init failed:", err);
      });
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() === "web") return;

    let cleanup: (() => void) | undefined;

    CapApp.addListener("appUrlOpen", async (data) => {
      console.log("[appUrlOpen] url:", data.url);
      const raw = data.url;
      const queryStart = raw.indexOf("?");
      const code = queryStart !== -1
        ? new URLSearchParams(raw.slice(queryStart)).get("code")
        : null;
      console.log("[appUrlOpen] code:", code);
      if (code) {
        try {
          await exchangeCodeForToken(code);
          console.log("[appUrlOpen] token exchange success");
          window.location.hash = "/account";
          // Notify Account page (already mounted on native) that tokens are ready
          window.dispatchEvent(new CustomEvent("rafiq_auth_complete"));
        } catch (e) {
          console.error("[appUrlOpen] token exchange failed:", e);
        }
      }
    }).then((handle) => {
      cleanup = () => handle.remove();
    });

    return () => cleanup?.();
  }, []);

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
                <MainRouterOutlet />
              </IonReactRouter>
            </IonApp>
          </PlaybackProvider>
        </VerseVisibilityProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
