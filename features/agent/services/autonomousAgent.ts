"use client";

import { requestAgentObserve } from "./agentClient";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import type { AgentRunEvent, AgentRunPhase } from "@/shared/agent/agentAutonomy";
import type { AgentRouterResponse, CanvasSnapshotPayload } from "@/shared/api/aiContracts";
import type { CanvasEditPatch, CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

export type AutonomousAgentResult = {
  status: "completed" | "blocked" | "cancelled";
  summary: string;
  events: AgentRunEvent[];
  executedNodeIds: string[];
  repairAttempts: number;
};

type AutonomousAgentInput = {
  userMessage: string;
  response: AgentRouterResponse;
  selectedNodeIds: string[];
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  onEvent?: (event: AgentRunEvent) => void;
};

const terminalStatuses = new Set(["success", "error"]);

const makeEvent = (phase: AgentRunPhase, message: string, nodeId?: string, attempt?: number): AgentRunEvent => ({
  id: crypto.randomUUID(),
  phase,
  message,
  createdAt: new Date().toISOString(),
  nodeId,
  attempt,
});

const snapshot = (): CanvasSnapshotPayload => {
  const state = useCanvasStore.getState();
  return {
    version: 1,
    projectName: state.projectName,
    nodes: state.nodes,
    edges: state.edges,
    agentMemory: state.agentMemory || undefined,
  };
};

const descendantsOf = (seedIds: Iterable<string>, edges: WorkflowEdge[]) => {
  const result = new Set(seedIds);
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach((edge) => {
      if (result.has(edge.source) && !result.has(edge.target)) {
        result.add(edge.target);
        changed = true;
      }
    });
  }
  return result;
};

const orderedTargetNodes = (nodes: CanvasNode[], edges: WorkflowEdge[], targetIds: Set<string>) => {
  const targets = nodes.filter((node) => targetIds.has(node.id));
  const targetById = new Map(targets.map((node) => [node.id, node]));
  const degree = new Map(targets.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (targetIds.has(edge.source) && targetIds.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const queue = targets.filter((node) => degree.get(node.id) === 0);
  const ordered: CanvasNode[] = [];
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    ordered.push(node);
    edges.forEach((edge) => {
      if (edge.source !== node.id || !targetIds.has(edge.target)) return;
      const next = (degree.get(edge.target) || 1) - 1;
      degree.set(edge.target, next);
      if (next === 0) {
        const target = targetById.get(edge.target);
        if (target) queue.push(target);
      }
    });
  }
  if (ordered.length !== targets.length) throw new Error("本次 Agent 影响到的工作流包含循环连接，无法自主运行。");
  return ordered;
};

const waitForTerminalNode = (nodeId: string, signal?: AbortSignal, timeoutMs = 15 * 60 * 1000) => new Promise<CanvasNode>((resolve, reject) => {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: () => void = () => undefined;
  const finish = (handler: () => void) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
    handler();
  };
  const inspect = (nodes: CanvasNode[]) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return finish(() => reject(new Error(`节点 ${nodeId} 在执行期间消失。`)));
    if (terminalStatuses.has(node.data.status)) finish(() => resolve(node));
  };
  const onAbort = () => finish(() => reject(new DOMException("自主执行已取消。", "AbortError")));
  if (signal?.aborted) return onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });
  unsubscribe = useCanvasStore.subscribe((state) => inspect(state.nodes));
  timer = setTimeout(() => finish(() => reject(new Error(`等待节点 ${nodeId} 超时。`))), timeoutMs);
  inspect(useCanvasStore.getState().nodes);
});

const patchSeeds = (patch: CanvasEditPatch | undefined, beforeIds: Set<string>) => {
  const state = useCanvasStore.getState();
  return new Set([
    ...state.nodes.filter((node) => !beforeIds.has(node.id)).map((node) => node.id),
    ...(patch?.updateNodes.map((node) => node.id) || []),
  ]);
};

