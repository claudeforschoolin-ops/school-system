"use client";
/**
 * قواعد الأتمتة: قائمة القواعد وقوالب جاهزة، ومحرر القاعدة (البيانات والشرط والتكرار والإجراءات)
 * مع معاينة حيّة لما يطابق الآن قبل التفعيل، و«شغّل الآن» وسجل التشغيل.
 */
import { Play, Plus, Save, Trash2, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import type { FieldDef, Filter } from "@/lib/analytics/query";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { FinTable, useFmtDate } from "@/components/finance/common";
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
import { FilterEditor } from "@/components/analytics/common";
import { govNav, WORKFLOW_TABS } from "./workflows";

type Action = RouterOutputs["automation"]["list"][number]["actions"][number];
const FREQ = { HOURLY: "كل ساعة", DAILY: "يومياً", WEEKLY: "أسبوعياً" } as const;
const ACTION_LABEL: Record<Action["type"], string> = { NOTIFY_ROLE: "إشعار دور", NOTIFY_USERS: "إشعار مستخدمين", NOTIFY_ASSIGNEE: "إشعار المسؤول عن السجل", NOTIFY_GUARDIANS: "رسالة لأولياء أمور الطالب", EMAIL: "بريد ملخص" };

export function AutomationsPage() {
  const q = trpc.automation.list.useQuery();
  const templates = trpc.automation.templates.useQuery();
  const { can } = useApp();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  return (
    <ModuleShell nav={govNav("workflows")} tabs={WORKFLOW_TABS} wide actions={can("workflows", "update") ? <Link href="/workflows/automations/new"><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />}>قاعدة جديدة</Button></Link> : undefined}>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض القواعد" description={q.error.message} /> : null}
      {q.isLoading ? <SkeletonLines lines={6} /> : null}
      {q.data?.length ? (
        <FinTable head={<tr><th>القاعدة</th><th>البيانات</th><th>التكرار</th><th>الإجراءات</th><th className="text-end">مرات التشغيل</th><th>آخر تشغيل</th><th>الحالة</th></tr>}>
          {q.data.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/workflows/automations/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{r.description ? <p className="text-[12px] text-fg-3">{r.description}</p> : null}</td>
              <td>{r.datasetLabel}</td>
              <td>{FREQ[r.frequency as keyof typeof FREQ] ?? r.frequency}{r.mode === "SUMMARY" ? " · ملخص" : ""}</td>
              <td className="text-[12px] text-fg-2">{r.actions.map((a) => ACTION_LABEL[a.type]).join("، ")}</td>
              <td className="text-end tabular">{formatNumber(r.runCount, prefs.digits)}</td>
              <td className="whitespace-nowrap text-fg-3">{r.lastRunAt ? fmtDate(r.lastRunAt) : "—"}</td>
              <td><Tag color={r.isEnabled ? "green" : "gray"}>{r.isEnabled ? "مفعّلة" : "متوقفة"}</Tag></td>
            </tr>
          ))}
        </FinTable>
      ) : q.data ? (
        <EmptyState compact illustration="inbox" title="لا قواعد أتمتة بعد" description="ابدأ من قالب جاهز أدناه: يُفتح في المحرر لتعاينه قبل التفعيل." />
      ) : null}
      {can("workflows", "update") && templates.data ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[16px] font-semibold">قوالب جاهزة</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.data.map((t) => (
              <Link key={t.key} href={`/workflows/automations/new?template=${t.key}`} className="rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
                <span className="flex items-center gap-2 text-[14px] font-medium"><Zap className="size-4 text-fg-3" aria-hidden />{t.name}</span>
                <span className="mt-1 block text-[12px] text-fg-3">{t.description} — {FREQ[t.frequency]}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </ModuleShell>
  );
}

type RuleForm = {
  id?: string | null;
  name: string;
  description: string;
  isEnabled: boolean;
  dataset: string;
  filters: Filter[];
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  mode: "EACH_ROW" | "SUMMARY";
  threshold: number;
  cooldownDays: number;
  actions: Action[];
};

