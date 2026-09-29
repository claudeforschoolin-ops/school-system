import type { Metadata } from "next";
import { bpToPercentString } from "@/lib/assessment/calc";
import { verifyReportCard, RESULT_LABEL } from "@/server/services/assessment/results.service";

export const metadata: Metadata = { title: "التحقق من شهادة" };
export const dynamic = "force-dynamic";

/** صفحة عامة: التحقق من صحة شهادة برمزها (دون تسجيل دخول، وبأقل قدر من البيانات) */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const card = await verifyReportCard(decodeURIComponent(code).toUpperCase());
  return (
    <main className="min-h-dvh bg-sidebar px-4 py-10">
      <div className="mx-auto w-full max-w-[520px] rounded-xl bg-card p-6 shadow-card">
        {card?.isDemo ? <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-center text-[13px] font-medium text-warning-700">بيانات تجريبية — ليست شهادة حقيقية</p> : null}
        {card ? (
          <>
            <p className="text-[13px] font-medium text-success-800">✓ شهادة صحيحة صادرة من المنصة</p>
            <h1 className="mt-2 text-[22px] font-bold">{card.school}</h1>
            <dl className="mt-4 space-y-2 text-[15px]">
              {[
                ["الطالب", card.student],
                ["الصف / الفصل", card.grade],
                ["الفصل الدراسي", card.term],
                ["المعدل", card.averageBp === null ? "—" : `${bpToPercentString(card.averageBp)}٪`],
                ["النتيجة", RESULT_LABEL[card.result]],
                ["عدد المواد", String(card.subjects)],
                ["تاريخ الإصدار", card.issuedAt.toISOString().slice(0, 10)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-2">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12px] text-fg-3">تطابق هذه البيانات لقطة الشهادة وقت إصدارها. أي اختلاف في النسخة المطبوعة يعني أنها معدّلة.</p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-danger-700">✗ لم يُعثر على شهادة بهذا الرمز</p>
            <h1 className="mt-2 text-[20px] font-bold">رمز التحقق غير صحيح</h1>
            <p className="mt-2 text-[14px] text-fg-3">تأكد من الرمز المطبوع أسفل الشهادة (١٠ أحرف وأرقام لاتينية).</p>
          </>
        )}
      </div>
      <p className="mt-8 text-center text-[12px] text-fg-3">منصة — نظام إدارة المدارس المتكامل</p>
    </main>
  );
}
