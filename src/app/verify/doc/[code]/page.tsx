import type { Metadata } from "next";
import { verifyDocument, DOC_KIND, DOC_STATUS } from "@/server/services/documents.service";

export const metadata: Metadata = { title: "التحقق من مستند موقّع" };
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(d) : "—");

/** صفحة عامة: التحقق من مستند موقّع إلكترونياً برمزه (لا تعرض نص المستند، بل حالته وموقّعيه وبصماته) */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const doc = await verifyDocument(decodeURIComponent(code));
  return (
    <main className="min-h-dvh bg-sidebar px-4 py-10">
      <div className="mx-auto w-full max-w-[600px] rounded-xl bg-card p-6 shadow-card">
        {doc ? (
          <>
            <p className={doc.status === "COMPLETED" ? "text-[13px] font-medium text-success-800" : "text-[13px] font-medium text-warning-700"}>{doc.status === "COMPLETED" ? "✓ مستند مكتمل التوقيع صادر من المنصة" : `حالة المستند: ${DOC_STATUS[doc.status as keyof typeof DOC_STATUS] ?? doc.status}`}</p>
            <h1 className="mt-2 text-[22px] font-bold">{doc.title}</h1>
            <p className="text-[14px] text-fg-3">{doc.school} · {DOC_KIND[doc.kind as keyof typeof DOC_KIND] ?? doc.kind} رقم {doc.number}</p>
            <dl className="mt-4 space-y-2 text-[14px]">
              <div className="flex justify-between gap-4 border-b border-line/60 pb-2"><dt className="text-fg-3">أُرسل للتوقيع</dt><dd>{fmt(doc.sentAt)}</dd></div>
              <div className="flex justify-between gap-4 border-b border-line/60 pb-2"><dt className="text-fg-3">اكتمل</dt><dd>{fmt(doc.completedAt)}</dd></div>
              <div className="border-b border-line/60 pb-2"><dt className="text-fg-3">بصمة المحتوى (SHA-256)</dt><dd dir="ltr" className="mt-1 break-all font-mono text-[11px]">{doc.contentHash}</dd></div>
            </dl>
            <h2 className="mt-5 text-[15px] font-semibold">الموقّعون</h2>
            <ul className="mt-2 space-y-2">
              {doc.signers.map((s, i) => (
                <li key={i} className="rounded-md border border-line p-3 text-[13px]">
                  <p className="font-medium">{s.name}{s.roleLabel ? <span className="text-fg-3"> — {s.roleLabel}</span> : null}</p>
                  <p className="text-fg-3">{s.status === "SIGNED" ? `وقّع ${fmt(s.signedAt)} (${s.method === "DRAW" ? "توقيع مرسوم" : "اسم مكتوب"})` : s.status === "DECLINED" ? "رفض التوقيع" : "لم يوقّع بعد"}</p>
                  {s.signatureHash ? <p dir="ltr" className="mt-1 break-all font-mono text-[11px] text-fg-3">{s.signatureHash}</p> : null}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-fg-3">قارن بصمة المحتوى بالمطبوعة على النسخة الورقية: أي اختلاف يعني أن النسخة معدّلة بعد الإرسال.</p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-danger-700">✗ لم يُعثر على مستند بهذا الرمز</p>
            <h1 className="mt-2 text-[20px] font-bold">رمز التحقق غير صحيح</h1>
          </>
        )}
      </div>
      <p className="mt-8 text-center text-[12px] text-fg-3">منصة — نظام إدارة المدارس المتكامل</p>
    </main>
  );
}
