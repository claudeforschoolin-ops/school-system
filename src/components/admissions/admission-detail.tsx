"use client";
/**
 * تفاصيل طلب القبول: مسار المراحل مع الإجراء التالي، بيانات الطالب وولي الأمر،
 * الاختبار/المقابلة، المرفقات، التسكين في فصل ثم التسجيل، والملاحظات.
 */
import { motion } from "motion/react";
import { ArrowUpRight, Check, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ADMISSION_SOURCES, ADMISSION_STAGE, GENDER, GUARDIAN_RELATION, NATIONALITIES, type AdmissionStageKey } from "@/lib/students";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { formatBytes, pickFile, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { BlockEditor } from "@/components/editor/block-editor";
import { SaveStatus, useAutosave } from "@/components/database/row-view";

type A = RouterOutputs["admissions"]["get"];
const MAIN_PATH: AdmissionStageKey[] = ["NEW", "REVIEW", "ASSESSMENT", "ACCEPTED", "ENROLLED"];

export function AdmissionDetail({ id }: { id: string }) {
  const { prefs } = useApp();
  const q = trpc.admissions.get.useQuery({ id });
  useTabMeta(q.data?.fullName ?? "طلب قبول", "lucide:user-plus");
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الطلب" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const a = q.data;
  return (
    <>
      <PageTopbar crumbs={[{ title: "شؤون الطلاب", icon: "lucide:users" }, { title: "القبول والتسجيل", icon: "lucide:user-plus", href: "/admissions" }, { title: `طلب ${formatNumber(a.number, prefs.digits)}` }]} />
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-24 pt-10 md:px-12">
        <Header a={a} />
        <StagePath a={a} />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <StudentCard a={a} />
            <GuardianCard a={a} />
            <AttachmentsCard a={a} />
            <NotesCard a={a} />
          </div>
          <div className="space-y-4">
            <AssessmentCard a={a} />
            <InfoCard a={a} />
          </div>
        </div>
      </div>
    </>
  );
}

function Header({ a }: { a: A }) {
  const { prefs } = useApp();
  const stage = ADMISSION_STAGE[a.stage];
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
        <span>طلب رقم {formatNumber(a.number, prefs.digits)}</span>
        <span>·</span>
        <span>{a.submittedVia === "PUBLIC_FORM" ? "عبر النموذج العام" : "سجّله موظف القبول"}</span>
        <span>·</span>
        <span>{formatRelative(a.createdAt, new Date(), prefs.digits)}</span>
      </div>
      <h1 className="mt-2 text-[32px] font-bold leading-tight md:text-[36px]">{a.fullName}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
        <Tag color={stage.color}>{stage.label}</Tag>
        <span>{a.requestedGrade ? `${a.requestedGrade.name} — ${a.requestedGrade.stage}` : "لم يُحدد الصف"}</span>
        <span className="text-fg-4">·</span>
        <span>{a.branch.name}</span>
        {a.seats ? (
          <>
            <span className="text-fg-4">·</span>
            <span className={a.seats.available > 0 ? "text-success-800" : "text-danger-700"}>
              المقاعد المتاحة {formatNumber(a.seats.available, prefs.digits)} من {formatNumber(a.seats.capacity, prefs.digits)}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}

function StagePath({ a }: { a: A }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const [decision, setDecision] = useState<AdmissionStageKey | null>(null);
  const setStage = trpc.admissions.setStage.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.admissions.get.invalidate({ id: a.id }), utils.database.rows.invalidate(), utils.admissions.overview.invalidate()]);
      toast.success("حُدّثت مرحلة الطلب");
      setDecision(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const currentIndex = MAIN_PATH.indexOf(a.stage);
  const side = a.stage === "WAITLIST" || a.stage === "REJECTED";
  const canEdit = a.permissions.canEdit;
  const go = (stage: AdmissionStageKey) => setStage.mutate({ id: a.id, stage });

  const actions: Array<{ label: string; stage: AdmissionStageKey; primary?: boolean; danger?: boolean; ask?: boolean }> = [];
  if (a.stage === "NEW") actions.push({ label: "بدء المراجعة", stage: "REVIEW", primary: true });
  if (a.stage === "REVIEW") actions.push({ label: "إحالة للاختبار/المقابلة", stage: "ASSESSMENT", primary: true });
  if (["REVIEW", "ASSESSMENT", "WAITLIST"].includes(a.stage)) {
    actions.push({ label: "قبول", stage: "ACCEPTED", primary: a.stage !== "REVIEW" });
    if (a.stage !== "WAITLIST") actions.push({ label: "قائمة انتظار", stage: "WAITLIST", ask: true });
    actions.push({ label: "رفض", stage: "REJECTED", danger: true, ask: true });
  }
  if (a.stage === "REJECTED") actions.push({ label: "إعادة فتح الطلب", stage: "REVIEW" });

  return (
    <section className="mt-6 rounded-lg bg-card p-4 shadow-card">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {MAIN_PATH.map((s, i) => {
          const done = !side && currentIndex > i;
          const current = a.stage === s;
          return (
            <li key={s} className="flex shrink-0 items-center gap-1">
              <span className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px]", current ? "bg-navy-700 font-medium text-on-primary" : done ? "bg-success-50 text-success-800" : "bg-hover text-fg-3")}>
                {done ? <Check className="size-3.5" /> : <span className="tabular">{formatNumber(i + 1, prefs.digits)}</span>}
                {ADMISSION_STAGE[s].label}
              </span>
              {i < MAIN_PATH.length - 1 ? <span className={cn("h-px w-6", done ? "bg-success-800/40" : "bg-line")} /> : null}
            </li>
          );
        })}
        {side ? (
          <li className="ms-3 shrink-0">
            <Tag color={ADMISSION_STAGE[a.stage].color}>{ADMISSION_STAGE[a.stage].label}</Tag>
          </li>
        ) : null}
      </ol>
      {a.decisionReason && a.stage === "REJECTED" ? <p className="mt-3 text-[13px] text-fg-2">سبب القرار: {a.decisionReason}</p> : null}
      {canEdit && actions.length ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {actions.map((act) => (
            <Button key={act.stage} size="sm" variant={act.primary ? "primary" : act.danger ? "danger" : "secondary"} loading={setStage.isPending && setStage.variables?.stage === act.stage} onClick={() => (act.ask ? setDecision(act.stage) : go(act.stage))}>
              {act.label}
            </Button>
          ))}
        </div>
      ) : null}
      {canEdit && a.stage === "ACCEPTED" && a.student ? <Placement a={a} onEnroll={() => go("ENROLLED")} enrolling={setStage.isPending} /> : null}
      {decision ? <DecisionDialog stage={decision} onClose={() => setDecision(null)} onConfirm={(reason) => setStage.mutate({ id: a.id, stage: decision, reason })} pending={setStage.isPending} /> : null}
    </section>
  );
}

