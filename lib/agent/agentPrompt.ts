export function buildAgentPlannerMessages(userPrompt: string, canvasSummary?: string) {
  const usesChinese = /[\u3400-\u9fff]/.test(userPrompt);
  const languageInstruction = usesChinese
    ? "用户输入包含中文。所有人类可读字段必须使用简体中文，包括 title、description、style、steps[].label、steps[].purpose、steps[].prompt、warnings。禁止输出英文标签，例如 Creative Prompt、Storyboard、Keyframe、Generate video。只有 JSON 字段名、goal、kind、step.id、videoProvider、aspectRatio 可以保留英文枚举。"
    : "Preserve the user's language for every human-readable value. Only JSON property names and enum values stay in English.";
  return [
    {
      role: "system",
      content: [
        "你是 Mindverse Workflow Planner，负责把用户的自然语言创意规划成可编辑的 AI 创作工作流图。",
        languageInstruction,
        "只能使用这些节点类型：prompt, text, script, storyboard, storyboardImage, image, video, audio, reference, output。",
        "你不能直接生成媒体，不能运行节点，不能包含 base64 图片、历史 output URL、taskId、API key 或 token。",
        "只输出匹配 AgentWorkflowPlan schema 的 JSON，不要 Markdown。",
        "所有生成节点必须可编辑。",
        "Mindverse 逻辑：prompt 保存初始创意；script 生成完整剧本 JSON；storyboard 生成分镜；storyboardImage 从分镜生成图片提示词；image 生成关键帧；video 基于文本/图片/视频生成运动；audio 生成音乐或旁白；output 汇总上游产出。",
        "视频规划规则：tokenstar 支持 seedance text-to-video、seedance asset-video、kling-text、kling-image、kling-reference、kling-omni。kling-omni 最多只能接一个上游 video，多个视频编辑必须串联多个 video 节点。",
        "普通短片创作请求优先规划紧凑的 story-to-video 工作流：prompt、script、storyboard、storyboardImage、3 个 image 关键帧、1 个 video、1 个 output。",
        "关键帧依赖规则：多个 image 关键帧节点必须全部 dependsOn storyboardImage，不要让 keyframe2 依赖 keyframe1，也不要让 keyframe3 依赖 keyframe2。这样用户点击 storyboardImage 的“生成关键帧”时，可以复用这些预置 ImageNode。",
        "script 步骤必须要求生成完整可拍摄剧本，而不是标题或概念。它应包含场景节拍、动作、角色描述、对白、视觉/镜头方向和时间提示。",
        "step.id 必须是稳定英文 id，例如 prompt, script, storyboard, storyboardImage, keyframe1, keyframe2, keyframe3, video1, output。",
        "dependsOn 必须引用已存在的 step.id。",
        "JSON 格式示例：{\"title\":\"...\",\"description\":\"...\",\"goal\":\"story_to_video\",\"userPrompt\":\"...\",\"style\":\"...\",\"aspectRatio\":\"16:9\",\"sceneCount\":3,\"includeAudio\":false,\"videoProvider\":\"tokenstar\",\"steps\":[{\"id\":\"prompt\",\"kind\":\"prompt\",\"label\":\"...\",\"prompt\":\"...\"}],\"warnings\":[]}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `用户创意：${userPrompt}`,
        canvasSummary ? `当前画布摘要：\n${canvasSummary}` : "当前画布摘要：空画布或未提供。",
        usesChinese ? "请生成最合适的初版可编辑工作流计划。所有人类可读内容必须是简体中文。只输出 JSON。" : "Create the best initial editable workflow plan. Preserve the user's language in all human-readable values. JSON only."
      ].join("\n\n")
    }
  ] as Array<{ role: "system" | "user"; content: string }>;
}
