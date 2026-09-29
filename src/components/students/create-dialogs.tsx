"use client";
/**
 * نوافذ الإنشاء للمجموعات النظامية: تُفتح من زر «جديد» ومن أزرار الإضافة في العروض
 * (عمود اللوحة، يوم التقويم…) مع تعبئة مسبقة بالقيمة المقابلة.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { PropertyDef } from "@/lib/database/types";
import { GENDER, GUARDIAN_RELATION, NATIONALITIES, ADMISSION_SOURCES, normalizeMobile, validateIdNumber, guessIdType } from "@/lib/students";
import { idTypeOptions, type RegionSettings } from "@/lib/region";
import { useRegion } from "@/components/shell/app-context";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { StudentPicker } from "./student-picker";
import { SchoolCreateDialogs } from "./more-create-dialogs";

/** يحوّل قيم الخصائص (بالمعرّف) إلى مفاتيح الحقول النظامية */
export function systemPrefill(values: Record<string, unknown>, properties: PropertyDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [propId, v] of Object.entries(values)) {
    const key = properties.find((p) => p.id === propId)?.systemKey;
    if (key) out[key] = v;
  }
  return out;
}

export interface CreateDialogProps {
  prefill: Record<string, unknown>;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function SystemCreateDialog({ source, ...props }: CreateDialogProps & { source: string }) {
  if (source === "students") return <NewStudentDialog {...props} />;
  if (source === "admissions") return <NewAdmissionDialog {...props} />;
  return <SchoolCreateDialogs source={source} {...props} />;
}

// ---------------------------------------------------------------------
// حقول الهوية المشتركة
// ---------------------------------------------------------------------

export interface IdentityForm {
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  familyName: string;
  gender: "MALE" | "FEMALE" | "";
  nationality: string;
  idType: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId: string;
  birthDate: string;
  branchId: string;
  gradeId: string;
  guardianName: string;
  guardianRelation: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";
  guardianPhone: string;
  guardianNationalId: string;
}

export const emptyIdentity = (prefill: Record<string, unknown> = {}, country = "SA"): IdentityForm => ({
  firstName: "",
  fatherName: "",
  grandfatherName: "",
  familyName: "",
  gender: typeof prefill.gender === "string" ? (prefill.gender as "MALE") : "",
  nationality: NATIONALITIES.some((n) => n.id === country) ? country : "OTHER",
  idType: NATIONALITIES.some((n) => n.id === country) ? "NATIONAL_ID" : "PASSPORT",
  nationalId: "",
  birthDate: "",
  branchId: typeof prefill.branch === "string" ? prefill.branch : "",
  gradeId: typeof prefill.grade === "string" ? prefill.grade : "",
  guardianName: "",
  guardianRelation: "FATHER",
  guardianPhone: "",
  guardianNationalId: "",
});

/** أخطاء التحقق في الواجهة قبل الإرسال (الخادم يتحقق مجدداً) */
export function identityErrors(f: IdentityForm, region: RegionSettings): Partial<Record<keyof IdentityForm, string>> {
  const e: Partial<Record<keyof IdentityForm, string>> = {};
  for (const k of ["firstName", "fatherName", "grandfatherName", "familyName"] as const) if (!f[k].trim()) e[k] = "مطلوب";
  if (!f.gender) e.gender = "اختر الجنس";
  if (!f.branchId) e.branchId = "اختر الفرع";
  if (!f.gradeId) e.gradeId = "اختر الصف";
  if (!f.birthDate) e.birthDate = "مطلوب";
  const idErr = f.nationalId ? validateIdNumber(f.idType, f.nationalId, region) : "مطلوب";
  if (idErr) e.nationalId = idErr;
  if (f.guardianName.trim().length < 3) e.guardianName = "اكتب اسم ولي الأمر";
  if (!normalizeMobile(f.guardianPhone, region)) e.guardianPhone = `رقم جوال غير صالح (${region.mobileHint})`;
  if (f.guardianNationalId && validateIdNumber(guessIdType(f.guardianNationalId, region), f.guardianNationalId, region)) e.guardianNationalId = "رقم الهوية غير صالح";
  return e;
}

export function IdentityFields({
  form,
  set,
  errors,
  options,
  showErrors,
  extra,
  region,
}: {
  region: RegionSettings;
  form: IdentityForm;
  set: (patch: Partial<IdentityForm>) => void;
  errors: Partial<Record<keyof IdentityForm, string>>;
  options: { branches: Array<{ id: string; name: string; gender: string }>; grades: Array<{ id: string; name: string; stage: string }> } | undefined;
  showErrors: boolean;
  extra?: ReactNode;
}) {
  const err = (k: keyof IdentityForm) => (showErrors ? (errors[k] ?? null) : null);
  const branch = options?.branches.find((b) => b.id === form.branchId);
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-fg-2">بيانات الطالب</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="الاسم الأول" error={err("firstName")}>
            <Input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} autoFocus />
          </Field>
          <Field label="اسم الأب" error={err("fatherName")}>
            <Input value={form.fatherName} onChange={(e) => set({ fatherName: e.target.value })} />
          </Field>
          <Field label="اسم الجد" error={err("grandfatherName")}>
            <Input value={form.grandfatherName} onChange={(e) => set({ grandfatherName: e.target.value })} />
          </Field>
          <Field label="اسم العائلة" error={err("familyName")}>
            <Input value={form.familyName} onChange={(e) => set({ familyName: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="الجنس" error={err("gender")}>
            <Segmented value={form.gender || "MALE"} onChange={(v) => set({ gender: v })} options={[{ value: "MALE", label: GENDER.MALE.label }, { value: "FEMALE", label: GENDER.FEMALE.label }]} />
          </Field>
          <Field label="الجنسية">
            <Select value={form.nationality} onChange={(v) => set({ nationality: v, idType: v === region.country ? "NATIONAL_ID" : "IQAMA" })} options={NATIONALITIES.map((n) => ({ value: n.id, label: n.name }))} />
          </Field>
          <Field label="نوع الهوية">
            <Select value={form.idType} onChange={(v) => set({ idType: v as IdentityForm["idType"] })} options={idTypeOptions(region)} />
          </Field>
          <Field label="رقم الهوية" error={err("nationalId")}>
            <Input value={form.nationalId} onChange={(e) => set({ nationalId: e.target.value })} dir="ltr" inputMode="numeric" className="text-end tabular" />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="تاريخ الميلاد" error={err("birthDate")}>
            <Input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="الفرع" error={err("branchId")} hint={branch ? (branch.gender === "BOYS" ? "للبنين" : branch.gender === "GIRLS" ? "للبنات" : undefined) : undefined}>
            <Select value={form.branchId || undefined} onChange={(v) => set({ branchId: v })} options={(options?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} placeholder="اختر الفرع" />
          </Field>
          <Field label="الصف" error={err("gradeId")}>
            <Select value={form.gradeId || undefined} onChange={(v) => set({ gradeId: v })} options={(options?.grades ?? []).map((g) => ({ value: g.id, label: `${g.name} — ${g.stage}` }))} placeholder="اختر الصف" />
          </Field>
        </div>
        {extra}
      </section>
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-fg-2">ولي الأمر</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="الاسم" error={err("guardianName")} className="col-span-2">
            <Input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
          </Field>
          <Field label="صلة القرابة">
            <Select value={form.guardianRelation} onChange={(v) => set({ guardianRelation: v as IdentityForm["guardianRelation"] })} options={Object.entries(GUARDIAN_RELATION).map(([value, o]) => ({ value, label: o.label }))} />
          </Field>
          <Field label="الجوال" error={err("guardianPhone")}>
            <Input value={form.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} dir="ltr" inputMode="tel" placeholder={region.mobileHint} className="text-end" />
          </Field>
          <Field label="هوية ولي الأمر (اختياري)" error={err("guardianNationalId")} className="col-span-2" hint="تربط الأشقاء تلقائياً">
            <Input value={form.guardianNationalId} onChange={(e) => set({ guardianNationalId: e.target.value })} dir="ltr" inputMode="numeric" className="text-end" />
          </Field>
        </div>
      </section>
    </div>
  );
}

function useIdentity(prefill: Record<string, unknown>) {
  const region = useRegion();
  const [form, setForm] = useState<IdentityForm>(() => emptyIdentity(prefill, region.country));
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => identityErrors(form, region), [form, region]);
  return { form, set: (patch: Partial<IdentityForm>) => setForm((f) => ({ ...f, ...patch })), errors, showErrors, setShowErrors, region, valid: Object.keys(errors).length === 0 };
}

// ---------------------------------------------------------------------
// طلب قبول
// ---------------------------------------------------------------------

function NewAdmissionDialog({ prefill, onClose, onCreated }: CreateDialogProps) {
  const options = trpc.students.formOptions.useQuery();
  const id = useIdentity(prefill);
  const [source, setSource] = useState<string>(typeof prefill.source === "string" ? prefill.source : "");
  const [previousSchool, setPreviousSchool] = useState("");
  const [notes, setNotes] = useState("");
  const seats = trpc.admissions.seats.useQuery({ branchId: id.form.branchId, gradeId: id.form.gradeId }, { enabled: Boolean(id.form.branchId && id.form.gradeId) });
  const create = trpc.admissions.create.useMutation({
    onSuccess: (a) => {
      toast.success(`سُجّل الطلب رقم ${a.number}`);
      onCreated(a.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    id.setShowErrors(true);
    if (!id.valid) return;
    const f = id.form;
    create.mutate({
      ...f,
      gender: f.gender as "MALE",
      birthDate: new Date(`${f.birthDate}T00:00:00Z`),
      requestedGradeId: f.gradeId,
      guardianNationalId: f.guardianNationalId || null,
      previousSchool: previousSchool || null,
      source: source || null,
      notes: notes || null,
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="طلب قبول جديد" description="تُرسل رسالة استلام لولي الأمر، ويُشعَر فريق القبول." width={760}>
        <IdentityFields
          region={id.region}
          form={id.form}
          set={id.set}
          errors={id.errors}
          options={options.data}
          showErrors={id.showErrors}
          extra={
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="المدرسة السابقة">
                <Input value={previousSchool} onChange={(e) => setPreviousSchool(e.target.value)} />
              </Field>
              <Field label="كيف عرفتنا">
                <Select value={source || undefined} onChange={setSource} options={ADMISSION_SOURCES.map((s) => ({ value: s.id, label: s.name }))} placeholder="اختياري" />
              </Field>
              {seats.data ? (
                <p className="col-span-2 text-[12px] text-fg-3">
                  المقاعد المتاحة في الصف: <b className={seats.data.available > 0 ? "text-success-800" : "text-danger-700"}>{new Intl.NumberFormat("ar-SA").format(seats.data.available)}</b> من {new Intl.NumberFormat("ar-SA").format(seats.data.capacity)}
                </p>
              ) : null}
            </div>
          }
        />
        <Field label="ملاحظات" className="mt-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            تسجيل الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// طالب مباشرة
// ---------------------------------------------------------------------

function NewStudentDialog({ prefill, onClose, onCreated }: CreateDialogProps) {
  const options = trpc.students.formOptions.useQuery();
  const sections = trpc.academic.sectionOptions.useQuery();
  const id = useIdentity(prefill);
  const [sectionId, setSectionId] = useState<string>(typeof prefill.section === "string" ? prefill.section : "");
  const create = trpc.students.create.useMutation({
    onSuccess: (s) => {
      toast.success(`أُضيف الطالب برقم أكاديمي ${s.academicNumber}`);
      onCreated(s.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const gradeSections = (sections.data ?? []).filter((s) => s.gradeId === id.form.gradeId && (!id.form.branchId || s.branchId === id.form.branchId));
  const submit = () => {
    id.setShowErrors(true);
    if (!id.valid) return;
    const f = id.form;
    create.mutate({ ...f, gender: f.gender as "MALE", birthDate: new Date(`${f.birthDate}T00:00:00Z`), sectionId: sectionId || null, guardianNationalId: f.guardianNationalId || null });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إضافة طالب" description="للطلاب الحاليين عند بدء استخدام المنصة. الطلاب الجدد يمرّون عبر «طلبات القبول»." width={760}>
        <IdentityFields
          region={id.region}
          form={id.form}
          set={id.set}
          errors={id.errors}
          options={options.data}
          showErrors={id.showErrors}
          extra={
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="الفصل (اختياري)">
                <Select value={sectionId || undefined} onChange={setSectionId} options={gradeSections.map((s) => ({ value: s.id, label: `${s.name} (${s.occupied}/${s.capacity})` }))} placeholder={id.form.gradeId ? "بدون تسكين" : "اختر الصف أولاً"} disabled={!id.form.gradeId} />
              </Field>
            </div>
          }
        />
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            إضافة الطالب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { StudentPicker };
