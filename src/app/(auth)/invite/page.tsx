import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "قبول الدعوة" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <SetPasswordForm token={token ?? ""} mode="invite" />;
}
