"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACCESS_KEY } from "@/features/workspace/services/workflowClient";
import {
  SKILL_DRAFT_SNAPSHOT_KEY,
  createSkillRemote,
  getSkillRemote,
  updateSkillRemote,
} from "@/features/skills/services/skillClient";
import { SkillMarkdownPreview } from "./SkillMarkdownPreview";
import type { CanvasSnapshot } from "@/shared/canvas";
import {
  defaultSkillMarkdown,
  skillCategories,
  skillCategoryLabels,
  type SkillCategory,
  type SkillDraft,
} from "@/shared/skills/skillTypes";

type EditorDraft = Omit<SkillDraft, "canvasTemplate">;

const emptyDraft: EditorDraft = {
  name: "",
  tagline: "",
  skillMd: defaultSkillMarkdown,
  usageScenario: "",
  howToUse: "",
  expectedOutput: "",
  category: "image",
  visibility: "private",
};

const isSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(
  value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).nodes) && Array.isArray((value as CanvasSnapshot).edges),
);

const safeReturnPath = (value: string | null) => value?.startsWith("/") && !value.startsWith("//") ? value : "";

function FieldLabel({ children, required = true }: { children: React.ReactNode; required?: boolean }) {
  return <label className="mb-3 block text-base font-semibold text-white">{children}{required && <span className="ml-1 text-[#ff4d4f]">*</span>}</label>;
}

const inputClass = "w-full rounded-lg border border-transparent bg-[#2b2b2b] px-5 text-base text-white outline-none transition placeholder:text-[#919191] focus:border-[#666] focus:bg-[#303030]";

