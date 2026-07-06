"use client";
import { useTheme } from "@/components/providers/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#e7eaf0] text-[#676f7b] transition hover:bg-[#f0f1f3] dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
