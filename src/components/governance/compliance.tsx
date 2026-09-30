"use client";
/**
 * الامتثال وحماية البيانات (لمسؤول حماية البيانات): نظرة عامة، سياسة الخصوصية بإصداراتها،
 * مصفوفة الموافقات، مدد الاحتفاظ، طلبات أصحاب البيانات، والإعدادات.
 */
import { Download, FileCheck2, Play, Plus, Search, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell, type ModuleTab } from "@/components/modules/module-shell";
import { usePrefs } from "@/components/shell/app-context";
import { FinTable, num, useFmtDate } from "@/components/finance/common";
import { ModuleSettingsForm } from "@/components/ops/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { govNav } from "./workflows";

export const COMPLIANCE_TABS: ModuleTab[] = [
  { href: "/compliance", label: "نظرة عامة", exact: true },
  { href: "/compliance/policies", label: "سياسة الخصوصية" },
  { href: "/compliance/consents", label: "الموافقات" },
  { href: "/compliance/retention", label: "مدد الاحتفاظ" },
  { href: "/compliance/requests", label: "طلبات البيانات" },
  { href: "/compliance/settings", label: "الإعدادات" },
];

export const REQUEST_KIND: Record<string, string> = { ACCESS: "الاطلاع على البيانات", CORRECTION: "تصحيح البيانات", DELETION: "حذف البيانات", PORTABILITY: "نسخة قابلة للنقل", OBJECTION: "الاعتراض على المعالجة" };
export const REQUEST_STATUS: Record<string, { label: string; color: "gray" | "gold" | "navy" | "green" | "red" }> = { RECEIVED: { label: "مستلم", color: "gray" }, VERIFYING: { label: "التحقق من الهوية", color: "gold" }, IN_PROGRESS: { label: "قيد المعالجة", color: "navy" }, COMPLETED: { label: "مكتمل", color: "green" }, REJECTED: { label: "مرفوض", color: "red" } };
export const CONSENT_LABEL: Record<string, { label: string; color: "green" | "red" | "gray" | "gold" }> = { GRANTED: { label: "موافق", color: "green" }, WITHDRAWN: { label: "مسحوبة", color: "red" }, DENIED: { label: "غير موافق", color: "red" } };
const AUDIENCE: Record<string, string> = { ALL: "الجميع", GUARDIANS: "أولياء الأمور", STAFF: "الموظفون" };

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <ModuleShell nav={govNav("compliance")} tabs={COMPLIANCE_TABS} wide actions={actions}>
      {children}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------

