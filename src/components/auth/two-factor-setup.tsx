"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { AuthCard, FormError } from "./auth-card";

/** إعداد المصادقة الثنائية (إلزامي للأدوار الحساسة) — يُستخدم في صفحة مستقلة وفي إعدادات الأمان */
export function TwoFactorSetupPanel({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const begin = trpc.account.twoFactorBegin.useMutation({ onError: (e) => setError(e.message) });
  const confirm = trpc.account.twoFactorConfirm.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: (r) => setBackupCodes(r.backupCodes),
  });
  const beginMutate = begin.mutate;
  useEffect(() => {
    beginMutate();
  }, [beginMutate]);

  if (backupCodes) {
    return (
      <div>
        <p className="text-[14px] leading-6 text-fg-2">تم تفعيل المصادقة الثنائية. احفظ رموز الاسترداد التالية في مكان آمن؛ كل رمز يُستخدم مرة واحدة فقط.</p>
        <div dir="ltr" className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-sidebar p-3 font-mono text-[14px] tabular">
          {backupCodes.map((c) => (
            <span key={c} className="text-center">
              {c}
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(backupCodes.join("\n"));
              toast.success("نُسخت الرموز");
            }}
          >
            نسخ
          </Button>
          <Button variant="primary" className="flex-1 justify-center" onClick={onDone}>
            حفظتها، متابعة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FormError message={error} />
      <ol className="space-y-1 text-[14px] leading-6 text-fg-2">
        <li>١. ثبّت تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator).</li>
        <li>٢. امسح الرمز التالي أو أدخل المفتاح يدوياً.</li>
        <li>٣. أدخل الرمز المكون من ٦ أرقام للتأكيد.</li>
      </ol>
      <div className="mt-4 flex flex-col items-center gap-3">
        {begin.data ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={begin.data.qrDataUrl} alt="رمز QR للمصادقة الثنائية" width={176} height={176} className="rounded-lg bg-white p-2 shadow-[var(--shadow-card)]" />
        ) : (
          <Skeleton className="size-44" />
        )}
        {begin.data ? (
          <code dir="ltr" className="select-all rounded bg-sidebar px-2 py-1 font-mono text-[12px] text-fg-2">
            {begin.data.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        ) : null}
      </div>
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          confirm.mutate({ code });
        }}
      >
        <Input
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          placeholder="000000"
          className="h-11 text-center text-[22px] tracking-[0.5em] tabular"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={confirm.isPending} disabled={code.length !== 6 || !begin.data}>
          تأكيد التفعيل
        </Button>
      </form>
    </div>
  );
}

export function TwoFactorSetup({ required }: { required: boolean }) {
  const router = useRouter();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => router.replace("/login") });
  return (
    <AuthCard
      title="تفعيل المصادقة الثنائية"
      subtitle={required ? "دورك في النظام يتطلب المصادقة الثنائية لحماية البيانات الحساسة." : "أضف طبقة حماية إضافية لحسابك."}
      footer={
        <button className="hover:text-fg" onClick={() => logout.mutate()}>
          تسجيل الخروج
        </button>
      }
    >
      <TwoFactorSetupPanel
        onDone={() => {
          router.replace("/home");
          router.refresh();
        }}
      />
    </AuthCard>
  );
}
