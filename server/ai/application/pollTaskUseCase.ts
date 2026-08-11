import "server-only";
import { getAIProvider, getImageAIProvider } from "@/server/ai/provider";
import { pollKlingImageVideo } from "@/server/ai/klingVideoProvider";
import { pollKlingOmniVideo, pollKlingVideo, pollSeedanceVideo } from "@/server/ai/tokenstar/tokenstarVideoProvider";
import { pollSora2ImageVideo } from "@/server/ai/sora2VideoProvider";
import { pollHKGAIMinimaxVideo } from "@/server/ai/hkgaiVideoProvider";
import { pollVolcengineOmniHuman } from "@/server/ai/volcengineOmniHumanProvider";
import { archiveResultMedia } from "@/server/storage/mediaArchive";
import { verifyCompletedVideoAspectRatio } from "@/server/ai/videoAspectRatio";
import type { RunNodeResult } from "./runNodeUseCase";
import { pollMotionJob } from "@/server/motion/motionJobRunner";

export type PollableTaskType = "video" | "audio" | "image" | "motion";

export const isPollableTaskType = (value: unknown): value is PollableTaskType =>
  ["video", "audio", "image", "motion"].includes(String(value));

export type PollTaskParams = { type: PollableTaskType; taskId: string; provider?: string; pollUrl?: string; pollAction?: string; expectedAspectRatio?: string };

export async function pollTaskUseCase(params: PollTaskParams): Promise<RunNodeResult> {
  const { type, taskId, provider: videoProvider, pollUrl, pollAction, expectedAspectRatio } = params;

  if (type === "motion") {
    const job = await pollMotionJob(taskId);
    if (!job) return { ok: false, error: { message: "Motion task was not found. It may have expired after a deployment.", code: "MOTION_TASK_NOT_FOUND", status: 404 } };
    const output = job.status === "completed"
      ? { ...job.output, status: "completed", taskId: job.id, phase: job.phase, progress: job.progress, message: job.message }
      : { status: job.status, taskId: job.id, phase: job.phase, progress: job.progress, message: job.message, errorMessage: job.errorMessage };
    return { ok: true, provider: "hyperframes", output, polling: { intervalMs: job.status === "completed" || job.status === "failed" ? 0 : 2500 } };
  }

  if (type === "video" && videoProvider === "302-sora2") {
    if (!pollUrl) return { ok: false, error: { message: "Sora-2 task is missing its polling URL.", status: 400 } };
    const output = await pollSora2ImageVideo(pollUrl, taskId);
    const verified = await verifyCompletedVideoAspectRatio(output, expectedAspectRatio);
    return { ok: true, provider: "302-sora2", output: await archiveResultMedia(verified, { sourceProvider: "302-sora2", sourceTaskId: taskId, mediaTypeHint: "video" }), polling: { intervalMs: 5000 } };
  }

  if (type === "video" && videoProvider === "volcengine") {
    const output = await pollVolcengineOmniHuman(taskId);
    return { ok: true, provider: "volcengine", output, polling: { intervalMs: output.status === "completed" || output.status === "failed" ? 0 : Number(process.env.VOLCENGINE_OMNIHUMAN_POLL_INTERVAL_MS || 10_000) } };
  }

  if (type === "video" && (videoProvider === "hkgai" || (!videoProvider && process.env.AI_VIDEO_PROVIDER === "hkgai"))) {
    const output = await pollHKGAIMinimaxVideo(taskId);
    const verified = await verifyCompletedVideoAspectRatio(output, expectedAspectRatio);
    return { ok: true, provider: "hkgai", output: verified, polling: { intervalMs: verified.status === "completed" || verified.status === "failed" ? 0 : Number(process.env.HKGAI_VIDEO_POLL_INTERVAL_MS || 5000) } };
  }

  if (type === "video" && (videoProvider === "kling" || (!videoProvider && process.env.AI_VIDEO_PROVIDER === "kling"))) {
    const output = await pollKlingImageVideo(taskId);
    const verified = await verifyCompletedVideoAspectRatio(output, expectedAspectRatio);
    return { ok: true, provider: "kling", output: await archiveResultMedia(verified, { sourceProvider: "kling", sourceTaskId: taskId, mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.KLING_POLL_INTERVAL_MS || 5000) } };
  }

  if (type === "video" && (videoProvider === "tokenstar" || (!videoProvider && process.env.AI_VIDEO_PROVIDER === "tokenstar"))) {
    if (pollAction === "omni-video") {
      const output = await pollKlingOmniVideo(taskId);
      const verified = await verifyCompletedVideoAspectRatio(output, expectedAspectRatio);
      return { ok: true, provider: "tokenstar", output: await archiveResultMedia(verified, { sourceProvider: "tokenstar", sourceTaskId: taskId, mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 12000) } };
    }
    const output = pollAction ? await pollKlingVideo(taskId, pollAction) : await pollSeedanceVideo(taskId);
    const verified = await verifyCompletedVideoAspectRatio(output, expectedAspectRatio);
    return { ok: true, provider: "tokenstar", output: await archiveResultMedia(verified, { sourceProvider: "tokenstar", sourceTaskId: taskId, mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 12000) } };
  }

  const provider = type === "image" ? getImageAIProvider() : getAIProvider();
  if (!provider.pollTask) return { ok: false, error: { message: "This provider does not support task polling.", code: "POLLING_UNAVAILABLE", status: 400 } };
  const output = await provider.pollTask(type, taskId);
  const verified = type === "video" ? await verifyCompletedVideoAspectRatio(output, expectedAspectRatio) : output;
  return { ok: true, provider: provider.name, output: await archiveResultMedia(verified, { sourceProvider: provider.name, sourceTaskId: taskId, mediaTypeHint: type }), polling: { intervalMs: Number(process.env.AI_302_POLL_INTERVAL_MS || 3000) } };
}
