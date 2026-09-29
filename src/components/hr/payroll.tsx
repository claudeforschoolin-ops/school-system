"use client";
/**
 * الرواتب: المسيرات الشهرية ودورتها (مسودة ← اعتماد ← صرف)، تفاصيل المسير بكل البنود،
 * ملف حماية الأجور، قسيمة الراتب للطباعة، البنود المتغيرة، السلف، وإعدادات الرواتب.
 */
import { Banknote, Calculator, Download, HandCoins, Plus, Printer, RefreshCw, Send, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyDigits, formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { DocLink, docNo, FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { ADJ_KIND, hrNav, LOAN_STATUS, PAYROLL_TABS, RUN_STATUS, useMonthLabel } from "./common";
import { LoanDialog } from "./me";


export function PayrollPage() {
  const q = trpc.hr.payroll.runs.useQuery();
  const money = useMoney();
  const monthLabel = useMonthLabel();
  const prefs = usePrefs();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const last = q.data?.find((r) => r.status === "PAID" || r.status === "APPROVED");
  return (
    <ModuleShell nav={hrNav("payroll")} wide tabs={PAYROLL_TABS} actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>مسير جديد</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الرواتب" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="آخر مسير معتمد" value={last ? last.netMinor : null} format={money.whole} compact icon={<Banknote className="size-4" />} hint={last ? monthLabel(last.month) : undefined} />
            <StatCard label="الموظفون في آخر مسير" value={last?.employees ?? null} icon={<Calculator className="size-4" />} />
            <StatCard label="حصة المنشأة في التأمينات" value={last ? last.employerGosiMinor : null} format={money.whole} compact icon={<Banknote className="size-4" />} />
            <StatCard label="مخصص نهاية الخدمة للشهر" value={last ? last.eosAccrualMinor : null} format={money.whole} compact icon={<HandCoins className="size-4" />} />
          </section>
          {!q.data.length ? (
            <EmptyState illustration="table" title="لا مسيرات بعد" description="أنشئ مسير الشهر: يُحتسب من العقود والحضور والإجازات والبنود المتغيرة والسلف." action={<Button variant="primary" onClick={() => setOpen(true)}>مسير جديد</Button>} />
          ) : (
            <FinTable
              head={
                <tr>
                  <th>الرقم</th>
                  <th>الشهر</th>
                  <th className="text-end">الموظفون</th>
                  <th className="text-end">الإجمالي</th>
                  <th className="text-end">الاستقطاعات</th>
                  <th className="text-end">الصافي</th>
                  <th>الحالة</th>
                </tr>
              }
            >
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <DocLink href={`/hr/payroll/${r.id}`}>{docNo(r.number, prefs.digits)}</DocLink>
                  </td>
                  <td>
                    <Link href={`/hr/payroll/${r.id}`} className="font-medium hover:underline">
                      {monthLabel(r.month)}
                    </Link>
                  </td>
                  <td className={num}>{formatNumber(r.employees, prefs.digits)}</td>
                  <td className={num}>{money.fmt(r.grossMinor, false)}</td>
                  <td className={num}>{money.fmt(r.deductionsMinor, false)}</td>
                  <td className={`${num} font-semibold`}>{money.fmt(r.netMinor, false)}</td>
                  <td>
                    <Tag color={RUN_STATUS[r.status]?.color}>{RUN_STATUS[r.status]?.label}</Tag>
                  </td>
                </tr>
              ))}
            </FinTable>
          )}
        </>
      )}
      {open ? <NewRunDialog defaultMonth={today.slice(0, 7)} onClose={() => setOpen(false)} /> : null}
    </ModuleShell>
  );
}

