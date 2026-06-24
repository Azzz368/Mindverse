"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { strings, type Lang, type Strings } from "@/lib/i18n/strings";

type LangContextValue = { lang: Lang; t: Strings; toggle: () => void };

const LangContext = createContext<LangContextValue>({
  lang: "zh",
  t: strings.zh,
  toggle: () => undefined,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang | null;
    if (saved === "en" || saved === "zh") setLang(saved);
  }, []);

  const toggle = () => {
    const next: Lang = lang === "zh" ? "en" : "zh";
    setLang(next);
    localStorage.setItem("lang", next);
  };

  return (
    <LangContext.Provider value={{ lang, t: strings[lang], toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