export function AutomationEditorPage({ id }: { id?: string }) {
  const params = useSearchParams();
  const datasets = trpc.reports.datasets.useQuery();
  const templates = trpc.automation.templates.useQuery();
  const rule = trpc.automation.get.useQuery({ id: id ?? "" }, { enabled: Boolean(id) });
  if (id && rule.error) return <ModuleShell nav={govNav("workflows")} title="قاعدة"><EmptyState illustration="lock" title="لا يمكن فتح القاعدة" description={rule.error.message} /></ModuleShell>;
  if (!datasets.data || !templates.data || (id && !rule.data)) return <ModuleShell nav={govNav("workflows")} title="قاعدة"><SkeletonLines lines={8} /></ModuleShell>;
  const t = templates.data.find((x) => x.key === params.get("template"));
  const initial: RuleForm = rule.data
    ? { ...rule.data.rule, description: rule.data.rule.description ?? "", frequency: rule.data.rule.frequency as RuleForm["frequency"], mode: rule.data.rule.mode as RuleForm["mode"] }
    : t
      ? { name: t.name, description: t.description ?? "", isEnabled: true, dataset: t.dataset, filters: t.filters as Filter[], frequency: t.frequency, mode: t.mode, threshold: t.threshold, cooldownDays: t.cooldownDays, actions: t.actions }
      : { name: "", description: "", isEnabled: true, dataset: datasets.data[0]?.key ?? "", filters: [], frequency: "DAILY", mode: "EACH_ROW", threshold: 1, cooldownDays: 7, actions: [] };
  return <RuleEditor key={id ?? t?.key ?? "new"} initial={initial} datasets={datasets.data} runs={rule.data?.runs ?? []} />;
}

