"use client";

import { useLang } from "@/components/providers/LangProvider";
import { languageOptions } from "@/shared/i18n/landing";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={lang}
        onChange={(event) => setLang(event.target.value as typeof lang)}
        className="h-9 appearance-none rounded-lg border border-[#e1e5eb] bg-white py-1 pl-3 pr-8 text-xs font-semibold text-[#4b5563] outline-none transition hover:border-[#b9c0ca] focus:border-violet-400 dark:border-white/10 dark:bg-[#101c29] dark:text-slate-200"
      >
        {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <svg aria-hidden="true" viewBox="0 0 10 6" className="pointer-events-none absolute right-3 h-1.5 w-2.5 text-current"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </label>
  );
}
