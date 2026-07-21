"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { requestAgentRouter } from "@/features/agent/services/agentClient";
import { runAutonomousAgent } from "@/features/agent/services/autonomousAgent";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { agentMemorySummary, type AgentReferenceAsset } from "@/shared/agent/projectMemory";
import { agentWorkflowSkills, buildFixedSceneVideoSkill, type AgentWorkflowSkillId } from "@/shared/agent/workflowSkills";
import type {
  AgentCanvasEditPlan,
  AgentCanvasOrganizePlan,
  AgentDialogueResponse,
  AgentWorkflowPlan,
  CanvasEditPatch,
  CanvasPatch,
} from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { ACTIVE_SKILL_KEY } from "@/features/skills/services/skillClient";
import type { AgentRunEvent } from "@/shared/agent/agentAutonomy";
import type { AgentImageSearchResult } from "@/shared/agent/agentTools";
import { archiveRemoteImageUrl } from "@/features/canvas/services/mediaArchiveClient";

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
};

const suggestions = [
  "和我一起构思一个骑士寻找公主的悲情短片",
  "用人物四象图和场景九宫图生成一个10秒固定场景视频工作流",
  "把选中的视频剪成15秒预告片，节奏快一点，保留原声",
  "整理当前画布，把同一故事的节点分组并排整齐",
];

const operationTarget = (operation: AgentCanvasEditPlan["operations"][number]) =>
  operation.targetNodeId || operation.sourceNodeId || operation.targetNodeIdForConnection || operation.targetEdgeId || operation.nodeType || "canvas";

const fixedSceneConstraints = [
  "Use character turnaround images and a scene nine-grid image.",
  "Avoid storyboard-only workflow for fixed-scene video requests.",
];

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

