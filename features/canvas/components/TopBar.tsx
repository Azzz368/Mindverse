"use client";
import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useLang } from "@/components/providers/LangProvider";
import { SKILL_DRAFT_SNAPSHOT_KEY } from "@/features/skills/services/skillClient";

export function TopBar() {
  const { projectName, setProjectName, exportCanvasJson, importCanvasJson } = useCanvasStore();
  const { t, toggle } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const skillsHref = `/skills?returnTo=${encodeURIComponent(pathname)}`;

  const exportFile = () => {
    const blob = new Blob([exportCanvasJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "mindverse-canvas.json"; link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCanvasJson(String(reader.result));
    reader.readAsText(file);
  };

  const createSkill = () => {
    window.sessionStorage.setItem(SKILL_DRAFT_SNAPSHOT_KEY, exportCanvasJson());
    window.location.href = `/skills/new?returnTo=${encodeURIComponent(pathname)}`;
  };

  return (
    <header className="flex h-14 items-center gap-3 border-b border-[#e7eaf0] bg-white px-4 dark:border-slate-800 dark:bg-[#0c1622]">
      <a href="/" className="mr-2 text-sm font-bold tracking-tight text-[#030303] dark:text-cyan-300">
        MINDVERSE
      </a>
      <Input
        className="max-w-sm border-transparent bg-transparent px-2 font-medium focus:border-[#c9ccd1] dark:focus:border-slate-700"
        value={projectName}
        onChange={(event) => setProjectName(event.target.value)}
        placeholder={t.projectNamePlaceholder}
        aria-label="Project name"
      />
      <div className="ml-auto flex items-center gap-2">
        <Link href={skillsHref} className="rounded-lg border border-[#e7eaf0] bg-white px-3 py-2 text-xs font-medium text-[#030303] transition hover:bg-[#f0f1f3] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">Skills</Link>
        <Button onClick={createSkill}>保存为 Skill</Button>
        <Button onClick={exportFile}>{t.exportJson}</Button>
        <Button onClick={() => fileRef.current?.click()}>{t.importJson}</Button>
        <input
          ref={fileRef} type="file" accept="application/json"
          className="hidden"
          onChange={(event) => importFile(event.target.files?.[0])}
        />
        {/* Language toggle */}
        <button
          onClick={toggle}
          className="rounded px-2 py-1 text-xs font-semibold text-[#404040] transition hover:bg-[#f0f1f3] dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Switch language"
        >
          {t.langToggle}
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
