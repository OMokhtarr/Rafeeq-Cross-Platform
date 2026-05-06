/**
 * useImmersiveMode
 *
 * Encapsulates the "tap-to-toggle UI chrome" behaviour for the Mushaf page.
 *
 * Responsibilities:
 *   - Track whether the toolbar / bottom-nav are visible.
 *   - Detect a tap (vs. a swipe) using the same touch coordinates the page-
 *     swipe gesture uses, so the existing page-turn swipe keeps working.
 *   - Skip toggling when the touch originated on an interactive element
 *     (button, input, [role=button], anything tagged data-no-immersive).
 *   - Skip toggling while a text input is focused (on-screen keyboard open).
 *   - Show a brief hint when the chrome hides, auto-fading after 2 s.
 *
 * The hook is intentionally framework-light: it returns the visibility flag,
 * the hint flag, and two helpers (`registerTouchStart`, `maybeToggleOnTap`)
 * that the consumer wires into its existing touch handlers. This way the
 * caller keeps full control over the swipe-distance threshold for page
 * turning while we only own the "is this a tap?" decision.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Movement under this many pixels (Manhattan distance) counts as a tap. */
const TAP_MOVEMENT_THRESHOLD = 40;

export interface ImmersiveMode {
  /** True when toolbar + bottom nav are visible (the default). */
  chromeVisible: boolean;
  /** Show chrome unconditionally (e.g. when opening a drawer). */
  showChrome: () => void;
  /** Hide chrome unconditionally. Rarely needed externally. */
  hideChrome: () => void;
  /**
   * Call from the consumer's touch/click START handler. Records the origin
   * point and the event target so the matching END handler can decide
   * whether the gesture was a tap and whether the target was interactive.
   */
  registerTouchStart: (
    x: number,
    y: number,
    target: EventTarget | null,
  ) => void;
  /**
   * Call from the consumer's touch/click END handler. If the gesture was
   * a short tap on a non-interactive element, toggles the chrome visibility.
   */
  maybeToggleOnTap: (x: number, y: number) => void;
}

/** Walks up the DOM looking for any element that should swallow the tap. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // closest() handles SVG icons inside buttons, spans inside labels, etc.
  return !!target.closest(
    'button, a, input, select, textarea, [role="button"], [role="link"], [contenteditable="true"], [data-no-immersive]',
  );
}

export function useImmersiveMode(): ImmersiveMode {
  const [chromeVisible, setChromeVisible] = useState(true);

  // Touch-origin bookkeeping. Refs (not state) — these change every frame
  // during a drag and we don't want to re-render on each move.
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startTarget = useRef<EventTarget | null>(null);

  // Track whether the on-screen keyboard / a text field is currently focused.
  // While true, we suppress all toggling so typing in the search box can't
  // accidentally hide the toolbar that contains the input.
  const inputFocused = useRef(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        inputFocused.current = true;
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        inputFocused.current = false;
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
  }, []);

  const hideChrome = useCallback(() => {
    setChromeVisible(false);
  }, []);

  const registerTouchStart = useCallback(
    (x: number, y: number, target: EventTarget | null) => {
      startX.current = x;
      startY.current = y;
      startTarget.current = target;
    },
    [],
  );

  const maybeToggleOnTap = useCallback((x: number, y: number) => {
    const sx = startX.current;
    const sy = startY.current;
    const target = startTarget.current;
    // Always reset bookkeeping, even if we bail out.
    startX.current = null;
    startY.current = null;
    startTarget.current = null;

    if (sx === null || sy === null) return;
    if (inputFocused.current) return;
    if (isInteractiveTarget(target)) return;

    const dx = Math.abs(x - sx);
    const dy = Math.abs(y - sy);
    if (dx > TAP_MOVEMENT_THRESHOLD || dy > TAP_MOVEMENT_THRESHOLD) return;

    setChromeVisible((prev) => !prev);
  }, []);

  return {
    chromeVisible,
    showChrome,
    hideChrome,
    registerTouchStart,
    maybeToggleOnTap,
  };
}
