import { NextResponse } from "next/server";
import { createAssetGroup } from "@/server/ai/tokenstar/tokenstarAsset";
import { normalizeAIError } from "@/server/ai/errors";
export async function POST(request: Request) { try { const body = await request.json() as { name?: unknown }; if (typeof body.name !== "string" || !body.name) return NextResponse.json({ ok: false, error: { message: "name is required.", status: 400 } }, { status: 400 }); return NextResponse.json({ ok: true, output: await createAssetGroup(body.name) }); } catch (error) { const e = normalizeAIError(error); return NextResponse.json({ ok: false, error: e }, { status: e.status }); } }
