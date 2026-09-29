"use client";
/**
 * بطاقة التسوية المالية في طلب الانسحاب/النقل: المستحق على الطالب، والرسوم الدراسية غير المستهلكة
 * بعد تاريخ السريان (إشعار دائن تناسبي مقترح)، وإصدار التسوية بضغطة.
 */
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { docNo, useMoney } from "./common";

export function SettlementCard({
  studentId,
  effectiveDate,
  transferId,
}: {
  studentId: string;
  effectiveDate: string;
  transferId: string;
}) {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const utils = trpc.useUtils();
  const q = trpc.finance.invoices.settlement.useQuery({ studentId, effectiveDate }, { retry: false });
  const [confirm, setConfirm] = useState(false);
  const apply = trpc.finance.invoices.applySettlement.useMutation({
    onSuccess: (r) => {
      toast.success(`صدر ${r.count} إشعار دائن تناسبي بإجمالي ${money.fmt(r.total)}`);
      setConfirm(false);
      void utils.finance.invalidate();
      void utils.transfers.get.invalidate({ id: transferId });
    },
    onError: (e) => toast.error(e.message),
  });
  if (q.error) return null;
  return (
    <section className="rounded-lg bg-card p-4 shadow-card">
      <h3 className="mb-3 text-[14px] font-semibold">التسوية المالية</h3>
      {!q.data ? (
        <SkeletonLines lines={3} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
            <dt className="text-fg-3">المستحق حالياً</dt>
            <dd
              className={
                q.data.outstanding ? "text-end font-semibold tabular text-danger-700" : "text-end tabular"
              }
            >
              {money.fmt(q.data.outstanding)}
            </dd>
            <dt className="text-fg-3">رسوم غير مستهلكة</dt>
            <dd className="text-end tabular">{money.fmt(q.data.totalCredit)}</dd>
          </dl>
          {q.data.proposals.length ? (
            <ul className="mt-2 space-y-1 text-[12px] text-fg-2">
              {q.data.proposals.map((p, i) => (
                <li key={i}>
                  <Link href={`/finance/invoices/${p.invoiceId}`} className="hover:underline">
                    فاتورة {docNo(p.number, prefs.digits)}
                  </Link>
                  : {p.description} — {p.months} من {p.totalMonths} أشهر ({money.fmt(p.creditMinor)})
                </li>
              ))}
            </ul>
          ) : null}
          {q.data.alreadyProrated ? (
            <p className="mt-2 text-[12px] text-success-800">أُصدرت التسوية التناسبية.</p>
          ) : q.data.proposals.length && can("invoices", "update") ? (
            <Button size="sm" className="mt-3 w-full justify-center" onClick={() => setConfirm(true)}>
              إصدار إشعار دائن تناسبي
            </Button>
          ) : null}
          <p className="mt-2 text-[12px] text-fg-3">
            خلو الطرف المالي يتطلب سداد المستحق (أو تسويته) قبل تنفيذ التحويل وإصدار الشهادة.
          </p>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="إصدار التسوية التناسبية؟"
            description={`يصدر إشعار دائن بـ${money.fmt(q.data.totalCredit)} يخفّض المستحق، والزائد عن الرصيد يصبح رصيداً دائناً للأسرة قابلاً للاسترداد.`}
            confirmLabel="إصدار"
            loading={apply.isPending}
            onConfirm={() => apply.mutate({ studentId, effectiveDate, transferId })}
          />
        </>
      )}
    </section>
  );
}
