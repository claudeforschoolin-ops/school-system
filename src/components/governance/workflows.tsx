"use client";
/**
 * سير العمل والموافقات: قائمة أنواع الطلبات ومساراتها، والمحرر المرئي (خطوات قابلة للسحب،
 * المعتمد، المهلة والتصعيد، شروط المبلغ) مع محاكي يبيّن الخطوات المنطبقة، ومراقبة المهل والاختناقات.
 */
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlarmClock, ArrowLeft, Flag, GripVertical, Plus, RotateCcw, Save, Trash2, User, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { applyWorkflow, SLA_LABEL, validateWorkflow, type Approver, type SlaState, type WorkflowStep } from "@/lib/workflows/engine";
import { formatNumber } from "@/lib/numbers";
import { MODULE_NAV } from "@/lib/modules-nav";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell, type ModuleTab } from "@/components/modules/module-shell";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { FinTable, MoneyInput, num, useFmtDate, useMoney } from "@/components/finance/common";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";

export const govNav = (key: string) => MODULE_NAV.find((m) => m.key === key)!;
export const WORKFLOW_TABS: ModuleTab[] = [
  { href: "/workflows", label: "مسارات الموافقة", exact: true },
  { href: "/workflows/monitor", label: "مراقبة المهل" },
  { href: "/workflows/automations", label: "قواعد الأتمتة" },
];

const SLA_COLOR: Record<SlaState, "gray" | "green" | "gold" | "red" | "purple"> = { NO_SLA: "gray", ON_TIME: "green", DUE_SOON: "gold", OVERDUE: "red", ESCALATED: "purple" };

// =====================================================================
// القائمة
// =====================================================================

