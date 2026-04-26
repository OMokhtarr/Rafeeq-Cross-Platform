import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { STRINGS, Lang, AppStrings } from "../i18n/strings";

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

  useEffect(() => {
    const t = STRINGS[lang];
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", t.dir);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle = useCallback(() => setLangState(l => (l === "ar" ? "en" : "ar")), []);

  const value = useMemo<LanguageCtx>(() => {
    const t = STRINGS[lang];
    return { lang, setLang, toggle, t, isRTL: t.dir === "rtl" };
  }, [lang, setLang, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useLang = () => useContext(Ctx);
