"use client";
/**
 * النتائج: كشف نتائج الفصل (فصلي أو تراكمي) بالترتيب والنتيجة، ونظام التقييم (الأوزان والتقديرات)،
 * وإعدادات التقييم (رؤساء الأقسام، حجب الشهادات، حد التعثر).
 */
import { Download, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { bandFor, validateScheme, type GradeBand, type SchemeComponent } from "@/lib/assessment/calc";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { ModuleShell } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { downloadCsv, Figure, MoneyInput, PercentInput } from "@/components/finance/common";
import { assessmentNav, RESULT_STATUS, RESULTS_TABS, scoreTone, useScore } from "./common";

type Results = RouterOutputs["assessment"]["results"]["section"];

export function ResultsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const score = useScore();
  const opts = trpc.assessment.results.sections.useQuery();
  const sectionId = params.get("section") ?? opts.data?.sections[0]?.id ?? null;
  const period = params.get("period") ?? opts.data?.terms.at(0)?.id ?? null;
  const [approvedOnly, setApprovedOnly] = useState(false);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const q = trpc.assessment.results.section.useQuery({ sectionId: sectionId ?? "", termId: period ?? "", approvedOnly }, { enabled: Boolean(sectionId && period) });
  const d = q.data;
  const exportCsv = () =>
    d &&
    downloadCsv(`نتائج-${d.section.grade}-${d.section.name}.csv`, [
      ["الترتيب", "الطالب", ...d.subjects.map((s) => s.name), "المعدل", "التقدير", "النتيجة", "ترتيب الصف"],
      ...d.rows.map((r) => [r.rank.section ?? "", r.student.fullName, ...d.subjects.map((s) => (r.subjects[s.id]?.bp == null ? "" : score.pct(r.subjects[s.id]!.bp))), r.term.averageBp === null ? "" : score.pct(r.term.averageBp), bandFor(r.term.averageBp, d.scheme.bands as GradeBand[])?.label ?? "", RESULT_STATUS[r.term.result]!.label, r.rank.grade ?? ""]),
    ]);
  return (
    <ModuleShell
      nav={assessmentNav("results")}
      wide
      tabs={RESULTS_TABS}
      actions={
        d ? (
          <>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              تصدير
            </Button>
            <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
              طباعة
            </Button>
          </>
        ) : null
      }
    >
      {opts.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض النتائج" description={opts.error.message} />
      ) : !opts.data ? (
        <SkeletonLines lines={10} />
      ) : !opts.data.sections.length ? (
        <EmptyState illustration="table" title="لا فصول في نطاقك" description="تظهر هنا فصول العام الحالي التي تملك صلاحية على نتائجها." />
      ) : (
        <>
          <div className="no-print mb-4 flex flex-wrap items-center gap-3">
            <Select className="w-[260px]" value={sectionId ?? undefined} onChange={(v) => set("section", v)} options={opts.data.sections.map((s) => ({ value: s.id, label: `${s.name} — ${s.branch}` }))} />
            <Segmented value={period ?? ""} onChange={(v) => set("period", v)} options={[...opts.data.terms.map((t) => ({ value: t.id, label: t.name })), { value: "YEAR", label: "النتيجة التراكمية" }]} />
            <label className="flex items-center gap-2 text-[13px] text-fg-2">
              <Checkbox checked={approvedOnly} onChange={setApprovedOnly} /> المعتمد فقط (كما في الشهادة)
            </label>
          </div>
          {q.error ? (
            <EmptyState illustration="lock" title="لا يمكن عرض نتائج الفصل" description={q.error.message} />
          ) : !d ? (
            <SkeletonLines lines={12} />
          ) : (
            <ResultsTable d={d} />
          )}
        </>
      )}
    </ModuleShell>
  );
}

