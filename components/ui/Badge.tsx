import type { NodeExecutionStatus } from "@/shared/canvas";
const colors: Record<NodeExecutionStatus, string> = {
  idle:    "bg-[#f0f1f3] text-[#676f7b] dark:bg-slate-700 dark:text-slate-300",
  running: "bg-amber-50 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
  waiting: "bg-sky-50 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
  error:   "bg-rose-50 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
};
export function Badge({ status }: { status: NodeExecutionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[status]}`}>
      {status}
    </span>
  );
}
