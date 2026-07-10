"use client";
import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import { topologicalSort } from "@/shared/workflow/topologicalSort";
import { canvasStorage } from "@/features/canvas/services/canvasStorage";
import { pollTaskRemote, requestImageRevision, runNodeRemote } from "@/features/canvas/services/nodeExecutionClient";
import { requestAgentEdit, requestAgentOrganize, requestAgentPlan } from "@/features/agent/services/agentClient";
import { buildTemplate, makeNode, type Template } from "@/shared/templates/templates";
import { promptsFromStoryboard } from "@/shared/workflow/storyPipeline";
import { videoModelPatch, videoTargetHandleForNodeType } from "@/shared/workflow/videoModelPresets";
import type { AgentCanvasEditPlan, AgentCanvasOrganizePlan, AgentWorkflowPlan, CanvasEditPatch, CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, CanvasNodeData, CanvasSnapshot, ImageAnnotation, NodeOutput, NodeType, WorkflowEdge } from "@/shared/canvas";
import { asRecord, asText } from "@/features/canvas/domain/values";
import { imageUrlFrom, inputFor, keyframePatchFromPrompt, promptFrom, revisionPromptFrom } from "@/features/canvas/domain/nodeInputCompiler";
import { canRunRemotely, makeOutput, outputFor, outputFromProvider } from "@/features/canvas/domain/nodeOutputNormalizer";
import { arrangeWorkflowNodes, connectedNodeIdsFrom, selectedNodeIdsFrom } from "@/features/canvas/domain/canvasLayout";
import { applyEditPatchToState, dedupePatch, offsetPatchTo } from "@/features/agent/domain/agentPatch";
import { mergeAgentProjectMemory, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import { buildFixedSceneVideoSkill, type AgentWorkflowSkillId } from "@/shared/agent/workflowSkills";

const DEFAULT_AGENT_IMAGE_MODEL = "gpt-image-2(tokenstar)";

type AgentStatus = "idle" | "planning" | "building" | "running" | "completed" | "error";
type CanvasState = { projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[]; agentMemory: AgentProjectMemory | null; selectedNodeId: string | null; lastError: string | null; agentStatus: AgentStatus; agentMessage: string | null;
  ghostType: NodeType | null; ghostData: Partial<CanvasNodeData> | null; setGhostType(type: NodeType | null, data?: Partial<CanvasNodeData>): void; placeGhostNode(position: { x: number; y: number }): void;
  ghostMediaUrl: string | null; setGhostMedia(dataUrl: string): void; placeGhostMedia(position: { x: number; y: number }): void;
  pendingAgentPatch: CanvasPatch | null; setPendingAgentPatch(patch: CanvasPatch | null): void; placeAgentPatch(position: { x: number; y: number }): void;
  addMediaNode(dataUrl: string, position: { x: number; y: number }): void;
  updateAgentMemory(patch: Partial<AgentProjectMemory>): void;
  clearAgentMemory(): void;
  normalizeVideoConnections(): void; materializeStoryboardBranch(storyboardId: string): void;
  addStoryChainNode(content: string, title?: string): void;
  runGroup(groupId: string): Promise<void>;
  setGroupColor(nodeIds: string[], color: string): void;
  updateGroupColor(groupId: string, color: string): void;
  setGroupLocked(nodeIds: string[], locked: boolean): void;
  markSelectedWorkflow(order: number, title?: string): void;
  clearSelectedWorkflowMark(): void;
  arrangeWorkflows(): void;
  setGroupLockedByGroupId(groupId: string, locked: boolean): void;
  setProjectName(name: string): void; setSelectedNode(id: string | null): void; onNodesChange(changes: NodeChange<CanvasNode>[]): void; onEdgesChange(changes: EdgeChange<WorkflowEdge>[]): void; onConnect(connection: Connection): void;
  addNode(type: NodeType): void; updateNodeData(id: string, patch: Partial<CanvasNodeData>): void; removeNode(id: string): void; duplicateNode(id: string): void; createImageRevision(sourceId: string, annotations: ImageAnnotation[], instruction: string): Promise<void>; createKeyframeBatch(sourceId: string): void; setCanvas(nodes: CanvasNode[], edges: WorkflowEdge[], agentMemory?: AgentProjectMemory | null): void;
  runNode(id: string): Promise<void>; pollNode(id: string): Promise<void>; runWorkflow(): Promise<void>; generateAgentPlan(userPrompt: string): Promise<{ plan: AgentWorkflowPlan; patch: CanvasPatch; summary: string }>; applyAgentPatch(patch: CanvasPatch): void; generateAgentEdit(userInstruction: string): Promise<{ editPlan: AgentCanvasEditPlan; patch: CanvasEditPatch; summary: string }>; applyAgentEditPatch(patch: CanvasEditPatch): void; generateAgentOrganize(userInstruction: string): Promise<{ organizePlan: AgentCanvasOrganizePlan; patch: CanvasEditPatch; summary: string }>; runAgentWorkflow(brief: string): Promise<void>; runAgentSkill(skillId: AgentWorkflowSkillId, brief: string): Promise<void>; saveCanvas(): void; loadCanvas(): void; clearCanvas(): void; exportCanvasJson(): string; importCanvasJson(raw: string): void; applyTemplate(template: Template): void; };
const initialNodes: CanvasNode[] = [];
const isSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).nodes) && Array.isArray((value as CanvasSnapshot).edges));
const pollTimers = new Map<string, number>();
const schedulePoll = (id: string, run: () => void, intervalMs = 3000) => {
  if (typeof window === "undefined") return;
  const existing = pollTimers.get(id);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => { pollTimers.delete(id); run(); }, Math.max(5000, intervalMs));
  pollTimers.set(id, timer);
};
const restoreStatuses = (nodes: CanvasNode[]): CanvasNode[] => nodes.map((node) => { if (node.data.status !== "running") return node; const polling = ["pending", "running"].includes(asText(asRecord(node.data.output?.value).status)); const status: CanvasNodeData["status"] = polling ? "waiting" : "idle"; return { ...node, data: { ...node.data, status } }; });
const edgeFor = (source: CanvasNode, target: CanvasNode): WorkflowEdge => {
  const targetHandle = target.data.nodeType === "video" ? videoTargetHandleForNodeType(source.data.nodeType, target.data) : undefined;
  return { id: `edge-${source.id}-${target.id}`, source: source.id, target: target.id, ...(targetHandle ? { targetHandle } : {}) };
};
const withVideoTargetHandles = (nodes: CanvasNode[], edges: WorkflowEdge[]): WorkflowEdge[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (target?.data.nodeType !== "video") return [edge];
    const targetHandle = source ? videoTargetHandleForNodeType(source.data.nodeType, target.data) : undefined;
    return targetHandle ? [{ ...edge, targetHandle }] : [];
  });
};
const storyboardBranchFrom = (storyboard: CanvasNode, value: unknown): { nodes: CanvasNode[]; edges: WorkflowEdge[] } => {
  const scenes = Array.isArray(value) ? value.map(asRecord).slice(0, 12) : [];
  const firstY = storyboard.position.y - Math.max(0, scenes.length - 1) * 155;
  const nodes: CanvasNode[] = [];
  const edges: WorkflowEdge[] = [];

  scenes.forEach((scene, index) => {
    const sceneNumber = Number(scene.sceneNumber) || index + 1;
    const description = asText(scene.description) || `Scene ${sceneNumber}`;
    const visualPrompt = asText(scene.visualPrompt) || description;
    const camera = asText(scene.camera);
    const duration = Number(scene.duration) || 0;
    const script = [description, camera && `Camera: ${camera}`, duration && `Duration: ${duration}s`].filter(Boolean).join("\n");
    const textNode = makeNode("text", { x: storyboard.position.x + 470, y: firstY + index * 310 });
    const imageNode = makeNode("image", { x: storyboard.position.x + 800, y: firstY + index * 310 });

    textNode.data = {
      ...textNode.data,
      title: `Text* Script ${sceneNumber}`,
      textContent: script,
      instruction: "Polish or revise this scene script while preserving the established story continuity.",
      sourceStoryboardNodeId: storyboard.id,
      storyboardGenerated: true,
    };
    imageNode.data = {
      ...imageNode.data,
      title: `Image* Scene ${sceneNumber}`,
      prompt: visualPrompt,
      aspectRatio: storyboard.data.aspectRatio || "16:9",
      size: "1536x1024",
      model: DEFAULT_AGENT_IMAGE_MODEL,
      shotNumber: sceneNumber,
      sourceStoryboardNodeId: storyboard.id,
      storyboardGenerated: true,
    };
    nodes.push(textNode, imageNode);
    edges.push(
      { id: `edge-${storyboard.id}-${textNode.id}`, source: storyboard.id, target: textNode.id, style: { strokeDasharray: "7 7", strokeWidth: 1.5 } },
      { id: `edge-${textNode.id}-${imageNode.id}`, source: textNode.id, target: imageNode.id, targetHandle: "text", style: { strokeDasharray: "7 7", strokeWidth: 1.5 } },
    );
  });

  return { nodes, edges };
};
export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectName: "Untitled creative flow", nodes: initialNodes, edges: [], agentMemory: null, selectedNodeId: null, lastError: null, agentStatus: "idle", agentMessage: null, ghostType: null, ghostData: null, ghostMediaUrl: null, pendingAgentPatch: null,
  setGhostType: (ghostType, ghostData) => set({ ghostType, ghostData: ghostType ? ghostData ?? null : null }),
  placeGhostNode: (position) => { const { ghostType, ghostData } = get(); if (!ghostType) return; const base = makeNode(ghostType, position); const node = ghostData ? { ...base, data: { ...base.data, ...ghostData } } : base; set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id, ghostType: null, ghostData: null })); },
  setGhostMedia: (dataUrl) => set({ ghostMediaUrl: dataUrl }),
  updateAgentMemory: (patch) => set((state) => ({ agentMemory: mergeAgentProjectMemory(state.agentMemory, patch) })),
  clearAgentMemory: () => set({ agentMemory: null }),
  placeGhostMedia: (position) => { const { ghostMediaUrl } = get(); if (!ghostMediaUrl) return; const node: CanvasNode = { id: `reference-${crypto.randomUUID()}`, type: "creative", position, data: { nodeType: "reference", title: "Reference* 图片素材", status: "idle", imageUrl: ghostMediaUrl, notes: "" } }; set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id, ghostMediaUrl: null })); },
  setPendingAgentPatch: (pendingAgentPatch) => set({ pendingAgentPatch, ghostType: null, ghostData: null, ghostMediaUrl: null, agentMessage: pendingAgentPatch ? "请在画布上点击工作流起点。" : null }),
  placeAgentPatch: (position) => { const { pendingAgentPatch } = get(); if (!pendingAgentPatch) return; const placed = offsetPatchTo(pendingAgentPatch, position); set((state) => { const clean = dedupePatch(placed, state.nodes, state.edges); return { nodes: [...state.nodes, ...clean.nodes], edges: [...state.edges, ...clean.edges], selectedNodeId: clean.nodes[0]?.id || state.selectedNodeId, pendingAgentPatch: null, agentStatus: "completed", agentMessage: "工作流已放置到画布。请检查节点参数后手动运行。", lastError: null }; }); },
  addMediaNode: (dataUrl, position) => { const node: CanvasNode = { id: `reference-${crypto.randomUUID()}`, type: "creative", position, data: { nodeType: "reference", title: "Reference* 图片素材", status: "idle", imageUrl: dataUrl, notes: "" } }; set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id })); },
  normalizeVideoConnections: () => { const { nodes, edges } = get(); const next = withVideoTargetHandles(nodes, edges); if (next.length !== edges.length || next.some((edge, index) => edge.targetHandle !== edges[index]?.targetHandle)) set({ edges: next }); },
  materializeStoryboardBranch: (storyboardId) => { const storyboard = get().nodes.find((node) => node.id === storyboardId && node.data.nodeType === "storyboard"); const scenes = storyboard?.data.output?.value; if (!storyboard || !Array.isArray(scenes)) return; const signature = JSON.stringify(scenes); if (storyboard.data.storyboardBranchSignature === signature) return; const branch = storyboardBranchFrom(storyboard, scenes); set((state) => { const previousIds = new Set(state.nodes.filter((node) => node.data.sourceStoryboardNodeId === storyboardId && node.data.storyboardGenerated).map((node) => node.id)); return { nodes: [...state.nodes.filter((node) => !previousIds.has(node.id)).map((node) => node.id === storyboardId ? { ...node, data: { ...node.data, storyboardBranchSignature: signature } } : node), ...branch.nodes], edges: [...state.edges.filter((edge) => !previousIds.has(edge.source) && !previousIds.has(edge.target)), ...branch.edges] }; }); },
  addStoryChainNode: (content, title) => set((state) => {
    const chain = state.nodes.filter((node) => node.data.groupId === "story-chain");
    const previous = chain.at(-1);
    const node: CanvasNode = {
      id: `story-chain-${crypto.randomUUID()}`,
      type: "creative",
      position: previous ? { x: previous.position.x + 340, y: previous.position.y } : { x: 120, y: 120 },
      data: {
        nodeType: "text",
        title: title || `Story Step ${chain.length + 1}`,
        status: "idle",
        instruction: "Story chain brainstorming note",
        inputText: content,
        groupId: "story-chain",
        groupColor: undefined,
      },
    };
    return {
      nodes: [...state.nodes, node],
      edges: previous ? [...state.edges, { id: `edge-${previous.id}-${node.id}`, source: previous.id, target: node.id }] : state.edges,
      selectedNodeId: node.id,
    };
  }),
  setGroupColor: (nodeIds, color) => set((state) => { const groupId = `group-${crypto.randomUUID()}`; return { nodes: state.nodes.map((n) => nodeIds.includes(n.id) ? { ...n, data: { ...n.data, groupId, groupColor: color } } : n) }; }),
  updateGroupColor: (groupId, color) => set((state) => ({ nodes: state.nodes.map((n) => n.data.groupId === groupId ? { ...n, data: { ...n.data, groupColor: color } } : n) })),
  setGroupLocked: (nodeIds, locked) => set((state) => ({ nodes: state.nodes.map((n) => nodeIds.includes(n.id) ? { ...n, draggable: !locked, data: { ...n.data, locked } } : n) })),
  markSelectedWorkflow: (order, title) => set((state) => {
    const selectedIds = selectedNodeIdsFrom(state);
    if (!selectedIds.length) return { lastError: "Please select nodes before marking a workflow." };
    const workflowNodeIds = connectedNodeIdsFrom(selectedIds, state.nodes, state.edges);
    const cleanOrder = Math.max(1, Math.floor(Number.isFinite(order) ? order : 1));
    const workflowId = `workflow-${cleanOrder}`;
    const workflowTitle = title?.trim() || `Workflow ${cleanOrder}`;
    return {
      nodes: state.nodes.map((node) => workflowNodeIds.includes(node.id) ? { ...node, data: { ...node.data, workflowId, workflowOrder: cleanOrder, workflowTitle, workflowLabel: String(cleanOrder), groupColor: undefined } } : node),
      agentMessage: `已将 ${workflowNodeIds.length} 个节点标记为工作流 ${cleanOrder}。`,
      lastError: null,
    };
  }),
  clearSelectedWorkflowMark: () => set((state) => {
    const selectedIds = selectedNodeIdsFrom(state);
    if (!selectedIds.length) return { lastError: "Please select nodes before clearing workflow marks." };
    const workflowNodeIds = connectedNodeIdsFrom(selectedIds, state.nodes, state.edges);
    return {
      nodes: state.nodes.map((node) => workflowNodeIds.includes(node.id) ? { ...node, data: { ...node.data, workflowId: undefined, workflowOrder: undefined, workflowTitle: undefined, workflowLabel: undefined, groupColor: undefined } } : node),
      agentMessage: `已清除 ${workflowNodeIds.length} 个节点的工作流标记。`,
      lastError: null,
    };
  }),
  arrangeWorkflows: () => set((state) => ({
    nodes: arrangeWorkflowNodes(state.nodes, state.edges),
    agentMessage: "画布已按工作流编号整理。",
    lastError: null,
  })),
  setGroupLockedByGroupId: (groupId, locked) => set((state) => ({ nodes: state.nodes.map((n) => n.data.groupId === groupId ? { ...n, draggable: !locked, data: { ...n.data, locked } } : n) })),
  runGroup: async (groupId) => { const { nodes } = get(); const group = nodes.filter((n) => n.data.groupId === groupId); for (const n of group) await get().runNode(n.id); },
  setProjectName: (projectName) => set({ projectName }), setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  onNodesChange: (changes) => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) as CanvasNode[] })), onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection) => set((state) => ({ edges: addEdge({ ...connection, id: `edge-${crypto.randomUUID()}` }, state.edges) })),
  addNode: (type) => { const node = makeNode(type, { x: 160 + (get().nodes.length % 4) * 55, y: 120 + (get().nodes.length % 5) * 60 }); set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id })); },
  updateNodeData: (id, patch) => set((state) => {
    const nodes = state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node);
    return { nodes, edges: withVideoTargetHandles(nodes, state.edges) };
  }),
  removeNode: (id) => set((state) => ({ nodes: state.nodes.filter((node) => node.id !== id), edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id), selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId })),
  duplicateNode: (id) => { const original = get().nodes.find((node) => node.id === id); if (!original) return; const clone: CanvasNode = { ...original, id: `${original.data.nodeType}-${crypto.randomUUID()}`, position: { x: original.position.x + 36, y: original.position.y + 36 }, selected: true, data: { ...original.data, title: `${original.data.title} copy`, status: "idle", output: undefined, error: undefined } }; set((state) => ({ nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), clone], selectedNodeId: clone.id })); },
  createImageRevision: async (sourceId, annotations, instruction) => { const source = get().nodes.find((node) => node.id === sourceId); const sourceImageUrl = source ? imageUrlFrom(source) : ""; if (!source || !sourceImageUrl) { set({ lastError: "The source image is unavailable for revision." }); return; } const revisionPrompt = revisionPromptFrom(source.data.prompt, annotations, instruction); const revision: CanvasNode = { id: `image-${crypto.randomUUID()}`, type: "creative", position: { x: source.position.x + 340, y: source.position.y + 40 }, data: { ...source.data, title: `${source.data.title} — Revision`, status: "running", output: undefined, error: undefined, annotations, revisionOf: source.id, sourceImageUrl, revisionInstruction: instruction } }; set((state) => ({ nodes: [...state.nodes.map((node) => node.id === sourceId ? { ...node, data: { ...node.data, annotations, revisionInstruction: instruction } } : { ...node, selected: false }), revision], selectedNodeId: revision.id, lastError: null })); try { const payload = await requestImageRevision({ sourceImageUrl, prompt: revisionPrompt, size: source.data.size }); const providerOutput = asRecord(payload.output); const output = outputFromProvider("image", { ...providerOutput, imageUrl: asText(providerOutput.revisedImageUrl) }); set((state) => ({ nodes: state.nodes.map((node) => node.id === revision.id ? { ...node, data: { ...node.data, status: "success", output } } : node) })); } catch (error) { const message = error instanceof Error ? error.message : "Image revision failed."; set((state) => ({ lastError: message, nodes: state.nodes.map((node) => node.id === revision.id ? { ...node, data: { ...node.data, status: "error", error: message } } : node) })); } },
  createKeyframeBatch: (sourceId) => {
    const state = get();
    const source = state.nodes.find((node) => node.id === sourceId);
    const value = asRecord(source?.data.output?.value);
    const prompts = Array.isArray(value.prompts) ? value.prompts.map(asRecord) : [];
    if (!source || !prompts.length) {
      set({ lastError: "Run the Storyboard Image node before creating keyframes." });
      return;
    }
    const downstreamImages = state.edges
      .filter((edge) => edge.source === sourceId)
      .map((edge) => state.nodes.find((node) => node.id === edge.target))
      .filter((node): node is CanvasNode => Boolean(node && node.data.nodeType === "image"));
    const batchId = downstreamImages.find((node) => node.data.batchId)?.data.batchId || `batch-${crypto.randomUUID()}`;
    const missingImages: CanvasNode[] = prompts.slice(downstreamImages.length).map((item, offset) => {
      const index = downstreamImages.length + offset;
      return {
        id: `image-${crypto.randomUUID()}`,
        type: "creative",
        position: { x: source.position.x + 350 + (index % 3) * 320, y: source.position.y + Math.floor(index / 3) * 260 },
        data: { nodeType: "image", model: DEFAULT_AGENT_IMAGE_MODEL, ...keyframePatchFromPrompt(item, index, sourceId, batchId) },
      };
    });
    const reusableIds = downstreamImages.map((node) => node.id);
    const targetIds = [...reusableIds.slice(0, prompts.length), ...missingImages.map((node) => node.id)];
    set((current) => ({
      nodes: [
        ...current.nodes.map((node) => {
          const index = reusableIds.indexOf(node.id);
          if (index < 0 || index >= prompts.length) return node;
          return { ...node, data: { ...node.data, ...keyframePatchFromPrompt(prompts[index], index, sourceId, batchId), model: node.data.model } };
        }),
        ...missingImages,
      ],
      edges: [
        ...current.edges,
        ...missingImages.map((image) => ({ id: `edge-${sourceId}-${image.id}`, source: sourceId, target: image.id })),
      ],
      selectedNodeId: targetIds[0] || null,
      lastError: null,
    }));
    void (async () => {
      for (const id of targetIds) await get().runNode(id);
    })();
  },
  setCanvas: (nodes, edges, agentMemory) => set({ nodes: restoreStatuses(nodes), edges: withVideoTargetHandles(nodes, edges), agentMemory: agentMemory || null, selectedNodeId: null, lastError: null }),
  generateAgentPlan: async (userPrompt) => {
    const prompt = userPrompt.trim();
    if (!prompt) throw new Error("Agent brief is empty.");
    set({ agentStatus: "planning", agentMessage: "正在生成工作流计划...", lastError: null });
    try {
      const { nodes, edges, projectName } = get();
      const payload = await requestAgentPlan({ userPrompt: prompt, canvasSnapshot: { version: 1, projectName, nodes, edges }, mode: nodes.length ? "edit" : "create" });
      if (!payload.plan || !payload.patch) throw new Error("Agent 计划生成失败。");
      set({ agentStatus: "completed", agentMessage: payload.summary || "工作流计划已生成。" });
      return { plan: payload.plan, patch: payload.patch, summary: payload.summary || "工作流计划已生成。" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 计划生成失败。";
      set({ agentStatus: "error", agentMessage: message, lastError: message });
      throw error;
    }
  },
  applyAgentPatch: (patch) => set((state) => {
    const clean = dedupePatch(patch, state.nodes, state.edges);
    return {
      nodes: [...state.nodes, ...clean.nodes],
      edges: [...state.edges, ...clean.edges],
      selectedNodeId: clean.nodes[0]?.id || state.selectedNodeId,
      agentStatus: "completed",
      agentMessage: "工作流已添加到画布。请检查节点参数后手动运行。",
      lastError: null,
    };
  }),
  generateAgentEdit: async (userInstruction) => {
    const instruction = userInstruction.trim();
    if (!instruction) throw new Error("Agent edit instruction is empty.");
    set({ agentStatus: "planning", agentMessage: "正在生成画布修改计划...", lastError: null });
    try {
      const { nodes, edges, projectName, selectedNodeId } = get();
      const selectedNodeIds = [...new Set([...nodes.filter((node) => node.selected).map((node) => node.id), ...(selectedNodeId ? [selectedNodeId] : [])])];
      const payload = await requestAgentEdit({ userInstruction: instruction, canvasSnapshot: { version: 1, projectName, nodes, edges }, selectedNodeIds });
      if (!payload.editPlan || !payload.patch) throw new Error("Agent 修改计划生成失败。");
      set({ agentStatus: "completed", agentMessage: payload.summary || "画布修改计划已生成。" });
      return { editPlan: payload.editPlan, patch: payload.patch, summary: payload.summary || "画布修改计划已生成。" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 修改计划生成失败。";
      set({ agentStatus: "error", agentMessage: message, lastError: message });
      throw error;
    }
  },
  applyAgentEditPatch: (patch) => set((state) => applyEditPatchToState(state, patch)),
  generateAgentOrganize: async (userInstruction) => {
    const instruction = userInstruction.trim() || "自动识别当前画布内容和工作流，并整理画布。";
    set({ agentStatus: "planning", agentMessage: "正在识别画布工作流并生成整理计划...", lastError: null });
    try {
      const { nodes, edges, projectName, selectedNodeId } = get();
      const selectedNodeIds = [...new Set([...nodes.filter((node) => node.selected).map((node) => node.id), ...(selectedNodeId ? [selectedNodeId] : [])])];
      const payload = await requestAgentOrganize({ userInstruction: instruction, canvasSnapshot: { version: 1, projectName, nodes, edges }, selectedNodeIds });
      if (!payload.organizePlan || !payload.patch) throw new Error("Agent 整理计划生成失败。");
      set({ agentStatus: "completed", agentMessage: payload.summary || "画布整理计划已生成。" });
      return { organizePlan: payload.organizePlan, patch: payload.patch, summary: payload.summary || "画布整理计划已生成。" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 整理计划生成失败。";
      set({ agentStatus: "error", agentMessage: message, lastError: message });
      throw error;
    }
  },
  runNode: async (id) => { const state = get(), node = state.nodes.find((item) => item.id === id); if (!node) return; set((current) => ({ nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: "running", error: undefined } } : item), lastError: null })); try { const incomingEdges = get().edges.filter((edge) => edge.target === id); const upstream = incomingEdges.map((edge) => get().nodes.find((item) => item.id === edge.source)).filter((item): item is CanvasNode => Boolean(item && (item.data.output || item.data.imageUrl))); const inputs = upstream.map((source) => source.data.output?.value).filter((value): value is NonNullable<typeof value> => value !== undefined); let result: NodeOutput; let intervalMs = 3000; const generationContext = promptFrom(node, upstream); if (canRunRemotely(node.data.nodeType)) { const payload = await runNodeRemote({ nodeType: node.data.nodeType, input: inputFor(node, upstream, incomingEdges) }); intervalMs = Number(payload.polling?.intervalMs) || intervalMs; result = outputFromProvider(node.data.nodeType, payload.output); } else if (node.data.nodeType === "storyboardImage") { const storyboard = upstream.find((item) => item.data.nodeType === "storyboard"); const prompts = promptsFromStoryboard(storyboard?.data.output?.value, node.data.aspectRatio, node.data.negativePrompt); if (!prompts.length) throw new Error("Connect and run a Storyboard node before generating image prompts."); result = makeOutput("storyboardImage", `${prompts.length} image prompts prepared`, { prompts }); } else if (node.data.nodeType === "prompt") { if (!node.data.prompt) throw new Error("Add a prompt or input before running this node."); result = makeOutput("prompt", "Structured prompt prepared", { prompt: node.data.prompt, negativePrompt: node.data.negativePrompt, style: node.data.style, aspectRatio: node.data.aspectRatio }); } else if (node.data.nodeType === "reference") result = makeOutput("reference", "Reference material available", { imageUrl: node.data.imageUrl, notes: node.data.notes }); else result = makeOutput("output", `${inputs.length} upstream result${inputs.length === 1 ? "" : "s"} collected as ${node.data.format || "Creative package"}`, outputFor(node.data.format, upstream)); const taskState = asText(asRecord(result.value).status); const polling = taskState === "pending" || taskState === "running"; set((current) => ({ nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: taskState === "failed" ? "error" : taskState === "running" ? "running" : polling ? "waiting" : "success", output: result, generationContext, rawStatus: asText(asRecord(result.value).rawStatus) || taskState || item.data.rawStatus, storyboardImagePrompts: node.data.nodeType === "storyboardImage" ? (asRecord(result.value).prompts as CanvasNodeData["storyboardImagePrompts"]) : item.data.storyboardImagePrompts } } : item) })); if (polling) schedulePoll(id, () => void get().pollNode(id), intervalMs); } catch (error) { const message = error instanceof Error ? error.message : "Node execution failed"; set((current) => ({ lastError: message, nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: "error", error: message } } : item) })); } },
  pollNode: async (id) => { const node = get().nodes.find((item) => item.id === id); const value = asRecord(node?.data.output?.value); const taskId = asText(value.taskId); if (!node || !taskId || !["image", "video", "audio"].includes(node.data.nodeType)) return; set((current) => ({ nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: "running", error: undefined } } : item) })); try { const payload = await pollTaskRemote({ type: node.data.nodeType, taskId, provider: node.data.nodeType === "video" ? node.data.videoProvider : undefined, pollUrl: asText(value.pollUrl) || undefined, pollAction: node.data.nodeType === "video" ? (asText(value.pollAction) || undefined) : undefined }); const rawOutput = asRecord(payload.output); const result = outputFromProvider(node.data.nodeType, node.data.nodeType === "video" ? { ...rawOutput, videoUrl: asText(rawOutput.resultUrl) || asText(rawOutput.videoUrl) } : payload.output); const state = asText(rawOutput.status); const intervalMs = Number(payload.polling?.intervalMs) || 3000; if (state === "pending" || state === "running") schedulePoll(id, () => void get().pollNode(id), intervalMs); set((current) => ({ nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: state === "failed" ? "error" : state === "completed" ? "success" : state === "running" ? "running" : "waiting", output: result, taskId, resultUrl: asText(rawOutput.resultUrl) || asText(rawOutput.videoUrl), rawStatus: asText(rawOutput.rawStatus) || state, lastPollAt: new Date().toISOString() } } : item) })); } catch (error) { const message = error instanceof Error ? error.message : "Task polling failed"; set((current) => ({ lastError: message, nodes: current.nodes.map((item) => item.id === id ? { ...item, data: { ...item.data, status: "error", error: message } } : item) })); } },
  runWorkflow: async () => { try { set({ lastError: null }); const ordered = topologicalSort(get().nodes, get().edges); for (const node of ordered) await get().runNode(node.id); } catch (error) { if (error instanceof Error) set({ lastError: error.message }); } },
  runAgentWorkflow: async (brief) => {
    const idea = brief.trim();
    if (!idea) {
      set({ agentStatus: "error", agentMessage: "请输入一句创意后再启动 Agent。", lastError: "Agent brief is empty." });
      return;
    }
    set({ agentStatus: "planning", agentMessage: "正在按模板搭建流程图...", lastError: null });
    const groupId = `agent-${crypto.randomUUID()}`;
    const groupColor = undefined;
    const makeTemplateNode = (type: NodeType, position: { x: number; y: number }, patch: Partial<CanvasNodeData>): CanvasNode => {
      const node = makeNode(type, position);
      return { ...node, data: { ...node.data, ...patch, status: "idle", output: undefined, error: undefined, groupId, groupColor } };
    };
    const negativePrompt = "拼贴图, 分屏, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, collage, split screen, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, arrows, labels, UI, watermark, text overlay";
    const continuity = "只生成一个单独的电影拍摄画面，不要拼贴图或分镜板，电影剧照质感，无文字，保持人物、服装、场景、光线、道具和故事连续性";
    const mainImage = makeTemplateNode("image", { x: 613.2296482571714, y: -554.2449289599219 }, {
      title: "Image* gpt-image-2 (TokenStar)",
      prompt: `以这个背景，生成${idea}的图片`,
      model: DEFAULT_AGENT_IMAGE_MODEL,
      size: "1024x1024",
      referenceImageUrl: "",
    });
    const storyboard = makeTemplateNode("storyboard", { x: -163, y: -12 }, {
      title: "Storyboard* New Storyboard",
      storyBrief: idea,
      numberOfScenes: 3,
      model: "",
    });
    const storyboardImage = makeTemplateNode("storyboardImage", { x: 230, y: -18 }, {
      title: "Image* Storyboard Scenes",
      aspectRatio: "16:9",
      negativePrompt,
    });
    const shot1 = makeTemplateNode("image", { x: 617.990547772805, y: -171.3366443837011 }, {
      title: "Image* Shot 01 - Keyframe",
      prompt: `${idea}的第一个关键帧。校园或主要场景开场，主角走入画面并与周围人物互动，现代建筑背景，阳光明媚，无文字和无 UI。中景，展示人物与环境的互动。对称构图，主角位于画面中央，周围人物在两侧。50mm定焦镜头，自然光，轻微跟随镜头，轻松愉快，保持人物、服装和场景连续。${continuity}`,
      negativePrompt,
      aspectRatio: "16:9",
      size: "1536x1024",
      model: DEFAULT_AGENT_IMAGE_MODEL,
      shotNumber: 1,
      sourceStoryboardNodeId: storyboardImage.id,
    });
    const shot2 = makeTemplateNode("image", { x: 603.5370785454384, y: 115.19856370493375 }, {
      title: "Image* Shot 02 - Keyframe",
      prompt: `${idea}的第二个关键帧。主角与周围人物在开放空间互动或合影，开心的表情，标志性背景，无文字和无 UI。特写或中近景，捕捉人物表情和互动。圆形构图，主角位于中心，人物围绕在周围。35mm广角镜头，自然光，欢乐、亲切、充满互动，保持人物、服装和场景连续。${continuity}`,
      negativePrompt,
      aspectRatio: "16:9",
      size: "1536x1024",
      model: DEFAULT_AGENT_IMAGE_MODEL,
      shotNumber: 2,
      sourceStoryboardNodeId: storyboardImage.id,
    });
    const shot3 = makeTemplateNode("image", { x: 616.4406456459226, y: 461.6027416762248 }, {
      title: "Image* Shot 03 - Keyframe",
      prompt: `${idea}的第三个关键帧。主角在室内或安静空间与人物交流，生动手势，温馨环境，无文字和无 UI。中景，对角线构图，主角在一侧，其他人物在对面形成对话氛围。50mm定焦镜头，轻微推镜，柔和室内灯光，温暖色调，动作节奏缓慢，保持人物、服装和场景连续。${continuity}`,
      negativePrompt,
      aspectRatio: "16:9",
      size: "1536x1024",
      model: DEFAULT_AGENT_IMAGE_MODEL,
      shotNumber: 3,
      sourceStoryboardNodeId: storyboardImage.id,
    });
    const videoA = makeTemplateNode("video", { x: 1178.259822152543, y: 1.4588804763947536 }, {
      title: "Video* New Video",
      prompt: "",
      aspectRatio: "16:9",
      referenceImageUrl: "",
      fps: "",
      ...videoModelPatch("seedance-2.0-assets"),
      duration: 10,
      resolution: "480p",
      referenceImageAssetUrl: "",
      referenceVideoAssetUrl: "",
      referenceAudioAssetUrl: "",
      klingElementId: "",
    });
    const videoB = makeTemplateNode("video", { x: 1181, y: -258 }, {
      title: "Video* New Video",
      prompt: "",
      aspectRatio: "16:9",
      referenceImageUrl: "",
      fps: "",
      ...videoModelPatch("seedance-2.0-assets"),
      duration: 10,
      resolution: "480p",
      referenceImageAssetUrl: "",
      referenceVideoAssetUrl: "",
      referenceAudioAssetUrl: "",
      klingElementId: "",
    });
    const nodes = [mainImage, storyboard, storyboardImage, shot1, shot2, shot3, videoA, videoB];
    const edges = [
      edgeFor(storyboard, storyboardImage),
      edgeFor(storyboardImage, shot1),
      edgeFor(storyboardImage, shot2),
      edgeFor(storyboardImage, shot3),
      edgeFor(shot1, videoA),
      edgeFor(shot2, videoA),
      edgeFor(mainImage, videoB),
      edgeFor(shot1, videoB),
    ];
    const clean = dedupePatch({ nodes, edges }, get().nodes, get().edges);
    set((state) => ({
      projectName: state.nodes.length ? state.projectName : `Agent: ${idea.slice(0, 32)}`,
      nodes: [...state.nodes, ...clean.nodes],
      edges: [...state.edges, ...clean.edges],
      selectedNodeId: clean.nodes[0]?.id || storyboard.id,
      lastError: null,
      agentStatus: "completed",
      agentMessage: "已按导入模板搭建流程图。请检查节点参数后手动运行。",
    }));
  },
  runAgentSkill: async (skillId, brief) => {
    if (skillId !== "fixed-scene-action-video") {
      set({ agentStatus: "error", agentMessage: `Unknown workflow skill: ${skillId}`, lastError: `Unknown workflow skill: ${skillId}` });
      return;
    }
    const skill = buildFixedSceneVideoSkill(brief);
    set({ agentStatus: "building", agentMessage: `Building ${skill.title} skill...`, lastError: null });
    const groupId = `skill-${skillId}-${crypto.randomUUID()}`;
    const groupColor = "#22c55e";
    const makeTemplateNode = (type: NodeType, position: { x: number; y: number }, patch: Partial<CanvasNodeData>): CanvasNode => {
      const node = makeNode(type, position);
      return { ...node, data: { ...node.data, ...patch, status: "idle", output: undefined, error: undefined, groupId, groupColor } };
    };
    const referenceNodes = skill.references.map((reference, index) => makeTemplateNode("image", { x: 60, y: 20 + index * 320 }, {
      title: reference.title,
      prompt: reference.prompt,
      negativePrompt: reference.negativePrompt || skill.negativePrompt,
      model: DEFAULT_AGENT_IMAGE_MODEL,
      size: "2048x2048",
      aspectRatio: "1:1",
      imagePromptPreset: reference.preset,
      referenceImageUrl: "",
    }));
    const directorPrompt = makeTemplateNode("text", { x: 440, y: 270 }, {
      title: `Prompt* ${skill.title} Director Prompt`,
      instruction: "Read this as the final VideoNode prompt. Keep material @ references exactly.",
      inputText: skill.videoPrompt,
      model: "",
      temperature: 0.2,
    });
    const video = makeTemplateNode("video", { x: 860, y: 300 }, {
      title: skill.title,
      prompt: skill.videoPrompt,
      aspectRatio: skill.aspectRatio,
      referenceImageUrl: "",
      fps: "",
      ...videoModelPatch("kling-v3-omni-tokenstar"),
      duration: skill.duration,
      resolution: "1080p",
      generateAudio: false,
      videoReferenceNodeIds: referenceNodes.map((node) => node.id),
      referenceImageAssetUrl: "",
      referenceVideoAssetUrl: "",
      referenceAudioAssetUrl: "",
      klingElementId: "",
      referenceVideoUrl: "",
    });
    const output = makeTemplateNode("output", { x: 1260, y: 350 }, {
      title: `Output* ${skill.title} Output`,
      format: "Creative package",
    });
    const nodes = [...referenceNodes, directorPrompt, video, output];
    const edges = [
      ...referenceNodes.map((node) => edgeFor(node, video)),
      edgeFor(directorPrompt, video),
      edgeFor(video, output),
    ];
    set({
      pendingAgentPatch: { nodes, edges },
      ghostType: null,
      ghostData: null,
      ghostMediaUrl: null,
      lastError: null,
      agentStatus: "completed",
      agentMessage: `${skill.title} skill is ready. Click the canvas to choose where to place it.`,
    });
  },
  saveCanvas: () => { const { projectName, nodes, edges, agentMemory } = get(); canvasStorage.save({ version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined }); },
  loadCanvas: () => { try { const snapshot = canvasStorage.load(); if (!snapshot || !isSnapshot(snapshot)) throw new Error("No valid saved canvas found."); set({ projectName: snapshot.projectName || "Untitled creative flow", nodes: restoreStatuses(snapshot.nodes), edges: withVideoTargetHandles(snapshot.nodes, snapshot.edges), agentMemory: snapshot.agentMemory || null, selectedNodeId: null, lastError: null }); } catch (error) { set({ lastError: error instanceof Error ? error.message : "Could not load canvas" }); } },
  clearCanvas: () => set({ nodes: [], edges: [], agentMemory: null, selectedNodeId: null, lastError: null }),
  exportCanvasJson: () => { const { projectName, nodes, edges, agentMemory } = get(); return JSON.stringify({ version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined }, null, 2); },
  importCanvasJson: (raw) => { try { const value = JSON.parse(raw) as unknown; if (!isSnapshot(value)) throw new Error("Invalid canvas JSON. Expected nodes and edges arrays."); set({ projectName: value.projectName || "Imported creative flow", nodes: restoreStatuses(value.nodes), edges: withVideoTargetHandles(value.nodes, value.edges), agentMemory: value.agentMemory || null, selectedNodeId: null, lastError: null }); } catch (error) { set({ lastError: error instanceof Error ? error.message : "Could not import JSON" }); } },
  applyTemplate: (template) => { const flow = buildTemplate(template); set({ nodes: flow.nodes, edges: withVideoTargetHandles(flow.nodes, flow.edges), projectName: template.name, selectedNodeId: null, lastError: null }); },
}));