function ResultsTable({ d }: { d: Results }) {
  const score = useScore();
  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Figure label="الطلاب" value={formatNumber(d.summary.students, score.digits)} />
        <Figure label="متوسط الفصل" value={score.pct(d.summary.averageBp)} />
        <Figure label="ناجح" tone="success" value={formatNumber(d.summary.pass, score.digits)} />
        <Figure label="دور ثانٍ" tone="warning" value={formatNumber(d.summary.secondRound, score.digits)} />
        <Figure label="راسب" tone={d.summary.fail ? "danger" : undefined} value={formatNumber(d.summary.fail, score.digits)} />
        <Figure label="نسبة النجاح" value={score.pct(d.summary.passRateBp, 0)} hint={d.summary.incomplete ? `${formatNumber(d.summary.incomplete, score.digits)} غير مكتمل` : undefined} />
      </section>
      {d.pendingApproval ? (
        <p className="no-print mb-3 rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">
          {formatNumber(d.pendingApproval, score.digits)} بند تقييم لم يُعتمد بعد في هذا الفصل؛ النتائج أولية حتى الاعتماد.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
        <table className="w-full text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-2.5 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-fg-3">
          <thead>
            <tr>
              <th className="w-10 text-center">#</th>
              <th className="sticky start-0 z-10 min-w-[180px] bg-card text-start">الطالب</th>
              {d.subjects.map((s) => (
                <th key={s.id} className="min-w-[72px] text-center">
                  {s.name}
                </th>
              ))}
              <th className="text-center">المعدل</th>
              <th className="text-center">التقدير</th>
              <th className="text-center">النتيجة</th>
              <th className="text-center">ترتيب الصف</th>
              <th className="text-center">ترتيب المدرسة</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.student.id} className="hover:bg-hover/60">
                <td className="text-center font-semibold tabular">{r.rank.section ? formatNumber(r.rank.section, score.digits) : "—"}</td>
                <td className="sticky start-0 z-10 bg-card font-medium">{r.student.fullName}</td>
                {d.subjects.map((s) => {
                  const bp = r.subjects[s.id]?.bp ?? null;
                  return (
                    <td key={s.id} className={cn("text-center tabular", scoreTone(bp, d.scheme.passBp))}>
                      {score.pct(bp, 0)}
                    </td>
                  );
                })}
                <td className="text-center font-semibold tabular">{score.pct(r.term.averageBp)}</td>
                <td className="text-center text-fg-2">{bandFor(r.term.averageBp, d.scheme.bands as GradeBand[])?.label ?? "—"}</td>
                <td className="text-center">
                  <Tag color={RESULT_STATUS[r.term.result]!.color}>{RESULT_STATUS[r.term.result]!.label}</Tag>
                </td>
                <td className="text-center tabular text-fg-2">{r.rank.grade ? formatNumber(r.rank.grade, score.digits) : "—"}</td>
                <td className="text-center tabular text-fg-3">{r.rank.school ? formatNumber(r.rank.school, score.digits) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-fg-3">درجة المادة = متوسط موزون لمكوناتها، والمعدل = متوسط المواد. الترتيب تنافسي (١، ٢، ٢، ٤) ولا يُرتَّب غير المكتمل.</p>
    </>
  );
}

// ---------------------------------------------------------------------
// نظام التقييم
// ---------------------------------------------------------------------

type Schemes = RouterOutputs["assessment"]["results"]["schemes"];

export function SchemePage() {
  const q = trpc.assessment.results.schemes.useQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const d = q.data;
  const current = d?.schemes.find((s) => s.id === selected) ?? d?.schemes[0] ?? null;
  return (
    <ModuleShell nav={assessmentNav("results")} tabs={RESULTS_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض نظام التقييم" description={q.error.message} />
      ) : !d || !current ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={current.id} onChange={setSelected} options={d.schemes.map((s) => ({ value: s.id, label: s.stage ?? "الافتراضي" }))} />
            {d.canEdit && d.stages.some((st) => !d.schemes.some((s) => s.stageId === st.id)) ? <NewStageScheme d={d} base={d.schemes.find((s) => !s.stageId) ?? current} onCreated={setSelected} /> : null}
          </div>
          <SchemeForm key={current.id} scheme={current} canEdit={d.canEdit} />
        </>
      )}
    </ModuleShell>
  );
}

function NewStageScheme({ d, base, onCreated }: { d: Schemes; base: Schemes["schemes"][number]; onCreated: (id: string) => void }) {
  const utils = trpc.useUtils();
  const m = trpc.assessment.results.saveScheme.useMutation({ onSuccess: (r) => (toast.success("أُنشئ نظام للمرحلة"), void utils.assessment.results.schemes.invalidate(), onCreated(r.id)), onError: (e) => toast.error(e.message) });
  const free = d.stages.filter((st) => !d.schemes.some((s) => s.stageId === st.id));
  return (
    <Select size="sm" className="w-[200px]" value={undefined} placeholder="+ نظام خاص بمرحلة" onChange={(stageId) => m.mutate({ stageId, name: `نظام ${free.find((s) => s.id === stageId)?.name}`, components: base.components, bands: base.bands, passBp: base.passBp, maxSecondRoundSubjects: base.maxSecondRoundSubjects, display: base.display as "PERCENT" })} options={free.map((s) => ({ value: s.id, label: s.name }))} />
  );
}

