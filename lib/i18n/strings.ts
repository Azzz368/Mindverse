export type Lang = "zh" | "en";

export interface Strings {
  // TopBar
  projectNamePlaceholder: string;
  exportJson: string;
  importJson: string;
  // TemplateGallery
  templates: string;
  // NodeToolbar
  addNode: string;
  addPrefix: string;
  nodeNames: Record<string, string>;
  // PropertyPanel
  inspector: string;
  inspectorHint: string;
  lastOutput: string;
  generateKeyframes: (n: number) => string;
  // BottomRunBar
  runSelected: string;
  runWorkflow: string;
  save: string;
  load: string;
  clear: string;
  mockProviderNote: string;
  // Node card
  duplicate: string;
  delete: string;
  waitingGeneration: string;
  revisionOf: string;
  viewFullImage: string;
  annotateRefine: string;
  configureNode: string;
  scene: string;
  connectedAssets: (n: number) => string;
  noConnectedAssets: string;
  close: string;
  // Image annotation
  annotateTitle: string;
  annotateSubtitle: string;
  toolSelect: string;
  toolArrow: string;
  toolBox: string;
  toolCircle: string;
  toolText: string;
  deleteAnnotation: string;
  undo: string;
  clearAnnotations: string;
  newTextNote: string;
  selectedInstruction: string;
  overallInstruction: string;
  generateRevision: string;
  // Field labels
  fieldTitle: string;
  fieldPrompt: string;
  fieldNegativePrompt: string;
  fieldStyle: string;
  fieldAspectRatio: string;
  fieldInstruction: string;
  fieldInputText: string;
  fieldModel: string;
  fieldModelNote: string;
  fieldModelKlingNote: string;
  fieldTemperature: string;
  fieldCreativeBrief: string;
  fieldTone: string;
  fieldSceneCount: string;
  fieldVideoProvider: string;
  fieldFirstFrameUrl: string;
  fieldTokenstarMode: string;
  fieldImageAssetUrl: string;
  fieldVideoAssetUrl: string;
  fieldAudioAssetUrl: string;
  field302Mode: string;
  fieldDuration: string;
  fieldResolution: string;
  fieldFps: string;
  fieldGenerateAudio: string;
  fieldAudioPrompt: string;
  fieldVoice: string;
  fieldEmotion: string;
  fieldVolume: string;
  fieldDurationSec: string;
  fieldStoryBrief: string;
  fieldShotCount: string;
  fieldNotes: string;
  fieldFormat: string;
  fieldMotionPrompt: string;
  fieldImagePrompt: string;
  fieldSize: string;
  fieldReferenceImageUrl: string;
  fieldKlingMode: string;
  fieldKlingElementId: string;
  fieldReferenceVideoUrl: string;
  langToggle: string;
  serverDefault: string;
}

const zh: Strings = {
  projectNamePlaceholder: "未命名创作流程",
  exportJson: "导出 JSON",
  importJson: "导入 JSON",
  templates: "模板",
  addNode: "添加节点",
  addPrefix: "添加",
  nodeNames: {
    prompt: "提示词", text: "文本", image: "图像", video: "视频",
    audio: "音频", storyboard: "分镜", storyboardImage: "分镜帧",
    reference: "参考", output: "输出",
  },
  inspector: "属性",
  inspectorHint: "选择节点来编辑配置并查看生成结果。",
  lastOutput: "上次输出",
  generateKeyframes: (n) => `生成 ${n} 个关键帧`,
  runSelected: "运行选中",
  runWorkflow: "运行全流程",
  save: "保存",
  load: "加载",
  clear: "清空",
  mockProviderNote: "Mock AI 模拟 · 本地优先画布",
  duplicate: "复制",
  delete: "删除",
  waitingGeneration: "等待生成中…",
  revisionOf: "源图像的修订版",
  viewFullImage: "查看完整图像",
  annotateRefine: "标注 & 优化",
  configureNode: "在属性面板配置此节点。",
  scene: "场景",
  connectedAssets: (n) => `${n} 个已连接资产`,
  noConnectedAssets: "无已连接资产",
  close: "关闭",
  annotateTitle: "标注 & 优化",
  annotateSubtitle: "选择箭头工具，从来源拖到目标，然后描述该标注的修改说明。",
  toolSelect: "选择", toolArrow: "箭头", toolBox: "框", toolCircle: "圆", toolText: "文字",
  deleteAnnotation: "删除",
  undo: "撤销",
  clearAnnotations: "清空",
  newTextNote: "新文字注释",
  selectedInstruction: "选中的 {type} 说明",
  overallInstruction: "整体修订说明",
  generateRevision: "生成修订版",
  fieldTitle: "标题",
  fieldPrompt: "提示词",
  fieldNegativePrompt: "排除",
  fieldStyle: "风格",
  fieldAspectRatio: "宽高比",
  fieldInstruction: "指令",
  fieldInputText: "起始文本",
  fieldModel: "模型覆盖",
  fieldModelNote: "模型覆盖（留空=服务器默认）",
  fieldModelKlingNote: "模型覆盖（Kling/302-sora2 不使用）",
  fieldTemperature: "温度",
  fieldCreativeBrief: "创意概要",
  fieldTone: "语调",
  fieldSceneCount: "目标场景数",
  fieldVideoProvider: "视频提供商",
  fieldFirstFrameUrl: "首帧 URL（Kling，可选）",
  fieldTokenstarMode: "TokenStar 模式（asset-video 使用已连接媒体）",
  fieldImageAssetUrl: "现有图像资产 URL（asset://…，可选）",
  fieldVideoAssetUrl: "现有视频资产 URL（asset://…，可选）",
  fieldAudioAssetUrl: "现有音频资产 URL（asset://…，可选）",
  field302Mode: "302 生成模式",
  fieldDuration: "时长（Kling: 3-15；Sora: 4, 8 或 12）",
  fieldResolution: "分辨率（720p 或 1080p）",
  fieldFps: "帧率",
  fieldGenerateAudio: "生成音频",
  fieldAudioPrompt: "音频提示词",
  fieldVoice: "音色",
  fieldEmotion: "情绪",
  fieldVolume: "音量",
  fieldDurationSec: "时长（秒）",
  fieldStoryBrief: "故事概要",
  fieldShotCount: "目标镜头数（1-30）",
  fieldNotes: "备注",
  fieldFormat: "交付格式",
  fieldMotionPrompt: "动效提示词",
  fieldImagePrompt: "图像提示词",
  fieldSize: "尺寸",
  fieldReferenceImageUrl: "参考图像 URL",
  fieldKlingMode: "Kling 模式",
  fieldKlingElementId: "主体元素 ID（elem_xxx，逗号分隔多个）",
  fieldReferenceVideoUrl: "参考视频 URL（Kling Omni 视频编辑）",
  langToggle: "EN",
  serverDefault: "服务器默认",
};

