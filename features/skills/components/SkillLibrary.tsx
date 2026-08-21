"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_SKILL_KEY,
  PENDING_SKILL_KEY,
  SKILL_DRAFT_SNAPSHOT_KEY,
  deleteSkillRemote,
  getSkillRemote,
  listSkillsRemote,
} from "@/features/skills/services/skillClient";
import { skillCategoryLabels, skillRoleLabels, type SkillSummary } from "@/shared/skills/skillTypes";

const safeReturnPath = (value: string | null) => value?.startsWith("/") && !value.startsWith("//") ? value : "";

export function SkillLibrary() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [returnTo, setReturnTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnPath(params.get("returnTo")));
    window.sessionStorage.removeItem(SKILL_DRAFT_SNAPSHOT_KEY);
    if (params.get("saved") === "1") setMessage("Skill saved.");
    void (async () => {
      try {
        const payload = await listSkillsRemote();
        setSkills(payload.output?.skills || []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load Skills.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const newHref = useMemo(() => `/skills/new${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, [returnTo]);

  const useSkill = async (skill: SkillSummary) => {
    try {
      const payload = await getSkillRemote(skill.id);
      if (!payload.output) throw new Error("Skill not found.");
      window.localStorage.setItem(ACTIVE_SKILL_KEY, JSON.stringify({
        id: payload.output.id,
        name: payload.output.name,
        tagline: payload.output.tagline,
        skillMd: payload.output.skillMd,
        usageScenario: payload.output.usageScenario,
        howToUse: payload.output.howToUse,
        expectedOutput: payload.output.expectedOutput,
        role: payload.output.role,
        appliesTo: payload.output.appliesTo,
        triggerPhrases: payload.output.triggerPhrases,
        priority: payload.output.priority,
      }));
      window.sessionStorage.setItem(PENDING_SKILL_KEY, JSON.stringify(payload.output));
      window.location.href = returnTo || "/workspace";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not use Skill.");
    }
  };

  const removeSkill = async (skill: SkillSummary) => {
    if (!window.confirm(`Delete Skill “${skill.name}”?`)) return;
    try {
      await deleteSkillRemote(skill.id);
      setSkills((items) => items.filter((item) => item.id !== skill.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete Skill.");
    }
  };

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-[#303030] bg-[#141414]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-5 px-5 sm:px-8">
          <Link href="/workspace" className="text-sm font-bold tracking-[0.12em]">MINDVERSE</Link>
          <span className="h-5 w-px bg-[#3a3a3a]" />
          <span className="text-sm text-[#a2a2a2]">Skill Store</span>
          <Link href={newHref} className="ml-auto rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e7e7e7]">Create Skill</Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-12 sm:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Skills</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#929292]">Save reliable prompts and canvas workflows as reusable templates, then place the complete node set back onto your canvas.</p>
          </div>
          {returnTo && <Link href={returnTo} className="text-sm text-[#b5b5b5] underline decoration-[#555] underline-offset-4 hover:text-white">Return to canvas</Link>}
        </div>

        {message && <div role="status" className="mb-7 rounded-lg border border-[#454545] bg-[#1b1b1b] px-5 py-4 text-sm text-[#d4d4d4]">{message}</div>}

        {loading ? (
          <p className="py-20 text-center text-[#929292]">Loading Skills...</p>
        ) : skills.length === 0 ? (
          <section className="rounded-lg border border-dashed border-[#454545] px-6 py-20 text-center">
            <h2 className="text-xl font-semibold">No Skills yet</h2>
            <p className="mt-3 text-sm text-[#929292]">Create one from the current canvas to save its nodes, connections, and settings.</p>
            <Link href={newHref} className="mt-7 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black">Create your first Skill</Link>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => (
              <article key={skill.id} className="flex min-h-64 flex-col rounded-lg border border-[#343434] bg-[#191919] p-5 transition hover:border-[#5a5a5a]">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-md bg-[#2d2d2d] px-2.5 py-1 text-xs text-[#d0d0d0]">{skillCategoryLabels[skill.category]}</span>
                  <span className="text-xs text-[#707070]">{skill.visibility === "private" ? "Private" : skill.visibility === "public" ? "Public" : "Unlisted"}</span>
                </div>
                <h2 className="mt-5 truncate text-lg font-semibold">{skill.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#9d9d9d]">{skill.tagline}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md bg-[#243043] px-2 py-1 text-[#bed4f5]">{skillRoleLabels[skill.role || "workflow_recipe"]}</span>
                  {skill.triggerPhrases?.slice(0, 2).map((phrase) => <span key={phrase} className="rounded-md bg-[#2d2d2d] px-2 py-1 text-[#a9a9a9]">{phrase}</span>)}
                </div>
                <div className="mt-5 text-xs text-[#707070]">{skill.hasCanvasTemplate ? `${skill.nodeCount} canvas nodes` : "Instruction-only Skill"}</div>
                <div className="mt-auto flex items-center gap-2 border-t border-[#303030] pt-5">
                  <button onClick={() => void useSkill(skill)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#e6e6e6]">Use</button>
                  <Link href={`/skills/${encodeURIComponent(skill.id)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`} className="rounded-lg px-3 py-2 text-sm text-[#bdbdbd] transition hover:bg-[#2b2b2b] hover:text-white">Edit</Link>
                  <button onClick={() => void removeSkill(skill)} className="ml-auto rounded-lg px-3 py-2 text-sm text-[#8c8c8c] transition hover:bg-[#2b1c1c] hover:text-[#ff9b9b]">Delete</button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
