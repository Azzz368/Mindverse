"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cancelAgentRun, getAgentRun, requestAgentRouter, resumeAgentRun, updateAgentRun } from "@/features/agent/services/agentClient";
import { runAutonomousAgent } from "@/features/agent/services/autonomousAgent";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { type AgentReferenceAsset } from "@/shared/agent/projectMemory";
import { agentWorkflowSkills, buildFixedSceneVideoSkill, type AgentWorkflowSkillId } from "@/shared/agent/workflowSkills";
import type {
  AgentCanvasEditPlan,
  AgentCanvasOrganizePlan,
  AgentDialogueResponse,
  AgentWorkflowPlan,
  CanvasEditPatch,
  CanvasPatch,
} from "@/shared/agent/agentSchema";
import type { AgentRouterIntent, AgentRouterResponse } from "@/shared/api/aiContracts";
import type { CanvasNode } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { ACTIVE_SKILL_KEY } from "@/features/skills/services/skillClient";
import type { AgentRunEvent, AgentRunStatus, AgentRunTrace } from "@/shared/agent/agentAutonomy";
import type { AgentSkillUsage } from "@/shared/agent/capabilityTypes";
import type { AgentImageSearchResult } from "@/shared/agent/agentTools";
import { archiveAudioFile, archiveImageFile, archiveRemoteImageUrl, archiveVideoFile } from "@/features/canvas/services/mediaArchiveClient";
import { apiErrorPayload } from "@/shared/api/client";
import { agentExecutionModelFrom, agentExecutionModelOptions, DEFAULT_AGENT_EXECUTION_MODEL, type AgentExecutionModelId } from "@/shared/agent/executionModels";

type AgentPreview =
  | { intent: "create"; plan: AgentWorkflowPlan; patch: CanvasPatch; summary: string }
  | { intent: "edit"; editPlan: AgentCanvasEditPlan; patch: CanvasEditPatch; summary: string }
  | { intent: "organize"; organizePlan: AgentCanvasOrganizePlan; patch: CanvasEditPatch; summary: string }
  | {
    intent: "skill";
    skillId: AgentWorkflowSkillId;
    title: string;
    brief: string;
    summary: string;
    duration: number;
    shotCount: number;
    referenceTitles: string[];
    videoPrompt: string;
  };

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  intent?: AgentRouterIntent;
  response?: AgentDialogueResponse;
  imageSearch?: {
    query: string;
    results: AgentImageSearchResult[];
  };
  attachments?: Array<{ name: string; mediaType: AgentAttachmentMediaType; url: string }>;
};

type AgentAttachmentMediaType = "image" | "video" | "audio";

type AgentComposerAttachment = {
  id: string;
  name: string;
  mediaType: AgentAttachmentMediaType;
  url: string;
  nodeId?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

const mediaTypeFromFile = (file: File): AgentAttachmentMediaType | null => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension || "")) return "image";
  if (["mp4", "mov", "webm", "mkv"].includes(extension || "")) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac"].includes(extension || "")) return "audio";
  return null;
};

const attachmentTypeLabel = (mediaType: AgentAttachmentMediaType) =>
  mediaType === "image" ? "图片" : mediaType === "video" ? "视频" : "音频";

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const browserSpeechRecognition = () => {
  const browserWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
};

const operationTarget = (operation: AgentCanvasEditPlan["operations"][number]) =>
  operation.targetNodeId || operation.sourceNodeId || operation.targetNodeIdForConnection || operation.targetEdgeId || operation.nodeType || "canvas";

const fixedSceneConstraints = [
  "Use character turnaround images and a scene nine-grid image.",
  "Avoid storyboard-only workflow for fixed-scene video requests.",
];

const LAST_AGENT_RUN_KEY = "mindverse:last-agent-run-id";
const AGENT_EXECUTION_MODEL_KEY = "mindverse:agent-execution-model";

const skillUsageLabel = (source: AgentSkillUsage["source"]) =>
  source === "active" ? "已启用" : source === "rag" ? "RAG 检索" : source === "system" ? "提示词规则" : "内置目录";

const skillUsageClassName = (source: AgentSkillUsage["source"]) =>
  source === "active"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : source === "rag"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : source === "system"
        ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-50 text-sky-700";

const skillUsageList = (value: unknown): AgentSkillUsage[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const source = raw.source === "active" || raw.source === "rag" || raw.source === "catalog" || raw.source === "system" ? raw.source : "rag";
    if (!id || !name) return [];
    return [{
      id,
      name,
      source,
      evidenceIds: Array.isArray(raw.evidenceIds) ? raw.evidenceIds.filter((id): id is string => typeof id === "string") : [],
      supports: Array.isArray(raw.supports) ? raw.supports.filter((capability): capability is string => typeof capability === "string") : [],
      role: raw.role === "base_policy" || raw.role === "style_profile" ? raw.role : undefined,
    }];
  });
};

const valueRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const hasOutputUrl = (node: CanvasNode, keys: string[]) => {
  const value = valueRecord(node.data.output?.value);
  return keys.some((key) => typeof value[key] === "string" && Boolean((value[key] as string).trim()));
};

const selectedNodeMeta = (node: CanvasNode) => {
  const media = [
    hasOutputUrl(node, ["imageUrl", "revisedImageUrl"]) ? "image" : "",
    hasOutputUrl(node, ["videoUrl", "resultUrl", "finalVideoUrl"]) ? "video" : "",
    hasOutputUrl(node, ["audioUrl", "resultUrl"]) ? "audio" : "",
  ].filter(Boolean);
  return [node.data.nodeType, node.data.status, ...media].join(" · ");
};

