"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { AuthCard, FormError } from "./auth-card";

/** نموذج تعيين كلمة المرور: لاستعادة الحساب أو لقبول الدعوة */
export function SetPasswordForm({ token, mode }: { token: string; mode: "reset" | "invite" }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const info = trpc.auth.inspectToken.useQuery({ token, type: mode === "reset" ? "PASSWORD_RESET" : "INVITE" }, { retry: false, enabled: token.length > 10 });
  const reset = trpc.auth.resetPassword.useMutation({ onError: (e) => setError(e.message) });
  const accept = trpc.auth.acceptInvite.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => {
      router.replace(r.next);
      router.refresh();
    },
  });

  if (info.isLoading) return <AuthCard title="…"><SkeletonLines lines={4} /></AuthCard>;
  if (info.error || !token) {
    return (
      <AuthCard title="الرابط غير صالح" subtitle="انتهت صلاحية الرابط أو استُخدم مسبقاً." footer={<Link href="/login" className="hover:text-fg">العودة إلى تسجيل الدخول</Link>}>
        <Link href="/forgot-password" className="block text-center text-[14px] text-navy-700 hover:underline">طلب رابط جديد</Link>
      </AuthCard>
    );
  }
  if (reset.isSuccess) {
    return (
      <AuthCard title="تم تعيين كلمة المرور" subtitle="أُنهيت جميع الجلسات السابقة لحمايتك. يمكنك الدخول الآن بكلمة المرور الجديدة.">
        <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => router.replace("/login")}>
          تسجيل الدخول
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={mode === "invite" ? `مرحباً ${info.data?.name ?? ""}` : "كلمة مرور جديدة"}
      subtitle={mode === "invite" ? `دُعيت للانضمام إلى ${info.data?.schoolName}. عيّن كلمة المرور لتفعيل حسابك.` : `للحساب ${info.data?.email}`}
    >
      <FormError message={error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) return setError("كلمتا المرور غير متطابقتين");
          if (mode === "reset") reset.mutate({ token, password });
          else accept.mutate({ token, password });
        }}
      >
        <Field label="كلمة المرور" hint="١٠ أحرف على الأقل تتضمن حروفاً وأرقاماً.">
          <Input type="password" dir="ltr" className="text-start" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <Input type="password" dir="ltr" className="text-start" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={reset.isPending || accept.isPending}>
          {mode === "invite" ? "تفعيل الحساب" : "حفظ كلمة المرور"}
        </Button>
      </form>
    </AuthCard>
  );
}