function RuleEditor({ initial, datasets, runs }: { initial: RuleForm; datasets: RouterOutputs["reports"]["datasets"]; runs: RouterOutputs["automation"]["get"]["runs"] }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { can } = useApp();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [f, setF] = useState<RuleForm>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ds = datasets.find((d) => d.key === f.dataset);
  const fields = (ds?.fields ?? []) as FieldDef[];
  const deferred = useDeferredValue(f.filters);
  const preview = trpc.automation.preview.useQuery({ id: f.id ?? null, dataset: f.dataset, filters: deferred, cooldownDays: f.cooldownDays }, { enabled: Boolean(ds), placeholderData: (p) => p, retry: false });
  const shares = trpc.reports.shareTargets.useQuery();
  const editable = can("workflows", "update");
  const save = trpc.automation.save.useMutation({ onSuccess: (r) => (toast.success("حُفظت القاعدة"), void utils.automation.invalidate(), !f.id && router.replace(`/workflows/automations/${r.id}`)), onError: (e) => toast.error(e.message) });
  const run = trpc.automation.runNow.useMutation({ onSuccess: (r) => (r.status === "SUCCESS" ? toast.success(`طابق ${r.matched} ونُفّذ ${r.acted} إجراء`) : toast.error(r.message ?? "تعذر التشغيل"), void utils.automation.invalidate()), onError: (e) => toast.error(e.message) });
  const del = trpc.automation.delete.useMutation({ onSuccess: () => (toast.success("حُذفت القاعدة"), void utils.automation.invalidate(), router.push("/workflows/automations")), onError: (e) => toast.error(e.message) });
  const setAction = (i: number, a: Action) => setF({ ...f, actions: f.actions.map((x, j) => (j === i ? a : x)) });
  const vars = ["{title}", "{count}", ...fields.slice(0, 6).map((x) => `{${x.key}}`)];
  const newAction = (type: Action["type"]): Action =>
    type === "NOTIFY_ROLE" ? { type, roleKey: "PRINCIPAL", title: "{title}" } : type === "NOTIFY_USERS" ? { type, userIds: [], title: "{title}" } : type === "NOTIFY_ASSIGNEE" ? { type, title: "{title}" } : type === "NOTIFY_GUARDIANS" ? { type, message: "بخصوص {title}" } : { type, emails: [], subject: "{count} سجلاً مطابقاً" };
  const allowed = (type: Action["type"]) => (type === "NOTIFY_GUARDIANS" ? ds?.hasStudent && f.mode === "EACH_ROW" : type === "NOTIFY_ASSIGNEE" ? ds?.hasUser && f.mode === "EACH_ROW" : true);
  return (
    <ModuleShell
      nav={govNav("workflows")}
      wide
      title={f.name || "قاعدة جديدة"}
      crumbs={[{ title: "قواعد الأتمتة", href: "/workflows/automations" }, { title: f.name || "قاعدة جديدة" }]}
      actions={
        editable ? (
          <div className="flex items-center gap-1.5">
            {f.id ? <Button size="sm" icon={<Play className="size-3.5" />} loading={run.isPending} onClick={() => run.mutate({ id: f.id! })}>شغّل الآن</Button> : null}
            {f.id ? <Button size="icon" variant="ghost" aria-label="حذف القاعدة" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /></Button> : null}
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={f.name.trim().length < 3 || !f.actions.length} onClick={() => save.mutate({ ...f, description: f.description || null })}>حفظ</Button>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-lg bg-card p-5 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم القاعدة"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!editable} /></Field>
              <Field label="مجموعة البيانات"><Select value={f.dataset} onChange={(dataset) => setF({ ...f, dataset, filters: [], actions: f.actions.filter((a) => a.type !== "NOTIFY_GUARDIANS" && a.type !== "NOTIFY_ASSIGNEE") })} options={datasets.map((d) => ({ value: d.key, label: `${d.group} — ${d.label}` }))} /></Field>
              <Field label="الوصف" className="sm:col-span-2"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={!editable} /></Field>
            </div>
          </section>
          <section className="rounded-lg bg-card p-5 shadow-card">
            <h2 className="mb-1 text-[15px] font-semibold">الشرط</h2>
            <p className="mb-3 text-[12px] text-fg-3">السجلات المطابقة لكل الشروط تُطلق الإجراءات.</p>
            <FilterEditor fields={fields} filters={f.filters} onChange={(filters) => setF({ ...f, filters })} />
          </section>
          <section className="rounded-lg bg-card p-5 shadow-card">
            <h2 className="mb-3 text-[15px] font-semibold">التوقيت والأسلوب</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="التكرار"><Segmented value={f.frequency} onChange={(frequency) => setF({ ...f, frequency: frequency as RuleForm["frequency"] })} options={(Object.keys(FREQ) as Array<keyof typeof FREQ>).map((k) => ({ value: k, label: FREQ[k] }))} /></Field>
              <Field label="الأسلوب"><Segmented value={f.mode} onChange={(mode) => setF({ ...f, mode: mode as RuleForm["mode"], actions: mode === "SUMMARY" ? f.actions.filter((a) => a.type !== "NOTIFY_GUARDIANS" && a.type !== "NOTIFY_ASSIGNEE") : f.actions })} options={[{ value: "EACH_ROW", label: "لكل سجل" }, { value: "SUMMARY", label: "ملخص واحد" }]} /></Field>
              {f.mode === "EACH_ROW" ? (
                <Field label="لا يتكرر الإجراء على السجل نفسه قبل (أيام)" hint="٠ = في كل تشغيل"><Input type="number" min={0} max={365} value={f.cooldownDays} onChange={(e) => setF({ ...f, cooldownDays: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              ) : (
                <Field label="يُرسل الملخص إذا بلغ عدد المطابقين"><Input type="number" min={1} value={f.threshold} onChange={(e) => setF({ ...f, threshold: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              )}
              <div className="flex items-end"><SwitchRow checked={f.isEnabled} onChange={(isEnabled) => setF({ ...f, isEnabled })} label="القاعدة مفعّلة" /></div>
            </div>
          </section>
          <section className="rounded-lg bg-card p-5 shadow-card">
            <h2 className="mb-1 text-[15px] font-semibold">الإجراءات</h2>
            <p className="mb-3 text-[12px] text-fg-3">المتغيرات: <span dir="ltr" className="font-mono">{vars.join(" ")}</span></p>
            <div className="space-y-2">
              {f.actions.map((a, i) => (
                <div key={i} className="rounded-md bg-hover/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-medium">{ACTION_LABEL[a.type]}</span>
                    <Button size="icon-sm" variant="ghost" aria-label="حذف الإجراء" onClick={() => setF({ ...f, actions: f.actions.filter((_, j) => j !== i) })}><X className="size-3.5" /></Button>
                  </div>
                  {a.type === "NOTIFY_ROLE" ? (
                    <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                      <Select size="sm" value={a.roleKey} onChange={(roleKey) => setAction(i, { ...a, roleKey })} options={(shares.data?.roles ?? []).map((r) => ({ value: rolesKeyOf(r), label: r.name }))} />
                      <Input className="h-7" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} aria-label="نص الإشعار" />
                    </div>
                  ) : null}
                  {a.type === "NOTIFY_USERS" ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {(shares.data?.users ?? []).slice(0, 60).map((u) => {
                          const on = a.userIds.includes(u.id);
                          return <button key={u.id} type="button" aria-pressed={on} onClick={() => setAction(i, { ...a, userIds: on ? a.userIds.filter((x) => x !== u.id) : [...a.userIds, u.id] })} className={cn("rounded-full px-2 py-0.5 text-[12px]", on ? "bg-navy-700 text-on-primary" : "bg-card text-fg-2")}>{u.name}</button>;
                        })}
                      </div>
                      <Input className="h-7" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} aria-label="نص الإشعار" />
                    </div>
                  ) : null}
                  {a.type === "NOTIFY_ASSIGNEE" ? <Input className="h-7" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} aria-label="نص الإشعار" /> : null}
                  {a.type === "NOTIFY_GUARDIANS" ? <Textarea rows={2} value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} aria-label="نص الرسالة" /> : null}
                  {a.type === "EMAIL" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input className="h-7" dir="ltr" placeholder="a@example.com, b@example.com" defaultValue={a.emails.join(", ")} onBlur={(e) => setAction(i, { ...a, emails: e.target.value.split(/[,،\s]+/).filter((x) => /@/.test(x)) })} aria-label="البريد" />
                      <Input className="h-7" value={a.subject} onChange={(e) => setAction(i, { ...a, subject: e.target.value })} aria-label="عنوان البريد" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {editable ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {(Object.keys(ACTION_LABEL) as Action["type"][]).filter(allowed).map((t) => (
                  <Button key={t} size="xs" variant="subtle" icon={<Plus className="size-3" />} onClick={() => setF({ ...f, actions: [...f.actions, newAction(t)] })}>{ACTION_LABEL[t]}</Button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg bg-card p-4 shadow-card" aria-live="polite">
            <h3 className="text-[14px] font-semibold">معاينة الآن</h3>
            {preview.error ? <p className="mt-2 text-[12px] text-danger-700">{preview.error.message}</p> : null}
            {preview.data ? (
              <div className={cn("transition-opacity", preview.isFetching && "opacity-60")}>
                <p className="mt-2 text-[28px] font-bold">{formatNumber(preview.data.matched, prefs.digits)}</p>
                <p className="text-[12px] text-fg-3">سجل مطابق من {formatNumber(preview.data.total, prefs.digits)}{preview.data.cooling ? ` — ${formatNumber(preview.data.cooling, prefs.digits)} منها ضمن فترة التهدئة` : ""}</p>
                {preview.data.sample.length ? (
                  <ul className="mt-3 space-y-1 text-[13px]">
                    {preview.data.sample.map((s) => (
                      <li key={s.key} className="truncate">{s.link ? <Link href={s.link} className="hover:underline">{s.title}</Link> : s.title}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : preview.isLoading ? <SkeletonLines lines={3} /> : null}
          </section>
          {runs.length ? (
            <section className="rounded-lg bg-card p-4 shadow-card">
              <h3 className="mb-2 text-[14px] font-semibold">سجل التشغيل</h3>
              <ul className="space-y-1.5 text-[12px]">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-fg-2">{fmtDate(r.createdAt)} · {r.trigger === "SCHEDULE" ? "مجدول" : "يدوي"}</span>
                    {r.status === "SUCCESS" ? <span className="text-fg-3">طابق {formatNumber(r.matched, prefs.digits)} · {formatNumber(r.acted, prefs.digits)} إجراء</span> : <span className="text-danger-700">فشل</span>}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
      {confirmDelete ? (
        <Dialog open onOpenChange={(o) => !o && setConfirmDelete(false)}>
          <DialogContent title="حذف القاعدة" description="تتوقف القاعدة فوراً. سجل تشغيلها السابق يبقى." width={420}>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>تراجع</Button>
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate({ id: f.id! })}>حذف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ModuleShell>
  );
}

/** مفتاح الدور من قائمة المشاركة (تُعاد بالمعرّف والاسم؛ المفتاح مطلوب للقاعدة) */
function rolesKeyOf(r: { id: string; name: string; key?: string }) {
  return r.key ?? r.id;
}
