import type { NodeExecutionStatus } from "@/types/canvas";
const colors: Record<NodeExecutionStatus, string> = { idle: "bg-slate-700 text-slate-300", running: "bg-amber-400/20 text-amber-200", waiting: "bg-sky-400/15 text-sky-200", success: "bg-emerald-400/15 text-emerald-200", error: "bg-rose-400/15 text-rose-200" };
export function Badge({ status }: { status: NodeExecutionStatus }) { return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[status]}`}>{status}</span>; }
