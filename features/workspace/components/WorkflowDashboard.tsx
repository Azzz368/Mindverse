"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACCESS_KEY, createWorkflowRemote, deleteWorkflowRemote, listWorkflows, renameWorkflowRemote } from "@/features/workspace/services/workflowClient";
import type { WorkflowSummary } from "@/shared/api/workflowContracts";

export function WorkflowDashboard() {
  const [accessCode, setAccessCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadWorkflows = async (code: string) => {
    setBusy(true);
    setMessage("");
    try {
      const payload = await listWorkflows(code);
      window.localStorage.setItem(ACCESS_KEY, code);
      setVerified(true);
      setWorkflows(payload.output?.workflows || []);
    } catch (error) {
      setVerified(false);
      setWorkflows([]);
      setMessage(error instanceof Error ? error.message : "Access denied.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(ACCESS_KEY) || "";
    if (saved) {
      setAccessCode(saved);
      void loadWorkflows(saved);
    }
  }, []);

  const createWorkflow = async () => {
    setBusy(true);
    try {
      const payload = await createWorkflowRemote(accessCode, "Untitled workflow");
      if (!payload.output) throw new Error("Could not create workflow.");
      setWorkflows((items) => [payload.output as WorkflowSummary, ...items]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create workflow.");
    } finally {
      setBusy(false);
    }
  };

  const renameWorkflow = async (workflow: WorkflowSummary) => {
    const name = window.prompt("Workflow name", workflow.name)?.trim();
    if (!name) return;
    try {
      const payload = await renameWorkflowRemote(workflow.id, accessCode, name);
      setWorkflows((items) => items.map((item) => item.id === workflow.id ? { ...item, name, updatedAt: payload.output?.updatedAt || new Date().toISOString() } : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rename workflow.");
    }
  };

  const deleteWorkflow = async (workflow: WorkflowSummary) => {
    if (!window.confirm(`Delete workflow "${workflow.name}"?`)) return;
    try {
      await deleteWorkflowRemote(workflow.id, accessCode);
      setWorkflows((items) => items.filter((item) => item.id !== workflow.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete workflow.");
    }
  };

  return (
    <main className="min-h-screen bg-white text-[#030303]">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-[#e7eaf0] bg-[#fbfbfb] px-4 py-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0e7dd] text-xs font-medium">M</div>
            <div>
              <p className="text-sm font-medium">My Workspace</p>
              <p className="text-[11px] text-[#676f7b]">Access workspace</p>
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <div className="rounded px-3 py-2 bg-[#f2edff] text-[#6d28d9]">Projects</div>
            <div className="px-3 py-2 text-[#404040]">Blueprints</div>
            <div className="px-3 py-2 text-[#404040]">Environment Groups</div>
          </nav>
          <div className="mt-8 text-[11px] uppercase tracking-[0.2em] text-[#939393]">Workspace</div>
          <div className="mt-3 space-y-1 text-sm text-[#404040]">
            <div className="px-3 py-2">Shared workflows</div>
            <div className="px-3 py-2">Settings</div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center border-b border-[#e7eaf0] px-6">
            <p className="text-sm font-medium">Projects</p>
            <div className="ml-auto flex items-center gap-2">
              {verified && <button onClick={createWorkflow} disabled={busy} className="h-8 rounded bg-[#030303] px-4 text-sm font-semibold text-white disabled:opacity-50">+ New</button>}
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1080px] px-6 py-10">
            <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">Overview</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#676f7b]">输入访问码后，这台电脑会进入共享工作区。没有访问码时保持空白画布入口，不加载任何共享 workflow。</p>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void loadWorkflows(accessCode); }} className="flex w-full max-w-sm gap-2">
                <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="Access code" className="h-9 min-w-0 flex-1 rounded border border-[#c9ccd1] px-3 text-sm outline-none focus:border-[#030303]" />
                <button disabled={busy} className="h-9 rounded bg-[#030303] px-4 text-sm font-semibold text-white disabled:opacity-50">Enter</button>
              </form>
            </div>

            {message && <div className="mb-6 rounded border border-[#c9ccd1] px-4 py-3 text-sm text-[#404040]">{message}</div>}

            <h2 className="mb-5 text-base font-semibold">Projects</h2>
            {!verified ? (
              <div className="grid gap-5 md:grid-cols-3">
                <Link href="/workspace/local" className="block rounded border border-[#e7eaf0] bg-white p-4 transition hover:border-[#404040] hover:bg-[#fafafa]">
                  <h3 className="font-semibold">Blank canvas</h3>
                  <p className="mt-5 inline-flex rounded bg-[#f0f1f3] px-2 py-1 text-xs text-[#404040]">No shared workflows loaded</p>
                </Link>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="group flex flex-col rounded border border-[#e7eaf0] bg-white p-4 transition-all duration-300 hover:border-[#404040] hover:bg-[#fafafa]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 transition-transform duration-300 group-hover:translate-x-1">
                        <h3 className="truncate font-semibold transition-all duration-300 group-hover:font-extrabold group-hover:text-[1.05rem]">{workflow.name}</h3>
                        <p className="mt-5 inline-flex rounded bg-[#d9fbe8] px-2 py-1 text-xs text-[#047857] transition-all duration-300 group-hover:bg-[#047857] group-hover:text-white group-hover:font-bold">Shared workflow</p>
                      </div>
                      <div className="flex shrink-0 gap-2 text-xs opacity-80 transition-opacity duration-300 group-hover:opacity-100">
                        <button onClick={() => void renameWorkflow(workflow)} className="text-[#404040] transition-colors hover:text-[#030303] hover:font-bold">Rename</button>
                        <button onClick={() => void deleteWorkflow(workflow)} className="text-[#404040] transition-colors hover:text-[#030303] hover:font-bold">Delete</button>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-[#e7eaf0] pt-3 transition-colors duration-300 group-hover:border-[#c9ccd1]">
                      <span className="text-xs text-[#939393] transition-colors duration-300 group-hover:text-[#676f7b]">Updated {new Date(workflow.updatedAt).toLocaleString()}</span>
                      <Link href={`/workspace/${workflow.id}`} className="rounded bg-[#030303] px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#1a1a1a] hover:px-5">Open</Link>
                    </div>
                  </div>
                ))}
                <button onClick={createWorkflow} disabled={busy} className="animated-dash min-h-28 rounded bg-white p-4 text-sm font-medium text-[#404040] transition-all duration-300 hover:font-bold hover:text-[#030303] disabled:opacity-50">+ Create new project</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
