export type AIProviderName = "mock" | "302ai";
export type GenerateTextInput = { prompt: string; systemPrompt?: string; model?: string; temperature?: number; upstreamContext?: unknown };
export type GenerateTextOutput = { text: string; raw?: unknown };
export type GenerateImageInput = { prompt: string; negativePrompt?: string; model?: string; size?: string; aspectRatio?: string; referenceImageUrl?: string };
export type GenerateImageOutput = { imageUrl?: string; taskId?: string; status: "completed" | "pending" | "failed"; raw?: unknown };
export type GenerateImageRevisionInput = { sourceImageUrl: string; annotations: unknown[]; instruction?: string; prompt?: string; model?: string; size?: string };
export type GenerateImageRevisionOutput = GenerateImageOutput;
export type EditImageWithAnnotationsInput = { sourceImageUrl: string; prompt: string; maskImageUrl?: string; model?: string; size?: string; quality?: "low" | "medium" | "high" | "auto"; outputFormat?: "png" | "jpeg" | "webp" };
export type EditImageWithAnnotationsOutput = { revisedImageUrl?: string; status: "completed" | "failed"; raw?: unknown };
export type GenerateVideoInput = { prompt: string; negativePrompt?: string; model?: string; image?: string; endImage?: string; video?: string; useImageInput?: boolean; duration?: number; resolution?: string; aspectRatio?: string; fps?: string };
export type GenerateVideoOutput = { videoUrl?: string; taskId?: string; status: "completed" | "pending" | "failed"; raw?: unknown };
export type GenerateAudioInput = { text: string; model?: string; voice?: string; responseFormat?: "mp3" | "wav" | "aac" | "flac"; emotion?: string; volume?: number };
export type GenerateAudioOutput = { audioUrl?: string; taskId?: string; status: "completed" | "pending" | "failed"; raw?: unknown };
export type StoryboardScene = {
  sceneNumber: number; shotNumber?: number; description: string; visualPrompt: string; imagePrompt?: string; camera: string; duration: number;
  cinematicLanguage?: string; blocking?: string; visualContinuity?: string; characterContinuity?: string; sceneContinuity?: string; composition?: string; lens?: string; cameraMovement?: string; lighting?: string; colorPalette?: string; mood?: string; actionRhythm?: string; soundCue?: string; transition?: string; negativePrompt?: string;
};
export type GenerateStoryboardInput = { storyBrief: string; numberOfScenes: number; model?: string };
export type GenerateStoryboardOutput = { scenes: StoryboardScene[]; rawText?: string; raw?: unknown };
export interface AIProvider {
  name: AIProviderName;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
  generateImageRevision(input: GenerateImageRevisionInput): Promise<GenerateImageRevisionOutput>;
  editImageWithAnnotations(input: EditImageWithAnnotationsInput): Promise<EditImageWithAnnotationsOutput>;
  generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput>;
  generateAudio(input: GenerateAudioInput): Promise<GenerateAudioOutput>;
  generateStoryboard(input: GenerateStoryboardInput): Promise<GenerateStoryboardOutput>;
  listModels?(): Promise<Array<{ id: string; object?: string; [key: string]: unknown }>>;
  pollTask?(type: "video" | "audio" | "image", taskId: string): Promise<unknown>;
}
