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
import { isNetworkReachable } from "./app/core/services/api/network.service";
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

setupIonicReact({ mode: "md" });

// Main tab destinations that must never go back: disable the edge swipe-back
// gesture while one of them is the active route, so an accidental edge swipe
// can't pop the user to whatever pushed the tab (e.g. a quiz).
const ROOT_TAB_PATHS = new Set<string>([
  "/",
  "/viewer",
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
  // Only true once a preload is genuinely under way, so the progress bar is
  // never left stranded at 0% on an offline launch where it never starts.
  const [preloading, setPreloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Seed Quran text corpus (works offline from bundled JSON)
      seedTextCorpus().catch(() => {});

      // Metadata is cache-first and falls back to static page starts, so it is
      // safe to start regardless of connectivity.
      initMetadata().catch(() => {});

      // Only the *preloads* need the network. navigator.onLine can't be trusted
      // when true (WiFi with no internet, captive portals and dead mobile data
      // all report online), so verify with a short probe before committing to
      // 604 pages of fetches. Offline, this costs ~2 s in the background and
      // never blocks the UI.
      const online = await isNetworkReachable();
      if (cancelled || !online) return;

      // Start page preload
      setPreloading(true);
      preloadAllPages((done, total) => {
        if (!cancelled) setPreloadProgress({ done, total });
      });
      // Start font preload in background (doesn't block UI)
      preloadAllPageFonts().catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <VerseVisibilityProvider>
          <PlaybackProvider>
            <IonApp>
              {preloading && preloadProgress.done < preloadProgress.total && (
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
