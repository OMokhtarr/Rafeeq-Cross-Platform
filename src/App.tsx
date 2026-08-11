import React, { useEffect, useRef, useState } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect, useLocation, useHistory } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { initMetadata } from "./app/core/services/data/metadata.service";
import {
  preloadAllPages,
  seedTextCorpus,
} from "./app/core/services/data/quran.service";
import { preloadAllPageFonts } from "./app/core/services/api/font.loader";
import { isNetworkReachable } from "./app/core/services/api/network.service";
import { useQuizFreezeToasts } from "./app/core/hooks/useFreezeToast";
import { useDoubleSwipeExit } from "./app/core/hooks/useDoubleSwipeExit";
import { closeTopOverlay } from "./app/core/utils/overlay-registry";
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
  // Freeze toasts live here, not on the pages that trigger them: IonRouterOutlet
  // keeps visited pages mounted, so a per-page listener would fire once per page
  // the user had already been to.
  useQuizFreezeToasts();
  const exit = useDoubleSwipeExit();
  // Keep a live ref to whether the *current* route is a root tab. The outlet's
  // swipe handler is created once, so we gate it through this ref rather than
  // re-binding the handler on every navigation.
  const isRootTabRef = useRef(false);
  isRootTabRef.current = ROOT_TAB_PATHS.has(location.pathname);

  // Keep the exit helpers in a ref for the same reason: the patched canStart is
  // installed once, so it must not close over this render's callbacks.
  const exitRef = useRef(exit);
  exitRef.current = exit;

  const history = useHistory();
  const historyRef = useRef(history);
  historyRef.current = history;

  // A swipe that lands on a different route means the user went somewhere
  // rather than exiting, so the armed first swipe should not carry over.
  // Keyed on the path alone and dispatched through the ref: depending on `exit`
  // here would re-run this on every render — including the one the toast itself
  // causes — and disarm the swipe that was just armed.
  useEffect(() => {
    exitRef.current.reset();
  }, [location.pathname]);

  // Android's edge-swipe back and its 3-button Back both arrive here as one
  // event — Ionic's own swipe-back never fires, because swipeBackEnabled
  // defaults to `mode === "ios"` and this app runs in "md". Registering a
  // listener also replaces Capacitor's default (WebView goBack), so this
  // ladder owns the whole back behaviour.
  useEffect(() => {
    const handle = CapApp.addListener("backButton", ({ canGoBack }) => {
      // 1. An open sheet/dialog swallows it.
      if (closeTopOverlay()) return;
      // 2. A main tab has nowhere to go: two in a row exit.
      if (isRootTabRef.current) {
        exitRef.current.attempt();
        return;
      }
      // 3. Anywhere else, go back.
      if (canGoBack) historyRef.current.goBack();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);

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
      // Priority: an open sheet swallows the swipe, then root tabs count it
      // toward exiting, and only otherwise does it fall through to Ionic's
      // real back navigation. Returning false in the first two cases stops
      // Ionic animating a page transition that must not happen.
      handler.canStart = (...args: unknown[]) => {
        if (closeTopOverlay()) return false;
        if (isRootTabRef.current) {
          exitRef.current.attempt();
          return false;
        }
        return original!(...args);
      };
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
