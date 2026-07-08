"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { requestAgentDialogue } from "@/features/agent/services/agentClient";
import { agentWorkflowSkills, type AgentWorkflowSkillId } from "@/shared/agent/workflowSkills";
import type { AgentCanvasEditPlan, AgentCanvasOrganizePlan, AgentDialogueResponse, AgentWorkflowPlan, CanvasEditPatch, CanvasPatch } from "@/shared/agent/agentSchema";

const createSuggestions = [
  "周星驰来香港科技大学拍戏，做成一个 10 秒港风喜剧短片",
  "整理一条校园短片创作流程，包含剧本、分镜和关键帧",
  "生成一支产品发布视频工作流，包含主视觉和动态视频",
];

const editSuggestions = [
  "把这个工作流改成 TikTok 竖屏短片",
  "加一个背景音乐节点，连接到最终输出",
  "给所有图片 prompt 加上港风电影感和胶片颗粒",
];

type AgentMode = "develop" | "create" | "edit";
type AgentPreview =
  | { mode: "create"; plan: AgentWorkflowPlan; patch: CanvasPatch; summary: string }
  | { mode: "edit"; editPlan: AgentCanvasEditPlan; patch: CanvasEditPatch; summary: string }
  | { mode: "organize"; organizePlan: AgentCanvasOrganizePlan; patch: CanvasEditPatch; summary: string };
type DialogueEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; response: AgentDialogueResponse };

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
};
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const operationTarget = (operation: AgentCanvasEditPlan["operations"][number]) => {
  return operation.targetNodeId || operation.sourceNodeId || operation.targetNodeIdForConnection || operation.targetEdgeId || operation.nodeType || "canvas";
};

