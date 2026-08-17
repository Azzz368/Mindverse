import { SkillEditor } from "@/features/skills/components/SkillEditor";
import { sessionFromHeaders } from "@/server/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function NewSkillPage() {
  if (!await sessionFromHeaders(await headers())) redirect("/login?next=/skills/new");
  return <SkillEditor />;
}
