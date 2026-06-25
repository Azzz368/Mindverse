import { NextResponse } from "next/server";
import { normalizeAIError } from "@/lib/ai/errors";
import { createKlingElement, describeKlingElement, deleteKlingElement } from "@/lib/ai/tokenstar/klingVideoProvider";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: unknown; name?: unknown; imageUrl?: unknown; elementId?: unknown };

    if (body.action === "create") {
      if (typeof body.name !== "string" || !body.name.trim())
        return NextResponse.json({ ok: false, error: { message: "name is required.", status: 400 } }, { status: 400 });
      if (typeof body.imageUrl !== "string" || !body.imageUrl.trim())
        return NextResponse.json({ ok: false, error: { message: "imageUrl is required.", status: 400 } }, { status: 400 });
      return NextResponse.json({ ok: true, output: await createKlingElement(body.name, body.imageUrl) });
    }

    if (body.action === "describe") {
      if (typeof body.elementId !== "string" || !body.elementId.trim())
        return NextResponse.json({ ok: false, error: { message: "elementId is required.", status: 400 } }, { status: 400 });
      return NextResponse.json({ ok: true, output: await describeKlingElement(body.elementId) });
    }

    if (body.action === "delete") {
      if (typeof body.elementId !== "string" || !body.elementId.trim())
        return NextResponse.json({ ok: false, error: { message: "elementId is required.", status: 400 } }, { status: 400 });
      await deleteKlingElement(body.elementId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: { message: "action must be create, describe, or delete.", status: 400 } }, { status: 400 });
  } catch (error) {
    const e = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: e }, { status: e.status });
  }
}