export function AgentWorkflowPanel() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AgentMode>("develop");
  const [brief, setBrief] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [dialogue, setDialogue] = useState<DialogueEntry[]>([]);
  const [dialogueBusy, setDialogueBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechPreview, setSpeechPreview] = useState("");
  const [workflowOrder, setWorkflowOrder] = useState("1");
  const [workflowTitle, setWorkflowTitle] = useState("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const committedSpeechRef = useRef("");
  const generateAgentPlan = useCanvasStore((state) => state.generateAgentPlan);
  const applyAgentPatch = useCanvasStore((state) => state.applyAgentPatch);
  const setPendingAgentPatch = useCanvasStore((state) => state.setPendingAgentPatch);
  const generateAgentEdit = useCanvasStore((state) => state.generateAgentEdit);
  const applyAgentEditPatch = useCanvasStore((state) => state.applyAgentEditPatch);
  const generateAgentOrganize = useCanvasStore((state) => state.generateAgentOrganize);
  const runAgentWorkflow = useCanvasStore((state) => state.runAgentWorkflow);
  const runAgentSkill = useCanvasStore((state) => state.runAgentSkill);
  const addStoryChainNode = useCanvasStore((state) => state.addStoryChainNode);
  const markSelectedWorkflow = useCanvasStore((state) => state.markSelectedWorkflow);
  const clearSelectedWorkflowMark = useCanvasStore((state) => state.clearSelectedWorkflowMark);
  const arrangeWorkflows = useCanvasStore((state) => state.arrangeWorkflows);
  const nodes = useCanvasStore((state) => state.nodes);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const agentStatus = useCanvasStore((state) => state.agentStatus);
  const agentMessage = useCanvasStore((state) => state.agentMessage);
  const busy = agentStatus === "planning" || agentStatus === "building" || agentStatus === "running" || dialogueBusy;
  const canSubmit = brief.trim().length > 0 && !busy;
  const suggestions = mode === "edit" ? editSuggestions : createSuggestions;
  const workflowSkills = Object.values(agentWorkflowSkills);
  const selectedWorkflowNodeCount = new Set([...nodes.filter((node) => node.selected).map((node) => node.id), ...(selectedNodeId ? [selectedNodeId] : [])]).size;
  const workflowOrderNumber = Math.max(1, Number.parseInt(workflowOrder, 10) || 1);

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText.trim()) {
        committedSpeechRef.current = `${committedSpeechRef.current}${finalText}`;
        setBrief((current) => `${current}${current.trim() ? " " : ""}${finalText.trim()}`);
      }
      setSpeechPreview(interimText.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      setSpeechPreview("");
      setLocalError(event.error ? `Voice input failed: ${event.error}` : "Voice input failed.");
    };
    recognition.onend = () => {
      setListening(false);
      setSpeechPreview("");
    };
    recognitionRef.current = recognition;
    setSpeechSupported(true);
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const toggleVoiceInput = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setLocalError("Voice input is not supported in this browser.");
      return;
    }
    setLocalError(null);
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    try {
      committedSpeechRef.current = "";
      setSpeechPreview("");
      recognition.start();
      setListening(true);
    } catch (error) {
      setListening(false);
      setLocalError(error instanceof Error ? error.message : "Voice input failed.");
    }
  };

  const sendDialogue = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || dialogueBusy) return;
    setLocalError(null);
    setPreview(null);
    setDialogueBusy(true);
    const nextDialogue: DialogueEntry[] = [...dialogue, { role: "user", content: trimmed }];
    setDialogue(nextDialogue);
    setBrief("");
    try {
      const payload = await requestAgentDialogue({
        userMessage: trimmed,
        conversation: dialogue.map((item) => ({ role: item.role, content: item.content })),
      });
      if (!payload.response) throw new Error("构思对话生成失败。");
      addStoryChainNode(payload.response.brief || payload.response.message, payload.response.title);
      setDialogue([...nextDialogue, { role: "assistant", content: payload.response.message, response: payload.response }]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "构思对话生成失败。");
    } finally {
      setDialogueBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setLocalError(null);
    setPreview(null);
    try {
      if (mode === "develop") {
        await sendDialogue(brief);
      } else if (mode === "create") {
        const result = await generateAgentPlan(brief);
        setPreview({ mode: "create", ...result });
      } else {
        const result = await generateAgentEdit(brief);
        setPreview({ mode: "edit", ...result });
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : mode === "create" ? "Agent 计划生成失败。" : "Agent 修改计划生成失败。");
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    if (preview.mode === "create") applyAgentPatch(preview.patch);
    else applyAgentEditPatch(preview.patch);
    setLocalError(null);
  };

  const generateOrganizePreview = async () => {
    if (!nodes.length || busy) return;
    setLocalError(null);
    setPreview(null);
    try {
      const result = await generateAgentOrganize(brief);
      setPreview({ mode: "organize", ...result });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Agent 整理计划生成失败。");
    }
  };

  const choosePlacement = () => {
    if (!preview || preview.mode !== "create") return;
    setPendingAgentPatch(preview.patch);
    setLocalError(null);
    setOpen(false);
  };

  const useFallbackTemplate = () => {
    if (mode !== "create" || !brief.trim() || busy) return;
    setLocalError(null);
    setPreview(null);
    void runAgentWorkflow(brief);
  };

  const useWorkflowSkill = (skillId: AgentWorkflowSkillId, sourceBrief = brief) => {
    if (busy) return;
    setLocalError(null);
    setPreview(null);
    void runAgentSkill(skillId, sourceBrief);
    setOpen(false);
  };

  const markWorkflow = () => {
    setLocalError(null);
    markSelectedWorkflow(workflowOrderNumber, workflowTitle);
  };

  const switchMode = (nextMode: AgentMode) => {
    setMode(nextMode);
    setPreview(null);
    setLocalError(null);
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
    <section className="fixed bottom-5 right-5 z-50 flex h-[min(720px,calc(100vh-40px))] w-[min(500px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-[#dce2ea] bg-[#f7f9fc] text-[#111827] shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
      <header className="flex h-14 items-center justify-between border-b border-[#e3e8ef] px-4">
        <div>
          <div className="text-[15px] font-semibold text-[#1f6feb]">Mindverse Agent</div>
          <div className="text-[11px] text-[#7b8794]">生成计划，确认后应用</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-white"
          aria-label="Close Agent"
        >
          <span className="text-[20px] leading-none">x</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div>
          <div className="mb-3 flex items-center gap-3 text-[22px] font-medium text-[#8a94a3]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#111827] shadow-sm">
              <span className="text-[13px] font-semibold">AI</span>
            </span>
            工作流规划助手
          </div>
          <h2 className="text-[26px] font-semibold leading-tight tracking-normal text-[#111827]">
            {mode === "create" ? "描述你想搭建的创作流程。" : "描述你想如何修改当前画布。"}
          </h2>
        </div>

        <div className="grid grid-cols-3 rounded-full border border-[#e1e6ee] bg-white p-1 text-[12px] font-semibold shadow-sm">
          <button
            type="button"
            onClick={() => switchMode("develop")}
            className={`rounded-full px-3 py-2 transition ${mode === "develop" ? "bg-[#111827] text-white" : "text-[#5f6b7a] hover:bg-[#f7f9fc]"}`}
          >
            构思对话
          </button>
          <button
            type="button"
            onClick={() => switchMode("create")}
            className={`rounded-full px-3 py-2 transition ${mode === "create" ? "bg-[#111827] text-white" : "text-[#5f6b7a] hover:bg-[#f7f9fc]"}`}
          >
            新建工作流
          </button>
          <button
            type="button"
            onClick={() => switchMode("edit")}
            className={`rounded-full px-3 py-2 transition ${mode === "edit" ? "bg-[#111827] text-white" : "text-[#5f6b7a] hover:bg-[#f7f9fc]"}`}
          >
            修改当前画布
          </button>
        </div>

        <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#111827]">整理画布</div>
              <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">先选中一批节点，标记为一条工作流，再按编号整理画布。</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#f7f9fc] px-2.5 py-1 text-[11px] font-semibold text-[#5f6b7a]">
              已选 {selectedWorkflowNodeCount}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-[72px_1fr] gap-2">
            <label className="text-[11px] font-semibold text-[#5f6b7a]">
              编号
              <input
                value={workflowOrder}
                onChange={(event) => setWorkflowOrder(event.target.value.replace(/[^\d]/g, "") || "1")}
                className="mt-1 h-9 w-full rounded-lg border border-[#e1e6ee] bg-[#f7f9fc] px-2 text-[13px] text-[#111827] outline-none focus:border-[#9fb4d2]"
                inputMode="numeric"
              />
            </label>
            <label className="text-[11px] font-semibold text-[#5f6b7a]">
              名称
              <input
                value={workflowTitle}
                onChange={(event) => setWorkflowTitle(event.target.value)}
                placeholder={`Workflow ${workflowOrderNumber}`}
                className="mt-1 h-9 w-full rounded-lg border border-[#e1e6ee] bg-[#f7f9fc] px-2 text-[13px] text-[#111827] outline-none placeholder:text-[#9aa5b3] focus:border-[#9fb4d2]"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button type="button" disabled={!selectedWorkflowNodeCount} onClick={markWorkflow} className="rounded-full px-3 text-[12px]">
              标记选中
            </Button>
            <Button type="button" disabled={!nodes.length} onClick={arrangeWorkflows} className="rounded-full border-[#111827] bg-[#111827] px-3 text-[12px] text-white hover:border-[#263244] hover:bg-[#263244]">
              按编号整理
            </Button>
            <Button type="button" disabled={!selectedWorkflowNodeCount} onClick={clearSelectedWorkflowMark} className="rounded-full px-3 text-[12px]">
              清除标记
            </Button>
          </div>
          <Button type="button" disabled={!nodes.length || busy} onClick={() => void generateOrganizePreview()} className="mt-3 w-full rounded-full border-[#111827] bg-[#111827] px-3 text-[12px] text-white hover:border-[#263244] hover:bg-[#263244]">
            Agent 识别并整理
          </Button>
        </div>

        {mode === "edit" && (
          <div className="rounded-xl border border-[#e1e6ee] bg-white px-3 py-2 text-[12px] text-[#5f6b7a] shadow-sm">
            当前画布：{nodes.length} 个节点{selectedNodeId ? `，已选中 ${selectedNodeId}` : "，未选中节点"}。
          </div>
        )}

        {mode === "develop" && (
          <div className="space-y-3">
            {!dialogue.length && (
              <div className="rounded-xl border border-[#e1e6ee] bg-white px-3 py-3 text-[12px] leading-5 text-[#5f6b7a] shadow-sm">
                先做构思对话：Agent 会像导演助理一样追问拍摄意图、给出三个故事方向，用户可以选择、展开、推翻重来，最后沉淀成可用于生成工作流的 brief。
              </div>
            )}
            {dialogue.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`rounded-[16px] border px-3 py-3 shadow-sm ${item.role === "user" ? "ml-10 border-[#dce2ea] bg-[#111827] text-white" : "mr-8 border-[#e1e6ee] bg-white text-[#111827]"}`}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">{item.role === "user" ? "You" : item.response.title}</div>
                <p className="whitespace-pre-wrap text-[13px] leading-6">{item.content}</p>
                {item.role === "assistant" && !!item.response.options?.length && (
                  <div className="mt-3 space-y-2">
                    {item.response.options.map((option) => (
                      <div key={option.id} className="rounded-xl border border-[#edf1f6] bg-[#f7f9fc] p-3">
                        <div className="text-[13px] font-semibold text-[#111827]">{option.id}. {option.title}</div>
                        <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{option.summary}</p>
                        {!!option.tags?.length && <div className="mt-2 flex flex-wrap gap-1.5">{option.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#6b7280]">{tag}</span>)}</div>}
                        <div className="mt-3 flex gap-2">
                          <Button type="button" className="rounded-full px-3 py-1 text-[11px]" disabled={busy} onClick={() => void sendDialogue(`我选择 ${option.id}：${option.title}。请继续推进这个方向。`)}>选这个</Button>
                          <Button type="button" className="rounded-full px-3 py-1 text-[11px]" disabled={busy} onClick={() => void sendDialogue(`请展开讲讲 ${option.id}：${option.title}，再给我几个细化选择。`)}>展开</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {item.role === "assistant" && item.response.brief && (
                  <div className="mt-3 rounded-xl border border-[#dce2ea] bg-[#f7f9fc] p-3">
                    <div className="text-[12px] font-semibold text-[#111827]">可执行 brief</div>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#5f6b7a]">{item.response.brief}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" className="rounded-full border-[#111827] bg-[#111827] px-3 py-1 text-[11px] text-white hover:border-[#263244] hover:bg-[#263244]" onClick={() => { setMode("create"); setBrief(item.response.brief || item.content); }}>
                        ????????
                      </Button>
                      <Button type="button" className="rounded-full px-3 py-1 text-[11px]" disabled={busy} onClick={() => useWorkflowSkill("fixed-scene-action-video", item.response.brief || item.content)}>
                        ???? Skill
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBrief(item)}
              className="min-h-20 rounded-xl border border-[#e1e6ee] bg-white px-3 py-3 text-left text-[12px] font-medium leading-snug text-[#374151] shadow-sm transition hover:border-[#c8d2df] hover:bg-[#fbfcfe]"
            >
              <span className="mb-2 block text-[15px] leading-none text-[#697386]">-&gt;</span>
              {item}
            </button>
          ))}
        </div>

        {mode === "create" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="mb-3">
              <div className="text-[13px] font-semibold text-[#111827]">Workflow Skills</div>
              <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">选择一个专用技能，输入框里的故事目标会作为参数传入。</p>
            </div>
            <div className="grid gap-2">
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
                  <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#697386]">默认 {skill.defaultDuration}s</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(agentMessage || localError || agentStatus !== "idle") && (
          <div className="flex items-start gap-2 rounded-xl border border-[#e1e6ee] bg-white px-3 py-2 text-[12px] text-[#5f6b7a] shadow-sm">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                localError || agentStatus === "error" ? "bg-rose-500" : agentStatus === "completed" ? "bg-emerald-500" : "bg-sky-500"
              }`}
            />
            <span className={localError || agentStatus === "error" ? "text-rose-600" : ""}>
              {localError || agentMessage || "Agent 已就绪。"}
            </span>
          </div>
        )}

        <div className="rounded-[18px] border border-[#dce2ea] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={4}
            placeholder={mode === "develop" ? "例如：我想拍一个周星驰来香港科技大学拍戏的短片..." : mode === "create" ? "描述短片、广告、分镜、图生视频或完整创作包需求..." : "例如：把视频改成竖屏 TikTok 风格，并加一个背景音乐节点..."}
            className="min-h-28 w-full resize-none rounded-t-[18px] bg-transparent px-4 py-4 text-[14px] leading-6 text-[#111827] outline-none placeholder:text-[#8a94a3]"
            aria-label="Agent instruction"
          />
          <div className="flex items-center justify-between gap-2 border-t border-[#edf1f6] px-3 py-3">
            <Button
              type="button"
              disabled={mode !== "create" || !brief.trim() || busy}
              onClick={useFallbackTemplate}
              className="rounded-full px-4"
            >
              默认模板
            </Button>
            <Button
              type="button"
              disabled={!speechSupported || busy}
              onClick={toggleVoiceInput}
              aria-pressed={listening}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              title={speechSupported ? "Voice input" : "Voice input is not supported in this browser"}
              className={`flex items-center gap-2 rounded-full px-4 ${listening ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : ""}`}
            >
              <span className={`h-2 w-2 rounded-full ${listening ? "bg-rose-500" : "bg-[#7b8794]"}`} />
              {listening ? "Listening" : "Voice"}
            </Button>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded-full border-[#111827] bg-[#111827] px-4 text-white hover:border-[#263244] hover:bg-[#263244]"
            >
              {busy ? "生成中..." : mode === "develop" ? "继续构思" : mode === "create" ? "生成计划" : "生成修改计划"}
            </Button>
          </div>
          {speechPreview && (
            <div className="border-t border-[#edf1f6] px-4 py-2 text-[12px] text-[#5f6b7a]">
              {speechPreview}
            </div>
          )}
        </div>

        {preview?.mode === "create" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.plan.title}</h3>
                {preview.plan.description && <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.plan.description}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1f6feb]">{preview.plan.goal}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">场景: {preview.plan.sceneCount ?? 3}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">视频: {preview.plan.videoProvider ?? "tokenstar"}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">步骤: {preview.plan.steps.length}</div>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#edf1f6]">
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
            {!!preview.plan.warnings?.length && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">{preview.plan.warnings.join(" ")}</div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={choosePlacement} className="rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">选择位置</Button>
              <Button type="button" onClick={applyPreview} className="rounded-full">直接应用</Button>
            </div>
          </div>
        )}

        {preview?.mode === "organize" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.organizePlan.title}</h3>
                {preview.organizePlan.description && <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.organizePlan.description}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1f6feb]">
                {preview.organizePlan.workflows.length} 条
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">工作流: {preview.organizePlan.workflows.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">整理节点: {preview.patch.updateNodes.length}</div>
            </div>
            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.organizePlan.workflows.map((workflow) => (
                <div key={workflow.id} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">#{workflow.label}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#111827]">{workflow.title}</div>
                    <div className="text-[11px] leading-4 text-[#7b8794]">{workflow.nodeIds.length} 个节点{workflow.reason ? ` · ${workflow.reason}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {!!preview.patch.warnings?.length && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">{preview.patch.warnings.join(" ")}</div>}
            <div className="mt-4">
              <Button type="button" onClick={applyPreview} className="w-full rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">
                应用整理到画布
              </Button>
            </div>
          </div>
        )}

        {preview?.mode === "edit" && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.editPlan.title}</h3>
                {preview.editPlan.description && <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.editPlan.description}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1f6feb]">{preview.editPlan.intent}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">新增: {preview.patch.createNodes.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">更新: {preview.patch.updateNodes.length}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">删除: {preview.patch.deleteNodeIds.length}</div>
            </div>
            {!!preview.editPlan.targetNodeIds?.length && (
              <div className="mt-3 rounded-xl bg-[#f7f9fc] px-3 py-2 text-[12px] leading-5 text-[#5f6b7a]">
                目标节点：{preview.editPlan.targetNodeIds.join(", ")}
              </div>
            )}
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
            {!!preview.patch.warnings?.length && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">{preview.patch.warnings.join(" ")}</div>}
            <div className="mt-4">
              <Button type="button" onClick={applyPreview} className="w-full rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]">
                应用修改到画布
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
