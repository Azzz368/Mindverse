export type ArchivedMedia = {
  storageProvider: "bunny";
  mediaType: "image" | "video" | "audio";
  originalUrl?: string;
  cdnUrl: string;
  storageKey: string;
  mimeType?: string;
  sizeBytes?: number;
  sourceProvider?: string;
  sourceTaskId?: string;
};
