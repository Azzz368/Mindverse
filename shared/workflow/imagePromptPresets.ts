export type ImagePromptPresetId = "character-turnaround" | "scene-nine-grid" | "scene-top-view";

export const imagePromptPresets: Record<ImagePromptPresetId, { label: string; desc: string; prefix: string; size: string }> = {
  "character-turnaround": {
    label: "人物四面设定图",
    desc: "人体四面图 + 人脸四面图",
    size: "2048x2048",
    prefix: [
      "请生成一张专业人物设定参考图，单张完整图片，不要分成多张文件。",
      "画面必须清晰包含同一个角色的两组视图：第一组是全身人体四面图，依次为正面、左侧面、背面、右侧面；第二组是人脸/头部四面图，依次为正面、左侧面、背面、右侧面。",
      "所有视图必须是同一个身份、同一张脸、同一服装、同一比例、同一发型、同一配色和同一设计细节，不能画成多个相似但不同的人。",
      "使用干净浅色背景、专业角色转面表排版、均匀光照、无复杂环境。不要加入额外人物、不要漫画分格、不要故事场景、不要文字标签。",
      "用户具体要求如下：",
    ].join("\n"),
  },
  "scene-nine-grid": {
    label: "场景九宫图",
    desc: "一张图包含同一场景九宫格",
    size: "2048x2048",
    prefix: [
      "请生成一张专业场景设计九宫图，单张完整图片。",
      "画面必须是 3x3 九宫格，同一个场景的九个视角/构图变化，保持同一世界观、同一地点、同一建筑/道具/色彩风格和连续空间关系。",
      "每一格都应该像可用于影视/游戏美术开发的场景关键帧或场景探索图，展示不同机位、焦段、时间感或局部细节。",
      "整体排版干净统一，格子边界清晰，不要出现无关人物，不要文字说明，不要 UI、水印或多余标记。",
      "用户具体要求如下：",
    ].join("\n"),
  },
  "scene-top-view": {
    label: "室内俯拍图",
    desc: "室内上空摄影参考",
    size: "2048x2048",
    prefix: [
      "请生成一张室内高位俯拍参考图，单张完整图片。",
      "画面像摄影机悬在房间内部上空向下拍摄，只能看到房间内部内容：地面、墙内侧、家具/道具位置、入口、遮挡物、光影、材质和可通行区域。",
      "这是给视频镜头理解室内空间用的摄影参考，不是建筑平面图、地图、游戏关卡图或房屋外观图。",
      "不要画房间外部、屋顶外轮廓、楼体外围、街道、外部地块、路线线条、箭头、轨迹、编号、文字标签、UI 或水印。",
      "用户具体要求如下：",
    ].join("\n"),
  },
};

export const imagePromptWithPreset = (presetId: string | undefined, prompt: string) => {
  if (!presetId || !(presetId in imagePromptPresets)) return prompt;
  const preset = imagePromptPresets[presetId as ImagePromptPresetId];
  return [preset.prefix, prompt.trim() || "请根据该预设生成一个完整、清晰、可用于后续视频创作的视觉方案。"].join("\n");
};
