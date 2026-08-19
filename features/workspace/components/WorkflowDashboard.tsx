"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkflowRemote, deleteWorkflowRemote, renameWorkflowRemote } from "@/features/workspace/services/workflowClient";
import type { WorkflowSummary } from "@/shared/api/workflowContracts";

type Props = { user: { name: string; email: string }; workspace: { name: string }; initialWorkflows: WorkflowSummary[] };

const previewImages = [
  "/website/flowvideo/toplist/1.png",
  "/website/flowvideo/toplist/2.png",
  "/website/flowvideo/toplist/3.png",
  "/website/flowvideo/toplist/4.png",
  "/website/flowvideo/toplist/5.png",
  "/website/flowvideo/toplist/6.png",
  "/website/1.png",
];

type SideIconKind = "home" | "building" | "share" | "folder" | "rewind" | "sync" | "settings";

function formatWorkflowDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatEditedAgo(value: string) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "Edited just now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Edited ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Edited ${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Edited ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

function SideIcon({ kind }: { kind: SideIconKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SideIconKind, React.ReactNode> = {
    home: <><path d="m1 8 8.5-7L18 8" {...common} /><path d="M3.5 9.5v8.8h12V9.5M7 18.3v-5h5v5" {...common} /></>,
    building: <><path d="M1 17.5V6.8L6.5 2l5.5 4.8v10.7H1Z" {...common} /><path d="M12 8h6v9.5h-6M4 10h4M4 13h4M6 17.5v-2.7" {...common} /></>,
    share: <><circle cx="4" cy="10" r="3" {...common} /><circle cx="16" cy="4" r="3" {...common} /><circle cx="16" cy="16" r="3" {...common} /><path d="m6.7 8.7 6.6-3.4M6.7 11.3l6.6 3.4" {...common} /></>,
    folder: <><path d="M1 5.2h6l1.8 2h9.2v9.1c0 .9-.7 1.7-1.7 1.7H2.7c-.9 0-1.7-.7-1.7-1.7V5.2Z" {...common} /><path d="M4.8 2h9.7v3.2" {...common} /></>,
    rewind: <><path d="M3 7a7.8 7.8 0 1 1-1 7.2" {...common} /><path d="m3 3.5-.7 4 4 .7M10 6.5v4l-3 1.5" {...common} /></>,
    sync: <><path d="M17.5 5.5A7.7 7.7 0 0 0 3 7.3L1.5 5.8M2 12.5A7.7 7.7 0 0 0 16.6 11l1.5 1.5" {...common} /><path d="m1.5 5.8.3 3.2M18.1 12.5l-.3-3.2" {...common} /></>,
    settings: <path d="M6.49705 3L7.11134 1.41429C7.21494 1.14581 7.3972 0.914872 7.63427 0.751732C7.87133 0.588591 8.15214 0.50085 8.43991 0.5H9.61134C9.89911 0.50085 10.1799 0.588591 10.417 0.751732C10.654 0.914872 10.8363 1.14581 10.9399 1.41429L11.5542 3L13.6399 4.2L15.3256 3.94286C15.6063 3.90476 15.892 3.95096 16.1464 4.0756C16.4007 4.20024 16.6123 4.39769 16.7542 4.64286L17.3256 5.64286C17.4721 5.89193 17.5395 6.17954 17.5191 6.46774C17.4987 6.75595 17.3914 7.03119 17.2113 7.25714L16.1685 8.58571V10.9857L17.2399 12.3143C17.42 12.5402 17.5273 12.8155 17.5477 13.1037C17.5681 13.3919 17.5006 13.6795 17.3542 13.9286L16.7828 14.9286C16.6409 15.1737 16.4293 15.3712 16.1749 15.4958C15.9206 15.6205 15.6349 15.6667 15.3542 15.6286L13.6685 15.3714L11.5828 16.5714L10.9685 18.1571C10.8649 18.4256 10.6826 18.6566 10.4456 18.8197C10.2085 18.9828 9.92768 19.0706 9.63991 19.0714H8.43991C8.15214 19.0706 7.87133 18.9828 7.63427 18.8197C7.3972 18.6566 7.21494 18.4256 7.11134 18.1571L6.49705 16.5714L4.41134 15.3714L2.72562 15.6286C2.44493 15.6667 2.15925 15.6205 1.90489 15.4958C1.65052 15.3712 1.43894 15.1737 1.29705 14.9286L0.725625 13.9286C0.579199 13.6795 0.511735 13.3919 0.532139 13.1037C0.552543 12.8155 0.659854 12.5402 0.839911 12.3143L1.88277 10.9857V8.58571L0.811339 7.25714C0.631283 7.03119 0.523971 6.75595 0.503568 6.46774C0.483164 6.17954 0.550627 5.89193 0.697053 5.64286L1.26848 4.64286C1.41037 4.39769 1.62195 4.20024 1.87631 4.0756C2.13068 3.95096 2.41636 3.90476 2.69705 3.94286L4.38277 4.2L6.49705 3ZM6.16848 9.78571C6.16848 10.3508 6.33605 10.9032 6.65 11.3731C6.96394 11.8429 7.41017 12.2091 7.93224 12.4254C8.45432 12.6416 9.02879 12.6982 9.58303 12.588C10.1373 12.4777 10.6464 12.2056 11.0459 11.806C11.4455 11.4064 11.7176 10.8973 11.8279 10.3431C11.9381 9.78888 11.8815 9.21441 11.6653 8.69233C11.449 8.17026 11.0828 7.72403 10.613 7.41009C10.1431 7.09614 9.59071 6.92857 9.02563 6.92857C8.26786 6.92857 7.54114 7.22959 7.00532 7.76541C6.4695 8.30123 6.16848 9.02795 6.16848 9.78571V9.78571Z" {...common} />,
  };
  const isSettings = kind === "settings";
  return <svg aria-hidden="true" viewBox={isSettings ? "0 0 19 20" : "-1 -1 21 21"} className={`w-[19px] overflow-visible ${isSettings ? "h-[20px]" : "h-[19px]"}`} strokeWidth="1.25">{paths[kind]}</svg>;
}

function ProjectCard({ workflow, index, onRename, onDelete }: { workflow: WorkflowSummary; index: number; onRename: () => void; onDelete: () => void }) {
  return (
    <article className="group relative h-[142px] w-[197px] rounded-[5px] border border-white/75 bg-[#c2c2c2] text-[#575757] shadow-[0_0_0_1px_rgba(0,0,0,.12)] transition-transform hover:-translate-y-1">
      <Link href={`/workspace/${workflow.id}`} className="absolute left-[4px] top-[4px] block h-[112px] w-[188px] overflow-hidden rounded-[5px]">
        <div className="relative h-[112px] overflow-hidden rounded-[5px] bg-[#777]">
          <img src={previewImages[index % previewImages.length]} alt="" className="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-105 group-hover:blur-[7px]" />
          <div className="absolute inset-0 grid place-items-center bg-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"><span className="text-[14px] font-bold text-white drop-shadow">{workflow.name || "Untitled"}</span></div>
        </div>
      </Link>
      <div className="absolute bottom-[5px] left-[7px] right-[5px] flex items-center justify-between text-[8px] font-medium leading-none">
        <span>{formatWorkflowDate(workflow.updatedAt)}</span>
        <span>{formatEditedAgo(workflow.updatedAt)}</span>
      </div>
      <div className="absolute inset-x-[4px] top-[4px] flex justify-end gap-2 rounded-[5px] bg-black/45 p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={onRename} className="text-[9px] text-white hover:text-white/70">Rename</button>
        <button type="button" onClick={onDelete} className="text-[9px] text-white hover:text-red-300">Delete</button>
      </div>
    </article>
  );
}

function CreateCanvasCard({ onCreate, busy }: { onCreate: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onCreate} disabled={busy} className="group relative h-[142px] w-[197px] rounded-[5px] border border-white/75 bg-[#c2c2c2] text-white shadow-[0_0_0_1px_rgba(0,0,0,.12)] transition-transform hover:-translate-y-1 disabled:cursor-wait disabled:opacity-70">
      <div className="absolute left-[4px] top-[4px] h-[112px] w-[188px] overflow-hidden rounded-[5px] bg-[#868686]">
        <img src="/website/flowvideo/toplist/6.png" alt="" className="absolute left-[70px] top-[34px] z-10 h-[31px] w-[31px] rotate-[-6.28deg] rounded-[5px] border border-white/80 object-cover transition-transform duration-300 ease-out group-hover:-translate-x-1" />
        <span className="absolute left-[94px] top-[34px] z-20 grid h-[31px] w-[31px] rotate-[6.81deg] place-items-center rounded-[5px] border border-white/40 bg-white/[0.13] text-[28px] font-light leading-none text-white shadow-[inset_1px_1px_2px_rgba(255,255,255,0.48),inset_-1px_-1px_2px_rgba(0,0,0,0.2),0_2px_5px_rgba(0,0,0,0.18)] backdrop-blur-[3px] transition-transform duration-300 ease-out group-hover:translate-x-1">+</span>
        <span className="absolute left-[46.5px] top-[72px] w-[95px] text-center text-[9px] font-medium leading-[9px]">Create New Canvas</span>
      </div>
    </button>
  );
}

