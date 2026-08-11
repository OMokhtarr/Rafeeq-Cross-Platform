/**
 * Tracks which dismissible overlays (sheets, modals) are currently open.
 *
 * The edge swipe-back gesture is patched in App.tsx, which sits above every
 * page and cannot see their local state. Overlays register a close callback
 * here so that gate can ask "is something open?" and close it instead of
 * treating the swipe as a back/exit.
 *
 * Module-level rather than context: the swipe gate reads it from inside a
 * gesture callback created once at mount, where a context value would be
 * captured stale.
 */

type CloseFn = () => void;

const stack: { id: symbol; close: CloseFn }[] = [];

/** Registers an open overlay. Returns the matching unregister. */
export function registerOverlay(close: CloseFn): () => void {
  const id = Symbol("overlay");
  stack.push({ id, close });
  return () => {
    const i = stack.findIndex((o) => o.id === id);
    if (i !== -1) stack.splice(i, 1);
  };
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}

/**
 * Closes the most recently opened overlay. Returns false when none was open,
 * letting the caller fall through to its normal behaviour.
 */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
