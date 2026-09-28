"use client";
/**
 * تقارير القبول: قمع القبول، مصادر الطلبات، نسبة القبول، ومتوسط زمن المعالجة.
 */
import { Clock, Inbox, Percent, UserCheck } from "lucide-react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { ADMISSION_FLOW, ADMISSION_SOURCES, ADMISSION_STAGE } from "@/lib/students";
import { trpc } from "@/lib/trpc/client";
import { SkeletonLines } from "@/components/ui/skeleton";
import { usePrefs } from "@/components/shell/app-context";
import { ChartCard, HBars } from "@/components/charts/bars";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { ADMISSION_TABS } from "./admissions-home";

export function AdmissionsReports() {
  const prefs = usePrefs();
  const nav = MODULE_NAV.find((m) => m.key === "admissions")!;
  const f = trpc.admissions.funnel.useQuery().data;
  const pct = (n: number) => formatPercent(n, prefs.digits);
  const sourceName = (id: string) => ADMISSION_SOURCES.find((s) => s.id === id)?.name ?? "غير محدد";
  return (
    <ModuleShell nav={nav} tabs={ADMISSION_TABS} wide>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي الطلبات" value={f?.total} icon={<Inbox className="size-4" />} />
        <StatCard label="قُبلوا أو سُجّلوا" value={f ? (f.stageCount.ACCEPTED ?? 0) + (f.stageCount.ENROLLED ?? 0) : undefined} icon={<UserCheck className="size-4" />} tone="success" />
        <StatCard label="نسبة القبول" value={f ? f.acceptanceRate : undefined} format={pct} icon={<Percent className="size-4" />} hint="من الطلبات التي صدر فيها قرار" />
        <StatCard label="متوسط زمن المعالجة" value={f ? (f.avgProcessingDays === null ? null : Math.round(f.avgProcessingDays * 10) / 10) : undefined} format={(n) => `${formatNumber(n, prefs.digits)} يوم`} icon={<Clock className="size-4" />} hint="من التقديم حتى القرار" />
      </section>
      {!f ? (
        <SkeletonLines lines={10} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="قمع القبول"
            subtitle="عدد الطلبات التي بلغت كل مرحلة"
            table={{ columns: ["المرحلة", "الطلبات", "من المستلمة"], rows: f.funnel.map((s) => [s.label, s.count, pct(f.total ? s.count / f.total : 0)]) }}
          >
            <HBars labelWidth={120} data={f.funnel.map((s) => ({ key: s.key, label: s.label, value: s.count, hint: `${pct(f.total ? s.count / f.total : 0)} من الطلبات المستلمة` }))} />
          </ChartCard>
          <ChartCard title="مصادر الطلبات" subtitle="كيف عرف أولياء الأمور بالمدرسة" table={{ columns: ["المصدر", "الطلبات"], rows: f.sources.map((s) => [sourceName(s.source), s.count]) }}>
            <HBars labelWidth={150} data={f.sources.map((s) => ({ key: s.source, label: sourceName(s.source), value: s.count, hint: pct(f.total ? s.count / f.total : 0) }))} />
          </ChartCard>
          <ChartCard
            className="lg:col-span-2"
            title="الطلبات حسب المرحلة الحالية"
            table={{ columns: ["المرحلة", "العدد"], rows: ADMISSION_FLOW.map((k) => [ADMISSION_STAGE[k].label, f.stageCount[k] ?? 0]) }}
          >
            <HBars labelWidth={120} data={ADMISSION_FLOW.map((k) => ({ key: k, label: ADMISSION_STAGE[k].label, value: f.stageCount[k] ?? 0 }))} />
          </ChartCard>
        </div>
      )}
    </ModuleShell>
  );
}
