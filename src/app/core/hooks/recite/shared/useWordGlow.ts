import { useCallback, useEffect, useRef, useState } from "react";

/** How long a word's glow animation runs before its entry is dropped. */
export const GLOW_TOTAL_MS = 1650;

export interface WordGlow {
  /** Glowing word keys → generation. A new generation restarts the CSS animation. */
  glow: ReadonlyMap<string, number>;
  light: (keys: string[]) => void;
  clear: () => void;
}

export function useWordGlow(): WordGlow {
  const [glow, setGlow] = useState<ReadonlyMap<string, number>>(() => new Map());
  const generation = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setGlow((prev) => (prev.size ? new Map() : prev));
  }, []);

  const light = useCallback((keys: string[]) => {
    if (!keys.length) return;
    const gen = ++generation.current;
    setGlow((prev) => {
      const next = new Map(prev);
      keys.forEach((k) => next.set(k, gen));
      return next;
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      // A newer light() of the same key owns its own timer; leave it alone.
      setGlow((prev) => {
        const next = new Map(prev);
        keys.forEach((k) => {
          if (next.get(k) === gen) next.delete(k);
        });
        return next.size === prev.size ? prev : next;
      });
    }, GLOW_TOTAL_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { glow, light, clear };
}
