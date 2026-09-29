"use client";
/**
 * نوافذ إنشاء: الإجازة/الاستئذان، التحويل، الملاحظة السلوكية، الحالة الإرشادية.
 */
import { Upload } from "lucide-react";
import { useState } from "react";
import { BEHAVIOR_CATEGORIES, CASE_CATEGORIES, LEAVE_KIND, SEVERITY, TRANSFER_TYPE } from "@/lib/students";
import { toISODate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { pickFile, uploadFile, type UploadedFile } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import type { CreateDialogProps } from "./create-dialogs";
import { StudentPicker, type PickedStudent } from "./student-picker";
import { NewActivityDialog } from "@/components/activities/activity-form";

export function SchoolCreateDialogs({ source, ...props }: CreateDialogProps & { source: string }) {
  if (source === "leaves") return <NewLeaveDialog {...props} />;
  if (source === "transfers") return <NewTransferDialog {...props} />;
  if (source === "behavior") return <NewBehaviorDialog {...props} />;
  if (source === "counseling") return <NewCaseDialog {...props} />;
  if (source === "activities") return <NewActivityDialog {...props} />;
  return null;
}

function useToday() {
  const { tenant } = useApp();
  return toISODate(new Date(), tenant.timezone);
}

function useAttachments() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const f = await pickFile("application/pdf,image/png,image/jpeg,image/webp");
    if (!f) return;
    setBusy(true);
    try {
      const up = await uploadFile(f);
      setFiles((x) => [...x, up]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { files, busy, add, remove: (id: string) => setFiles((x) => x.filter((f) => f.id !== id)) };
}

function Attachments({ a }: { a: ReturnType<typeof useAttachments> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" icon={<Upload className="size-3.5" />} loading={a.busy} onClick={() => void a.add()}>
        إرفاق
      </Button>
      {a.files.map((f) => (
        <button key={f.id} onClick={() => a.remove(f.id)} className="h-7 max-w-[200px] truncate rounded-md bg-hover px-2 text-[12px] hover:line-through" title="إزالة">
          {f.name}
        </button>
      ))}
    </div>
  );
}

function NewLeaveDialog({ prefill, onClose, onCreated }: CreateDialogProps) {
  const today = useToday();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [kind, setKind] = useState<"LEAVE" | "EARLY_DISMISSAL">(prefill.kind === "EARLY_DISMISSAL" ? "EARLY_DISMISSAL" : "LEAVE");
  const start = typeof prefill.period === "object" && prefill.period && "start" in prefill.period ? String((prefill.period as { start: string }).start).slice(0, 10) : today;
  const [dates, setDates] = useState({ start, end: start });
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const att = useAttachments();
  const create = trpc.leaves.create.useMutation({ onSuccess: (l) => (toast.success("سُجّل الطلب وأُرسل للوكيل للاعتماد"), onCreated(l.id)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إجازة أو استئذان" description="يُسجَّل بطلب ولي الأمر، ويعتمده الوكيل فينعكس على الحضور تلقائياً." width={560}>
        <div className="space-y-3">
          <Field label="الطالب">
            <StudentPicker value={student} onChange={setStudent} />
          </Field>
          <Field label="النوع">
            <Segmented value={kind} onChange={(k) => (setKind(k), k === "EARLY_DISMISSAL" && setDates({ ...dates, end: dates.start }))} options={Object.entries(LEAVE_KIND).map(([value, o]) => ({ value: value as "LEAVE", label: o.label }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === "LEAVE" ? "من" : "التاريخ"}>
              <Input type="date" value={dates.start} onChange={(e) => setDates({ start: e.target.value, end: kind === "EARLY_DISMISSAL" || e.target.value > dates.end ? e.target.value : dates.end })} />
            </Field>
            {kind === "LEAVE" ? (
              <Field label="إلى">
                <Input type="date" value={dates.end} min={dates.start} onChange={(e) => setDates({ ...dates, end: e.target.value })} />
              </Field>
            ) : null}
          </div>
          <Field label="السبب">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: مراجعة طبية — مرفق التقرير" />
          </Field>
          <Field label="مقدّم الطلب (ولي الأمر)">
            <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </Field>
          <Field label="المرفقات (تقرير طبي…)">
            <Attachments a={att} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending} disabled={!student || reason.trim().length < 3} onClick={() => student && create.mutate({ studentId: student.id, kind, startDate: dates.start, endDate: dates.end, reason, requestedBy: requestedBy || null, attachments: att.files })}>
            تسجيل الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTransferDialog({ onClose, onCreated }: CreateDialogProps) {
  const today = useToday();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [type, setType] = useState<keyof typeof TRANSFER_TYPE>("SECTION");
  const [f, setF] = useState({ toSectionId: "", toGradeId: "", otherSchool: "", reason: "", effectiveDate: today });
  const sections = trpc.academic.sectionOptions.useQuery();
  const options = trpc.students.formOptions.useQuery();
  const profile = trpc.students.get.useQuery({ id: student?.id ?? "" }, { enabled: Boolean(student) });
  const att = useAttachments();
  const create = trpc.transfers.create.useMutation({ onSuccess: (t) => (toast.success("أُنشئ طلب التحويل وأُرسل للموافقات"), onCreated(t.id)), onError: (e) => toast.error(e.message) });
  const p = profile.data;
  const sameGradeSections = (sections.data ?? []).filter((s) => p && s.gradeId === p.grade.id && s.branchId === p.branch.id && s.id !== p.section?.id);
  const gradeSections = (sections.data ?? []).filter((s) => p && s.gradeId === f.toGradeId && s.branchId === p.branch.id);
  const submit = () =>
    student &&
    create.mutate({
      studentId: student.id,
      type,
      toSectionId: f.toSectionId || null,
      toGradeId: f.toGradeId || null,
      otherSchool: f.otherSchool || null,
      reason: f.reason,
      effectiveDate: f.effectiveDate,
      attachments: att.files,
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="طلب تحويل" description="يمر بموافقة الوكيل، ثم المدير، ثم خلو الطرف المالي عند المغادرة." width={600}>
        <div className="space-y-3">
          <Field label="الطالب">
            <StudentPicker value={student} onChange={(s) => (setStudent(s), setF({ ...f, toSectionId: "", toGradeId: "" }))} />
          </Field>
          <Field label="نوع التحويل">
            <Select value={type} onChange={(v) => setType(v as typeof type)} options={Object.entries(TRANSFER_TYPE).map(([value, o]) => ({ value, label: o.label }))} />
          </Field>
          {type === "SECTION" ? (
            <Field label="إلى الفصل" hint={p ? `الحالي: ${p.section ? `${p.grade.name} / ${p.section.name}` : "بدون فصل"}` : undefined}>
              <Select value={f.toSectionId || undefined} onChange={(v) => setF({ ...f, toSectionId: v })} options={sameGradeSections.map((s) => ({ value: s.id, label: `${s.label} (${s.occupied}/${s.capacity})` }))} placeholder={p ? "اختر الفصل" : "اختر الطالب أولاً"} disabled={!p} />
            </Field>
          ) : null}
          {type === "GRADE" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="إلى الصف">
                <Select value={f.toGradeId || undefined} onChange={(v) => setF({ ...f, toGradeId: v, toSectionId: "" })} options={(options.data?.grades ?? []).filter((g) => g.id !== p?.grade.id).map((g) => ({ value: g.id, label: g.name }))} placeholder="اختر" disabled={!p} />
              </Field>
              <Field label="الفصل (اختياري)">
                <Select value={f.toSectionId || undefined} onChange={(v) => setF({ ...f, toSectionId: v })} options={gradeSections.map((s) => ({ value: s.id, label: s.label }))} placeholder="يُحدد لاحقاً" disabled={!f.toGradeId} />
              </Field>
            </div>
          ) : null}
          {type === "OUTGOING" || type === "INCOMING" ? (
            <Field label={type === "OUTGOING" ? "إلى مدرسة" : "من مدرسة"}>
              <Input value={f.otherSchool} onChange={(e) => setF({ ...f, otherSchool: e.target.value })} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ السريان">
              <Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />
            </Field>
          </div>
          <Field label="السبب / طلب ولي الأمر">
            <Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </Field>
          <Field label="المرفقات (طلب ولي الأمر الموقّع…)">
            <Attachments a={att} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending} disabled={!student || f.reason.trim().length < 3} onClick={submit}>
            إرسال للموافقات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewBehaviorDialog({ prefill, onClose, onCreated, student: fixedStudent }: CreateDialogProps & { student?: PickedStudent | null }) {
  const [student, setStudent] = useState<PickedStudent | null>(fixedStudent ?? null);
  const [category, setCategory] = useState<string>(typeof prefill.category === "string" ? prefill.category : BEHAVIOR_CATEGORIES[0]!.id);
  const cat = BEHAVIOR_CATEGORIES.find((c) => c.id === category)!;
  const [points, setPoints] = useState<string>(String(cat.points));
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [notifyGuardian, setNotify] = useState(false);
  const create = trpc.behavior.create.useMutation({ onSuccess: (b) => (toast.success("سُجّلت الملاحظة السلوكية"), onCreated(b.id)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="ملاحظة سلوكية" width={560}>
        <div className="space-y-3">
          <Field label="الطالب">
            <StudentPicker value={student} onChange={setStudent} disabled={Boolean(fixedStudent)} />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="التصنيف">
              <Select
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setPoints(String(BEHAVIOR_CATEGORIES.find((c) => c.id === v)!.points));
                }}
                options={BEHAVIOR_CATEGORIES.map((c) => ({ value: c.id, label: `${c.kind === "POSITIVE" ? "إيجابي" : "سلبي"} — ${c.label}` }))}
              />
            </Field>
            <Field label="النقاط">
              <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className="tabular" />
            </Field>
          </div>
          <Field label="الوصف">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {cat.kind === "NEGATIVE" ? (
            <Field label="الإجراء المتخذ">
              <Input value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="تنبيه شفهي، تعهد، إحالة للمرشد…" />
            </Field>
          ) : null}
          <label className="flex items-center gap-2.5 text-[14px]">
            <Switch checked={notifyGuardian} onChange={setNotify} />
            إبلاغ ولي الأمر برسالة
          </label>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending} disabled={!student} onClick={() => student && create.mutate({ studentId: student.id, category, points: Number(points) || 0, description: description || null, actionTaken: actionTaken || null, notifyGuardian })}>
            تسجيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCaseDialog({ onClose, onCreated }: CreateDialogProps) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [f, setF] = useState({ title: "", category: CASE_CATEGORIES[0]!.id, severity: "MEDIUM" as keyof typeof SEVERITY, description: "" });
  const allowed = trpc.behavior.canOpenCases.useQuery();
  const create = trpc.behavior.createCase.useMutation({ onSuccess: (c) => (toast.success("فُتحت الحالة"), onCreated(c.id)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="حالة إرشادية جديدة" description="سرّية: لا يطّلع عليها إلا المرشد المسؤول والإدارة." width={560}>
        {allowed.data === false ? (
          <p className="rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">فتح الحالات الإرشادية للمرشد الطلابي والإدارة. لتسجيل ملاحظة على طالب استخدم «ملاحظة سلوكية».</p>
        ) : (
          <div className="space-y-3">
            <Field label="الطالب">
              <StudentPicker value={student} onChange={setStudent} />
            </Field>
            <Field label="عنوان الحالة">
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثال: تراجع دراسي مفاجئ" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="التصنيف">
                <Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CASE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))} />
              </Field>
              <Field label="الخطورة">
                <Select value={f.severity} onChange={(v) => setF({ ...f, severity: v as typeof f.severity })} options={Object.entries(SEVERITY).map(([value, o]) => ({ value, label: o.label }))} />
              </Field>
            </div>
            <Field label="وصف مبدئي">
              <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          {allowed.data !== false ? (
            <Button variant="primary" loading={create.isPending} disabled={!student || f.title.trim().length < 3} onClick={() => student && create.mutate({ studentId: student.id, title: f.title, category: f.category, severity: f.severity, description: f.description || null })}>
              فتح الحالة
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
