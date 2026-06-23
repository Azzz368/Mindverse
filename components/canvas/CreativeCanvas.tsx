"use client";
import { Background, Controls, MiniMap, ReactFlow, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { AnnotatedCustomNode } from "./AnnotatedCustomNode";
import { useCanvasStore } from "@/store/canvasStore";
export function CreativeCanvas() { const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode } = useCanvasStore(); const nodeTypes = useMemo<NodeTypes>(() => ({ creative: AnnotatedCustomNode }), []); return <div className="h-full flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNode(node.id)} onPaneClick={() => setSelectedNode(null)} fitView deleteKeyCode={["Backspace", "Delete"]} defaultEdgeOptions={{ animated: true, style: { stroke: "#22d3ee" } }}><Background gap={24} size={1} color="#243446"/><Controls showInteractive={false}/><MiniMap nodeColor="#0e7490" maskColor="rgba(3, 10, 18, .72)"/></ReactFlow></div>; }