function SchemeForm({ scheme, canEdit }: { scheme: Schemes["schemes"][number]; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const [v, setV] = useState({ name: scheme.name, components: scheme.components as SchemeComponent[], bands: scheme.bands as GradeBand[], passBp: scheme.passBp, maxSecondRoundSubjects: scheme.maxSecondRoundSubjects, display: scheme.display as "PERCENT" | "LETTER" | "POINTS" });
  const err = validateScheme(v);
  const total = v.components.reduce((a, c) => a + c.weight, 0);
  const m = trpc.assessment.results.saveScheme.useMutation({ onSuccess: () => (toast.success("حُفظ نظام التقييم"), void utils.assessment.invalidate()), onError: (e) => toast.error(e.message) });
  const setComp = (i: number, patch: Partial<SchemeComponent>) => setV({ ...v, components: v.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setBand = (i: number, patch: Partial<GradeBand>) => setV({ ...v, bands: v.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <div>
      {!canEdit ? <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: تعديل نظام التقييم لإدارة المدرسة.</p> : null}
      <SettingsCard title="المكونات والأوزان" description="تُجمع بنود كل مكوّن بنسبة درجاتها إلى عظماها، ثم تُوزن المكونات. المكوّن غير المرصود يُعاد توزيع وزنه ويُعلَّم الطالب «غير مكتمل».">
        <div className="space-y-2">
          {v.components.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_90px_auto] items-center gap-2">
              <Input disabled={!canEdit} value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} aria-label="اسم المكوّن" />
              <Input disabled={!canEdit || scheme.components.some((x) => x.key === c.key)} dir="ltr" value={c.key} onChange={(e) => setComp(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} aria-label="رمز المكوّن" />
              <Input disabled={!canEdit} dir="ltr" inputMode="numeric" className="text-end tabular" value={c.weight} onChange={(e) => setComp(i, { weight: Math.max(0, Math.min(100, Math.trunc(Number(e.target.value.replace(/\D/g, "")) || 0))) })} aria-label="الوزن" />
              {canEdit ? (
                <Button size="icon-sm" variant="ghost" aria-label="حذف المكوّن" onClick={() => setV({ ...v, components: v.components.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-[13px]">
            {canEdit ? (
              <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setV({ ...v, components: [...v.components, { key: `c${v.components.length + 1}`, name: "مكوّن جديد", weight: 0 }] })}>
                مكوّن
              </Button>
            ) : (
              <span />
            )}
            <span className={cn("tabular", total !== 100 ? "text-danger-700" : "text-fg-3")}>المجموع {formatNumber(total, score.digits)}٪</span>
          </div>
        </div>
      </SettingsCard>
      <SettingsCard title="التقديرات" description="الحد الأدنى لكل تقدير ونقاطه (من ٥).">
        <div className="space-y-2">
          {v.bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_110px_110px] items-center gap-2">
              <Input disabled={!canEdit} value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} aria-label="التقدير" />
              <Input disabled={!canEdit} dir="ltr" value={b.letter} onChange={(e) => setBand(i, { letter: e.target.value.slice(0, 4) })} aria-label="الرمز" />
              <PercentInput disabled={!canEdit} bp={b.minBp} onChange={(minBp) => setBand(i, { minBp })} />
              <PercentInput disabled={!canEdit} bp={b.points * 100} onChange={(p) => setBand(i, { points: Math.min(500, Math.round(p / 100)) })} />
            </div>
          ))}
          <p className="text-[12px] text-fg-3">الأعمدة: التقدير · الرمز · من (٪) · النقاط (من ٥)</p>
        </div>
      </SettingsCard>
      <SettingsCard
        title="النجاح والعرض"
        footer={
          canEdit ? (
            <>
              {err ? <span className="me-auto text-[13px] text-danger-700">{err}</span> : null}
              <Button variant="primary" disabled={Boolean(err)} loading={m.isPending} onClick={() => m.mutate({ id: scheme.id, stageId: scheme.stageId, ...v })}>
                حفظ نظام التقييم
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="درجة النجاح في المادة ٪">
            <PercentInput disabled={!canEdit} bp={v.passBp} onChange={(passBp) => setV({ ...v, passBp })} />
          </Field>
          <Field label="أقصى مواد للدور الثاني" hint="أكثر منها = راسب">
            <Input disabled={!canEdit} type="number" min={0} max={10} value={v.maxSecondRoundSubjects} onChange={(e) => setV({ ...v, maxSecondRoundSubjects: Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))) })} />
          </Field>
          <Field label="العرض في الشهادة">
            <Select disabled={!canEdit} value={v.display} onChange={(display) => setV({ ...v, display: display as typeof v.display })} options={[{ value: "PERCENT", label: "نسبة مئوية" }, { value: "LETTER", label: "تقدير بالحروف" }, { value: "POINTS", label: "نقاط (من ٥)" }]} />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}

// ---------------------------------------------------------------------
// إعدادات التقييم
// ---------------------------------------------------------------------

interface AssessmentSettingsValues {
  subjectHeads: Record<string, string>;
  withholdOnDebt: boolean;
  withholdMinOverdueMinor: number;
  progressVisibleToParents: boolean;
  atRiskBp: number;
  reportCardFooter: string;
}

export function AssessmentSettingsPage() {
  const q = trpc.moduleSettings.get.useQuery({ key: "assessment" });
  const opts = trpc.assessment.exams.options.useQuery();
  return (
    <ModuleShell nav={assessmentNav("results")} tabs={RESULTS_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإعدادات" description={q.error.message} />
      ) : q.data && opts.data ? (
        <SettingsForm initial={q.data.values as unknown as AssessmentSettingsValues} canEdit={q.data.canEdit} opts={opts.data} />
      ) : (
        <SkeletonLines lines={10} />
      )}
    </ModuleShell>
  );
}

function SettingsForm({ initial, canEdit, opts }: { initial: AssessmentSettingsValues; canEdit: boolean; opts: RouterOutputs["assessment"]["exams"]["options"] }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => (await Promise.all([utils.moduleSettings.get.invalidate({ key: "assessment" }), utils.account.context.invalidate()]), toast.success("حُفظت إعدادات التقييم")),
    onError: (e) => toast.error(e.message),
  });
  const subjects = [...new Map(opts.grades.flatMap((g) => g.subjects).map((s) => [s.id, s])).values()];
  return (
    <div>
      {!canEdit ? <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: تعديل الإعدادات لإدارة المدرسة.</p> : null}
      <SettingsCard title="رؤساء الأقسام" description="رئيس القسم يراجع درجات مادته قبل اعتماد الوكيل. المادة بلا رئيس تنتقل مباشرة للوكيل.">
        <div className="grid gap-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-[120px] shrink-0 truncate text-[14px]">{s.name}</span>
              <Select size="sm" disabled={!canEdit} value={v.subjectHeads[s.id] ?? "NONE"} onChange={(u) => setV({ ...v, subjectHeads: Object.fromEntries(Object.entries({ ...v.subjectHeads, [s.id]: u }).filter(([, x]) => x !== "NONE")) })} options={[{ value: "NONE", label: "بلا رئيس قسم" }, ...opts.teachers.map((t) => ({ value: t.id, label: t.name }))]} />
            </div>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard
        title="الشهادات والتعثر"
        footer={
          canEdit ? (
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "assessment", patch: { ...v } })}>
              حفظ
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.withholdOnDebt} onChange={(withholdOnDebt) => setV({ ...v, withholdOnDebt })} /> السماح بحجب شهادات من عليهم مستحقات متأخرة (يُفعَّل لكل فصل عند النشر)
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.progressVisibleToParents} onChange={(progressVisibleToParents) => setV({ ...v, progressVisibleToParents })} /> إظهار تقارير المتابعة (أثناء الفصل) لأولياء الأمور
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="لا حجب إن كان المتأخر أقل من" hint="صفر = أي مبلغ متأخر يحجب">
              <MoneyInput disabled={!canEdit} value={v.withholdMinOverdueMinor} onChange={(a) => setV({ ...v, withholdMinOverdueMinor: a ?? 0 })} />
            </Field>
            <Field label="حد التعثر ٪" hint="من معدله دونه يظهر في «الطلاب المتعثرون»">
              <PercentInput disabled={!canEdit} bp={v.atRiskBp} onChange={(atRiskBp) => setV({ ...v, atRiskBp })} />
            </Field>
            <Field label="تذييل الشهادة الافتراضي">
              <Textarea disabled={!canEdit} rows={2} value={v.reportCardFooter} onChange={(e) => setV({ ...v, reportCardFooter: e.target.value })} />
            </Field>
          </div>
        </div>
      </SettingsCard>
      <p className="text-[12px] text-fg-3">
        لتعديل أوزان المكونات والتقديرات انتقل إلى{" "}
        <Link className="underline" href="/assessment/results/scheme">
          نظام التقييم
        </Link>
        .
      </p>
    </div>
  );
}