export function SkillEditor({ skillId }: { skillId?: string }) {
  const [draft, setDraft] = useState<EditorDraft>(emptyDraft);
  const [accessCode, setAccessCode] = useState("");
  const [canvasTemplate, setCanvasTemplate] = useState<CanvasSnapshot>();
  const [includeCanvas, setIncludeCanvas] = useState(false);
  const [mode, setMode] = useState<"preview" | "code">("code");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(Boolean(skillId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const code = window.localStorage.getItem(ACCESS_KEY) || "";
    setAccessCode(code);
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnPath(params.get("returnTo")));

    const pendingSnapshot = skillId ? null : window.sessionStorage.getItem(SKILL_DRAFT_SNAPSHOT_KEY);
    if (pendingSnapshot) {
      try {
        const parsed = JSON.parse(pendingSnapshot) as unknown;
        if (isSnapshot(parsed)) {
          setCanvasTemplate(parsed);
          setIncludeCanvas(parsed.nodes.length > 0);
        }
      } catch {
        window.sessionStorage.removeItem(SKILL_DRAFT_SNAPSHOT_KEY);
      }
    }

    if (!skillId || !code) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const payload = await getSkillRemote(skillId, code);
        if (!payload.output) throw new Error("Skill not found.");
        const skill = payload.output;
        setDraft({
          name: skill.name,
          tagline: skill.tagline,
          skillMd: skill.skillMd,
          usageScenario: skill.usageScenario,
          howToUse: skill.howToUse,
          expectedOutput: skill.expectedOutput,
          category: skill.category,
          visibility: skill.visibility,
        });
        if (!pendingSnapshot && skill.canvasTemplate) {
          setCanvasTemplate(skill.canvasTemplate);
          setIncludeCanvas(true);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加载 Skill 失败。");
      } finally {
        setLoading(false);
      }
    })();
  }, [skillId]);

  const backHref = useMemo(() => `/skills${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, [returnTo]);
  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  const uploadMarkdown = async (file?: File) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setMessage("SKILL.md 不能超过 1 MB。");
      return;
    }
    setField("skillMd", await file.text());
    setMode("code");
    setMessage("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessCode) {
      setMessage("请先回到工作区输入访问码，再创建 Skill。");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const request = {
        accessCode,
        skill: {
          ...draft,
          category: draft.category as SkillCategory,
          canvasTemplate: includeCanvas ? canvasTemplate : undefined,
        },
      };
      if (skillId) await updateSkillRemote(skillId, request);
      else await createSkillRemote(request);
      window.sessionStorage.removeItem(SKILL_DRAFT_SNAPSHOT_KEY);
      window.location.href = `${backHref}${backHref.includes("?") ? "&" : "?"}saved=1`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存 Skill 失败。");
    } finally {
      setSaving(false);
    }
  };

  const editorPanel = (
    <div className={expanded ? "flex h-full min-h-0 flex-col" : ""}>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="flex rounded-lg bg-[#242424] p-1 text-sm">
          <button type="button" onClick={() => setMode("code")} className={`rounded-md px-3 py-1.5 ${mode === "code" ? "bg-[#3a3a3a] text-white" : "text-[#949494] hover:text-white"}`}>编辑</button>
          <button type="button" onClick={() => setMode("preview")} className={`rounded-md px-3 py-1.5 ${mode === "preview" ? "bg-[#3a3a3a] text-white" : "text-[#949494] hover:text-white"}`}>预览</button>
        </div>
        <span className="mx-1 h-7 w-px bg-[#3b3b3b]" />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2b2b2b]">上传 .md</button>
        <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={(event) => void uploadMarkdown(event.target.files?.[0])} />
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "退出全屏" : "全屏编辑"} aria-label={expanded ? "退出全屏" : "全屏编辑"} className="flex h-9 w-9 items-center justify-center rounded-md text-xl text-white transition hover:bg-[#2b2b2b]">{expanded ? "×" : "⛶"}</button>
      </div>
      <div className={`grid min-h-0 overflow-hidden rounded-lg border border-[#343434] bg-[#171717] md:grid-cols-[260px_minmax(0,1fr)] ${expanded ? "flex-1" : "min-h-[620px]"}`}>
        <aside className="border-b border-[#343434] p-4 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center justify-between text-sm text-[#a8a8a8]">
            <span>目录</span>
            <span className="text-lg text-white">＋</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#3a3a3a] px-4 py-3 text-sm font-medium text-white">
            <span>▧ &nbsp; SKILL.md</span>
            <span className="text-[#ff9d00]">⌖</span>
          </div>
        </aside>
        <section className="min-h-[420px] bg-[#2b2b2b]">
          {mode === "code" ? (
            <textarea value={draft.skillMd} onChange={(event) => setField("skillMd", event.target.value)} spellCheck={false} aria-label="SKILL.md 内容" className="h-full min-h-[620px] w-full resize-none bg-transparent p-6 font-mono text-sm leading-7 text-[#d8d8d8] outline-none placeholder:text-[#898989]" />
          ) : (
            <div className="h-full overflow-y-auto p-7"><SkillMarkdownPreview markdown={draft.skillMd} /></div>
          )}
        </section>
      </div>
    </div>
  );

  if (loading) return <main className="min-h-screen bg-[#111] px-6 py-20 text-center text-[#aaa]">正在加载 Skill...</main>;

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <form onSubmit={save} className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center gap-4 border-b border-[#4a4a4a] pb-7">
          <Link href={backHref} aria-label="返回 Skills" className="flex h-10 w-10 items-center justify-center rounded-md text-2xl transition hover:bg-[#272727]">←</Link>
          <h1 className="text-2xl font-semibold">{skillId ? "编辑 Skill" : "创建 Skill"}</h1>
          <button type="submit" disabled={saving} className="ml-auto h-12 rounded-lg bg-white px-8 text-base font-semibold text-black transition hover:bg-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
        </header>

        {!accessCode && <div className="mt-7 rounded-lg border border-[#6a4d22] bg-[#2a2117] px-5 py-4 text-sm text-[#ffd08a]">当前没有工作区访问码。<Link href="/workspace" className="ml-2 underline">返回工作区验证</Link></div>}
        {message && <div role="alert" className="mt-7 rounded-lg border border-[#704040] bg-[#2a1818] px-5 py-4 text-sm text-[#ffb3b3]">{message}</div>}

        <div className="space-y-10 py-10">
          <section>
            <FieldLabel>Skill 名称</FieldLabel>
            <input value={draft.name} onChange={(event) => setField("name", event.target.value)} maxLength={80} placeholder="给你的 Skill 起个名字" className={`${inputClass} h-16`} />
          </section>
          <section>
            <FieldLabel>一句话介绍</FieldLabel>
            <input value={draft.tagline} onChange={(event) => setField("tagline", event.target.value)} maxLength={160} placeholder="简短描述该 Skill 的能力" className={`${inputClass} h-16`} />
          </section>
          <section>
            <FieldLabel>Skill 内容</FieldLabel>
            {expanded ? <div className="fixed inset-0 z-50 bg-[#111] p-5 sm:p-8">{editorPanel}</div> : editorPanel}
          </section>

          <div className="border-t border-[#4a4a4a] pt-10" />

          <section>
            <FieldLabel>使用场景</FieldLabel>
            <textarea value={draft.usageScenario} onChange={(event) => setField("usageScenario", event.target.value)} maxLength={2000} placeholder="详细描述该 Skill 的使用场景信息" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>如何使用</FieldLabel>
            <textarea value={draft.howToUse} onChange={(event) => setField("howToUse", event.target.value)} maxLength={2000} placeholder="描述用户如何使用该 Skill，需要输入什么信息（例如：剧本内容、故事梗概或任何叙事素材）" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>输出内容</FieldLabel>
            <textarea value={draft.expectedOutput} onChange={(event) => setField("expectedOutput", event.target.value)} maxLength={2000} placeholder="描述用户使用该 Skill 后，预期输出的结果产物是什么（例如：30 秒短视频工作流）" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>选择类型</FieldLabel>
            <select value={draft.category} onChange={(event) => setField("category", event.target.value as SkillCategory)} className={`${inputClass} h-16 appearance-auto`}>
              {skillCategories.map((category) => <option key={category} value={category}>{skillCategoryLabels[category]}</option>)}
            </select>
          </section>
          <section>
            <FieldLabel required={false}>画布模板</FieldLabel>
            <div className="flex flex-col gap-4 rounded-lg border border-[#343434] bg-[#191919] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">包含当前画布工作流</p>
                <p className="mt-1 text-sm leading-6 text-[#929292]">保存节点、连线和参数；运行状态、任务 ID 与生成结果不会进入模板。</p>
                <p className="mt-2 text-xs text-[#6f6f6f]">{canvasTemplate ? `${canvasTemplate.nodes.length} 个节点 · ${canvasTemplate.edges.length} 条连线` : "没有从画布带入模板"}</p>
              </div>
              <label className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${includeCanvas && canvasTemplate ? "bg-white" : "bg-[#3b3b3b]"}`}>
                <input type="checkbox" checked={includeCanvas} disabled={!canvasTemplate} onChange={(event) => setIncludeCanvas(event.target.checked)} className="sr-only" />
                <span className={`h-6 w-6 rounded-full bg-[#111] transition ${includeCanvas && canvasTemplate ? "translate-x-7" : "translate-x-1"}`} />
              </label>
            </div>
          </section>
        </div>
      </form>
    </main>
  );
}
