"use client";
/**
 * نهاية الخدمة: حاسبة المكافأة والمستحقات قبل الحفظ، إنشاء التصفية للموافقة، قائمة التصفيات
 * مع المخصص المتراكم مقابل الالتزام الحالي، وتفاصيل التصفية وصرفها.
 */
import { Banknote, Calculator, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { docNo, FinTable, MoneyInput, num, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { hrNav } from "./common";
import { PayDialog } from "./payroll";

const REASONS = [
  { value: "RESIGNATION", label: "استقالة" },
  { value: "TERMINATION", label: "إنهاء من صاحب العمل" },
  { value: "CONTRACT_END", label: "انتهاء العقد" },
  { value: "RETIREMENT", label: "تقاعد" },
  { value: "DEATH", label: "وفاة" },
  { value: "ARTICLE_80", label: "فصل وفق المادة ٨٠" },
] as const;
type Reason = (typeof REASONS)[number]["value"];
const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمدة — بانتظار الصرف", color: "navy" },
  PAID: { label: "مصروفة", color: "green" },
  CANCELLED: { label: "ملغاة", color: "red" },
};

export function EosPage() {
  const params = useSearchParams();
  const q = trpc.hr.eos.list.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const d = q.data;
  return (
    <ModuleShell nav={hrNav("end-of-service")} wide>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض نهاية الخدمة" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="الالتزام الحالي (لو انتهت خدمة الجميع اليوم)" value={d.liabilityMinor} format={money.whole} compact icon={<Calculator className="size-4" />} hint={`${formatNumber(d.activeEmployees, prefs.digits)} موظفاً`} />
            <StatCard label="المخصص المتراكم في الدفاتر" value={d.provisionMinor} format={money.whole} compact icon={<Banknote className="size-4" />} />
            <StatCard label="الفرق" value={d.liabilityMinor - d.provisionMinor} format={money.whole} compact tone={d.liabilityMinor > d.provisionMinor ? "warning" : "success"} icon={<Calculator className="size-4" />} hint={d.liabilityMinor > d.provisionMinor ? "المخصص أقل من الالتزام" : "المخصص يغطي الالتزام"} />
          </section>
          <Calculator_ key={params.get("employee") ?? "none"} initialEmployee={params.get("employee")} />
          <h2 className="mb-2 mt-6 text-[15px] font-semibold">التصفيات</h2>
          {!d.rows.length ? (
            <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا تصفيات بعد.</p>
          ) : (
            <FinTable head={<tr><th>الرقم</th><th>الموظف</th><th>آخر يوم</th><th className="text-end">المكافأة</th><th className="text-end">الإجازة</th><th className="text-end">الصافي</th><th>الحالة</th></tr>}>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="tabular underline decoration-line underline-offset-4" href={`/hr/end-of-service/${r.id}`}>
                      {docNo(r.number, prefs.digits)}
                    </Link>
                  </td>
                  <td className="font-medium">{r.employee.fullName}</td>
                  <td className="tabular">{fmtDate(r.lastWorkingDay)}</td>
                  <td className={num}>{money.fmt(r.eosMinor, false)}</td>
                  <td className={num}>{money.fmt(r.leaveEncashmentMinor, false)}</td>
                  <td className={`${num} font-semibold`}>{money.fmt(r.netMinor, false)}</td>
                  <td>
                    <Tag color={STATUS[r.status]?.color}>{STATUS[r.status]?.label}</Tag>
                  </td>
                </tr>
              ))}
            </FinTable>
          )}
        </>
      )}
    </ModuleShell>
  );
}

