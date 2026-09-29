"use client";
/**
 * نافذة إنشاء/تعديل نشاط (منفصلة عن الصفحات لتفادي الاستيراد الدائري مع محرك قواعد البيانات).
 */
import { useMemo, useState } from "react";
import { ACTIVITY_KIND } from "@/lib/students";
import { parseMoney } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import type { CreateDialogProps } from "@/components/students/create-dialogs";

export const NONE = "__none";

// ---------------------------------------------------------------------
// إنشاء/تعديل
// ---------------------------------------------------------------------

export interface FormState {
  title: string;
  kind: keyof typeof ACTIVITY_KIND;
  branchId: string;
  description: string;
  start: string;
  end: string;
  location: string;
  supervisorId: string;
  capacity: string;
  fee: string;
  requiresConsent: boolean;
  gradeIds: string[];
}

export const toLocal = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d);
  // عرض بتوقيت الرياض في حقل datetime-local
  const riyadh = new Date(x.getTime() + 3 * 3_600_000);
  return riyadh.toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(`${v}:00+03:00`) : null);

export function ActivityForm({ initial, onSubmit, submitting, submitLabel, onClose, title }: { initial: FormState; onSubmit: (f: FormState) => void; submitting: boolean; submitLabel: string; onClose: () => void; title: string }) {
  const { tenant } = useApp();
  const [f, setF] = useState(initial);
  const people = trpc.workspace.directory.useQuery();
  const sections = trpc.academic.sectionOptions.useQuery();
  const branches = useMemo(() => [...new Map((sections.data ?? []).map((s) => [s.branchId, { id: s.branchId, name: s.branchName }])).values()], [sections.data]);
  const grades = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections.data ?? []) if (!m.has(s.gradeId)) m.set(s.gradeId, s.gradeName);
    return [...m.entries()];
  }, [sections.data]);
  let feeError: string | null = null;
  if (f.fee.trim()) {
    try {
      parseMoney(f.fee, tenant.currency);
    } catch (e) {
      feeError = (e as Error).message;
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} width={680}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="عنوان النشاط" className="sm:col-span-2">
            <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثال: رحلة إلى متحف المصمك" />
          </Field>
          <Field label="النوع">
            <Select value={f.kind} onChange={(v) => setF({ ...f, kind: v as FormState["kind"], requiresConsent: v === "TRIP" ? true : f.requiresConsent })} options={Object.entries(ACTIVITY_KIND).map(([value, o]) => ({ value, label: o.label }))} />
          </Field>
          <Field label="الفرع">
            <Select value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} options={[{ value: NONE, label: "كل الفروع" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
          </Field>
          <Field label="البداية">
            <Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="النهاية">
            <Input type="datetime-local" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </Field>
          <Field label="المكان">
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </Field>
          <Field label="المشرف">
            <Select value={f.supervisorId} onChange={(v) => setF({ ...f, supervisorId: v })} options={[{ value: NONE, label: "بدون" }, ...(people.data ?? []).filter((p) => p.status === "ACTIVE").map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
          <Field label="الطاقة (مقعد)" hint="يُحوَّل الزائد إلى قائمة انتظار">
            <Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} placeholder="بلا حد" />
          </Field>
          <Field label={`الرسم (${tenant.currency})`} hint="يُفوتر عند تفعيل المحاسبة (المرحلة ٣)" error={feeError}>
            <Input inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="مجاني" />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium">الصفوف المستهدفة <span className="font-normal text-fg-3">(بدون تحديد = كل الصفوف)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {grades.map(([id, name]) => {
                const on = f.gradeIds.includes(id);
                return (
                  <button key={id} type="button" onClick={() => setF({ ...f, gradeIds: on ? f.gradeIds.filter((g) => g !== id) : [...f.gradeIds, id] })} className={cn("h-7 rounded-full px-2.5 text-[12px] shadow-[0_0_0_1px_var(--border)] transition-colors", on ? "bg-navy-700 text-on-primary shadow-none" : "hover:bg-hover")}>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
            <Switch checked={f.requiresConsent} onChange={(v) => setF({ ...f, requiresConsent: v })} />
            يتطلب موافقة ولي الأمر
          </label>
          <Field label="الوصف" className="sm:col-span-2">
            <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={submitting} disabled={f.title.trim().length < 2 || Boolean(feeError) || Boolean(f.start && f.end && f.end < f.start)} onClick={() => onSubmit(f)}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function payload(f: FormState, currency: string) {
  return {
    title: f.title.trim(),
    kind: f.kind,
    branchId: f.branchId === NONE ? null : f.branchId,
    description: f.description.trim() || null,
    startAt: fromLocal(f.start),
    endAt: fromLocal(f.end),
    location: f.location.trim() || null,
    supervisorId: f.supervisorId === NONE ? null : f.supervisorId,
    capacity: f.capacity ? Number(f.capacity) : null,
    feeMinor: f.fee.trim() ? parseMoney(f.fee, currency) : null,
    requiresConsent: f.requiresConsent,
    gradeIds: f.gradeIds,
  };
}

export function NewActivityDialog({ prefill, onClose, onCreated }: CreateDialogProps) {
  const { tenant, user } = useApp();
  const create = trpc.activities.create.useMutation({ onSuccess: (a) => (toast.success("أُنشئ النشاط"), onCreated(a.id)), onError: (e) => toast.error(e.message) });
  const kind = typeof prefill.kind === "string" && prefill.kind in ACTIVITY_KIND ? (prefill.kind as FormState["kind"]) : "CLUB";
  return (
    <ActivityForm
      title="نشاط جديد"
      submitLabel="إنشاء النشاط"
      submitting={create.isPending}
      onClose={onClose}
      initial={{ title: "", kind, branchId: NONE, description: "", start: "", end: "", location: "", supervisorId: user.id, capacity: "", fee: "", requiresConsent: kind === "TRIP", gradeIds: [] }}
      onSubmit={(f) => create.mutate(payload(f, tenant.currency))}
    />
  );
}