export function ComplianceOverviewPage() {
  const q = trpc.compliance.overview.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const n = (v: number) => formatNumber(v, prefs.digits);
  if (q.error) return <Shell><EmptyState illustration="lock" title="لا يمكن عرض الامتثال" description={q.error.message} /></Shell>;
  const d = q.data;
  const pct = d?.policy && d.policy.eligible ? Math.round((d.policy.accepted / d.policy.eligible) * 100) : 0;
  return (
    <Shell>
      {!d ? <SkeletonLines lines={6} /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/compliance/policies" className="rounded-lg bg-card p-4 shadow-card hover:shadow-card-hover">
              <p className="text-[13px] text-fg-3">قبول سياسة الخصوصية</p>
              <p className="mt-2 text-[26px] font-bold">{d.policy ? `${n(pct)}٪` : "—"}</p>
              <p className="mt-1 text-[12px] text-fg-3">{d.policy ? `الإصدار ${n(d.policy.version)} · ${n(d.policy.accepted)} من ${n(d.policy.eligible)}` : "لا سياسة منشورة بعد"}</p>
              {d.policy ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} /></div> : null}
            </Link>
            <Link href="/compliance/requests" className="rounded-lg bg-card p-4 shadow-card hover:shadow-card-hover">
              <p className="text-[13px] text-fg-3">طلبات بيانات مفتوحة</p>
              <p className="mt-2 text-[26px] font-bold">{n(d.openRequests)}</p>
              <p className={cn("mt-1 text-[12px]", d.overdueRequests ? "text-danger-700" : "text-fg-3")}>{d.overdueRequests ? `${n(d.overdueRequests)} تجاوزت مهلة ${n(d.dataRequestDays)} يوماً` : `مهلة الرد ${n(d.dataRequestDays)} يوماً`}</p>
            </Link>
            <Link href="/compliance/consents" className="rounded-lg bg-card p-4 shadow-card hover:shadow-card-hover">
              <p className="text-[13px] text-fg-3">أنواع الموافقات المفعّلة</p>
              <p className="mt-2 text-[26px] font-bold">{n(d.consentTypes)}</p>
              <p className="mt-1 text-[12px] text-fg-3">تصوير، رحلات، علاج إسعافي…</p>
            </Link>
            <Link href="/compliance/retention" className="rounded-lg bg-card p-4 shadow-card hover:shadow-card-hover">
              <p className="text-[13px] text-fg-3">مدد احتفاظ مفعّلة</p>
              <p className="mt-2 text-[26px] font-bold">{n(d.retentionEnabled)} / {n(d.retentionTotal)}</p>
              <p className="mt-1 text-[12px] text-fg-3">تُنفَّذ يومياً مع النسخة الاحتياطية</p>
            </Link>
          </div>
          <section className="mt-6 rounded-lg bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><ShieldCheck className="size-4 text-fg-3" aria-hidden />مسؤول حماية البيانات</h2>
            <p className="mt-1 text-[14px]">{d.dpo.name || "لم يُحدَّد بعد"}{d.dpo.email ? <span dir="ltr" className="ms-2 text-fg-3">{d.dpo.email}</span> : null}</p>
            <p className="mt-2 text-[12px] text-fg-3">يظهر في صفحة «خصوصيتي» لأولياء الأمور والموظفين. {d.policy?.publishedAt ? `آخر نشر للسياسة ${fmtDate(d.policy.publishedAt)}.` : ""}</p>
          </section>
        </>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------

type Policy = RouterOutputs["compliance"]["policies"][number];

export function PoliciesPage() {
  const q = trpc.compliance.policies.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [viewing, setViewing] = useState<Policy | null>(null);
  const publish = trpc.compliance.publishPolicy.useMutation({ onSuccess: () => (toast.success("نُشرت السياسة وأُشعر المعنيون"), void utils.compliance.invalidate()), onError: (e) => toast.error(e.message) });
  const n = (v: number) => formatNumber(v, prefs.digits);
  return (
    <Shell actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>إصدار جديد</Button>}>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض السياسات" description={q.error.message} /> : null}
      {q.data?.length ? (
        <FinTable head={<tr><th>الإصدار</th><th>العنوان</th><th>الجمهور</th><th>الحالة</th><th className="text-end">القبول</th><th>النشر</th><th /></tr>}>
          {q.data.map((p) => (
            <tr key={p.id}>
              <td className="tabular">{n(p.version)}</td>
              <td><button type="button" className="font-medium hover:underline" onClick={() => setViewing(p)}>{p.title}</button>{p.changes ? <p className="text-[12px] text-fg-3">{p.changes}</p> : null}</td>
              <td>{AUDIENCE[p.audience]}</td>
              <td><Tag color={p.status === "PUBLISHED" ? "green" : p.status === "DRAFT" ? "gray" : "slate"}>{p.status === "PUBLISHED" ? "سارية" : p.status === "DRAFT" ? "مسودة" : "مؤرشفة"}</Tag></td>
              <td className={num}>{p.status === "DRAFT" ? "—" : `${n(p.accepted)} / ${n(p.eligible)}`}</td>
              <td className="whitespace-nowrap text-fg-3">{p.publishedAt ? fmtDate(p.publishedAt) : "—"}</td>
              <td className="text-end">{p.status === "DRAFT" ? <span className="flex justify-end gap-1"><Button size="xs" variant="ghost" onClick={() => setEditing(p)}>تعديل</Button><Button size="xs" variant="primary" icon={<Send className="size-3" />} loading={publish.isPending} onClick={() => publish.mutate({ id: p.id })}>نشر</Button></span> : null}</td>
            </tr>
          ))}
        </FinTable>
      ) : q.data ? (
        <EmptyState illustration="blank" title="لا سياسة خصوصية بعد" description="اكتب سياسة الخصوصية وانشرها ليطّلع عليها أولياء الأمور والموظفون ويوافقوا عليها." action={<Button variant="primary" onClick={() => setEditing("new")}>كتابة السياسة</Button>} />
      ) : <SkeletonLines lines={5} />}
      <p className="mt-4 text-[12px] text-fg-3">نص الإصدار المنشور مقفل بقاعدة البيانات؛ أي تعديل يكون بإصدار جديد يُطلب قبوله من جديد، وتبقى موافقات الإصدارات السابقة سجلاً.</p>
      {editing ? <PolicyDialog policy={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {viewing ? (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent title={`${viewing.title} — الإصدار ${viewing.version}`} width={720}>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-5 pb-5 text-[14px] leading-7 thin-scroll">{viewing.body}</div>
          </DialogContent>
        </Dialog>
      ) : null}
    </Shell>
  );
}

function PolicyDialog({ policy, onClose }: { policy: Policy | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ title: policy?.title ?? "سياسة الخصوصية وحماية البيانات الشخصية", body: policy?.body ?? "", changes: policy?.changes ?? "", audience: (policy?.audience ?? "ALL") as "ALL" | "GUARDIANS" | "STAFF", requireAcceptance: policy?.requireAcceptance ?? true });
  const save = trpc.compliance.savePolicy.useMutation({ onSuccess: () => (toast.success("حُفظت المسودة"), void utils.compliance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={policy ? `تعديل مسودة الإصدار ${policy.version}` : "إصدار جديد لسياسة الخصوصية"} width={760}>
        <div className="space-y-3 px-5 pb-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="العنوان"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <Field label="الجمهور"><Segmented value={v.audience} onChange={(audience) => setV({ ...v, audience: audience as typeof v.audience })} options={Object.entries(AUDIENCE).map(([value, label]) => ({ value, label }))} /></Field>
          </div>
          <Field label="ما الذي تغيّر؟" hint="يظهر في الإشعار وأعلى السياسة"><Input value={v.changes} onChange={(e) => setV({ ...v, changes: e.target.value })} /></Field>
          <Field label="نص السياسة"><Textarea rows={14} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className="leading-7" /></Field>
          <SwitchRow checked={v.requireAcceptance} onChange={(requireAcceptance) => setV({ ...v, requireAcceptance })} label="يلزم القبول عند الدخول" hint="تظهر نافذة القبول لكل من يشملهم حتى يوافقوا" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={v.title.trim().length < 3 || v.body.trim().length < 50} onClick={() => save.mutate({ id: policy?.id ?? null, ...v })}>حفظ المسودة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------

type Matrix = RouterOutputs["compliance"]["matrix"];

export function ConsentsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const gradeId = params.get("grade");
  const typeId = params.get("type");
  const status = params.get("status") as "GRANTED" | "MISSING" | "WITHDRAWN" | null;
  const q = trpc.compliance.matrix.useQuery({ gradeId, typeId, status }, { placeholderData: (p) => p });
  const types = trpc.compliance.consentTypes.useQuery();
  const [typeDialog, setTypeDialog] = useState<RouterOutputs["compliance"]["consentTypes"][number] | "new" | null>(null);
  const [cell, setCell] = useState<{ student: Matrix["rows"][number]; type: Matrix["types"][number] } | null>(null);
  const set = (k: string, v: string | null) => {
    const s = new URLSearchParams(params.toString());
    if (v) s.set(k, v);
    else s.delete(k);
    router.replace(`/compliance/consents?${s.toString()}`);
  };
  const n = (v: number) => formatNumber(v, prefs.digits);
  return (
    <Shell actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setTypeDialog("new")}>نوع موافقة</Button>}>
      {types.data?.length ? (
        <section className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {types.data.map((t) => {
            const s = q.data?.summary.find((x) => x.id === t.id);
            return (
              <button key={t.id} type="button" onClick={() => setTypeDialog(t)} className="rounded-lg bg-card p-3 text-start shadow-card hover:shadow-card-hover">
                <span className="flex items-center justify-between gap-2"><span className="text-[14px] font-medium">{t.name}</span><span className="flex gap-1">{t.isRequired ? <Tag color="gold">إلزامية</Tag> : null}{!t.isActive ? <Tag color="gray">متوقفة</Tag> : null}<Tag color="slate">{t.subject === "STUDENT" ? "للطلاب" : "للموظفين"}</Tag></span></span>
                {s ? <span className="mt-1 block text-[12px] text-fg-3">موافق {n(s.granted)} · غير موافق {n(s.withdrawn)} · لم يُحدَّد {n(s.missing)}</span> : null}
              </button>
            );
          })}
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-44" value={gradeId ?? "ALL"} onChange={(v) => set("grade", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "كل الصفوف" }, ...(q.data?.grades ?? []).map((g) => ({ value: g.id, label: g.name }))]} />
        <Select size="sm" className="w-52" value={typeId ?? "ALL"} onChange={(v) => set("type", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "كل أنواع الموافقة" }, ...(q.data?.types ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
        {typeId ? <Segmented value={status ?? "ALL"} onChange={(v) => set("status", v === "ALL" ? null : v)} options={[{ value: "ALL", label: "الكل" }, { value: "GRANTED", label: "موافق" }, { value: "WITHDRAWN", label: "غير موافق" }, { value: "MISSING", label: "لم يُحدَّد" }]} /> : null}
        {q.data ? <span className="text-[12px] text-fg-3">{n(q.data.total)} طالباً</span> : null}
      </div>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الموافقات" description={q.error.message} /> : null}
      {q.data ? (
        q.data.types.length ? (
          <FinTable dense head={<tr><th>الطالب</th><th>الصف</th>{q.data.types.map((t) => <th key={t.id} className="text-center">{t.name}</th>)}</tr>}>
            {q.data.rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td className="text-fg-3">{r.grade}</td>
                {q.data!.types.map((t) => {
                  const st = r.consents[t.id];
                  return (
                    <td key={t.id} className="text-center">
                      <button type="button" onClick={() => setCell({ student: r, type: t })} className="rounded px-1 hover:bg-hover" aria-label={`${t.name} — ${r.name}: ${st ? CONSENT_LABEL[st]!.label : "لم يُحدَّد"}`}>
                        {st ? <Tag color={CONSENT_LABEL[st]!.color}>{CONSENT_LABEL[st]!.label}</Tag> : <span className="text-[12px] text-fg-4">لم يُحدَّد</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </FinTable>
        ) : <EmptyState illustration="table" title="لا أنواع موافقة للطلاب" description="أضف نوع موافقة (مثل تصوير الطالب ونشر صوره) ليظهر لأولياء الأمور في صفحة «خصوصيتي»." action={<Button variant="primary" onClick={() => setTypeDialog("new")}>نوع موافقة</Button>} />
      ) : <SkeletonLines lines={8} />}
      {typeDialog ? <ConsentTypeDialog type={typeDialog === "new" ? null : typeDialog} onClose={() => setTypeDialog(null)} /> : null}
      {cell ? <PaperConsentDialog cell={cell} onClose={() => setCell(null)} /> : null}
    </Shell>
  );
}

function ConsentTypeDialog({ type, onClose }: { type: RouterOutputs["compliance"]["consentTypes"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: type?.name ?? "", description: type?.description ?? "", subject: (type?.subject ?? "STUDENT") as "STUDENT" | "STAFF", isRequired: type?.isRequired ?? false, isActive: type?.isActive ?? true });
  const save = trpc.compliance.saveConsentType.useMutation({ onSuccess: () => (toast.success("حُفظ نوع الموافقة"), void utils.compliance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={type ? "تعديل نوع موافقة" : "نوع موافقة جديد"} width={560}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="مثال: تصوير الطالب ونشر صوره في حسابات المدرسة" /></Field>
          <Field label="النص الذي يراه صاحب الموافقة"><Textarea rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="تُطلب من"><Segmented value={v.subject} onChange={(subject) => setV({ ...v, subject: subject as "STUDENT" | "STAFF" })} options={[{ value: "STUDENT", label: "ولي الأمر لكل ابن" }, { value: "STAFF", label: "الموظف عن نفسه" }]} /></Field>
          <SwitchRow checked={v.isRequired} onChange={(isRequired) => setV({ ...v, isRequired })} label="إلزامية" hint="تُبرز لصاحبها حتى يحدد موقفه" />
          <SwitchRow checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} label="مفعّلة" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ id: type?.id ?? null, ...v })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaperConsentDialog({ cell, onClose }: { cell: { student: Matrix["rows"][number]; type: Matrix["types"][number] }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"GRANTED" | "DENIED" | "WITHDRAWN">("GRANTED");
  const [note, setNote] = useState("");
  const save = trpc.compliance.setConsent.useMutation({ onSuccess: () => (toast.success("سُجّلت الموافقة"), void utils.compliance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تسجيل موافقة ورقية" description={`${cell.type.name} — ${cell.student.name}. يُسجَّل باسمك كإدخال نيابة عن ولي الأمر من نموذج ورقي، ويبقى السجل السابق.`} width={520}>
        <div className="space-y-3 px-5 pb-4">
          <Segmented value={status} onChange={(s) => setStatus(s as typeof status)} options={[{ value: "GRANTED", label: "موافق" }, { value: "DENIED", label: "غير موافق" }, { value: "WITHDRAWN", label: "سحب الموافقة" }]} />
          <Field label="ملاحظة" hint="مثال: رقم النموذج الورقي وتاريخه"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ consentTypeId: cell.type.id, studentId: cell.student.id, status, method: "PAPER", note: note || null })}>تسجيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------

export function RetentionPage() {
  const q = trpc.compliance.retention.useQuery();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [confirm, setConfirm] = useState<{ key: string; label: string; eligible: number } | null>(null);
  const save = trpc.compliance.saveRetention.useMutation({ onSuccess: () => (toast.success("حُفظت المدة"), void utils.compliance.retention.invalidate()), onError: (e) => toast.error(e.message) });
  const run = trpc.compliance.runRetention.useMutation({ onSuccess: (r) => (toast.success(r.dryRun ? `المعاينة: ${r.affected} سجلاً مؤهلاً` : `نُفِّذ على ${r.affected} سجلاً`), void utils.compliance.retention.invalidate(), setConfirm(null)), onError: (e) => toast.error(e.message) });
  const n = (v: number) => formatNumber(v, prefs.digits);
  const label = (k: string) => q.data?.categories.find((c) => c.key === k)?.label ?? k;
  return (
    <Shell>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض مدد الاحتفاظ" description={q.error.message} /> : null}
      {q.data ? (
        <>
          <FinTable head={<tr><th>فئة البيانات</th><th>الإجراء</th><th className="text-end">الاحتفاظ (أيام)</th><th>تلقائي</th><th className="text-end">مؤهل الآن</th><th>آخر تنفيذ</th><th /></tr>}>
            {q.data.categories.map((c) => (
              <tr key={c.key}>
                <td><span className="font-medium">{c.label}</span><p className="text-[12px] text-fg-3">{c.description}</p></td>
                <td><Tag color={c.action === "DELETE" ? "red" : "gold"}>{c.action === "DELETE" ? "حذف" : "إخفاء الهوية"}</Tag></td>
                <td className="text-end"><Input type="number" min={30} className="ms-auto h-7 w-24 text-end" defaultValue={c.retainDays} onBlur={(e) => Number(e.target.value) !== c.retainDays && save.mutate({ category: c.key, retainDays: Math.max(30, Number(e.target.value) || c.retainDays), isEnabled: c.isEnabled })} aria-label={`مدة الاحتفاظ — ${c.label}`} /></td>
                <td><SwitchRow size="sm" checked={c.isEnabled} onChange={(isEnabled) => save.mutate({ category: c.key, retainDays: c.retainDays, isEnabled })} label={c.isEnabled ? "مفعّل" : "متوقف"} /></td>
                <td className={num}>{n(c.eligible)}</td>
                <td className="whitespace-nowrap text-[12px] text-fg-3">{c.lastRunAt ? `${fmtDate(c.lastRunAt)} · ${n(c.lastAffected)}` : "—"}</td>
                <td className="text-end"><span className="flex justify-end gap-1"><Button size="xs" variant="ghost" icon={<Search className="size-3" />} onClick={() => run.mutate({ category: c.key, dryRun: true })}>معاينة</Button><Button size="xs" variant="ghost" icon={<Play className="size-3" />} disabled={!c.eligible} onClick={() => setConfirm({ key: c.key, label: c.label, eligible: c.eligible })}>تنفيذ</Button></span></td>
              </tr>
            ))}
          </FinTable>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg bg-card p-4 shadow-card">
              <h3 className="text-[14px] font-semibold">سجلات محمية لا تخضع للحذف</h3>
              <ul className="mt-2 space-y-1.5 text-[13px]">{q.data.protected.map((p) => <li key={p.label}><b>{p.label}</b> <span className="text-fg-3">— {p.reason}</span></li>)}</ul>
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <h3 className="text-[14px] font-semibold">سجل التنفيذ</h3>
              {q.data.runs.length ? (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[12px] thin-scroll">{q.data.runs.map((r) => <li key={r.id} className="flex justify-between gap-2"><span>{label(r.category)} · {r.dryRun ? "معاينة" : "تنفيذ"}</span><span className="text-fg-3">{n(r.affected)} · {fmtDate(r.createdAt)}</span></li>)}</ul>
              ) : <p className="mt-2 text-[12px] text-fg-3">لم يُنفَّذ بعد.</p>}
            </div>
          </section>
        </>
      ) : <SkeletonLines lines={8} />}
      {confirm ? (
        <Dialog open onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent title={`تنفيذ الاحتفاظ: ${confirm.label}`} description={`سيُطبَّق على ${confirm.eligible} سجلاً ولا يمكن التراجع. تأكد أن نسخة احتياطية حديثة موجودة.`} width={460}>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>تراجع</Button>
              <Button variant="danger" loading={run.isPending} onClick={() => run.mutate({ category: confirm.key, dryRun: false })}>تنفيذ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Shell>
  );
}

// ---------------------------------------------------------------------

type Req = RouterOutputs["compliance"]["requests"]["rows"][number];

export function RequestsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get("status");
  const q = trpc.compliance.requests.useQuery({ status });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [open, setOpen] = useState<Req | null>(null);
  return (
    <Shell>
      <Segmented className="mb-4" value={status ?? "ALL"} onChange={(v) => router.replace(v === "ALL" ? "/compliance/requests" : `/compliance/requests?status=${v}`)} options={[{ value: "ALL", label: "الكل" }, ...Object.entries(REQUEST_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الطلبات" description={q.error.message} /> : null}
      {q.data?.rows.length ? (
        <FinTable head={<tr><th>الرقم</th><th>النوع</th><th>صاحب البيانات</th><th>مقدّم الطلب</th><th>المهلة</th><th>المسؤول</th><th>الحالة</th></tr>}>
          {q.data.rows.map((r) => (
            <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
              <td className="tabular">{formatNumber(r.number, prefs.digits)}</td>
              <td>{REQUEST_KIND[r.kind]}</td>
              <td className="font-medium">{r.subjectName}</td>
              <td className="text-fg-2">{r.requesterName}</td>
              <td className={cn("whitespace-nowrap", r.overdue && "font-medium text-danger-700")}>{fmtDate(r.dueDate)}{r.overdue ? " · متأخر" : ""}</td>
              <td>{r.assignee ?? "—"}</td>
              <td><Tag color={REQUEST_STATUS[r.status]?.color ?? "gray"}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Tag></td>
            </tr>
          ))}
        </FinTable>
      ) : q.data ? <EmptyState compact illustration="inbox" title="لا طلبات بهذه الحالة" description="يقدّم أولياء الأمور والموظفون طلباتهم من صفحة «خصوصيتي»، وتصلك إشعاراتها هنا بمهلة الرد." /> : <SkeletonLines lines={6} />}
      {open ? <RequestDialog r={open} onClose={() => setOpen(null)} /> : null}
    </Shell>
  );
}

function RequestDialog({ r, onClose }: { r: Req; onClose: () => void }) {
  const utils = trpc.useUtils();
  const fmtDate = useFmtDate();
  const [resolution, setResolution] = useState(r.resolution ?? "");
  const done = () => void utils.compliance.requests.invalidate();
  const update = trpc.compliance.updateRequest.useMutation({ onSuccess: () => (toast.success("حُدّث الطلب"), done(), onClose()), onError: (e) => toast.error(e.message) });
  const gen = trpc.compliance.generateExport.useMutation({ onSuccess: (x) => (toast.success(`أُنشئت نسخة البيانات (${x.sizeKb} ك.ب)`), done()), onError: (e) => toast.error(e.message) });
  const closed = r.status === "COMPLETED" || r.status === "REJECTED";
  const needsExport = r.kind === "ACCESS" || r.kind === "PORTABILITY";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`طلب رقم ${r.number}: ${REQUEST_KIND[r.kind]}`} description={`${r.subjectName} — المهلة ${fmtDate(r.dueDate)}`} width={640}>
        <div className="space-y-3 px-5 pb-4 text-[14px]">
          <p className="whitespace-pre-wrap rounded-md bg-hover p-3">{r.description}</p>
          <p className="text-[12px] text-fg-3">مقدّم الطلب: {r.requesterName}{r.requesterContact ? ` · ${r.requesterContact}` : ""} · استُلم {fmtDate(r.createdAt)}</p>
          {needsExport ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-line p-3">
              <FileCheck2 className="size-4 text-fg-3" aria-hidden />
              <span className="flex-1 text-[13px]">{r.exportFileId ? "أُنشئت نسخة البيانات (JSON مضغوط يشمل كل ما يخص صاحب البيانات)" : "أنشئ نسخة من كل البيانات المحفوظة عن صاحب الطلب"}</span>
              {!closed ? <Button size="xs" loading={gen.isPending} onClick={() => gen.mutate({ id: r.id })}>{r.exportFileId ? "إعادة الإنشاء" : "إنشاء النسخة"}</Button> : null}
              {r.exportFileId ? <a href={`/api/compliance/requests/${r.id}`} className="inline-flex"><Button size="xs" variant="ghost" icon={<Download className="size-3" />}>تنزيل</Button></a> : null}
            </div>
          ) : null}
          {r.kind === "DELETION" ? <p className="rounded-md bg-warning-50 p-3 text-[13px] text-warning-700">الحذف يشمل ما لا يلزم الاحتفاظ به نظاماً فقط؛ السجلات المالية والأكاديمية المعتمدة وسجل التدقيق محمية. وضّح في النتيجة ما حُذف وما بقي وسببه.</p> : null}
          <Field label="النتيجة / الرد على مقدّم الطلب"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={closed} /></Field>
        </div>
        {!closed ? (
          <DialogFooter>
            {r.status === "RECEIVED" ? <Button variant="ghost" loading={update.isPending} onClick={() => update.mutate({ id: r.id, status: "VERIFYING", resolution })}>بدء التحقق من الهوية</Button> : null}
            {r.status !== "IN_PROGRESS" ? <Button variant="ghost" loading={update.isPending} onClick={() => update.mutate({ id: r.id, status: "IN_PROGRESS", resolution })}>قيد المعالجة</Button> : null}
            <Button variant="ghost" loading={update.isPending} onClick={() => update.mutate({ id: r.id, status: "REJECTED", resolution })}>رفض</Button>
            <Button variant="primary" loading={update.isPending} onClick={() => update.mutate({ id: r.id, status: "COMPLETED", resolution })}>إكمال وإبلاغ مقدّم الطلب</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------

export function ComplianceSettingsPage() {
  const prefs = usePrefs();
  return (
    <Shell>
      <ModuleSettingsForm<{ dataRequestDays: number; dpoName: string; dpoEmail: string; policyReminderDays: number }> settingsKey="compliance" title="حماية البيانات" description="بيانات مسؤول حماية البيانات ومهلة الرد على الطلبات">
        {(v, set, canEdit) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم مسؤول حماية البيانات"><Input value={v.dpoName} disabled={!canEdit} onChange={(e) => set({ dpoName: e.target.value })} /></Field>
            <Field label="بريده للتواصل"><Input dir="ltr" value={v.dpoEmail} disabled={!canEdit} onChange={(e) => set({ dpoEmail: e.target.value })} /></Field>
            <Field label="مهلة الرد على طلبات البيانات (أيام)" hint={`الافتراضي ${formatNumber(30, prefs.digits)} يوماً؛ اضبطها وفق نظام بلدك`}><Input type="number" min={5} max={90} value={v.dataRequestDays} disabled={!canEdit} onChange={(e) => set({ dataRequestDays: Number(e.target.value) || 30 })} /></Field>
            <Field label="تذكير من لم يقبل السياسة بعد (أيام)"><Input type="number" min={1} max={60} value={v.policyReminderDays} disabled={!canEdit} onChange={(e) => set({ policyReminderDays: Number(e.target.value) || 7 })} /></Field>
          </div>
        )}
      </ModuleSettingsForm>
    </Shell>
  );
}
