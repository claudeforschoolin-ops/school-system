"use client";
/**
 * معالج الفوترة الجماعية: المعايير (العام، الفرع، الصفوف، البنود، الخطة) ← معاينة لكل طالب
 * (مع الخصومات والضريبة ومن سبقت فوترته) ← إصدار دفعة واحدة برقم دفعة، بلا تكرار عند الإعادة.
 */
import { ArrowRight, CheckCircle2, FileStack } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { Figure, FinTable, financeNav, num, useMoney, useToday, useInvoiceTabs } from "./common";

type Criteria = {
  academicYearId: string;
  branchId: string | null;
  gradeIds: string[];
  feeItemIds: string[];
  planId: string | null;
  issueDate: string;
  applyDiscounts: boolean;
};

export function BulkBilling() {
  const invoiceTabs = useInvoiceTabs();
  const setup = trpc.finance.setup.get.useQuery();
  const today = useToday();
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [step, setStep] = useState<"criteria" | "preview" | "done">("criteria");
  const [result, setResult] = useState<{
    number: number;
    count: number;
    total: number;
    failures: Array<{ name: string; error: string }>;
  } | null>(null);
  const nav = financeNav("invoices");
  if (setup.error) {
    return (
      <ModuleShell nav={nav} tabs={invoiceTabs}>
        <EmptyState
          illustration="lock"
          title="لا يمكن فتح الفوترة الجماعية"
          description={setup.error.message}
        />
      </ModuleShell>
    );
  }
  const s = setup.data;
  const initial: Criteria | null = s
    ? {
        academicYearId: s.years.find((y) => y.isCurrent)?.id ?? s.years[0]?.id ?? "",
        branchId: null,
        gradeIds: [],
        feeItemIds: s.items.filter((i) => i.isActive && i.kind === "TUITION").map((i) => i.id),
        planId: s.plans.find((p) => p.isDefault && p.isActive)?.id ?? null,
        issueDate: today,
        applyDiscounts: true,
      }
    : null;
  const c = criteria ?? initial;
  return (
    <ModuleShell nav={nav} tabs={invoiceTabs} wide>
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-[13px]" aria-label="خطوات الفوترة">
        {[
          { k: "criteria", l: "١. المعايير" },
          { k: "preview", l: "٢. المعاينة" },
          { k: "done", l: "٣. النتيجة" },
        ].map((x, i) => (
          <li key={x.k} className="flex items-center gap-2">
            {i ? <span className="h-px w-6 bg-line" /> : null}
            <span
              className={cn(
                "rounded-full px-2.5 py-1",
                step === x.k ? "bg-navy-700 text-on-primary" : "bg-hover text-fg-3",
              )}
            >
              {x.l}
            </span>
          </li>
        ))}
      </ol>
      {!s || !c ? <SkeletonLines lines={10} /> : null}
      {s && c && step === "criteria" ? (
        <CriteriaForm
          setup={s}
          value={c}
          onChange={setCriteria}
          onNext={() => (setCriteria(c), setStep("preview"))}
        />
      ) : null}
      {s && c && step === "preview" ? (
        <PreviewStep
          criteria={c}
          onBack={() => setStep("criteria")}
          onDone={(r) => {
            setResult(r);
            setStep("done");
          }}
        />
      ) : null}
      {step === "done" && result ? (
        <DoneStep result={result} onAgain={() => (setResult(null), setStep("criteria"))} />
      ) : null}
    </ModuleShell>
  );
}

type Setup = RouterOutputs["finance"]["setup"]["get"];

