"use client";
/**
 * إحصاءات التحصيل: توزيع المعدلات والتقديرات، مقارنة الفصول والمواد والمعلمين،
 * الطلاب المتعثرون والمتفوقون. تحليل كل بند متاح من قائمة البند في كشف الرصد.
 */
import { AlertTriangle, Award, CircleCheck, Gauge, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Columns } from "@/components/charts/columns";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { assessmentNav, RESULT_STATUS, scoreTone, TermPicker, useScore, useTermParam } from "./common";

export function StatsPage() {
  const { termId, terms, setTerm } = useTermParam();
  const score = useScore();
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const q = trpc.assessment.results.stats.useQuery({ termId: termId ?? "", gradeId, branchId }, { enabled: Boolean(termId) });
  const d = q.data;
  const pct = (bp: number) => score.pct(bp, 0);
  return (
    <ModuleShell
      nav={assessmentNav("assessment-stats")}
      wide
      actions={
        <>
          {d ? <Select size="sm" className="w-[160px]" value={gradeId ?? "ALL"} onChange={(v) => setGradeId(v === "ALL" ? null : v)} options={[{ value: "ALL", label: "كل الصفوف" }, ...d.filters.grades.map((g) => ({ value: g.id, label: g.name }))]} /> : null}
          {d && d.filters.branches.length > 1 ? <Select size="sm" className="w-[150px]" value={branchId ?? "ALL"} onChange={(v) => setBranchId(v === "ALL" ? null : v)} options={[{ value: "ALL", label: "كل الفروع" }, ...d.filters.branches.map((b) => ({ value: b.id, label: b.name }))]} /> : null}
          <TermPicker value={termId} terms={terms} onChange={setTerm} />
        </>
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإحصاءات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={14} />
      ) : !d.summary.students ? (
        <EmptyState illustration="table" title="لا بيانات للفترة المختارة" />
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="الطلاب" value={d.summary.students} icon={<Users className="size-4" />} />
            <StatCard label="المتوسط العام" value={d.summary.averageBp} format={(v) => score.pct(v)} icon={<Gauge className="size-4" />} />
            <StatCard label="ناجحون" value={d.summary.pass} tone="success" icon={<CircleCheck className="size-4" />} hint={`${formatNumber(d.summary.secondRound, score.digits)} دور ثانٍ · ${formatNumber(d.summary.fail, score.digits)} راسب`} />
            <StatCard label="متعثرون" value={d.atRisk.length} tone={d.atRisk.length ? "warning" : undefined} icon={<AlertTriangle className="size-4" />} hint={`معدل دون ${pct(d.summary.atRiskBp)} أو رسوب في مادة`} />
            <StatCard label="بنود غير معتمدة" value={d.summary.pendingApproval} tone={d.summary.pendingApproval ? "warning" : undefined} icon={<Award className="size-4" />} hint="النتائج أولية حتى الاعتماد" href="/assessment/grades" />
          </section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="توزيع التقديرات" subtitle="حسب معدل الطالب" table={{ columns: ["التقدير", "الطلاب"], rows: d.distribution.map((b) => [b.label, b.count]) }}>
              <HBars data={d.distribution.map((b) => ({ key: b.label, label: `${b.label} (${b.letter})`, value: b.count }))} labelWidth={120} />
            </ChartCard>
            <ChartCard title="المدرج التكراري للمعدلات" subtitle="عدد الطلاب في كل شريحة ١٠٪" table={{ columns: ["الشريحة", "الطلاب"], rows: d.histogram.map((h) => [`${h.from}–${h.to}٪`, h.count]) }}>
              <Columns data={d.histogram.map((h) => ({ key: String(h.from), label: formatNumber(h.from, score.digits), value: h.count, hint: `${formatNumber(h.from, score.digits)}–${formatNumber(h.to, score.digits)}٪` }))} />
            </ChartCard>
            <ChartCard title="مقارنة الفصول" subtitle="متوسط المعدل" table={{ columns: ["الفصل", "الطلاب", "المتوسط", "نسبة النجاح"], rows: d.bySection.map((s) => [s.name, s.students, s.averageBp === null ? "—" : pct(s.averageBp), pct(s.passRateBp)]) }}>
              <HBars data={d.bySection.map((s) => ({ key: s.id, label: s.name, value: s.averageBp ?? 0, hint: `نسبة النجاح ${pct(s.passRateBp)}` }))} format={pct} max={10000} labelWidth={150} />
            </ChartCard>
            <ChartCard title="مقارنة المواد" subtitle="متوسط درجة المادة" table={{ columns: ["المادة", "المتوسط", "نسبة النجاح", "دون النجاح"], rows: d.bySubject.map((s) => [s.name, s.averageBp === null ? "—" : pct(s.averageBp), pct(s.passRateBp), s.fail]) }}>
              <HBars data={d.bySubject.map((s) => ({ key: s.id, label: s.name, value: s.averageBp ?? 0, hint: `${formatNumber(s.fail, score.digits)} دون النجاح` }))} format={pct} max={10000} labelWidth={130} color="chart-2" />
            </ChartCard>
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-[15px] font-semibold">مقارنة المعلمين</h2>
            <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
              <table className="w-full min-w-[560px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
                <thead>
                  <tr>
                    <th>المعلم</th>
                    <th>المواد</th>
                    <th>الكشوف</th>
                    <th>درجات الطلاب</th>
                    <th>المتوسط</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byTeacher.map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium">{t.name}</td>
                      <td className="text-fg-2">{t.subjects.join("، ")}</td>
                      <td className="tabular">{formatNumber(t.sheets, score.digits)}</td>
                      <td className="tabular">{formatNumber(t.students, score.digits)}</td>
                      <td className={cn("font-semibold tabular", scoreTone(t.averageBp))}>{score.pct(t.averageBp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-fg-3">المقارنة للاسترشاد: تتأثر بمستوى الفصول وصعوبة المادة. تحليل كل بند (السهولة والتمييز) من قائمة البند في كشف الرصد.</p>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <AlertTriangle className="size-4 text-warning-700" /> الطلاب المتعثرون ({formatNumber(d.atRisk.length, score.digits)})
              </h2>
              {!d.atRisk.length ? (
                <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا طلاب متعثرون وفق الحد المحدد.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
                  <table className="w-full min-w-[560px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
                    <thead>
                      <tr>
                        <th>الطالب</th>
                        <th>الفصل</th>
                        <th>المعدل</th>
                        <th>مواد دون النجاح</th>
                        <th>النتيجة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.atRisk.map((s) => (
                        <tr key={s.id}>
                          <td className="font-medium">
                            <Link href={`/students/${s.id}`} className="hover:underline">
                              {s.name}
                            </Link>
                          </td>
                          <td className="text-fg-2">{s.section}</td>
                          <td className={cn("tabular", scoreTone(s.averageBp))}>{score.pct(s.averageBp)}</td>
                          <td className="text-danger-700">{s.failed.join("، ") || "—"}</td>
                          <td>
                            <Tag color={RESULT_STATUS[s.result]!.color}>{RESULT_STATUS[s.result]!.label}</Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <Award className="size-4 text-fg-3" /> المتفوقون
              </h2>
              <ol className="rounded-lg bg-card shadow-card">
                {d.top.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-2 text-[13px] last:border-0">
                    <span className="grid size-6 place-items-center rounded-full bg-hover text-[12px] font-semibold tabular">{formatNumber(i + 1, score.digits)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="text-[12px] text-fg-3">{s.section}</span>
                    </span>
                    <span className="font-semibold tabular">{score.pct(s.averageBp)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </ModuleShell>
  );
}
