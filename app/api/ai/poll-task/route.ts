import { NextResponse } from "next/server";
import { normalizeAIError } from "@/lib/ai/errors";
import { getAIProvider, getImageAIProvider } from "@/lib/ai/provider";
import { pollKlingImageVideo } from "@/lib/ai/klingVideoProvider";
import { pollKlingVideo, pollSeedanceVideo } from "@/lib/ai/tokenstar/tokenstarVideoProvider";
import { pollSora2ImageVideo } from "@/lib/ai/sora2VideoProvider";
import { archiveResultMedia } from "@/lib/storage/mediaArchive";

const types = ["video", "audio", "image"] as const;

export async function POST(request: Request) {
	try {
		const body = await request.json() as { type?: unknown; taskId?: unknown; provider?: unknown; pollUrl?: unknown; pollAction?: unknown };
		if (!types.includes(body.type as typeof types[number]) || typeof body.taskId !== "string" || !body.taskId) {
			return NextResponse.json({ ok: false, error: { message: "A valid task type and taskId are required.", code: "INVALID_REQUEST", status: 400 } }, { status: 400 });
		}

		if (body.type === "video" && body.provider === "302-sora2") {
			if (typeof body.pollUrl !== "string") return NextResponse.json({ ok: false, error: { message: "Sora-2 task is missing its polling URL.", status: 400 } }, { status: 400 });
			const output = await pollSora2ImageVideo(body.pollUrl, body.taskId);
			return NextResponse.json({ ok: true, provider: "302-sora2", output: await archiveResultMedia(output, { sourceProvider: "302-sora2", sourceTaskId: body.taskId, mediaTypeHint: "video" }), polling: { intervalMs: 5000 } });
		}

		if (body.type === "video" && (body.provider === "kling" || (!body.provider && process.env.AI_VIDEO_PROVIDER === "kling"))) {
			const output = await pollKlingImageVideo(body.taskId);
			return NextResponse.json({ ok: true, provider: "kling", output: await archiveResultMedia(output, { sourceProvider: "kling", sourceTaskId: body.taskId, mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.KLING_POLL_INTERVAL_MS || 5000) } });
		}

		if (body.type === "video" && (body.provider === "tokenstar" || (!body.provider && process.env.AI_VIDEO_PROVIDER === "tokenstar"))) {
			const output = typeof body.pollAction === "string" && body.pollAction ? await pollKlingVideo(body.taskId, body.pollAction) : await pollSeedanceVideo(body.taskId);
			return NextResponse.json({ ok: true, provider: "tokenstar", output: await archiveResultMedia(output, { sourceProvider: "tokenstar", sourceTaskId: body.taskId, mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 12000) } });
		}

		const provider = body.type === "image" ? getImageAIProvider() : getAIProvider();
		if (!provider.pollTask) return NextResponse.json({ ok: false, error: { message: "This provider does not support task polling.", code: "POLLING_UNAVAILABLE", status: 400 } }, { status: 400 });
		const output = await provider.pollTask(body.type as typeof types[number], body.taskId);
		return NextResponse.json({ ok: true, provider: provider.name, output: await archiveResultMedia(output, { sourceProvider: provider.name, sourceTaskId: body.taskId, mediaTypeHint: body.type as typeof types[number] }), polling: { intervalMs: Number(process.env.AI_302_POLL_INTERVAL_MS || 3000) } });
	} catch (error) {
		const normalized = normalizeAIError(error);
		return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
	}
}
