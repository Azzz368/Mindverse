import { postJson } from "@/shared/api/client";
import type {
  EditImageRequest,
  EditImageResponse,
  PollTaskRequest,
  PollTaskResponse,
  RunNodeRequest,
  RunNodeResponse,
} from "@/shared/api/aiContracts";

export const runNodeRemote = (request: RunNodeRequest) =>
  postJson<RunNodeResponse>("/api/ai/run-node", request, "AI request failed.");

export const pollTaskRemote = (request: PollTaskRequest) =>
  postJson<PollTaskResponse>("/api/ai/poll-task", request, "Task polling failed.");

export const requestImageRevision = (request: EditImageRequest) =>
  postJson<EditImageResponse>("/api/ai/edit-image", request, "Image revision failed.");
