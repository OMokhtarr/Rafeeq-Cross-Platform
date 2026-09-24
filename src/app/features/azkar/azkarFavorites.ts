/**
 * "My Azkar" — the zikr ids the user has favourited, persisted locally.
 */

import { useCallback, useState } from "react";

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

  const toggleFavorite = useCallback((zikrId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(zikrId)
        ? prev.filter((id) => id !== zikrId)
        : [...prev, zikrId];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  return { favorites, toggleFavorite };
}