function CriteriaForm({
  setup,
  value,
  onChange,
  onNext,
}: {
  setup: Setup;
  value: Criteria;
  onChange: (c: Criteria) => void;
  onNext: () => void;
}) {
  const set = (patch: Partial<Criteria>) => onChange({ ...value, ...patch });
  const items = setup.items.filter((i) => i.isActive && i.kind !== "LATE_FEE");
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg bg-card p-5 shadow-card">
        <h2 className="text-[15px] font-semibold">النطاق</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="العام الدراسي">
            <Select
              value={value.academicYearId}
              onChange={(v) => set({ academicYearId: v })}
              options={setup.years.map((y) => ({ value: y.id, label: y.name }))}
            />
          </Field>
          <Field label="الفرع">
            <Select
              value={value.branchId ?? "all"}
              onChange={(v) => set({ branchId: v === "all" ? null : v })}
              options={[
                { value: "all", label: "كل الفروع" },
                ...setup.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </Field>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-fg-2">الصفوف</span>
            <button
              className="text-[12px] text-fg-3 hover:text-fg"
              onClick={() => set({ gradeIds: value.gradeIds.length ? [] : setup.grades.map((g) => g.id) })}
            >
              {value.gradeIds.length ? "إلغاء التحديد" : "تحديد الكل"}
            </button>
          </div>
          {setup.stages.map((st) => (
            <div key={st.id} className="mb-2">
              <p className="mb-1 text-[12px] text-fg-3">{st.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {setup.grades
                  .filter((g) => g.stageId === st.id)
                  .map((g) => (
                    <label key={g.id} className="flex items-center gap-1.5 text-[14px]">
                      <Checkbox
                        checked={value.gradeIds.includes(g.id)}
                        onChange={(on) => set({ gradeIds: toggle(value.gradeIds, g.id, on) })}
                      />
                      {g.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
          <p className="text-[12px] text-fg-3">بدون تحديد = كل الصفوف.</p>
        </div>
      </section>
      <section className="space-y-3 rounded-lg bg-card p-5 shadow-card">
        <h2 className="text-[15px] font-semibold">البنود والسداد</h2>
        <div className="grid gap-1">
          {items.map((i) => (
            <label
              key={i.id}
              className="flex items-center gap-2 rounded-md px-1 py-1 text-[14px] hover:bg-hover"
            >
              <Checkbox
                checked={value.feeItemIds.includes(i.id)}
                onChange={(on) => set({ feeItemIds: toggle(value.feeItemIds, i.id, on) })}
              />
              {i.name}
              {i.deferred ? <span className="text-[12px] text-fg-3">· مؤجل</span> : null}
            </label>
          ))}
        </div>
        <p className="text-[12px] text-fg-3">
          المبالغ من جدول الرسوم المطابق لكل صف؛ الطالب بلا جدول مطابق يظهر في المعاينة مع السبب.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="خطة الأقساط">
            <Select
              value={value.planId ?? "none"}
              onChange={(v) => set({ planId: v === "none" ? null : v })}
              options={[
                { value: "none", label: "دفعة واحدة" },
                ...setup.plans.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Field>
          <Field label="تاريخ الإصدار">
            <Input
              type="date"
              value={value.issueDate}
              onChange={(e) => e.target.value && set({ issueDate: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center justify-between text-[14px]">
          تطبيق الخصومات (الأشقاء والمعتمدة)
          <Switch checked={value.applyDiscounts} onChange={(on) => set({ applyDiscounts: on })} />
        </label>
        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            disabled={!value.feeItemIds.length || !value.academicYearId}
            onClick={onNext}
          >
            معاينة
          </Button>
        </div>
      </section>
    </div>
  );
}

function PreviewStep({
  criteria,
  onBack,
  onDone,
}: {
  criteria: Criteria;
  onBack: () => void;
  onDone: (r: {
    number: number;
    count: number;
    total: number;
    failures: Array<{ name: string; error: string }>;
  }) => void;
}) {
  const prefs = usePrefs();
  const money = useMoney();
  const input = { ...criteria, gradeIds: criteria.gradeIds.length ? criteria.gradeIds : undefined };
  const q = trpc.finance.invoices.bulkPreview.useQuery(input);
  const [description, setDescription] = useState("رسوم العام الدراسي");
  const [notify, setNotify] = useState(true);
  const utils = trpc.useUtils();
  const issue = trpc.finance.invoices.bulkIssue.useMutation({
    onSuccess: (r) => {
      void utils.database.rows.invalidate();
      void utils.finance.reports.invalidate();
      toast.success(`صدرت ${formatNumber(r.count, prefs.digits)} فاتورة`);
      onDone(r);
    },
    onError: (e) => toast.error(e.message),
  });
  if (q.error)
    return (
      <EmptyState
        title="تعذرت المعاينة"
        description={q.error.message}
        action={<Button onClick={onBack}>رجوع</Button>}
      />
    );
  if (!q.data) return <SkeletonLines lines={10} />;
  const p = q.data;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Figure
          label="فواتير ستصدر"
          value={formatNumber(p.count, prefs.digits)}
          hint={p.skipped ? `${formatNumber(p.skipped, prefs.digits)} طالب متخطى` : "لا متخطين"}
        />
        <Figure label="قبل الخصم" value={money.fmt(p.subtotal)} />
        <Figure label="الخصومات" value={money.fmt(p.discount)} tone={p.discount ? "success" : undefined} />
        <Figure label="الضريبة" value={money.fmt(p.tax)} />
        <Figure label="الإجمالي" value={money.fmt(p.total)} />
      </section>
      {p.rows.length ? (
        <FinTable
          dense
          head={
            <tr>
              <th>الطالب</th>
              <th>الصف</th>
              <th className={num}>قبل الخصم</th>
              <th className={num}>الخصم</th>
              <th className={num}>الضريبة</th>
              <th className={num}>الإجمالي</th>
              <th>ملاحظة</th>
            </tr>
          }
        >
          {p.rows.map((r) => (
            <tr key={r.studentId} className={cn(r.skipped && "text-fg-3")}>
              <td>
                {r.name}
                <span className="block text-[11px] text-fg-3 tabular">{r.academicNumber}</span>
              </td>
              <td>
                {r.grade}
                {r.section ? ` · ${r.section}` : ""}
              </td>
              <td className={num}>{r.skipped ? "—" : money.fmt(r.subtotal, false)}</td>
              <td className={num}>{r.discount ? money.fmt(r.discount, false) : "—"}</td>
              <td className={num}>{r.skipped ? "—" : money.fmt(r.tax, false)}</td>
              <td className={cn(num, "font-medium")}>{r.skipped ? "—" : money.fmt(r.total, false)}</td>
              <td>
                {r.skipped ? (
                  <Tag size="sm" color="gray">
                    {r.skipped}
                  </Tag>
                ) : (
                  r.discounts.map((d) => (
                    <Tag key={d} size="sm" color="teal" className="me-1">
                      {d}
                    </Tag>
                  ))
                )}
              </td>
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState compact illustration="table" title="لا طلاب منتظمون بهذه المعايير" />
      )}
      <section className="flex flex-wrap items-end gap-3 rounded-lg bg-card p-4 shadow-card">
        <Field label="وصف الدفعة" className="min-w-[240px] flex-1">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="flex h-8 items-center gap-2 text-[14px]">
          <Switch checked={notify} onChange={setNotify} />
          إشعار أولياء الأمور
        </label>
        <Button variant="ghost" icon={<ArrowRight className="size-3.5" />} onClick={onBack}>
          تعديل المعايير
        </Button>
        <Button
          variant="primary"
          icon={<FileStack className="size-3.5" />}
          loading={issue.isPending}
          disabled={!p.count || description.trim().length < 3}
          onClick={() => issue.mutate({ ...input, description, notify })}
        >
          إصدار {formatNumber(p.count, prefs.digits)} فاتورة
        </Button>
      </section>
    </div>
  );
}

function DoneStep({
  result,
  onAgain,
}: {
  result: { number: number; count: number; total: number; failures: Array<{ name: string; error: string }> };
  onAgain: () => void;
}) {
  const prefs = usePrefs();
  const money = useMoney();
  return (
    <section className="rounded-lg bg-card p-8 text-center shadow-card">
      <CheckCircle2 className="mx-auto size-10 text-success-800" />
      <h2 className="mt-3 text-[20px] font-bold">
        صدرت الدفعة رقم {formatNumber(result.number, prefs.digits, { useGrouping: false })}
      </h2>
      <p className="mt-1 text-[15px] text-fg-2">
        {formatNumber(result.count, prefs.digits)} فاتورة بإجمالي {money.fmt(result.total)}، ولكل فاتورة قيدها
        الآلي.
      </p>
      {result.failures.length ? (
        <div className="mx-auto mt-4 max-w-lg rounded-md bg-danger-50 p-3 text-start text-[13px] text-danger-700">
          <p className="font-medium">تعذر إصدار {formatNumber(result.failures.length, prefs.digits)}:</p>
          <ul className="mt-1 list-disc ps-5">
            {result.failures.map((f) => (
              <li key={f.name}>
                {f.name}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/finance/invoices">
          <Button variant="primary">عرض الفواتير</Button>
        </Link>
        <Button onClick={onAgain}>دفعة أخرى</Button>
      </div>
    </section>
  );
}
