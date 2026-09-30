import { headers } from "next/headers";
import { AuthCard } from "@/components/auth/auth-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { clientIpFrom } from "@/server/auth/network";

export default async function NetworkBlockedPage() {
  const ip = clientIpFrom(await headers());
  return (
    <AuthCard title="الدخول مقيّد بشبكة المدرسة" subtitle="حسابك من الأدوار التي تشترط الاتصال من شبكة المدرسة. اتصل من داخل المدرسة (أو عبر الشبكة الخاصة المعتمدة) ثم أعد المحاولة.">
      <p className="mb-4 rounded-md bg-hover px-3 py-2 text-center text-[13px] text-fg-2">
        عنوانك الحالي: <span dir="ltr" className="font-mono">{ip ?? "غير معروف"}</span>
      </p>
      <p className="mb-5 text-center text-[13px] leading-6 text-fg-3">إن كنت ترى أن هذا خطأ فتواصل مع مسؤول النظام لإضافة عنوان شبكتك إلى القائمة المسموحة.</p>
      <LogoutButton />
    </AuthCard>
  );
}