export function AgentWorkflowPanel() {
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
  const [selectingImageId, setSelectingImageId] = useState<string | null>(null);
  const [selectedImageResultIds, setSelectedImageResultIds] = useState<string[]>([]);
  const autonomousControllerRef = useRef<AbortController | null>(null);

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

  const workflowSkills = Object.values(agentWorkflowSkills);
  const selectedNodeIds = useMemo(
    () => [...new Set([...nodes.filter((node) => node.selected).map((node) => node.id), ...(selectedNodeId ? [selectedNodeId] : [])])],
    [nodes, selectedNodeId],
  );
  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNode => Boolean(node)),
    [nodes, selectedNodeIds],
  );
  const memoryText = useMemo(() => agentMemorySummary(agentMemory), [agentMemory]);
  const canSubmit = input.trim().length > 0 && !busy;

  useEffect(() => {
    const raw = window.localStorage.getItem(ACTIVE_SKILL_KEY);
    if (!raw) return;
    try {
      setCustomSkill(JSON.parse(raw) as ActiveSkillContext);
    } catch {
      window.localStorage.removeItem(ACTIVE_SKILL_KEY);
    }
  }, []);

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
    const message = (messageOverride ?? input).trim();
    if (!message || busy) return;
    setBusy(true);
    setLocalError(null);
    setPreview(null);
    const nextChat: ChatEntry[] = [...chat, { role: "user", content: message }];
    setChat(nextChat);
    setInput("");
    const autonomousController = autonomousEnabled ? new AbortController() : null;
    autonomousControllerRef.current = autonomousController;
    if (autonomousEnabled) setAutonomousEvents([]);

    try {
      const payload = await requestAgentRouter({
        userMessage: message,
        canvasSnapshot: { version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined },
        selectedNodeIds,
        conversation: chat.map((item) => ({ role: item.role, content: item.content })),
        forceIntent,
        customSkill: customSkill || undefined,
      });
      const resolvedRequest = payload.resolvedRequest || message;

      if (autonomousEnabled && ["create", "edit", "organize", "skill"].includes(payload.intent)) {
        updateAgentMemory({
          storyBrief: resolvedRequest,
          lastIntent: payload.intent,
          preferredWorkflowSkill: payload.intent === "skill" ? payload.skillId : undefined,
          pendingIntent: undefined,
          pendingRequest: undefined,
          pendingQuestions: undefined,
        });
        const result = await runAutonomousAgent({
          userMessage: resolvedRequest,
          response: payload,
          selectedNodeIds,
          signal: autonomousController?.signal,
          maxRepairAttempts: 2,
          onEvent: (event) => setAutonomousEvents((current) => [...current, event].slice(-24)),
        });
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
      setLocalError(messageText);
      setChat([...nextChat, { role: "assistant", content: messageText }]);
    } finally {
      if (autonomousControllerRef.current === autonomousController) autonomousControllerRef.current = null;
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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[#dce2ea] bg-white text-[#111827] shadow-[0_18px_48px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-[#b9c4d2] hover:bg-[#f7f9fc]"
        aria-label="Open Agent"
      >
        <span className="text-[13px] font-semibold">AI</span>
      </button>
    );
  }

  return (
    <section className="fixed bottom-5 right-5 z-50 flex h-[min(760px,calc(100vh-40px))] w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-[#dce2ea] bg-[#f7f9fc] text-[#111827] shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
      <header className="flex h-14 items-center justify-between border-b border-[#e3e8ef] bg-white px-4">
        <div>
          <div className="text-[15px] font-semibold text-[#111827]">Mindverse Agent</div>
          <div className="text-[11px] text-[#7b8794]">{nodes.length} nodes · {selectedNodeIds.length} selected</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-[#f7f9fc]" aria-label="Close Agent">
          <span className="text-[20px] leading-none">x</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div>
          <h2 className="text-[24px] font-semibold leading-tight tracking-normal text-[#111827]">直接描述你想做什么</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#6b7280]">Agent 会结合当前画布和项目记忆，自动判断是构思、生成工作流、修改画布、整理画布还是调用专用 skill。</p>
        </div>

        <div className="rounded-[16px] border border-[#dce2ea] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
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
          <div className="rounded-[16px] border border-[#cfd9e6] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-[#111827]">当前 Skill</span>
              <button type="button" onClick={clearCustomSkill} className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111827]">清除</button>
            </div>
            <p className="font-semibold text-[#283241]">{customSkill.name}</p>
            <p className="mt-1 line-clamp-2">{customSkill.tagline}</p>
          </div>
        )}

        {memoryText && (
          <div className="rounded-[16px] border border-[#dce2ea] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-[#111827]">项目记忆</span>
              <button type="button" onClick={clearAgentMemory} className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111827]">
                清除
              </button>
            </div>
            <p className="line-clamp-4 whitespace-pre-wrap">{memoryText}</p>
          </div>
        )}

        <div className="space-y-3">
          {chat.length === 0 && (
            <div className="rounded-[16px] border border-[#e1e6ee] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
              你可以先和 Agent 聊故事方向，再说“生成一个新工作流”。如果前面已经确认了固定场景短片，它会优先调用人物四象图 + 场景九宫图的 skill。
            </div>
          )}
          {chat.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`rounded-[16px] border px-3 py-3 shadow-sm ${item.role === "user" ? "ml-12 border-[#111827] bg-[#111827] text-white" : "mr-8 border-[#e1e6ee] bg-white text-[#111827]"}`}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">{item.role === "user" ? "You" : item.intent || "Agent"}</div>
              <p className="whitespace-pre-wrap text-[13px] leading-6">{item.content}</p>
              {item.response?.options?.length ? (
                <div className="mt-3 space-y-2">
                  {item.response.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void runUnifiedAgent("dialogue", `我选择 ${option.id}: ${option.title}。请继续完善这个方向。`)}
                      className="block w-full rounded-xl border border-[#edf1f6] bg-[#f7f9fc] p-3 text-left transition hover:border-[#c8d2df] hover:bg-white"
                    >
                      <span className="block text-[12px] font-semibold text-[#111827]">{option.id}. {option.title}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-[#5f6b7a]">{option.summary}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {item.response?.brief ? (
                <div className="mt-3 flex gap-2">
                  <Button type="button" disabled={busy} onClick={() => void runUnifiedAgent(nodes.length ? "edit" : "create", item.response?.brief)} className="rounded-full border-[#111827] bg-[#111827] px-3 py-1 text-[11px] text-white hover:border-[#263244] hover:bg-[#263244]">
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
                        <p className="mt-2 truncate text-[11px] font-semibold text-[#111827]" title={result.title}>{result.title}</p>
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

        <div className="grid grid-cols-1 gap-2">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setInput(item)}
              className="rounded-xl border border-[#e1e6ee] bg-white px-3 py-2 text-left text-[12px] font-medium leading-5 text-[#374151] shadow-sm transition hover:border-[#c8d2df] hover:bg-[#fbfcfe]"
            >
              {item}
            </button>
          ))}
        </div>

        {(agentMessage || localError || agentStatus !== "idle") && (
          <div className="flex items-start gap-2 rounded-xl border border-[#e1e6ee] bg-white px-3 py-2 text-[12px] text-[#5f6b7a] shadow-sm">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${localError || agentStatus === "error" ? "bg-rose-500" : agentStatus === "completed" ? "bg-emerald-500" : "bg-sky-500"}`} />
            <span className={localError || agentStatus === "error" ? "text-rose-600" : ""}>{localError || agentMessage || "Ready."}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dce2ea] bg-white px-3 py-2 shadow-sm">
          <div>
            <div className="text-[12px] font-semibold text-[#111827]">自主执行</div>
            <div className="text-[10px] leading-4 text-[#7b8794]">自动应用、运行、观察并最多修复两轮，可能触发付费生成。</div>
          </div>
          <div className="flex items-center gap-2">
            {busy && autonomousEnabled && (
              <button
                type="button"
                onClick={() => autonomousControllerRef.current?.abort()}
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

        {autonomousEvents.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-[#dce2ea] bg-white px-3 py-2 shadow-sm">
            <div className="mb-1 text-[11px] font-semibold text-[#111827]">执行记录</div>
            <div className="space-y-1">
              {autonomousEvents.slice(-10).map((event) => (
                <div key={event.id} className="flex gap-2 text-[11px] leading-4 text-[#5f6b7a]">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.phase === "blocked" ? "bg-rose-500" : event.phase === "completed" ? "bg-emerald-500" : event.phase === "repairing" ? "bg-amber-500" : "bg-sky-500"}`} />
                  <span><strong className="font-semibold text-[#374151]">{event.phase}</strong> {event.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-[18px] border border-[#dce2ea] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runUnifiedAgent();
              }
            }}
            rows={4}
            placeholder="描述你的需求，比如：继续用刚才的骑士故事生成固定场景视频工作流"
            className="min-h-28 w-full resize-none rounded-t-[18px] bg-transparent px-4 py-4 text-[14px] leading-6 text-[#111827] outline-none placeholder:text-[#8a94a3]"
            aria-label="Agent instruction"
          />
          <div className="flex items-center justify-between gap-2 border-t border-[#edf1f6] px-3 py-3">
            <Button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="rounded-full px-4">
              高级
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void runUnifiedAgent()} className="rounded-full border-[#111827] bg-[#111827] px-4 text-white hover:border-[#263244] hover:bg-[#263244]">
              {busy ? "处理中..." : "发送"}
            </Button>
          </div>
        </div>

        {advancedOpen && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("dialogue")} className="rounded-full">只构思</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("create")} className="rounded-full">生成工作流</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("edit")} className="rounded-full">修改画布</Button>
              <Button type="button" disabled={!input.trim() || busy} onClick={() => void runUnifiedAgent("organize")} className="rounded-full">整理画布</Button>
              <Button type="button" disabled={!selectedNodeIds.length} onClick={() => markSelectedWorkflow(1, "Workflow 1")} className="rounded-full">标记选中</Button>
              <Button type="button" disabled={!nodes.length} onClick={arrangeWorkflows} className="rounded-full">本地排列</Button>
              <Button type="button" disabled={!selectedNodeIds.length} onClick={clearSelectedWorkflowMark} className="rounded-full">清除标记</Button>
            </div>
            <div className="mt-3 grid gap-2">
              {workflowSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  disabled={busy}
                  onClick={() => useWorkflowSkill(skill.id)}
                  className="rounded-xl border border-[#e1e6ee] bg-[#f7f9fc] px-3 py-3 text-left transition hover:border-[#c8d2df] hover:bg-white disabled:opacity-50"
                >
                  <span className="block text-[13px] font-semibold text-[#111827]">{skill.label}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-[#5f6b7a]">{skill.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {preview?.intent === "skill" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
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
              <Button type="button" onClick={choosePlacement} className="rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">选择位置</Button>
              <Button type="button" onClick={() => setPreview(null)} className="rounded-full">取消</Button>
            </div>
          </div>
        )}

        {preview?.intent === "create" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
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
              <Button type="button" onClick={choosePlacement} className="rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">选择位置</Button>
              <Button type="button" onClick={applyPreview} className="rounded-full">直接应用</Button>
            </div>
          </div>
        )}

        {preview?.intent === "edit" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
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
              className="mt-4 w-full rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]"
            >
              应用修改
            </Button>
          </div>
        )}

        {preview?.intent === "organize" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
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
            <Button type="button" onClick={applyPreview} className="mt-4 w-full rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">应用整理</Button>
          </div>
        )}
      </div>
    </section>
  );
}
