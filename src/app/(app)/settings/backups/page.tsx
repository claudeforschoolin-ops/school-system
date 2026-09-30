"use client";
import { CheckCircle2, DatabaseBackup, Download, KeyRound, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { formatBytes } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { FinTable, num } from "@/components/finance/common";
import { ModuleSettingsForm } from "@/components/ops/common";
import { usePrefs } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";

type Run = RouterOutputs["backups"]["list"]["runs"][number];
const STATUS: Record<string, { label: string; color: "green" | "red" | "gold" }> = { SUCCESS: { label: "ناجحة", color: "green" }, FAILED: { label: "فشلت", color: "red" }, RUNNING: { label: "قيد الإنشاء", color: "gold" } };

export default function BackupsSettingsPage() {
  const q = trpc.backups.list.useQuery(undefined, { refetchInterval: (query) => (query.state.data?.runs.some((r) => r.status === "RUNNING") ? 3000 : false) });
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const [restoring, setRestoring] = useState<Run | null>(null);
  const n = (v: number) => formatNumber(v, prefs.digits);
  const fmt = (d: Date | string) => new Date(d).toLocaleString(prefs.digits === "arab" ? "ar-SA-u-nu-arab-ca-gregory" : "ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short" });
  const create = trpc.backups.create.useMutation({ onSuccess: (r) => (toast.success(`اكتملت النسخة #${r.number}`), void utils.backups.invalidate()), onError: (e) => (toast.error(e.message), void utils.backups.invalidate()) });
  const verify = trpc.backups.verify.useMutation({ onSuccess: (r) => (toast.success(`النسخة سليمة: ${n(r.rows)} سجلاً في ${n(r.tables)} جدولاً`), void utils.backups.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const last = d?.runs.find((r) => r.status === "SUCCESS");
  return (
    <SettingsShell
      title="النسخ الاحتياطي"
      description="نسخة يومية مشفّرة تلقائياً مع سجل كامل، والتحقق من سلامتها، واسترجاعها كمدرسة مستقلة، وتنزيل البيانات كاملة."
      actions={d?.canCreate ? <Button variant="primary" icon={<DatabaseBackup className="size-4" />} loading={create.isPending} disabled={!d.keyOk} onClick={() => create.mutate()}>نسخة احتياطية الآن</Button> : null}
    >
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض النسخ الاحتياطية" description={q.error.message} /> : null}
      {!d ? (q.error ? null : <SkeletonLines lines={8} />) : (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-[13px] text-fg-3">آخر نسخة ناجحة</p>
              <p className="mt-1 text-[16px] font-semibold">{last ? fmt(last.createdAt) : "لا توجد بعد"}</p>
              {last ? <p className="text-[12px] text-fg-3">#{n(last.number)} · {formatBytes(last.sizeBytes ?? 0)} · {n(last.rows)} سجل</p> : null}
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-[13px] text-fg-3">الجدولة</p>
              <p className="mt-1 text-[16px] font-semibold">{d.settings.enabled ? `يومياً الساعة ${n(d.settings.hour)}:٠٠` : "متوقفة"}</p>
              <p className="text-[12px] text-fg-3">الاحتفاظ {n(d.settings.retentionDays)} يوماً ثم تُحذف تلقائياً</p>
            </div>
            <div className={cn("rounded-lg p-4 shadow-card", d.keyOk ? "bg-card" : "bg-danger-50")}>
              <p className="flex items-center gap-1.5 text-[13px] text-fg-3"><KeyRound className="size-3.5" aria-hidden />التشفير</p>
              <p className={cn("mt-1 text-[16px] font-semibold", !d.keyOk && "text-danger-700")}>{d.keyOk ? "AES-256-GCM" : "مفتاح التشفير غير مضبوط"}</p>
              <p className="text-[12px] text-fg-3">{d.keyOk ? (d.dedicatedKey ? "مفتاح مخصص للنسخ (BACKUP_ENCRYPTION_KEY)" : "مفتاح مشتق من مفتاح تشفير الحقول") : "اضبط BACKUP_ENCRYPTION_KEY على الخادم"}</p>
            </div>
          </div>

          <SettingsCard title="سجل النسخ" description="كل نسخة مضغوطة ومشفّرة ومعها بصمة SHA-256 للمحتوى. «تحقق» يفك التشفير ويطابق البصمة وعدد السجلات.">
            {d.runs.length ? (
              <FinTable head={<tr><th>#</th><th>النوع</th><th>الحالة</th><th>الوقت</th><th className="text-end">الحجم</th><th className="text-end">السجلات</th><th className="text-end">المدة</th><th>التحقق</th><th /></tr>}>
                {d.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular">{n(r.number)}</td>
                    <td>{r.kind === "AUTO" ? "تلقائية" : "يدوية"}<span className="block text-[11px] text-fg-3">{r.by ?? ""}</span></td>
                    <td><Tag color={STATUS[r.status]?.color ?? "gray"}>{STATUS[r.status]?.label ?? r.status}</Tag>{r.error ? <span className="block max-w-[220px] truncate text-[11px] text-danger-700" title={r.error}>{r.error}</span> : null}</td>
                    <td className="whitespace-nowrap text-fg-3">{fmt(r.createdAt)}{r.expiresAt ? <span className="block text-[11px]">تُحذف {new Date(r.expiresAt).toLocaleDateString(prefs.digits === "arab" ? "ar-SA-u-nu-arab-ca-gregory" : "ar-SA-u-nu-latn-ca-gregory")}</span> : null}</td>
                    <td className={num}>{r.sizeBytes ? formatBytes(r.sizeBytes) : "—"}</td>
                    <td className={num}>{n(r.rows)}<span className="block text-[11px] text-fg-3">{n(r.tables)} جدول</span></td>
                    <td className={num}>{r.durationMs ? `${n(Math.round(r.durationMs / 100) / 10)} ث` : "—"}</td>
                    <td>{r.verifiedAt ? <span className="flex items-center gap-1 text-[12px] text-success-800"><CheckCircle2 className="size-3.5" aria-hidden />{fmt(r.verifiedAt)}</span> : <span className="text-[12px] text-fg-4">لم يُتحقق</span>}</td>
                    <td className="text-end">
                      {r.status === "SUCCESS" ? (
                        <span className="flex justify-end gap-1">
                          <Button size="xs" variant="ghost" icon={<ShieldCheck className="size-3" />} loading={verify.isPending && verify.variables?.id === r.id} onClick={() => verify.mutate({ id: r.id })}>تحقق</Button>
                          {d.canExport ? <a href={`/api/backups/${r.id}`} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] text-fg-2 hover:bg-hover" title="يتطلب التحقق بخطوتين، ويُسجَّل في التدقيق"><Download className="size-3" aria-hidden />تنزيل</a> : null}
                          {d.canRestore ? <Button size="xs" variant="ghost" icon={<RotateCcw className="size-3" />} onClick={() => setRestoring(r)}>استرجاع</Button> : null}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </FinTable>
            ) : <p className="text-[14px] text-fg-3">لا نسخ بعد. أول نسخة تلقائية تُنشأ في الموعد المحدد، أو أنشئ واحدة الآن.</p>}
          </SettingsCard>

          {d.restores.length ? (
            <SettingsCard title="عمليات الاسترجاع" description="الاسترجاع يُنشئ مدرسة مستقلة بمعرّفات جديدة، ولا يمس بيانات هذه المدرسة.">
              <FinTable head={<tr><th>الوقت</th><th>من النسخة</th><th>المدرسة الجديدة</th><th className="text-end">السجلات</th><th>الحالة</th><th>بواسطة</th></tr>}>
                {d.restores.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-fg-3">{fmt(r.createdAt)}</td>
                    <td className="tabular">#{n(d.runs.find((x) => x.id === r.backupId)?.number ?? 0)}</td>
                    <td dir="ltr" className="text-end font-mono text-[12px]">{r.targetSlug}</td>
                    <td className={num}>{n(r.rows)}</td>
                    <td><Tag color={r.status === "SUCCESS" ? "green" : "red"}>{r.status === "SUCCESS" ? "ناجح" : "فشل"}</Tag>{r.error ? <span className="block text-[11px] text-danger-700">{r.error}</span> : null}</td>
                    <td>{r.by ?? "—"}</td>
                  </tr>
                ))}
              </FinTable>
            </SettingsCard>
          ) : null}

          <ModuleSettingsForm<{ enabled: boolean; hour: number; retentionDays: number }> settingsKey="backups" title="الجدولة والاحتفاظ" description="تُنفَّذ عبر المهمة الدورية كل ساعة (/api/cron/platform)، وتُحذف النسخ الأقدم من مدة الاحتفاظ.">
            {(v, set, canEdit) => (
              <div className="grid gap-4 sm:grid-cols-3">
                <SwitchRow checked={v.enabled} disabled={!canEdit} onChange={(enabled) => set({ enabled })} label="نسخ يومي تلقائي" />
                <Field label="ساعة النسخ (بتوقيت المدرسة)"><Select value={String(v.hour)} disabled={!canEdit} onChange={(h) => set({ hour: Number(h) })} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${formatNumber(h, prefs.digits)}:٠٠` }))} /></Field>
                <Field label="مدة الاحتفاظ (يوم)" hint="من ٧ إلى ٣٦٥"><Input type="number" min={7} max={365} disabled={!canEdit} value={v.retentionDays} onChange={(e) => set({ retentionDays: Math.max(7, Math.min(365, Number(e.target.value) || 30)) })} /></Field>
              </div>
            )}
          </ModuleSettingsForm>
          <p className="flex items-start gap-2 text-[12px] leading-6 text-fg-3"><TriangleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />تُحفظ النسخ في مساحة التخزين المحلية للخادم. للتعافي من الكوارث انسخ مجلد التخزين دورياً إلى موقع خارجي (مع إبقاء مفتاح التشفير منفصلاً عنه).</p>
        </>
      )}
      {restoring ? <RestoreDialog run={restoring} onClose={() => setRestoring(null)} /> : null}
    </SettingsShell>
  );
}

function RestoreDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const [v, setV] = useState({ name: "", slug: "", confirm: "" });
  const restore = trpc.backups.restore.useMutation({ onSuccess: (r) => (toast.success(`استُرجعت ${formatNumber(r.rows, prefs.digits)} سجلاً إلى المدرسة «${r.slug}»`), void utils.backups.invalidate(), onClose()), onError: (e) => (toast.error(e.message), void utils.backups.invalidate()) });
  const valid = /^[a-z0-9][a-z0-9-]{2,39}$/.test(v.slug) && v.name.trim().length >= 3 && v.confirm === v.slug;
  return (
    <Dialog open onOpenChange={(o) => !o && !restore.isPending && onClose()}>
      <DialogContent title={`استرجاع النسخة #${formatNumber(run.number, prefs.digits)}`} description="تُنشأ مدرسة جديدة مستقلة بكل بيانات النسخة (بمعرّفات جديدة وملفاتها)، ولا تتأثر المدرسة الحالية. يمكنك بعدها الدخول إليها بحسابات النسخة نفسها." width={560}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="اسم المدرسة المسترجعة"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="نسخة مسترجعة — سبتمبر" /></Field>
          <Field label="المعرّف (إنجليزي)" hint="أحرف صغيرة وأرقام وشرطات"><Input dir="ltr" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} placeholder="restore-sep" /></Field>
          <Field label="للتأكيد اكتب المعرّف مرة أخرى"><Input dir="ltr" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value.toLowerCase() })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={restore.isPending} onClick={onClose}>إلغاء</Button>
          <Button variant="primary" icon={<RotateCcw className="size-3.5" />} loading={restore.isPending} disabled={!valid} onClick={() => restore.mutate({ id: run.id, slug: v.slug, name: v.name })}>استرجاع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