const defaultPlacement = (nodes: CanvasNode[]) => ({
  x: nodes.length ? Math.max(...nodes.map((node) => node.position.x)) + 420 : 80,
  y: nodes.length ? Math.min(...nodes.map((node) => node.position.y)) : 80,
});

const applyInitialResponse = async (response: AgentRouterResponse, selectedNodeIds: string[]) => {
  const store = useCanvasStore.getState();
  const beforeIds = new Set(store.nodes.map((node) => node.id));
  let editPatch: CanvasEditPatch | undefined;
  if (response.intent === "create" && response.patch) {
    store.applyAgentPatch(response.patch as CanvasPatch);
  } else if ((response.intent === "edit" || response.intent === "organize") && response.patch) {
    editPatch = response.patch as CanvasEditPatch;
    store.applyAgentEditPatch({ ...editPatch, selectedNodeIds: editPatch.selectedNodeIds?.length ? editPatch.selectedNodeIds : selectedNodeIds });
  } else if (response.intent === "skill" && response.skillId) {
    await store.runAgentSkill(response.skillId, response.skillBrief || "");
    const pending = useCanvasStore.getState().pendingAgentPatch;
    if (!pending) throw new Error("所选 Skill 没有生成可执行的画布工作流。");
    useCanvasStore.getState().placeAgentPatch(defaultPlacement(useCanvasStore.getState().nodes));
  }
  return patchSeeds(editPatch, beforeIds);
};

const applyRepairPatch = (patch: CanvasEditPatch | undefined, fallbackIds: string[]) => {
  if (!patch) return new Set(fallbackIds);
  const beforeIds = new Set(useCanvasStore.getState().nodes.map((node) => node.id));
  useCanvasStore.getState().applyAgentEditPatch({ ...patch, selectedNodeIds: [] });
  return patchSeeds(patch, beforeIds);
};

const failedNodeIds = (ids: Iterable<string>) => {
  const target = new Set(ids);
  return useCanvasStore.getState().nodes.filter((node) => target.has(node.id) && node.data.status === "error").map((node) => node.id);
};

