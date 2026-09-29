"use client";
/**
 * تقييم الأداء: الدورات وتقييماتي (ذاتي/كمقيّم)، تفاصيل الدورة بتوزيع التقديرات،
 * ونموذج التقييم: درجات ١–٥ للمعايير الموزونة والأهداف والتعليقات.
 */
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { HBars } from "@/components/charts/bars";
import { useFmtDate, useToday } from "@/components/finance/common";
import { useScore } from "@/components/assessment/common";
import { hrNav } from "./common";

const REVIEW_STATUS: Record<string, { label: string; color: string }> = {
  PENDING_SELF: { label: "بانتظار التقييم الذاتي", color: "gold" },
  PENDING_MANAGER: { label: "بانتظار تقييم المدير", color: "navy" },
  COMPLETED: { label: "مكتمل", color: "green" },
};

export function PerformancePage() {
  const q = trpc.hr.performance.cycles.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [open, setOpen] = useState(false);
  const d = q.data;
  return (
    <ModuleShell nav={hrNav("performance")} wide actions={d?.hr ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>دورة تقييم</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض التقييم" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-[15px] font-semibold">تقييماتي</h2>
            {!d.mine.length ? (
              <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا تقييمات مسندة إليك.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {d.mine.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hr/performance/reviews/${r.id}`} className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 shadow-card hover:bg-hover">
                      <span className="flex-1 text-[14px] font-medium">
                        {r.cycle}
                        <span className="block text-[12px] font-normal text-fg-3">{r.asReviewer ? "تقييم أحد مرؤوسيك" : "تقييمي"}</span>
                      </span>
                      <Tag color={REVIEW_STATUS[r.status]?.color}>{REVIEW_STATUS[r.status]?.label}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {d.hr ? (
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">دورات التقييم</h2>
              {!d.cycles.length ? (
                <EmptyState illustration="calendar" title="لا دورات تقييم" description="أنشئ دورة (مثل التقييم السنوي) فيُنشأ تقييم لكل موظف نشط يقيّمه مديره المباشر." action={<Button variant="primary" onClick={() => setOpen(true)}>دورة تقييم</Button>} />
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {d.cycles.map((c) => (
                    <li key={c.id}>
                      <Link href={`/hr/performance/${c.id}`} className="block rounded-lg bg-card p-4 shadow-card hover:shadow-card-hover">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-semibold">{c.name}</span>
                          <Tag color={c.status === "OPEN" ? "green" : "gray"}>{c.status === "OPEN" ? "مفتوحة" : "مغلقة"}</Tag>
                        </div>
                        <p className="mt-1 text-[12px] text-fg-3">
                          {fmtDate(c.startDate)} ← {fmtDate(c.endDate)}
                        </p>
                        <p className="mt-2 text-[13px] text-fg-2">
                          اكتمل {formatNumber(c.completed, prefs.digits)} من {formatNumber(c.total, prefs.digits)} · بانتظار الذاتي {formatNumber(c.pendingSelf, prefs.digits)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
      {open ? <CycleDialog onClose={() => setOpen(false)} /> : null}
    </ModuleShell>
  );
}

function CycleDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const templates = trpc.hr.performance.templates.useQuery();
  const [v, setV] = useState({ name: `التقييم السنوي ${today.slice(0, 4)}`, templateId: "", startDate: today, endDate: today });
  const m = trpc.hr.performance.createCycle.useMutation({ onSuccess: (r) => (toast.success(`أُنشئت الدورة بـ${r.reviews} تقييماً${r.withoutReviewer ? ` (${r.withoutReviewer} بلا مدير مباشر: تقيّمهم الموارد البشرية)` : ""}`), void utils.hr.performance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const templateId = v.templateId || templates.data?.[0]?.id || "";
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="دورة تقييم" description="يصل كل موظف إشعار بالتقييم الذاتي، ثم يقيّمه مديره المباشر.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم" className="col-span-2">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="النموذج" className="col-span-2">
            <Select value={templateId} onChange={(t) => setV({ ...v, templateId: t })} options={(templates.data ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.criteria.length} معايير)` }))} />
          </Field>
          <Field label="من">
            <Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={v.endDate} min={v.startDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!templateId || v.name.trim().length < 2} onClick={() => m.mutate({ ...v, templateId })}>
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CyclePage({ id }: { id: string }) {
  const q = trpc.hr.performance.cycle.useQuery({ id });
  const utils = trpc.useUtils();
  const score = useScore();
  const close = trpc.hr.performance.closeCycle.useMutation({ onSuccess: () => (toast.success("أُغلقت الدورة"), void utils.hr.performance.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  if (q.error) return <ModuleShell nav={hrNav("performance")} title="الدورة"><EmptyState illustration="lock" title="لا يمكن عرض الدورة" description={q.error.message} /></ModuleShell>;
  if (!d) return <ModuleShell nav={hrNav("performance")} title="الدورة"><SkeletonLines lines={10} /></ModuleShell>;
  return (
    <ModuleShell nav={hrNav("performance")} wide title={d.cycle.name} crumbs={[{ title: d.cycle.name }]} actions={d.cycle.status === "OPEN" ? <Button size="sm" loading={close.isPending} onClick={() => close.mutate({ id })}>إغلاق الدورة</Button> : null}>
      <h1 className="mb-4 text-[26px] font-bold">{d.cycle.name}</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="w-full min-w-[600px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المقيّم</th>
                <th>الحالة</th>
                <th>النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/hr/performance/reviews/${r.id}`} className="font-medium hover:underline">
                      {r.employee.fullName}
                    </Link>
                    <span className="block text-[12px] text-fg-3">{r.employee.department?.name ?? "—"}</span>
                  </td>
                  <td className="text-fg-2">{r.reviewer ?? "الموارد البشرية"}</td>
                  <td>
                    <Tag color={REVIEW_STATUS[r.status]?.color}>{REVIEW_STATUS[r.status]?.label}</Tag>
                  </td>
                  <td>{r.finalBp !== null ? <span className="tabular">{score.pct(r.finalBp, 0)} — {r.rating}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-3 text-[14px] font-semibold">توزيع التقديرات</h2>
          <HBars data={d.distribution.map((x) => ({ key: x.label, label: x.label, value: x.count }))} labelWidth={110} />
        </section>
      </div>
    </ModuleShell>
  );
}

export function ReviewPage({ id }: { id: string }) {
  const q = trpc.hr.performance.review.useQuery({ id });
  const d = q.data;
  if (q.error) return <ModuleShell nav={hrNav("performance")} title="التقييم"><EmptyState illustration="lock" title="لا يمكن عرض التقييم" description={q.error.message} /></ModuleShell>;
  if (!d) return <ModuleShell nav={hrNav("performance")} title="التقييم"><SkeletonLines lines={10} /></ModuleShell>;
  return (
    <ModuleShell nav={hrNav("performance")} title={`تقييم ${d.employee?.fullName ?? ""}`} crumbs={[{ title: `تقييم ${d.employee?.fullName ?? ""}` }]}>
      <ReviewForm key={d.review.updatedAt.toString()} d={d} />
    </ModuleShell>
  );
}

function ReviewForm({ d }: { d: RouterOutputs["hr"]["performance"]["review"] }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const r = d.review;
  const selfMode = d.role.self && r.status === "PENDING_SELF";
  const managerMode = (d.role.reviewer || d.role.hr) && !d.role.self && r.status !== "COMPLETED";
  const [self, setSelf] = useState<Record<string, number>>((r.selfScores as Record<string, number>) ?? {});
  const [mgr, setMgr] = useState<Record<string, number>>((r.managerScores as Record<string, number>) ?? {});
  const [goals, setGoals] = useState<Array<{ title: string; target: string; progressBp: number }>>((r.goals as never) ?? []);
  const [selfComment, setSelfComment] = useState(r.selfComment ?? "");
  const [mgrComment, setMgrComment] = useState(r.managerComment ?? "");
  const done = () => void utils.hr.performance.invalidate();
  const submitSelf = trpc.hr.performance.submitSelf.useMutation({ onSuccess: () => (toast.success("أُرسل تقييمك الذاتي لمديرك"), done()), onError: (e) => toast.error(e.message) });
  const submitMgr = trpc.hr.performance.submitManager.useMutation({ onSuccess: (x) => (toast.success(`اعتُمد التقييم: ${x.rating}`), done()), onError: (e) => toast.error(e.message) });
  const complete = (s: Record<string, number>) => d.criteria.every((c) => (s[c.key] ?? 0) >= 1);
  const Scale = ({ value, onChange, disabled, label }: { value: number | undefined; onChange: (n: number) => void; disabled: boolean; label: string }) => (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled} onClick={() => onChange(n)} className={cn("grid size-7 place-items-center rounded-md text-[12px] tabular transition-colors disabled:cursor-default", value === n ? "bg-navy-700 text-white" : "bg-hover text-fg-2 enabled:hover:bg-active")}>
          {n}
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[24px] font-bold">{d.employee?.fullName}</h1>
        <p className="text-[14px] text-fg-3">
          {d.employee?.positionRef?.title ?? ""} · {d.employee?.department?.name ?? ""} · المقيّم: {d.reviewer ?? "الموارد البشرية"} · <Tag color={REVIEW_STATUS[r.status]?.color}>{REVIEW_STATUS[r.status]?.label}</Tag>
        </p>
        {r.finalBp !== null ? <p className="mt-2 text-[18px] font-semibold">النتيجة: <span className="tabular">{score.pct(r.finalBp, 0)}</span> — {r.rating}</p> : null}
      </header>
      <section className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
        <table className="w-full min-w-[640px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2.5 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
          <thead>
            <tr>
              <th>المعيار</th>
              <th>الوزن</th>
              <th>التقييم الذاتي</th>
              <th>تقييم المدير</th>
            </tr>
          </thead>
          <tbody>
            {d.criteria.map((c) => (
              <tr key={c.key}>
                <td>
                  <span className="font-medium">{c.name}</span>
                  {c.description ? <span className="block text-[12px] text-fg-3">{c.description}</span> : null}
                </td>
                <td className="tabular">{c.weight}٪</td>
                <td>
                  <Scale label={`ذاتي: ${c.name}`} value={self[c.key]} disabled={!selfMode} onChange={(n) => setSelf({ ...self, [c.key]: n })} />
                </td>
                <td>
                  <Scale label={`المدير: ${c.name}`} value={mgr[c.key]} disabled={!managerMode} onChange={(n) => setMgr({ ...mgr, [c.key]: n })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">الأهداف</h2>
          {selfMode ? (
            <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setGoals([...goals, { title: "", target: "", progressBp: 0 }])}>
              هدف
            </Button>
          ) : null}
        </div>
        {!goals.length ? <p className="text-[13px] text-fg-3">لا أهداف.</p> : null}
        {goals.map((g, i) => (
          <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px]">
            <Input disabled={!selfMode} placeholder="الهدف" value={g.title} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Input disabled={!selfMode} placeholder="المستهدف" value={g.target} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
            <Input disabled={!selfMode} type="number" min={0} max={100} aria-label="نسبة الإنجاز" value={g.progressBp / 100} onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, progressBp: Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))) * 100 } : x)))} />
          </div>
        ))}
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="تعليق الموظف">
          <Textarea disabled={!selfMode} rows={3} value={selfComment} onChange={(e) => setSelfComment(e.target.value)} />
        </Field>
        <Field label="تعليق المدير">
          <Textarea disabled={!managerMode} rows={3} value={mgrComment} onChange={(e) => setMgrComment(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {selfMode ? (
          <Button variant="primary" disabled={!complete(self)} loading={submitSelf.isPending} onClick={() => submitSelf.mutate({ id: r.id, scores: self, goals: goals.filter((g) => g.title.trim().length >= 2), comment: selfComment || null })}>
            إرسال التقييم الذاتي
          </Button>
        ) : null}
        {managerMode ? (
          <Button variant="primary" disabled={!complete(mgr)} loading={submitMgr.isPending} onClick={() => submitMgr.mutate({ id: r.id, scores: mgr, comment: mgrComment || null })}>
            اعتماد التقييم
          </Button>
        ) : null}
      </div>
    </div>
  );
}
