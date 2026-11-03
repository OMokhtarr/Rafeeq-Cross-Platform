import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { STRINGS, Lang, AppStrings } from "../i18n/strings";
import { useWidgetLanguage } from "../hooks/useWidgetTheme";
import { SYNC_APPLIED_EVENT } from "../services/sync/sync-events";

interface LanguageCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: AppStrings;
  isRTL: boolean;
}

const STORAGE_KEY = "rafiq_lang_v1";
const DEFAULT_LANG: Lang = "ar";

const Ctx = createContext<LanguageCtx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  toggle: () => {},
  t: STRINGS[DEFAULT_LANG],
  isRTL: true,
});

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "ar" || v === "en") return v;
  } catch (_) {}
  return DEFAULT_LANG;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(loadLang);
  useWidgetLanguage(lang);

  useEffect(() => {
    const t = STRINGS[lang];
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", t.dir);
    try {
      // An untouched default stays unwritten: stored, it would count as a fresh
      // edit and beat the language this person chose on another device.
      if (lang !== DEFAULT_LANG || localStorage.getItem(STORAGE_KEY) !== null) {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (_) {}
  }, [lang]);

  // Cloud sync wrote a newer value: show it.
  useEffect(() => {
    const onApplied = (e: Event) => {
      const { collections } = (e as CustomEvent<{ collections: string[] }>).detail;
      if (collections.includes("lang")) setLangState(loadLang());
    };
    window.addEventListener(SYNC_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onApplied);
  }, []);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle = useCallback(() => setLangState(l => (l === "ar" ? "en" : "ar")), []);

  const value = useMemo<LanguageCtx>(() => {
    const t = STRINGS[lang];
    return { lang, setLang, toggle, t, isRTL: t.dir === "rtl" };
  }, [lang, setLang, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useLang = () => useContext(Ctx);
