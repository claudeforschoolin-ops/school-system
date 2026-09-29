"use client";
/**
 * كشف حساب الأسرة: الأبناء، الأرصدة، الحركة التراكمية (قابلة للطباعة)، الفواتير والسندات،
 * واستخدام الرصيد الدائن وطلب الاسترداد (بموافقة المدير) وصرفه.
 */
import { Banknote, HandCoins, Printer, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { INVOICE_STATUS, PAYMENT_METHOD, REFUND_STATUS, type PaymentMethodKey } from "@/lib/finance/labels";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { Figure, FinTable, financeNav, INVOICE_TABS, labelOf, MoneyInput, num, useFmtDate, useMoney, useToday, docNo } from "./common";

export function FamiliesIndex() {
  const money = useMoney();
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const res = trpc.finance.receipts.search.useQuery({ q }, { enabled: q.trim().length >= 2 });
  const families = new Map<string, { id: string; name: string; phone: string | null; due: number; students: string[] }>();
  for (const r of res.data ?? []) {
    if (!r.guardian) continue;
    const f = families.get(r.guardian.id) ?? { id: r.guardian.id, name: r.guardian.name, phone: r.guardian.phone, due: r.familyDue, students: [] };
    f.students.push(r.fullName);
    families.set(r.guardian.id, f);
  }
  return (
    <ModuleShell nav={financeNav("invoices")} tabs={INVOICE_TABS}>
      <div className="relative mx-auto max-w-2xl">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
        <Input autoFocus className="h-10 ps-9" placeholder="ابحث باسم الطالب أو ولي الأمر أو الجوال أو الرقم الأكاديمي" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث عن أسرة" />
      </div>
      <div className="mx-auto mt-4 max-w-2xl">
        {q.trim().length < 2 ? (
          <EmptyState compact illustration="search" title="كشف حساب أسرة" description="يجمع فواتير الأبناء كلهم وسنداتهم والرصيد الدائن في كشف واحد قابل للطباعة." />
        ) : !res.data ? (
          <SkeletonLines lines={4} />
        ) : families.size ? (
          <ul className="overflow-hidden rounded-lg bg-card shadow-card">
            {[...families.values()].map((f) => (
              <li key={f.id}>
                <Link href={`/finance/families/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                  <Avatar name={f.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{f.name}</span>
                    <span className="block truncate text-[12px] text-fg-3">{f.students.join("، ")}</span>
                  </span>
                  <span className="text-[14px] font-semibold tabular">{money.fmt(f.due)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact illustration="search" title="لا نتائج" />
        )}
      </div>
    </ModuleShell>
  );
}

export function FamilyStatement({ guardianId }: { guardianId: string }) {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const { tenant } = useApp();
  const q = trpc.finance.receipts.family.useQuery({ guardianId });
  const refunds = trpc.finance.receipts.refunds.useQuery({ guardianId });
  const utils = trpc.useUtils();
  const [refundOpen, setRefundOpen] = useState(false);
  const onError = (e: { message: string }) => toast.error(e.message);
  const apply = trpc.finance.receipts.applyCredit.useMutation({ onSuccess: (r) => (toast.success(`سُوّي ${money.fmt(r.used)} على الفواتير`), void utils.finance.invalidate()), onError });
  const today = useToday();
  const pay = trpc.finance.receipts.payRefund.useMutation({ onSuccess: () => (toast.success("صُرف الاسترداد وقُيّد"), void utils.finance.invalidate()), onError });
  const f = q.data;
  const nav = financeNav("invoices");
  if (q.error) {
    return (
      <ModuleShell nav={nav} title="كشف حساب">
        <EmptyState illustration="lock" title="لا يمكن عرض كشف الحساب" description={q.error.message} />
      </ModuleShell>
    );
  }
  const title = f ? `كشف حساب ${f.guardian.name}` : "كشف حساب";
  return (
    <ModuleShell
      nav={nav}
      title={title}
      crumbs={[{ title: "كشوف حساب الأسر", href: "/finance/families" }, ...(f ? [{ title: f.guardian.name }] : [])]}
      wide
      actions={
        f ? (
          <>
            <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
              طباعة الكشف
            </Button>
            {can("collections", "create") ? (
              <Link href={`/finance/collect?guardian=${guardianId}`}>
                <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />}>
                  سند قبض
                </Button>
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {!f ? (
        <SkeletonLines lines={14} />
      ) : (
        <>
          <header className="mb-5 flex flex-wrap items-center gap-4">
            <Avatar name={f.guardian.name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="hidden text-[13px] text-fg-3 print:block">{tenant.name}</p>
              <h1 className="text-[24px] font-bold">{f.guardian.name}</h1>
              <p className="text-[13px] text-fg-3">
                {f.guardian.phone ? (
                  <bdi dir="ltr" className="tabular">
                    {f.guardian.phone}
                  </bdi>
                ) : null}
                {f.guardian.email ? ` · ${f.guardian.email}` : ""} · حتى {fmtDate(today, "long")}
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {f.students.map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`} className="flex items-center gap-2 rounded-full bg-hover px-2.5 py-1 text-[13px] hover:bg-active">
                    <Avatar name={s.fullName} size={18} src={s.photoUrl ?? undefined} />
                    {s.fullName.split(" ").slice(0, 2).join(" ")}
                    <span className="text-fg-3">{s.grade.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </header>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Figure label="إجمالي الفواتير" value={money.fmt(f.totals.invoiced)} />
            <Figure label="المدفوع" value={money.fmt(f.totals.paid)} />
            <Figure label="إشعارات دائنة" value={money.fmt(f.totals.credited)} />
            <Figure label="المستحق" value={money.fmt(f.totals.due)} />
            <Figure label="المتأخر" value={money.fmt(f.totals.overdue)} tone={f.totals.overdue ? "danger" : undefined} />
            <Figure
              label="رصيد دائن"
              value={money.fmt(f.creditBalance)}
              tone={f.creditBalance ? "success" : undefined}
              hint={
                f.creditBalance > 0 && can("collections", "update") ? (
                  <span className="no-print flex gap-2">
                    {f.openInvoices.length ? (
                      <button className="underline" disabled={apply.isPending} onClick={() => apply.mutate({ guardianId })}>
                        تسويته
                      </button>
                    ) : null}
                    <button className="underline" onClick={() => setRefundOpen(true)}>
                      استرداد
                    </button>
                  </span>
                ) : undefined
              }
            />
          </section>

          <h2 className="mb-2 text-[15px] font-semibold">الحركة</h2>
          {f.statement.length ? (
            <FinTable
              dense
              head={
                <tr>
                  <th>التاريخ</th>
                  <th>المستند</th>
                  <th>البيان</th>
                  <th className={num}>مدين</th>
                  <th className={num}>دائن</th>
                  <th className={num}>الرصيد</th>
                </tr>
              }
              foot={
                <tr>
                  <td colSpan={3}>الرصيد الختامي</td>
                  <td className={num}>{money.cell(f.statement.reduce((s, m) => s + m.debit, 0))}</td>
                  <td className={num}>{money.cell(f.statement.reduce((s, m) => s + m.credit, 0))}</td>
                  <td className={num}>{money.fmt(f.statement.at(-1)?.balance ?? 0, false)}</td>
                </tr>
              }
            >
              {f.statement.map((m, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{fmtDate(m.date)}</td>
                  <td className="whitespace-nowrap">{m.link ? <Link href={m.link} className="hover:underline">{m.ref.replace(/\d+/g, (d) => docNo(Number(d), prefs.digits))}</Link> : m.ref}</td>
                  <td className="text-fg-2">{m.description}</td>
                  <td className={num}>{money.cell(m.debit)}</td>
                  <td className={num}>{money.cell(m.credit)}</td>
                  <td className={cn(num, "font-medium", m.balance < 0 && "text-success-800")}>{money.fmt(m.balance, false)}</td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <EmptyState compact illustration="table" title="لا حركة على حساب الأسرة بعد" />
          )}
          <p className="mt-1 text-[12px] text-fg-3">الرصيد السالب رصيد دائن لصالح الأسرة.</p>

          <div className="no-print mt-6 grid gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">الفواتير</h2>
              <FinTable
                dense
                head={
                  <tr>
                    <th>الرقم</th>
                    <th>الطالب</th>
                    <th>الحالة</th>
                    <th className={num}>الإجمالي</th>
                    <th className={num}>المتبقي</th>
                  </tr>
                }
              >
                {f.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/finance/invoices/${i.id}`} className="tabular hover:underline">
                        {docNo(i.number, prefs.digits)}
                      </Link>
                    </td>
                    <td>{i.student}</td>
                    <td>
                      <Tag size="sm" color={INVOICE_STATUS[i.status].color}>
                        {INVOICE_STATUS[i.status].label}
                      </Tag>
                    </td>
                    <td className={num}>{money.fmt(i.totalMinor, false)}</td>
                    <td className={num}>{money.cell(i.balanceMinor) || "—"}</td>
                  </tr>
                ))}
              </FinTable>
            </section>
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">السندات والاستردادات</h2>
              <FinTable
                dense
                head={
                  <tr>
                    <th>المستند</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                    <th className={num}>المبلغ</th>
                  </tr>
                }
              >
                {f.receipts.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/finance/receipts/${r.id}`} className="hover:underline">
                        سند {docNo(r.number, prefs.digits)}
                      </Link>{" "}
                      <span className="text-fg-3">{PAYMENT_METHOD[r.method].label}</span>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td>{r.status === "VOID" ? <Tag size="sm" color="red">ملغى</Tag> : r.chequeStatus === "BOUNCED" ? <Tag size="sm" color="red">مرتد</Tag> : <Tag size="sm" color="green">مرحّل</Tag>}</td>
                    <td className={num}>{money.fmt(r.amountMinor, false)}</td>
                  </tr>
                ))}
                {(refunds.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Undo2 className="me-1 inline size-3.5 text-fg-3" />
                      استرداد {docNo(r.number, prefs.digits)}
                      <span className="block text-[11px] text-fg-3">{r.reason}</span>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td>
                      <Tag size="sm" color={labelOf(REFUND_STATUS, r.status).color}>
                        {labelOf(REFUND_STATUS, r.status).label}
                      </Tag>
                      {r.status === "APPROVED" && can("collections", "update") ? (
                        <Button size="xs" variant="subtle" className="ms-1" loading={pay.isPending} onClick={() => pay.mutate({ id: r.id, date: today })}>
                          صرف
                        </Button>
                      ) : null}
                    </td>
                    <td className={num}>{money.fmt(r.amountMinor, false)}</td>
                  </tr>
                ))}
              </FinTable>
            </section>
          </div>
          {refundOpen ? <RefundDialog guardianId={guardianId} max={f.creditBalance} onClose={() => setRefundOpen(false)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

function RefundDialog({ guardianId, max, onClose }: { guardianId: string; max: number; onClose: () => void }) {
  const money = useMoney();
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState<number | null>(max);
  const [method, setMethod] = useState<PaymentMethodKey>("BANK_TRANSFER");
  const [reason, setReason] = useState("");
  const m = trpc.finance.receipts.requestRefund.useMutation({
    onSuccess: () => {
      toast.success("أُرسل طلب الاسترداد لاعتماد المدير");
      void utils.finance.receipts.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="طلب استرداد" description={`يُصرف من الرصيد الدائن (${money.fmt(max)}) بعد اعتماد مدير المدرسة.`}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="المبلغ" error={amount !== null && amount > max ? "أكبر من الرصيد الدائن" : null}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="طريقة الصرف">
            <Select value={method} onChange={(v) => setMethod(v as PaymentMethodKey)} options={(["BANK_TRANSFER", "CASH", "CHEQUE"] as const).map((k) => ({ value: k, label: PAYMENT_METHOD[k].label }))} />
          </Field>
          <Field label="السبب">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: انسحاب الطالب ورد الرصيد الزائد" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon={<HandCoins className="size-3.5" />} loading={m.isPending} disabled={!amount || amount > max || reason.trim().length < 3} onClick={() => m.mutate({ guardianId, amountMinor: amount!, method, reason })}>
            إرسال للاعتماد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

