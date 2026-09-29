"use client";
/**
 * إعداد الرسوم: البنود وحساباتها وضريبتها، جداول الرسوم لكل صف/مرحلة، خطط الأقساط وغرامة التأخير،
 * أنواع الخصومات والمنح (ومنها خصم الأشقاء بالشرائح)، رموز الضريبة، وإعدادات المالية العامة.
 */
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DISCOUNT_KIND, FEE_KIND, type DiscountKindKey, type FeeKindKey } from "@/lib/finance/labels";
import { formatNumber, formatPercent } from "@/lib/numbers";
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
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import {
  FinTable,
  financeNav,
  MoneyInput,
  num,
  PercentInput,
  SETUP_TABS,
  useFmtDate,
  useMoney,
} from "./common";

type Setup = RouterOutputs["finance"]["setup"]["get"];

function SetupShell({
  children,
  action,
}: {
  children: (s: Setup) => ReactNode;
  action?: (s: Setup) => ReactNode;
}) {
  const q = trpc.finance.setup.get.useQuery();
  return (
    <ModuleShell
      nav={financeNav("fee-setup")}
      tabs={SETUP_TABS}
      wide
      actions={q.data && q.data.canEdit && action ? action(q.data) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض إعداد الرسوم" description={q.error.message} />
      ) : q.data ? (
        children(q.data)
      ) : (
        <SkeletonLines lines={10} />
      )}
    </ModuleShell>
  );
}

