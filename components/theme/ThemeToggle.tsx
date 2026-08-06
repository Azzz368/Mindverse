"use client";

import { useTheme } from "@/components/providers/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "切换到浅色模式" : "切换到深色模式"}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#dfe3e8] bg-white/75 text-[#67707d] shadow-sm backdrop-blur transition duration-200 hover:border-[#c8ccd3] hover:bg-white hover:text-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-400 dark:hover:border-white/[0.18] dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-[#071018]"
    >
      {isDark ? (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.34 4.34 5.4 5.4m9.2 9.2 1.06 1.06m0-11.32L14.6 5.4M5.4 14.6l-1.06 1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none">
          <path d="M16.7 12.8A7.1 7.1 0 0 1 7.2 3.3 7.1 7.1 0 1 0 16.7 12.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
