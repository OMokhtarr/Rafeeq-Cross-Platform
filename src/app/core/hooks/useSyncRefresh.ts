import { useEffect, useReducer, useRef } from "react";
import { SYNC_APPLIED_EVENT } from "../services/sync/sync-events";

/**
 * Calls `reload` after cloud sync wrote any of `collections` to this device.
 * A page that keeps a synced store in React state needs this: saving that stale
 * copy later would undo what sync applied, on every device.
 */
export function useSyncRefresh(collections: readonly string[], reload: () => void): void {
  const latest = useRef(reload);
  latest.current = reload;
  const watched = collections.join();

  useEffect(() => {
    const ids = watched.split(",");
    const onApplied = (e: Event) => {
      const applied = (e as CustomEvent<{ collections: string[] }>).detail.collections;
      if (ids.some((id) => applied.includes(id))) latest.current();
    };
    window.addEventListener(SYNC_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onApplied);
  }, [watched]);
}

/** Re-renders a card that reads the streak stores while rendering when they change underneath it. */
export function useStreakRefresh(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const onChange = () => bump();
    window.addEventListener("hifz-streak-changed", onChange);
    return () => window.removeEventListener("hifz-streak-changed", onChange);
  }, []);
}