export function WorkflowDashboard({ user, workspace, initialWorkflows }: Props) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const createWorkflow = async () => {
    setBusy(true); setMessage("");
    try {
      const payload = await createWorkflowRemote("Untitled workflow");
      if (!payload.output) throw new Error("Could not create workflow.");
      setWorkflows((items) => [payload.output as WorkflowSummary, ...items]);
      router.push(`/workspace/${payload.output.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create workflow."); } finally { setBusy(false); }
  };

  const renameWorkflow = async (workflow: WorkflowSummary) => {
    const name = window.prompt("Project name", workflow.name)?.trim();
    if (!name) return;
    try {
      const payload = await renameWorkflowRemote(workflow.id, name);
      setWorkflows((items) => items.map((item) => item.id === workflow.id ? { ...item, name, revision: payload.output?.revision || item.revision, updatedAt: payload.output?.updatedAt || new Date().toISOString() } : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not rename workflow."); }
  };

  const deleteWorkflow = async (workflow: WorkflowSummary) => {
    if (!window.confirm(`Delete project "${workflow.name}"?`)) return;
    try { await deleteWorkflowRemote(workflow.id); setWorkflows((items) => items.filter((item) => item.id !== workflow.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete workflow."); }
  };

  const logout = async () => {
    setLoggingOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    catch { setMessage("Logout failed. Please try again."); setLoggingOut(false); }
  };

  const upperNav: SideIconKind[] = ["home", "building", "share"];
  const lowerNav: SideIconKind[] = ["folder", "rewind", "sync"];

  return (
    <main className="min-h-screen overflow-x-auto bg-black font-epilogue text-white" style={{ backgroundImage: "radial-gradient(164.05% 124.18% at 50% 124.18%, #fff6e8 0%, #b0220c 31.25%, transparent 53.64%), radial-gradient(183.83% 316.53% at 18.82% 202.19%, #fff6e8 0%, #b0220c 31.25%, transparent 53.64%)" }}>
      <div className="relative flex min-h-[max(854px,100vh)] min-w-[1440px] justify-center">
        <aside className="absolute inset-y-0 left-0 w-[56px] bg-white/[0.1]">
          <nav className="absolute left-0 top-[137px] flex w-full flex-col items-center gap-[26px]" aria-label="Primary navigation">
            {upperNav.map((kind) => <button key={kind} type="button" title={kind} className="text-white transition hover:text-white/60"><SideIcon kind={kind} /></button>)}
          </nav>
          <div className="absolute left-[13px] top-[274px] h-px w-[31px] bg-[#9c9c9c]" />
          <nav className="absolute left-0 top-[296px] flex w-full flex-col items-center gap-[25px]" aria-label="Project navigation">
            {lowerNav.map((kind, index) => <button key={kind} type="button" title={kind} className={`relative grid h-[31px] w-[31px] place-items-center text-white transition hover:text-white/60 ${index === 0 ? "rounded-[5px] bg-black" : ""}`}><SideIcon kind={kind} /></button>)}
          </nav>
          <button type="button" title="Settings" className="absolute left-[19px] top-[748px] text-white transition hover:text-white/60" onClick={() => setMessage("Settings are coming soon.")}><SideIcon kind="settings" /></button>
          <button type="button" title="Account" className="absolute left-[14px] top-[789px] h-[27px] w-[29px] rounded-[5px] bg-[#d9d9d9]" onClick={() => void logout()} disabled={loggingOut} />
        </aside>

        <section className="workspace-stage w-[1440px] shrink-0 pl-[126px] pt-[58px]">
          <header className="mb-[18px] h-[39px]">
            <h1 className="text-[30px] font-semibold leading-none tracking-wide" style={{ fontFamily: "var(--font-baskervville-bold)" }}>PROJECT</h1>
          </header>

          <div className="mb-[20px] flex gap-[20px]">
            {(["Your projects", "All projects", "Shared with you"] as const).map((label, index) => <button key={label} type="button" className={`h-[29px] w-[111px] rounded-[13px] bg-[#f1f1f1] p-0 text-[10.5px] font-medium leading-[11px] text-black ${index === 0 ? "ring-1 ring-white/40" : "opacity-95"}`}>{label}</button>)}
          </div>

          {message && <div role="alert" className="mb-3 max-w-xl rounded-lg border border-red-300/30 bg-red-950/40 px-4 py-3 text-xs text-red-100">{message}</div>}
          <div className="grid grid-cols-[repeat(6,197px)] gap-x-[13px] gap-y-[13px]">
            <CreateCanvasCard onCreate={() => void createWorkflow()} busy={busy} />
            {workflows.map((workflow, index) => <ProjectCard key={workflow.id} workflow={workflow} index={index} onRename={() => void renameWorkflow(workflow)} onDelete={() => void deleteWorkflow(workflow)} />)}
          </div>
        </section>
      </div>
    </main>
  );
}
