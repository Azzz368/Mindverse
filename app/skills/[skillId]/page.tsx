import { SkillEditor } from "@/features/skills/components/SkillEditor";

export default async function EditSkillPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = await params;
  return <SkillEditor skillId={skillId} />;
}
