import { useCallback, useRef } from "react";

/**
 * Drag-to-dismiss for bottom sheets.
 *
 * Returns props to spread on the sheet element. The drag only starts inside
 * `handleZone` px of the sheet's top edge, so content below (the tafsir body,
 * the downloads list) keeps its own scrolling.
 *
 * Callers must put `touch-action: none` on the drag zone — without it Android
 * claims the vertical gesture for scrolling and fires `pointercancel` mid-drag,
 * which is what broke the viewer's playback sheet.
 */

interface SheetDragOptions {
  /** Called once the sheet has animated out. */
  onDismiss: () => void;
  /** Height of the grab area measured from the sheet's top edge. */
  handleZone?: number;
  /** Drag distance past which release dismisses instead of springing back. */
  threshold?: number;
}

const DISMISS_MS = 240;
const SPRING_MS = 200;
/** px/ms — a flick this fast dismisses even when it never passes `threshold`. */
const FLICK_VELOCITY = 0.5;

// Generic over the sheet element: the playback sheet is a <div> and the tafsir
// sheet an <aside>, and a ref must match its element's exact type. The hook
// itself only touches .style, which every HTMLElement has.
export function useSheetDrag<T extends HTMLElement = HTMLDivElement>({
  onDismiss,
  handleZone = 48,
  threshold = 120,
}: SheetDragOptions) {
  const elRef = useRef<T | null>(null);
  const startY = useRef<number | null>(null);
  const startTime = useRef(0);
  const currentY = useRef(0);
  const dismissing = useRef(false);

  const reset = useCallback(() => {
    const el = elRef.current;
    startY.current = null;
    currentY.current = 0;
    if (el) {
      el.style.transition = `transform ${SPRING_MS}ms ease`;
      el.style.transform = "translateY(0)";
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (dismissing.current) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      if (e.clientY - rect.top > handleZone) return;

      startY.current = e.clientY;
      startTime.current = e.timeStamp;
      currentY.current = 0;
      // The entry animation would otherwise fight the inline transform.
      el.style.animation = "none";
      el.setPointerCapture(e.pointerId);
    },
    [handleZone],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (startY.current === null) return;
    // Downward only: an upward drag shouldn't lift the sheet off its anchor.
    const dy = Math.max(0, e.clientY - startY.current);
    currentY.current = dy;
    const el = elRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (startY.current === null) return;
      const dy = currentY.current;
      const elapsed = e.timeStamp - startTime.current;
      const velocity = elapsed > 0 ? dy / elapsed : 0;
      const el = elRef.current;

      startY.current = null;
      currentY.current = 0;
      if (!el) return;

      if (dy > threshold || velocity > FLICK_VELOCITY) {
        dismissing.current = true;
        el.style.transition = `transform ${DISMISS_MS}ms ease`;
        // 100% of the sheet's own height clears a bottom-anchored sheet
        // regardless of where its top edge sits.
        el.style.transform = "translateY(100%)";
        window.setTimeout(() => {
          dismissing.current = false;
          onDismiss();
        }, DISMISS_MS);
      } else {
        el.style.transition = `transform ${SPRING_MS}ms ease`;
        el.style.transform = "translateY(0)";
      }
    },
    [onDismiss, threshold],
  );

  // Android fires this when it decides the gesture belongs to a scroller.
  // Without it the sheet stays stuck wherever the finger left it.
  const onPointerCancel = useCallback(() => {
    if (startY.current === null) return;
    reset();
  }, [reset]);

  return {
    ref: elRef,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
