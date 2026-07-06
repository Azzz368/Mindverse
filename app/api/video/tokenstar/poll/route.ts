import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { pollSeedanceVideo } from "@/server/ai/tokenstar/tokenstarVideoProvider";
export async function POST(request: Request) { try { const body = await request.json() as { taskId?: unknown }; if (typeof body.taskId !== "string" || !body.taskId) return NextResponse.json({ ok: false, error: { message: "taskId is required.", status: 400 } }, { status: 400 }); return NextResponse.json({ ok: true, provider: "tokenstar", output: await pollSeedanceVideo(body.taskId), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 5000) } }); } catch (error) { const e = normalizeAIError(error); return NextResponse.json({ ok: false, error: e }, { status: e.status }); } }
