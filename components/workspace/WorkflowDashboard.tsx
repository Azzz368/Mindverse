"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WorkflowSummary = { id: string; name: string; createdAt: string; updatedAt: string };

const ACCESS_KEY = "mindverse-access-code";

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
      const response = await fetch(`/api/workflows?accessCode=${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; output?: { workflows?: WorkflowSummary[] }; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Access denied.");
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
      const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode, name: "Untitled workflow" }) });
      const payload = await response.json() as { ok?: boolean; output?: WorkflowSummary; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.output) throw new Error(payload.error?.message || "Could not create workflow.");
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
    const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode, name }) });
    const payload = await response.json() as { ok?: boolean; output?: WorkflowSummary; error?: { message?: string } };
    if (!response.ok || !payload.ok) {
      setMessage(payload.error?.message || "Could not rename workflow.");
      return;
    }
    setWorkflows((items) => items.map((item) => item.id === workflow.id ? { ...item, name, updatedAt: payload.output?.updatedAt || new Date().toISOString() } : item));
  };

  const deleteWorkflow = async (workflow: WorkflowSummary) => {
    if (!window.confirm(`Delete workflow "${workflow.name}"?`)) return;
    const response = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}?accessCode=${encodeURIComponent(accessCode)}`, { method: "DELETE" });
    const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
    if (!response.ok || !payload.ok) {
      setMessage(payload.error?.message || "Could not delete workflow.");
      return;
    }
    setWorkflows((items) => items.filter((item) => item.id !== workflow.id));
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
            <div className="bg-[#f2edff] px-3 py-2 text-[#6d28d9]">Projects</div>
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
              {verified && <button onClick={createWorkflow} disabled={busy} className="h-8 bg-[#030303] px-4 text-sm font-semibold text-white disabled:opacity-50">+ New</button>}
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1080px] px-6 py-10">
            <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">Overview</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#676f7b]">输入访问码后，这台电脑会进入共享工作区。没有访问码时保持空白画布入口，不加载任何共享 workflow。</p>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void loadWorkflows(accessCode); }} className="flex w-full max-w-sm gap-2">
                <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="Access code" className="h-9 min-w-0 flex-1 border border-[#c9ccd1] px-3 text-sm outline-none focus:border-[#030303]" />
                <button disabled={busy} className="h-9 bg-[#030303] px-4 text-sm font-semibold text-white disabled:opacity-50">Enter</button>
              </form>
            </div>

            {message && <div className="mb-6 border border-[#c9ccd1] px-4 py-3 text-sm text-[#404040]">{message}</div>}

            <h2 className="mb-5 text-base font-semibold">Projects</h2>
            {!verified ? (
              <div className="grid gap-5 md:grid-cols-3">
                <div className="border border-[#e7eaf0] bg-white p-4">
                  <h3 className="font-semibold">Blank canvas</h3>
                  <p className="mt-5 inline-flex bg-[#f0f1f3] px-2 py-1 text-xs text-[#404040]">No shared workflows loaded</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="border border-[#e7eaf0] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{workflow.name}</h3>
                        <p className="mt-5 inline-flex bg-[#d9fbe8] px-2 py-1 text-xs text-[#047857]">Shared workflow</p>
                      </div>
                      <div className="flex shrink-0 gap-2 text-xs">
                        <button onClick={() => void renameWorkflow(workflow)} className="text-[#404040] hover:text-[#030303]">Rename</button>
                        <button onClick={() => void deleteWorkflow(workflow)} className="text-[#404040] hover:text-[#030303]">Delete</button>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-[#e7eaf0] pt-3">
                      <span className="text-xs text-[#939393]">Updated {new Date(workflow.updatedAt).toLocaleString()}</span>
                      <Link href={`/workspace/${workflow.id}`} className="bg-[#030303] px-4 py-2 text-sm font-semibold text-white">Open</Link>
                    </div>
                  </div>
                ))}
                <button onClick={createWorkflow} disabled={busy} className="min-h-28 border border-dashed border-[#c9ccd1] bg-white p-4 text-sm text-[#404040] disabled:opacity-50">+ Create new project</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
