/**
 * Tap vs. press-and-hold on one button, robust to Android touch quirks.
 *
 * Android's WebView runs its own long-press (~400–500 ms): it fires
 * `contextmenu` and may cancel the pointer, which is followed by a
 * `pointerleave`. A small finger drift on a small button does the same.
 * Treating those as a release turned an intended hold into a tap, so only a
 * real `pointerup` counts as a tap here; cancel, leave and a real drag
 * abandon the press without firing either action. The pointer is captured
 * so the finger drifting off the button's edge doesn't end the press.
 *
 * Callers should also give the button `touch-action: none` and
 * `-webkit-touch-callout: none` so the browser doesn't claim the gesture.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

/** Hold duration before `onHold` fires — long enough not to misfire on a
 *  slow tap, short enough not to feel like waiting. */
export const HOLD_PRESS_MS = 500;

/** Finger travel allowed during a hold before the press counts as a drag. */
const MOVE_TOLERANCE_PX = 12;

interface Options {
  onTap: () => void;
  onHold: () => void;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
}

export function useHoldPress({ onTap, onHold }: Options) {
  const [holding, setHolding] = useState(false);
  const pressRef = useRef<Press | null>(null);
  const actionsRef = useRef({ onTap, onHold });
  actionsRef.current = { onTap, onHold };

  const abandon = useCallback(() => {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
    setHolding(false);
  }, []);

  useEffect(() => abandon, [abandon]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      abandon();
      const el = e.currentTarget;
      if (typeof el.setPointerCapture === "function") {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone (e.g. synthetic event) — capture is best-effort.
        }
      }
      const timer = setTimeout(() => {
        pressRef.current = null;
        setHolding(false);
        actionsRef.current.onHold();
      }, HOLD_PRESS_MS);
      pressRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer };
      setHolding(true);
    },
    [abandon],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) {
        abandon();
      }
    },
    [abandon],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      abandon();
      actionsRef.current.onTap();
    },
    [abandon],
  );

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (pressRef.current?.pointerId === e.pointerId) abandon();
    },
    [abandon],
  );

  const preventDefault = useCallback((e: React.SyntheticEvent) => e.preventDefault(), []);

  return {
    holding,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onContextMenu: preventDefault,
      onClick: preventDefault,
    },
  };
}