function useSave<T>(msg: string) {
  const utils = trpc.useUtils();
  return {
    onSuccess: (_: T) => {
      toast.success(msg);
      void utils.finance.setup.get.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
}

const accountLabel = (s: Setup, id: string | null | undefined) => {
  const a = s.accounts.find((x) => x.id === id);
  return a ? `${a.code} — ${a.name}` : "—";
};

// ---------------------------------------------------------------------
// بنود الرسوم
// ---------------------------------------------------------------------

type ItemForm = {
  id: string | null;
  code: string;
  name: string;
  kind: FeeKindKey;
  revenueAccountId: string;
  receivableAccountId: string;
  deferred: boolean;
  taxCodeId: string | null;
  citizenTaxCodeId: string | null;
  refundable: boolean;
  isActive: boolean;
};

export function FeeItemsPage() {
  const [editing, setEditing] = useState<ItemForm | null>(null);
  return (
    <SetupShell
      action={(s) => (
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setEditing({
              id: null,
              code: "",
              name: "",
              kind: "OTHER",
              revenueAccountId: s.accounts.find((a) => a.type === "REVENUE")?.id ?? "",
              receivableAccountId:
                s.accounts.find((a) => a.code === "1212")?.id ??
                s.accounts.find((a) => a.type === "ASSET")?.id ??
                "",
              deferred: false,
              taxCodeId: s.taxCodes.find((t) => t.rateBp === 1500)?.id ?? null,
              citizenTaxCodeId: null,
              refundable: true,
              isActive: true,
            })
          }
        >
          بند رسوم
        </Button>
      )}
    >
      {(s) => (
        <>
          <FinTable
            head={
              <tr>
                <th>البند</th>
                <th>النوع</th>
                <th>حساب الإيراد</th>
                <th>الضريبة</th>
                <th>للمواطن</th>
                <th>الحالة</th>
                <th className="w-9" />
              </tr>
            }
          >
            {s.items.map((i) => (
              <tr key={i.id} className={cn(!i.isActive && "text-fg-3")}>
                <td>
                  {i.name}
                  <span className="block text-[11px] text-fg-3">
                    <bdi dir="ltr">{i.code}</bdi>
                    {i.deferred ? " · إيراد مؤجل" : ""}
                    {!i.refundable ? " · غير مسترد" : ""}
                  </span>
                </td>
                <td>
                  <Tag size="sm" color={FEE_KIND[i.kind].color}>
                    {FEE_KIND[i.kind].label}
                  </Tag>
                </td>
                <td className="text-fg-2">{accountLabel(s, i.revenueAccountId)}</td>
                <td>{s.taxCodes.find((t) => t.id === i.taxCodeId)?.name ?? "—"}</td>
                <td>
                  {i.citizenTaxCodeId ? s.taxCodes.find((t) => t.id === i.citizenTaxCodeId)?.name : "كالمقيم"}
                </td>
                <td>
                  {i.isActive ? (
                    <Tag size="sm" color="green">
                      نشط
                    </Tag>
                  ) : (
                    <Tag size="sm" color="gray">
                      معطّل
                    </Tag>
                  )}
                </td>
                <td>
                  {s.canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="تعديل"
                      onClick={() => setEditing({ ...i, kind: i.kind as FeeKindKey })}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">
            الرسوم الدراسية تُقيَّد إيراداً مؤجلاً يُعترف به شهرياً في حساب إيراد مرحلة الطالب. ضريبة
            «للمواطن» تُطبق على الطلاب السعوديين (قرار توطين التعليم).
          </p>
          {editing ? <ItemDialog setup={s} value={editing} onClose={() => setEditing(null)} /> : null}
        </>
      )}
    </SetupShell>
  );
}

function ItemDialog({ setup, value, onClose }: { setup: Setup; value: ItemForm; onClose: () => void }) {
  const [v, setV] = useState(value);
  const m = trpc.finance.setup.saveItem.useMutation(useSave("حُفظ البند"));
  const taxOpts = [
    { value: "none", label: "بدون" },
    ...setup.taxCodes.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })),
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={v.id ? "تعديل بند" : "بند رسوم جديد"} width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
          </Field>
          <Field label="النوع">
            <Select
              value={v.kind}
              onChange={(k) =>
                setV({ ...v, kind: k as FeeKindKey, deferred: k === "TUITION" ? true : v.deferred })
              }
              options={Object.entries(FEE_KIND).map(([value, o]) => ({ value, label: o.label }))}
            />
          </Field>
          <Field label="حساب الذمم">
            <Select
              value={v.receivableAccountId}
              onChange={(a) => setV({ ...v, receivableAccountId: a })}
              options={setup.accounts
                .filter((a) => a.type === "ASSET")
                .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            />
          </Field>
          <Field label="حساب الإيراد" className="col-span-2">
            <Select
              value={v.revenueAccountId}
              onChange={(a) => setV({ ...v, revenueAccountId: a })}
              options={setup.accounts
                .filter((a) => a.type === "REVENUE")
                .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            />
          </Field>
          <Field label="الضريبة">
            <Select
              value={v.taxCodeId ?? "none"}
              onChange={(t) => setV({ ...v, taxCodeId: t === "none" ? null : t })}
              options={taxOpts}
            />
          </Field>
          <Field label="الضريبة للطالب المواطن">
            <Select
              value={v.citizenTaxCodeId ?? "none"}
              onChange={(t) => setV({ ...v, citizenTaxCodeId: t === "none" ? null : t })}
              options={[{ value: "none", label: "كالمقيم" }, ...taxOpts.slice(1)]}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.deferred} onChange={(on) => setV({ ...v, deferred: on })} /> إيراد مؤجل
            (يُعترف به شهرياً)
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.refundable} onChange={(on) => setV({ ...v, refundable: on })} /> قابل
            للاسترداد عند الانسحاب
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={
              v.name.trim().length < 2 || !v.code.trim() || !v.revenueAccountId || !v.receivableAccountId
            }
            onClick={() => m.mutate(v, { onSuccess: onClose })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// جداول الرسوم
// ---------------------------------------------------------------------

type ScheduleForm = {
  id: string | null;
  academicYearId: string;
  name: string;
  branchId: string | null;
  stageId: string | null;
  gradeId: string | null;
  isActive: boolean;
  lines: Array<{ feeItemId: string; amountMinor: number | null; optional: boolean }>;
};

export function SchedulesPage() {
  const money = useMoney();
  const [editing, setEditing] = useState<ScheduleForm | null>(null);
  const [year, setYear] = useState<string | null>(null);
  return (
    <SetupShell
      action={(s) => (
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setEditing({
              id: null,
              academicYearId: year ?? s.years.find((y) => y.isCurrent)?.id ?? s.years[0]?.id ?? "",
              name: "",
              branchId: null,
              stageId: null,
              gradeId: null,
              isActive: true,
              lines: [],
            })
          }
        >
          جدول رسوم
        </Button>
      )}
    >
      {(s) => {
        const y = year ?? s.years.find((x) => x.isCurrent)?.id ?? s.years[0]?.id ?? "";
        const list = s.schedules.filter((x) => x.academicYearId === y);
        const scope = (x: (typeof list)[number]) =>
          (x.gradeId
            ? s.grades.find((g) => g.id === x.gradeId)?.name
            : x.stageId
              ? s.stages.find((st) => st.id === x.stageId)?.name
              : "كل المراحل") + (x.branchId ? ` · ${s.branches.find((b) => b.id === x.branchId)?.name}` : "");
        return (
          <>
            <div className="mb-3 flex items-center gap-3">
              <Select
                size="sm"
                className="w-52"
                value={y}
                onChange={setYear}
                options={s.years.map((x) => ({ value: x.id, label: x.name }))}
              />
              <p className="text-[12px] text-fg-3">
                الأدق يغلب: الصف ثم المرحلة ثم العام؛ والفرع المحدد يغلب «كل الفروع».
              </p>
            </div>
            {list.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {list.map((x) => (
                  <article
                    key={x.id}
                    className={cn("rounded-lg bg-card p-4 shadow-card", !x.isActive && "opacity-60")}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[15px] font-semibold">{x.name}</p>
                        <p className="text-[12px] text-fg-3">{scope(x)}</p>
                      </div>
                      {s.canEdit ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="تعديل"
                          onClick={() =>
                            setEditing({
                              ...x,
                              lines: x.lines.map((l) => ({
                                feeItemId: l.feeItemId,
                                amountMinor: l.amountMinor,
                                optional: l.optional,
                              })),
                            })
                          }
                        >
                          <Pencil className="size-3" />
                        </Button>
                      ) : null}
                    </div>
                    <ul className="mt-3 space-y-1 text-[13px]">
                      {x.lines.map((l) => (
                        <li key={l.id} className="flex justify-between gap-2">
                          <span className={cn(l.optional && "text-fg-3")}>
                            {s.items.find((i) => i.id === l.feeItemId)?.name}
                            {l.optional ? " (اختياري)" : ""}
                          </span>
                          <span className="tabular">{money.fmt(l.amountMinor)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 flex justify-between border-t border-line pt-2 text-[13px] font-semibold">
                      <span>الإلزامي</span>
                      <span className="tabular">
                        {money.fmt(x.lines.filter((l) => !l.optional).reduce((a, l) => a + l.amountMinor, 0))}
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                illustration="table"
                title="لا جداول رسوم لهذا العام"
                description="أضف جدولاً لكل مرحلة أو صف لتعمل الفوترة الجماعية ورسوم القبول."
              />
            )}
            {editing ? <ScheduleDialog setup={s} value={editing} onClose={() => setEditing(null)} /> : null}
          </>
        );
      }}
    </SetupShell>
  );
}

function ScheduleDialog({
  setup,
  value,
  onClose,
}: {
  setup: Setup;
  value: ScheduleForm;
  onClose: () => void;
}) {
  const [v, setV] = useState(value);
  const m = trpc.finance.setup.saveSchedule.useMutation(useSave("حُفظ جدول الرسوم"));
  const items = setup.items.filter((i) => i.isActive && i.kind !== "LATE_FEE");
  const setLine = (feeItemId: string, patch: Partial<ScheduleForm["lines"][number]> | null) => {
    const has = v.lines.some((l) => l.feeItemId === feeItemId);
    if (patch === null) return setV({ ...v, lines: v.lines.filter((l) => l.feeItemId !== feeItemId) });
    setV({
      ...v,
      lines: has
        ? v.lines.map((l) => (l.feeItemId === feeItemId ? { ...l, ...patch } : l))
        : [...v.lines, { feeItemId, amountMinor: null, optional: false, ...patch }],
    });
  };
  const valid =
    v.name.trim().length >= 2 && v.lines.length > 0 && v.lines.every((l) => l.amountMinor !== null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={v.id ? "تعديل جدول رسوم" : "جدول رسوم جديد"} width={640}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم" className="col-span-2">
            <Input
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="مثال: رسوم المرحلة الابتدائية"
            />
          </Field>
          <Field label="العام الدراسي">
            <Select
              value={v.academicYearId}
              onChange={(y) => setV({ ...v, academicYearId: y })}
              options={setup.years.map((y) => ({ value: y.id, label: y.name }))}
            />
          </Field>
          <Field label="الفرع">
            <Select
              value={v.branchId ?? "all"}
              onChange={(b) => setV({ ...v, branchId: b === "all" ? null : b })}
              options={[
                { value: "all", label: "كل الفروع" },
                ...setup.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </Field>
          <Field label="المرحلة">
            <Select
              value={v.stageId ?? "all"}
              onChange={(st) => setV({ ...v, stageId: st === "all" ? null : st, gradeId: null })}
              options={[
                { value: "all", label: "كل المراحل" },
                ...setup.stages.map((st) => ({ value: st.id, label: st.name })),
              ]}
            />
          </Field>
          <Field label="الصف (اختياري)">
            <Select
              value={v.gradeId ?? "all"}
              onChange={(g) => setV({ ...v, gradeId: g === "all" ? null : g })}
              options={[
                { value: "all", label: "كل صفوف المرحلة" },
                ...setup.grades
                  .filter((g) => !v.stageId || g.stageId === v.stageId)
                  .map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          </Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">البنود والمبالغ</p>
            <ul className="space-y-1.5">
              {items.map((i) => {
                const l = v.lines.find((x) => x.feeItemId === i.id);
                return (
                  <li key={i.id} className="grid grid-cols-[1fr_130px_90px] items-center gap-2">
                    <label className="flex items-center gap-2 text-[14px]">
                      <Checkbox checked={Boolean(l)} onChange={(on) => setLine(i.id, on ? {} : null)} />
                      {i.name}
                    </label>
                    {l ? (
                      <MoneyInput
                        value={l.amountMinor}
                        onChange={(a) => setLine(i.id, { amountMinor: a })}
                        aria-label={`مبلغ ${i.name}`}
                      />
                    ) : (
                      <span />
                    )}
                    {l ? (
                      <label className="flex items-center gap-1.5 text-[12px] text-fg-2">
                        <Checkbox checked={l.optional} onChange={(on) => setLine(i.id, { optional: on })} />{" "}
                        اختياري
                      </label>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!valid}
            onClick={() =>
              m.mutate(
                { ...v, lines: v.lines.map((l) => ({ ...l, amountMinor: l.amountMinor! })) },
                { onSuccess: onClose },
              )
            }
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// خطط الأقساط
// ---------------------------------------------------------------------

type PlanForm = {
  id: string | null;
  name: string;
  kind: "SINGLE" | "TERMLY" | "MONTHLY" | "CUSTOM";
  parts: Array<{ label: string; weight: number; dueDate: string }>;
  lateFeeKind: "NONE" | "PERCENT" | "FIXED";
  lateFeeValue: number;
  graceDays: number;
  isDefault: boolean;
  isActive: boolean;
};

export function PlansPage() {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const [editing, setEditing] = useState<PlanForm | null>(null);
  const KIND = { SINGLE: "دفعة واحدة", TERMLY: "فصلية", MONTHLY: "شهرية", CUSTOM: "مخصصة" } as const;
  return (
    <SetupShell
      action={() => (
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setEditing({
              id: null,
              name: "",
              kind: "TERMLY",
              parts: [
                { label: "القسط الأول", weight: 50, dueDate: "" },
                { label: "القسط الثاني", weight: 50, dueDate: "" },
              ],
              lateFeeKind: "NONE",
              lateFeeValue: 0,
              graceDays: 7,
              isDefault: false,
              isActive: true,
            })
          }
        >
          خطة أقساط
        </Button>
      )}
    >
      {(s) => (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {s.plans.map((p) => {
              const total = p.parts.reduce((a, x) => a + x.weight, 0) || 1;
              return (
                <article
                  key={p.id}
                  className={cn("rounded-lg bg-card p-4 shadow-card", !p.isActive && "opacity-60")}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[15px] font-semibold">
                        {p.name}{" "}
                        {p.isDefault ? (
                          <Tag size="sm" color="navy">
                            افتراضية
                          </Tag>
                        ) : null}
                      </p>
                      <p className="text-[12px] text-fg-3">
                        {KIND[p.kind as keyof typeof KIND] ?? p.kind} ·{" "}
                        {p.lateFeeKind === "NONE"
                          ? "بلا غرامة تأخير"
                          : `غرامة ${p.lateFeeKind === "PERCENT" ? formatPercent(p.lateFeeValue / 10000, prefs.digits) : money.fmt(p.lateFeeValue)} بعد ${formatNumber(p.graceDays, prefs.digits)} يوماً`}
                      </p>
                    </div>
                    {s.canEdit ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="تعديل"
                        onClick={() =>
                          setEditing({
                            ...p,
                            kind: p.kind as PlanForm["kind"],
                            lateFeeKind: p.lateFeeKind as PlanForm["lateFeeKind"],
                          })
                        }
                      >
                        <Pencil className="size-3" />
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-3 space-y-1 text-[13px]">
                    {p.parts.map((x, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{x.label}</span>
                        <span className="text-fg-3">{fmtDate(x.dueDate)}</span>
                        <span className="tabular">{formatPercent(x.weight / total, prefs.digits)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
          {editing ? <PlanDialog value={editing} onClose={() => setEditing(null)} /> : null}
        </>
      )}
    </SetupShell>
  );
}

function PlanDialog({ value, onClose }: { value: PlanForm; onClose: () => void }) {
  const [v, setV] = useState(value);
  const m = trpc.finance.setup.savePlan.useMutation(useSave("حُفظت الخطة"));
  const valid =
    v.name.trim().length >= 2 &&
    v.parts.length > 0 &&
    v.parts.every((p) => p.label.trim() && p.dueDate && p.weight > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={v.id ? "تعديل خطة أقساط" : "خطة أقساط جديدة"}
        description="الأوزان نسبية؛ يُوزَّع إجمالي الفاتورة عليها بلا فقد هللات، والقسط الذي فات موعده يُستحق عند الإصدار."
        width={620}
      >
        <div className="space-y-3 px-5 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاسم">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="النوع">
              <Select
                value={v.kind}
                onChange={(k) => setV({ ...v, kind: k as PlanForm["kind"] })}
                options={[
                  { value: "SINGLE", label: "دفعة واحدة" },
                  { value: "TERMLY", label: "فصلية" },
                  { value: "MONTHLY", label: "شهرية" },
                  { value: "CUSTOM", label: "مخصصة" },
                ]}
              />
            </Field>
          </div>
          <ul className="space-y-1.5">
            {v.parts.map((p, i) => (
              <li key={i} className="grid grid-cols-[1fr_80px_150px_28px] gap-2">
                <Input
                  value={p.label}
                  onChange={(e) =>
                    setV({
                      ...v,
                      parts: v.parts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    })
                  }
                  aria-label="اسم القسط"
                />
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="text-end tabular"
                  value={p.weight}
                  onChange={(e) =>
                    setV({
                      ...v,
                      parts: v.parts.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              weight: Math.max(1, Math.min(100, Math.trunc(Number(e.target.value) || 1))),
                            }
                          : x,
                      ),
                    })
                  }
                  aria-label="الوزن"
                />
                <Input
                  type="date"
                  value={p.dueDate}
                  onChange={(e) =>
                    setV({
                      ...v,
                      parts: v.parts.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)),
                    })
                  }
                  aria-label="تاريخ الاستحقاق"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="حذف"
                  disabled={v.parts.length === 1}
                  onClick={() => setV({ ...v, parts: v.parts.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus className="size-3" />}
            disabled={v.parts.length >= 12}
            onClick={() =>
              setV({
                ...v,
                parts: [...v.parts, { label: `القسط ${v.parts.length + 1}`, weight: 10, dueDate: "" }],
              })
            }
          >
            قسط
          </Button>
          <div className="grid grid-cols-3 gap-3">
            <Field label="غرامة التأخير">
              <Select
                value={v.lateFeeKind}
                onChange={(k) => setV({ ...v, lateFeeKind: k as PlanForm["lateFeeKind"], lateFeeValue: 0 })}
                options={[
                  { value: "NONE", label: "بدون" },
                  { value: "PERCENT", label: "نسبة من القسط" },
                  { value: "FIXED", label: "مبلغ ثابت" },
                ]}
              />
            </Field>
            {v.lateFeeKind === "PERCENT" ? (
              <Field label="النسبة ٪">
                <PercentInput bp={v.lateFeeValue} onChange={(bp) => setV({ ...v, lateFeeValue: bp })} />
              </Field>
            ) : v.lateFeeKind === "FIXED" ? (
              <Field label="المبلغ">
                <MoneyInput value={v.lateFeeValue} onChange={(a) => setV({ ...v, lateFeeValue: a ?? 0 })} />
              </Field>
            ) : (
              <span />
            )}
            <Field label="أيام السماح">
              <Input
                type="number"
                min={0}
                max={120}
                value={v.graceDays}
                onChange={(e) =>
                  setV({
                    ...v,
                    graceDays: Math.max(0, Math.min(120, Math.trunc(Number(e.target.value) || 0))),
                  })
                }
              />
            </Field>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox checked={v.isDefault} onChange={(on) => setV({ ...v, isDefault: on })} /> افتراضية
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشطة
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!valid}
            onClick={() => m.mutate(v, { onSuccess: onClose })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الخصومات والمنح
// ---------------------------------------------------------------------

type DiscountForm = {
  id: string | null;
  code: string;
  name: string;
  kind: DiscountKindKey;
  method: "PERCENT" | "FIXED";
  value: number;
  siblingTiers: Array<{ order: number; valueBp: number }> | null;
  feeItemIds: string[];
  approvalLimitMinor: number | null;
  isActive: boolean;
};

export function DiscountsPage() {
  const prefs = usePrefs();
  const money = useMoney();
  const [editing, setEditing] = useState<DiscountForm | null>(null);
  return (
    <SetupShell
      action={(s) => (
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setEditing({
              id: null,
              code: "",
              name: "",
              kind: "MANUAL",
              method: "PERCENT",
              value: 1000,
              siblingTiers: null,
              feeItemIds: s.items.filter((i) => i.kind === "TUITION").map((i) => i.id),
              approvalLimitMinor: 500000,
              isActive: true,
            })
          }
        >
          نوع خصم
        </Button>
      )}
    >
      {(s) => (
        <>
          <FinTable
            head={
              <tr>
                <th>الخصم</th>
                <th>النوع</th>
                <th>القيمة</th>
                <th>على البنود</th>
                <th>يتطلب اعتماداً فوق</th>
                <th className="w-9" />
              </tr>
            }
          >
            {s.discountTypes.map((d) => (
              <tr key={d.id} className={cn(!d.isActive && "text-fg-3")}>
                <td>{d.name}</td>
                <td>
                  <Tag size="sm" color={DISCOUNT_KIND[d.kind].color}>
                    {DISCOUNT_KIND[d.kind].label}
                  </Tag>
                </td>
                <td className="tabular">
                  {d.kind === "SIBLING" && d.siblingTiers?.length
                    ? d.siblingTiers
                        .map(
                          (t) =>
                            `${formatNumber(t.order, prefs.digits)}: ${formatPercent(t.valueBp / 10000, prefs.digits)}`,
                        )
                        .join(" · ")
                    : d.method === "PERCENT"
                      ? formatPercent(d.value / 10000, prefs.digits)
                      : money.fmt(d.value)}
                </td>
                <td className="text-fg-2">
                  {d.feeItemIds
                    .map((id) => s.items.find((i) => i.id === id)?.name)
                    .filter(Boolean)
                    .join("، ") || "—"}
                </td>
                <td className="tabular">
                  {d.kind === "SIBLING"
                    ? "تلقائي"
                    : d.approvalLimitMinor !== null
                      ? money.fmt(d.approvalLimitMinor)
                      : "دائماً"}
                </td>
                <td>
                  {s.canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="تعديل"
                      onClick={() => setEditing({ ...d, method: d.method as "PERCENT" | "FIXED" })}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">
            خصم الأشقاء يُطبق تلقائياً حسب ترتيب الميلاد بين أبناء ولي الأمر الأساسي. بقية الخصومات تُمنح
            للطالب من ملفه المالي، وما تجاوز حد الاعتماد يُرسل لمدير المدرسة.
          </p>
          {editing ? <DiscountDialog setup={s} value={editing} onClose={() => setEditing(null)} /> : null}
        </>
      )}
    </SetupShell>
  );
}

function DiscountDialog({
  setup,
  value,
  onClose,
}: {
  setup: Setup;
  value: DiscountForm;
  onClose: () => void;
}) {
  const [v, setV] = useState(value);
  const m = trpc.finance.setup.saveDiscount.useMutation(useSave("حُفظ نوع الخصم"));
  const sibling = v.kind === "SIBLING";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={v.id ? "تعديل نوع خصم" : "نوع خصم جديد"} width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
          </Field>
          <Field label="النوع">
            <Select
              value={v.kind}
              onChange={(k) =>
                setV({
                  ...v,
                  kind: k as DiscountKindKey,
                  siblingTiers:
                    k === "SIBLING"
                      ? (v.siblingTiers ?? [
                          { order: 2, valueBp: 500 },
                          { order: 3, valueBp: 1000 },
                        ])
                      : null,
                })
              }
              options={Object.entries(DISCOUNT_KIND).map(([value, o]) => ({ value, label: o.label }))}
            />
          </Field>
          {!sibling ? (
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">الطريقة</span>
              <Segmented
                value={v.method}
                onChange={(mth) => setV({ ...v, method: mth, value: 0 })}
                options={[
                  { value: "PERCENT", label: "نسبة" },
                  { value: "FIXED", label: "مبلغ" },
                ]}
              />
            </div>
          ) : (
            <span />
          )}
          {sibling ? (
            <div className="col-span-2">
              <p className="mb-1.5 text-[13px] font-medium text-fg-2">الشرائح حسب ترتيب الابن</p>
              {(v.siblingTiers ?? []).map((t, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-[1fr_120px_28px] items-center gap-2">
                  <span className="text-[14px]">الابن رقم {t.order} فما بعده</span>
                  <PercentInput
                    bp={t.valueBp}
                    onChange={(bp) =>
                      setV({
                        ...v,
                        siblingTiers: v.siblingTiers!.map((x, j) => (j === i ? { ...x, valueBp: bp } : x)),
                      })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="حذف"
                    onClick={() => setV({ ...v, siblingTiers: v.siblingTiers!.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                size="xs"
                variant="ghost"
                icon={<Plus className="size-3" />}
                onClick={() =>
                  setV({
                    ...v,
                    siblingTiers: [
                      ...(v.siblingTiers ?? []),
                      { order: (v.siblingTiers?.at(-1)?.order ?? 1) + 1, valueBp: 1000 },
                    ],
                  })
                }
              >
                شريحة
              </Button>
            </div>
          ) : v.method === "PERCENT" ? (
            <Field label="النسبة ٪">
              <PercentInput bp={v.value} onChange={(bp) => setV({ ...v, value: bp })} />
            </Field>
          ) : (
            <Field label="المبلغ">
              <MoneyInput value={v.value} onChange={(a) => setV({ ...v, value: a ?? 0 })} />
            </Field>
          )}
          {!sibling ? (
            <Field label="يتطلب اعتماد المدير فوق">
              <MoneyInput
                value={v.approvalLimitMinor}
                onChange={(a) => setV({ ...v, approvalLimitMinor: a })}
                placeholder="فارغ = دائماً"
              />
            </Field>
          ) : null}
          <div className="col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">يُطبق على</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {setup.items
                .filter((i) => i.isActive && i.kind !== "LATE_FEE")
                .map((i) => (
                  <label key={i.id} className="flex items-center gap-1.5 text-[14px]">
                    <Checkbox
                      checked={v.feeItemIds.includes(i.id)}
                      onChange={(on) =>
                        setV({
                          ...v,
                          feeItemIds: on ? [...v.feeItemIds, i.id] : v.feeItemIds.filter((x) => x !== i.id),
                        })
                      }
                    />
                    {i.name}
                  </label>
                ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={v.name.trim().length < 2 || !v.code.trim() || !v.feeItemIds.length}
            onClick={() => m.mutate(v, { onSuccess: onClose })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الضرائب
// ---------------------------------------------------------------------

type TaxForm = {
  id: string | null;
  code: string;
  name: string;
  rateBp: number;
  kind: "STANDARD" | "ZERO" | "EXEMPT" | "OUT_OF_SCOPE";
  outputAccountId: string | null;
  inputAccountId: string | null;
  isActive: boolean;
};
const TAX_KIND = {
  STANDARD: "أساسية",
  ZERO: "نسبة صفر",
  EXEMPT: "معفاة",
  OUT_OF_SCOPE: "خارج النطاق",
} as const;

export function TaxesPage() {
  const prefs = usePrefs();
  const [editing, setEditing] = useState<TaxForm | null>(null);
  return (
    <SetupShell
      action={() => (
        <Button
          size="sm"
          variant="primary"
          icon={<Plus className="size-3.5" />}
          onClick={() =>
            setEditing({
              id: null,
              code: "",
              name: "",
              rateBp: 1500,
              kind: "STANDARD",
              outputAccountId: null,
              inputAccountId: null,
              isActive: true,
            })
          }
        >
          رمز ضريبة
        </Button>
      )}
    >
      {(s) => (
        <>
          <FinTable
            head={
              <tr>
                <th>الرمز</th>
                <th>الاسم</th>
                <th>الفئة</th>
                <th className={num}>النسبة</th>
                <th>حساب المخرجات</th>
                <th>حساب المدخلات</th>
                <th className="w-9" />
              </tr>
            }
          >
            {s.taxCodes.map((t) => (
              <tr key={t.id} className={cn(!t.isActive && "text-fg-3")}>
                <td>
                  <bdi dir="ltr">{t.code}</bdi>
                </td>
                <td>{t.name}</td>
                <td>{TAX_KIND[t.kind as keyof typeof TAX_KIND] ?? t.kind}</td>
                <td className={num}>{formatPercent(t.rateBp / 10000, prefs.digits)}</td>
                <td className="text-fg-2">{accountLabel(s, t.outputAccountId)}</td>
                <td className="text-fg-2">{accountLabel(s, t.inputAccountId)}</td>
                <td>
                  {s.canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="تعديل"
                      onClick={() => setEditing({ ...t, kind: t.kind as TaxForm["kind"] })}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </FinTable>
          <p className="mt-2 rounded-md bg-hover px-3 py-2 text-[12px] leading-6 text-fg-2">
            الإعداد الافتراضي: ١٥٪ على كل الرسوم، وصفر٪ على الرسوم الدراسية والتسجيل والنقل للطلاب المواطنين.
            هذه افتراضات تحتاج تأكيد المحاسب القانوني للمدرسة قبل الاستخدام الفعلي.
          </p>
          {editing ? <TaxDialog setup={s} value={editing} onClose={() => setEditing(null)} /> : null}
        </>
      )}
    </SetupShell>
  );
}

function TaxDialog({ setup, value, onClose }: { setup: Setup; value: TaxForm; onClose: () => void }) {
  const [v, setV] = useState(value);
  const m = trpc.finance.setup.saveTax.useMutation(useSave("حُفظ رمز الضريبة"));
  const liab = setup.accounts.filter((a) => a.type === "LIABILITY" || a.type === "ASSET");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={v.id ? "تعديل رمز ضريبة" : "رمز ضريبة جديد"}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
          </Field>
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="الفئة">
            <Select
              value={v.kind}
              onChange={(k) =>
                setV({ ...v, kind: k as TaxForm["kind"], rateBp: k === "STANDARD" ? v.rateBp || 1500 : 0 })
              }
              options={Object.entries(TAX_KIND).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="النسبة ٪">
            <PercentInput
              bp={v.rateBp}
              disabled={v.kind !== "STANDARD"}
              onChange={(bp) => setV({ ...v, rateBp: bp })}
            />
          </Field>
          <Field label="حساب المخرجات" className="col-span-2">
            <Select
              value={v.outputAccountId ?? "none"}
              onChange={(a) => setV({ ...v, outputAccountId: a === "none" ? null : a })}
              options={[
                { value: "none", label: "—" },
                ...liab.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
              ]}
            />
          </Field>
          <Field label="حساب المدخلات" className="col-span-2">
            <Select
              value={v.inputAccountId ?? "none"}
              onChange={(a) => setV({ ...v, inputAccountId: a === "none" ? null : a })}
              options={[
                { value: "none", label: "—" },
                ...liab.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
              ]}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!v.code.trim() || v.name.trim().length < 2 || (v.rateBp > 0 && !v.outputAccountId)}
            onClick={() => m.mutate(v, { onSuccess: onClose })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// إعدادات المالية
// ---------------------------------------------------------------------

interface FinanceSettingsValues {
  legalName: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  voucherApprovalLimitMinor: number;
  registrationDueDays: number;
  blockTransferCertificate: boolean;
  blockReenrollment: boolean;
  remindersEnabled: boolean;
  collectionTargetBp: number;
}

export function FinanceSettingsPage() {
  const q = trpc.moduleSettings.get.useQuery({ key: "finance" });
  return (
    <ModuleShell nav={financeNav("fee-setup")} tabs={SETUP_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإعدادات" description={q.error.message} />
      ) : q.data ? (
        <SettingsForm initial={q.data.values as FinanceSettingsValues} canEdit={q.data.canEdit} />
      ) : (
        <SkeletonLines lines={10} />
      )}
    </ModuleShell>
  );
}

function SettingsForm({ initial, canEdit }: { initial: FinanceSettingsValues; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.moduleSettings.get.invalidate({ key: "finance" }),
        utils.account.context.invalidate(),
      ]);
      toast.success("حُفظت إعدادات المالية");
    },
    onError: (e) => toast.error(e.message),
  });
  const vatOk = /^(\d{15})?$/.test(v.vatNumber);
  return (
    <div>
      {!canEdit ? (
        <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">
          عرض فقط: تعديل إعدادات المالية للمحاسب على مستوى المدرسة كاملة.
        </p>
      ) : null}
      <SettingsCard title="بيانات المنشأة على الفواتير" description="تظهر في رأس الفاتورة الضريبية ورمز QR.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم النظامي">
            <Input
              disabled={!canEdit}
              value={v.legalName}
              onChange={(e) => setV({ ...v, legalName: e.target.value })}
            />
          </Field>
          <Field label="الرقم الضريبي" error={vatOk ? null : "١٥ رقماً"}>
            <Input
              dir="ltr"
              disabled={!canEdit}
              value={v.vatNumber}
              onChange={(e) => setV({ ...v, vatNumber: e.target.value.replace(/\D/g, "").slice(0, 15) })}
            />
          </Field>
          <Field label="السجل التجاري">
            <Input
              dir="ltr"
              disabled={!canEdit}
              value={v.crNumber}
              onChange={(e) => setV({ ...v, crNumber: e.target.value })}
            />
          </Field>
          <Field label="العنوان">
            <Input
              disabled={!canEdit}
              value={v.address}
              onChange={(e) => setV({ ...v, address: e.target.value })}
            />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="الضوابط والموافقات">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="سندات الصرف فوق هذا المبلغ تحتاج اعتماد المدير">
            <MoneyInput
              disabled={!canEdit}
              value={v.voucherApprovalLimitMinor}
              onChange={(a) => setV({ ...v, voucherApprovalLimitMinor: a ?? 0 })}
            />
          </Field>
          <Field label="مهلة سداد رسوم التسجيل (أيام)">
            <Input
              type="number"
              min={0}
              max={60}
              disabled={!canEdit}
              value={v.registrationDueDays}
              onChange={(e) =>
                setV({
                  ...v,
                  registrationDueDays: Math.max(0, Math.min(60, Math.trunc(Number(e.target.value) || 0))),
                })
              }
            />
          </Field>
          <Field label="نسبة التحصيل المستهدفة ٪">
            <PercentInput
              disabled={!canEdit}
              bp={v.collectionTargetBp}
              onChange={(bp) => setV({ ...v, collectionTargetBp: bp })}
            />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <Toggle
            label="منع إصدار شهادة النقل مع وجود مديونية"
            checked={v.blockTransferCertificate}
            disabled={!canEdit}
            onChange={(on) => setV({ ...v, blockTransferCertificate: on })}
          />
          <Toggle
            label="منع إعادة القيد للعام الجديد مع وجود مديونية (يُنقل الطالب «مؤجلاً» دون فصل عند إنهاء العام)"
            checked={v.blockReenrollment}
            disabled={!canEdit}
            onChange={(on) => setV({ ...v, blockReenrollment: on })}
          />
          <Toggle
            label="تذكيرات السداد الآلية لأولياء الأمور (قبل الاستحقاق بثلاثة أيام، يومه، بعد ٧ أيام، وإشعار أخير بعد ٣٠ يوماً)"
            checked={v.remindersEnabled}
            disabled={!canEdit}
            onChange={(on) => setV({ ...v, remindersEnabled: on })}
          />
        </div>
      </SettingsCard>
      {canEdit ? (
        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!vatOk}
            onClick={() => save.mutate({ key: "finance", patch: { ...v } })}
          >
            حفظ الإعدادات
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-[14px]">
      {label}
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}
