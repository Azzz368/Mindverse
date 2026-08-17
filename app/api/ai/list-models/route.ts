import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { getAIProvider } from "@/server/ai/provider";
import { requireSession } from "@/server/auth/auth";
export async function GET(request: Request) { try { await requireSession(request); const provider = getAIProvider(); return NextResponse.json({ ok: true, provider: provider.name, models: await provider.listModels?.() ?? [] }); } catch (error) { const normalized = normalizeAIError(error); return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status }); } }
