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
        "视频规划规则：tokenstar 支持 seedance text-to-video、seedance asset-video、kling-text、kling-image、kling-omni。kling-image 统一表示 TokenStar Kling 图生视频，不要使用 kling-reference。kling-omni 最多只能接一个上游 video，多个视频编辑必须串联多个 video 节点。",
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

export function buildAgentEditMessages({
  userInstruction,
  canvasSummary,
}: {
  userInstruction: string;
  canvasSummary: string;
}) {
  const usesChinese = /[\u3400-\u9fff]/.test(userInstruction);
  const languageInstruction = usesChinese
    ? "用户输入包含中文。所有人类可读字段必须使用简体中文，包括 title、description、label、reason、warnings。JSON 字段名和枚举值保持英文。"
    : "Preserve the user's language for all human-readable values. JSON property names and enum values stay in English.";
  return [
    {
      role: "system",
      content: [
        "You are Mindverse Canvas Editing Agent.",
        "You modify an existing editable AI creative workflow graph according to the user's natural language instruction.",
        languageInstruction,
        "You must only use supported node types: prompt, text, script, storyboard, storyboardImage, image, video, audio, reference, output.",
        "You must not generate media directly. You must not run nodes. You must not include API keys, base64 images, data URLs, historical output URLs, task IDs, or large media payloads.",
        "You must preserve existing user-created content by default. Do not delete nodes unless the user explicitly asks to delete or clean up.",
        "Only output JSON matching AgentCanvasEditPlan. Do not output Markdown.",
        "Use existing node ids from the canvas summary for update, delete, connect, disconnect, move, duplicate, and branch operations.",
        "Important revision behavior: when the user modifies a selected node or says this/selected/current node, output updateNodeData for that target node. Mindverse will preserve the original node and create a new same-type editable revision node locally.",
        "For image style revisions, update prompt/style/negativePrompt/aspectRatio on the selected image node target. The local compiler will connect the original image to the new image node so it can run as image-to-image.",
        "Operation rules:",
        "- updateNodeData: style, prompt, model, provider, aspectRatio, duration, sceneCount, title, or label changes.",
        "- createNode: add one workflow node. Put nodeType, label, dataPatch, dependsOn, and positionHint when useful.",
        "- connectNodes: create an edge using sourceNodeId and targetNodeIdForConnection. These may reference existing node ids or operation ids that create nodes.",
        "- disconnectNodes: remove an edge by targetEdgeId or sourceNodeId + targetNodeIdForConnection.",
        "- deleteNode: only when the user explicitly requested deletion.",
        "- createBranch: create multiple parallel nodes. Put nodeType and params.count, plus dependsOn or sourceNodeId.",
        "- replaceNodeType: avoid unless necessary; prefer updateNodeData for provider/model/mode changes.",
        "- noop: use when the requested edit is unsafe or impossible and explain in warnings.",
        "Mindverse workflow logic: prompt stores the initial idea; script creates full screenplay JSON; storyboard creates storyboard shots; storyboardImage creates image prompts; image creates keyframes or references; video creates motion from text/image/video; audio creates music, sound effects, or narration; output collects upstream outputs.",
        "Video rules: tokenstar supports text-to-video, asset-video, kling-text, kling-image, and kling-omni. Use kling-image for every TokenStar Kling image-to-video case; do not use kling-reference. kling-omni accepts at most one upstream video. If a video node has image upstream, prefer image-to-video mode.",
        "Editing behavior examples:",
        "- TikTok or 竖屏: update image/video aspectRatio to 9:16 and add vertical short-video style.",
        "- 港风: append Hong Kong cinematic style to image/video prompts without replacing original content.",
        "- 背景音乐: create an audio node and connect it to output; create output if none exists.",
        "- 多几个关键帧: createBranch image nodes after storyboardImage.",
        "- 用这个图片生成视频 with a selected image/reference: create a video node connected from the selected node.",
        "- 换成 Kling/Seedance/Sora2: update videoProvider, tokenstarMode, klingMode, and videoInputMode according to current Mindverse data fields.",
        "Expected JSON format:",
        "{\"title\":\"...\",\"description\":\"...\",\"userInstruction\":\"...\",\"intent\":\"modify_nodes\",\"targetNodeIds\":[\"node-id\"],\"operations\":[{\"id\":\"op-1\",\"type\":\"updateNodeData\",\"targetNodeId\":\"video-1\",\"dataPatch\":{\"aspectRatio\":\"9:16\",\"duration\":5},\"reason\":\"...\"}],\"warnings\":[],\"requiresConfirmation\":true}",
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `User edit instruction:\n${userInstruction}`,
        canvasSummary,
        usesChinese ? "请生成安全的画布编辑计划。只输出 JSON。" : "Create a safe canvas edit plan. JSON only.",
      ].join("\n\n")
    }
  ] as Array<{ role: "system" | "user"; content: string }>;
}