export function WorkflowsPage() {
  const q = trpc.workflows.list.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  return (
    <ModuleShell nav={govNav("workflows")} tabs={WORKFLOW_TABS} wide>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض المسارات" description={q.error.message} /> : null}
      {q.isLoading ? <SkeletonLines lines={8} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {q.data?.map((w) => (
          <Link key={w.key} href={`/workflows/${w.key}`} className="rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[15px] font-semibold">{w.label}</p>
                <p className="text-[12px] text-fg-3">{w.description}</p>
              </div>
              {w.custom ? <Tag color="navy">مخصص · إصدار {formatNumber(w.version ?? 1, prefs.digits)}</Tag> : <Tag color="gray">الافتراضي</Tag>}
            </div>
            <ol className="mt-3 flex flex-wrap items-center gap-1 text-[12px]">
              {w.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i ? <ArrowLeft className="size-3 text-fg-4" aria-hidden /> : null}
                  <span className={cn("rounded-full px-2 py-0.5", s.conditional ? "border border-dashed border-line-strong text-fg-2" : "bg-hover text-fg")}>
                    {s.name}
                    {s.dueHours ? <span className="text-fg-3"> · {formatNumber(s.dueHours, prefs.digits)}س</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex flex-wrap gap-x-4 text-[12px] text-fg-3">
              <span>معلّقة: <b className="text-fg">{formatNumber(w.pending, prefs.digits)}</b></span>
              {w.overdue ? <span className="text-danger-700">متأخرة: {formatNumber(w.overdue, prefs.digits)}</span> : null}
              <span>متوسط القرار: {w.avgHours === null ? "—" : `${formatNumber(w.avgHours, prefs.digits)} ساعة`}</span>
              {w.updatedAt ? <span>عُدّل {fmtDate(w.updatedAt)}</span> : null}
            </p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-fg-3">المسارات المعدّلة تسري على الطلبات الجديدة فقط؛ الطلبات القائمة تكمل بخطواتها وقت تقديمها. تحويلات الطلاب مسارها مرتبط بالمخالصة المالية فلا يُعدَّل من هنا.</p>
    </ModuleShell>
  );
}

// =====================================================================
// المحرر المرئي
// =====================================================================

type Detail = RouterOutputs["workflows"]["get"];

export function WorkflowEditorPage({ type }: { type: string }) {
  const q = trpc.workflows.get.useQuery({ type });
  if (q.error) return <ModuleShell nav={govNav("workflows")} title="مسار"><EmptyState illustration="lock" title="لا يمكن فتح المسار" description={q.error.message} /></ModuleShell>;
  if (!q.data) return <ModuleShell nav={govNav("workflows")} title="مسار"><SkeletonLines lines={8} /></ModuleShell>;
  return <Editor key={`${type}-${q.data.custom?.version ?? 0}`} d={q.data} />;
}

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${seq++}`;

function Editor({ d }: { d: Detail }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [steps, setSteps] = useState<WorkflowStep[]>(() => (d.custom?.steps ?? d.defaultSteps).map((s) => ({ ...s, key: s.key || newKey() })));
  const [active, setActive] = useState(d.custom?.isActive ?? true);
  const [selected, setSelected] = useState<string | null>(steps[0]?.key ?? null);
  const [sim, setSim] = useState<{ amount: number | null; manager: boolean }>({ amount: null, manager: true });
  const [confirmReset, setConfirmReset] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const errors = validateWorkflow(steps, d.type);
  const applied = useMemo(() => {
    const r = applyWorkflow(steps, { amountMinor: d.type.hasAmount ? sim.amount : null, managerUserId: d.type.hasManager && sim.manager ? "manager" : null, requesterId: "requester" });
    return new Set(r.map((x) => x.name));
  }, [steps, sim, d.type]);
  const save = trpc.workflows.save.useMutation({ onSuccess: () => (toast.success("حُفظ المسار؛ يسري على الطلبات الجديدة"), void utils.workflows.invalidate()), onError: (e) => toast.error(e.message) });
  const reset = trpc.workflows.reset.useMutation({ onSuccess: () => (toast.success("عاد المسار إلى الافتراضي"), void utils.workflows.invalidate(), router.refresh()), onError: (e) => toast.error(e.message) });
  const sel = steps.find((s) => s.key === selected) ?? null;
  const update = (key: string, patch: Partial<WorkflowStep>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const insertAt = (i: number) => {
    const step: WorkflowStep = { key: newKey(), name: "خطوة جديدة", approver: { kind: "ROLE", roleKey: d.roles.find((r) => r.key === "PRINCIPAL")?.key ?? d.roles[0]?.key ?? null } };
    setSteps((all) => [...all.slice(0, i), step, ...all.slice(i)]);
    setSelected(step.key);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setSteps((all) => arrayMove(all, all.findIndex((s) => s.key === e.active.id), all.findIndex((s) => s.key === e.over!.id)));
  };
  const approverLabel = (a: Approver | null | undefined) => (!a ? "مدير المدرسة (افتراضي)" : a.kind === "MANAGER" ? "المدير المباشر" : a.kind === "USER" ? (d.users.find((u) => u.id === a.userId)?.name ?? "مستخدم") : (d.roles.find((r) => r.key === a.roleKey)?.name ?? "دور"));

  return (
    <ModuleShell
      nav={govNav("workflows")}
      wide
      title={d.type.label}
      crumbs={[{ title: d.type.label }]}
      actions={
        d.canEdit ? (
          <div className="flex items-center gap-2">
            {d.custom ? <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmReset(true)}>المسار الافتراضي</Button> : null}
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={errors.length > 0} onClick={() => save.mutate({ type: d.type.key, isActive: active, steps })}>حفظ المسار</Button>
          </div>
        ) : undefined
      }
    >
      <p className="mb-4 text-[14px] text-fg-3">{d.type.description}. {d.custom ? `مسار مخصص (إصدار ${formatNumber(d.custom.version, prefs.digits)}) — عُدّل ${fmtDate(d.custom.updatedAt)}` : "يُطبَّق المسار الافتراضي حالياً؛ عدّله واحفظه ليصبح مخصصاً."}</p>

      {/* المخطط */}
      <section className="rounded-lg bg-card p-5 shadow-card" aria-label="مخطط المسار">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-2 thin-scroll">
            <Terminal icon={<User className="size-4" />} label="مقدّم الطلب" />
            <Connector onAdd={d.canEdit ? () => insertAt(0) : undefined} />
            <SortableContext items={steps.map((s) => s.key)} strategy={horizontalListSortingStrategy}>
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-stretch gap-2">
                  <StepCard step={s} index={i} selected={s.key === selected} applies={applied.has(s.name)} onSelect={() => setSelected(s.key)} approver={approverLabel(s.approver)} escalate={s.dueHours ? approverLabel(s.escalate) : null} money={money.whole} digits={prefs.digits} draggable={d.canEdit} />
                  <Connector onAdd={d.canEdit ? () => insertAt(i + 1) : undefined} />
                </div>
              ))}
            </SortableContext>
            <Terminal icon={<Flag className="size-4" />} label="التنفيذ" />
          </div>
        </DndContext>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-[13px]">
          <span className="font-medium">محاكاة طلب:</span>
          {d.type.hasAmount ? (
            <span className="flex items-center gap-2">
              المبلغ <MoneyInput className="h-7 w-36" value={sim.amount} onChange={(amount) => setSim({ ...sim, amount })} aria-label="مبلغ المحاكاة" />
            </span>
          ) : null}
          {d.type.hasManager ? <SwitchRow size="sm" checked={sim.manager} onChange={(manager) => setSim({ ...sim, manager })} label="لمقدّم الطلب مدير مباشر" /> : null}
          <span className="text-fg-3">الخطوات الباهتة لا تنطبق على هذا الطلب</span>
        </div>
      </section>

      {errors.length ? (
        <ul className="mt-3 space-y-1 rounded-md border border-danger-700/30 p-3 text-[13px] text-danger-700" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {sel && d.canEdit ? (
          <section className="rounded-lg bg-card p-5 shadow-card" aria-label="إعداد الخطوة">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">إعداد الخطوة {formatNumber(steps.indexOf(sel) + 1, prefs.digits)}</h2>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={steps.length <= 1} onClick={() => (setSteps(steps.filter((s) => s.key !== sel.key)), setSelected(steps.find((s) => s.key !== sel.key)?.key ?? null))}>حذف الخطوة</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم الخطوة"><Input value={sel.name} onChange={(e) => update(sel.key, { name: e.target.value })} /></Field>
              <ApproverField label="المعتمد" value={sel.approver} onChange={(approver) => approver && update(sel.key, { approver })} d={d} allowManager={d.type.hasManager} />
              <Field label="المهلة (ساعات)" hint="فارغ = بلا مهلة ولا تصعيد">
                <Input type="number" min={1} max={720} value={sel.dueHours ?? ""} onChange={(e) => update(sel.key, { dueHours: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              {sel.dueHours ? <ApproverField label="التصعيد بعد المهلة إلى" value={sel.escalate ?? null} onChange={(escalate) => update(sel.key, { escalate })} d={d} allowManager={d.type.hasManager} optional /> : <div />}
              {d.type.hasAmount ? (
                <>
                  <Field label="تنطبق إذا كان المبلغ من" hint="فارغ = بلا حد أدنى"><MoneyInput value={sel.minAmountMinor ?? null} onChange={(minAmountMinor) => update(sel.key, { minAmountMinor })} /></Field>
                  <Field label="إلى" hint="فارغ = بلا حد أعلى"><MoneyInput value={sel.maxAmountMinor ?? null} onChange={(maxAmountMinor) => update(sel.key, { maxAmountMinor })} /></Field>
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="rounded-lg bg-card p-5 text-[13px] text-fg-3 shadow-card">{d.canEdit ? "اختر خطوة من المخطط لتعديلها، أو أضف خطوة بزر + بين الخطوات." : "العرض فقط: تعديل المسارات لمن يملك صلاحية تعديل سير العمل."}</section>
        )}
        <aside className="space-y-4">
          {d.canEdit ? (
            <div className="rounded-lg bg-card p-4 shadow-card">
              <SwitchRow checked={active} onChange={setActive} label="تفعيل المسار المخصص" />
              <p className="mt-1 text-[12px] text-fg-3">عند الإيقاف يعود النظام للمسار الافتراضي مع الإبقاء على هذا التصميم محفوظاً.</p>
            </div>
          ) : null}
          <div className="rounded-lg bg-card p-4 shadow-card">
            <h3 className="mb-2 text-[13px] font-medium">سجل التعديلات</h3>
            {d.history.length ? (
              <ul className="space-y-1.5 text-[12px]">
                {d.history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2"><span>{h.userName ?? "النظام"}</span><span className="text-fg-3">{fmtDate(h.createdAt)}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-fg-3">لم يُعدَّل بعد.</p>
            )}
          </div>
        </aside>
      </div>
      {confirmReset ? (
        <Dialog open onOpenChange={(o) => !o && setConfirmReset(false)}>
          <DialogContent title="العودة للمسار الافتراضي" description="يُحذف التخصيص وتعود الطلبات الجديدة للمسار الافتراضي. الطلبات القائمة لا تتأثر." width={440}>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>تراجع</Button>
              <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate({ type: d.type.key }, { onSuccess: () => setConfirmReset(false) })}>عودة للافتراضي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ModuleShell>
  );
}

function Terminal({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-hover px-2 py-3 text-[12px] font-medium text-fg-2">
      {icon}
      {label}
    </div>
  );
}

function Connector({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1">
      <ArrowLeft className="size-4 text-fg-4" aria-hidden />
      {onAdd ? (
        <button type="button" onClick={onAdd} className="grid size-5 place-items-center rounded-full border border-line bg-card text-fg-3 hover:text-fg" aria-label="إضافة خطوة هنا">
          <Plus className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function StepCard({ step, index, selected, applies, onSelect, approver, escalate, money, digits, draggable }: { step: WorkflowStep; index: number; selected: boolean; applies: boolean; onSelect: () => void; approver: string; escalate: string | null; money: (n: number) => string; digits: "arab" | "latn"; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.key, disabled: !draggable });
  const Icon = step.approver.kind === "MANAGER" ? UserCheck : step.approver.kind === "USER" ? User : Users;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("w-56 shrink-0 rounded-lg border bg-card p-3 text-start transition-opacity", selected ? "border-navy-600 ring-1 ring-navy-600" : "border-line", !applies && "opacity-45", isDragging && "z-10 shadow-drag")}>
      <div className="flex items-start gap-1.5">
        {draggable ? (
          <button type="button" {...attributes} {...listeners} className="mt-0.5 cursor-grab text-fg-4 active:cursor-grabbing" aria-label={`إعادة ترتيب ${step.name}`}>
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start">
          <span className="block text-[11px] text-fg-3">الخطوة {formatNumber(index + 1, digits)}</span>
          <span className="block truncate text-[14px] font-semibold">{step.name}</span>
          <span className="mt-1 flex items-center gap-1 text-[12px] text-fg-2"><Icon className="size-3.5 text-fg-3" aria-hidden />{approver}</span>
          {step.dueHours ? <span className="mt-1 flex items-center gap-1 text-[12px] text-fg-3"><AlarmClock className="size-3.5" aria-hidden />خلال {formatNumber(step.dueHours, digits)} ساعة ← {escalate}</span> : null}
          {step.minAmountMinor || step.maxAmountMinor ? (
            <span className="mt-1 block text-[12px] text-fg-3">
              {step.minAmountMinor ? `من ${money(step.minAmountMinor)}` : ""}
              {step.minAmountMinor && step.maxAmountMinor ? " " : ""}
              {step.maxAmountMinor ? `حتى ${money(step.maxAmountMinor)}` : ""}
            </span>
          ) : null}
          {!applies ? <span className="mt-1 block text-[11px] text-fg-3">لا تنطبق على طلب المحاكاة</span> : null}
        </button>
      </div>
    </div>
  );
}

function ApproverField({ label, value, onChange, d, allowManager, optional }: { label: string; value: Approver | null; onChange: (a: Approver | null) => void; d: Detail; allowManager: boolean; optional?: boolean }) {
  const kind = value?.kind ?? "DEFAULT";
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <Select
          size="sm"
          className="w-32"
          value={kind}
          onChange={(k) => onChange(k === "DEFAULT" ? null : k === "MANAGER" ? { kind: "MANAGER" } : k === "USER" ? { kind: "USER", userId: d.users[0]?.id ?? null } : { kind: "ROLE", roleKey: d.roles[0]?.key ?? null })}
          options={[...(optional ? [{ value: "DEFAULT", label: "مدير المدرسة" }] : []), { value: "ROLE", label: "دور" }, { value: "USER", label: "مستخدم" }, ...(allowManager ? [{ value: "MANAGER", label: "المدير المباشر" }] : [])]}
        />
        {value?.kind === "ROLE" ? <Select size="sm" className="min-w-0 flex-1" value={value.roleKey ?? ""} onChange={(roleKey) => onChange({ kind: "ROLE", roleKey })} options={d.roles.map((r) => ({ value: r.key, label: r.name }))} /> : null}
        {value?.kind === "USER" ? <Select size="sm" className="min-w-0 flex-1" value={value.userId ?? ""} onChange={(userId) => onChange({ kind: "USER", userId })} options={d.users.map((u) => ({ value: u.id, label: u.jobTitle ? `${u.name} — ${u.jobTitle}` : u.name }))} /> : null}
      </div>
    </Field>
  );
}

// =====================================================================
// مراقبة المهل
// =====================================================================

export function WorkflowMonitorPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useApp();
  const types = trpc.workflows.list.useQuery();
  const type = params.get("type");
  const state = params.get("state");
  const q = trpc.workflows.monitor.useQuery({ type, state }, { placeholderData: (p) => p });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const set = (k: string, v: string | null) => {
    const s = new URLSearchParams(params.toString());
    if (v) s.set(k, v);
    else s.delete(k);
    router.replace(`/workflows/monitor?${s.toString()}`);
  };
  const hours = (h: number) => `${formatNumber(h, prefs.digits)} س`;
  return (
    <ModuleShell nav={govNav("workflows")} tabs={WORKFLOW_TABS} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-52" value={type ?? "ALL"} onChange={(v) => set("type", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "كل أنواع الطلبات" }, ...(types.data ?? []).map((t) => ({ value: t.key, label: t.label }))]} />
        <Segmented value={state ?? "ALL"} onChange={(v) => set("state", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "الكل" }, { value: "DUE_SOON", label: SLA_LABEL.DUE_SOON }, { value: "OVERDUE", label: SLA_LABEL.OVERDUE }, { value: "ESCALATED", label: SLA_LABEL.ESCALATED }]} />
      </div>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض المراقبة" description={q.error.message} /> : null}
      {q.data ? (
        <div className={cn("space-y-5 transition-opacity", q.isFetching && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { k: "total", label: "طلبات معلّقة", v: q.data.counts.total },
              { k: "soon", label: SLA_LABEL.DUE_SOON, v: q.data.counts.dueSoon },
              { k: "over", label: SLA_LABEL.OVERDUE, v: q.data.counts.overdue },
              { k: "esc", label: SLA_LABEL.ESCALATED, v: q.data.counts.escalated },
            ].map((c) => (
              <div key={c.k} className="rounded-lg bg-card p-4 shadow-card">
                <p className="text-[13px] text-fg-3">{c.label}</p>
                <p className="mt-2 text-[26px] font-bold">{formatNumber(c.v, prefs.digits)}</p>
              </div>
            ))}
          </div>
          {q.data.rows.length ? (
            <FinTable head={<tr><th>الطلب</th><th>النوع</th><th>الخطوة الحالية</th><th>المعتمد</th><th className="text-end">الانتظار</th><th>المهلة</th><th>الحالة</th></tr>}>
              {q.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[320px]">
                    {r.link ? <Link href={r.link} className="font-medium hover:underline">{r.title}</Link> : <span className="font-medium">{r.title}</span>}
                    <p className="text-[12px] text-fg-3">{r.requester} · {fmtDate(r.createdAt)}</p>
                  </td>
                  <td>{r.typeLabel}</td>
                  <td>{r.step} <span className="text-[12px] text-fg-3">({r.stepOf})</span></td>
                  <td>{r.approver}{r.escalatedTo ? <p className="text-[12px] text-fg-3">+ {r.escalatedTo}</p> : null}</td>
                  <td className={num}>{hours(r.waitingHours)}</td>
                  <td className="whitespace-nowrap text-[12px] text-fg-2">{r.dueAt ? fmtDate(r.dueAt) : "—"}{r.hoursLeft !== null && r.hoursLeft >= 0 ? ` · باقٍ ${hours(r.hoursLeft)}` : ""}</td>
                  <td><Tag color={SLA_COLOR[r.state]}>{SLA_LABEL[r.state]}</Tag></td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <EmptyState compact illustration="inbox" title="لا طلبات معلّقة بهذه الحالة" description="كل الطلبات ضمن مهلها أو لا طلبات قائمة." />
          )}
          {q.data.bottlenecks.length ? (
            <ChartCard title="أبطأ الخطوات" subtitle="متوسط ساعات القرار خلال ٩٠ يوماً" table={{ columns: ["الخطوة", "الساعات", "القرارات"], rows: q.data.bottlenecks.map((b) => [b.label, b.hours, b.decisions]) }}>
              <HBars data={q.data.bottlenecks.map((b) => ({ key: b.key, label: b.label, value: b.hours, hint: `${b.decisions} قراراً` }))} format={hours} labelWidth={260} />
            </ChartCard>
          ) : null}
          {!can("workflows", "update") ? null : <p className="text-[12px] text-fg-3">التصعيد يتم آلياً كل ساعة عبر المهمة الدورية، ويُذكَّر المعتمد قبل انقضاء المهلة بربعها.</p>}
        </div>
      ) : q.isLoading ? (
        <SkeletonLines lines={8} />
      ) : null}
    </ModuleShell>
  );
}
