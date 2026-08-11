import { useCallback, useRef } from "react";
import { useIonToast } from "@ionic/react";
import { App as CapApp } from "@capacitor/app";
import { useLang } from "../context/LanguageContext";

/**
 * Two back swipes in a row exit the app.
 *
 * Main tab pages have nowhere to go back to, so their edge swipe is blocked
 * (see ROOT_TAB_PATHS in App.tsx). This gives that dead gesture a purpose:
 * the first swipe warns, a second within WINDOW_MS quits.
 *
 * Exposed as `attempt()` so the caller decides when an exit is even a
 * candidate — overlays and non-root routes take priority over exiting.
 */

/** How long the first swipe stays "armed". Matches Android's convention. */
const WINDOW_MS = 2000;

export function useDoubleSwipeExit() {
  const [presentToast, dismissToast] = useIonToast();
  const { t } = useLang();
  const armedAt = useRef(0);

  /** Call on a back swipe from a page that cannot go back. */
  const attempt = useCallback(() => {
    const now = Date.now();

    if (now - armedAt.current < WINDOW_MS) {
      armedAt.current = 0;
      dismissToast();
      // No-op on web, so the browser build degrades to "first swipe only".
      CapApp.exitApp();
      return;
    }

    armedAt.current = now;
    presentToast({
      message: t.exitConfirm,
      duration: WINDOW_MS,
      position: "bottom",
    });
  }, [presentToast, dismissToast, t]);

  /** Drops the armed state — call when the user navigates elsewhere. */
  const reset = useCallback(() => {
    armedAt.current = 0;
  }, []);

  return { attempt, reset };
}
