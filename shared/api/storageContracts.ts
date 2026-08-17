export type ArchiveMediaResponse = { ok: true; output?: { cdnUrl?: unknown } };

export type ExtractVideoFrameRequest = {
  videoUrl: string;
  sourceStorageKey?: string;
  mode: "last" | "timestamp";
  timestampSeconds?: number;
  sourceNodeId?: string;
  projectId?: string;
};

export type ExtractVideoFrameOutput = {
  status: "completed";
  imageUrl: string;
  frameMode: "last" | "timestamp";
  timestampSeconds: number;
  width?: number;
  height?: number;
  sourceVideoUrl: string;
  sourceVideoNodeId?: string;
  archivedMedia?: unknown[];
};

export type ExtractVideoFrameResponse = { ok: true; output?: ExtractVideoFrameOutput };
