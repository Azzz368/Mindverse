import { Workspace } from "@/features/canvas/components/Workspace";

export default async function WorkflowCanvasPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <Workspace workflowId={workflowId} />;
}
