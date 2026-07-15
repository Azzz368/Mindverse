"use client";
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, MiniMap, ReactFlow, useReactFlow, useViewport, type Connection, type EdgeProps, type EdgeTypes, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotatedCustomNode } from "./AnnotatedCustomNode";
import { AddNodeMenu } from "./AddNodeMenu";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLang } from "@/components/providers/LangProvider";
import type { NodeType, WorkflowEdge } from "@/shared/canvas";

type AlignGuide = { type: "v" | "h"; pos: number };
const SNAP_THRESHOLD = 10;
const GROUP_PADDING = 40;
const MAX_ALIGNMENT_GUIDE_NODES = 60;

/* ── Morandicolor palette (10 colours) ───────────────────────── */
const MORANDI = [
  { label: "茱萸粉", bg: "#c9a9a6", text: "#fff" },
  { label: "雾霾蓝", bg: "#a0b4c0", text: "#fff" },
  { label: "灰紫",   bg: "#b0a8c4", text: "#fff" },
  { label: "苔绿",   bg: "#a6b89a", text: "#fff" },
  { label: "燕麦",   bg: "#d4c5a9", text: "#5a4a3a" },
  { label: "陶土",   bg: "#c4a882", text: "#fff" },
  { label: "烟灰",   bg: "#b0afaa", text: "#fff" },
  { label: "薄荷",   bg: "#a8c4bc", text: "#fff" },
  { label: "奶杏",   bg: "#e0cfc0", text: "#5a4a3a" },
  { label: "淡丁香", bg: "#c8b8d8", text: "#fff" },
];

const icons: Record<string, string> = { prompt: "*", text: "T", image: "#", video: "\u25B6", videoEdit: "\u2702", motion: "\u25A3", audio: "~", storyboard: "\u25A6", reference: "/", output: "\u2197" };

function GhostNode({ type, x, y }: { type: NodeType; x: number; y: number }) {
  return (
    <div className="pointer-events-none fixed z-[9998] flex items-center gap-2 rounded-xl border-2 border-dashed border-[#030303]/40 bg-white/30 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-cyan-400/40 dark:bg-[#101c29]/30"
      style={{ left: x + 12, top: y - 20, opacity: 0.7 }}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#030303]/10 text-base text-[#030303] dark:bg-cyan-400/10 dark:text-cyan-300">{icons[type]}</span>
      <span className="text-xs font-semibold text-[#030303]/60 dark:text-slate-300/60">{type[0].toUpperCase() + type.slice(1)}</span>
    </div>
  );
}

function GhostMediaNode({ dataUrl, x, y }: { dataUrl: string; x: number; y: number }) {
  return (
    <div className="pointer-events-none fixed z-[9998] rounded-xl border-2 border-dashed border-violet-400/60 bg-white/30 p-1 shadow-lg backdrop-blur-sm"
      style={{ left: x + 12, top: y - 20, opacity: 0.7, width: 100, height: 80 }}>
      <img src={dataUrl} alt="" className="h-full w-full rounded-lg object-cover"/>
    </div>
  );
}