export async function runAutonomousAgent(input: AutonomousAgentInput): Promise<AutonomousAgentResult> {
  const events: AgentRunEvent[] = [];
  const executed = new Set<string>();
  const completedThisRun = new Set<string>();
  const maxRepairAttempts = Math.max(0, Math.min(3, input.maxRepairAttempts ?? 2));
  const emit = (phase: AgentRunPhase, message: string, nodeId?: string, attempt?: number) => {
    const event = makeEvent(phase, message, nodeId, attempt);
    events.push(event);
    input.onEvent?.(event);
  };
  const cancelled = () => {
    if (!input.signal?.aborted) return false;
    emit("cancelled", "自主执行已取消。");
    return true;
  };

  try {
    emit("applying", "正在把 Agent 计划应用到画布。");
    let seeds = await applyInitialResponse(input.response, input.selectedNodeIds);
    if (input.response.intent === "organize") {
      emit("completed", "画布整理已应用，不需要运行媒体节点。");
      return { status: "completed", summary: "画布整理已完成。", events, executedNodeIds: [], repairAttempts: 0 };
    }
    if (!seeds.size) throw new Error("Agent 计划没有创建或更新可执行节点。");

    for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
      if (cancelled()) return { status: "cancelled", summary: "自主执行已取消。", events, executedNodeIds: [...executed], repairAttempts: attempt };
      const executedThisAttempt = new Set<string>();
      const stateBeforeRun = useCanvasStore.getState();
      const runTargets = descendantsOf(seeds, stateBeforeRun.edges);
      let progressed = true;
      while (progressed) {
        progressed = false;
        const state = useCanvasStore.getState();
        const ordered = orderedTargetNodes(state.nodes, state.edges, runTargets);
        for (const current of ordered) {
          if (completedThisRun.has(current.id)) continue;
          if (cancelled()) return { status: "cancelled", summary: "自主执行已取消。", events, executedNodeIds: [...executed], repairAttempts: attempt };
          const latestState = useCanvasStore.getState();
          const latest = latestState.nodes.find((node) => node.id === current.id);
          if (!latest) continue;
          const incoming = latestState.edges.filter((edge) => edge.target === latest.id);
          const failedDependency = incoming
            .map((edge) => latestState.nodes.find((node) => node.id === edge.source))
            .find((node) => node?.data.status === "error");
          if (failedDependency) {
            completedThisRun.add(latest.id);
            executed.add(latest.id);
            executedThisAttempt.add(latest.id);
            emit("executing", `跳过 ${latest.data.title}，因为上游 ${failedDependency.data.title} 执行失败。`, latest.id, attempt);
            progressed = true;
            continue;
          }
          emit("executing", `正在运行 ${latest.data.title}。`, latest.id, attempt);
          await useCanvasStore.getState().runNode(latest.id);
          const afterStart = useCanvasStore.getState().nodes.find((node) => node.id === latest.id);
          const finished = afterStart && terminalStatuses.has(afterStart.data.status)
            ? afterStart
            : await waitForTerminalNode(latest.id, input.signal);
          completedThisRun.add(latest.id);
          executed.add(latest.id);
          executedThisAttempt.add(latest.id);
          emit("executing", finished.data.status === "success" ? `${finished.data.title} 已完成。` : `${finished.data.title} 失败：${finished.data.error || "未知错误"}`, latest.id, attempt);
          if (finished.data.nodeType === "storyboard" && finished.data.status === "success") {
            const beforeMaterialize = new Set(useCanvasStore.getState().nodes.map((node) => node.id));
            useCanvasStore.getState().materializeStoryboardBranch(finished.id);
            const afterMaterialize = useCanvasStore.getState();
            const dynamicIds = afterMaterialize.nodes.filter((node) => !beforeMaterialize.has(node.id)).map((node) => node.id);
            descendantsOf(dynamicIds, afterMaterialize.edges).forEach((id) => runTargets.add(id));
          }
          progressed = true;
        }
      }

      emit("observing", "正在检查节点状态、输出、比例、时长和 Codex 执行结果。", undefined, attempt);
      const observation = await requestAgentObserve({
        userMessage: input.userMessage,
        canvasSnapshot: snapshot(),
        executedNodeIds: [...executedThisAttempt],
        attempt,
        maxRepairAttempts,
      });
      if (observation.status === "completed") {
        emit("completed", observation.summary, undefined, attempt);
        return { status: "completed", summary: observation.summary, events, executedNodeIds: [...executed], repairAttempts: attempt };
      }
      if (observation.status === "blocked" || attempt >= maxRepairAttempts) {
        emit("blocked", observation.summary, undefined, attempt);
        return { status: "blocked", summary: observation.summary, events, executedNodeIds: [...executed], repairAttempts: attempt };
      }

      emit("repairing", observation.summary, undefined, attempt + 1);
      const retryIds = failedNodeIds(executedThisAttempt);
      seeds = applyRepairPatch(observation.repairPatch, retryIds);
      descendantsOf(seeds, useCanvasStore.getState().edges).forEach((id) => completedThisRun.delete(id));
      if (!seeds.size) {
        const summary = "Agent 请求修复，但没有生成可执行修改或可重试节点。";
        emit("blocked", summary, undefined, attempt + 1);
        return { status: "blocked", summary, events, executedNodeIds: [...executed], repairAttempts: attempt + 1 };
      }
    }
  } catch (error) {
    if (input.signal?.aborted || error instanceof DOMException && error.name === "AbortError") {
      emit("cancelled", "自主执行已取消。");
      return { status: "cancelled", summary: "自主执行已取消。", events, executedNodeIds: [...executed], repairAttempts: 0 };
    }
    const message = error instanceof Error ? error.message : "Agent 自主执行失败。";
    emit("blocked", message);
    return { status: "blocked", summary: message, events, executedNodeIds: [...executed], repairAttempts: 0 };
  }

  const summary = "Agent 自主执行结束，但没有得到最终验证结果。";
  emit("blocked", summary);
  return { status: "blocked", summary, events, executedNodeIds: [...executed], repairAttempts: maxRepairAttempts };
}
