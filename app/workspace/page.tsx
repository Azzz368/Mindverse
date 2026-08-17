import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WorkflowDashboard } from "@/features/workspace/components/WorkflowDashboard";
import { sessionFromHeaders } from "@/server/auth/auth";
import { listWorkflows } from "@/server/storage/workflowStorage";

export default async function WorkspacePage() {
  const session = await sessionFromHeaders(await headers());
  if (!session) redirect("/login");
  const output = await listWorkflows(session.workspaceId);
  return <WorkflowDashboard user={{ name: session.name, email: session.email }} workspace={{ name: session.workspaceName }} initialWorkflows={output.workflows} />;
}
