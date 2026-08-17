"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkflowRemote, deleteWorkflowRemote, renameWorkflowRemote } from "@/features/workspace/services/workflowClient";
import type { WorkflowSummary } from "@/shared/api/workflowContracts";

type Props = { user: { name: string; email: string }; workspace: { name: string }; initialWorkflows: WorkflowSummary[] };

export function WorkflowDashboard({ user, workspace, initialWorkflows }: Props) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const createWorkflow = async () => {
    setBusy(true);
    setMessage("");
    try {
      const payload = await createWorkflowRemote("Untitled workflow");
      if (!payload.output) throw new Error("Could not create workflow.");
      setWorkflows((items) => [payload.output as WorkflowSummary, ...items]);
      router.push(`/workspace/${payload.output.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create workflow.");
    } finally { setBusy(false); }
  };

  const renameWorkflow = async (workflow: WorkflowSummary) => {
    const name = window.prompt("项目名称", workflow.name)?.trim();
    if (!name) return;
    try {
      const payload = await renameWorkflowRemote(workflow.id, name);
      setWorkflows((items) => items.map((item) => item.id === workflow.id ? { ...item, name, revision: payload.output?.revision || item.revision, updatedAt: payload.output?.updatedAt || new Date().toISOString() } : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not rename workflow."); }
  };

  const deleteWorkflow = async (workflow: WorkflowSummary) => {
    if (!window.confirm(`删除项目「${workflow.name}」？`)) return;
    try {
      await deleteWorkflowRemote(workflow.id);
      setWorkflows((items) => items.filter((item) => item.id !== workflow.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete workflow."); }
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setMessage("退出登录失败，请检查网络后重试。");
      setLoggingOut(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#111318] dark:bg-[#071018] dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-black/[0.07] bg-white px-5 py-6 dark:border-white/[0.08] dark:bg-[#0c1622] lg:flex lg:flex-col">
          <Link href="/" className="flex items-center gap-3 text-xs font-black tracking-[0.2em]"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#111318] text-white dark:bg-cyan-300 dark:text-[#071018]">M</span>MINDVERSE</Link>
          <div className="mt-10 rounded-2xl border border-[#eceff3] bg-[#fafbfc] p-4 dark:border-white/[0.07] dark:bg-white/[0.035]"><p className="truncate text-sm font-bold">{workspace.name}</p><p className="mt-1 truncate text-xs text-[#77808d] dark:text-slate-500">{user.email}</p></div>
          <nav className="mt-8 space-y-1 text-sm font-semibold"><div className="rounded-xl bg-violet-100 px-3 py-2.5 text-violet-800 dark:bg-violet-400/10 dark:text-violet-300">Projects</div><Link href="/skills" className="block rounded-xl px-3 py-2.5 text-[#59616d] hover:bg-[#f1f3f6] dark:text-slate-400 dark:hover:bg-white/[0.05]">Skills</Link></nav>
          <button onClick={logout} className="mt-auto rounded-xl border border-[#e4e7eb] px-3 py-2.5 text-left text-sm font-semibold text-[#59616d] hover:border-[#bac0c8] dark:border-white/[0.08] dark:text-slate-400">退出登录</button>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-16 items-center border-b border-black/[0.07] bg-white px-5 dark:border-white/[0.08] dark:bg-[#0c1622] sm:px-8">
            <p className="text-sm font-bold">Projects</p>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden text-xs text-[#77808d] sm:block dark:text-slate-500">{user.name}</span>
              <button onClick={() => void logout()} disabled={loggingOut} className="h-10 rounded-xl border border-[#e4e7eb] px-3 text-xs font-semibold text-[#59616d] transition hover:border-[#bac0c8] hover:text-[#111318] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-white sm:px-4">
                {loggingOut ? "正在退出…" : "退出登录"}
              </button>
              <button onClick={createWorkflow} disabled={busy || loggingOut} className="h-10 rounded-xl bg-[#111318] px-3 text-sm font-bold text-white hover:bg-[#272b34] disabled:opacity-50 dark:bg-cyan-300 dark:text-[#071018] dark:hover:bg-cyan-200 sm:px-4">+ 新建项目</button>
            </div>
          </header>
          <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 lg:py-14">
            <div className="mb-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Private workspace</p><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">{user.name} 的创作空间</h1><p className="mt-3 text-sm text-[#69717e] dark:text-slate-400">这里的项目只对你可见。每次修改都会自动保存为新的画布版本。</p></div>
            {message && <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{message}</div>}
            {!workflows.length ? <button onClick={createWorkflow} disabled={busy} className="group grid min-h-64 w-full place-items-center rounded-[28px] border-2 border-dashed border-[#cfd4dc] bg-white text-center transition hover:border-violet-400 hover:bg-violet-50/30 dark:border-white/[0.12] dark:bg-white/[0.025] dark:hover:border-violet-300/50"><span><b className="grid h-12 w-12 place-items-center rounded-2xl bg-[#111318] text-2xl text-white transition group-hover:-translate-y-1 dark:bg-cyan-300 dark:text-[#071018]">+</b><strong className="mt-5 block text-base">创建第一个项目</strong><small className="mt-2 block text-[#7b8390] dark:text-slate-500">从一张空白无限画布开始</small></span></button> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{workflows.map((workflow) => <article key={workflow.id} className="group rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl dark:border-white/[0.08] dark:bg-[#0d1824] dark:hover:border-violet-300/35"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h2 className="truncate text-base font-black">{workflow.name}</h2><p className="mt-2 text-xs text-[#858d99] dark:text-slate-500">版本 {workflow.revision} · {new Date(workflow.updatedAt).toLocaleString()}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">私有</span></div><div className="mt-10 flex items-center border-t border-[#eceef2] pt-4 dark:border-white/[0.07]"><button onClick={() => void renameWorkflow(workflow)} className="text-xs font-semibold text-[#6f7783] hover:text-[#111318] dark:text-slate-500 dark:hover:text-white">重命名</button><button onClick={() => void deleteWorkflow(workflow)} className="ml-4 text-xs font-semibold text-[#6f7783] hover:text-rose-600 dark:text-slate-500">删除</button><Link href={`/workspace/${workflow.id}`} className="ml-auto rounded-xl bg-[#111318] px-4 py-2 text-xs font-bold text-white dark:bg-cyan-300 dark:text-[#071018]">打开画布</Link></div></article>)}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
