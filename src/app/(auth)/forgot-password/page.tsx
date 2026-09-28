"use client";
import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AuthCard, FormError } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const request = trpc.auth.requestPasswordReset.useMutation({ onError: (e) => setError(e.message) });
  return (
    <AuthCard title="استعادة كلمة المرور" subtitle="أدخل بريدك وسنرسل رابطاً لتعيين كلمة مرور جديدة." footer={<Link href="/login" className="hover:text-fg">العودة إلى تسجيل الدخول</Link>}>
      <FormError message={error} />
      {request.isSuccess ? (
        <div className="flex flex-col items-center py-2 text-center">
          <MailCheck className="size-8 text-teal-700" strokeWidth={1.5} />
          <p className="mt-3 text-[14px] leading-6 text-fg-2">إن كان البريد مسجلاً فستصلك رسالة خلال دقائق. الرابط صالح لمدة ساعة.</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            request.mutate({ email });
          }}
        >
          <Field label="البريد الإلكتروني">
            <Input type="email" dir="ltr" className="text-start" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={request.isPending}>
            إرسال الرابط
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