function Calculator_({ initialEmployee }: { initialEmployee: string | null }) {
  const today = useToday();
  const money = useMoney();
  const prefs = usePrefs();
  const router = useRouter();
  const utils = trpc.useUtils();
  const opts = trpc.hr.employees.options.useQuery();
  const [v, setV] = useState({ employeeId: initialEmployee ?? "", reason: "RESIGNATION" as Reason, lastWorkingDay: today, other: 0, notes: "" });
  const p = trpc.hr.eos.preview.useQuery({ employeeId: v.employeeId, reason: v.reason, lastWorkingDay: v.lastWorkingDay, otherDeductionsMinor: v.other }, { enabled: Boolean(v.employeeId) });
  const create = trpc.hr.eos.create.useMutation({ onSuccess: (r) => (toast.success("أُرسلت التصفية للاعتماد"), void utils.hr.invalidate(), router.push(`/hr/end-of-service/${r.id}`)), onError: (e) => toast.error(e.message) });
  const x = p.data;
  return (
    <SettingsCard
      title="حاسبة نهاية الخدمة"
      description="المكافأة وفق المادتين ٨٤ و٨٥ على الأجر الفعلي الأخير، وبدل رصيد الإجازة، وراتب الأيام الأخيرة ناقص السلف. عند الاعتماد: القيد، ثم إيقاف حساب الموظف وإعادة إسناد مهامه لمديره."
      footer={x ? <Button variant="primary" loading={create.isPending} onClick={() => create.mutate({ employeeId: v.employeeId, reason: v.reason, lastWorkingDay: v.lastWorkingDay, otherDeductionsMinor: v.other, notes: v.notes || null })}>إنشاء التصفية وإرسالها للاعتماد</Button> : undefined}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="الموظف" className="sm:col-span-2">
          <Select value={v.employeeId || undefined} onChange={(employeeId) => setV({ ...v, employeeId })} options={(opts.data?.managers ?? []).map((e) => ({ value: e.id, label: e.fullName }))} />
        </Field>
        <Field label="سبب الانتهاء">
          <Select value={v.reason} onChange={(r) => setV({ ...v, reason: r as Reason })} options={REASONS} />
        </Field>
        <Field label="آخر يوم عمل">
          <Input type="date" value={v.lastWorkingDay} onChange={(e) => setV({ ...v, lastWorkingDay: e.target.value })} />
        </Field>
        <Field label="استقطاعات أخرى (عهد، أضرار…)">
          <MoneyInput value={v.other} onChange={(a) => setV({ ...v, other: a ?? 0 })} />
        </Field>
        <Field label="ملاحظات" className="sm:col-span-3">
          <Textarea rows={1} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
      </div>
      {p.error ? <p className="mt-3 text-[13px] text-danger-700">{p.error.message}</p> : null}
      {x ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <dl className="text-[13px]">
            {[
              ["مدة الخدمة", `${formatNumber(x.serviceDays, prefs.digits)} يوماً`],
              ["الأجر الفعلي الأخير", money.fmt(x.wageMinor)],
              ["المكافأة الكاملة", money.fmt(x.eos.fullMinor)],
              ["المستحق حسب السبب", money.fmt(x.eos.awardMinor)],
              [`بدل الإجازة (${formatNumber(x.leaveDays, prefs.digits)} يوماً)`, money.fmt(x.leaveEncashmentMinor)],
              [`راتب الأيام الأخيرة (${formatNumber(x.unpaidDays, prefs.digits)})`, money.fmt(x.unpaidSalaryMinor)],
              ["السلف المستقطعة", `− ${money.fmt(x.loanDeductedMinor)}`],
              ["استقطاعات أخرى", `− ${money.fmt(x.otherDeductionsMinor)}`],
            ].map(([k, val]) => (
              <div key={k} className="flex justify-between border-b border-line/50 py-1.5">
                <dt className="text-fg-3">{k}</dt>
                <dd className="tabular">{val}</dd>
              </div>
            ))}
            <div className="flex justify-between py-2 text-[16px] font-bold">
              <dt>الصافي المستحق</dt>
              <dd className="tabular">{money.fmt(x.netMinor)}</dd>
            </div>
          </dl>
          <ol className="list-decimal space-y-1 ps-5 text-[13px] text-fg-2">
            {x.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : v.employeeId && p.isLoading ? (
        <SkeletonLines lines={4} />
      ) : null}
    </SettingsCard>
  );
}

export function EosDetailPage({ id }: { id: string }) {
  const q = trpc.hr.eos.get.useQuery({ id });
  const { can } = useApp();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [pay, setPay] = useState(false);
  const d = q.data;
  if (q.error) return <ModuleShell nav={hrNav("end-of-service")} title="التصفية"><EmptyState illustration="lock" title="لا يمكن عرض التصفية" description={q.error.message} /></ModuleShell>;
  if (!d) return <ModuleShell nav={hrNav("end-of-service")} title="التصفية"><SkeletonLines lines={10} /></ModuleShell>;
  const s = d.settlement;
  return (
    <ModuleShell
      nav={hrNav("end-of-service")}
      title={`تصفية ${d.employee?.fullName ?? ""}`}
      crumbs={[{ title: `تصفية ${docNo(s.number, prefs.digits)}` }]}
      actions={
        <>
          <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
            طباعة
          </Button>
          {s.status === "APPROVED" && can("end_of_service", "approve") ? (
            <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />} onClick={() => setPay(true)}>
              صرف المستحقات
            </Button>
          ) : null}
        </>
      }
    >
      <article className="mx-auto max-w-[760px] rounded-lg bg-card p-6 shadow-card print:shadow-none">
        <header className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <h1 className="text-[22px] font-bold">مخالصة نهاية خدمة — {d.employee?.fullName}</h1>
          <Tag color={STATUS[s.status]?.color}>{STATUS[s.status]?.label}</Tag>
        </header>
        <dl className="grid grid-cols-1 gap-x-8 text-[13px] sm:grid-cols-2">
          {[
            ["رقم التصفية", docNo(s.number, prefs.digits)],
            ["السبب", REASONS.find((r) => r.value === s.reason)?.label ?? s.reason],
            ["تاريخ المباشرة", fmtDate(d.employee?.hireDate)],
            ["آخر يوم عمل", fmtDate(s.lastWorkingDay)],
            ["مدة الخدمة", `${formatNumber(s.serviceDays, prefs.digits)} يوماً`],
            ["الأجر الفعلي", money.fmt(s.wageMinor)],
            ["مكافأة نهاية الخدمة", money.fmt(s.eosMinor)],
            [`بدل الإجازة (${formatNumber(s.leaveDays, prefs.digits)} يوماً)`, money.fmt(s.leaveEncashmentMinor)],
            ["راتب الأيام الأخيرة", money.fmt(s.unpaidSalaryMinor)],
            ["السلف المستقطعة", money.fmt(s.loanBalanceMinor)],
            ["استقطاعات أخرى", money.fmt(s.otherDeductionsMinor)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line/50 py-1.5">
              <dt className="text-fg-3">{k}</dt>
              <dd className="tabular">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 flex justify-between rounded-md bg-hover px-4 py-3 text-[17px] font-bold">
          <span>الصافي المستحق</span>
          <span className="tabular">{money.fmt(s.netMinor)}</span>
        </p>
        <h2 className="mb-1 mt-5 text-[14px] font-semibold">خطوات الحساب</h2>
        <ol className="list-decimal space-y-1 ps-5 text-[13px] text-fg-2">
          {d.calculation.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
          {s.journalEntryId ? <Link className="underline" href={`/finance/accounting/entries/${s.journalEntryId}`}>قيد التصفية</Link> : null}
          {s.paymentEntryId ? <Link className="underline" href={`/finance/accounting/entries/${s.paymentEntryId}`}>قيد الصرف</Link> : null}
          {d.employee ? <Link className="underline" href={`/hr/employees/${d.employee.id}`}>ملف الموظف</Link> : null}
        </div>
        <div className="mt-10 hidden grid-cols-3 gap-6 text-center text-[13px] print:grid">
          {["الموظف", "مدير الموارد البشرية", "مدير المدرسة"].map((t) => (
            <p key={t} className="border-t border-line pt-1">{t}</p>
          ))}
        </div>
      </article>
      {pay ? <PayDialog id={s.id} netMinor={s.netMinor} kind="eos" onClose={() => setPay(false)} /> : null}
    </ModuleShell>
  );
}
