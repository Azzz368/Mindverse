"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ACCESS_KEY } from "@/features/workspace/services/workflowClient";
import {
  ACTIVE_SKILL_KEY,
  PENDING_SKILL_KEY,
  SKILL_DRAFT_SNAPSHOT_KEY,
  deleteSkillRemote,
  getSkillRemote,
  listSkillsRemote,
} from "@/features/skills/services/skillClient";
import { skillCategoryLabels, type SkillSummary } from "@/shared/skills/skillTypes";

const safeReturnPath = (value: string | null) => value?.startsWith("/") && !value.startsWith("//") ? value : "";

export function SkillLibrary() {
  const [accessCode, setAccessCode] = useState("");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [returnTo, setReturnTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = window.localStorage.getItem(ACCESS_KEY) || "";
    const params = new URLSearchParams(window.location.search);
    setAccessCode(code);
    setReturnTo(safeReturnPath(params.get("returnTo")));
    window.sessionStorage.removeItem(SKILL_DRAFT_SNAPSHOT_KEY);
    if (params.get("saved") === "1") setMessage("Skill 已保存。");
    if (!code) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const payload = await listSkillsRemote(code);
        setSkills(payload.output?.skills || []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加载 Skills 失败。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const newHref = useMemo(() => `/skills/new${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, [returnTo]);

  const useSkill = async (skill: SkillSummary) => {
    try {
      const payload = await getSkillRemote(skill.id, accessCode);
      if (!payload.output) throw new Error("Skill not found.");
      window.localStorage.setItem(ACTIVE_SKILL_KEY, JSON.stringify({
        id: payload.output.id,
        name: payload.output.name,
        tagline: payload.output.tagline,
        skillMd: payload.output.skillMd,
        usageScenario: payload.output.usageScenario,
        howToUse: payload.output.howToUse,
        expectedOutput: payload.output.expectedOutput,
      }));
      window.sessionStorage.setItem(PENDING_SKILL_KEY, JSON.stringify(payload.output));
      window.location.href = returnTo || "/workspace/local";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "使用 Skill 失败。");
    }
  };

  const removeSkill = async (skill: SkillSummary) => {
    if (!window.confirm(`删除 Skill「${skill.name}」？`)) return;
    try {
      await deleteSkillRemote(skill.id, accessCode);
      setSkills((items) => items.filter((item) => item.id !== skill.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除 Skill 失败。");
    }
  };

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-[#303030] bg-[#141414]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-5 px-5 sm:px-8">
          <Link href="/workspace" className="text-sm font-bold tracking-[0.12em]">MINDVERSE</Link>
          <span className="h-5 w-px bg-[#3a3a3a]" />
          <span className="text-sm text-[#a2a2a2]">Skill Store</span>
          <Link href={newHref} className="ml-auto rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e7e7e7]">创建 Skill</Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-12 sm:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Skills</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#929292]">把稳定好用的提示词和画布工作流保存成可复用模板。使用后可以回到画布放置整套节点。</p>
          </div>
          {returnTo && <Link href={returnTo} className="text-sm text-[#b5b5b5] underline decoration-[#555] underline-offset-4 hover:text-white">返回当前画布</Link>}
        </div>

        {message && <div role="status" className="mb-7 rounded-lg border border-[#454545] bg-[#1b1b1b] px-5 py-4 text-sm text-[#d4d4d4]">{message}</div>}

        {!accessCode ? (
          <section className="rounded-lg border border-[#343434] bg-[#181818] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold">需要工作区访问码</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#929292]">Skill 与当前工作区使用同一访问码。请先返回工作区完成验证。</p>
            <Link href="/workspace" className="mt-6 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black">返回工作区</Link>
          </section>
        ) : loading ? (
          <p className="py-20 text-center text-[#929292]">正在加载 Skills...</p>
        ) : skills.length === 0 ? (
          <section className="rounded-lg border border-dashed border-[#454545] px-6 py-20 text-center">
            <h2 className="text-xl font-semibold">还没有 Skill</h2>
            <p className="mt-3 text-sm text-[#929292]">从当前画布创建，可以把节点、连线和参数一起保存。</p>
            <Link href={newHref} className="mt-7 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black">创建第一个 Skill</Link>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => (
              <article key={skill.id} className="flex min-h-64 flex-col rounded-lg border border-[#343434] bg-[#191919] p-5 transition hover:border-[#5a5a5a]">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-md bg-[#2d2d2d] px-2.5 py-1 text-xs text-[#d0d0d0]">{skillCategoryLabels[skill.category]}</span>
                  <span className="text-xs text-[#707070]">{skill.visibility === "private" ? "私有" : skill.visibility === "public" ? "公开" : "不公开列出"}</span>
                </div>
                <h2 className="mt-5 truncate text-lg font-semibold">{skill.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#9d9d9d]">{skill.tagline}</p>
                <div className="mt-5 text-xs text-[#707070]">{skill.hasCanvasTemplate ? `${skill.nodeCount} 个画布节点` : "纯指令 Skill"}</div>
                <div className="mt-auto flex items-center gap-2 border-t border-[#303030] pt-5">
                  <button onClick={() => void useSkill(skill)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#e6e6e6]">使用</button>
                  <Link href={`/skills/${encodeURIComponent(skill.id)}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`} className="rounded-lg px-3 py-2 text-sm text-[#bdbdbd] transition hover:bg-[#2b2b2b] hover:text-white">编辑</Link>
                  <button onClick={() => void removeSkill(skill)} className="ml-auto rounded-lg px-3 py-2 text-sm text-[#8c8c8c] transition hover:bg-[#2b1c1c] hover:text-[#ff9b9b]">删除</button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
