import "server-only";

import { createMotionComposition, type MotionCompositionInput, type MotionProgressUpdate } from "./motionCompositionRunner";
import { createMotionJob, getMotionJob, updateMotionJob, type MotionJobRecord } from "./motionJobStorage";

const activeJobs = new Map<string, Promise<void>>();
let queue: Promise<void> = Promise.resolve();

const toOutput = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : { value };

async function execute(jobId: string) {
  const job = await getMotionJob(jobId);
  if (!job || job.status === "completed" || job.status === "failed") return;
  try {
    await updateMotionJob(jobId, { status: "running", phase: "preparing", message: "Preparing media and HyperFrames project.", progress: 5 });
    const output = await createMotionComposition(job.input, {
      onProgress: async (update: MotionProgressUpdate) => {
        await updateMotionJob(jobId, { status: "running", ...update });
      },
    });
    await updateMotionJob(jobId, {
      status: "completed",
      phase: "completed",
      message: "Video rendered and uploaded.",
      progress: 100,
      output: toOutput(output),
      errorMessage: undefined,
    });
  } catch (error) {
    await updateMotionJob(jobId, {
      status: "failed",
      phase: "failed",
      message: "Motion job failed.",
      errorMessage: error instanceof Error ? error.message : "Motion render failed.",
    }).catch(() => undefined);
  }
}

function schedule(jobId: string) {
  if (activeJobs.has(jobId)) return;
  const run = queue.then(() => execute(jobId));
  activeJobs.set(jobId, run);
  queue = run.catch(() => undefined);
  void run.finally(() => activeJobs.delete(jobId));
}

export async function enqueueMotionJob(input: MotionCompositionInput): Promise<MotionJobRecord> {
  const job = await createMotionJob(input);
  schedule(job.id);
  return job;
}

export async function pollMotionJob(jobId: string) {
  const job = await getMotionJob(jobId);
  if (!job) return null;
  const staleMs = Math.max(60_000, Number(process.env.MINDVERSE_MOTION_STALE_MS || 20 * 60_000));
  if ((job.status === "pending" || job.status === "running") && Date.now() - Date.parse(job.heartbeatAt) > staleMs) {
    return updateMotionJob(job.id, {
      status: "failed",
      phase: "failed",
      message: "Motion worker stopped before completion.",
      errorMessage: "The Motion worker was restarted or lost while rendering. Run the node again to start a new job.",
    });
  }
  return job;
}
