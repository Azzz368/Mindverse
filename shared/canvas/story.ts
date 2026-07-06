export type StoryboardScene = { sceneNumber: number; description: string; visualPrompt: string; camera: string; duration: number };
export type ScriptScene = { sceneNumber: number; location: string; timeOfDay: string; action: string; dialogue: string[]; visualDirection: string };
export type ScriptOutput = { title: string; disclaimer: string; logline: string; tone: string; characters: Array<{ name: string; description: string; wardrobe: string }>; scenes: ScriptScene[] };
export type StoryboardImagePrompt = { shotNumber: number; title: string; prompt: string; negativePrompt: string; aspectRatio: string };
