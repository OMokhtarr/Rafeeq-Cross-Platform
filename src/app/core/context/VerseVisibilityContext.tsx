/**
 * VERSE VISIBILITY CONTEXT
 *
 * Cross-viewer state for verse selection and hiding. The same Set of hidden
 * verses is shared between PageViewer and MushafContextViewer (and any
 * future viewer surface), so toggling visibility on one screen — or
 * navigating to a different page / search result — does not lose the user's
 * hide state. Persisted to localStorage so it also survives reloads.
 *
 * Selection is intentionally NOT persisted — selection is an in-session
 * gesture for "do something with these verses next" (hide, clear, etc.).
 *
 * Verse keys are the canonical "sura:aya" string used everywhere else.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "rafiq_hidden_verses_v1";

export type VerseKey = string; // "sura:aya"

export const verseKey = (sura: number, aya: number): VerseKey =>
  `${sura}:${aya}`;

interface VerseVisibilityCtx {
  // Selection (volatile, in-memory only)
  selected: Set<VerseKey>;
  isSelected: (key: VerseKey) => boolean;
  toggleSelected: (key: VerseKey) => void;
  clearSelection: () => void;
  selectionCount: number;

  // Hidden (persisted)
  hidden: Set<VerseKey>;
  isHidden: (key: VerseKey) => boolean;
  hideVerse: (key: VerseKey) => void;
  hideMany: (keys: Iterable<VerseKey>) => void;
  showVerse: (key: VerseKey) => void;
  showMany: (keys: Iterable<VerseKey>) => void;
  showAll: () => void;
  hiddenCount: number;

  // Convenience: hide everything currently selected and clear selection
  hideSelected: () => void;
}

const Ctx = createContext<VerseVisibilityCtx | null>(null);

function loadHidden(): Set<VerseKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr))
      return new Set(arr.filter((x) => typeof x === "string"));
  } catch (_) {}
  return new Set();
}

export const VerseVisibilityProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [selected, setSelected] = useState<Set<VerseKey>>(() => new Set());
  const [hidden, setHidden] = useState<Set<VerseKey>>(loadHidden);

  // Persist hidden whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hidden)));
    } catch (_) {}
  }, [hidden]);

  const isSelected = useCallback((k: VerseKey) => selected.has(k), [selected]);
  const isHidden = useCallback((k: VerseKey) => hidden.has(k), [hidden]);

  const toggleSelected = useCallback((k: VerseKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const hideVerse = useCallback((k: VerseKey) => {
    setHidden((prev) => {
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  }, []);

  const hideMany = useCallback((keys: Iterable<VerseKey>) => {
    setHidden((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of keys) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const showVerse = useCallback((k: VerseKey) => {
    setHidden((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }, []);

  const showMany = useCallback((keys: Iterable<VerseKey>) => {
    setHidden((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of keys) {
        if (next.has(k)) {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const showAll = useCallback(() => setHidden(new Set()), []);

  const hideSelected = useCallback(() => {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const k of selected) next.add(k);
      return next;
    });
    setSelected(new Set());
  }, [selected]);

  const value = useMemo<VerseVisibilityCtx>(
    () => ({
      selected,
      isSelected,
      toggleSelected,
      clearSelection,
      selectionCount: selected.size,
      hidden,
      isHidden,
      hideVerse,
      hideMany,
      showVerse,
      showMany,
      showAll,
      hiddenCount: hidden.size,
      hideSelected,
    }),
    [
      selected,
      isSelected,
      toggleSelected,
      clearSelection,
      hidden,
      isHidden,
      hideVerse,
      hideMany,
      showVerse,
      showMany,
      showAll,
      hideSelected,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useVerseVisibility = (): VerseVisibilityCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useVerseVisibility must be used inside <VerseVisibilityProvider>",
    );
  }
  return ctx;
};
