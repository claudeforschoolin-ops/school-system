"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, KeyRound, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { AuthCard, FormError } from "./auth-card";

const DEMO_ACCOUNTS: Array<[string, string]> = [
  ["owner@demo.manassa.sa", "مالك النظام (تحقق بخطوتين)"],
  ["principal@demo.manassa.sa", "مديرة المدارس (تحقق بخطوتين)"],
  ["vp.academic@demo.manassa.sa", "وكيلة الشؤون الأكاديمية"],
  ["teacher@demo.manassa.sa", "معلم"],
  ["accountant@demo.manassa.sa", "محاسب (تحقق بخطوتين)"],
  ["hr@demo.manassa.sa", "موظف موارد بشرية"],
];

export function LoginForm({ demo, next }: { demo: boolean; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenants, setTenants] = useState<Array<{ slug: string; name: string }> | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onDone = (target: string) => {
    router.replace(target === "/home" && next ? next : target);
    router.refresh();
  };

  const login = trpc.auth.login.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => {
      if (r.status === "choose_tenant") setTenants(r.tenants);
      else onDone(r.next);
    },
  });
  const requestOtp = trpc.auth.requestOtp.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => setChallengeId(r.challengeId),
  });
  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => (r.status === "ok" ? onDone(r.next) : setTenants(r.tenants)),
  });

  const submitPassword = (tenantSlug?: string) => {
    setError(null);
    login.mutate({ email, password, tenantSlug: tenantSlug ?? null });
  };

  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="مرحباً بعودتك. سجّل الدخول للمتابعة إلى مساحة مدرستك."
      footer={
        <>
          ليس لديك حساب؟ تُنشأ الحسابات بدعوة من إدارة المدرسة.
        </>
      }
    >
      <FormError message={error} />
      {tenants ? (
        <div>
          <p className="mb-3 text-[14px] text-fg-2">هذا البريد مسجل في أكثر من مدرسة. اختر المدرسة:</p>
          <div className="space-y-1.5">
            {tenants.map((t) => (
              <button
                key={t.slug}
                onClick={() => (mode === "password" ? submitPassword(t.slug) : null)}
                className="flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-start text-[14px] shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-hover"
              >
                <Building2 className="size-4 text-fg-3" />
                {t.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Segmented
            className="mb-5 w-full [&>button]:flex-1 [&>button]:justify-center"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
              setChallengeId(null);
            }}
            options={[
              { value: "password", label: "كلمة المرور", icon: <KeyRound className="size-3.5" /> },
              { value: "otp", label: "رمز لمرة واحدة", icon: <Mail className="size-3.5" /> },
            ]}
          />
          {mode === "password" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitPassword();
              }}
            >
              <Field label="البريد الإلكتروني">
                <Input type="email" dir="ltr" className="text-start" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.sa" autoFocus />
              </Field>
              <Field label="كلمة المرور">
                <Input type="password" dir="ltr" className="text-start" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-[13px] text-fg-3 hover:text-fg">
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={login.isPending}>
                دخول
              </Button>
            </form>
          ) : !challengeId ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                requestOtp.mutate({ identifier: email });
              }}
            >
              <Field label="البريد الإلكتروني أو رقم الجوال" hint="سنرسل إليك رمزاً مكوناً من ٦ أرقام صالحاً لمدة ١٠ دقائق.">
                <Input dir="ltr" className="text-start" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.sa أو ‎+9665…" autoFocus />
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={requestOtp.isPending}>
                إرسال الرمز
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                verifyOtp.mutate({ challengeId, code });
              }}
            >
              <p className="text-[13px] leading-6 text-fg-3">إن كان الحساب موجوداً فقد أرسلنا الرمز. أدخله هنا:</p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                className="h-11 text-center text-[22px] tracking-[0.5em] tabular"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
              <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={verifyOtp.isPending} disabled={code.length !== 6}>
                تحقق ودخول
              </Button>
              <button type="button" className="w-full text-center text-[13px] text-fg-3 hover:text-fg" onClick={() => setChallengeId(null)}>
                تغيير البريد أو إعادة الإرسال
              </button>
            </form>
          )}
        </>
      )}

      {demo ? (
        <div className="mt-6 rounded-lg bg-gold-50 p-3">
          <p className="text-[12px] font-medium text-gold-700">بيانات تجريبية — كلمة المرور لكل الحسابات: <span dir="ltr" className="font-mono">Manassa@2026</span></p>
          <div className="mt-2 grid grid-cols-1 gap-1">
            {DEMO_ACCOUNTS.map(([addr, label]) => (
              <button
                key={addr}
                type="button"
                className="flex items-center justify-between rounded px-1.5 py-1 text-start text-[12px] text-fg-2 transition-colors hover:bg-white/60 dark:hover:bg-white/5"
                onClick={() => {
                  setMode("password");
                  setEmail(addr);
                  setPassword("Manassa@2026");
                }}
              >
                <span>{label}</span>
                <span dir="ltr" className="font-mono text-[11px] text-fg-3">
                  {addr.split("@")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </AuthCard>
  );
}
