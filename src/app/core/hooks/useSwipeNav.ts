import { useCallback, useRef } from "react";

/**
 * Horizontal swipe navigation for stepping through a list of items.
 *
 * Returns props to spread on the swipe area. The gesture only commits once the
 * finger has moved further horizontally than vertically, so a mostly-vertical
 * drag is handed back to whatever owns that axis — an enclosing scroller, or
 * the sheet's own drag-to-dismiss — and never fires a navigation.
 *
 * Direction is reported in reading order, not screen order: `onForward` means
 * "the next item". In RTL the next item lives to the *left*, so callers pass
 * `rtl` and the hook flips the axis for them.
 */

interface SwipeNavOptions {
  /** Advance to the next item (the following ayah). */
  onForward: () => void;
  /** Go back to the previous item. */
  onBack: () => void;
  /** Reading direction — flips which screen direction counts as forward. */
  rtl?: boolean;
  /** Horizontal distance, in px, past which a release navigates. */
  threshold?: number;
}

/** Below this the gesture is ambiguous and we let the scroller keep it. */
const DIRECTION_LOCK = 10;

export function useSwipeNav<T extends HTMLElement = HTMLDivElement>({
  onForward,
  onBack,
  rtl = false,
  threshold = 60,
}: SwipeNavOptions) {
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  // null = undecided, true = horizontal (ours), false = vertical (the scroller's)
  const isHorizontal = useRef<boolean | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    // Ignore multi-touch (pinch-zoom) and secondary mouse buttons.
    if (!e.isPrimary) return;
    // Let interactive children (the prev/next buttons sharing this row) keep
    // their own gestures rather than doubling as a swipe surface.
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    isHorizontal.current = null;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    if (startX.current === null) return;
    if (isHorizontal.current !== null) return;

    const dx = Math.abs(e.clientX - startX.current);
    const dy = Math.abs(e.clientY - startY.current);
    if (Math.max(dx, dy) < DIRECTION_LOCK) return;
    // Lock the axis once: whichever dominates first owns the whole gesture.
    isHorizontal.current = dx > dy;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<T>) => {
      const start = startX.current;
      startX.current = null;
      if (start === null || !isHorizontal.current) return;

      const dx = e.clientX - start;
      if (Math.abs(dx) < threshold) return;

      // A leftward swipe (dx < 0) advances in LTR and goes back in RTL.
      const forward = rtl ? dx > 0 : dx < 0;
      if (forward) onForward();
      else onBack();
    },
    [onForward, onBack, rtl, threshold],
  );

  const onPointerCancel = useCallback(() => {
    startX.current = null;
    isHorizontal.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
