import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPage } from "@/features/auth/components/AuthPage";
import { sessionFromHeaders } from "@/server/auth/auth";

export default async function LoginPage() {
  if (await sessionFromHeaders(await headers())) redirect("/workspace");
  return <AuthPage mode="login" />;
}
