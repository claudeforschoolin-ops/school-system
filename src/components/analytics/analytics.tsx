"use client";
/**
 * تحليل البيانات: مقارنة المؤشرات بين الأعوام الدراسية (حتى الشهر نفسه للمقارنة العادلة)،
 * اتجاه مؤشر مع العام السابق وتوقع ٣ أشهر، وتوقعا التحصيل والتسجيل مع شرح طريقة الحساب،
 * واستيراد القيم التاريخية من النظام السابق.
 */
import { ArrowDownLeft, ArrowUpLeft, Minus, Upload } from "lucide-react";
import { useState } from "react";
import { deltaTone, monthLabel, type MetricUnit } from "@/lib/analytics/metrics";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { FinTable, num, useMoney } from "@/components/finance/common";
import { ChartCard } from "@/components/charts/bars";
import { LineLegend, Lines } from "@/components/charts/lines";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { navOf } from "./dashboards";

function useMetricFormat() {
  const prefs = usePrefs();
  const money = useMoney();
  return (unit: MetricUnit, v: number | null | undefined, compact = true) => {
    if (v === null || v === undefined) return "—";
    if (unit === "money") return compact ? money.compact(v) : money.whole(v);
    if (unit === "bp") return `${formatNumber(Math.round(v / 10) / 10, prefs.digits)}٪`;
    return formatNumber(v, prefs.digits);
  };
}

function Change({ bp, higherIsBetter }: { bp: number | null; higherIsBetter: boolean }) {
  const prefs = usePrefs();
  if (bp === null) return <span className="text-fg-4">—</span>;
  const tone = deltaTone(bp, higherIsBetter);
  const Icon = Math.abs(bp) < 50 ? Minus : bp > 0 ? ArrowUpLeft : ArrowDownLeft;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tabular", tone === "good" && "text-success-800", tone === "bad" && "text-danger-700", tone === "neutral" && "text-fg-3")}>
      <Icon className="size-3.5" aria-hidden />
      {bp > 0 ? "+" : bp < 0 ? "−" : ""}
      {formatNumber(Math.abs(Math.round(bp / 10) / 10), prefs.digits)}٪
    </span>
  );
}

export function AnalyticsPage() {
  const { can } = useApp();
  const overview = trpc.analytics.overview.useQuery();
  const catalog = trpc.analytics.catalog.useQuery();
  const [metric, setMetric] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fmt = useMetricFormat();
  const key = metric ?? catalog.data?.find((m) => m.key === "collected")?.key ?? catalog.data?.[0]?.key ?? null;
  return (
    <ModuleShell nav={navOf("analytics")} wide actions={can("analytics", "export") || can("settings", "update") ? <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => setImporting(true)}>استيراد بيانات تاريخية</Button> : undefined}>
      {overview.error ? <EmptyState illustration="lock" title="لا يمكن عرض التحليلات" description={overview.error.message} /> : null}
      {overview.error ? null : key ? <TrendSection metricKey={key} catalog={catalog.data ?? []} onChange={setMetric} /> : null}
      {overview.error ? null : <Forecasts />}
      <section className={cn("mt-8", overview.error && "hidden")}>
        <h2 className="text-[16px] font-semibold">المقارنة بين الأعوام الدراسية</h2>
        <p className="mb-3 mt-0.5 text-[13px] text-fg-3">
          {overview.data ? `الأعوام السابقة محسوبة حتى ${monthLabel(overview.data.throughMonth)} من كل عام ليكون المقارنة عادلة؛ المؤشرات التراكمية مجموع، والنسب واللقطات متوسط شهري.` : " "}
        </p>
        {overview.isLoading ? (
          <SkeletonLines lines={8} />
        ) : overview.data ? (
          <FinTable
            head={
              <tr>
                <th>المؤشر</th>
                {overview.data.years.map((y) => (
                  <th key={y} className="text-end">{y === overview.data!.currentYear ? `${y} (حتى الآن)` : y}</th>
                ))}
                <th className="text-end">التغير عن العام الماضي</th>
              </tr>
            }
          >
            {overview.data.metrics.map((m) => (
              <tr key={m.key} className={cn("cursor-pointer", key === m.key && "bg-hover")} onClick={() => setMetric(m.key)}>
                <td>
                  <span className="font-medium">{m.label}</span> <span className="text-[12px] text-fg-3">· {m.group}</span>
                </td>
                {m.years.map((y) => (
                  <td key={y.year} className={num}>{fmt(m.unit, y.value)}</td>
                ))}
                <td className={num}><Change bp={m.change} higherIsBetter={m.higherIsBetter} /></td>
              </tr>
            ))}
          </FinTable>
        ) : null}
      </section>
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </ModuleShell>
  );
}

