import { NextResponse } from "next/server";
import { normalizeAIError } from "@/lib/ai/errors";
import { getAIProvider } from "@/lib/ai/provider";

type EditRequest = { sourceImageUrl?: unknown; prompt?: unknown; maskImageUrl?: unknown; annotationDocument?: unknown; annotationSnapshotDataUrl?: unknown; size?: unknown; quality?: unknown; outputFormat?: unknown };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finalImageInstruction = "Do not include arrows, labels, rectangles, text annotations, or guide marks in the final image. Preserve unmarked areas as much as possible.";

export async function POST(request: Request) {
  try {
    const body = await request.json() as EditRequest;
    const sourceImageUrl = text(body.sourceImageUrl);
    const prompt = text(body.prompt);
    if (!sourceImageUrl || !prompt) return NextResponse.json({ ok: false, error: { message: "sourceImageUrl and prompt are required.", status: 400 } }, { status: 400 });
    const annotationDocument = text(body.annotationDocument);
    // annotationSnapshotDataUrl is deliberately not used as the main image: the source image must be edited directly.
    const mergedPrompt = [prompt, annotationDocument && `Annotation summary:\n${annotationDocument}`, finalImageInstruction].filter(Boolean).join("\n\n");
    const provider = getAIProvider();
    const output = await provider.editImageWithAnnotations({
      sourceImageUrl,
      prompt: mergedPrompt,
      maskImageUrl: text(body.maskImageUrl) || undefined,
      size: text(body.size) || undefined,
      quality: ["low", "medium", "high", "auto"].includes(text(body.quality)) ? text(body.quality) as "low" | "medium" | "high" | "auto" : undefined,
      outputFormat: ["png", "jpeg", "webp"].includes(text(body.outputFormat)) ? text(body.outputFormat) as "png" | "jpeg" | "webp" : undefined
    });
    if (output.status !== "completed" || !output.revisedImageUrl) throw new Error("302.AI image edit completed without a revised image URL.");
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message, status: normalized.status } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
