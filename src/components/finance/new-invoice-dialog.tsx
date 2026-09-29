"use client";
/**
 * نافذة إصدار فاتورة فردية بمعاينة حيّة (البنود من جدول الرسوم أو مخصصة، الخصومات، الضريبة، خطة الأقساط).
 * منفصلة عن صفحات الفواتير لتُستخدم من قاعدة البيانات وملف الطالب دون استيراد دائري.
 */
import { FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import type { CreateDialogProps } from "@/components/students/create-dialogs";
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { MoneyInput, useMoney, useToday } from "./common";

// ---------------------------------------------------------------------
// نافذة إصدار فاتورة
// ---------------------------------------------------------------------

export function NewInvoiceDialog({ prefill, onClose, onCreated }: CreateDialogProps) {
  const money = useMoney();
  const prefs = usePrefs();
  const today = useToday();
  const [student, setStudent] = useState<PickedStudent | null>((prefill.student as PickedStudent | undefined) ?? null);
  const [mode, setMode] = useState<"schedule" | "custom">("schedule");
  const [feeItemIds, setFeeItemIds] = useState<string[] | null>(null);
  const [custom, setCustom] = useState<Array<{ feeItemId: string | null; description: string; unitMinor: number | null }>>([{ feeItemId: null, description: "", unitMinor: null }]);
  const [planId, setPlanId] = useState<string>("none");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(typeof prefill.dueDate === "string" ? prefill.dueDate.slice(0, 10) : today);
  const [applyDiscounts, setApplyDiscounts] = useState(true);
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState("");
  const setup = trpc.finance.setup.get.useQuery();
  const items = (setup.data?.items ?? []).filter((i) => i.isActive);
  const customLines = custom.filter((l) => l.feeItemId && l.unitMinor).map((l) => ({ feeItemId: l.feeItemId, description: l.description || items.find((i) => i.id === l.feeItemId)?.name || "", unitMinor: l.unitMinor! }));
  const previewInput = student ? (mode === "schedule" ? { studentId: student.id, feeItemIds: feeItemIds ?? undefined, applyDiscounts } : { studentId: student.id, lines: customLines, applyDiscounts }) : null;
  const preview = trpc.finance.invoices.preview.useQuery(previewInput!, { enabled: Boolean(previewInput) && (mode === "schedule" || customLines.length > 0), placeholderData: (p) => p });
  const create = trpc.finance.invoices.create.useMutation({
    onSuccess: (inv) => {
      toast.success("صدرت الفاتورة وقيدها");
      onCreated(inv.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const plans = (setup.data?.plans ?? []).filter((p) => p.isActive);
  const d = preview.data;
  const can = Boolean(student && d && d.lines.length && d.totalMinor >= 0);
  const submit = () =>
    student &&
    create.mutate({
      studentId: student.id,
      ...(mode === "schedule" ? { feeItemIds: feeItemIds ?? d?.lines.map((l) => l.feeItemId!).filter(Boolean) } : { lines: customLines }),
      planId: planId === "none" ? null : planId,
      issueDate,
      dueDate: planId === "none" ? dueDate : null,
      notes: notes || null,
      applyDiscounts,
      notify,
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="فاتورة جديدة" description="تُحسب البنود من جدول رسوم صف الطالب مع الخصومات والضريبة، ويُنشأ القيد تلقائياً عند الإصدار." width={760}>
        <div className="grid gap-4 px-5 pb-4 md:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <Field label="الطالب">
              <StudentPicker value={student} onChange={(s) => (setStudent(s), setFeeItemIds(null))} />
            </Field>
            <Segmented value={mode} onChange={setMode} options={[{ value: "schedule", label: "من جدول الرسوم" }, { value: "custom", label: "بنود مخصصة" }]} />
            {mode === "schedule" ? (
              student ? (
                <ScheduleItems student={student.id} selected={feeItemIds ?? (d?.student.id === student.id ? d.lines.map((l) => l.feeItemId!).filter(Boolean) : null)} onChange={setFeeItemIds} />
              ) : (
                <p className="text-[13px] text-fg-3">اختر الطالب لعرض بنود جدول الرسوم لصفه.</p>
              )
            ) : (
              <div className="space-y-2">
                {custom.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_110px_28px] gap-2">
                    <Select value={l.feeItemId ?? undefined} onChange={(v) => setCustom(custom.map((x, j) => (j === i ? { ...x, feeItemId: v } : x)))} options={items.map((it) => ({ value: it.id, label: it.name }))} placeholder="البند" />
                    <Input value={l.description} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="البيان (اختياري)" />
                    <MoneyInput value={l.unitMinor} onChange={(v) => setCustom(custom.map((x, j) => (j === i ? { ...x, unitMinor: v } : x)))} aria-label="المبلغ" />
                    <Button size="icon" variant="ghost" aria-label="حذف السطر" disabled={custom.length === 1} onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setCustom([...custom, { feeItemId: null, description: "", unitMinor: null }])}>
                  سطر
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="تاريخ الإصدار">
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </Field>
              <Field label="خطة السداد">
                <Select value={planId} onChange={setPlanId} options={[{ value: "none", label: "دفعة واحدة" }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
              </Field>
              {planId === "none" ? (
                <Field label="تاريخ الاستحقاق">
                  <Input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
              ) : null}
            </div>
            <Field label="ملاحظات على الفاتورة">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <label className="flex items-center justify-between text-[14px]">
              تطبيق الخصومات المستحقة (الأشقاء والمعتمدة)
              <Switch checked={applyDiscounts} onChange={setApplyDiscounts} />
            </label>
            <label className="flex items-center justify-between text-[14px]">
              إشعار ولي الأمر
              <Switch checked={notify} onChange={setNotify} />
            </label>
          </div>
          <div className="rounded-lg bg-hover/60 p-3">
            <p className="mb-2 text-[13px] font-semibold">المعاينة</p>
            {!student ? (
              <p className="text-[13px] text-fg-3">تظهر هنا البنود والخصومات والضريبة.</p>
            ) : preview.error ? (
              <p className="text-[13px] text-danger-700">{preview.error.message}</p>
            ) : !d ? (
              <SkeletonLines lines={5} />
            ) : (
              <>
                {d.warnings.map((w) => (
                  <p key={w} className="mb-2 rounded bg-warning-50 px-2 py-1 text-[12px] text-warning-700">
                    {w}
                  </p>
                ))}
                <ul className="space-y-1.5 text-[13px]">
                  {d.lines.map((l, i) => (
                    <li key={i}>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{l.description}</span>
                        <span className="tabular">{money.fmt(l.amountMinor, false)}</span>
                      </div>
                      {l.discountMinor ? (
                        <div className="flex justify-between gap-2 text-[12px] text-success-800">
                          <span className="truncate">{l.discounts.map((x) => x.name).join("، ")}</span>
                          <span className="tabular">({money.fmt(l.discountMinor, false)})</span>
                        </div>
                      ) : null}
                      {l.taxMinor ? (
                        <div className="flex justify-between gap-2 text-[12px] text-fg-3">
                          <span>ضريبة {formatPercent(l.taxRateBp / 10000, prefs.digits)}</span>
                          <span className="tabular">{money.fmt(l.taxMinor, false)}</span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-line pt-2 text-[15px] font-bold">
                  <span>الإجمالي</span>
                  <span className="tabular">{money.fmt(d.totalMinor)}</span>
                </div>
                <p className="mt-1 text-[12px] text-fg-3">
                  {d.student.nationality === "SA" ? "طالب مواطن: الرسوم الدراسية بنسبة صفر." : "طالب مقيم: ضريبة ١٥٪ على الرسوم الدراسية."} ولي الأمر: {d.guardian?.name ?? "غير مرتبط"}
                </p>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon={<FileText className="size-3.5" />} loading={create.isPending} disabled={!can} onClick={submit}>
            إصدار الفاتورة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** بنود جدول الرسوم لصف الطالب مع اختيار ما يُفوتر (الاختيارية غير محددة افتراضياً) */
function ScheduleItems({ student, selected, onChange }: { student: string; selected: string[] | null; onChange: (ids: string[]) => void }) {
  const money = useMoney();
  const setup = trpc.finance.setup.get.useQuery();
  const all = trpc.finance.invoices.preview.useQuery({ studentId: student, feeItemIds: (setup.data?.items ?? []).map((i) => i.id), applyDiscounts: false }, { enabled: Boolean(setup.data) });
  if (!all.data || !selected) return <SkeletonLines lines={3} />;
  if (!all.data.lines.length) return <p className="text-[13px] text-warning-700">لا يوجد جدول رسوم لصف الطالب. أضفه من «إعداد الرسوم» أو استخدم البنود المخصصة.</p>;
  const current = selected;
  return (
    <ul className="space-y-1">
      {all.data.lines.map((l) => (
        <li key={l.feeItemId}>
          <label className="flex items-center gap-2 rounded-md px-1 py-1 text-[14px] hover:bg-hover">
            <Checkbox checked={current.includes(l.feeItemId!)} onChange={(on) => onChange(on ? [...current, l.feeItemId!] : current.filter((x) => x !== l.feeItemId))} />
            <span className="flex-1">{l.description}</span>
            <span className="text-[13px] tabular text-fg-2">{money.fmt(l.amountMinor)}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

