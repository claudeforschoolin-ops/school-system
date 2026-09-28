"use client";
/**
 * تقارير الطلاب: توزيع حسب الصف والجنس، الحالات، الجنسيات، وسائل الوصول، اكتمال المستندات، وإشغال الفصول.
 */
import { FileCheck, LayoutGrid, UserCheck, Users } from "lucide-react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { NATIONALITIES, STUDENT_STATUS, TRANSPORT_MODES } from "@/lib/students";
import { trpc } from "@/lib/trpc/client";
import { SkeletonLines } from "@/components/ui/skeleton";
import { usePrefs } from "@/components/shell/app-context";
import { ChartCard, HBars, StackedHBars } from "@/components/charts/bars";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { STUDENT_TABS } from "./students-home";

export function StudentsReports() {
  const prefs = usePrefs();
  const nav = MODULE_NAV.find((m) => m.key === "students")!;
  const r = trpc.students.report.useQuery().data;
  const pct = (n: number) => formatPercent(n, prefs.digits);
  const docAvg = r?.documents.length ? r.documents.reduce((a, d) => a + d.share, 0) / r.documents.length : null;
  const males = r?.byGrade.reduce((a, g) => a + g.male, 0) ?? 0;
  const females = r?.byGrade.reduce((a, g) => a + g.female, 0) ?? 0;
  return (
    <ModuleShell nav={nav} tabs={STUDENT_TABS} wide>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="طلاب منتظمون" value={r?.activeCount} icon={<UserCheck className="size-4" />} />
        <StatCard label="بنين / بنات" value={r ? males : undefined} icon={<Users className="size-4" />} hint={r ? `بنات: ${formatNumber(females, prefs.digits)}` : undefined} />
        <StatCard label="إشغال الفصول" value={r ? r.occupancy.rate : undefined} format={pct} icon={<LayoutGrid className="size-4" />} hint={r ? `${formatNumber(r.occupancy.placed, prefs.digits)} مقعداً مشغولاً من ${formatNumber(r.occupancy.capacity, prefs.digits)}` : undefined} />
        <StatCard label="اكتمال المستندات" value={r ? docAvg : undefined} format={pct} icon={<FileCheck className="size-4" />} tone={docAvg !== null && docAvg < 0.9 ? "warning" : undefined} />
      </section>
      {!r ? (
        <SkeletonLines lines={10} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title="الطلاب المنتظمون حسب الصف"
            subtitle="بنين وبنات في كل صف"
            legend={[{ key: "male", label: "بنين", color: "chart-1" }, { key: "female", label: "بنات", color: "chart-2" }]}
            table={{ columns: ["الصف", "المرحلة", "بنين", "بنات", "المجموع"], rows: r.byGrade.map((g) => [g.name, g.stage, g.male, g.female, g.male + g.female]) }}
          >
            <StackedHBars
              labelWidth={170}
              rows={r.byGrade.map((g) => ({ key: g.id, label: g.name, values: { male: g.male, female: g.female } }))}
              series={[{ key: "male", label: "بنين", color: "chart-1" }, { key: "female", label: "بنات", color: "chart-2" }]}
            />
          </ChartCard>
          <ChartCard title="اكتمال المستندات المطلوبة" subtitle="نسبة الطلاب الذين رُفع لهم كل مستند" table={{ columns: ["المستند", "عدد الطلاب", "النسبة"], rows: r.documents.map((d) => [d.label, d.count, pct(d.share)]) }}>
            <HBars data={r.documents.map((d) => ({ key: d.type, label: d.label, value: d.share, hint: `${d.count} طالباً` }))} format={pct} max={1} />
          </ChartCard>
          <ChartCard title="حالات الطلاب" table={{ columns: ["الحالة", "العدد"], rows: r.byStatus.map((s) => [STUDENT_STATUS[s.status as keyof typeof STUDENT_STATUS].label, s.count]) }}>
            <HBars data={r.byStatus.sort((a, b) => b.count - a.count).map((s) => ({ key: s.status, label: STUDENT_STATUS[s.status as keyof typeof STUDENT_STATUS].label, value: s.count }))} />
          </ChartCard>
          <ChartCard title="الجنسيات" table={{ columns: ["الجنسية", "العدد"], rows: r.byNationality.map((n) => [NATIONALITIES.find((x) => x.id === n.nationality)?.name ?? n.nationality, n.count]) }}>
            <HBars data={r.byNationality.map((n) => ({ key: n.nationality, label: NATIONALITIES.find((x) => x.id === n.nationality)?.name ?? n.nationality, value: n.count }))} />
          </ChartCard>
          <ChartCard title="وسيلة الوصول إلى المدرسة" table={{ columns: ["الوسيلة", "العدد"], rows: r.byTransport.map((t) => [TRANSPORT_MODES.find((x) => x.id === t.mode)?.name ?? "غير محدد", t.count]) }}>
            <HBars data={r.byTransport.map((t) => ({ key: t.mode, label: TRANSPORT_MODES.find((x) => x.id === t.mode)?.name ?? "غير محدد", value: t.count }))} />
          </ChartCard>
        </div>
      )}
    </ModuleShell>
  );
}
