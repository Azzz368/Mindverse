import { NextResponse } from "next/server";
import { compileCanvasEditPlanToPatch } from "@/server/agent/compileCanvasEditPlan";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentDialogueLLM, runAgentEditLLM, runAgentOrganizeLLM, runAgentPlannerLLM, runFixedSceneSkillLLM } from "@/server/ai/302aiLLMProvider";
import { agentMemorySummary, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { AgentDialogueMessage } from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

type RouterSnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  agentMemory?: AgentProjectMemory;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const validIntents: AgentRouterIntent[] = ["dialogue", "create", "edit", "organize", "skill"];

const messagesFrom = (value: unknown): AgentDialogueMessage[] => Array.isArray(value)
  ? value.map((item) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const role = raw.role === "assistant" ? "assistant" : "user";
    const content = text(raw.content);
    return content ? { role, content } : undefined;
  }).filter((item): item is AgentDialogueMessage => Boolean(item))
  : [];

const snapshotFrom = (value: unknown): RouterSnapshot => {
  if (!value || typeof value !== "object") return { projectName: "Untitled creative flow", nodes: [], edges: [] };
  const raw = value as { projectName?: unknown; nodes?: unknown; edges?: unknown; agentMemory?: unknown };
  return {
    projectName: text(raw.projectName) || "Untitled creative flow",
    nodes: Array.isArray(raw.nodes) ? raw.nodes as CanvasNode[] : [],
    edges: Array.isArray(raw.edges) ? raw.edges as WorkflowEdge[] : [],
    agentMemory: raw.agentMemory && typeof raw.agentMemory === "object" ? raw.agentMemory as AgentProjectMemory : undefined,
  };
};

const includesAnyPattern = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));
const includesAnyText = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword.toLowerCase()));

const cn = {
  person: "\u4eba\u7269",
  character: "\u89d2\u8272",
  fourViewA: "\u56db\u8c61",
  fourViewB: "\u56db\u50cf",
  fourSide: "\u56db\u9762",
  designSheet: "\u8bbe\u5b9a\u56fe",
  scene: "\u573a\u666f",
  nineGridA: "\u4e5d\u5bab",
  nineGridB: "\u4e5d\u5bab\u683c",
  nineGridC: "\u4e5d\u5bab\u56fe",
  fixedScene: "\u56fa\u5b9a\u573a\u666f",
  workflow: "\u5de5\u4f5c\u6d41",
  video: "\u89c6\u9891",
  generate: "\u751f\u6210",
  create: "\u521b\u5efa",
  build: "\u642d\u5efa",
  continue: "\u7ee7\u7eed",
  storyboard: "\u5206\u955c",
  organize: "\u6574\u7406",
  arrange: "\u6392\u5217",
  group: "\u5206\u7ec4",
  edit: "\u4fee\u6539",
  changeTo: "\u6539\u6210",
  replace: "\u66ff\u6362",
  connect: "\u8fde\u63a5",
  delete: "\u5220\u9664",
  add: "\u65b0\u589e",
  cut: "\u526a\u8f91",
  trim: "\u526a\u6210",
  merge: "\u5408\u5e76",
  subtitle: "\u5b57\u5e55",
  idea: "\u60f3\u6cd5",
  direction: "\u65b9\u5411",
  option: "\u65b9\u6848",
  suggest: "\u5efa\u8bae",
  current: "\u5f53\u524d",
  selected: "\u9009\u4e2d",
};

const isFixedSceneSkillRequest = (value: string, memory?: AgentProjectMemory) => {
  const input = value.toLowerCase();
  const mentionsCharacterSheet =
    (includesAnyText(input, [cn.person, cn.character]) && includesAnyText(input, [cn.fourViewA, cn.fourViewB, cn.fourSide, cn.designSheet])) ||
    includesAnyPattern(input, [/character\s*(?:turnaround|sheet)/i]);
  const mentionsSceneGrid =
    (includesAnyText(input, [cn.scene]) && includesAnyText(input, [cn.nineGridA, cn.nineGridB, cn.nineGridC])) ||
    includesAnyPattern(input, [/scene\s*(?:nine|9)[-\s]?grid/i]);
  const explicitFixedScene =
    includesAnyText(input, [cn.fixedScene]) ||
    includesAnyPattern(input, [/fixed[-\s]?scene/i]);
  const asksToReusePreferredSkill =
    memory?.preferredWorkflowSkill === "fixed-scene-action-video" &&
    includesAnyText(input, [cn.generate, cn.create, cn.build, cn.workflow, cn.video, cn.continue]) &&
    !includesAnyText(input, [cn.storyboard]);

  return explicitFixedScene || mentionsCharacterSheet || mentionsSceneGrid || asksToReusePreferredSkill;
};

