import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";

export const metadata: Metadata = { title: "تفعيل المصادقة الثنائية" };

export default async function SetupTwoFactorPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.requires2faChallenge) redirect("/two-factor");
  if (session.user.twoFactorEnabled) redirect("/home");
  return <TwoFactorSetup required={session.requires2faSetup} />;
}