function GroupOverlayNode({ id, data, selected }: import("@xyflow/react").NodeProps) {
  const { updateGroupColor, setGroupLockedByGroupId, runGroup } = useCanvasStore();
  const { t } = useLang();
  const [showColors, setShowColors] = useState(false);
  const groupId = data.groupId as string;
  const allLocked = data.locked as boolean;
  const color = data.color as string;

  return (
    <>
      {selected && (
        <div className="nodrag absolute -top-14 left-0 z-50 flex items-center gap-2 rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-[#101c29]"
             onPointerDown={e => e.stopPropagation()}>
          <button onClick={() => setShowColors(!showColors)} className="text-xs font-semibold text-[#030303] hover:text-[#676f7b] dark:text-slate-200">{t.groupColor}</button>
          <div className="h-4 w-px bg-[#e7eaf0] dark:bg-slate-700"/>
          <button onClick={() => setGroupLockedByGroupId(groupId, !allLocked)} className="text-xs font-semibold text-[#030303] hover:text-[#676f7b] dark:text-slate-200">{allLocked ? t.unlockGroup : t.lockGroup}</button>
          <div className="h-4 w-px bg-[#e7eaf0] dark:bg-slate-700"/>
          <button onClick={() => { setShowColors(false); void runGroup(groupId); }} className="text-xs font-semibold text-[#030303] hover:text-[#676f7b] dark:text-slate-200">{t.runGroup}</button>

          {showColors && (
            <div className="absolute left-0 top-12 flex gap-1.5 rounded-xl border border-[#e7eaf0] bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-[#101c29]">
              {MORANDI.slice(0, 8).map(c => (
                <button key={c.bg} title={c.label} className="h-5 w-5 rounded-full border-2 border-white shadow transition hover:scale-110" style={{ background: c.bg }}
                  onClick={() => { updateGroupColor(groupId, c.bg); setShowColors(false); }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="pointer-events-none h-full w-full rounded-[18px] border border-transparent transition-colors duration-300"
           style={{
             backgroundColor: rgba(color, selected ? 0.45 : 0.30),
             borderColor: selected ? color : "transparent",
           }} />
    </>
  );
}

/* ── Right-click context menu for selected nodes ─────────────── */
type CtxMenu = { x: number; y: number; nodeIds: string[] };
function ContextMenu({ menu, onClose }: { menu: CtxMenu; onClose(): void }) {
  const { setGroupColor } = useCanvasStore();
  const { t } = useLang();

  return (
    <div className="fixed z-[9999]" style={{ left: menu.x, top: menu.y }}>
      <div className="nodrag min-w-[160px] rounded-xl border border-[#e7eaf0] bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#101c29]"
        onMouseLeave={onClose}>
        <p className="mb-2 text-xs font-semibold text-[#676f7b] dark:text-slate-400">
          Create Group
        </p>
        <div className="flex flex-wrap gap-2">
          {MORANDI.slice(0, 8).map(c => (
            <button key={c.bg} title={c.label}
              className="h-6 w-6 rounded-full border-2 border-white shadow transition hover:scale-110"
              style={{ background: c.bg }}
              onClick={() => { setGroupColor(menu.nodeIds, c.bg); onClose(); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const rgba = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((item) => item + item).join("") : value;
  const parsed = Number.parseInt(full, 16);
  if (!Number.isFinite(parsed)) return `rgba(168, 196, 188, ${alpha})`;
  return `rgba(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}, ${alpha})`;
};

function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }: EdgeProps) {
  const { onEdgesChange } = useCanvasStore();
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {/* Wider invisible hit area so hovering near the line is easy */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onEdgesChange([{ id, type: "remove" }])}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <button
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="nodrag nopan absolute z-50 grid h-5 w-5 place-items-center rounded-full border border-white bg-rose-600 text-white shadow hover:bg-rose-700"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={() => onEdgesChange([{ id, type: "remove" }])}
            title="删除连线"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}


const fallbackSizeFor = (type: string) => ({
  script: { w: 320, h: 460 },
  storyboard: { w: 320, h: 420 },
  image: { w: 320, h: 360 },
  video: { w: 320, h: 280 },
  videoEdit: { w: 320, h: 280 },
  motion: { w: 320, h: 260 },
  audio: { w: 320, h: 220 },
  storyboardImage: { w: 320, h: 280 },
  output: { w: 280, h: 200 },
  text: { w: 280, h: 280 },
  prompt: { w: 280, h: 280 },
}[type] || { w: 280, h: 250 });

export function CreativeCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode, toggleSelectedNode, selectionMode, ghostType, setGhostType, placeGhostNode, addMediaNode, ghostMediaUrl, setGhostMedia: _setGhostMedia, placeGhostMedia, pendingAgentPatch, setPendingAgentPatch, placeAgentPatch } = useCanvasStore();
  const { theme } = useTheme();
  const { getNodes, screenToFlowPosition } = useReactFlow();
  const { x: viewX, y: viewY, zoom } = useViewport();
  const nodeTypes = useMemo<NodeTypes>(() => ({ creative: AnnotatedCustomNode }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({ default: DeletableEdge }), []);
  const edgeReconnecting = useRef(false);
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);

  const isDark = theme === "dark";
  const edgeColor = isDark ? "#22d3ee" : "#404040";
  const dotColor  = isDark ? "#243446" : "#d0d0d0";
  const bgColor   = isDark ? "#091019" : "#f5f5f5";
  const nodeColor = isDark ? "#0e7490" : "#404040";
  const maskColor = isDark ? "rgba(3,10,18,.72)" : "rgba(245,245,245,.65)";
  const isGhosting = !!(ghostType || ghostMediaUrl || pendingAgentPatch);
  const groupBackdrops = useMemo(() => {
    const groups = new Map<string, { color: string; minX: number; minY: number; maxX: number; maxY: number }>();
    nodes.forEach((node) => {
      if (!node.data.groupColor || !node.data.groupId) return;
      const measuredNode = node as typeof node & { measured?: { width?: number; height?: number }; width?: number; height?: number };
      const fallback = fallbackSizeFor(node.data.nodeType);
      const width = measuredNode.measured?.width || measuredNode.width || fallback.w;
      const height = measuredNode.measured?.height || measuredNode.height || fallback.h;
      const existing = groups.get(node.data.groupId);
      const minX = node.position.x;
      const minY = node.position.y;
      const maxX = node.position.x + width;
      const maxY = node.position.y + height;
      if (!existing) {
        groups.set(node.data.groupId, { color: node.data.groupColor, minX, minY, maxX, maxY });
        return;
      }
      existing.color = node.data.groupColor;
      existing.minX = Math.min(existing.minX, minX);
      existing.minY = Math.min(existing.minY, minY);
      existing.maxX = Math.max(existing.maxX, maxX);
      existing.maxY = Math.max(existing.maxY, maxY);
    });
    return [...groups.entries()].map(([id, group]) => ({
      id,
      color: group.color,
      left: (group.minX - GROUP_PADDING) * zoom + viewX,
      top: (group.minY - GROUP_PADDING) * zoom + viewY,
      width: (group.maxX - group.minX + GROUP_PADDING * 2) * zoom,
      height: (group.maxY - group.minY + GROUP_PADDING * 2) * zoom,
    }));
  }, [nodes, viewX, viewY, zoom]);

  /* Track mouse for both ghost types */
  useEffect(() => {
    if (!isGhosting) return;
    const onMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [isGhosting]);

  /* Right-click = cancel ghost OR show context menu */
  useEffect(() => {
    if (!ghostType && !ghostMediaUrl && !pendingAgentPatch) return;
    const onCtx = (e: MouseEvent) => { e.preventDefault(); setGhostType(null); _setGhostMedia(""); setPendingAgentPatch(null); };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [ghostType, ghostMediaUrl, pendingAgentPatch, setGhostType, _setGhostMedia, setPendingAgentPatch]);

  const handleReconnectStart = useCallback(() => { edgeReconnecting.current = false; }, []);
  const handleReconnect = useCallback((oldEdge: WorkflowEdge, newConnection: Connection) => {
    edgeReconnecting.current = true;
    onEdgesChange([{ type: "remove", id: oldEdge.id }]);
    onConnect(newConnection);
  }, [onEdgesChange, onConnect]);
  const handleReconnectEnd = useCallback((_: MouseEvent | TouchEvent, edge: WorkflowEdge) => {
    if (!edgeReconnecting.current) onEdgesChange([{ type: "remove", id: edge.id }]);
  }, [onEdgesChange]);

  const handleNodeDrag = useCallback((_: MouseEvent | TouchEvent, draggedNode: { id: string; position: { x: number; y: number } }) => {
    const allNodes = getNodes();
    if (allNodes.length > MAX_ALIGNMENT_GUIDE_NODES) {
      setAlignGuides([]);
      return;
    }
    const guides: AlignGuide[] = [], nx = draggedNode.position.x, ny = draggedNode.position.y;
    for (const other of allNodes) {
      if (other.id === draggedNode.id) continue;
      if (Math.abs(nx - other.position.x) < SNAP_THRESHOLD) guides.push({ type: "v", pos: other.position.x });
      if (Math.abs(ny - other.position.y) < SNAP_THRESHOLD) guides.push({ type: "h", pos: other.position.y });
    }
    setAlignGuides(guides);
  }, [getNodes]);

  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, draggedNode: { id: string; position: { x: number; y: number } }) => {
    setAlignGuides([]);
    const allNodes = getNodes();
    let newX = draggedNode.position.x, newY = draggedNode.position.y;
    for (const other of allNodes) {
      if (other.id === draggedNode.id) continue;
      if (Math.abs(newX - other.position.x) < SNAP_THRESHOLD) newX = other.position.x;
      if (Math.abs(newY - other.position.y) < SNAP_THRESHOLD) newY = other.position.y;
    }
    if (newX !== draggedNode.position.x || newY !== draggedNode.position.y)
      onNodesChange([{ type: "position", id: draggedNode.id, position: { x: newX, y: newY }, dragging: false }]);
  }, [getNodes, onNodesChange]);

  /* Left-click on pane = place ghost or deselect */
  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    setCtxMenu(null);
    setAddMenu(null);
    if (pendingAgentPatch) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      placeAgentPatch(flowPos);
    } else if (ghostType) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      placeGhostNode(flowPos);
    } else if (ghostMediaUrl) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      placeGhostMedia(flowPos);
    } else if (!selectionMode) {
      setSelectedNode(null);
    }
  }, [ghostType, ghostMediaUrl, pendingAgentPatch, screenToFlowPosition, placeGhostNode, placeGhostMedia, placeAgentPatch, selectionMode, setSelectedNode]);

  /* Right-click on selected nodes → context menu */
  const handleSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setAddMenu(null);
    const selected = getNodes().filter(n => n.selected);
    if (!selected.length) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeIds: selected.map(n => n.id) });
  }, [getNodes]);

  /* Right-click on pane = add node menu */
  const handlePaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu(null);
    setAddMenu({ x: (e as MouseEvent).clientX ?? (e as React.MouseEvent).clientX, y: (e as MouseEvent).clientY ?? (e as React.MouseEvent).clientY });
  }, []);

  /* File drop onto canvas */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => { addMediaNode(reader.result as string, { x: flowPos.x + i * 60, y: flowPos.y + i * 40 }); };
      reader.readAsDataURL(file);
    });
  }, [screenToFlowPosition, addMediaNode]);

  return (
    <div className={`relative h-full flex-1 ${isGhosting ? "cursor-crosshair" : selectionMode ? "cursor-cell" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => ctxMenu && setCtxMenu(null)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(event, node) => {
          if (isGhosting) return;
          if (selectionMode || event.ctrlKey || event.metaKey || event.shiftKey) toggleSelectedNode(node.id);
          else setSelectedNode(node.id);
        }}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        fitView
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        selectionKeyCode="Control"
        multiSelectionKeyCode="Control"
        defaultEdgeOptions={{ animated: false, style: { stroke: edgeColor } }}
        reconnectRadius={20}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
      >
        <Background gap={24} size={1} color={dotColor} style={{ background: bgColor }} />
        {groupBackdrops.map((group) => (
          <div
            key={group.id}
            className="react-flow__group-backdrop pointer-events-none"
            style={{ left: group.left, top: group.top, width: group.width, height: group.height, borderColor: rgba(group.color, 0.45), backgroundColor: rgba(group.color, 0.28) }}
          />
        ))}
        <Controls showInteractive={false} />
        <MiniMap nodeColor={nodeColor} maskColor={maskColor} />
      </ReactFlow>

      {selectionMode && !isGhosting && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[9998] -translate-x-1/2 rounded-full border border-[#dce2ea] bg-white/95 px-4 py-2 text-xs font-semibold text-[#111827] shadow-lg backdrop-blur">
          Selection mode: click nodes to add or remove them
        </div>
      )}

      {/* Alignment guide lines */}
      {alignGuides.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {alignGuides.map((g, i) =>
            g.type === "v"
              ? <div key={i} className="absolute bottom-0 top-0 w-px bg-blue-500/70 dark:bg-cyan-400/70" style={{ left: g.pos * zoom + viewX }} />
              : <div key={i} className="absolute left-0 right-0 h-px bg-blue-500/70 dark:bg-cyan-400/70" style={{ top: g.pos * zoom + viewY }} />
          )}
        </div>
      )}

      {/* Ghost node following cursor */}
      {ghostType && <GhostNode type={ghostType} x={mousePos.x} y={mousePos.y} />}
      {ghostMediaUrl && <GhostMediaNode dataUrl={ghostMediaUrl} x={mousePos.x} y={mousePos.y} />}

      {/* Right-click context menu */}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* Add node menu */}
      {addMenu && <AddNodeMenu x={addMenu.x} y={addMenu.y} onClose={() => setAddMenu(null)} />}
    </div>
  );
}