const inferIntent = (message: string, snapshot: RouterSnapshot, selectedCount: number): AgentRouterIntent => {
  const input = message.toLowerCase();
  if (isFixedSceneSkillRequest(input, snapshot.agentMemory)) return "skill";
  if (includesAnyText(input, [cn.organize, cn.arrange, cn.group]) || includesAnyPattern(input, [/organize|arrange|layout|group/])) return "organize";
  if (
    includesAnyText(input, [cn.edit, cn.changeTo, cn.replace, cn.connect, cn.delete, cn.add, cn.cut, cn.trim, cn.merge, cn.subtitle]) ||
    includesAnyPattern(input, [/edit|change|update|connect|delete|trim|cut|concat|merge|subtitle/])
  ) {
    return snapshot.nodes.length ? "edit" : "create";
  }
  if (
    includesAnyText(input, [cn.workflow, cn.generate, cn.create, cn.build]) ||
    includesAnyPattern(input, [/workflow|node|create|generate|build/])
  ) return "create";
  if (selectedCount && snapshot.nodes.length) return "edit";
  if (snapshot.nodes.length && (includesAnyText(input, [cn.current, cn.selected]) || includesAnyPattern(input, [/these|this|selected|current/]))) return "edit";
  if (includesAnyText(input, [cn.idea, cn.direction, cn.option, cn.suggest]) || includesAnyPattern(input, [/idea|brainstorm|option|suggest/])) return "dialogue";
  return snapshot.nodes.length ? "edit" : "create";
};

const memoryContext = (memory: AgentProjectMemory | undefined) => {
  const summary = agentMemorySummary(memory);
  return summary ? `\n\nAgent project memory:\n${summary}` : "";
};

const plannerSummary = (snapshot: RouterSnapshot) =>
  `Current canvas has ${snapshot.nodes.length} nodes and ${snapshot.edges.length} edges.${memoryContext(snapshot.agentMemory)}`;

const canvasSummaryWithMemory = (snapshot: RouterSnapshot, selectedNodeIds: string[]) =>
  `${summarizeCanvasForAgent({ nodes: snapshot.nodes, edges: snapshot.edges, selectedNodeIds })}${memoryContext(snapshot.agentMemory)}`;

const skillBriefFrom = (userMessage: string, memory: AgentProjectMemory | undefined) => {
  const rememberedBrief = memory?.storyBrief?.trim();
  if (!rememberedBrief) return userMessage;
  if (userMessage.length <= 24 || isFixedSceneSkillRequest(userMessage, memory)) {
    return [
      `story_goal: ${rememberedBrief}`,
      `video_action_plan: ${rememberedBrief}`,
      `workflow_request: ${userMessage}`,
      "continuity_rules: Use the fixed-scene video workflow with character turnaround references, an empty scene nine-grid reference, and one final video node. Keep every shot inside the same location and make the action continue naturally.",
    ].join("\n");
  }
  return userMessage;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userMessage?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
      conversation?: unknown;
      forceIntent?: unknown;
    };
    const userMessage = text(body.userMessage);
    if (!userMessage) return NextResponse.json({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });

    const snapshot = snapshotFrom(body.canvasSnapshot);
    const selectedNodeIds = stringArray(body.selectedNodeIds);
    const forced = validIntents.includes(body.forceIntent as AgentRouterIntent) ? body.forceIntent as AgentRouterIntent : undefined;
    const intent = forced || inferIntent(userMessage, snapshot, selectedNodeIds.length);

    if (intent === "skill") {
      const skillBrief = await runFixedSceneSkillLLM({ userBrief: skillBriefFrom(userMessage, snapshot.agentMemory) });
      return NextResponse.json({
        ok: true,
        intent,
        skillId: "fixed-scene-action-video",
        skillBrief,
        summary: "Use the fixed-scene video skill: character turnaround images + scene nine-grid image + video node.",
      });
    }

    if (intent === "dialogue") {
      const response = await runAgentDialogueLLM({ userMessage, conversation: messagesFrom(body.conversation) });
      return NextResponse.json({ ok: true, intent, response, summary: response.title });
    }

    if (intent === "organize") {
      if (!snapshot.nodes.length) return NextResponse.json({ ok: false, error: { message: "Canvas must include at least one node before organizing." } }, { status: 400 });
      const organizePlan = await runAgentOrganizeLLM({ userInstruction: userMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds) });
      const patch = compileCanvasOrganizePlanToPatch({ organizePlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges });
      return NextResponse.json({
        ok: true,
        intent,
        organizePlan,
        patch,
        summary: `${organizePlan.title}: ${organizePlan.workflows.length} workflows identified, ${patch.updateNodes.length} nodes to arrange.`,
      });
    }

    if (intent === "edit" && snapshot.nodes.length) {
      const editPlan = await runAgentEditLLM({ userInstruction: userMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds) });
      const patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      return NextResponse.json({
        ok: true,
        intent,
        editPlan,
        patch,
        summary: `${editPlan.title}: ${patch.createNodes.length} nodes to create, ${patch.updateNodes.length} nodes to update, ${patch.deleteNodeIds.length} nodes to delete.`,
      });
    }

    const plan = await runAgentPlannerLLM({ userPrompt: userMessage, canvasSummary: plannerSummary(snapshot) });
    const patch = compileWorkflowPlanToCanvas(plan);
    return NextResponse.json({
      ok: true,
      intent: "create",
      plan,
      patch,
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
