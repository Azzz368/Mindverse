"use client";
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, useViewport, type Connection, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotatedCustomNode } from "./AnnotatedCustomNode";
import { useCanvasStore } from "@/store/canvasStore";
import { useTheme } from "@/components/ThemeProvider";
import type { NodeType, WorkflowEdge } from "@/types/canvas";

type AlignGuide = { type: "v" | "h"; pos: number };
const SNAP_THRESHOLD = 10;

const icons: Record<string, string> = { prompt: "鉁?, text: "T", image: "鈼?, video: "鈻?, audio: "鈾?, storyboard: "鈻?, reference: "鈱?, output: "鈫? };

function GhostNode({ type, x, y }: { type: NodeType; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-[9998] flex items-center gap-2 rounded-xl border-2 border-dashed border-[#030303]/40 bg-white/30 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-cyan-400/40 dark:bg-[#101c29]/30"
      style={{ left: x + 12, top: y - 20, opacity: 0.7 }}
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#030303]/10 text-base text-[#030303] dark:bg-cyan-400/10 dark:text-cyan-300">
        {icons[type]}
      </span>
      <span className="text-xs font-semibold text-[#030303]/60 dark:text-slate-300/60">
        {type[0].toUpperCase() + type.slice(1)}
      </span>
    </div>
  );
}

export function CreativeCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode, ghostType, setGhostType, placeGhostNode } = useCanvasStore();
  const { theme } = useTheme();
  const { getNodes, screenToFlowPosition } = useReactFlow();
  const { x: viewX, y: viewY, zoom } = useViewport();
  const nodeTypes = useMemo<NodeTypes>(() => ({ creative: AnnotatedCustomNode }), []);
  const edgeReconnecting = useRef(false);
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const isDark = theme === "dark";
  const edgeColor = isDark ? "#22d3ee" : "#404040";
  const dotColor  = isDark ? "#243446" : "#d0d0d0";
  const bgColor   = isDark ? "#091019" : "#f5f5f5";
  const nodeColor = isDark ? "#0e7490" : "#404040";
  const maskColor = isDark ? "rgba(3,10,18,.72)" : "rgba(245,245,245,.65)";

  /* Track mouse for ghost */
  useEffect(() => {
    if (!ghostType) return;
    const onMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [ghostType]);

  /* Right-click = cancel ghost */
  useEffect(() => {
    if (!ghostType) return;
    const onCtx = (e: MouseEvent) => { e.preventDefault(); setGhostType(null); };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [ghostType, setGhostType]);

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
    const allNodes = getNodes(), guides: AlignGuide[] = [], nx = draggedNode.position.x, ny = draggedNode.position.y;
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
    if (ghostType) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      placeGhostNode(flowPos);
    } else {
      setSelectedNode(null);
    }
  }, [ghostType, screenToFlowPosition, placeGhostNode, setSelectedNode]);

  return (
    <div className={`relative h-full flex-1 ${ghostType ? "cursor-crosshair" : ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => { if (!ghostType) setSelectedNode(node.id); }}
        onPaneClick={handlePaneClick}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        selectionKeyCode="Control"
        multiSelectionKeyCode="Control"
        defaultEdgeOptions={{ animated: true, style: { stroke: edgeColor } }}
        reconnectRadius={20}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
      >
        <Background gap={24} size={1} color={dotColor} style={{ background: bgColor }} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={nodeColor} maskColor={maskColor} />
      </ReactFlow>

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
    </div>
  );
}