export function AgentWorkflowPanel({ workflowId }: { workflowId?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [customSkill, setCustomSkill] = useState<ActiveSkillContext | null>(null);
  const [autonomousEnabled, setAutonomousEnabled] = useState(false);
  const [autonomousEvents, setAutonomousEvents] = useState<AgentRunEvent[]>([]);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [agentRunStatus, setAgentRunStatus] = useState<AgentRunStatus | null>(null);
  const [agentRunExpanded, setAgentRunExpanded] = useState(false);
  const [executionModel, setExecutionModel] = useState<AgentExecutionModelId>(DEFAULT_AGENT_EXECUTION_MODEL);
  const [usedSkills, setUsedSkills] = useState<AgentSkillUsage[]>([]);
  const [selectingImageId, setSelectingImageId] = useState<string | null>(null);
  const [selectedImageResultIds, setSelectedImageResultIds] = useState<string[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);
  const [suggestionsLeaving, setSuggestionsLeaving] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AgentComposerAttachment[]>([]);
  const autonomousControllerRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechInputBaseRef = useRef("");
  const speechFinalRef = useRef("");
  const suggestionTimerRef = useRef<number | null>(null);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const projectName = useCanvasStore((state) => state.projectName);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const selectionMode = useCanvasStore((state) => state.selectionMode);
  const setSelectionMode = useCanvasStore((state) => state.setSelectionMode);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const agentStatus = useCanvasStore((state) => state.agentStatus);
  const agentMessage = useCanvasStore((state) => state.agentMessage);
  const agentMemory = useCanvasStore((state) => state.agentMemory);
  const updateAgentMemory = useCanvasStore((state) => state.updateAgentMemory);
  const clearAgentMemory = useCanvasStore((state) => state.clearAgentMemory);
  const applyAgentPatch = useCanvasStore((state) => state.applyAgentPatch);
  const setPendingAgentPatch = useCanvasStore((state) => state.setPendingAgentPatch);
  const applyAgentEditPatch = useCanvasStore((state) => state.applyAgentEditPatch);
  const runAgentSkill = useCanvasStore((state) => state.runAgentSkill);
  const arrangeWorkflows = useCanvasStore((state) => state.arrangeWorkflows);
  const markSelectedWorkflow = useCanvasStore((state) => state.markSelectedWorkflow);
  const clearSelectedWorkflowMark = useCanvasStore((state) => state.clearSelectedWorkflowMark);
  const addStoryChainNode = useCanvasStore((state) => state.addStoryChainNode);
  const addPastedMediaNodes = useCanvasStore((state) => state.addPastedMediaNodes);
  const removeNode = useCanvasStore((state) => state.removeNode);

  const workflowSkills = Object.values(agentWorkflowSkills);
  const selectedNodeIds = useMemo(() => {
    const existingIds = new Set(nodes.map((node) => node.id));
    return [...new Set([
      ...nodes.filter((node) => node.selected).map((node) => node.id),
      ...(selectedNodeId && existingIds.has(selectedNodeId) ? [selectedNodeId] : []),
    ])];
  }, [nodes, selectedNodeId]);
  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNode => Boolean(node)),
    [nodes, selectedNodeIds],
  );
  const readyAttachments = attachments.filter((attachment) => attachment.status === "ready" && attachment.nodeId);
  const hasPendingAttachment = attachments.some((attachment) => attachment.status === "uploading");
  const canSubmit = (input.trim().length > 0 || readyAttachments.length > 0) && !busy && !hasPendingAttachment;
  const clearProjectMemory = () => {
    clearAgentMemory();
    setLocalError(null);
  };

  const addAgentAttachments = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    const availableSlots = Math.max(0, 8 - attachments.length);
    const accepted = Array.from(files)
      .map((file) => ({ file, mediaType: mediaTypeFromFile(file) }))
      .filter((entry): entry is { file: File; mediaType: AgentAttachmentMediaType } => Boolean(entry.mediaType))
      .slice(0, availableSlots);
    if (!accepted.length) {
      setLocalError(availableSlots ? "请选择图片、视频或音频文件。" : "一次最多添加 8 个素材。先移除部分素材后再试。");
      return;
    }
    if (accepted.length < files.length) {
      setLocalError(`已添加 ${accepted.length} 个受支持的素材；不支持的文件或超出 8 个的部分已跳过。`);
    } else {
      setLocalError(null);
    }

    const baseCanvas = useCanvasStore.getState();
    const baseX = Math.min(0, ...baseCanvas.nodes.map((node) => node.position.x)) - 360;
    const pending = accepted.map(({ file, mediaType }) => ({
      file,
      attachment: {
        id: crypto.randomUUID(),
        name: file.name,
        mediaType,
        url: URL.createObjectURL(file),
        status: "uploading" as const,
      },
    }));
    setAttachments((current) => [...current, ...pending.map((entry) => entry.attachment)]);

    const archived = await Promise.all(pending.map(async ({ file, attachment }) => {
      try {
        const archivedUrl = attachment.mediaType === "image"
          ? await archiveImageFile(file)
          : attachment.mediaType === "video"
            ? await archiveVideoFile(file)
            : await archiveAudioFile(file);
        return { attachment, archivedUrl };
      } catch (error) {
        setAttachments((current) => current.map((item) => item.id === attachment.id
          ? { ...item, status: "error", error: error instanceof Error ? error.message : "素材上传失败。" }
          : item));
        return undefined;
      }
    }));
    const successful = archived.filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!successful.length) return;

    const nodeIds = addPastedMediaNodes(successful.map(({ attachment, archivedUrl }) => ({
      mediaType: attachment.mediaType,
      url: archivedUrl,
      fileName: attachment.name,
      sourceProvider: "agent-upload",
    })), { x: baseX, y: 90 });
    if (nodeIds.length !== successful.length) {
      successful.forEach(({ attachment }) => {
        setAttachments((current) => current.map((item) => item.id === attachment.id
          ? { ...item, status: "error", error: "素材已上传，但无法创建画布节点。" }
          : item));
      });
      return;
    }

    const uploadedAssets = successful.map(({ attachment }, index) => ({
      nodeId: nodeIds[index],
      kind: attachment.mediaType,
      title: attachment.name,
      role: "agent composer upload",
      sourceName: "local upload",
    }));
    const memory = useCanvasStore.getState().agentMemory;
    const uploadedNodeIds = new Set(nodeIds);
    useCanvasStore.getState().updateAgentMemory({
      referenceAssets: [
        ...(memory?.referenceAssets || []).filter((asset) => !uploadedNodeIds.has(asset.nodeId)),
        ...uploadedAssets,
      ].slice(-24),
    });
    const resultByAttachmentId = new Map(successful.map((item, index) => [item.attachment.id, { nodeId: nodeIds[index], url: item.archivedUrl }]));
    successful.forEach(({ attachment }) => URL.revokeObjectURL(attachment.url));
    setAttachments((current) => current.map((item) => {
      const result = resultByAttachmentId.get(item.id);
      return result ? { ...item, ...result, status: "ready", error: undefined } : item;
    }));
  };

  const removeAgentAttachment = (attachment: AgentComposerAttachment) => {
    if (attachment.status === "uploading") return;
    if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
    if (attachment.nodeId) {
      removeNode(attachment.nodeId);
      const memory = useCanvasStore.getState().agentMemory;
      useCanvasStore.getState().updateAgentMemory({
        referenceAssets: (memory?.referenceAssets || []).filter((asset) => asset.nodeId !== attachment.nodeId),
      });
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  };

  const primeComposer = (prompt: string) => {
    setInput(prompt);
    composerRef.current?.focus();
  };

  const chooseSuggestion = (prompt: string) => {
    if (suggestionsLeaving) return;
    primeComposer(prompt);
    setSuggestionsLeaving(true);
    if (suggestionTimerRef.current) window.clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = window.setTimeout(() => {
      setSuggestionsVisible(false);
      setSuggestionsLeaving(false);
      composerRef.current?.focus();
    }, 240);
  };

  const stopSpeechInput = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const toggleSpeechInput = () => {
    if (isListening) {
      stopSpeechInput();
      return;
    }

    const SpeechRecognition = browserSpeechRecognition();
    if (!SpeechRecognition) {
      setSpeechError("当前浏览器不支持语音输入，请使用最新版 Chrome 或 Edge。");
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    speechInputBaseRef.current = input;
    speechFinalRef.current = "";
    setSpeechError(null);

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || "";
        if (result?.isFinal) speechFinalRef.current += transcript;
        else interimTranscript += transcript;
      }
      setInput(`${speechInputBaseRef.current}${speechFinalRef.current}${interimTranscript}`);
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "麦克风权限未开启，请在浏览器地址栏允许访问后重试。"
        : event.error === "audio-capture"
          ? "没有检测到可用麦克风，请检查设备连接。"
          : event.error === "no-speech"
            ? "没有听到清晰语音，请靠近麦克风再试一次。"
            : "语音输入暂时不可用，请稍后重试。";
      setSpeechError(message);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      composerRef.current?.focus();
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setSpeechError("语音输入启动失败，请稍后重试。");
      setIsListening(false);
    }
  };

  useEffect(() => {
    setSpeechSupported(Boolean(browserSpeechRecognition()));
    return () => {
      recognitionRef.current?.abort();
      if (suggestionTimerRef.current) window.clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(ACTIVE_SKILL_KEY);
    if (!raw) return;
    try {
      setCustomSkill(JSON.parse(raw) as ActiveSkillContext);
    } catch {
      window.localStorage.removeItem(ACTIVE_SKILL_KEY);
    }
  }, []);

  useEffect(() => {
    setExecutionModel(agentExecutionModelFrom(window.localStorage.getItem(AGENT_EXECUTION_MODEL_KEY)));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AGENT_EXECUTION_MODEL_KEY, executionModel);
  }, [executionModel]);

  useEffect(() => {
    const runId = window.localStorage.getItem(LAST_AGENT_RUN_KEY);
    if (!runId) return;
    let active = true;
    void getAgentRun(runId).then(({ run }) => {
      if (!active) return;
      setAgentRunId(run.id);
      setAgentRunStatus(run.status);
      setAutonomousEvents(run.events.slice(-24));
      setUsedSkills(skillUsageList(run.checkpoint?.skillUsage));
      if (run.request?.executionModel) setExecutionModel(run.request.executionModel);
    }).catch(() => window.localStorage.removeItem(LAST_AGENT_RUN_KEY));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (agentRunId) window.localStorage.setItem(LAST_AGENT_RUN_KEY, agentRunId);
  }, [agentRunId]);

  useEffect(() => {
    if (!agentRunId || busy || agentRunStatus !== "running") return;
    let active = true;
    const refresh = () => {
      void getAgentRun(agentRunId).then(({ run }) => {
        if (!active) return;
        setAgentRunStatus(run.status);
        setAutonomousEvents(run.events.slice(-24));
        setUsedSkills(skillUsageList(run.checkpoint?.skillUsage));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 3000);
    refresh();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agentRunId, agentRunStatus, busy]);

  const clearCustomSkill = () => {
    window.localStorage.removeItem(ACTIVE_SKILL_KEY);
    setCustomSkill(null);
  };

  const rememberSkill = (skillId: AgentWorkflowSkillId, brief: string) => {
    updateAgentMemory({
      storyBrief: brief,
      preferredWorkflowSkill: skillId,
      constraints: fixedSceneConstraints,
      lastIntent: "skill",
      pendingIntent: undefined,
      pendingRequest: undefined,
      pendingQuestions: undefined,
    });
  };

  const previewWorkflowSkill = (skillId: AgentWorkflowSkillId, brief: string, summary?: string) => {
    const skill = buildFixedSceneVideoSkill(brief);
    setPreview({
      intent: "skill",
      skillId,
      title: skill.title,
      brief,
      summary: summary || agentWorkflowSkills[skillId].description,
      duration: skill.duration,
      shotCount: skill.shotCount,
      referenceTitles: skill.references.map((reference) => reference.title),
      videoPrompt: skill.videoPrompt,
    });
  };

  const selectImageSearchResult = async (result: AgentImageSearchResult, query: string) => {
    if (selectingImageId || selectedImageResultIds.includes(result.id)) return;
    setSelectingImageId(result.id);
    setLocalError(null);
    let canvasImageUrl = result.thumbnailUrl;
    let archived = false;
    const archiveCandidates = [...new Set([result.imageUrl, result.thumbnailUrl].filter(Boolean))];
    for (const candidate of archiveCandidates) {
      try {
        canvasImageUrl = await archiveRemoteImageUrl(candidate, "agent-web-image-search");
        archived = true;
        break;
      } catch {
        // Try the provider thumbnail when the source site blocks direct image downloads.
      }
    }
    try {
      const store = useCanvasStore.getState();
      const position = {
        x: store.nodes.length ? Math.max(...store.nodes.map((node) => node.position.x)) + 420 : 80,
        y: store.nodes.length ? Math.min(...store.nodes.map((node) => node.position.y)) : 80,
      };
      store.recordCanvasMutation();
      store.addMediaNode(canvasImageUrl, position);
      const nodeId = useCanvasStore.getState().selectedNodeId;
      if (!nodeId) throw new Error("Reference node was not created.");
      const notes = [
        `Agent image search: ${query}`,
        `Source: ${result.sourceName}`,
        result.creator ? `Creator: ${result.creator}` : "",
        result.license ? `License: ${result.license}` : "",
        result.licenseUrl ? `License page: ${result.licenseUrl}` : "",
        `Source page: ${result.sourcePageUrl}`,
        archived ? "Archived to Mindverse media storage." : "Using the original public image URL.",
      ].filter(Boolean).join("\n");
      useCanvasStore.getState().updateNodeData(nodeId, {
        title: `Reference* ${query}`,
        notes,
      });
      const memory = useCanvasStore.getState().agentMemory;
      const previousAssets = memory?.referenceAssets || [];
      const selectedAsset: AgentReferenceAsset = {
        nodeId,
        kind: "image",
        title: query,
        role: "selected web image reference",
        searchQuery: query,
        sourceName: result.sourceName,
        sourcePageUrl: result.sourcePageUrl,
      };
      updateAgentMemory({
        lastIntent: "tool",
        referenceAssets: [
          ...previousAssets.filter((asset) => asset.nodeId !== nodeId),
          selectedAsset,
        ].slice(-12),
      });
      setSelectedImageResultIds((current) => [...current, result.id]);
      setChat((current) => [
        ...current,
        { role: "user", content: `我选择了图片“${result.title}”作为“${query}”的参考素材。画布节点 ID：${nodeId}。` },
        { role: "assistant", content: `已将“${query}”加入画布并选中。现在可以继续描述如何使用这张人物参考图，例如生成 10 秒短片。`, intent: "tool" },
      ]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "无法将图片加入画布。");
    } finally {
      setSelectingImageId(null);
    }
  };

  const runUnifiedAgent = async (forceIntent?: AgentRouterIntent, messageOverride?: string) => {
    const submittedAttachments = readyAttachments.map((attachment) => ({
      name: attachment.name,
      mediaType: attachment.mediaType,
      url: attachment.url,
      nodeId: attachment.nodeId!,
    }));
    const message = (messageOverride ?? input).trim()
      || (submittedAttachments.length ? "请分析并使用这些上传素材创建合适的可编辑工作流。" : "");
    if (!message || busy || hasPendingAttachment) return;
    const resumeRunId = agentRunStatus === "awaiting_user" ? agentRunId || undefined : undefined;
    setBusy(true);
    setLocalError(null);
    setPreview(null);
    const nextChat: ChatEntry[] = [...chat, {
      role: "user",
      content: message,
      attachments: submittedAttachments.map(({ name, mediaType, url }) => ({ name, mediaType, url })),
    }];
    setChat(nextChat);
    setInput("");
    const autonomousController = autonomousEnabled ? new AbortController() : null;
    autonomousControllerRef.current = autonomousController;
    setAutonomousEvents([]);
    setUsedSkills([]);
    setAgentRunId(null);
    setAgentRunStatus("running");

    try {
      const currentCanvas = useCanvasStore.getState();
      const attachmentNodeIds = submittedAttachments.map((attachment) => attachment.nodeId);
      const requestSelectedNodeIds = [...new Set([
        ...selectedNodeIds,
        ...currentCanvas.nodes.filter((node) => node.selected).map((node) => node.id),
        ...(currentCanvas.selectedNodeId ? [currentCanvas.selectedNodeId] : []),
        ...attachmentNodeIds,
      ])].filter((id) => currentCanvas.nodes.some((node) => node.id === id));
      const payload = await requestAgentRouter({
        userMessage: message,
        canvasSnapshot: {
          version: 1,
          projectName: currentCanvas.projectName,
          nodes: currentCanvas.nodes,
          edges: currentCanvas.edges,
          agentMemory: currentCanvas.agentMemory || undefined,
        },
        selectedNodeIds: requestSelectedNodeIds,
        attachmentNodeIds,
        conversation: chat.map((item) => ({ role: item.role, content: item.content })),
        forceIntent,
        customSkill: customSkill || undefined,
        resumeRunId,
        executionMode: "browser",
        workflowId,
        executionModel,
      });
      const planningEvents = payload.agentRun?.events || [];
      if (!payload.requiresClarification) setAttachments([]);
      setAgentRunId(payload.agentRun?.id || null);
      setAgentRunStatus(payload.agentRun?.status || null);
      setAutonomousEvents(planningEvents.slice(-24));
      setUsedSkills(skillUsageList(payload.skillUsage));
      const resolvedRequest = payload.resolvedRequest || message;

      const requiresCapabilityApproval = Boolean(payload.approvalRequiredStepIds?.length);
      if (autonomousEnabled && !requiresCapabilityApproval && ["create", "edit", "organize", "skill"].includes(payload.intent)) {
        updateAgentMemory({
          storyBrief: resolvedRequest,
          lastIntent: payload.intent,
          preferredWorkflowSkill: payload.intent === "skill" ? payload.skillId : undefined,
          pendingIntent: undefined,
          pendingRequest: undefined,
          pendingQuestions: undefined,
        });
        setAgentRunStatus("running");
        const result = await runAutonomousAgent({
          userMessage: resolvedRequest,
          response: payload,
          selectedNodeIds: requestSelectedNodeIds,
          runId: payload.agentRun?.id,
          initialEvents: planningEvents,
          signal: autonomousController?.signal,
          maxRepairAttempts: 2,
          executionModel: payload.executionModel || executionModel,
          onEvent: (event) => setAutonomousEvents((current) => [...current, event].slice(-24)),
          persistUpdate: payload.agentRun?.id
            ? (update) => updateAgentRun(payload.agentRun!.id, update)
            : undefined,
        });
        setAgentRunStatus(result.status);
        setChat([...nextChat, { role: "assistant", content: result.summary, intent: payload.intent }]);
        if (result.status === "blocked") setLocalError(result.summary);
        return;
      }

      if (payload.intent === "tool" && payload.toolResult?.name === "image_search") {
        updateAgentMemory({ lastIntent: "tool" });
        setChat([...nextChat, {
          role: "assistant",
          content: payload.summary || "请选择一张图片作为参考素材。",
          intent: "tool",
          imageSearch: {
            query: payload.toolResult.query,
            results: payload.toolResult.results,
          },
        }]);
      } else if (payload.intent === "skill" && payload.skillId) {
        const brief = payload.skillBrief || message;
        setChat([...nextChat, { role: "assistant", content: payload.summary || "已选择专用工作流技能。", intent: payload.intent }]);
        previewWorkflowSkill(payload.skillId, brief, payload.summary);
      } else if (payload.intent === "dialogue" && payload.response) {
        if (payload.requiresClarification && payload.pendingIntent && payload.pendingRequest) {
          updateAgentMemory({
            lastIntent: "dialogue",
            pendingIntent: payload.pendingIntent,
            pendingRequest: payload.pendingRequest,
            pendingQuestions: payload.response.suggestedNext,
          });
        } else if (payload.response.brief) {
          addStoryChainNode(payload.response.brief, payload.response.title);
          updateAgentMemory({
            storyBrief: payload.response.brief,
            selectedDirection: payload.response.title,
            lastIntent: "dialogue",
            pendingIntent: undefined,
            pendingRequest: undefined,
            pendingQuestions: undefined,
          });
        } else {
          updateAgentMemory({ storyBrief: message, lastIntent: "dialogue", pendingIntent: undefined, pendingRequest: undefined, pendingQuestions: undefined });
        }
        setChat([...nextChat, { role: "assistant", content: payload.response.message, intent: payload.intent, response: payload.response }]);
      } else if (payload.intent === "create" && payload.plan && payload.patch) {
        updateAgentMemory({
          storyBrief: resolvedRequest,
          selectedDirection: payload.plan.title,
          lastIntent: "create",
          preferredWorkflowSkill: undefined,
          pendingIntent: undefined,
          pendingRequest: undefined,
          pendingQuestions: undefined,
        });
        setPreview({ intent: "create", plan: payload.plan, patch: payload.patch as CanvasPatch, summary: payload.summary || "Workflow plan prepared." });
        setChat([...nextChat, { role: "assistant", content: payload.summary || "已生成工作流计划。", intent: payload.intent }]);
      } else if (payload.intent === "edit" && payload.editPlan && payload.patch) {
        updateAgentMemory({ storyBrief: resolvedRequest, lastIntent: "edit", preferredWorkflowSkill: undefined, pendingIntent: undefined, pendingRequest: undefined, pendingQuestions: undefined });
        setPreview({ intent: "edit", editPlan: payload.editPlan, patch: payload.patch as CanvasEditPatch, summary: payload.summary || "Canvas edit plan prepared." });
        setChat([...nextChat, { role: "assistant", content: payload.summary || "已生成画布修改计划。", intent: payload.intent }]);
      } else if (payload.intent === "organize" && payload.organizePlan && payload.patch) {
        updateAgentMemory({ storyBrief: resolvedRequest, lastIntent: "organize", pendingIntent: undefined, pendingRequest: undefined, pendingQuestions: undefined });
        setPreview({ intent: "organize", organizePlan: payload.organizePlan, patch: payload.patch as CanvasEditPatch, summary: payload.summary || "Canvas organization plan prepared." });
        setChat([...nextChat, { role: "assistant", content: payload.summary || "已生成画布整理计划。", intent: payload.intent }]);
      } else {
        throw new Error("Agent response was incomplete.");
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Agent request failed.";
      const failedRun = apiErrorPayload<{ agentRun?: AgentRunTrace }>(error)?.agentRun;
      if (failedRun) {
        setAgentRunId(failedRun.id);
        setAgentRunStatus(failedRun.status);
        setAutonomousEvents(failedRun.events.slice(-24));
      } else {
        setAgentRunStatus("blocked");
      }
      setLocalError(messageText);
      setChat([...nextChat, { role: "assistant", content: messageText }]);
    } finally {
      if (autonomousControllerRef.current === autonomousController) autonomousControllerRef.current = null;
      setBusy(false);
    }
  };

  const stopAgentRun = async () => {
    autonomousControllerRef.current?.abort();
    if (!agentRunId) return;
    setAgentRunStatus("cancelled");
    try {
      const { run } = await cancelAgentRun(agentRunId);
      setAutonomousEvents(run.events.slice(-24));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to cancel the Agent run.");
    }
  };

  const resumePersistedRun = async () => {
    if (!agentRunId || busy) return;
    setBusy(true);
    setLocalError(null);
    const controller = new AbortController();
    autonomousControllerRef.current = controller;
    try {
      const { run } = await getAgentRun(agentRunId);
      if (run.executionMode !== "browser") throw new Error("This Agent run is assigned to a server worker.");
      if (!run.checkpoint?.planResponse) throw new Error("This Agent run does not have a resumable plan checkpoint.");
      const response = run.checkpoint.planResponse as unknown as AgentRouterResponse;
      if (response.ok !== true || !response.intent) throw new Error("The stored Agent plan is incomplete.");
      const resumed = await resumeAgentRun(agentRunId);
      const resumedExecutionModel = run.request?.executionModel || response.executionModel || executionModel;
      setExecutionModel(resumedExecutionModel);
      setAgentRunStatus(resumed.run.status);
      setAutonomousEvents(resumed.run.events.slice(-24));
      const result = await runAutonomousAgent({
        userMessage: run.request?.userMessage || "Resume the stored Agent run.",
        response,
        selectedNodeIds: run.checkpoint.selectedNodeIds,
        runId: run.id,
        initialEvents: run.events,
        resumeCheckpoint: run.checkpoint,
        signal: controller.signal,
        maxRepairAttempts: 2,
        executionModel: resumedExecutionModel,
        onEvent: (event) => setAutonomousEvents((current) => [...current, event].slice(-24)),
        persistUpdate: (update) => updateAgentRun(run.id, update),
      });
      setAgentRunStatus(result.status);
      setChat((current) => [...current, { role: "assistant", content: result.summary, intent: response.intent }]);
      if (result.status === "blocked") setLocalError(result.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resume the Agent run.";
      setAgentRunStatus("blocked");
      setLocalError(message);
    } finally {
      if (autonomousControllerRef.current === controller) autonomousControllerRef.current = null;
      setBusy(false);
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    if (preview.intent === "create") applyAgentPatch(preview.patch);
    else if (preview.intent === "skill") {
      rememberSkill(preview.skillId, preview.brief);
      void runAgentSkill(preview.skillId, preview.brief);
    }
    else applyAgentEditPatch({ ...preview.patch, selectedNodeIds: preview.patch.selectedNodeIds?.length ? preview.patch.selectedNodeIds : selectedNodeIds });
    setAgentRunStatus("completed");
    if (agentRunId) void updateAgentRun(agentRunId, { status: "completed", currentPhase: "completed", summary: "The approved canvas plan was applied." });
    setLocalError(null);
  };

  const choosePlacement = () => {
    if (preview?.intent === "skill") {
      rememberSkill(preview.skillId, preview.brief);
      void runAgentSkill(preview.skillId, preview.brief);
      setOpen(false);
      return;
    }
    if (preview?.intent !== "create") return;
    setPendingAgentPatch(preview.patch);
    setOpen(false);
  };

  const useWorkflowSkill = (skillId: AgentWorkflowSkillId, source = input) => {
    if (busy) return;
    const brief = source.trim() || agentMemory?.storyBrief || agentWorkflowSkills[skillId].description;
    previewWorkflowSkill(skillId, brief);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mindverse-agent-launcher group fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-2xl border transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        aria-label="Open Agent"
      >
        <svg aria-hidden="true" className="h-6 w-6 transition-transform duration-200 group-hover:scale-105" viewBox="0 0 24 24" fill="none">
          <path d="M12 3.5c.35 5.18 3.32 8.15 8.5 8.5-5.18.35-8.15 3.32-8.5 8.5-.35-5.18-3.32-8.15-8.5-8.5 5.18-.35 8.15-3.32 8.5-8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <section className="mindverse-agent-panel fixed bottom-3 right-3 top-3 z-50 flex w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#101214] text-[#f5f7fa] shadow-[0_28px_100px_rgba(2,6,23,0.48)]">
      <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#101214]/95 px-4 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border border-white/[0.08] bg-white/[0.05] text-sky-300">
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none"><path d="M10 2.5c.3 4.58 2.92 7.2 7.5 7.5-4.58.3-7.2 2.92-7.5 7.5-.3-4.58-2.92-7.2-7.5-7.5 4.58-.3 7.2-2.92 7.5-7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-white">{projectName || "新建创作"}</div>
            <div className="mt-0.5 text-[10px] font-medium tracking-[0.12em] text-[#7f878f]">AGENT · {nodes.length} 个画布节点</div>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl text-[#9aa1a9] transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" aria-label="Close Agent">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="mindverse-agent-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
        <div className="hidden">
          <h2 className="text-[24px] font-semibold leading-tight tracking-normal text-[#111827]">直接描述你想做什么</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#6b7280]">Agent 会结合当前画布和项目记忆，自动判断是构思、生成工作流、修改画布、整理画布还是调用专用 skill。</p>
        </div>

        <div className="hidden rounded-[16px] border border-[#dce2ea] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-[#111827]">Selected context</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f2f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#5f6b7a]">{selectedNodes.length} nodes</span>
              {selectedNodes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-[#6b7280] hover:bg-[#f2f5f9] hover:text-[#111827]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectionMode(!selectionMode)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${selectionMode ? "bg-[#111827] text-white hover:bg-[#2f3746]" : "bg-[#f2f5f9] text-[#111827] hover:bg-[#e7edf5]"}`}
              >
                {selectionMode ? "Done" : "Select"}
              </button>
            </div>
          </div>
          {selectedNodes.length ? (
            <div className="space-y-2">
              <p>{selectionMode ? "Selection mode is on. Click canvas nodes to add or remove them." : "Agent will prioritize these nodes when you say selected, these, current, this, or ask for edits."}</p>
              <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                {selectedNodes.slice(0, 8).map((node) => (
                  <div key={node.id} className="rounded-lg border border-[#edf1f6] bg-[#f7f9fc] px-2 py-1.5">
                    <div className="truncate font-semibold text-[#111827]">{node.data.title || node.id}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-[#7b8794]">{node.id}</div>
                    <div className="mt-0.5 text-[10px] text-[#7b8794]">{selectedNodeMeta(node)}</div>
                  </div>
                ))}
                {selectedNodes.length > 8 && <div className="text-[11px] text-[#7b8794]">+ {selectedNodes.length - 8} more selected nodes</div>}
              </div>
            </div>
          ) : (
            <p>{selectionMode ? "Selection mode is on. Click canvas nodes to add them here." : "Click Select, then click one or more canvas nodes if you want Agent to edit specific videos, images, audio, or workflow nodes."}</p>
          )}
        </div>

        {customSkill && (
          <div className="hidden rounded-[16px] border border-[#cfd9e6] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-[#111827]">当前 Skill</span>
              <button type="button" onClick={clearCustomSkill} className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111827]">清除</button>
            </div>
            <p className="font-semibold text-[#283241]">{customSkill.name}</p>
            <p className="mt-1 line-clamp-2">{customSkill.tagline}</p>
          </div>
        )}

        {chat.length === 0 && !preview && suggestionsVisible && (
          <div className={`mindverse-agent-welcome flex min-h-[270px] flex-1 flex-col justify-center py-5 sm:min-h-[320px] ${suggestionsLeaving ? "mindverse-agent-suggestions--leaving" : ""}`}>
            <div className="mb-6">
              <div className="flex items-center gap-3 text-[15px] font-medium text-[#9aa3ad]">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.09] bg-white/[0.05] text-sky-300">
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none"><path d="M10 2.5c.3 4.58 2.92 7.2 7.5 7.5-4.58.3-7.2 2.92-7.5 7.5-.3-4.58-2.92-7.2-7.5-7.5 4.58-.3 7.2-2.92 7.5-7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                </span>
                Hi，{projectName || "创作者"}
              </div>
              <h2 className="mt-4 max-w-[11em] text-[clamp(2rem,4.4vw,2.75rem)] font-medium leading-[1.08] tracking-[-0.045em] text-[#f3f4f6]">从画布的哪一处开始？</h2>
            </div>

            <div className="mindverse-agent-suggestion-deck grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseSuggestion("请先阅读当前画布，把散落的想法、素材和工作流梳理成一条清晰的创作路径，并给出下一步建议。")}
                className="mindverse-agent-task-card group min-h-[138px] cursor-pointer rounded-[24px] border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <div className="flex items-center justify-between text-[#89929d]">
                  <span className="flex items-center gap-2 text-[12px] font-semibold text-sky-200/70">
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><path d="M4 5.5h12M4 10h8M4 14.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="m14.5 9 1.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    理清画布
                  </span>
                  <span className="text-[10px] font-medium opacity-70 transition-transform duration-200 group-hover:translate-x-1">写入 →</span>
                </div>
                <p className="mt-4 text-[15px] font-semibold leading-[1.45] text-[#e7e9ec]">把散落节点编成一条创作路径</p>
                <p className="mt-1.5 text-[11px] leading-[1.65] text-[#777f88]">识别主题、素材关系与下一步动作。</p>
              </button>

              <button
                type="button"
                onClick={() => chooseSuggestion("基于当前项目搭建一份可编辑的视觉蓝图，明确世界观、角色、场景和镜头之间的关系，并在画布中组织出来。")}
                className="mindverse-agent-task-card group min-h-[138px] cursor-pointer rounded-[24px] border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <div className="flex items-center justify-between text-[#89929d]">
                  <span className="flex items-center gap-2 text-[12px] font-semibold text-sky-200/70">
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><circle cx="5" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="15" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="13" cy="15" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="m7 6 6-1M6.4 7.5l5.2 6M14.7 7l-1.4 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    搭建视觉结构
                  </span>
                  <span className="text-[10px] font-medium opacity-70 transition-transform duration-200 group-hover:translate-x-1">写入 →</span>
                </div>
                <p className="mt-4 text-[15px] font-semibold leading-[1.45] text-[#e7e9ec]">把故事变成可编辑的视觉蓝图</p>
                <p className="mt-1.5 text-[11px] leading-[1.65] text-[#777f88]">连接世界观、角色、场景和镜头。</p>
              </button>
            </div>
          </div>
        )}

        <div className="mindverse-agent-chat space-y-3">
          {chat.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`mindverse-agent-message rounded-[20px] border px-4 py-3.5 ${item.role === "user" ? "mindverse-agent-message--user ml-12" : "mindverse-agent-message--assistant mr-8"}`}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">{item.role === "user" ? "You" : item.intent || "Agent"}</div>
              <p className="whitespace-pre-wrap text-[13px] leading-6">{item.content}</p>
              {item.attachments?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((attachment) => (
                    <div key={`${attachment.mediaType}-${attachment.name}`} className="flex max-w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-black/15 p-1.5 pr-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06] text-[10px] font-bold uppercase text-sky-200">
                        {attachment.mediaType === "image"
                          ? <img src={attachment.url} alt="" className="h-full w-full object-cover" />
                          : attachment.mediaType === "video" ? "VID" : "AUD"}
                      </div>
                      <div className="min-w-0">
                        <div className="max-w-44 truncate text-[11px] font-semibold text-[#e8ebef]">{attachment.name}</div>
                        <div className="text-[9px] text-[#7f8994]">{attachmentTypeLabel(attachment.mediaType)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {item.response?.options?.length ? (
                <div className="mt-3 space-y-2">
                  {item.response.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void runUnifiedAgent("dialogue", `我选择 ${option.id}: ${option.title}。请继续完善这个方向。`)}
                      className="block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-left transition hover:border-sky-300/20 hover:bg-white/[0.07]"
                    >
                      <span className="block text-[12px] font-semibold text-[#eef0f2]">{option.id}. {option.title}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-[#89919a]">{option.summary}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {item.response?.brief ? (
                <div className="mt-3 flex gap-2">
                  <Button type="button" disabled={busy} onClick={() => void runUnifiedAgent(nodes.length ? "edit" : "create", item.response?.brief)} className="rounded-full !border-[#111827] !bg-[#111827] px-3 py-1 text-[11px] !text-white hover:!border-[#263244] hover:!bg-[#263244]">
                    生成工作流
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => useWorkflowSkill("fixed-scene-action-video", item.response?.brief || item.content)} className="rounded-full px-3 py-1 text-[11px]">
                    固定场景 Skill
                  </Button>
                </div>
              ) : null}
              {item.imageSearch ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {item.imageSearch.results.map((result) => {
                    const selectedResult = selectedImageResultIds.includes(result.id);
                    const selecting = selectingImageId === result.id;
                    return (
                      <div key={result.id} className="min-w-0 overflow-hidden border-t border-[#e7ebf1] pt-2">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#eef1f5]">
                          <img src={result.thumbnailUrl} alt={result.title} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <p className="mt-2 truncate text-[11px] font-semibold text-[#eef0f2]" title={result.title}>{result.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-[#7b8794]">{[result.creator || result.sourceName, result.license || "授权状态未知"].filter(Boolean).join(" · ")}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={Boolean(selectingImageId) || selectedResult}
                            onClick={() => void selectImageSearchResult(result, item.imageSearch!.query)}
                            className="rounded-md bg-[#111827] px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#2f3746] disabled:cursor-default disabled:opacity-50"
                          >
                            {selectedResult ? "已加入" : selecting ? "处理中..." : "使用"}
                          </button>
                          <a href={result.sourcePageUrl} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[#5f6b7a] hover:text-[#111827]">来源</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {(agentMessage || localError || agentStatus !== "idle") && (
          <div className="mindverse-agent-status flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${localError || agentStatus === "error" ? "bg-rose-500" : agentStatus === "completed" ? "bg-emerald-500" : "bg-sky-500"}`} />
            <span className={localError || agentStatus === "error" ? "text-rose-600" : ""}>{localError || agentMessage || "Ready."}</span>
          </div>
        )}

        <div className="hidden items-center justify-between gap-3 rounded-xl border border-[#dce2ea] bg-white px-3 py-2 shadow-sm">
          <div>
            <div className="text-[12px] font-semibold text-[#111827]">自主执行</div>
            <div className="text-[10px] leading-4 text-[#7b8794]">自动应用、运行、观察并最多修复两轮，可能触发付费生成。</div>
          </div>
          <div className="flex items-center gap-2">
            {busy && autonomousEnabled && (
              <button
                type="button"
                onClick={() => void stopAgentRun()}
                className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700"
              >
                停止
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={autonomousEnabled}
              aria-label="自主执行"
              disabled={busy}
              onClick={() => setAutonomousEnabled((value) => !value)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${autonomousEnabled ? "bg-[#111827]" : "bg-[#cbd3df]"} disabled:opacity-50`}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${autonomousEnabled ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </div>

        {usedSkills.length > 0 && (
          <div className="mindverse-agent-used-skills rounded-xl border px-3 py-2">
            <div className="mb-2 text-[11px] font-semibold text-[#dfe3e7]">本次已使用的 Skill / 提示词规则</div>
            <div className="flex flex-wrap gap-1.5">
              {usedSkills.map((skill) => (
                <span
                  key={skill.id}
                  title={skill.supports.length ? `能力：${skill.supports.join(", ")}` : undefined}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${skillUsageClassName(skill.source)}`}
                >
                  <span>{skill.name}</span>
                  <span className="font-normal opacity-75">{skill.role === "base_policy" ? "基础规范" : skill.role === "style_profile" ? "风格" : skillUsageLabel(skill.source)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {autonomousEvents.length > 0 && (
          <div className="mindverse-agent-run rounded-xl border px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#e7e9ec]">
              <span>Agent Run</span>
              <div className="flex items-center gap-2">
                {!busy && agentRunId && agentRunStatus && ["ready", "running"].includes(agentRunStatus) && (
                  <button
                    type="button"
                    onClick={() => void stopAgentRun()}
                    className="font-sans text-[10px] font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Cancel
                  </button>
                )}
                {!busy && agentRunId && agentRunStatus && ["ready", "running", "blocked", "cancelled"].includes(agentRunStatus) && (
                  <button
                    type="button"
                    onClick={() => void resumePersistedRun()}
                    className="font-sans text-[10px] font-semibold text-sky-700 hover:text-sky-800"
                  >
                    Resume
                  </button>
                )}
                <span className="font-mono text-[10px] font-normal text-[#7b8794]">
                  {agentRunId ? agentRunId.slice(0, 8) : "local"} · {agentRunStatus || "running"}
                </span>
                <button
                  type="button"
                  onClick={() => setAgentRunExpanded((value) => !value)}
                    className="font-sans text-[10px] font-semibold text-[#929aa4] hover:text-white"
                >
                  {agentRunExpanded ? "收起" : "详情"}
                </button>
              </div>
            </div>
            {agentRunExpanded ? (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-white/[0.07] pt-2">
                {autonomousEvents.slice(-10).map((event) => (
                  <div key={event.id} className="flex gap-2 text-[11px] leading-4 text-[#5f6b7a]">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.phase === "blocked" ? "bg-rose-500" : event.phase === "completed" ? "bg-emerald-500" : event.phase === "repairing" ? "bg-amber-500" : "bg-sky-500"}`} />
                    <span>
                      <strong className="font-semibold text-[#374151]">{event.phase}</strong> {event.message}
                      {(event.kind || event.durationMs !== undefined) && (
                        <span className="ml-1 text-[10px] text-[#9aa4b2]">
                          {[event.kind, event.durationMs !== undefined ? `${event.durationMs}ms` : ""].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 truncate text-[10px] text-[#7b8794]">{autonomousEvents.at(-1)?.message || "等待执行"}</p>
            )}
          </div>
        )}

        <div className="mindverse-agent-composer mindverse-agent-composer-activate sticky bottom-0 z-30 order-[99] mt-auto shrink-0 overflow-hidden rounded-[24px] border border-white/[0.11] bg-[#191b1e] shadow-[0_18px_60px_rgba(0,0,0,0.34)] focus-within:border-sky-300/35 focus-within:shadow-[0_18px_60px_rgba(0,0,0,0.34),0_0_0_1px_rgba(125,211,252,0.18)]">
          <div className="relative z-[1] flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="sr-only"
              onChange={(event) => {
                void addAgentAttachments(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy || attachments.length >= 8}
              onClick={() => attachmentInputRef.current?.click()}
              aria-label="添加图片、视频或音频素材"
              title="添加素材（最多 8 个）"
              className="mindverse-agent-context-button inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M5.25 8.75 9.8 4.2a2.05 2.05 0 0 1 2.9 2.9l-5.6 5.6a3.15 3.15 0 0 1-4.45-4.45l5.4-5.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>
              素材{attachments.length ? ` ${attachments.length}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setSelectionMode(!selectionMode)}
              aria-pressed={selectionMode}
              className="mindverse-agent-context-button inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold transition"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M3 3h4v4H3V3Zm6 0h4v4H9V3ZM3 9h4v4H3V9Zm6 0h4v4H9V9Z" stroke="currentColor" strokeWidth="1.2" /></svg>
              {selectionMode ? "完成选择" : `${selectedNodes.length} 个手选节点`}
            </button>
            {selectedNodes.length > 0 && (
              <button type="button" onClick={() => setSelectedNode(null)} className="mindverse-agent-clear-button h-8 rounded-full px-2 text-[10px] font-semibold transition">清除</button>
            )}
            {customSkill && (
              <button type="button" onClick={clearCustomSkill} title="清除当前 Skill" className="mindverse-agent-skill-chip inline-flex h-8 max-w-44 items-center gap-1.5 rounded-full border px-3 text-[10px] font-semibold transition">
                <span className="truncate">{customSkill.name}</span><span aria-hidden="true">×</span>
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={autonomousEnabled}
              aria-label="自主执行"
              disabled={busy}
              onClick={() => setAutonomousEnabled((value) => !value)}
              className="mindverse-agent-autonomy-toggle ml-auto inline-flex h-8 items-center gap-2 rounded-full px-2 text-[10px] font-semibold transition disabled:opacity-50"
            >
              <span>自主执行</span>
              <span className={`relative h-5 w-9 rounded-full transition ${autonomousEnabled ? "bg-sky-300" : "bg-white/[0.12]"}`}>
                <span className={`absolute top-1 h-3 w-3 rounded-full transition ${autonomousEnabled ? "left-5 bg-[#101214]" : "left-1 bg-[#9aa2ab]"}`} />
              </span>
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="relative z-[1] flex gap-2 overflow-x-auto border-b border-white/[0.07] px-4 py-3">
              {attachments.map((attachment) => (
                <div key={attachment.id} className={`group relative flex w-[178px] shrink-0 items-center gap-2 rounded-[14px] border p-2 ${attachment.status === "error" ? "border-rose-400/30 bg-rose-400/[0.06]" : "border-white/[0.09] bg-white/[0.035]"}`}>
                  <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#101214] text-[10px] font-bold tracking-wide text-sky-200">
                    {attachment.mediaType === "image"
                      ? <img src={attachment.url} alt="" className="h-full w-full object-cover" />
                      : attachment.mediaType === "video" ? "VIDEO" : "AUDIO"}
                    {attachment.status === "uploading" && <span className="absolute inset-0 grid place-items-center bg-black/55"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" /></span>}
                  </div>
                  <div className="min-w-0 pr-4">
                    <div className="truncate text-[11px] font-semibold text-[#e5e8eb]" title={attachment.name}>{attachment.name}</div>
                    <div className={`mt-0.5 truncate text-[9px] ${attachment.status === "error" ? "text-rose-300" : "text-[#7e8791]"}`} title={attachment.error}>
                      {attachment.status === "uploading" ? "正在上传" : attachment.status === "error" ? attachment.error || "上传失败" : `${attachmentTypeLabel(attachment.mediaType)} · 已作为 Agent 输入`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={attachment.status === "uploading"}
                    onClick={() => removeAgentAttachment(attachment)}
                    aria-label={`移除 ${attachment.name}`}
                    className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[13px] text-[#717a84] transition hover:bg-white/[0.08] hover:text-white disabled:opacity-25"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={composerRef}
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runUnifiedAgent();
              }
            }}
            rows={3}
            placeholder="描述创意或需求，使用 / 技能，@ 引用画布内容…"
            className="relative z-[1] min-h-24 w-full resize-none bg-transparent px-5 pb-3 pt-4 text-[15px] leading-6 text-[#edf0f3] outline-none placeholder:text-[#6e757d]"
            aria-label="Agent instruction"
          />
          {(isListening || speechError) && (
            <div className={`mindverse-agent-speech-status relative z-[1] flex items-center gap-2 px-5 pb-2 text-[11px] ${speechError ? "text-rose-500" : ""}`} role="status" aria-live="polite">
              {isListening && (
                <span className="mindverse-agent-speech-wave flex h-3 items-center gap-0.5" aria-hidden="true">
                  <span /><span /><span />
                </span>
              )}
              <span>{speechError || "正在听，把想法直接说出来…"}</span>
            </div>
          )}
          <div className="relative z-[1] grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-3 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="mindverse-agent-model relative flex h-10 items-center rounded-full border text-xs font-semibold transition">
                <span className="pl-3 text-[10px] font-medium text-[#777f88]">模型</span>
                <select
                  value={executionModel}
                  disabled={busy}
                  onChange={(event) => setExecutionModel(agentExecutionModelFrom(event.target.value))}
                  aria-label="Agent execution model"
                  className="max-w-44 cursor-pointer appearance-none rounded-full bg-transparent py-2 pl-2 pr-7 text-xs font-semibold text-[#dfe3e7] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {agentExecutionModelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {option.providerLabel}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 text-[9px] text-[#7d858e]">▾</span>
              </label>
              <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)} className="mindverse-agent-advanced-button h-10 rounded-full border px-4 text-xs font-semibold transition">
                高级
              </button>
              <button
                type="button"
                disabled={!agentMemory}
                onClick={clearProjectMemory}
                title="清空项目记忆"
                className="mindverse-agent-memory-button h-10 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
              >
                清空
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={isListening ? "停止语音输入" : "开始语音输入"}
                aria-pressed={isListening}
                disabled={!speechSupported || busy}
                onClick={toggleSpeechInput}
                title={speechSupported ? (isListening ? "停止语音输入" : "使用浏览器语音输入") : "当前浏览器不支持语音输入"}
                className="mindverse-agent-voice-button grid h-11 w-11 place-items-center rounded-full border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isListening ? (
                  <span className="h-3.5 w-3.5 rounded-[4px] bg-current" aria-hidden="true" />
                ) : (
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                )}
              </button>
              <button type="button" aria-label="发送" disabled={!canSubmit} onClick={() => void runUnifiedAgent()} className="mindverse-agent-send-button grid h-11 w-11 place-items-center rounded-full transition duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed">
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><path d="M10 15V4m0 0L5.5 8.5M10 4l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
                <span className="sr-only">发送</span>
              </button>
            </div>
          </div>
        </div>

        {advancedOpen && (
          <div className="mindverse-agent-advanced rounded-[18px] border p-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("dialogue")} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">只构思</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("create")} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">生成工作流</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("edit")} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">修改画布</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("organize")} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">整理画布</Button>
              <Button type="button" disabled={!selectedNodeIds.length} onClick={() => markSelectedWorkflow(1, "Workflow 1")} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">标记选中</Button>
              <Button type="button" disabled={!nodes.length} onClick={arrangeWorkflows} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">本地排列</Button>
              <Button type="button" disabled={!selectedNodeIds.length} onClick={clearSelectedWorkflowMark} className="rounded-full !border-white/[0.08] !bg-white/[0.04] !text-[#d9dde2] hover:!bg-white/[0.08]">清除标记</Button>
            </div>
            <div className="mt-3 grid gap-2">
              {workflowSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  disabled={busy}
                  onClick={() => useWorkflowSkill(skill.id)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-left transition hover:border-sky-300/20 hover:bg-white/[0.07] disabled:opacity-50"
                >
                  <span className="block text-[13px] font-semibold text-[#e8ebef]">{skill.label}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-[#858e98]">{skill.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {preview?.intent === "skill" && (
          <div className="mindverse-agent-preview-card rounded-[18px] border p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.title}</h3>
                <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.summary}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#15803d]">skill</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">时长: {preview.duration}s</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">镜头: {preview.shotCount}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">素材: {preview.referenceTitles.length}</div>
            </div>
            <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.referenceTitles.map((title, index) => (
                <div key={`${title}-${index}`} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">@{index + 1}</span>
                  <div className="text-[12px] font-semibold text-[#111827]">{title}</div>
                </div>
              ))}
              <div className="px-3 py-2">
                <div className="text-[12px] font-semibold text-[#111827]">Video Prompt</div>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 text-[#7b8794]">{preview.videoPrompt}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={choosePlacement} className="rounded-full !border-[#111827] !bg-[#111827] !text-white hover:!border-[#263244] hover:!bg-[#263244]">选择位置</Button>
              <Button type="button" onClick={() => setPreview(null)} className="rounded-full">取消</Button>
            </div>
          </div>
        )}

        {preview?.intent === "create" && (
          <div className="mindverse-agent-preview-card rounded-[18px] border p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.plan.title}</h3>
                <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.summary}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1f6feb]">{preview.plan.goal}</span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.plan.steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">{step.kind}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#111827]">{step.label}</div>
                    {step.purpose && <div className="text-[11px] leading-4 text-[#7b8794]">{step.purpose}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={choosePlacement} className="rounded-full !border-[#111827] !bg-[#111827] !text-white hover:!border-[#263244] hover:!bg-[#263244]">选择位置</Button>
              <Button type="button" onClick={applyPreview} className="rounded-full">直接应用</Button>
            </div>
          </div>
        )}

        {preview?.intent === "edit" && (
          <div className="mindverse-agent-preview-card rounded-[18px] border p-4">
            <h3 className="text-[16px] font-semibold text-[#111827]">{preview.editPlan.title}</h3>
            <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.summary}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">新增: {preview.patch.createNodes.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">更新: {preview.patch.updateNodes.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">删除: {preview.patch.deleteNodeIds.length}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">Connect: {preview.patch.createEdges.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">Disconnect: {preview.patch.deleteEdgeIds.length}</div>
            </div>
            {preview.patch.warnings?.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                {preview.patch.warnings.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
              </div>
            ) : null}
            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.editPlan.operations.map((operation) => (
                <div key={operation.id} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">{operation.type}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#111827]">{operation.label || operationTarget(operation)}</div>
                    {operation.reason && <div className="text-[11px] leading-4 text-[#7b8794]">{operation.reason}</div>}
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              disabled={
                !preview.patch.createNodes.length &&
                !preview.patch.updateNodes.length &&
                !preview.patch.deleteNodeIds.length &&
                !preview.patch.createEdges.length &&
                !preview.patch.deleteEdgeIds.length
              }
              onClick={applyPreview}
              className="mt-4 w-full rounded-full !border-[#111827] !bg-[#111827] !text-white hover:!border-[#263244] hover:!bg-[#263244]"
            >
              应用修改
            </Button>
          </div>
        )}

        {preview?.intent === "organize" && (
          <div className="mindverse-agent-preview-card rounded-[18px] border p-4">
            <h3 className="text-[16px] font-semibold text-[#111827]">{preview.organizePlan.title}</h3>
            <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.summary}</p>
            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.organizePlan.workflows.map((workflow) => (
                <div key={workflow.id} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">#{workflow.label}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#111827]">{workflow.title}</div>
                    <div className="text-[11px] leading-4 text-[#7b8794]">{workflow.nodeIds.length} nodes</div>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" onClick={applyPreview} className="mt-4 w-full rounded-full !border-[#111827] !bg-[#111827] !text-white hover:!border-[#263244] hover:!bg-[#263244]">应用整理</Button>
          </div>
        )}
      </div>
    </section>
  );
}
