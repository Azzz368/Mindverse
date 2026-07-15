import "server-only";

export class QwenCloudError extends Error {
  code: string;
  status: number;
  requestId?: string;
  qwenCode?: string;

  constructor(message: string, options: { code?: string; status?: number; requestId?: string; qwenCode?: string } = {}) {
    super(message);
    this.name = "QwenCloudError";
    this.code = options.code || "QWEN_ERROR";
    this.status = options.status || 500;
    this.requestId = options.requestId;
    this.qwenCode = options.qwenCode;
  }
}

const friendlyMessage = (message: string) => {
  if (/ASR text check failed|wer\s*:/i.test(message)) {
    return "Voice clone transcript does not match the reference audio. Leave Transcript blank unless it is an exact word-for-word transcript.";
  }
  return message;
};

export const qwenErrorPayload = (error: unknown) => {
  if (error instanceof QwenCloudError) {
    return {
      message: friendlyMessage(error.message),
      code: error.code,
      status: error.status,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  return {
    message: friendlyMessage(error instanceof Error ? error.message : "QwenCloud request failed."),
    code: "QWEN_ERROR",
    status: 500,
  };
};
