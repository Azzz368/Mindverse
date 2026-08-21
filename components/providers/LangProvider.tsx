"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { strings, type Lang, type Strings } from "@/shared/i18n/strings";

type LangContextValue = { lang: Lang; t: Strings; setLang: (lang: Lang) => void; toggle: () => void };

const LangContext = createContext<LangContextValue>({
  lang: "en",
  t: strings.en,
  setLang: () => undefined,
  toggle: () => undefined,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh-Hans" || saved === "zh-Hant" || saved === "ko" || saved === "th" || saved === "km") setLangState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
  }, [hydrated, lang]);

  const setLang = useCallback((next: Lang) => {
    if (next === "en" || next === "zh-Hans" || next === "zh-Hant" || next === "ko" || next === "th" || next === "km") setLangState(next);
  }, []);

  const toggle = useCallback(() => {
    const languages: Lang[] = ["en", "zh-Hans", "zh-Hant", "ko", "th", "km"];
    setLangState((current) => languages[(languages.indexOf(current) + 1) % languages.length]);
  }, []);

  const value = useMemo(() => ({ lang, t: strings[lang], setLang, toggle }), [lang, setLang, toggle]);

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