function NewRunDialog({ defaultMonth, onClose }: { defaultMonth: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const m = trpc.hr.payroll.create.useMutation({
    onSuccess: (r) => {
      toast.success(`أُنشئ مسير ${r.month}${r.skipped.length ? ` — ${r.skipped.length} موظف بلا عقد لم يُدرج` : ""}`);
      void utils.hr.payroll.invalidate();
      onClose();
      router.push(`/hr/payroll/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="مسير رواتب جديد" description="يشمل كل موظف له عقد ساري في الشهر، ويُحتسب الاستحقاق الجزئي لمن عُيّن خلاله.">
        <div className="px-5 pb-4">
          <Field label="الشهر">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!/^\d{4}-\d{2}$/.test(month)} onClick={() => m.mutate({ month })}>
            احتساب المسير
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RunPage({ id }: { id: string }) {
  const q = trpc.hr.payroll.run.useQuery({ id });
  const { can } = useApp();
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const monthLabel = useMonthLabel();
  const [dialog, setDialog] = useState<null | "pay" | "cancel">(null);
  const onError = (e: { message: string }) => toast.error(e.message);
  const refresh = () => void utils.hr.payroll.invalidate();
  const recalc = trpc.hr.payroll.recalc.useMutation({ onSuccess: () => (toast.success("أُعيد الاحتساب"), refresh()), onError });
  const submit = trpc.hr.payroll.submit.useMutation({ onSuccess: () => (toast.success("رُفع المسير للاعتماد"), refresh()), onError });
  const cancel = trpc.hr.payroll.cancel.useMutation({ onSuccess: () => (toast.success("أُلغي المسير"), refresh(), setDialog(null)), onError });
  const wps = trpc.hr.payroll.wps.useMutation({
    onSuccess: (f) => {
      const blob = new Blob(["﻿" + f.content], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = f.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      if (f.missingIban.length) toast.error(`بلا آيبان: ${f.missingIban.join("، ")}`);
    },
    onError,
  });
  const d = q.data;
  if (q.error) return <ModuleShell nav={hrNav("payroll")} title="المسير"><EmptyState illustration="lock" title="لا يمكن عرض المسير" description={q.error.message} /></ModuleShell>;
  if (!d) return <ModuleShell nav={hrNav("payroll")} title="المسير"><SkeletonLines lines={12} /></ModuleShell>;
  const r = d.run;
  const t = d.totals;
  const cell = (m: number) => (m ? money.fmt(m, false) : "");
  return (
    <ModuleShell
      nav={hrNav("payroll")}
      wide
      title={`مسير ${monthLabel(r.month)}`}
      crumbs={[{ title: `مسير ${monthLabel(r.month)}` }]}
      actions={
        <>
          {r.status === "DRAFT" ? (
            <>
              <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => setDialog("cancel")}>
                إلغاء
              </Button>
              <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={recalc.isPending} onClick={() => recalc.mutate({ id })}>
                إعادة الاحتساب
              </Button>
              <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={submit.isPending} onClick={() => submit.mutate({ id })}>
                رفع للاعتماد
              </Button>
            </>
          ) : null}
          {r.status === "APPROVED" || r.status === "PAID" ? (
            <Button size="sm" icon={<Download className="size-3.5" />} loading={wps.isPending} onClick={() => wps.mutate({ id })}>
              ملف حماية الأجور
            </Button>
          ) : null}
          {r.status === "APPROVED" && (can("payroll", "approve") || can("banking", "create")) ? (
            <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />} onClick={() => setDialog("pay")}>
              صرف الرواتب
            </Button>
          ) : null}
        </>
      }
    >
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] font-bold">مسير {monthLabel(r.month)}</h1>
        <Tag color={RUN_STATUS[r.status]?.color}>{RUN_STATUS[r.status]?.label}</Tag>
        {r.journalEntryId ? (
          <Link className="text-[13px] text-fg-3 underline" href={`/finance/accounting/entries/${r.journalEntryId}`}>
            قيد الاستحقاق
          </Link>
        ) : null}
        {r.paymentEntryId ? (
          <Link className="text-[13px] text-fg-3 underline" href={`/finance/accounting/entries/${r.paymentEntryId}`}>
            قيد الصرف{d.bank ? ` (${d.bank})` : ""}
          </Link>
        ) : null}
      </header>
      {r.status === "REVIEW" ? <p className="mb-3 rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">بانتظار مراجعة مدير الموارد البشرية ثم اعتماد المدير من «الموافقات». عند الاعتماد يُرحّل القيد وتُتاح القسائم للموظفين.</p> : null}
      {d.missingIban.length && r.status !== "PAID" ? <p className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-[13px] text-danger-700">بلا آيبان ({d.missingIban.length}): {d.missingIban.join("، ")} — أكمل بياناتهم قبل ملف حماية الأجور.</p> : null}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="الإجمالي" value={t.gross} format={money.whole} compact icon={<Banknote className="size-4" />} />
        <StatCard label="الاستقطاعات" value={t.deductions} format={money.whole} compact icon={<Banknote className="size-4" />} />
        <StatCard label="الصافي للتحويل" value={t.net} format={money.whole} compact tone="success" icon={<Banknote className="size-4" />} />
        <StatCard label="التأمينات (الموظف + المنشأة)" value={t.gosiEmployee + t.gosiEmployer} format={money.whole} compact icon={<Banknote className="size-4" />} />
        <StatCard label="مخصص نهاية الخدمة" value={t.eos} format={money.whole} compact icon={<HandCoins className="size-4" />} />
      </section>
      <FinTable
        dense
        head={
          <tr>
            <th>الموظف</th>
            <th className="text-end">الأساسي</th>
            <th className="text-end">السكن</th>
            <th className="text-end">النقل وأخرى</th>
            <th className="text-end">إضافي ومكافآت</th>
            <th className="text-end">الإجمالي</th>
            <th className="text-end">التأمينات</th>
            <th className="text-end">غياب وتأخر</th>
            <th className="text-end">سلف وجزاءات</th>
            <th className="text-end">الصافي</th>
            <th />
          </tr>
        }
        foot={
          <tr>
            <td>الإجمالي ({formatNumber(d.lines.length, prefs.digits)})</td>
            <td className={num}>{cell(t.basic)}</td>
            <td className={num}>{cell(t.housing)}</td>
            <td className={num}>{cell(t.transport + t.other)}</td>
            <td className={num}>{cell(t.overtime + t.bonus)}</td>
            <td className={num}>{cell(t.gross)}</td>
            <td className={num}>{cell(t.gosiEmployee)}</td>
            <td className={num}>{cell(t.absence + t.late + t.unpaid)}</td>
            <td className={num}>{cell(t.loan + t.penalty + t.otherDeduction)}</td>
            <td className={num}>{cell(t.net)}</td>
            <td />
          </tr>
        }
      >
        {d.lines.map((l) => {
          const det = l.details as { notes?: string[]; paidDays?: number; monthDays?: number };
          return (
            <tr key={l.id}>
              <td>
                <Link href={`/hr/employees/${l.employeeId}`} className="font-medium hover:underline">
                  {l.employee.fullName}
                </Link>
                <span className="block text-[11px] text-fg-3">
                  {l.department ?? "—"}
                  {det.notes?.length ? ` · ${applyDigits(det.notes.join(" · "), prefs.digits)}` : ""}
                </span>
              </td>
              <td className={num}>{cell(l.basicMinor)}</td>
              <td className={num}>{cell(l.housingMinor)}</td>
              <td className={num}>{cell(l.transportMinor + l.otherAllowancesMinor)}</td>
              <td className={num}>{cell(l.overtimeMinor + l.bonusMinor)}</td>
              <td className={`${num} font-medium`}>{cell(l.grossMinor)}</td>
              <td className={num}>{cell(l.gosiEmployeeMinor)}</td>
              <td className={num}>{cell(l.absenceMinor + l.lateMinor + l.unpaidLeaveMinor)}</td>
              <td className={num}>{cell(l.loanMinor + l.penaltyMinor + l.otherDeductionMinor)}</td>
              <td className={`${num} font-semibold`}>{cell(l.netMinor)}</td>
              <td>
                <Link href={`/hr/payroll/payslip/${l.id}`}>
                  <Button size="icon-sm" variant="ghost" aria-label={`قسيمة ${l.employee.fullName}`}>
                    <Printer className="size-3.5" />
                  </Button>
                </Link>
              </td>
            </tr>
          );
        })}
      </FinTable>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold">حسب القسم</h2>
          <ul className="divide-y divide-line/60 text-[13px]">
            {d.byDepartment.map((b) => (
              <li key={b.name} className="flex items-center gap-2 py-1.5">
                <span className="flex-1">{b.name}</span>
                <span className="text-fg-3">{formatNumber(b.employees, prefs.digits)}</span>
                <span className="w-[120px] text-end tabular">{money.fmt(b.netMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg bg-card p-4 text-[13px] shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold">القيد المحاسبي عند الاعتماد</h2>
          <ul className="space-y-1 text-fg-2">
            <li>مدين: رواتب الهيئة التعليمية/الإداريين/الخدمات (بعد استقطاعات الحضور)، بدلات ومكافآت، تأمينات المنشأة، مكافأة نهاية الخدمة</li>
            <li>دائن: رواتب مستحقة {money.fmt(t.net)} · تأمينات مستحقة {money.fmt(t.gosiEmployee + t.gosiEmployer)} · ذمم الموظفين {money.fmt(t.loan)} · مخصص نهاية الخدمة {money.fmt(t.eos)}</li>
            <li>عند الصرف: مدين رواتب مستحقة، دائن الحساب البنكي</li>
          </ul>
        </section>
      </div>
      {dialog === "pay" ? <PayDialog id={id} netMinor={t.net} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)} title="إلغاء المسير؟" description="يمكن إنشاء مسير جديد للشهر نفسه بعد الإلغاء." danger confirmLabel="إلغاء المسير" loading={cancel.isPending} onConfirm={() => cancel.mutate({ id })} />
    </ModuleShell>
  );
}

function PayDialog({ id, netMinor, onClose, kind = "run" }: { id: string; netMinor: number; onClose: () => void; kind?: "run" | "loan" | "eos" }) {
  const utils = trpc.useUtils();
  const money = useMoney();
  const today = useToday();
  const opts = trpc.hr.payroll.options.useQuery();
  const [v, setV] = useState({ bankAccountId: "", date: today });
  const onSuccess = () => (toast.success("رُحّل قيد الصرف"), void utils.hr.invalidate(), onClose());
  const onError = (e: { message: string }) => toast.error(e.message);
  const run = trpc.hr.payroll.pay.useMutation({ onSuccess, onError });
  const loan = trpc.hr.payroll.disburseLoan.useMutation({ onSuccess, onError });
  const eos = trpc.hr.eos.pay.useMutation({ onSuccess, onError });
  const m = kind === "run" ? run : kind === "loan" ? loan : eos;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={kind === "run" ? "صرف الرواتب" : kind === "loan" ? "صرف السلفة" : "صرف مستحقات نهاية الخدمة"} description={`المبلغ ${money.fmt(netMinor)} — يُرحّل قيد: مدين ${kind === "loan" ? "ذمم الموظفين" : "رواتب مستحقة"}، دائن الحساب البنكي.`}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الحساب البنكي">
            <Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={(opts.data?.banks ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="تاريخ الصرف">
            <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.bankAccountId} onClick={() => m.mutate({ id, ...v })}>
            صرف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export { PayDialog };

// ---------------------------------------------------------------------
// القسيمة
// ---------------------------------------------------------------------

export function PayslipPage({ lineId }: { lineId: string }) {
  const q = trpc.hr.payroll.payslip.useQuery({ lineId });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const monthLabel = useMonthLabel();
  const { tenant } = useApp();
  const d = q.data;
  const nav = hrNav("self-service");
  if (q.error) return <ModuleShell nav={nav} title="قسيمة الراتب"><EmptyState illustration="lock" title="لا يمكن عرض القسيمة" description={q.error.message} /></ModuleShell>;
  if (!d) return <ModuleShell nav={nav} title="قسيمة الراتب"><SkeletonLines lines={10} /></ModuleShell>;
  const l = d.line;
  const earn: Array<[string, number]> = [["الراتب الأساسي", l.basicMinor], ["بدل السكن", l.housingMinor], ["بدل النقل", l.transportMinor], ["بدلات أخرى", l.otherAllowancesMinor], ["العمل الإضافي", l.overtimeMinor], ["مكافآت", l.bonusMinor]];
  const ded: Array<[string, number]> = [["التأمينات الاجتماعية", l.gosiEmployeeMinor], ["الغياب", l.absenceMinor], ["التأخر", l.lateMinor], ["إجازة بدون راتب", l.unpaidLeaveMinor], ["قسط السلفة", l.loanMinor], ["جزاءات", l.penaltyMinor], ["استقطاعات أخرى", l.otherDeductionMinor]];
  const det = l.details as { attendance?: { absentDays: number; lateMinutes: number; unpaidLeaveDays: number } };
  return (
    <ModuleShell nav={nav} title={`قسيمة ${monthLabel(l.run.month)}`} crumbs={[{ title: `قسيمة ${monthLabel(l.run.month)}` }]} actions={<Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>طباعة / PDF</Button>}>
      <article className="relative mx-auto max-w-[720px] rounded-lg bg-card p-8 shadow-card print:shadow-none">
        {tenant.isDemo ? <span className="absolute end-6 top-3 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">بيانات تجريبية</span> : null}
        <header className="mb-5 flex items-end justify-between border-b-2 border-fg pb-3">
          <div>
            <p className="text-[18px] font-bold">{d.school?.name}</p>
            <p className="text-[14px] text-fg-2">قسيمة راتب — {monthLabel(l.run.month)}</p>
          </div>
          <p className="text-[12px] text-fg-3">مسير رقم {docNo(l.run.number, prefs.digits)}</p>
        </header>
        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          {(
            [
              ["الموظف", d.employee.fullName],
              ["الرقم الوظيفي", docNo(d.employee.number ?? null, prefs.digits)],
              ["القسم", d.employee.department ?? "—"],
              ["المسمى", d.employee.position ?? "—"],
              ["تاريخ المباشرة", fmtDate(d.employee.hireDate)],
              ["الآيبان", d.employee.iban ? <bdi dir="ltr">{d.employee.iban}</bdi> : "—"],
            ] as Array<[string, React.ReactNode]>
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-line/50 py-1">
              <dt className="text-fg-3">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(
            [
              ["المستحقات", earn, l.grossMinor],
              ["الاستقطاعات", ded, l.deductionsMinor],
            ] as const
          ).map(([title, rows, total]) => (
            <table key={title} className="w-full text-[13px]">
              <thead>
                <tr>
                  <th colSpan={2} className="border-b border-line pb-1 text-start font-semibold">
                    {title}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-1 text-fg-2">{k}</td>
                      <td className="py-1 text-end tabular">{money.fmt(v, false)}</td>
                    </tr>
                  ))}
                <tr className="font-semibold">
                  <td className="border-t border-line pt-1">المجموع</td>
                  <td className="border-t border-line pt-1 text-end tabular">{money.fmt(total, false)}</td>
                </tr>
              </tbody>
            </table>
          ))}
        </div>
        <p className="mt-6 flex items-center justify-between rounded-md bg-hover px-4 py-3 text-[16px] font-bold">
          <span>صافي الراتب</span>
          <span className="tabular">{money.fmt(l.netMinor)}</span>
        </p>
        {det.attendance && (det.attendance.absentDays || det.attendance.lateMinutes || det.attendance.unpaidLeaveDays) ? (
          <p className="mt-3 text-[12px] text-fg-3">
            الحضور:{" "}
            {[
              det.attendance.absentDays ? `غياب ${formatNumber(det.attendance.absentDays, prefs.digits)} يوم` : null,
              det.attendance.lateMinutes ? `تأخر ${formatNumber(det.attendance.lateMinutes, prefs.digits)} دقيقة` : null,
              det.attendance.unpaidLeaveDays ? `إجازة بدون راتب ${formatNumber(det.attendance.unpaidLeaveDays, prefs.digits)} يوم` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </article>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// البنود المتغيرة
// ---------------------------------------------------------------------

export function AdjustmentsPage() {
  const today = useToday();
  const money = useMoney();
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [open, setOpen] = useState(false);
  const q = trpc.hr.payroll.adjustments.useQuery({ month });
  const del = trpc.hr.payroll.deleteAdjustment.useMutation({ onSuccess: () => void utils.hr.payroll.invalidate(), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={hrNav("payroll")} wide tabs={PAYROLL_TABS} actions={<><Input type="month" className="h-7 w-[160px] text-[13px]" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" /><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>بند</Button></>}>
      <p className="mb-3 text-[13px] text-fg-3">المكافآت والبدلات المتغيرة وساعات العمل الإضافي المعتمدة والجزاءات؛ تدخل في مسير الشهر عند احتسابه أو إعادة احتسابه.</p>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض البنود" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.length ? (
        <EmptyState illustration="table" title="لا بنود متغيرة لهذا الشهر" action={<Button variant="primary" onClick={() => setOpen(true)}>إضافة بند</Button>} />
      ) : (
        <FinTable head={<tr><th>الموظف</th><th>النوع</th><th>الوصف</th><th className="text-end">المبلغ / الساعات</th><th /></tr>}>
          {q.data.map((a) => (
            <tr key={a.id}>
              <td className="font-medium">{a.employee.fullName}</td>
              <td>
                <Tag color={ADJ_KIND[a.kind]?.color}>{ADJ_KIND[a.kind]?.label}</Tag>
              </td>
              <td className="text-fg-2">{a.description}</td>
              <td className={num}>{a.kind === "OVERTIME" ? `${formatNumber(a.hours ?? 0, prefs.digits)} ساعة` : money.fmt(a.amountMinor)}</td>
              <td className="text-end">
                <Button size="icon-sm" variant="ghost" aria-label="حذف البند" onClick={() => del.mutate({ id: a.id })}>
                  <Trash2 className="size-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {open ? <AdjustmentDialog month={month} onClose={() => setOpen(false)} /> : null}
    </ModuleShell>
  );
}

function AdjustmentDialog({ month, onClose }: { month: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const opts = trpc.hr.payroll.options.useQuery();
  const [v, setV] = useState({ employeeId: "", kind: "BONUS" as "BONUS" | "OVERTIME" | "PENALTY" | "DEDUCTION" | "ALLOWANCE", amountMinor: null as number | null, hours: "", description: "" });
  const m = trpc.hr.payroll.saveAdjustment.useMutation({ onSuccess: () => (toast.success("أُضيف البند"), void utils.hr.payroll.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const ot = v.kind === "OVERTIME";
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="بند متغير" description="العمل الإضافي بالساعات يُحتسب بأجر الساعة الفعلي + ٥٠٪ من الأساسي (المادة ١٠٧).">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الموظف" className="col-span-2">
            <Select value={v.employeeId || undefined} onChange={(employeeId) => setV({ ...v, employeeId })} options={(opts.data?.employees ?? []).map((e) => ({ value: e.id, label: e.fullName }))} />
          </Field>
          <Field label="النوع">
            <Select value={v.kind} onChange={(k) => setV({ ...v, kind: k as "BONUS" })} options={Object.entries(ADJ_KIND).map(([value, x]) => ({ value, label: x.label }))} />
          </Field>
          {ot ? (
            <Field label="الساعات">
              <Input type="number" min={1} max={200} value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} />
            </Field>
          ) : (
            <Field label="المبلغ">
              <MoneyInput value={v.amountMinor} onChange={(amountMinor) => setV({ ...v, amountMinor })} />
            </Field>
          )}
          <Field label="الوصف" className="col-span-2">
            <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="مكافأة تميز — نتائج الاختبارات" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.employeeId || v.description.trim().length < 3 || (ot ? !Number(v.hours) : !v.amountMinor)} onClick={() => m.mutate({ employeeId: v.employeeId, month, kind: v.kind, amountMinor: ot ? 0 : v.amountMinor!, hours: ot ? Math.trunc(Number(v.hours)) : null, description: v.description })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// السلف
// ---------------------------------------------------------------------

export function LoansPage() {
  const q = trpc.hr.payroll.loans.useQuery();
  const opts = trpc.hr.payroll.options.useQuery();
  const { can } = useApp();
  const money = useMoney();
  const prefs = usePrefs();
  const [dialog, setDialog] = useState<null | "new" | { pay: { id: string; amountMinor: number } }>(null);
  return (
    <ModuleShell nav={hrNav("payroll")} wide tabs={PAYROLL_TABS} actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog("new")}>سلفة لموظف</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض السلف" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.rows.length ? (
        <EmptyState illustration="table" title="لا سلف" description="تُطلب السلفة من الموظف أو الموارد البشرية، وتُعتمد ثم تُصرف، وتُستقطع أقساطها من المسير." />
      ) : (
        <FinTable head={<tr><th>الرقم</th><th>الموظف</th><th className="text-end">المبلغ</th><th className="text-end">القسط</th><th className="text-end">المسدد</th><th>من شهر</th><th>الحالة</th><th /></tr>}>
          {q.data.rows.map((l) => (
            <tr key={l.id}>
              <td className="tabular">{docNo(l.number, prefs.digits)}</td>
              <td className="font-medium">{l.employee.fullName}</td>
              <td className={num}>{money.fmt(l.amountMinor, false)}</td>
              <td className={num}>{money.fmt(l.installmentMinor, false)}</td>
              <td className={num}>{money.fmt(l.repaidMinor, false)}</td>
              <td className="tabular">{l.startMonth}</td>
              <td>
                <Tag color={LOAN_STATUS[l.status]?.color}>{LOAN_STATUS[l.status]?.label}</Tag>
                {l.status === "ACTIVE" && !l.journalEntryId ? <Tag size="sm" color="gold" className="ms-1">لم تُصرف</Tag> : null}
              </td>
              <td className="text-end">
                {l.status === "ACTIVE" && !l.journalEntryId && can("payroll", "approve") ? (
                  <Button size="xs" onClick={() => setDialog({ pay: { id: l.id, amountMinor: l.amountMinor } })}>
                    صرف
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {dialog === "new" ? <LoanDialog employees={(opts.data?.employees ?? []).map((e) => ({ id: e.id, fullName: e.fullName }))} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" ? <PayDialog id={dialog.pay.id} netMinor={dialog.pay.amountMinor} kind="loan" onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// الإعدادات
// ---------------------------------------------------------------------

interface HrSettingsValues {
  gosiSaudiEmployeeBp: number;
  gosiSaudiEmployerBp: number;
  gosiNonSaudiEmployerBp: number;
  gosiCapMinor: number;
  deductAbsence: boolean;
  deductLate: boolean;
  lateMonthlyGraceMinutes: number;
  overtimeRateBp: number;
  monthDays: number;
  expiryAlertDays: number;
  eosFirstYearsMonthsBp: number;
  eosLaterYearsMonthsBp: number;
  accrueEosMonthly: boolean;
}

export function PayrollSettingsPage() {
  const q = trpc.moduleSettings.get.useQuery({ key: "hr" });
  return (
    <ModuleShell nav={hrNav("payroll")} tabs={PAYROLL_TABS}>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الإعدادات" description={q.error.message} /> : q.data ? <HrSettingsForm initial={q.data.values as unknown as HrSettingsValues} canEdit={q.data.canEdit} /> : <SkeletonLines lines={10} />}
    </ModuleShell>
  );
}

function HrSettingsForm({ initial, canEdit }: { initial: HrSettingsValues; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({ onSuccess: async () => (await Promise.all([utils.moduleSettings.get.invalidate({ key: "hr" }), utils.account.context.invalidate()]), toast.success("حُفظت إعدادات الرواتب")), onError: (e) => toast.error(e.message) });
  const int = (s: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(s) || 0)));
  return (
    <div>
      {!canEdit ? <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: التعديل لمدير الموارد البشرية.</p> : null}
      <SettingsCard title="التأمينات الاجتماعية" description="النسب الافتراضية وفق نظام التأمينات للموظفين الجدد: السعودي ٩٫٧٥٪ على الموظف و١١٫٧٥٪ على المنشأة، وغير السعودي ٢٪ على المنشأة (الأخطار المهنية). تحقق من النسب السارية لمنشأتك.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="حصة الموظف السعودي ٪">
            <PercentInput disabled={!canEdit} bp={v.gosiSaudiEmployeeBp} onChange={(gosiSaudiEmployeeBp) => setV({ ...v, gosiSaudiEmployeeBp })} />
          </Field>
          <Field label="حصة المنشأة (سعودي) ٪">
            <PercentInput disabled={!canEdit} bp={v.gosiSaudiEmployerBp} onChange={(gosiSaudiEmployerBp) => setV({ ...v, gosiSaudiEmployerBp })} />
          </Field>
          <Field label="حصة المنشأة (غير سعودي) ٪">
            <PercentInput disabled={!canEdit} bp={v.gosiNonSaudiEmployerBp} onChange={(gosiNonSaudiEmployerBp) => setV({ ...v, gosiNonSaudiEmployerBp })} />
          </Field>
          <Field label="سقف الأجر الخاضع">
            <MoneyInput disabled={!canEdit} value={v.gosiCapMinor} onChange={(a) => setV({ ...v, gosiCapMinor: a ?? 0 })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="الحضور والإضافي">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.deductAbsence} onChange={(deductAbsence) => setV({ ...v, deductAbsence })} /> خصم الغياب بأجر اليوم
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.deductLate} onChange={(deductLate) => setV({ ...v, deductLate })} /> خصم التأخر بالدقيقة
          </label>
          <Field label="مهلة التأخر الشهرية (دقيقة)">
            <Input disabled={!canEdit} type="number" value={v.lateMonthlyGraceMinutes} onChange={(e) => setV({ ...v, lateMonthlyGraceMinutes: int(e.target.value, 0, 600) })} />
          </Field>
          <Field label="أيام الشهر لأجر اليوم">
            <Input disabled={!canEdit} type="number" value={v.monthDays} onChange={(e) => setV({ ...v, monthDays: int(e.target.value, 22, 31) })} />
          </Field>
          <Field label="معامل أجر الساعة الأساسي للإضافي ٪" hint="١٥٠٪ = الأجر + ٥٠٪ من الأساسي">
            <PercentInput disabled={!canEdit} bp={v.overtimeRateBp} onChange={(overtimeRateBp) => setV({ ...v, overtimeRateBp: Math.max(10000, overtimeRateBp) })} />
          </Field>
          <Field label="التنبيه قبل انتهاء الوثائق (يوم)">
            <Input disabled={!canEdit} type="number" value={v.expiryAlertDays} onChange={(e) => setV({ ...v, expiryAlertDays: int(e.target.value, 7, 180) })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard
        title="مكافأة نهاية الخدمة"
        description="نظام العمل (م٨٤): نصف أجر شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر عن كل سنة بعدها."
        footer={canEdit ? <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "hr", patch: { ...v } })}>حفظ</Button> : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="أشهر لكل سنة (أول ٥ سنوات) ٪">
            <PercentInput disabled={!canEdit} bp={v.eosFirstYearsMonthsBp} onChange={(eosFirstYearsMonthsBp) => setV({ ...v, eosFirstYearsMonthsBp })} />
          </Field>
          <Field label="أشهر لكل سنة (بعد ٥ سنوات) ٪">
            <PercentInput disabled={!canEdit} bp={v.eosLaterYearsMonthsBp} onChange={(eosLaterYearsMonthsBp) => setV({ ...v, eosLaterYearsMonthsBp })} />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.accrueEosMonthly} onChange={(accrueEosMonthly) => setV({ ...v, accrueEosMonthly })} /> تكوين المخصص شهرياً مع المسير
          </label>
        </div>
      </SettingsCard>
    </div>
  );
}
