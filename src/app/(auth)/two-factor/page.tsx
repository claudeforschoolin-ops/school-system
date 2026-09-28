import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { TwoFactorForm } from "@/components/auth/two-factor-form";

export const metadata: Metadata = { title: "التحقق بخطوتين" };

export default async function TwoFactorPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.requires2faChallenge) redirect("/home");
  return <TwoFactorForm demo={session.tenant.isDemo} />;
}
