import { SkillLibrary } from "@/features/skills/components/SkillLibrary";
import { sessionFromHeaders } from "@/server/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function SkillsPage() {
  if (!await sessionFromHeaders(await headers())) redirect("/login?next=/skills");
  return <SkillLibrary />;
}
