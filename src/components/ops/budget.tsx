"use client";
/**
 * الموازنة: الموازنات حسب العام المالي، شبكة (حساب × مركز تكلفة × شهر) قابلة للتحرير، النسخ من موازنة سابقة أو من الفعلي
 * بنسبة زيادة، الرفع للاعتماد، والفعلي مقابل الموازنة بشريط استهلاك ملوّن، وسياسة الرقابة عند الصرف.
 */
import { Copy, Plus, Send, Settings2, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney } from "@/components/finance/common";
import { ApprovalTimeline, BUDGET_STATUS, ModuleSettingsForm, opsNav, UsageBar } from "./common";

const nav = () => opsNav("budget");
const TABS = [
  { href: "/finance/budget", label: "الموازنات", exact: true },
  { href: "/finance/budget/settings", label: "سياسة الرقابة" },
];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;

export function BudgetsPage() {
  const q = trpc.budget.list.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [creating, setCreating] = useState(false);
  const d = q.data;
  const approved = d?.budgets.find((b) => b.status === "APPROVED");
  return (
    <ModuleShell nav={nav()} tabs={TABS} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>موازنة جديدة</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الموازنات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={6} />
      ) : !d.budgets.length ? (
        <EmptyState illustration="table" title="لا موازنات" description="أنشئ موازنة العام، وانسخها من الفعلي أو من موازنة سابقة بنسبة زيادة، ثم ارفعها للاعتماد." action={d.canEdit ? <Button variant="primary" onClick={() => setCreating(true)}>موازنة جديدة</Button> : undefined} />
      ) : (
        <>
          {approved ? (
            <Link href={`/finance/budget/${approved.id}`} className="mb-5 block rounded-lg bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
              <span className="flex items-center gap-2 text-[13px] text-fg-3"><Target className="size-4" />الموازنة المعتمدة الحالية</span>
              <span className="mt-1 block text-[18px] font-bold">{approved.name} — {approved.fiscalYear}</span>
              <span className="text-[14px] tabular">{money.fmt(approved.totalMinor)}</span>
            </Link>
          ) : null}
          <FinTable head={<tr><th>الموازنة</th><th>العام المالي</th><th className="text-end">البنود</th><th className="text-end">الإجمالي</th><th>أُنشئت</th><th>الحالة</th></tr>}>
            {d.budgets.map((b) => (
              <tr key={b.id}>
                <td><Link className="font-medium hover:underline" href={`/finance/budget/${b.id}`}>{b.name}</Link></td>
                <td>{b.fiscalYear}</td>
                <td className={num}>{formatNumber(b.lines, prefs.digits)}</td>
                <td className={num}>{money.fmt(b.totalMinor, false)}</td>
                <td className="tabular">{fmtDate(b.createdAt)}</td>
                <td><Tag color={BUDGET_STATUS[b.status]?.color}>{BUDGET_STATUS[b.status]?.label}</Tag></td>
              </tr>
            ))}
          </FinTable>
        </>
      )}
      {creating && d ? <NewBudgetDialog years={d.years} onClose={() => setCreating(false)} /> : null}
    </ModuleShell>
  );
}