function Placement({ a, onEnroll, enrolling }: { a: A; onEnroll: () => void; enrolling: boolean }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const sections = trpc.academic.sectionOptions.useQuery();
  const options = (sections.data ?? []).filter((s) => s.gradeId === a.requestedGrade?.id && s.branchId === a.branch.id);
  const [sectionId, setSectionId] = useState(a.student?.sectionId ?? "");
  const place = trpc.students.update.useMutation({
    onSuccess: async () => {
      await utils.admissions.get.invalidate({ id: a.id });
      toast.success("سُكّن الطالب في الفصل");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-md bg-teal-50 p-3 dark:bg-hover">
      <p className="text-[13px] font-medium">
        أُنشئ ملف الطالب{" "}
        <Link href={`/students/${a.student!.id}`} className="underline">
          {a.student!.academicNumber}
        </Link>
        . سكّنه في فصل ثم أكمل التسجيل:
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          className="w-[240px]"
          value={sectionId || undefined}
          onChange={setSectionId}
          options={options.map((s) => ({ value: s.id, label: `${s.label} — ${formatNumber(s.occupied, prefs.digits)}/${formatNumber(s.capacity, prefs.digits)}` }))}
          placeholder="اختر الفصل"
        />
        <Button size="sm" disabled={!sectionId || sectionId === a.student?.sectionId} loading={place.isPending} onClick={() => place.mutate({ id: a.student!.id, patch: { sectionId } })}>
          تسكين
        </Button>
        <Button size="sm" variant="primary" disabled={!a.student?.sectionId} loading={enrolling} onClick={onEnroll}>
          إكمال التسجيل
        </Button>
      </div>
    </motion.div>
  );
}

function DecisionDialog({ stage, onClose, onConfirm, pending }: { stage: AdmissionStageKey; onClose: () => void; onConfirm: (reason: string | null) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={stage === "REJECTED" ? "رفض الطلب" : "نقل إلى قائمة الانتظار"} description="تُرسل رسالة بالقرار إلى ولي الأمر تلقائياً." width={460}>
        <Field label="السبب (يظهر في سجل الطلب)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant={stage === "REJECTED" ? "danger" : "primary"} loading={pending} onClick={() => onConfirm(reason.trim() || null)}>
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function useAdmissionUpdate(a: A) {
  const utils = trpc.useUtils();
  return trpc.admissions.update.useMutation({
    onSuccess: async () => {
      await utils.admissions.get.invalidate({ id: a.id });
      toast.success("حُفظ الطلب");
    },
    onError: (e) => toast.error(e.message),
  });
}

function StudentCard({ a }: { a: A }) {
  const options = trpc.students.formOptions.useQuery();
  const update = useAdmissionUpdate(a);
  const locked = Boolean(a.student) || !a.permissions.canEdit;
  const [f, setF] = useState({
    ...a.names,
    gender: (a.gender ?? "MALE") as "MALE" | "FEMALE",
    nationality: a.nationality,
    nationalId: "",
    birthDate: a.birthDate ? new Date(a.birthDate).toISOString().slice(0, 10) : "",
    requestedGradeId: a.requestedGrade?.id ?? "",
    previousSchool: a.previousSchool ?? "",
  });
  return (
    <Card
      title="بيانات الطالب"
      action={
        !locked ? (
          <Button
            size="sm"
            variant="primary"
            loading={update.isPending}
            onClick={() =>
              update.mutate({
                id: a.id,
                patch: {
                  firstName: f.firstName,
                  fatherName: f.fatherName,
                  grandfatherName: f.grandfatherName,
                  familyName: f.familyName,
                  gender: f.gender,
                  nationality: f.nationality,
                  ...(f.nationalId ? { nationalId: f.nationalId } : {}),
                  birthDate: f.birthDate ? new Date(`${f.birthDate}T00:00:00Z`) : null,
                  requestedGradeId: f.requestedGradeId || null,
                  previousSchool: f.previousSchool || null,
                },
              })
            }
          >
            حفظ
          </Button>
        ) : a.student ? (
          <Link href={`/students/${a.student.id}`} className="flex items-center gap-1 text-[13px] text-fg-2 hover:underline">
            ملف الطالب <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["firstName", "fatherName", "grandfatherName", "familyName"] as const).map((k, i) => (
          <Field key={k} label={["الاسم الأول", "اسم الأب", "اسم الجد", "اسم العائلة"][i]!}>
            <Input value={f[k]} disabled={locked} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="الجنس">
          <Segmented value={f.gender} onChange={(v) => !locked && setF({ ...f, gender: v })} options={[{ value: "MALE", label: GENDER.MALE.label }, { value: "FEMALE", label: GENDER.FEMALE.label }]} />
        </Field>
        <Field label="الجنسية">
          <Select value={f.nationality} disabled={locked} onChange={(v) => setF({ ...f, nationality: v })} options={NATIONALITIES.map((n) => ({ value: n.id, label: n.name }))} />
        </Field>
        <Field label="رقم الهوية" hint="مخزّن مشفّراً؛ اكتب رقماً جديداً للتصحيح">
          <Input value={f.nationalId} disabled={locked} placeholder={a.nationalIdMasked ?? ""} dir="ltr" className="text-end tabular" onChange={(e) => setF({ ...f, nationalId: e.target.value })} />
        </Field>
        <Field label="تاريخ الميلاد">
          <Input type="date" value={f.birthDate} disabled={locked} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
        </Field>
        <Field label="الصف المطلوب">
          <Select value={f.requestedGradeId || undefined} disabled={locked} onChange={(v) => setF({ ...f, requestedGradeId: v })} options={(options.data?.grades ?? []).map((g) => ({ value: g.id, label: `${g.name} — ${g.stage}` }))} placeholder="اختر" />
        </Field>
        <Field label="المدرسة السابقة">
          <Input value={f.previousSchool} disabled={locked} onChange={(e) => setF({ ...f, previousSchool: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

function GuardianCard({ a }: { a: A }) {
  const update = useAdmissionUpdate(a);
  const editable = a.permissions.canEdit;
  const [g, setG] = useState({ name: a.guardian.name ?? "", relation: (a.guardian.relation ?? "FATHER") as "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER", phone: a.guardian.phone ?? "", email: a.guardian.email ?? "", address: a.address ?? "" });
  return (
    <Card
      title="ولي الأمر"
      action={
        editable ? (
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ id: a.id, patch: { guardianName: g.name, guardianRelation: g.relation, guardianPhone: g.phone, guardianEmail: g.email || null, address: g.address || null } })}>
            حفظ
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="الاسم" className="col-span-2">
          <Input value={g.name} disabled={!editable} onChange={(e) => setG({ ...g, name: e.target.value })} />
        </Field>
        <Field label="الصلة">
          <Select value={g.relation} disabled={!editable} onChange={(v) => setG({ ...g, relation: v as typeof g.relation })} options={Object.entries(GUARDIAN_RELATION).map(([value, o]) => ({ value, label: o.label }))} />
        </Field>
        <Field label="الجوال">
          <Input value={g.phone} disabled={!editable} dir="ltr" className="text-end" onChange={(e) => setG({ ...g, phone: e.target.value })} />
        </Field>
        <Field label="البريد" className="col-span-2">
          <Input value={g.email} disabled={!editable} dir="ltr" className="text-end" onChange={(e) => setG({ ...g, email: e.target.value })} />
        </Field>
        <Field label="العنوان" className="col-span-2">
          <Input value={g.address} disabled={!editable} onChange={(e) => setG({ ...g, address: e.target.value })} />
        </Field>
      </div>
      {a.contacts.length > 1 ? (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {a.contacts.slice(1).map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px]">
              <Avatar name={c.name} size={24} />
              <span className="font-medium">{c.name}</span>
              <span className="text-fg-3">{GUARDIAN_RELATION[c.relation as keyof typeof GUARDIAN_RELATION]?.label}</span>
              {c.phone ? (
                <span className="ms-auto tabular text-fg-2" dir="ltr">
                  {c.phone}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function AssessmentCard({ a }: { a: A }) {
  const update = useAdmissionUpdate(a);
  const directory = trpc.workspace.directory.useQuery(undefined, { staleTime: 5 * 60_000 });
  const editable = a.permissions.canEdit;
  const toLocal = (d: Date | string | null) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [f, setF] = useState({ at: toLocal(a.assessmentAt), score: a.assessmentScore?.toString() ?? "", notes: a.assessmentNotes ?? "", ownerId: a.owner?.id ?? "", source: a.source ?? "" });
  return (
    <Card title="الاختبار والمقابلة والمتابعة">
      <div className="space-y-3">
        <Field label="الموعد">
          <Input type="datetime-local" value={f.at} disabled={!editable} onChange={(e) => setF({ ...f, at: e.target.value })} />
        </Field>
        <Field label="النتيجة (من ١٠٠)">
          <Input type="number" min={0} max={100} value={f.score} disabled={!editable} onChange={(e) => setF({ ...f, score: e.target.value })} className="tabular" />
        </Field>
        <Field label="ملاحظات التقييم">
          <Textarea rows={3} value={f.notes} disabled={!editable} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <Field label="المسؤول عن المتابعة">
          <Select value={f.ownerId || undefined} disabled={!editable} onChange={(v) => setF({ ...f, ownerId: v })} options={(directory.data ?? []).filter((u) => u.status === "ACTIVE").map((u) => ({ value: u.id, label: u.name }))} placeholder="غير مسند" />
        </Field>
        <Field label="كيف عرفتنا">
          <Select value={f.source || undefined} disabled={!editable} onChange={(v) => setF({ ...f, source: v })} options={ADMISSION_SOURCES.map((s) => ({ value: s.id, label: s.name }))} placeholder="غير محدد" />
        </Field>
        {editable ? (
          <Button
            className="w-full justify-center"
            loading={update.isPending}
            onClick={() =>
              update.mutate({
                id: a.id,
                patch: {
                  assessmentAt: f.at ? new Date(f.at) : null,
                  assessmentScore: f.score === "" ? null : Math.max(0, Math.min(100, Math.round(Number(f.score)))),
                  assessmentNotes: f.notes || null,
                  ownerId: f.ownerId || null,
                  source: f.source || null,
                },
              })
            }
          >
            حفظ
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function InfoCard({ a }: { a: A }) {
  const { prefs } = useApp();
  return (
    <Card title="معلومات الطلب">
      <dl className="space-y-2.5 text-[13px]">
        <div className="flex justify-between gap-2">
          <dt className="text-fg-3">العام الدراسي</dt>
          <dd>{a.academicYear.name}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-3">تاريخ التقديم</dt>
          <dd>{formatDate(a.createdAt, { digits: prefs.digits, calendar: prefs.calendar })}</dd>
        </div>
        {a.decisionAt ? (
          <div className="flex justify-between gap-2">
            <dt className="text-fg-3">تاريخ القرار</dt>
            <dd>{formatDate(a.decisionAt, { digits: prefs.digits, calendar: prefs.calendar })}</dd>
          </div>
        ) : null}
        {a.owner ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-fg-3">المتابعة</dt>
            <dd className="flex items-center gap-1.5">
              <Avatar name={a.owner.name} color={a.owner.avatarColor} size={20} />
              {a.owner.name}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

function AttachmentsCard({ a }: { a: A }) {
  const utils = trpc.useUtils();
  const update = trpc.admissions.update.useMutation({ onSuccess: () => utils.admissions.get.invalidate({ id: a.id }), onError: (e) => toast.error(e.message) });
  const [busy, setBusy] = useState(false);
  const editable = a.permissions.canEdit;
  const add = async () => {
    const file = await pickFile("application/pdf,image/png,image/jpeg,image/webp");
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadFile(file);
      await update.mutateAsync({ id: a.id, patch: { attachments: [...a.attachments, up] } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="المرفقات"
      action={
        editable ? (
          <Button size="sm" icon={<Upload className="size-3.5" />} loading={busy} onClick={() => void add()}>
            إرفاق
          </Button>
        ) : null
      }
    >
      {a.attachments.length ? (
        <ul className="divide-y divide-line">
          {a.attachments.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              {f.mime?.startsWith("image/") ? <Paperclip className="size-4 text-fg-3" /> : <FileText className="size-4 text-fg-3" />}
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:underline">
                {f.name}
              </a>
              {f.size ? <span className="text-[12px] text-fg-3">{formatBytes(f.size)}</span> : null}
              {editable ? (
                <Button size="icon-sm" variant="ghost" aria-label="إزالة" onClick={() => update.mutate({ id: a.id, patch: { attachments: a.attachments.filter((x) => x.id !== f.id) } })}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-3">لا توجد مرفقات. المطلوب عادةً: شهادة الميلاد، صورة الهوية، آخر شهادة، وصورة شخصية.</p>
      )}
    </Card>
  );
}

function NotesCard({ a }: { a: A }) {
  const update = trpc.admissions.update.useMutation();
  const autosave = useAutosave((doc: unknown) => update.mutateAsync({ id: a.id, patch: { notes: doc } }));
  return (
    <Card title="الملاحظات" action={<SaveStatus status={autosave.status} />}>
      <BlockEditor content={a.notes} editable={a.permissions.canEdit} onChange={(doc) => autosave.schedule(doc)} placeholder="ملاحظات المقابلة والتواصل…" />
    </Card>
  );
}
