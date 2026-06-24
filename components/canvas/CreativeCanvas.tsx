"use client";
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, useViewport, type Connection, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useRef, useState } from "react";
import { AnnotatedCustomNode } from "./AnnotatedCustomNode";
import { useCanvasStore } from "@/store/canvasStore";
import { useTheme } from "@/components/ThemeProvider";
import type { WorkflowEdge } from "@/types/canvas";

type AlignGuide = { type: "v" | "h"; pos: number };
const SNAP_THRESHOLD = 10;

export function CreativeCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode } = useCanvasStore();
  const { theme } = useTheme();
  const { getNodes } = useReactFlow();
  const { x: viewX, y: viewY, zoom } = useViewport();
  const nodeTypes = useMemo<NodeTypes>(() => ({ creative: AnnotatedCustomNode }), []);
  const edgeReconnecting = useRef(false);
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);

  const isDark = theme === "dark";
  const edgeColor  = isDark ? "#22d3ee" : "#404040";
  const dotColor   = isDark ? "#243446" : "#d0d0d0";
  const bgColor    = isDark ? "#091019" : "#f5f5f5";
  const nodeColor  = isDark ? "#0e7490" : "#404040";
  const maskColor  = isDark ? "rgba(3,10,18,.72)" : "rgba(245,245,245,.65)";

  /* ── Feature 2: drag edge endpoint to disconnect ─────────────────── */
  const handleReconnectStart = useCallback(() => {
    edgeReconnecting.current = false;
  }, []);

  const handleReconnect = useCallback((oldEdge: WorkflowEdge, newConnection: Connection) => {
    edgeReconnecting.current = true;
    onEdgesChange([{ type: "remove", id: oldEdge.id }]);
    onConnect(newConnection);
  }, [onEdgesChange, onConnect]);

  const handleReconnectEnd = useCallback((_: MouseEvent | TouchEvent, edge: WorkflowEdge) => {
    if (!edgeReconnecting.current) {
      onEdgesChange([{ type: "remove", id: edge.id }]);
    }
  }, [onEdgesChange]);

  /* ── Feature 4: alignment snap guides ───────────────────────────── */
  const handleNodeDrag = useCallback((_: React.MouseEvent, draggedNode: { id: string; position: { x: number; y: number } }) => {
    const allNodes = getNodes();
    const guides: AlignGuide[] = [];
    const nx = draggedNode.position.x;
    const ny = draggedNode.position.y;
    for (const other of allNodes) {
      if (other.id === draggedNode.id) continue;
      if (Math.abs(nx - other.position.x) < SNAP_THRESHOLD) guides.push({ type: "v", pos: other.position.x });
      if (Math.abs(ny - other.position.y) < SNAP_THRESHOLD) guides.push({ type: "h", pos: other.position.y });
    }
    setAlignGuides(guides);
  }, [getNodes]);

  const handleNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: { id: string; position: { x: number; y: number } }) => {
    setAlignGuides([]);
    const allNodes = getNodes();
    let newX = draggedNode.position.x;
    let newY = draggedNode.position.y;
    for (const other of allNodes) {
      if (other.id === draggedNode.id) continue;
      if (Math.abs(newX - other.position.x) < SNAP_THRESHOLD) newX = other.position.x;
      if (Math.abs(newY - other.position.y) < SNAP_THRESHOLD) newY = other.position.y;
    }
    if (newX !== draggedNode.position.x || newY !== draggedNode.position.y) {
      onNodesChange([{ type: "position", id: draggedNode.id, position: { x: newX, y: newY }, dragging: false }]);
    }
  }, [getNodes, onNodesChange]);

  return (
    <div className="relative h-full flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        /* Feature 1: Ctrl+drag = box select, Ctrl+click = multi-select */
        selectionKeyCode="Control"
        multiSelectionKeyCode="Control"
        defaultEdgeOptions={{ animated: true, style: { stroke: edgeColor } }}
        /* Feature 2: drag edge handle to reconnect / disconnect */
        reconnectRadius={20}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        /* Feature 4: alignment snap */
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
      >
        <Background gap={24} size={1} color={dotColor} style={{ background: bgColor }} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={nodeColor} maskColor={maskColor} />
      </ReactFlow>

      {/* Alignment guide lines overlay */}
      {alignGuides.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {alignGuides.map((g, i) =>
            g.type === "v" ? (
              <div
                key={i}
                className="absolute bottom-0 top-0 w-px bg-blue-500/70 dark:bg-cyan-400/70"
                style={{ left: g.pos * zoom + viewX }}
              />
            ) : (
              <div
                key={i}
                className="absolute left-0 right-0 h-px bg-blue-500/70 dark:bg-cyan-400/70"
                style={{ top: g.pos * zoom + viewY }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