function TrendSection({ metricKey, catalog, onChange }: { metricKey: string; catalog: Array<{ key: string; label: string; group: string }>; onChange: (k: string) => void }) {
  const q = trpc.analytics.trend.useQuery({ key: metricKey }, { placeholderData: (p) => p });
  const fmt = useMetricFormat();
  const d = q.data;
  const unit = d?.metric.unit ?? "count";
  const labels = d?.months.map((p) => monthLabel(p)) ?? [];
  // التوقع يُلحق بأشهر العام الجاري التي لم تنقضِ
  const forecast = d ? d.months.map((p) => d.forecast.find((f) => f.period === p)?.value ?? null) : [];
  const lastActual = d ? d.thisYear.values.map((v) => v.value).reduce<number>((idx, v, i) => (v !== null ? i : idx), -1) : -1;
  if (d && lastActual >= 0 && forecast.some((v) => v !== null)) forecast[lastActual] = d.thisYear.values[lastActual]!.value;
  const series = d
    ? [
        { key: "this", label: `العام ${d.thisYear.label}`, color: "chart-1" as const, values: d.thisYear.values.map((v) => v.value) },
        { key: "last", label: `العام ${d.lastYear.label}`, color: "chart-2" as const, values: d.lastYear.values.map((v) => v.value) },
        ...(forecast.some((v) => v !== null) ? [{ key: "fc", label: "التوقع", color: "muted" as const, dashed: true, values: forecast }] : []),
      ]
    : [];
  const imported = d ? [...d.thisYear.values, ...d.lastYear.values].some((v) => v.source === "IMPORTED") : false;
  return (
    <section className={cn("transition-opacity", q.isFetching && !q.isLoading && "opacity-60")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select className="w-64" value={metricKey} onChange={onChange} options={catalog.map((m) => ({ value: m.key, label: `${m.group} — ${m.label}` }))} />
        {imported ? <Tag color="gold">يشمل قيماً مستوردة من النظام السابق</Tag> : null}
      </div>
      {q.error ? <EmptyState compact illustration="lock" title="المؤشر غير متاح" description={q.error.message} /> : null}
      {d ? (
        <ChartCard
          title={`${d.metric.label}: العام الجاري مقابل الماضي`}
          subtitle={`التوقع: ${d.method}`}
          table={{ columns: ["الشهر", `العام ${d.thisYear.label}`, `العام ${d.lastYear.label}`, "التوقع"], rows: d.months.map((p, i) => [monthLabel(p, true), fmt(unit, d.thisYear.values[i]?.value ?? null, false), fmt(unit, d.lastYear.values[i]?.value ?? null, false), d.forecast.find((f) => f.period === p) ? fmt(unit, d.forecast.find((f) => f.period === p)!.value, false) : "—"]) }}
        >
          <LineLegend series={series} />
          <Lines labels={labels} series={series} format={(v) => fmt(unit, v)} />
        </ChartCard>
      ) : q.isLoading ? (
        <SkeletonLines lines={6} />
      ) : null}
    </section>
  );
}

function Forecasts() {
  const q = trpc.analytics.forecasts.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const pct = (bp: number) => `${formatNumber(Math.round(bp / 10) / 10, prefs.digits)}٪`;
  if (!q.data || (!q.data.collection && !q.data.enrollment)) return null;
  const { collection, enrollment } = q.data;
  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-2">
      {collection ? (
        <div className="rounded-lg bg-card p-4 shadow-card">
          <h3 className="text-[14px] font-semibold">توقع التحصيل لبقية العام</h3>
          <p className="mt-0.5 text-[12px] text-fg-3">المستحق غير المسدد × كفاءة التحصيل {collection.efficiencyBp !== null ? `(${pct(collection.efficiencyBp)})` : ""} — {collection.basis}</p>
          <p className="mt-3 text-[28px] font-bold">{money.compact(collection.totalExpectedMinor)}</p>
          <p className="text-[12px] text-fg-3">متوقع تحصيله من أصل {money.whole(collection.totalDueMinor)} مستحق حتى نهاية العام</p>
          {collection.months.length ? (
            <FinTable dense className="mt-3" head={<tr><th>الشهر</th><th className="text-end">المستحق</th><th className="text-end">المتوقع</th><th className="text-end">النطاق</th></tr>}>
              {collection.months.map((m) => (
                <tr key={m.period}>
                  <td>{monthLabel(m.period, true)}</td>
                  <td className={num}>{money.whole(m.dueMinor)}</td>
                  <td className={num}>{money.whole(m.expectedMinor)}</td>
                  <td className={cn(num, "text-fg-3")}>{money.compact(m.lowMinor)} – {money.compact(m.highMinor)}</td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <p className="mt-3 text-[13px] text-fg-3">لا أقساط مستحقة متبقية لهذا العام.</p>
          )}
        </div>
      ) : null}
      {enrollment ? (
        <div className="rounded-lg bg-card p-4 shadow-card">
          <h3 className="text-[14px] font-semibold">توقع التسجيل للعام {enrollment.nextYear}</h3>
          <p className="mt-0.5 text-[12px] text-fg-3">{enrollment.basis}</p>
          <p className="mt-3 text-[28px] font-bold">{formatNumber(enrollment.total, prefs.digits)} طالباً</p>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <Row label="المنتظمون حالياً" value={formatNumber(enrollment.currentActive, prefs.digits)} />
            <Row label="يتخرجون من الصف الأخير" value={`− ${formatNumber(enrollment.finalGradeCount, prefs.digits)}`} />
            <Row label="نسبة الاستبقاء" value={pct(enrollment.retentionBp)} />
            <Row label="المستمرون المتوقعون" value={formatNumber(enrollment.continuing, prefs.digits)} strong />
            <Row label="مقبولون لم يُسجَّلوا بعد" value={formatNumber(enrollment.acceptedPending, prefs.digits)} />
            <Row label={`طلبات مفتوحة × تحويل ${pct(enrollment.conversionBp)}`} value={formatNumber(enrollment.openApplications, prefs.digits)} />
            <Row label="الملتحقون الجدد المتوقعون" value={formatNumber(enrollment.fromPipeline, prefs.digits)} strong />
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-line pt-1.5 font-semibold")}>
      <dt className={strong ? "" : "text-fg-3"}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const catalog = trpc.analytics.catalog.useQuery();
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t;]/).map((x) => x.trim()))
    .filter((c) => c.length >= 3 && /^\d{4}-\d{2}$/.test(c[1] ?? ""))
    .map(([metric, period, value]) => ({ metric: metric!, period: period!, value: Math.round(Number(value)) }))
    .filter((r) => Number.isFinite(r.value));
  const m = trpc.analytics.importSnapshots.useMutation({ onSuccess: (r) => (toast.success(`استُورد ${r.imported} قيمة${r.skipped ? ` وتُجوهل ${r.skipped}` : ""}`), void utils.analytics.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="استيراد بيانات تاريخية" description="قيم شهرية من النظام السابق للأشهر التي سبقت التشغيل. لا تطغى على ما يحسبه النظام من بياناته." width={620}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="القيم (سطر لكل قيمة: المؤشر، الشهر، القيمة)" hint="المبالغ بأصغر وحدة (هللة)، والنسب بنقاط الأساس (٩٤٫٥٪ = 9450)">
            <Textarea dir="ltr" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"students_active,2025-09,286\ncollected,2025-09,184500000\nattendance_rate,2025-09,9450"} className="font-mono text-[12px]" />
          </Field>
          <details className="text-[12px] text-fg-3">
            <summary className="cursor-pointer">مفاتيح المؤشرات</summary>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {(catalog.data ?? []).map((c) => (
                <li key={c.key}><code dir="ltr">{c.key}</code> — {c.label}</li>
              ))}
            </ul>
          </details>
          <p className="text-[12px] text-fg-3">سطور صالحة: {rows.length}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!rows.length} onClick={() => m.mutate({ rows })}>استيراد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