const en: Strings = {
  projectNamePlaceholder: "Untitled creative flow",
  exportJson: "Export JSON",
  importJson: "Import JSON",
  templates: "Templates",
  addNode: "Add node",
  addPrefix: "Add",
  nodeNames: {
    prompt: "Prompt", text: "Text", image: "Image", video: "Video",
    audio: "Audio", storyboard: "Storyboard", storyboardImage: "Storyboard Image",
    reference: "Reference", output: "Output",
  },
  inspector: "Inspector",
  inspectorHint: "Select a node to edit its settings and review generated output.",
  lastOutput: "Last output",
  generateKeyframes: (n) => `Generate ${n} keyframes`,
  runSelected: "Run selected",
  runWorkflow: "Run workflow",
  save: "Save",
  load: "Load",
  clear: "Clear",
  mockProviderNote: "Mock AI provider · local-first canvas",
  duplicate: "Duplicate",
  delete: "Delete",
  waitingGeneration: "Waiting for generation…",
  revisionOf: "Revision of source image",
  viewFullImage: "View full image",
  annotateRefine: "Annotate & Refine",
  configureNode: "Configure this node in the inspector.",
  scene: "SCENE",
  connectedAssets: (n) => `${n} connected asset(s)`,
  noConnectedAssets: "No connected assets",
  close: "Close",
  annotateTitle: "Annotate & Refine",
  annotateSubtitle: "Choose Arrow, drag from the source to the target, then describe the change for that annotation.",
  toolSelect: "Select", toolArrow: "Arrow", toolBox: "Box", toolCircle: "Circle", toolText: "Text",
  deleteAnnotation: "Delete",
  undo: "Undo",
  clearAnnotations: "Clear",
  newTextNote: "New text note",
  selectedInstruction: "Selected {type} instruction",
  overallInstruction: "Overall revision instruction",
  generateRevision: "Generate revision",
  fieldTitle: "Title",
  fieldPrompt: "Prompt",
  fieldNegativePrompt: "Avoid",
  fieldStyle: "Style",
  fieldAspectRatio: "Aspect ratio",
  fieldInstruction: "Instruction",
  fieldInputText: "Starting text",
  fieldModel: "Model override",
  fieldModelNote: "Model override (blank = server default)",
  fieldModelKlingNote: "Model override (not used by 302-sora2 or Kling)",
  fieldTemperature: "Temperature",
  fieldCreativeBrief: "Creative brief",
  fieldTone: "Tone",
  fieldSceneCount: "Target scene count",
  fieldVideoProvider: "Video provider",
  fieldFirstFrameUrl: "First frame URL (Kling, optional)",
  fieldTokenstarMode: "TokenStar mode (asset-video uses connected media)",
  fieldImageAssetUrl: "Existing image asset URL (asset://…, optional)",
  fieldVideoAssetUrl: "Existing video asset URL (asset://…, optional)",
  fieldAudioAssetUrl: "Existing audio asset URL (asset://…, optional)",
  field302Mode: "302 generation mode",
  fieldDuration: "Duration (Kling: 3-15; Sora: 4, 8, or 12)",
  fieldResolution: "Resolution (720p or 1080p)",
  fieldFps: "FPS",
  fieldGenerateAudio: "Generate audio",
  fieldAudioPrompt: "Audio prompt",
  fieldVoice: "Voice override",
  fieldEmotion: "Emotion",
  fieldVolume: "Volume",
  fieldDurationSec: "Duration (seconds)",
  fieldStoryBrief: "Story brief",
  fieldShotCount: "Target shot count (1-30)",
  fieldNotes: "Notes",
  fieldFormat: "Deliverable format",
  fieldMotionPrompt: "Motion prompt",
  fieldImagePrompt: "Image prompt",
  fieldSize: "Size",
  fieldReferenceImageUrl: "Reference image URL",
  fieldKlingMode: "Kling mode",
  fieldKlingElementId: "Subject element ID(s) (elem_xxx, comma-separated)",
  fieldReferenceVideoUrl: "Reference video URL (Kling Omni video edit)",
  langToggle: "中文",
  serverDefault: "Server default",
};

export const strings: Record<Lang, Strings> = { zh, en };
