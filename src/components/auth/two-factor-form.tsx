"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard, FormError } from "./auth-card";

export function TwoFactorForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = trpc.auth.verifyTwoFactor.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => {
      router.replace(r.next);
      router.refresh();
    },
  });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => router.replace("/login") });

  return (
    <AuthCard
      title="التحقق بخطوتين"
      subtitle={backup ? "أدخل أحد رموز الاسترداد التي حفظتها عند تفعيل المصادقة." : "أدخل الرمز المكون من ٦ أرقام من تطبيق المصادقة."}
      footer={
        <button className="hover:text-fg" onClick={() => logout.mutate()}>
          تسجيل الدخول بحساب آخر
        </button>
      }
    >
      <FormError message={error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          verify.mutate({ code });
        }}
      >
        <Input
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={backup ? 12 : 6}
          className="h-11 text-center text-[22px] tracking-[0.4em] tabular"
          value={code}
          onChange={(e) => setCode(backup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={verify.isPending} disabled={code.length < 6}>
          تحقق
        </Button>
        <button type="button" className="w-full text-center text-[13px] text-fg-3 hover:text-fg" onClick={() => { setBackup(!backup); setCode(""); }}>
          {backup ? "استخدام تطبيق المصادقة" : "استخدام رمز استرداد"}
        </button>
      </form>
      {demo ? (
        <p className="mt-4 rounded-md bg-gold-50 px-3 py-2 text-[12px] leading-5 text-gold-700">
          بيانات تجريبية: شغّل <span dir="ltr" className="font-mono">npm run demo:totp</span> لعرض الرمز الحالي، أو استخدم رمز الاسترداد <span dir="ltr" className="font-mono">MANASSA1</span>.
        </p>
      ) : null}
    </AuthCard>
  );
}
