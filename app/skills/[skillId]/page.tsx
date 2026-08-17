import { SkillEditor } from "@/features/skills/components/SkillEditor";
import { sessionFromHeaders } from "@/server/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function EditSkillPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = await params;
  if (!await sessionFromHeaders(await headers())) redirect(`/login?next=${encodeURIComponent(`/skills/${skillId}`)}`);
  return <SkillEditor skillId={skillId} />;
}
