import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getCurrentSession();
  if (session && !session.requires2faChallenge) redirect("/home");
  const { next } = await searchParams;
  return <LoginForm demo={process.env.DEMO_MODE === "true"} next={next?.startsWith("/") ? next : undefined} />;
}
