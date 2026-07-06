import type { CanvasSnapshot } from "@/shared/canvas";
const KEY = "lumen-flow-canvas-v1";
export const canvasStorage = { save: (snapshot: CanvasSnapshot) => localStorage.setItem(KEY, JSON.stringify(snapshot)), load: (): CanvasSnapshot | null => { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as CanvasSnapshot : null; }, clear: () => localStorage.removeItem(KEY) };
