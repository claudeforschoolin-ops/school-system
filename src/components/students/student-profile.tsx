"use client";
/**
 * ملف الطالب: رأس بالصورة والاسم والرقم الأكاديمي والصف والحالة، ثم تبويبات:
 * نظرة عامة، البيانات الشخصية، أولياء الأمور، الصحة، المستندات، الملاحظات، سجل التغييرات
 * (والحضور والسلوك والأنشطة من وحداتها).
 */
import { AlertTriangle, BadgeCheck, Camera, Eye, FileText, HeartPulse, Phone, Plus, Star, Trash2, Upload, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BLOOD_TYPES, DOCUMENT_TYPES, GENDER, GUARDIAN_RELATION, ID_TYPE, NATIONALITIES, STUDENT_STATUS, TRANSPORT_MODES, ageAt, normalizeSaudiMobile } from "@/lib/students";
import { ACTION_LABELS } from "@/server/db/audit-utils";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { formatBytes, pickFile, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { BlockEditor } from "@/components/editor/block-editor";
import { SaveStatus, useAutosave } from "@/components/database/row-view";
import { StudentExtraTabs, studentExtraTabs } from "./student-extra-tabs";

type Profile = RouterOutputs["students"]["get"];

const BASE_TABS = [
  { key: "overview", label: "نظرة عامة" },
  { key: "personal", label: "البيانات الشخصية" },
  { key: "guardians", label: "أولياء الأمور" },
  { key: "health", label: "الصحة" },
  { key: "documents", label: "المستندات" },
  { key: "notes", label: "الملاحظات" },
  { key: "activity", label: "سجل التغييرات" },
] as const;

export function StudentProfile({ id }: { id: string }) {
  const { can } = useApp();
  const q = trpc.students.get.useQuery({ id });
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabs = [...BASE_TABS.slice(0, 3), ...studentExtraTabs(can), ...BASE_TABS.slice(3)];
  const tab = tabs.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";
  useTabMeta(q.data?.fullName ?? "ملف طالب", "lucide:contact");

  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض ملف الطالب" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const s = q.data;
  const setTab = (key: string) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  return (
    <>
      <PageTopbar crumbs={[{ title: "شؤون الطلاب", icon: "lucide:users" }, { title: "ملفات الطلاب", icon: "lucide:contact", href: "/students" }, { title: s.fullName }]} />
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-24 pt-10 md:px-12">
        <ProfileHeader s={s} />
        <nav className="no-print mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="أقسام الملف">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn("relative -mb-px shrink-0 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors", tab === t.key ? "border-fg font-medium text-fg" : "border-transparent text-fg-3 hover:text-fg-2")}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-6">
          {tab === "overview" ? <OverviewTab s={s} onTab={setTab} /> : null}
          {tab === "personal" ? <PersonalTab s={s} /> : null}
          {tab === "guardians" ? <GuardiansTab s={s} /> : null}
          {tab === "health" ? <HealthTab s={s} /> : null}
          {tab === "documents" ? <DocumentsTab s={s} /> : null}
          {tab === "notes" ? <NotesTab s={s} /> : null}
          {tab === "activity" ? <ActivityTab id={s.id} /> : null}
          <StudentExtraTabs tab={tab} studentId={s.id} />
        </div>
      </div>
    </>
  );
}

function ProfileHeader({ s }: { s: Profile }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const update = trpc.students.update.useMutation({ onSuccess: () => utils.students.get.invalidate({ id: s.id }), onError: (e) => toast.error(e.message) });
  const status = STUDENT_STATUS[s.status as keyof typeof STUDENT_STATUS];
  const changePhoto = async () => {
    const file = await pickFile("image/png,image/jpeg,image/webp");
    if (!file) return;
    try {
      const up = await uploadFile(file);
      update.mutate({ id: s.id, patch: { photoUrl: up.url } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
      <div className="relative w-fit">
        <Avatar name={s.fullName} src={s.photoUrl} size={96} className="text-[34px]" />
        {s.permissions.canEdit ? (
          <button onClick={() => void changePhoto()} className="no-print absolute -bottom-1 -end-1 grid size-8 place-items-center rounded-full bg-card text-fg-2 shadow-card hover:text-fg" aria-label="تغيير الصورة">
            <Camera className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[32px] font-bold leading-tight md:text-[36px]">{s.fullName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
          <span className="tabular" dir="ltr">
            {s.academicNumber}
          </span>
          <span className="text-fg-4">·</span>
          <span>
            {s.grade.name}
            {s.section ? ` / ${s.section.name}` : " — بدون فصل"}
          </span>
          <span className="text-fg-4">·</span>
          <span>{s.branch.name}</span>
          <Tag color={status.color}>{status.label}</Tag>
          {s.health.criticalHealth ? (
            <Tag color="red">
              <HeartPulse className="me-1 inline size-3.5" />
              حالة صحية حرجة
            </Tag>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] text-fg-3">
          العمر {formatNumber(ageAt(s.birthDate), prefs.digits)} سنة · التحق {formatDate(s.enrollmentDate, { digits: prefs.digits, calendar: prefs.calendar })}
        </p>
      </div>
    </header>
  );
}

function Card({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg bg-card p-4 shadow-card", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-fg-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px]">{children ?? <span className="text-fg-4">—</span>}</dd>
    </div>
  );
}

function OverviewTab({ s, onTab }: { s: Profile; onTab: (t: string) => void }) {
  const { prefs } = useApp();
  const primary = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {s.missingDocuments.length || s.health.criticalHealth ? (
          <div className="space-y-2">
            {s.health.criticalHealth ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
                <HeartPulse className="mt-0.5 size-4 shrink-0" />
                <p>
                  <b>حالة صحية حرجة:</b> {[s.health.chronicConditions, s.health.allergies && `حساسية: ${s.health.allergies}`].filter(Boolean).join(" — ") || "راجع تبويب الصحة"}
                </p>
              </div>
            ) : null}
            {s.missingDocuments.length ? (
              <button onClick={() => onTab("documents")} className="flex w-full items-start gap-2.5 rounded-lg bg-warning-50 px-3.5 py-2.5 text-start text-[13px] text-warning-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>مستندات ناقصة: {s.missingDocuments.map((d) => d.label).join("، ")}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <Card title="البيانات الأساسية">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Fact label="الصف والفصل">{s.section ? `${s.grade.name} / ${s.section.name}` : s.grade.name}</Fact>
            <Fact label="المرحلة">{s.grade.stage.name}</Fact>
            <Fact label="رائد الفصل">{s.section?.homeroom?.name}</Fact>
            <Fact label="تاريخ الميلاد">{formatDate(s.birthDate, { digits: prefs.digits, calendar: "both" })}</Fact>
            <Fact label="الجنسية">{NATIONALITIES.find((n) => n.id === s.nationality)?.name ?? s.nationality}</Fact>
            <Fact label="رقم الهوية">
              <span dir="ltr">{s.nationalIdMasked}</span>
            </Fact>
            <Fact label="وسيلة الوصول">{TRANSPORT_MODES.find((t) => t.id === s.logistics.transportMode)?.name}</Fact>
            <Fact label="رقم الحافلة">{s.logistics.busNumber}</Fact>
            <Fact label="العام الدراسي">{s.academicYear.name}</Fact>
          </dl>
        </Card>
        {s.admission ? (
          <p className="text-[12px] text-fg-3">
            التحق عبر{" "}
            <Link href={`/admissions/${s.admission.id}`} className="underline">
              طلب القبول رقم {formatNumber(s.admission.number, prefs.digits)}
            </Link>{" "}
            ({s.admission.submittedVia === "PUBLIC_FORM" ? "النموذج العام" : "موظف القبول"})
          </p>
        ) : null}
      </div>
      <div className="space-y-4">
        <Card title="ولي الأمر">
          {primary ? (
            <div className="flex items-center gap-3">
              <Avatar name={primary.guardian.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{primary.guardian.name}</p>
                <p className="text-[12px] text-fg-3">{GUARDIAN_RELATION[primary.relation as keyof typeof GUARDIAN_RELATION].label}</p>
              </div>
              <a href={`tel:${primary.guardian.phone}`} className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover" aria-label="اتصال">
                <Phone className="size-4" />
              </a>
            </div>
          ) : (
            <p className="text-[13px] text-fg-3">لا يوجد ولي أمر مرتبط</p>
          )}
          <button onClick={() => onTab("guardians")} className="mt-3 text-[12px] text-fg-3 underline">
            كل أولياء الأمور ({formatNumber(s.guardians.length, prefs.digits)})
          </button>
        </Card>
        <Card title="الأشقاء في المدرسة" action={<Users className="size-4 text-fg-3" />}>
          {s.siblings.length ? (
            <ul className="space-y-2">
              {s.siblings.map((sib) => (
                <li key={sib.id}>
                  <Link href={`/students/${sib.id}`} className="flex items-center gap-2 rounded-md p-1 hover:bg-hover">
                    <Avatar name={sib.fullName} src={sib.photoUrl} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{sib.fullName}</span>
                      <span className="block text-[11px] text-fg-3">{sib.grade.name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-3">لا يوجد أشقاء مرتبطون بنفس ولي الأمر.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function PersonalTab({ s }: { s: Profile }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    ...s.names,
    gender: s.gender as "MALE" | "FEMALE",
    nationality: s.nationality,
    idType: s.idType as "NATIONAL_ID" | "IQAMA" | "PASSPORT",
    nationalId: "",
    birthDate: new Date(s.birthDate).toISOString().slice(0, 10),
    birthPlace: s.birthPlace ?? "",
    previousSchool: s.previousSchool ?? "",
    transportMode: s.logistics.transportMode ?? "",
    busNumber: s.logistics.busNumber ?? "",
  });
  const [revealed, setRevealed] = useState<string | null>(null);
  const reveal = trpc.students.revealId.useMutation({ onSuccess: (r) => setRevealed(r.value), onError: (e) => toast.error(e.message) });
  const save = trpc.students.update.useMutation({
    onSuccess: async () => {
      await utils.students.get.invalidate({ id: s.id });
      toast.success("حُفظت البيانات");
      setForm((f) => ({ ...f, nationalId: "" }));
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const editable = s.permissions.canEdit;
  const submit = () =>
    save.mutate({
      id: s.id,
      patch: {
        firstName: form.firstName,
        fatherName: form.fatherName,
        grandfatherName: form.grandfatherName,
        familyName: form.familyName,
        gender: form.gender,
        nationality: form.nationality,
        idType: form.idType,
        ...(form.nationalId ? { nationalId: form.nationalId } : {}),
        birthDate: new Date(`${form.birthDate}T00:00:00Z`),
        birthPlace: form.birthPlace || null,
        previousSchool: form.previousSchool || null,
        transportMode: form.transportMode || null,
        busNumber: form.busNumber || null,
      },
    });
  return (
    <div className="space-y-4">
      <Card title="الاسم والهوية">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["firstName", "fatherName", "grandfatherName", "familyName"] as const).map((k, i) => (
            <Field key={k} label={["الاسم الأول", "اسم الأب", "اسم الجد", "اسم العائلة"][i]!}>
              <Input value={form[k]} onChange={(e) => set({ [k]: e.target.value })} disabled={!editable} />
            </Field>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="الجنس">
            <Segmented value={form.gender} onChange={(v) => editable && set({ gender: v })} options={[{ value: "MALE", label: GENDER.MALE.label }, { value: "FEMALE", label: GENDER.FEMALE.label }]} />
          </Field>
          <Field label="الجنسية">
            <Select value={form.nationality} onChange={(v) => set({ nationality: v })} options={NATIONALITIES.map((n) => ({ value: n.id, label: n.name }))} disabled={!editable} />
          </Field>
          <Field label="نوع الهوية">
            <Select value={form.idType} onChange={(v) => set({ idType: v as typeof form.idType })} options={Object.entries(ID_TYPE).map(([value, o]) => ({ value, label: o.label }))} disabled={!editable} />
          </Field>
          <Field label="رقم الهوية" hint={revealed ? undefined : "مخزّن مشفّراً"}>
            <div className="flex items-center gap-1">
              <Input value={form.nationalId} onChange={(e) => set({ nationalId: e.target.value })} placeholder={revealed ?? s.nationalIdMasked ?? ""} dir="ltr" className="text-end tabular" disabled={!editable} />
              {s.permissions.canReveal && !revealed ? (
                <Tooltip content="إظهار الرقم كاملاً (يُسجَّل في التدقيق)">
                  <Button size="icon" variant="ghost" onClick={() => reveal.mutate({ id: s.id })} loading={reveal.isPending} aria-label="إظهار رقم الهوية">
                    <Eye className="size-4" />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </Field>
        </div>
      </Card>
      <Card title="الميلاد والدراسة السابقة والوصول">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="تاريخ الميلاد">
            <Input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="مكان الميلاد">
            <Input value={form.birthPlace} onChange={(e) => set({ birthPlace: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="المدرسة السابقة">
            <Input value={form.previousSchool} onChange={(e) => set({ previousSchool: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="وسيلة الوصول">
            <Select value={form.transportMode || undefined} onChange={(v) => set({ transportMode: v })} options={TRANSPORT_MODES.map((t) => ({ value: t.id, label: t.name }))} placeholder="غير محدد" disabled={!editable} />
          </Field>
          <Field label="رقم الحافلة">
            <Input value={form.busNumber} onChange={(e) => set({ busNumber: e.target.value })} disabled={!editable} />
          </Field>
        </div>
      </Card>
      {editable ? (
        <div className="flex justify-end">
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            حفظ التغييرات
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GuardiansTab({ s }: { s: Profile }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.students.get.invalidate({ id: s.id });
  const link = trpc.students.updateGuardianLink.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.students.removeGuardian.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile["guardians"][number] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const editable = s.permissions.canEdit;
  return (
    <div className="space-y-3">
      {s.guardians.map((g) => (
        <section key={g.linkId} className="rounded-lg bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={g.guardian.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[15px] font-medium">
                {g.guardian.name}
                {g.isPrimary ? (
                  <Tag color="navy" size="sm">
                    <Star className="me-0.5 inline size-3" />
                    الأساسي
                  </Tag>
                ) : null}
              </p>
              <p className="text-[12px] text-fg-3">
                {GUARDIAN_RELATION[g.relation as keyof typeof GUARDIAN_RELATION].label}
                {g.guardian.occupation ? ` · ${g.guardian.occupation}` : ""}
              </p>
            </div>
            <a href={`tel:${g.guardian.phone}`} className="text-[13px] tabular text-fg-2 hover:underline" dir="ltr">
              {g.guardian.phone}
            </a>
            {editable ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>
                تعديل
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[13px]">
            <label className="flex items-center gap-2">
              <Switch checked={g.isPrimary} disabled={!editable || g.isPrimary} onChange={(v) => link.mutate({ linkId: g.linkId, isPrimary: v })} />
              ولي الأمر الأساسي
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={g.canPickup} disabled={!editable} onChange={(v) => link.mutate({ linkId: g.linkId, canPickup: v })} />
              مصرّح باستلام الطالب
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={g.receivesNotifications} disabled={!editable} onChange={(v) => link.mutate({ linkId: g.linkId, receivesNotifications: v })} />
              يتلقى الإشعارات (الغياب…)
            </label>
            {editable && s.guardians.length > 1 ? (
              <button onClick={() => setRemoving(g.linkId)} className="ms-auto flex items-center gap-1 text-[12px] text-danger-700 hover:underline">
                <Trash2 className="size-3.5" />
                فك الارتباط
              </button>
            ) : null}
          </div>
        </section>
      ))}
      {editable ? (
        <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          إضافة ولي أمر
        </Button>
      ) : null}
      {adding ? <AddGuardianDialog studentId={s.id} onClose={() => setAdding(false)} onDone={refresh} /> : null}
      {editing ? <EditGuardianDialog link={editing} onClose={() => setEditing(null)} onDone={refresh} /> : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="فك ارتباط ولي الأمر؟"
        description="يبقى ولي الأمر مرتبطاً بأبنائه الآخرين إن وُجدوا."
        confirmLabel="فك الارتباط"
        danger
        onConfirm={() => removing && remove.mutate({ linkId: removing })}
      />
    </div>
  );
}

function AddGuardianDialog({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", nationalId: "", relation: "MOTHER" as "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER", isPrimary: false });
  const found = trpc.students.searchGuardians.useQuery({ query }, { enabled: mode === "existing" && query.trim().length >= 2 });
  const add = trpc.students.addGuardian.useMutation({
    onSuccess: () => {
      toast.success("أُضيف ولي الأمر");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    if (mode === "existing") {
      if (!picked) return toast.error("اختر ولي أمر من النتائج");
      add.mutate({ studentId, guardianId: picked, relation: form.relation, isPrimary: form.isPrimary });
    } else {
      if (!normalizeSaudiMobile(form.phone)) return toast.error("رقم الجوال غير صالح");
      add.mutate({ studentId, relation: form.relation, isPrimary: form.isPrimary, name: form.name, phone: form.phone, email: form.email || null, nationalId: form.nationalId || null });
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إضافة ولي أمر" width={560}>
        <Segmented value={mode} onChange={setMode} options={[{ value: "existing", label: "ولي أمر مسجّل" }, { value: "new", label: "ولي أمر جديد" }]} />
        <div className="mt-4 space-y-3">
          {mode === "existing" ? (
            <>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم الجوال" autoFocus />
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {found.data?.map((g) => (
                  <li key={g.id}>
                    <button onClick={() => setPicked(g.id)} className={cn("flex w-full items-center gap-2 rounded-md p-2 text-start hover:bg-hover", picked === g.id && "bg-active")}>
                      <Avatar name={g.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{g.name}</span>
                        <span className="block truncate text-[11px] text-fg-3">
                          <span dir="ltr">{g.phone}</span>
                          {g.children.length ? ` · أبناؤه: ${g.children.join("، ")}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {query.trim().length >= 2 && found.data?.length === 0 ? <li className="py-2 text-center text-[12px] text-fg-3">لا نتائج — أضفه كولي أمر جديد</li> : null}
              </ul>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="الاسم" className="col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="الجوال">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-end" placeholder="05xxxxxxxx" />
              </Field>
              <Field label="البريد">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-end" />
              </Field>
              <Field label="رقم الهوية (اختياري)" className="col-span-2">
                <Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} dir="ltr" className="text-end" />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="صلة القرابة">
              <Select value={form.relation} onChange={(v) => setForm({ ...form, relation: v as typeof form.relation })} options={Object.entries(GUARDIAN_RELATION).map(([value, o]) => ({ value, label: o.label }))} />
            </Field>
            <label className="flex h-8 items-center gap-2 text-[13px]">
              <Switch checked={form.isPrimary} onChange={(v) => setForm({ ...form, isPrimary: v })} />
              ولي الأمر الأساسي
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit} loading={add.isPending}>
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGuardianDialog({ link, onClose, onDone }: { link: Profile["guardians"][number]; onClose: () => void; onDone: () => void }) {
  const g = link.guardian;
  const [form, setForm] = useState({ name: g.name, phone: g.phone, phoneAlt: g.phoneAlt ?? "", email: g.email ?? "", occupation: g.occupation ?? "", employer: g.employer ?? "", address: g.address ?? "" });
  const [relation, setRelation] = useState(link.relation as "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER");
  const save = trpc.students.updateGuardian.useMutation({ onError: (e) => toast.error(e.message) });
  const saveLink = trpc.students.updateGuardianLink.useMutation({ onError: (e) => toast.error(e.message) });
  const submit = async () => {
    await save.mutateAsync({ guardianId: g.id, ...form, phoneAlt: form.phoneAlt || null, email: form.email || null, occupation: form.occupation || null, employer: form.employer || null, address: form.address || null });
    if (relation !== link.relation) await saveLink.mutateAsync({ linkId: link.linkId, relation });
    toast.success("حُفظت بيانات ولي الأمر");
    onDone();
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="بيانات ولي الأمر" description="التعديل ينعكس على كل أبنائه في المدرسة." width={560}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم" className="col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="صلة القرابة بهذا الطالب">
            <Select value={relation} onChange={(v) => setRelation(v as typeof relation)} options={Object.entries(GUARDIAN_RELATION).map(([value, o]) => ({ value, label: o.label }))} />
          </Field>
          <Field label="الجوال">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-end" />
          </Field>
          <Field label="جوال بديل">
            <Input value={form.phoneAlt} onChange={(e) => setForm({ ...form, phoneAlt: e.target.value })} dir="ltr" className="text-end" />
          </Field>
          <Field label="البريد">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-end" />
          </Field>
          <Field label="المهنة">
            <Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
          </Field>
          <Field label="جهة العمل">
            <Input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
          </Field>
          <Field label="العنوان" className="col-span-2">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => void submit()} loading={save.isPending || saveLink.isPending}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HealthTab({ s }: { s: Profile }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    bloodType: s.health.bloodType ?? "",
    chronicConditions: s.health.chronicConditions ?? "",
    allergies: s.health.allergies ?? "",
    medications: s.health.medications ?? "",
    criticalHealth: s.health.criticalHealth,
    healthNotes: s.health.healthNotes ?? "",
  });
  const [contacts, setContacts] = useState(s.emergencyContacts.length ? s.emergencyContacts : [{ name: "", relation: "", phone: "" }]);
  const save = trpc.students.update.useMutation({
    onSuccess: async () => {
      await utils.students.get.invalidate({ id: s.id });
      toast.success("حُفظت البيانات الصحية");
    },
    onError: (e) => toast.error(e.message),
  });
  const editable = s.permissions.canEdit;
  return (
    <div className="space-y-4">
      <Card title="الملف الصحي">
        <label className={cn("mb-4 flex items-center gap-3 rounded-lg p-3 text-[14px]", form.criticalHealth ? "bg-danger-50 text-danger-700" : "bg-hover")}>
          <Switch checked={form.criticalHealth} disabled={!editable} onChange={(v) => setForm({ ...form, criticalHealth: v })} />
          <span>
            <b>حالة صحية حرجة</b> — تظهر شارة حمراء للمعلمين والعيادة في قوائم الطالب
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="فصيلة الدم">
            <Select value={form.bloodType || undefined} onChange={(v) => setForm({ ...form, bloodType: v })} options={BLOOD_TYPES.map((b) => ({ value: b, label: b }))} placeholder="غير محدد" disabled={!editable} />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="الأمراض المزمنة">
            <Textarea rows={3} value={form.chronicConditions} onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="الحساسية">
            <Textarea rows={3} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="الأدوية">
            <Textarea rows={3} value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} disabled={!editable} />
          </Field>
        </div>
        <Field label="ملاحظات صحية" className="mt-3">
          <Textarea rows={2} value={form.healthNotes} onChange={(e) => setForm({ ...form, healthNotes: e.target.value })} disabled={!editable} />
        </Field>
      </Card>
      <Card title="جهات الاتصال في الطوارئ">
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_140px_auto] items-center gap-2">
              <Input value={c.name} placeholder="الاسم" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} disabled={!editable} />
              <Input value={c.relation} placeholder="الصلة" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} disabled={!editable} />
              <Input value={c.phone} placeholder="الجوال" dir="ltr" className="text-end" onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} disabled={!editable} />
              {editable ? (
                <Button size="icon" variant="ghost" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label="حذف">
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {editable && contacts.length < 5 ? (
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setContacts([...contacts, { name: "", relation: "", phone: "" }])}>
              جهة اتصال
            </Button>
          ) : null}
        </div>
      </Card>
      {editable ? (
        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                id: s.id,
                patch: {
                  bloodType: form.bloodType || null,
                  chronicConditions: form.chronicConditions || null,
                  allergies: form.allergies || null,
                  medications: form.medications || null,
                  criticalHealth: form.criticalHealth,
                  healthNotes: form.healthNotes || null,
                  emergencyContacts: contacts.filter((c) => c.name.trim() && c.phone.trim()),
                },
              })
            }
          >
            حفظ
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DocumentsTab({ s }: { s: Profile }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const refresh = () => utils.students.get.invalidate({ id: s.id });
  const add = trpc.students.addDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const verify = trpc.students.verifyDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.students.removeDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const [type, setType] = useState<string>(s.missingDocuments[0]?.type ?? "OTHER");
  const [uploading, setUploading] = useState(false);
  const editable = s.permissions.canEdit;
  const upload = async (forType: string) => {
    const file = await pickFile("application/pdf,image/png,image/jpeg,image/webp");
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadFile(file);
      await add.mutateAsync({ studentId: s.id, type: forType, file: up });
      toast.success("رُفع المستند");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-4">
      {s.missingDocuments.length ? (
        <Card title="مستندات مطلوبة لم تُرفع">
          <ul className="flex flex-wrap gap-2">
            {s.missingDocuments.map((d) => (
              <li key={d.type}>
                <button disabled={!editable || uploading} onClick={() => void upload(d.type)} className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-warning-700/40 bg-warning-50 px-2.5 text-[13px] text-warning-700 hover:border-warning-700 disabled:opacity-60">
                  <Upload className="size-3.5" />
                  {d.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card
        title="المستندات"
        action={
          editable ? (
            <div className="flex items-center gap-2">
              <Select size="sm" className="w-[170px]" value={type} onChange={setType} options={DOCUMENT_TYPES.map((d) => ({ value: d.id, label: d.label }))} />
              <Button size="sm" icon={<Upload className="size-3.5" />} loading={uploading} onClick={() => void upload(type)}>
                رفع
              </Button>
            </div>
          ) : null
        }
      >
        {s.documents.length ? (
          <ul className="divide-y divide-line">
            {s.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="size-5 shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px] font-medium hover:underline">
                    {d.name}
                  </a>
                  <p className="text-[12px] text-fg-3">
                    {DOCUMENT_TYPES.find((t) => t.id === d.type)?.label} · {formatBytes(d.size)} · {formatRelative(d.createdAt, new Date(), prefs.digits)}
                  </p>
                </div>
                {d.verifiedAt ? (
                  <Tag color="green" size="sm">
                    <BadgeCheck className="me-0.5 inline size-3" />
                    مُتحقَّق
                  </Tag>
                ) : editable ? (
                  <Button size="xs" variant="ghost" onClick={() => verify.mutate({ documentId: d.id, verified: true })}>
                    تحقق
                  </Button>
                ) : null}
                {editable ? (
                  <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate({ documentId: d.id })} aria-label="حذف المستند">
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState illustration="blank" title="لا توجد مستندات" compact />
        )}
      </Card>
    </div>
  );
}

function NotesTab({ s }: { s: Profile }) {
  const update = trpc.students.update.useMutation();
  const autosave = useAutosave((doc: unknown) => update.mutateAsync({ id: s.id, patch: { notes: doc } }));
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <SaveStatus status={autosave.status} />
      </div>
      <BlockEditor content={s.notes} editable={s.permissions.canEdit} onChange={(doc) => autosave.schedule(doc)} placeholder="اكتب ملاحظات عن الطالب… اكتب «/» للأوامر" />
    </div>
  );
}

function ActivityTab({ id }: { id: string }) {
  const { prefs } = useApp();
  const q = trpc.students.activity.useQuery({ id });
  if (!q.data) return <PageSkeleton />;
  if (!q.data.length) return <EmptyState illustration="blank" title="لا توجد تغييرات مسجلة" compact />;
  return (
    <ol className="relative space-y-4 border-s border-line ps-5">
      {q.data.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -start-[25px] top-1.5 size-2.5 rounded-full bg-line-strong" />
          <p className="text-[13px]">
            <b>{a.userName ?? "النظام"}</b> {ACTION_LABELS[a.action] ?? a.action} {a.summary ? `— ${a.summary}` : ""}
          </p>
          <p className="text-[12px] text-fg-3">{formatDate(a.createdAt, { digits: prefs.digits, withTime: true })}</p>
        </li>
      ))}
    </ol>
  );
}
