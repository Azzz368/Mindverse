"use client";
import { templates } from "@/shared/templates/templates";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useLang } from "@/components/providers/LangProvider";

export function TemplateGallery() {
  const applyTemplate = useCanvasStore((state) => state.applyTemplate);
  const { t } = useLang();
  return (
    <div className="border-b border-[#e7eaf0] bg-white px-4 py-2 dark:border-slate-800 dark:bg-[#0c1622]">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">
          {t.templates}
        </span>
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => applyTemplate(template)}
            title={template.description}
            className="shrink-0 rounded-full border border-[#c9ccd1] px-3 py-1.5 text-xs text-[#404040] transition hover:border-[#030303] hover:text-[#030303] dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-400 dark:hover:text-cyan-200"
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  );
}
