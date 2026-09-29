"use client";
/**
 * نموذج التقديم العام للقبول (دون حساب): بيانات الطالب وولي الأمر والمرفقات والإقرار.
 * يتحقق في المتصفح ثم في الخادم، ويعرض رقم الطلب عند النجاح.
 */
import { motion } from "motion/react";
import { CheckCircle2, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { ADMISSION_SOURCES } from "@/lib/students";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { formatBytes, pickFile, type UploadedFile } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { readRegion } from "@/lib/region";
import { IdentityFields, emptyIdentity, identityErrors, type IdentityForm } from "@/components/students/create-dialogs";

async function publicUpload(slug: string, file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/public/upload?slug=${encodeURIComponent(slug)}`, { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as UploadedFile & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "تعذر رفع الملف");
  return data;
}

export function PublicApplyForm({ slug }: { slug: string }) {
  const form = trpc.admissions.publicForm.useQuery({ slug }, { retry: false });
  const [id, setId] = useState<IdentityForm>(() => emptyIdentity());
  const region = useMemo(() => readRegion(form.data?.regionSettings), [form.data?.regionSettings]);
  const [extra, setExtra] = useState({ previousSchool: "", guardianEmail: "", motherName: "", motherPhone: "", address: "", source: "", notes: "", website: "" });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [consent, setConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [uploading, setUploading] = useState(false);
  const errors = useMemo(() => identityErrors(id, region), [id, region]);
  const apply = trpc.admissions.publicApply.useMutation({ onError: (e) => toast.error(e.message) });

  if (form.error) return <EmptyState illustration="lock" title="نموذج التقديم غير متاح" description="تواصل مع المدرسة للحصول على الرابط الصحيح." />;
  if (!form.data) return <SkeletonLines lines={12} />;
  const school = form.data.school;

  if (apply.data) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl bg-card p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto size-12 text-success-800" />
        <h1 className="mt-4 text-[24px] font-bold">استلمنا طلبكم</h1>
        <p className="mt-2 text-[15px] text-fg-2">
          رقم الطلب: <b className="tabular">{formatNumber(apply.data.number, "arab")}</b>
        </p>
        <p className="mt-1 text-[14px] text-fg-3">أُرسلت رسالة تأكيد إلى جوالكم، وسيتواصل معكم فريق القبول في {school.name}.</p>
      </motion.div>
    );
  }

  const addFile = async () => {
    const file = await pickFile("application/pdf,image/png,image/jpeg,image/webp");
    if (!file) return;
    setUploading(true);
    try {
      const up = await publicUpload(slug, file);
      setFiles((f) => [...f, up]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(errors).length) {
      toast.error("راجع الحقول المطلوبة");
      return;
    }
    if (!consent) {
      toast.error("يلزم الإقرار بصحة البيانات");
      return;
    }
    apply.mutate({
      slug,
      website: extra.website,
      consent: true,
      ...id,
      gender: id.gender as "MALE",
      birthDate: new Date(`${id.birthDate}T00:00:00Z`),
      requestedGradeId: id.gradeId,
      guardianNationalId: id.guardianNationalId || null,
      previousSchool: extra.previousSchool || null,
      guardianEmail: extra.guardianEmail || null,
      motherName: extra.motherName || null,
      motherPhone: extra.motherPhone || null,
      address: extra.address || null,
      source: extra.source || null,
      notes: extra.notes || null,
      attachments: files,
    });
  };

  return (
    <div className="space-y-4">
      {school.isDemo ? <p className="rounded-md bg-gold-50 px-3 py-2 text-center text-[12px] font-medium text-gold-700">بيانات تجريبية — هذا نموذج لعرض المنصة</p> : null}
      <header className="rounded-xl bg-card p-6 shadow-card">
        <p className="text-[13px] text-fg-3">{school.name}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight">طلب التحاق</h1>
        {school.intro ? <p className="mt-2 whitespace-pre-line text-[14px] leading-7 text-fg-2">{school.intro}</p> : <p className="mt-2 text-[14px] text-fg-3">عبّئ البيانات بدقة كما في الهوية. يستغرق النموذج نحو ٥ دقائق.</p>}
      </header>
      <section className="rounded-xl bg-card p-6 shadow-card">
        <IdentityFields region={region} form={id} set={(p) => setId((f) => ({ ...f, ...p }))} errors={errors} options={form.data} showErrors={showErrors} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="بريد ولي الأمر (اختياري)">
            <Input type="email" value={extra.guardianEmail} onChange={(e) => setExtra({ ...extra, guardianEmail: e.target.value })} dir="ltr" className="text-end" />
          </Field>
          <Field label="المدرسة السابقة (إن وجدت)">
            <Input value={extra.previousSchool} onChange={(e) => setExtra({ ...extra, previousSchool: e.target.value })} />
          </Field>
          <Field label="اسم الأم (اختياري)">
            <Input value={extra.motherName} onChange={(e) => setExtra({ ...extra, motherName: e.target.value })} />
          </Field>
          <Field label="جوال الأم (اختياري)">
            <Input value={extra.motherPhone} onChange={(e) => setExtra({ ...extra, motherPhone: e.target.value })} dir="ltr" className="text-end" />
          </Field>
          <Field label="العنوان (الحي)">
            <Input value={extra.address} onChange={(e) => setExtra({ ...extra, address: e.target.value })} />
          </Field>
          <Field label="كيف عرفتم المدرسة؟">
            <Select value={extra.source || undefined} onChange={(v) => setExtra({ ...extra, source: v })} options={ADMISSION_SOURCES.map((s) => ({ value: s.id, label: s.name }))} placeholder="اختياري" />
          </Field>
          <Field label="ملاحظات (اختياري)" className="sm:col-span-2">
            <Textarea rows={2} value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} />
          </Field>
        </div>
        {/* حقل مصيدة للبرامج الآلية: مخفي عن المستخدمين */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={extra.website} onChange={(e) => setExtra({ ...extra, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      </section>
      <section className="rounded-xl bg-card p-6 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">المرفقات</h2>
          <Button size="sm" icon={<Upload className="size-3.5" />} loading={uploading} onClick={() => void addFile()} disabled={files.length >= 10}>
            إرفاق ملف
          </Button>
        </div>
        <p className="text-[12px] text-fg-3">شهادة الميلاد، صورة الهوية، آخر شهادة دراسية، صورة شخصية (PDF أو صورة، حتى ٥ م.ب لكل ملف).</p>
        {files.length ? (
          <ul className="mt-3 divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2 text-[13px]">
                {f.mime.startsWith("image/") ? <Paperclip className="size-4 text-fg-3" /> : <FileText className="size-4 text-fg-3" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-[12px] text-fg-3">{formatBytes(f.size)}</span>
                <Button size="icon-sm" variant="ghost" aria-label="إزالة" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="rounded-xl bg-card p-6 shadow-card">
        <label className="flex items-start gap-2.5 text-[14px] leading-6">
          <Checkbox checked={consent} onChange={setConsent} />
          <span>أقرّ بصحة البيانات المدخلة، وأوافق على استخدامها لأغراض القبول والتواصل وفق سياسة الخصوصية للمدرسة.</span>
        </label>
        <Button variant="primary" size="lg" className="mt-4 w-full justify-center" loading={apply.isPending} onClick={submit}>
          إرسال الطلب
        </Button>
      </section>
    </div>
  );
}
