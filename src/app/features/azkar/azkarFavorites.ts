/**
 * "My Azkar" — the zikr ids the user has favourited, persisted locally.
 */

import { useCallback, useState } from "react";
import { useSyncRefresh } from "../../core/hooks/useSyncRefresh";

const FAVORITES_KEY = "azkar:favorites";

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useAzkarFavorites() {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  useSyncRefresh(["azkarFavorites"], () => setFavorites(loadFavorites()));

  const toggleFavorite = useCallback((zikrId: string) => {
    // Read fresh: sync may have added a favourite since this copy was loaded,
    // and writing without it would delete it on every device.
    const current = loadFavorites();
    const next = current.includes(zikrId)
      ? current.filter((id) => id !== zikrId)
      : [...current, zikrId];
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
    setFavorites(next);
  }, []);

  return { favorites, toggleFavorite };
}
