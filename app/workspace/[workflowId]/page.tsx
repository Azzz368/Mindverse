import { Workspace } from "@/features/canvas/components/Workspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionFromHeaders } from "@/server/auth/auth";
import { getWorkflow } from "@/server/storage/workflowStorage";

export default async function WorkflowCanvasPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  const session = await sessionFromHeaders(await headers());
  if (!session) redirect("/login");
  if (!await getWorkflow(session.workspaceId, workflowId)) redirect("/workspace");
  return <Workspace workflowId={workflowId} workspaceId={session.workspaceId} />;
}
