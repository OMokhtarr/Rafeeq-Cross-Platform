import { useCallback, useMemo, useRef } from "react";
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

/** The toast fades slightly before the window closes, so a swipe while it is
 *  still on screen always counts. Equal durations made the boundary a race. */
const TOAST_MS = WINDOW_MS - 400;

export function useDoubleSwipeExit() {
  const [presentToast, dismissToast] = useIonToast();
  const { t } = useLang();
  const armedAt = useRef(0);

  // useIonToast returns a fresh [present, dismiss] array on every render, so
  // anything closing over it directly would change identity every render too —
  // which previously made the reset effect in App.tsx re-run constantly and
  // disarm the first swipe. Route them through refs and keep the returned
  // callbacks stable for the lifetime of the hook.
  const presentRef = useRef(presentToast);
  presentRef.current = presentToast;
  const dismissRef = useRef(dismissToast);
  dismissRef.current = dismissToast;
  const messageRef = useRef(t.exitConfirm);
  messageRef.current = t.exitConfirm;

  /** Call on a back swipe from a page that cannot go back. */
  const attempt = useCallback(() => {
    const now = Date.now();

    if (now - armedAt.current < WINDOW_MS) {
      armedAt.current = 0;
      dismissRef.current();
      // No-op on web, so the browser build degrades to "first swipe only".
      CapApp.exitApp();
      return;
    }

    armedAt.current = now;
    presentRef.current({
      message: messageRef.current,
      duration: TOAST_MS,
      position: "bottom",
      cssClass: "rfq-exit-toast",
    });
  }, []);

  /** Drops the armed state — call when the user navigates elsewhere. */
  const reset = useCallback(() => {
    armedAt.current = 0;
  }, []);

  // Stable object identity: consumers put this in dependency arrays.
  return useMemo(() => ({ attempt, reset }), [attempt, reset]);
}
