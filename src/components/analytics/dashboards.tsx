"use client";
/**
 * لوحات التحكم: تبويب لكل لوحة يتيحها الدور، ومحدّد الفرع في صف واحد أعلى كل المحتوى.
 * أثناء إعادة التحميل تبقى اللوحة السابقة ظاهرة بشفافية أقل (لا وميض ولا قفز).
 */
import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { L } from "@/lib/analytics/labels";
import { monthLabel } from "@/lib/analytics/metrics";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { usePrefs } from "@/components/shell/app-context";
import { useMoney } from "@/components/finance/common";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Columns } from "@/components/charts/columns";
import { LineLegend, Lines } from "@/components/charts/lines";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { KpiGrid } from "./kpi";

export const navOf = (key: string) => MODULE_NAV.find((m) => m.key === key)!;

function usePct() {
  const prefs = usePrefs();
  return (bp: number) => `${formatNumber(Math.round(bp / 10) / 10, prefs.digits)}٪`;
}

function useDay() {
  const prefs = usePrefs();
  return (iso: string) => new Intl.DateTimeFormat(prefs.digits === "arab" ? "ar-SA-u-nu-arab-ca-gregory" : "ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function DashboardsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const meta = trpc.dashboards.tabs.useQuery();
  const tab = params.get("tab") ?? "principal";
  const branchId = params.get("branch") ?? "";
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(params.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    router.replace(`/dashboards?${q.toString()}`);
  };
  const tabs = meta.data?.tabs ?? [];
  const active = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? "principal");
  return (
    <ModuleShell nav={navOf("dashboards")} wide>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {tabs.length > 1 ? <Segmented value={active} onChange={(v) => set("tab", v)} options={tabs.map((t) => ({ value: t.key, label: t.label }))} /> : null}
        {meta.data && meta.data.branches.length > 1 ? (
          <Select size="sm" className="w-48" value={branchId || "ALL"} onChange={(v) => set("branch", v === "ALL" ? "" : v)} options={[...(meta.data.allBranches ? [{ value: "ALL", label: "كل الفروع" }] : []), ...meta.data.branches.map((b) => ({ value: b.id, label: b.name }))]} />
        ) : null}
      </div>
      {meta.data && !tabs.length ? <EmptyState illustration="lock" title="لا لوحات متاحة" description="لوحات التحكم تتطلب صلاحية «لوحات التحكم» ووحدات بياناتها." /> : null}
      {!tabs.length ? null : active === "principal" ? <PrincipalBoard branchId={branchId || null} /> : null}
      {active === "finance" ? <FinanceBoard branchId={branchId || null} /> : null}
      {active === "academic" ? <AcademicBoard branchId={branchId || null} /> : null}
      {active === "hr" ? <HrBoard branchId={branchId || null} /> : null}
      {active === "operations" ? <OperationsBoard branchId={branchId || null} /> : null}
    </ModuleShell>
  );
}

function Frame({ fetching, children }: { fetching: boolean; children: React.ReactNode }) {
  return <div className={cn("space-y-5 transition-opacity duration-200", fetching && "opacity-60")}>{children}</div>;
}

function ErrorBox({ message }: { message: string }) {
  return <EmptyState illustration="lock" title="تعذر عرض اللوحة" description={message} />;
}

// ---------------------------------------------------------------------

