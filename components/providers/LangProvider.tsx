"use client";
import { createContext, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh-Hant" || saved === "zh-Hans" || saved === "ko" || saved === "th" || saved === "km") setLangState(saved);
    if (saved === "zh") setLangState("zh-Hans");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem("lang", next);
  };

  const toggle = () => {
    setLang(lang === "en" ? "zh-Hant" : "en");
  };

  return (
    <LangContext.Provider value={{ lang, t: strings[lang], setLang, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
