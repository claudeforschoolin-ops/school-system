"use client";
/**
 * التبويب المالي في ملف الطالب: فواتيره وأرصدته، رابط كشف الأسرة والتحصيل، والخصومات الممنوحة
 * (منح خصم يتطلب اعتماد المدير فوق حده، وإلغاؤه).
 */
import { Banknote, FilePlus2, Percent, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISCOUNT_KIND, INVOICE_STATUS } from "@/lib/finance/labels";
import { formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { Figure, FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney, docNo } from "./common";
import { NewInvoiceDialog } from "./new-invoice-dialog";

const SD_STATUS = {
  ACTIVE: { label: "سارٍ", color: "green" },
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  REJECTED: { label: "مرفوض", color: "red" },
  REVOKED: { label: "ملغى", color: "slate" },
} as const;

export function StudentFinanceTab({
  student,
}: {
  student: {
    id: string;
    fullName: string;
    academicNumber: string;
    grade?: { name: string } | null;
    section?: { name: string } | null;
  };
}) {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const router = useRouter();
  const invoices = trpc.finance.invoices.forStudent.useQuery({ studentId: student.id });
  const family = trpc.finance.receipts.family.useQuery({ studentId: student.id }, { retry: false });
  const discounts = trpc.finance.setup.studentDiscounts.useQuery({ studentId: student.id }, { retry: false });
  const utils = trpc.useUtils();
  const [newInvoice, setNewInvoice] = useState(false);
  const [granting, setGranting] = useState(false);
  const revoke = trpc.finance.setup.revokeDiscount.useMutation({
    onSuccess: () => (
      toast.success("أُلغي الخصم للفواتير القادمة"),
      void utils.finance.setup.studentDiscounts.invalidate()
    ),
    onError: (e) => toast.error(e.message),
  });
  if (invoices.error)
    return (
      <EmptyState
        compact
        illustration="lock"
        title="لا يمكن عرض البيانات المالية"
        description={invoices.error.message}
      />
    );
  if (!invoices.data) return <SkeletonLines lines={8} />;
  const rows = invoices.data;
  const due = rows.reduce((s, r) => s + r.balanceMinor, 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + r.balanceMinor, 0);
  const total = rows.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + r.totalMinor, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {can("collections", "create") && family.data ? (
          <Link href={`/finance/collect?guardian=${family.data.guardian.id}`}>
            <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />}>
              تحصيل
            </Button>
          </Link>
        ) : null}
        {can("invoices", "create") ? (
          <Button size="sm" icon={<FilePlus2 className="size-3.5" />} onClick={() => setNewInvoice(true)}>
            فاتورة
          </Button>
        ) : null}
        {can("invoices", "update") ? (
          <Button size="sm" icon={<Percent className="size-3.5" />} onClick={() => setGranting(true)}>
            منح خصم
          </Button>
        ) : null}
        <span className="flex-1" />
        {family.data ? (
          <Link
            href={`/finance/families/${family.data.guardian.id}`}
            className="text-[13px] text-fg-2 underline decoration-line underline-offset-4"
          >
            كشف حساب الأسرة ({family.data.guardian.name})
          </Link>
        ) : null}
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="إجمالي الفواتير" value={money.fmt(total)} />
        <Figure label="المستحق" value={money.fmt(due)} />
        <Figure label="المتأخر" value={money.fmt(overdue)} tone={overdue ? "danger" : undefined} />
        <Figure
          label="رصيد دائن للأسرة"
          value={money.fmt(family.data?.creditBalance ?? 0)}
          tone={family.data?.creditBalance ? "success" : undefined}
        />
      </section>
      {rows.length ? (
        <FinTable
          dense
          head={
            <tr>
              <th>الفاتورة</th>
              <th>الإصدار</th>
              <th>الاستحقاق</th>
              <th>الحالة</th>
              <th className={num}>الإجمالي</th>
              <th className={num}>المتبقي</th>
            </tr>
          }
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/finance/invoices/${r.id}`} className="tabular hover:underline">
                  {docNo(r.number, prefs.digits)}
                </Link>
              </td>
              <td className="whitespace-nowrap">{fmtDate(r.issueDate)}</td>
              <td className="whitespace-nowrap">{fmtDate(r.dueDate)}</td>
              <td>
                <Tag size="sm" color={INVOICE_STATUS[r.status].color}>
                  {INVOICE_STATUS[r.status].label}
                </Tag>
              </td>
              <td className={num}>{money.fmt(r.totalMinor, false)}</td>
              <td className={num}>{r.balanceMinor ? money.fmt(r.balanceMinor, false) : "—"}</td>
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState compact illustration="table" title="لا فواتير للطالب" />
      )}
      {discounts.error ? null : (
        <section>
          <h3 className="mb-2 text-[14px] font-semibold">الخصومات والمنح</h3>
          {discounts.data?.length ? (
            <ul className="divide-y divide-line/70 rounded-lg bg-card shadow-card">
              {discounts.data.map((d) => {
                const st = SD_STATUS[d.status as keyof typeof SD_STATUS] ?? SD_STATUS.ACTIVE;
                const val = d.valueOverride ?? d.type?.value ?? 0;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1">
                      {d.type?.name ?? "—"}{" "}
                      {d.type ? (
                        <Tag size="sm" color={DISCOUNT_KIND[d.type.kind].color}>
                          {d.type.method === "PERCENT"
                            ? formatPercent(val / 10000, prefs.digits)
                            : money.fmt(val)}
                        </Tag>
                      ) : null}
                      {d.note ? <span className="block text-[12px] text-fg-3">{d.note}</span> : null}
                    </span>
                    <Tag size="sm" color={st.color}>
                      {st.label}
                    </Tag>
                    {can("invoices", "update") && (d.status === "ACTIVE" || d.status === "PENDING") ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="إلغاء الخصم"
                        onClick={() => revoke.mutate({ id: d.id })}
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-3">لا خصومات ممنوحة. خصم الأشقاء يُطبق تلقائياً عند الفوترة.</p>
          )}
        </section>
      )}
      {newInvoice ? (
        <NewInvoiceDialog
          prefill={{ student }}
          onClose={() => setNewInvoice(false)}
          onCreated={(id) => {
            setNewInvoice(false);
            router.push(`/finance/invoices/${id}`);
          }}
        />
      ) : null}
      {granting ? <GrantDialog studentId={student.id} onClose={() => setGranting(false)} /> : null}
    </div>
  );
}

function GrantDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const setup = trpc.finance.setup.get.useQuery();
  const utils = trpc.useUtils();
  const [typeId, setTypeId] = useState<string | undefined>();
  const [override, setOverride] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const m = trpc.finance.setup.grantDiscount.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.status === "PENDING" ? "أُرسل الخصم لاعتماد المدير" : "مُنح الخصم ويُطبق على الفواتير القادمة",
      );
      void utils.finance.setup.studentDiscounts.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const types = (setup.data?.discountTypes ?? []).filter((t) => t.isActive && t.kind !== "SIBLING");
  const type = types.find((t) => t.id === typeId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="منح خصم"
        description="يُطبق على الفواتير التي تصدر بعد المنح. ما تجاوز حد الاعتماد يُرسل لمدير المدرسة."
      >
        <div className="space-y-3 px-5 pb-4">
          <Field label="نوع الخصم">
            <Select
              value={typeId}
              onChange={(v) => (setTypeId(v), setOverride(null))}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
          {type ? (
            <Field
              label={
                type.method === "PERCENT"
                  ? "النسبة ٪ (اتركها للقيمة الافتراضية)"
                  : "المبلغ (اتركه للقيمة الافتراضية)"
              }
            >
              {type.method === "PERCENT" ? (
                <PercentInput bp={override ?? type.value} onChange={setOverride} />
              ) : (
                <MoneyInput value={override ?? type.value} onChange={setOverride} />
              )}
            </Field>
          ) : null}
          <Field label="ملاحظة / المسوّغ">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: منحة تفوق للعام الحالي"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!typeId}
            onClick={() =>
              m.mutate({ studentId, discountTypeId: typeId!, valueOverride: override, note: note || null })
            }
          >
            منح
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
