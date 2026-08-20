"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  skillRoleLabels,
  skillRoles,
  type SkillCategory,
  type SkillDraft,
  type PromptTarget,
  type SkillRole,
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
  role: "workflow_recipe",
  appliesTo: ["image", "video"],
  triggerPhrases: [],
  priority: 200,
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

    if (!skillId) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const payload = await getSkillRemote(skillId);
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
          role: skill.role || "workflow_recipe",
          appliesTo: skill.appliesTo || [],
          triggerPhrases: skill.triggerPhrases || [],
          priority: skill.priority || 100,
        });
        if (!pendingSnapshot && skill.canvasTemplate) {
          setCanvasTemplate(skill.canvasTemplate);
          setIncludeCanvas(true);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load Skill.");
      } finally {
        setLoading(false);
      }
    })();
  }, [skillId]);

  const backHref = useMemo(() => `/skills${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, [returnTo]);
  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const isPromptGuidance = draft.role === "base_prompt_policy" || draft.role === "style_profile";
  const togglePromptTarget = (target: PromptTarget) => setDraft((current) => ({
    ...current,
    appliesTo: current.appliesTo?.includes(target)
      ? current.appliesTo.filter((item) => item !== target)
      : [...(current.appliesTo || []), target],
  }));

  const uploadMarkdown = async (file?: File) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setMessage("SKILL.md must be no larger than 1 MB.");
      return;
    }
    setField("skillMd", await file.text());
    setMode("code");
    setMessage("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const request = {
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
      setMessage(error instanceof Error ? error.message : "Could not save Skill.");
    } finally {
      setSaving(false);
    }
  };

  const editorPanel = (
    <div className={expanded ? "flex h-full min-h-0 flex-col" : ""}>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="flex rounded-lg bg-[#242424] p-1 text-sm">
          <button type="button" onClick={() => setMode("code")} className={`rounded-md px-3 py-1.5 ${mode === "code" ? "bg-[#3a3a3a] text-white" : "text-[#949494] hover:text-white"}`}>Edit</button>
          <button type="button" onClick={() => setMode("preview")} className={`rounded-md px-3 py-1.5 ${mode === "preview" ? "bg-[#3a3a3a] text-white" : "text-[#949494] hover:text-white"}`}>Preview</button>
        </div>
        <span className="mx-1 h-7 w-px bg-[#3b3b3b]" />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2b2b2b]">Upload .md</button>
        <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={(event) => void uploadMarkdown(event.target.files?.[0])} />
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Exit full screen" : "Edit full screen"} aria-label={expanded ? "Exit full screen" : "Edit full screen"} className="flex h-9 w-9 items-center justify-center rounded-md text-xl text-white transition hover:bg-[#2b2b2b]">{expanded ? "×" : "⛶"}</button>
      </div>
      <div className={`grid min-h-0 overflow-hidden rounded-lg border border-[#343434] bg-[#171717] md:grid-cols-[260px_minmax(0,1fr)] ${expanded ? "flex-1" : "min-h-[620px]"}`}>
        <aside className="border-b border-[#343434] p-4 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center justify-between text-sm text-[#a8a8a8]">
            <span>Files</span>
            <span className="text-lg text-white">＋</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#3a3a3a] px-4 py-3 text-sm font-medium text-white">
            <span>▧ &nbsp; SKILL.md</span>
            <span className="text-[#ff9d00]">⌖</span>
          </div>
        </aside>
        <section className="min-h-[420px] bg-[#2b2b2b]">
          {mode === "code" ? (
            <textarea value={draft.skillMd} onChange={(event) => setField("skillMd", event.target.value)} spellCheck={false} aria-label="SKILL.md content" className="h-full min-h-[620px] w-full resize-none bg-transparent p-6 font-mono text-sm leading-7 text-[#d8d8d8] outline-none placeholder:text-[#898989]" />
          ) : (
            <div className="h-full overflow-y-auto p-7"><SkillMarkdownPreview markdown={draft.skillMd} /></div>
          )}
        </section>
      </div>
    </div>
  );

  if (loading) return <main className="min-h-screen bg-[#111] px-6 py-20 text-center text-[#aaa]">Loading Skill...</main>;

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <form onSubmit={save} className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center gap-4 border-b border-[#4a4a4a] pb-7">
          <Link href={backHref} aria-label="Back to Skills" className="flex h-10 w-10 items-center justify-center rounded-md text-2xl transition hover:bg-[#272727]">←</Link>
          <h1 className="text-2xl font-semibold">{skillId ? "Edit Skill" : "Create Skill"}</h1>
          <button type="submit" disabled={saving} className="ml-auto h-12 rounded-lg bg-white px-8 text-base font-semibold text-black transition hover:bg-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </header>

        {message && <div role="alert" className="mt-7 rounded-lg border border-[#704040] bg-[#2a1818] px-5 py-4 text-sm text-[#ffb3b3]">{message}</div>}

        <div className="space-y-10 py-10">
          <section>
            <FieldLabel>Skill name</FieldLabel>
            <input value={draft.name} onChange={(event) => setField("name", event.target.value)} maxLength={80} placeholder="Give your Skill a name" className={`${inputClass} h-16`} />
          </section>
          <section>
            <FieldLabel>Tagline</FieldLabel>
            <input value={draft.tagline} onChange={(event) => setField("tagline", event.target.value)} maxLength={160} placeholder="Briefly describe what this Skill can do" className={`${inputClass} h-16`} />
          </section>
          <section>
            <FieldLabel>Skill content</FieldLabel>
            {expanded ? <div className="fixed inset-0 z-50 bg-[#111] p-5 sm:p-8">{editorPanel}</div> : editorPanel}
          </section>

          <div className="border-t border-[#4a4a4a] pt-10" />

          <section>
            <FieldLabel>Use cases</FieldLabel>
            <textarea value={draft.usageScenario} onChange={(event) => setField("usageScenario", event.target.value)} maxLength={2000} placeholder="Describe when this Skill should be used" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>How to use</FieldLabel>
            <textarea value={draft.howToUse} onChange={(event) => setField("howToUse", event.target.value)} maxLength={2000} placeholder="Describe how to use this Skill and what input it needs (for example, a script, story outline, or other narrative material)" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>Expected output</FieldLabel>
            <textarea value={draft.expectedOutput} onChange={(event) => setField("expectedOutput", event.target.value)} maxLength={2000} placeholder="Describe the expected result (for example, a 30-second short-video workflow)" className={`${inputClass} min-h-40 resize-y py-5`} />
          </section>
          <section>
            <FieldLabel>Skill role</FieldLabel>
            <select
              value={draft.role}
              onChange={(event) => {
                const role = event.target.value as SkillRole;
                setDraft((current) => ({
                  ...current,
                  role,
                  appliesTo: (role === "base_prompt_policy" || role === "style_profile") && !current.appliesTo?.length ? ["image", "video"] : current.appliesTo,
                  priority: current.priority || (role === "style_profile" ? 200 : role === "base_prompt_policy" ? 150 : 100),
                }));
              }}
              className={`${inputClass} h-16 appearance-auto`}
            >
              {skillRoles.map((role) => <option key={role} value={role}>{skillRoleLabels[role]}</option>)}
            </select>
            <p className="mt-2 text-sm leading-6 text-[#929292]">
              {isPromptGuidance
                ? "This Skill guides positive and negative prompts for Image and Video Nodes when a creative request matches. It does not select models or create nodes. Define the visual direction, immutable character or product traits, framing, lighting, continuity, and negative constraints in SKILL.md."
                : "This Skill guides workflow planning, template reuse, or repair. It is not applied as an automatic visual-style override."}
            </p>
          </section>
          {isPromptGuidance && (
            <section className="space-y-5 rounded-lg border border-[#343434] bg-[#191919] p-5">
              <div>
                <FieldLabel>Target nodes</FieldLabel>
                <div className="flex gap-3">
                  {(["image", "video"] as PromptTarget[]).map((target) => (
                    <label key={target} className="flex cursor-pointer items-center gap-2 rounded-md bg-[#2b2b2b] px-4 py-3 text-sm text-white">
                      <input type="checkbox" checked={draft.appliesTo?.includes(target) || false} onChange={() => togglePromptTarget(target)} />
                      {target === "image" ? "Image Node" : "Video Node"}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Automatic trigger phrases</FieldLabel>
                <input
                  value={(draft.triggerPhrases || []).join(", ")}
                  onChange={(event) => setField("triggerPhrases", event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))}
                  maxLength={1200}
                  placeholder="For example: Japanese animation, anime, campus after rain, coming-of-age film"
                  className={`${inputClass} h-14`}
                />
                <p className="mt-2 text-sm leading-6 text-[#929292]">Separate phrases with commas. When a request matches, the Agent retrieves this Skill and applies it during prompt generation.</p>
              </div>
              <div>
                <FieldLabel>Priority</FieldLabel>
                <input type="number" min={1} max={999} value={draft.priority || 100} onChange={(event) => setField("priority", Number(event.target.value) || 100)} className={`${inputClass} h-14`} />
                <p className="mt-2 text-sm leading-6 text-[#929292]">Style profiles usually use 200. A higher value takes priority among similar styles. Only one style profile is applied automatically per creation to avoid conflicts.</p>
              </div>
            </section>
          )}
          <section>
            <FieldLabel>Category</FieldLabel>
            <select value={draft.category} onChange={(event) => setField("category", event.target.value as SkillCategory)} className={`${inputClass} h-16 appearance-auto`}>
              {skillCategories.map((category) => <option key={category} value={category}>{skillCategoryLabels[category]}</option>)}
            </select>
          </section>
          <section>
            <FieldLabel required={false}>Canvas template</FieldLabel>
            <div className="flex flex-col gap-4 rounded-lg border border-[#343434] bg-[#191919] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">Include the current canvas workflow</p>
                <p className="mt-1 text-sm leading-6 text-[#929292]">Save nodes, connections, and settings. Run status, task IDs, and generated results are excluded.</p>
                <p className="mt-2 text-xs text-[#6f6f6f]">{canvasTemplate ? `${canvasTemplate.nodes.length} nodes · ${canvasTemplate.edges.length} connections` : "No canvas template included"}</p>
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