function NewBudgetDialog({ years, onClose }: { years: RouterOutputs["budget"]["list"]["years"]; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [v, setV] = useState({ fiscalYearId: years.find((y) => y.status === "OPEN")?.id ?? years[0]?.id ?? "", name: "الموازنة التشغيلية" });
  const m = trpc.budget.save.useMutation({ onSuccess: (b) => (void utils.budget.invalidate(), router.push(`/finance/budget/${b.id}`)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="موازنة جديدة" width={440}>
        <div className="grid gap-3 px-5 pb-4">
          <Field label="العام المالي"><Select value={v.fiscalYearId || undefined} onChange={(fiscalYearId) => setV({ ...v, fiscalYearId })} options={years.map((y) => ({ value: y.id, label: y.name }))} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.fiscalYearId || v.name.trim().length < 2} onClick={() => m.mutate({ fiscalYearId: v.fiscalYearId, name: v.name })}>إنشاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Detail = RouterOutputs["budget"]["get"];
type Row = Detail["rows"][number];

export function BudgetDetail({ id }: { id: string }) {
  const q = trpc.budget.get.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const [view, setView] = useState<"plan" | "actual">("plan");
  const [dialog, setDialog] = useState<"row" | "copy" | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const submit = trpc.budget.submit.useMutation({ onSuccess: () => (toast.success("رُفعت الموازنة للاعتماد"), void utils.budget.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const totals = d ? { plan: d.rows.reduce((s, r) => s + (r.type === "EXPENSE" ? r.totalMinor : 0), 0), actual: d.rows.reduce((s, r) => s + (r.type === "EXPENSE" ? r.actualMinor : 0), 0), revenue: d.rows.reduce((s, r) => s + (r.type === "REVENUE" ? r.totalMinor : 0), 0) } : null;
  return (
    <ModuleShell nav={nav()} tabs={TABS} wide title={d?.budget.name} crumbs={d ? [{ title: "الموازنات", href: "/finance/budget" }, { title: `${d.budget.name} — ${d.budget.fiscalYear}` }] : undefined}
      actions={d?.canEdit ? (
        <>
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => setDialog("copy")}>نسخ من…</Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => (setEditRow(null), setDialog("row"))}>بند</Button>
          <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={submit.isPending} disabled={!d.rows.length} onClick={() => submit.mutate({ id })}>رفع للاعتماد</Button>
        </>
      ) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الموازنة" description={q.error.message} />
      ) : !d || !totals ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="موازنة المصروفات" value={totals.plan} format={money.whole} compact icon={<Target className="size-4" />} />
            <StatCard label="المصروف الفعلي" value={totals.actual} format={money.whole} compact icon={<Target className="size-4" />} tone={totals.actual > totals.plan ? "danger" : undefined} hint={totals.plan ? `${formatNumber(Math.round((totals.actual * 100) / totals.plan), prefs.digits)}٪ مستهلك` : undefined} />
            <StatCard label="الإيرادات المستهدفة" value={totals.revenue} format={money.whole} compact icon={<Target className="size-4" />} />
            <StatCard label="بنود متجاوزة" value={d.rows.filter((r) => r.type === "EXPENSE" && r.state === "OVER").length} tone={d.rows.some((r) => r.type === "EXPENSE" && r.state === "OVER") ? "danger" : undefined} icon={<Target className="size-4" />} />
          </section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2"><Tag color={BUDGET_STATUS[d.budget.status]?.color}>{BUDGET_STATUS[d.budget.status]?.label}</Tag><span className="text-[13px] text-fg-3">التنبيه البرتقالي عند {formatNumber(d.warnBp / 100, prefs.digits)}٪ والأحمر عند التجاوز</span></span>
            <Segmented value={view} onChange={setView} options={[{ value: "plan", label: "الخطة الشهرية" }, { value: "actual", label: "الفعلي مقابل الموازنة" }]} />
          </div>
          {!d.rows.length ? (
            <EmptyState illustration="table" title="الموازنة فارغة" description="أضف بنوداً أو انسخها من الفعلي للعام السابق أو من موازنة سابقة." action={d.canEdit ? <Button variant="primary" onClick={() => setDialog("copy")}>نسخ</Button> : undefined} />
          ) : view === "plan" ? (
            <FinTable dense className="max-w-full" head={<tr><th className="sticky start-0 bg-card">البند</th>{d.months.map((m) => <th key={m} className="text-end">{monthName(m)}</th>)}<th className="text-end">الإجمالي</th></tr>}>
              {d.rows.map((r) => (
                <tr key={`${r.accountId}|${r.costCenterId}`} className={cn(d.canEdit && "cursor-pointer")} onClick={() => d.canEdit && (setEditRow(r), setDialog("row"))}>
                  <td className="sticky start-0 whitespace-nowrap bg-card"><span className="tabular text-fg-3">{r.code}</span> {r.name}{r.costCenter ? <span className="text-[11px] text-fg-3"> · {r.costCenter}</span> : null}{r.type === "REVENUE" ? <Tag size="sm" color="green" className="ms-1">إيراد</Tag> : null}</td>
                  {d.months.map((m) => <td key={m} className={num}>{r.months[m] ? money.fmt(r.months[m]!, false) : ""}</td>)}
                  <td className={cn(num, "font-semibold")}>{money.fmt(r.totalMinor, false)}</td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <FinTable head={<tr><th>البند</th><th className="text-end">الموازنة</th><th className="text-end">الفعلي</th><th className="text-end">المتبقي</th><th className="w-48">الاستهلاك</th></tr>}>
              {d.rows.map((r) => (
                <tr key={`${r.accountId}|${r.costCenterId}`}>
                  <td><span className="tabular text-fg-3">{r.code}</span> {r.name}{r.costCenter ? <span className="text-[11px] text-fg-3"> · {r.costCenter}</span> : null}</td>
                  <td className={num}>{money.fmt(r.totalMinor, false)}</td>
                  <td className={cn(num, r.state === "OVER" && r.type === "EXPENSE" && "font-semibold text-danger-700")}>{money.fmt(r.actualMinor, false)}</td>
                  <td className={num}>{money.fmt(r.totalMinor - r.actualMinor, false)}</td>
                  <td><div className="flex items-center gap-2"><UsageBar usedBp={r.usedBp} state={r.type === "REVENUE" ? "OK" : r.state} /><span className="w-10 text-end text-[12px] tabular">{formatNumber(Math.floor(r.usedBp / 100), prefs.digits)}٪</span></div></td>
                </tr>
              ))}
            </FinTable>
          )}
          <div className="mt-5 max-w-md rounded-lg bg-card p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-semibold">مسار الاعتماد</h2>
            <ApprovalTimeline approval={d.approval} />
          </div>
          {dialog === "row" ? <RowDialog budget={d} row={editRow} onClose={() => setDialog(null)} /> : null}
          {dialog === "copy" ? <CopyDialog budgetId={id} onClose={() => setDialog(null)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

function RowDialog({ budget, row, onClose }: { budget: Detail; row: Row | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const money = useMoney();
  const [v, setV] = useState({ accountId: row?.accountId ?? "", costCenterId: row?.costCenterId ?? "", months: { ...(row?.months ?? {}) } as Record<string, number> });
  const [spread, setSpread] = useState<number | null>(null);
  const m = trpc.budget.setRow.useMutation({ onSuccess: () => (toast.success("حُفظ البند"), void utils.budget.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const total = Object.values(v.months).reduce((s, x) => s + x, 0);
  const distribute = () => {
    if (!spread) return;
    const n = budget.months.length;
    const base = Math.floor(spread / n);
    const out: Record<string, number> = {};
    budget.months.forEach((mo, i) => (out[mo] = base + (i < spread - base * n ? 1 : 0)));
    setV({ ...v, months: out });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={row ? `${row.code} ${row.name}` : "بند موازنة"} width={720}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-2">
          <Field label="الحساب"><Select value={v.accountId || undefined} onChange={(accountId) => setV({ ...v, accountId })} options={budget.accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))} /></Field>
          <Field label="مركز التكلفة"><Select value={v.costCenterId || "NONE"} onChange={(c) => setV({ ...v, costCenterId: c === "NONE" ? "" : c })} options={[{ value: "NONE", label: "كل المراكز" }, ...budget.costCenters.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
          <div className="col-span-2 flex items-end gap-2">
            <Field label="توزيع مبلغ سنوي بالتساوي" className="flex-1"><MoneyInput value={spread} onChange={setSpread} /></Field>
            <Button onClick={distribute} disabled={!spread}>توزيع</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-4">
          {budget.months.map((mo) => (
            <Field key={mo} label={`${monthName(mo)} ${mo.slice(0, 4)}`}><MoneyInput value={v.months[mo] ?? null} onChange={(a) => setV({ ...v, months: { ...v.months, [mo]: a ?? 0 } })} /></Field>
          ))}
        </div>
        <p className="px-5 pb-2 text-end text-[14px] font-semibold">الإجمالي {money.fmt(total)}</p>
        <DialogFooter>
          {row ? <Button variant="ghost" className="me-auto text-danger-700" icon={<Trash2 className="size-3.5" />} onClick={() => m.mutate({ budgetId: budget.budget.id, accountId: row.accountId, costCenterId: row.costCenterId, months: {}, remove: true })}>حذف البند</Button> : null}
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.accountId} onClick={() => m.mutate({ budgetId: budget.budget.id, accountId: v.accountId, costCenterId: v.costCenterId || null, previousCostCenterId: row ? row.costCenterId : undefined, months: v.months })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({ budgetId, onClose }: { budgetId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const list = trpc.budget.list.useQuery();
  const [v, setV] = useState({ kind: "actual" as "actual" | "budget", sourceId: "", upliftBp: 500 });
  const m = trpc.budget.copy.useMutation({ onSuccess: (r) => (toast.success(`نُسخ ${r.lines} بنداً شهرياً`), void utils.budget.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const sources = v.kind === "budget" ? (list.data?.budgets ?? []).filter((b) => b.id !== budgetId).map((b) => ({ value: b.id, label: `${b.name} — ${b.fiscalYear}` })) : (list.data?.years ?? []).map((y) => ({ value: y.id, label: `الفعلي: ${y.name}` }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="نسخ الموازنة" description="يستبدل بنود هذه الموازنة؛ الأشهر تُطابق بترتيبها في العامين." width={480}>
        <div className="grid gap-3 px-5 pb-4">
          <Segmented value={v.kind} onChange={(kind) => setV({ ...v, kind, sourceId: "" })} options={[{ value: "actual", label: "من الفعلي" }, { value: "budget", label: "من موازنة سابقة" }]} />
          <Field label="المصدر"><Select value={v.sourceId || undefined} onChange={(sourceId) => setV({ ...v, sourceId })} options={sources} /></Field>
          <Field label="نسبة الزيادة ٪" hint="سالبة للتخفيض"><PercentInput bp={v.upliftBp} onChange={(upliftBp) => setV({ ...v, upliftBp })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.sourceId} onClick={() => m.mutate({ budgetId, source: v.kind === "budget" ? { budgetId: v.sourceId } : { actualFiscalYearId: v.sourceId }, upliftBp: v.upliftBp })}>نسخ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetSettingsPage() {
  return (
    <ModuleShell nav={nav()} tabs={TABS}>
      <ModuleSettingsForm<{ budgetControl: "NONE" | "WARN" | "BLOCK"; budgetWarnBp: number; autoDepreciation: boolean } & Record<string, unknown>> settingsKey="finance" title="الرقابة على الموازنة والإهلاك" description="تُطبق عند الصرف من المشتريات والصيانة والنقل على الحسابات التي لها بنود في الموازنة المعتمدة.">
        {(v, set, canEdit) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عند تجاوز الموازنة">
              <Select disabled={!canEdit} value={v.budgetControl} onChange={(budgetControl) => set({ budgetControl: budgetControl as "WARN" })} options={[{ value: "NONE", label: "بلا رقابة" }, { value: "WARN", label: "تنبيه فقط" }, { value: "BLOCK", label: "منع العملية" }]} />
            </Field>
            <Field label="التنبيه البرتقالي عند استهلاك ٪"><PercentInput disabled={!canEdit} bp={v.budgetWarnBp} onChange={(budgetWarnBp) => set({ budgetWarnBp })} /></Field>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.autoDepreciation} onChange={(autoDepreciation) => set({ autoDepreciation })} /> ترحيل إهلاك الشهر المنصرم تلقائياً (المهمة اليومية)</label>
            <p className="text-[12px] text-fg-3"><Settings2 className="me-1 inline size-3.5" />بقية إعدادات المالية في «إعداد الرسوم ← الإعدادات».</p>
          </div>
        )}
      </ModuleSettingsForm>
    </ModuleShell>
  );
}
