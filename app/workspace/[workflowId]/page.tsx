import { Workspace } from "@/components/canvas/Workspace";

export default async function WorkflowCanvasPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <Workspace workflowId={workflowId} />;
}