function PrincipalBoard({ branchId }: { branchId: string | null }) {
  const q = trpc.dashboards.principal.useQuery({ branchId }, { placeholderData: (p) => p });
  const pct = usePct();
  const day = useDay();
  const prefs = usePrefs();
  if (q.error) return <ErrorBox message={q.error.message} />;
  const d = q.data;
  return (
    <Frame fetching={q.isFetching && !q.isLoading}>
      <KpiGrid kpis={d?.kpis} loading={q.isLoading} />
      {d ? (
        <>
          {d.alerts && (d.alerts as Alert[]).length ? <Alerts items={d.alerts as Alert[]} /> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {d.attendanceDays ? (
              <ChartCard title="نسبة الحضور اليومية" subtitle="آخر ١٤ يوماً دراسياً" table={{ columns: ["اليوم", "النسبة", "غائب", "متأخر"], rows: (d.attendanceDays as AttDay[]).map((x) => [day(x.date), pct(x.rateBp), x.absent, x.late]) }}>
                <Columns data={(d.attendanceDays as AttDay[]).map((x) => ({ key: x.date, label: day(x.date), value: x.rateBp, hint: `${formatNumber(x.absent, prefs.digits)} غائب` }))} format={pct} />
              </ChartCard>
            ) : null}
            {d.byGrade ? (
              <ChartCard title="الطلاب المنتظمون حسب الصف" table={{ columns: ["الصف", "الطلاب"], rows: (d.byGrade as Bar[]).map((g) => [g.label, g.value]) }}>
                <HBars data={d.byGrade as Bar[]} labelWidth={150} />
              </ChartCard>
            ) : null}
            {d.academic ? <AcademicMini a={d.academic as AcademicSummary} /> : null}
            {d.repeatedAbsence ? (
              <section className="rounded-lg bg-card p-4 shadow-card">
                <h3 className="text-[14px] font-semibold">غياب متكرر</h3>
                <p className="mt-0.5 text-[12px] text-fg-3">غابوا ٣ أيام أو أكثر من آخر ٥ أيام دراسية</p>
                {(d.repeatedAbsence as Absent[]).length ? (
                  <ul className="mt-3 divide-y divide-line">
                    {(d.repeatedAbsence as Absent[]).map((s) => (
                      <li key={s.id} className="flex items-center justify-between py-2 text-[13px]">
                        <Link href={`/students/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="text-fg-3">
                          {s.grade} · <b className="tabular text-danger-700">{formatNumber(s.days, prefs.digits)}</b> أيام
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 text-center text-[13px] text-fg-3">لا غياب متكرر في آخر ٥ أيام دراسية</p>
                )}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </Frame>
  );
}

type Bar = { key: string; label: string; value: number };
type AttDay = { date: string; rateBp: number; absent: number; late: number };
type Absent = { id: string; name: string; grade: string; days: number };
type Alert = { key: string; tone: "danger" | "warning" | "info"; title: string; detail: string; href: string };
type AcademicSummary = { term: string; averageBp: number | null; atRisk: number; byGrade: Bar[]; subjects: Bar[]; results: Record<string, number>; graded: number };

function Alerts({ items }: { items: Alert[] }) {
  return (
    <section aria-label="تنبيهات تحتاج إجراء" className="grid gap-2 md:grid-cols-2">
      {items.map((a) => {
        const Icon = a.tone === "danger" ? CircleAlert : a.tone === "warning" ? AlertTriangle : Info;
        return (
          <Link key={a.key} href={a.href} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-hover", a.tone === "danger" ? "border-danger-700/30" : "border-line")}>
            <Icon className={cn("mt-0.5 size-4 shrink-0", a.tone === "danger" ? "text-danger-700" : a.tone === "warning" ? "text-warning-700" : "text-fg-3")} aria-hidden />
            <span>
              <span className="block text-[14px] font-medium">{a.title}</span>
              <span className="block text-[12px] text-fg-3">{a.detail}</span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function AcademicMini({ a }: { a: AcademicSummary }) {
  const pct = usePct();
  return (
    <ChartCard title="متوسط التحصيل حسب الصف" subtitle={`${a.term} — من الدرجات المعتمدة`} table={{ columns: ["الصف", "المتوسط"], rows: a.byGrade.map((g) => [g.label, pct(g.value)]) }}>
      {a.byGrade.length ? <HBars data={a.byGrade} format={pct} max={10000} labelWidth={150} /> : <p className="py-6 text-center text-[13px] text-fg-3">لا درجات معتمدة بعد لهذا الفصل الدراسي</p>}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------

function FinanceBoard({ branchId }: { branchId: string | null }) {
  const q = trpc.dashboards.finance.useQuery({ branchId }, { placeholderData: (p) => p });
  const money = useMoney();
  if (q.error) return <ErrorBox message={q.error.message} />;
  const d = q.data;
  const labels = d?.trend.months.map((m) => monthLabel(m)) ?? [];
  return (
    <Frame fetching={q.isFetching && !q.isLoading}>
      <KpiGrid kpis={d?.kpis} loading={q.isLoading} />
      {d ? (
        <>
          <ChartCard
            title="الإيرادات والمصروفات"
            subtitle="آخر ١٢ شهراً من دفتر اليومية — على مستوى المدرسة"
            table={{ columns: ["الشهر", "الإيرادات", "المصروفات", "المصدر"], rows: d.trend.months.map((m, i) => [monthLabel(m, true), money.whole(d.trend.revenue[i] ?? 0), money.whole(d.trend.expenses[i] ?? 0), d.trend.sources[i] === "IMPORTED" ? "مستورد" : d.trend.sources[i] === "NONE" ? "—" : "من النظام"]) }}
          >
            <LineLegend series={[{ key: "r", label: "الإيرادات", color: "chart-1" }, { key: "e", label: "المصروفات", color: "chart-2" }]} />
            <Lines labels={labels} series={[{ key: "r", label: "الإيرادات", color: "chart-1", values: d.trend.revenue }, { key: "e", label: "المصروفات", color: "chart-2", values: d.trend.expenses }]} format={money.compact} />
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="أعمار الذمم المدينة" subtitle="المتبقي من الأقساط حسب أيام التأخر" table={{ columns: ["الفئة", "المبلغ"], rows: d.aging.map((a) => [a.label, money.whole(a.value)]) }}>
              <HBars data={d.aging} format={money.compact} labelWidth={130} />
            </ChartCard>
            <ChartCard title="التحصيل حسب طريقة الدفع" subtitle="هذا الشهر" table={{ columns: ["الطريقة", "المبلغ"], rows: d.methods.map((m) => [L.paymentMethod[m.key as keyof typeof L.paymentMethod] ?? m.key, money.whole(m.value)]) }}>
              {d.methods.length ? <HBars data={d.methods.map((m) => ({ key: m.key, label: L.paymentMethod[m.key as keyof typeof L.paymentMethod] ?? m.key, value: m.value }))} format={money.compact} labelWidth={150} /> : <p className="py-6 text-center text-[13px] text-fg-3">لا تحصيل هذا الشهر بعد</p>}
            </ChartCard>
          </div>
        </>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------------

function AcademicBoard({ branchId }: { branchId: string | null }) {
  const q = trpc.dashboards.academic.useQuery({ branchId }, { placeholderData: (p) => p });
  const pct = usePct();
  if (q.error) return <ErrorBox message={q.error.message} />;
  const d = q.data;
  const s = d?.summary;
  const order = ["PASS", "SECOND_ROUND", "FAIL", "INCOMPLETE"] as const;
  return (
    <Frame fetching={q.isFetching && !q.isLoading}>
      <KpiGrid kpis={d?.kpis} loading={q.isLoading} />
      {d ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {s ? <AcademicMini a={s} /> : null}
          {s ? (
            <ChartCard title="أضعف المواد" subtitle="متوسط المادة على مستوى المدرسة (٥ طلاب رصد على الأقل)" table={{ columns: ["المادة", "المتوسط"], rows: s.subjects.map((x) => [x.label, pct(x.value)]) }}>
              {s.subjects.length ? <HBars data={s.subjects.slice(0, 6)} format={pct} max={10000} labelWidth={150} /> : <p className="py-6 text-center text-[13px] text-fg-3">لا درجات معتمدة كافية</p>}
            </ChartCard>
          ) : null}
          {s ? (
            <ChartCard title="توزيع النتائج" subtitle={s.term} table={{ columns: ["النتيجة", "الطلاب"], rows: order.map((k) => [L.termResult[k], s.results[k] ?? 0]) }}>
              <HBars data={order.map((k) => ({ key: k, label: L.termResult[k], value: s.results[k] ?? 0 }))} labelWidth={110} />
            </ChartCard>
          ) : null}
          {d.attendanceByGrade.length ? (
            <ChartCard title="الحضور حسب الصف" subtitle="هذا الشهر" table={{ columns: ["الصف", "النسبة"], rows: d.attendanceByGrade.map((g) => [g.label, pct(g.value)]) }}>
              <HBars data={d.attendanceByGrade} format={pct} max={10000} labelWidth={150} />
            </ChartCard>
          ) : null}
        </div>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------------

function HrBoard({ branchId }: { branchId: string | null }) {
  const q = trpc.dashboards.hr.useQuery({ branchId }, { placeholderData: (p) => p });
  const pct = usePct();
  const day = useDay();
  if (q.error) return <ErrorBox message={q.error.message} />;
  const d = q.data;
  return (
    <Frame fetching={q.isFetching && !q.isLoading}>
      <KpiGrid kpis={d?.kpis} loading={q.isLoading} />
      {d ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="الموظفون حسب القسم" table={{ columns: ["القسم", "الموظفون"], rows: d.byDepartment.map((x) => [x.label, x.value]) }}>
            <HBars data={d.byDepartment} labelWidth={160} />
          </ChartCard>
          {d.attendance14.length ? (
            <ChartCard title="حضور الموظفين اليومي" subtitle="آخر ١٤ يوم عمل" table={{ columns: ["اليوم", "النسبة"], rows: d.attendance14.map((x) => [day(x.date), pct(x.rateBp)]) }}>
              <Columns data={d.attendance14.map((x) => ({ key: x.date, label: day(x.date), value: x.rateBp }))} format={pct} />
            </ChartCard>
          ) : null}
          <ChartCard title="الموظفون حسب الفئة" table={{ columns: ["الفئة", "الموظفون"], rows: d.byCategory.map((x) => [L.employeeCategory[x.key as keyof typeof L.employeeCategory] ?? x.key, x.value]) }}>
            <HBars data={d.byCategory.map((x) => ({ key: x.key, label: L.employeeCategory[x.key as keyof typeof L.employeeCategory] ?? x.key, value: x.value }))} labelWidth={120} />
          </ChartCard>
        </div>
      ) : null}
    </Frame>
  );
}

function OperationsBoard({ branchId }: { branchId: string | null }) {
  const q = trpc.dashboards.operations.useQuery({ branchId }, { placeholderData: (p) => p });
  const d = q.data;
  const data = useMemo(() => (d?.maintenanceByCategory ?? []).map((m) => ({ key: m.key, label: L.maintCategory[m.key as keyof typeof L.maintCategory] ?? m.key, value: m.value })), [d]);
  if (q.error) return <ErrorBox message={q.error.message} />;
  return (
    <Frame fetching={q.isFetching && !q.isLoading}>
      <KpiGrid kpis={d?.kpis} loading={q.isLoading} />
      {d && data.length ? (
        <ChartCard title="بلاغات الصيانة حسب التصنيف" subtitle="آخر ٩٠ يوماً" table={{ columns: ["التصنيف", "البلاغات"], rows: data.map((x) => [x.label, x.value]) }}>
          <HBars data={data} labelWidth={110} />
        </ChartCard>
      ) : null}
    </Frame>
  );
}
