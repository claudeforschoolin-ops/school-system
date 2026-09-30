"use client";
/**
 * منشئ التقارير: قائمة التقارير المحفوظة والقوالب الجاهزة، والمنشئ بالسحب والإفلات
 * (الحقول ← الأعمدة، التصفية، التجميع والتجميعات، الفرز، الرسم)، مع الحفظ والمشاركة
 * والتصدير (Excel/CSV) والطباعة/PDF بترويسة المدرسة والإرسال المجدول.
 */
import { DndContext, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, Download, FileSpreadsheet, GripVertical, Pin, Plus, Printer, Save, Search, Send, Share2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { AGG_LABEL, aggKey, type AggFn, type FieldDef, type ReportConfig } from "@/lib/analytics/query";
import { describeSchedule, FREQUENCY_LABEL, WEEKDAY_LABEL, type ReportSchedule } from "@/lib/analytics/schedule";
import { REPORT_TEMPLATES } from "@/lib/analytics/templates";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { FinTable, num, useFmtDate } from "@/components/finance/common";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Columns } from "@/components/charts/columns";
import { Lines } from "@/components/charts/lines";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { FilterEditor, isNumeric, useCellFormat } from "./common";
import { navOf } from "./dashboards";

type Dataset = RouterOutputs["reports"]["datasets"][number];
const EMPTY: ReportConfig = { columns: [], filters: [], groupBy: null, aggregates: [], sort: null, limit: null, chart: null };

async function downloadExport(body: Record<string, unknown>) {
  const res = await fetch("/api/reports/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text()) || "تعذر التصدير");
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "report");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================================
// قائمة التقارير
// =====================================================================

export function ReportsPage() {
  const list = trpc.reports.list.useQuery();
  const datasets = trpc.reports.datasets.useQuery();
  const fmtDate = useFmtDate();
  const available = new Set((datasets.data ?? []).map((d) => d.key));
  const templates = REPORT_TEMPLATES.filter((t) => available.has(t.dataset));
  const groups = useMemo(() => {
    const m = new Map<string, Dataset[]>();
    for (const d of datasets.data ?? []) m.set(d.group, [...(m.get(d.group) ?? []), d]);
    return [...m.entries()];
  }, [datasets.data]);
  return (
    <ModuleShell nav={navOf("reports")} wide actions={datasets.data?.length ? <Link href="/reports/new"><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />}>تقرير جديد</Button></Link> : undefined}>
      {list.error ? <EmptyState illustration="lock" title="لا يمكن عرض التقارير" description={list.error.message} /> : null}
      <section className="mb-8">
        <h2 className="mb-3 text-[16px] font-semibold">التقارير المحفوظة</h2>
        {list.isLoading ? (
          <SkeletonLines lines={4} />
        ) : list.data?.length ? (
          <FinTable head={<tr><th>التقرير</th><th>البيانات</th><th>المالك</th><th>المشاركة</th><th>الإرسال المجدول</th><th>آخر تعديل</th></tr>}>
            {list.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/reports/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                    {r.isPinned ? <Pin className="size-3.5 text-fg-3" aria-label="مثبت" /> : null}
                    {r.name}
                  </Link>
                  {r.description ? <p className="text-[12px] text-fg-3">{r.description}</p> : null}
                  {!r.accessible ? <p className="text-[12px] text-danger-700">لا تملك صلاحية بيانات هذا التقرير</p> : null}
                </td>
                <td><span className="flex items-center gap-1.5 text-fg-2"><PageIcon icon={r.icon} size={14} className="text-fg-3" />{r.datasetLabel}</span></td>
                <td>{r.owner ? <span className="flex items-center gap-1.5"><Avatar name={r.owner.name} color={r.owner.avatarColor} size={20} />{r.mine ? "أنا" : r.owner.name}</span> : "—"}</td>
                <td><Tag color={r.visibility === "PRIVATE" ? "gray" : r.visibility === "ALL" ? "green" : "navy"}>{r.visibility === "PRIVATE" ? "خاص" : r.visibility === "ALL" ? "الجميع" : "أدوار محددة"}</Tag></td>
                <td className="text-fg-2">{r.scheduleText ?? <span className="text-fg-4">—</span>}</td>
                <td className="whitespace-nowrap text-fg-3">{fmtDate(r.updatedAt)}</td>
              </tr>
            ))}
          </FinTable>
        ) : (
          <EmptyState compact illustration="table" title="لا تقارير محفوظة بعد" description="ابدأ من قالب جاهز أدناه أو من مجموعة بيانات، ثم احفظ التقرير لتعود إليه وتشاركه وتجدول إرساله." />
        )}
      </section>
      {templates.length ? (
        <section className="mb-8">
          <h2 className="mb-3 text-[16px] font-semibold">قوالب جاهزة</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => {
              const ds = datasets.data?.find((d) => d.key === t.dataset);
              return (
                <Link key={t.key} href={`/reports/new?template=${t.key}`} className="rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
                  <span className="flex items-center gap-2 text-[14px] font-medium"><PageIcon icon={ds?.icon} size={16} className="text-fg-3" />{t.name}</span>
                  <span className="mt-1 block text-[12px] text-fg-3">{t.description}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
      <section>
        <h2 className="mb-3 text-[16px] font-semibold">ابدأ من مجموعة بيانات</h2>
        {datasets.data && !datasets.data.length ? <EmptyState compact illustration="lock" title="لا مجموعات بيانات متاحة لدورك" description="مجموعات البيانات تتبع صلاحياتك على الوحدات (كل المدرسة أو فرعك)." /> : null}
        <div className="space-y-5">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 text-[12px] font-medium text-fg-3">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((d) => (
                  <Link key={d.key} href={`/reports/new?dataset=${d.key}`} className="flex items-start gap-2 rounded-md border border-line p-3 transition-colors hover:bg-hover">
                    <PageIcon icon={d.icon} size={16} className="mt-0.5 shrink-0 text-fg-3" />
                    <span>
                      <span className="block text-[14px] font-medium">{d.label}</span>
                      <span className="block text-[12px] text-fg-3">{d.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </ModuleShell>
  );
}

// =====================================================================
// المنشئ
// =====================================================================

export function ReportBuilderPage({ id }: { id?: string }) {
  const params = useSearchParams();
  const datasets = trpc.reports.datasets.useQuery();
  const saved = trpc.reports.get.useQuery({ id: id ?? "" }, { enabled: Boolean(id) });
  const template = REPORT_TEMPLATES.find((t) => t.key === params.get("template"));
  if (id && saved.error) return <ModuleShell nav={navOf("reports")} title="تقرير"><EmptyState illustration="lock" title="لا يمكن فتح التقرير" description={saved.error.message} /></ModuleShell>;
  if (!datasets.data || (id && !saved.data)) return <ModuleShell nav={navOf("reports")} title="تقرير"><SkeletonLines lines={8} /></ModuleShell>;
  const initial = id && saved.data
    ? { dataset: saved.data.report.dataset, config: { ...EMPTY, ...saved.data.report.config }, name: saved.data.report.name, report: saved.data.report, canEdit: saved.data.canEdit, runs: saved.data.runs }
    : { dataset: template?.dataset ?? params.get("dataset") ?? datasets.data[0]?.key ?? "", config: { ...EMPTY, ...(template?.config ?? {}) }, name: template?.name ?? "", report: null, canEdit: true, runs: [] };
  return <Builder key={id ?? template?.key ?? initial.dataset} datasets={datasets.data} initial={initial} />;
}

type SavedReport = NonNullable<RouterOutputs["reports"]["get"]>["report"];
type Run = RouterOutputs["reports"]["get"]["runs"][number];

function Builder({ datasets, initial }: { datasets: Dataset[]; initial: { dataset: string; config: ReportConfig; name: string; report: SavedReport | null; canEdit: boolean; runs: Run[] } }) {
  const router = useRouter();
  const { tenant, can } = useApp();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const cell = useCellFormat();
  const [dataset, setDataset] = useState(initial.dataset);
  const [config, setConfig] = useState<ReportConfig>(initial.config);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(200);
  const [dialog, setDialog] = useState<null | "save" | "schedule" | "delete">(null);
  const [exporting, setExporting] = useState(false);
  const ds = datasets.find((d) => d.key === dataset);
  const fields: FieldDef[] = useMemo(() => (ds?.fields ?? []) as FieldDef[], [ds]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const deferred = useDeferredValue(config);
  const run = trpc.reports.run.useQuery({ dataset, config: deferred }, { enabled: Boolean(ds), placeholderData: (p) => p, retry: false });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const set = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const title = initial.report?.name ?? (initial.name || "تقرير جديد");
  const numericFields = fields.filter((f) => isNumeric(f.type));

  const addColumn = (key: string, at?: number) => {
    if (config.columns.includes(key)) return;
    const cols = [...config.columns];
    cols.splice(at ?? cols.length, 0, key);
    set({ columns: cols });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (!o) return;
    if (a.startsWith("field:")) {
      const key = a.slice(6);
      const at = o.startsWith("col:") ? config.columns.indexOf(o.slice(4)) : undefined;
      addColumn(key, at === -1 ? undefined : at);
    } else if (a.startsWith("col:") && o.startsWith("col:")) {
      set({ columns: arrayMove(config.columns, config.columns.indexOf(a.slice(4)), config.columns.indexOf(o.slice(4))) });
    }
  };
  const changeDataset = (key: string) => {
    setDataset(key);
    setConfig(EMPTY);
  };

  const exportAs = async (format: "XLSX" | "CSV") => {
    setExporting(true);
    try {
      await downloadExport(initial.report ? { id: initial.report.id, format } : { dataset, config, name: title, format });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصدير");
    } finally {
      setExporting(false);
    }
  };

  const result = run.data;
  const grouped = Boolean(config.groupBy);
  const chartData = useMemo(() => {
    if (!result || !config.groupBy || !config.chart) return null;
    const g = result.columns[0]!;
    const v = result.columns[1];
    if (!v) return null;
    return { g, v, rows: result.rows.slice(0, config.chart.type === "bar" ? 25 : 60).map((r, i) => ({ key: `${i}`, label: typeof cell(r[g.key], g) === "string" ? String(cell(r[g.key], g)) : String(r[g.key] ?? "—"), value: Number(r[v.key] ?? 0) })) };
  }, [result, config.groupBy, config.chart, cell]);
  const valueFormat = (n: number) => {
    const t = chartData?.v.type;
    const out = cell(n, { type: t ?? "number" });
    return typeof out === "string" ? out : formatNumber(n, prefs.digits);
  };

  return (
    <ModuleShell
      nav={navOf("reports")}
      wide
      title={title}
      crumbs={[{ title }]}
      actions={
        <div className="no-print flex flex-wrap items-center gap-1.5">
          {initial.canEdit && can("custom_reports", initial.report ? "view" : "create") ? <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} onClick={() => setDialog("save")}>{initial.report ? "حفظ التعديلات" : "حفظ التقرير"}</Button> : null}
          <Button size="sm" icon={<FileSpreadsheet className="size-3.5" />} loading={exporting} disabled={!ds} onClick={() => exportAs("XLSX")}>Excel</Button>
          <Button size="sm" icon={<Download className="size-3.5" />} disabled={!ds || exporting} onClick={() => exportAs("CSV")}>CSV</Button>
          <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>طباعة / PDF</Button>
          {initial.report && initial.canEdit ? <Button size="sm" icon={<CalendarClock className="size-3.5" />} onClick={() => setDialog("schedule")}>{initial.report.scheduleEnabled ? "الإرسال المجدول" : "جدولة الإرسال"}</Button> : null}
          {initial.report && initial.canEdit ? <Button size="icon" variant="ghost" aria-label="حذف التقرير" onClick={() => setDialog("delete")}><Trash2 className="size-4" /></Button> : null}
        </div>
      }
    >
      <div className="print-only mb-4 hidden border-b border-line pb-3">
        <p className="text-[16px] font-bold">{tenant.name}</p>
        <p className="text-[14px]">{title} — {ds?.label}</p>
        <p className="text-[12px] text-fg-3">تاريخ الطباعة: {fmtDate(new Date(), "long")}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* لوحة الإعداد */}
          <aside className="no-print space-y-5" aria-label="إعداد التقرير">
            <Field label="مجموعة البيانات">
              <Select value={dataset} onChange={changeDataset} options={datasets.map((d) => ({ value: d.key, label: `${d.group} — ${d.label}` }))} />
            </Field>
            <section>
              <h3 className="mb-1.5 text-[13px] font-medium text-fg-2">الحقول <span className="font-normal text-fg-3">— اسحبها إلى الأعمدة أو اضغط +</span></h3>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute start-2 top-2 size-3.5 text-fg-3" />
                <Input className="h-7 ps-7 text-[13px]" placeholder="بحث في الحقول" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث في الحقول" />
              </div>
              <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto thin-scroll">
                {fields.filter((f) => !search || f.label.includes(search)).map((f) => (
                  <FieldChip key={f.key} field={f} used={config.columns.includes(f.key)} onAdd={() => addColumn(f.key)} />
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-1.5 text-[13px] font-medium text-fg-2">التصفية</h3>
              <FilterEditor fields={fields} filters={config.filters} onChange={(filters) => set({ filters })} />
            </section>
            <section>
              <h3 className="mb-1.5 text-[13px] font-medium text-fg-2">التجميع</h3>
              <Select size="sm" value={config.groupBy?.field ?? "NONE"} onChange={(v) => set(v === "NONE" ? { groupBy: null, chart: null, sort: null } : { groupBy: { field: v, bucket: byKey.get(v)?.type === "date" ? "month" : undefined }, aggregates: config.aggregates?.length ? config.aggregates : [{ fn: "count" }], chart: config.chart ?? { type: "bar" }, sort: null })} options={[{ value: "NONE", label: "بلا تجميع (سجلات تفصيلية)" }, ...fields.filter((f) => !isNumeric(f.type) || f.type === "number").map((f) => ({ value: f.key, label: `حسب ${f.label}` }))]} />
              {config.groupBy && byKey.get(config.groupBy.field)?.type === "date" ? (
                <Segmented className="mt-2" value={config.groupBy.bucket ?? "month"} onChange={(b) => set({ groupBy: { ...config.groupBy!, bucket: b as "day" | "month" | "year" } })} options={[{ value: "day", label: "يوم" }, { value: "month", label: "شهر" }, { value: "year", label: "سنة" }]} />
              ) : null}
              {grouped ? (
                <div className="mt-2 space-y-1.5">
                  {(config.aggregates ?? []).map((a, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Select size="sm" className="w-28" value={a.fn} onChange={(fn) => set({ aggregates: config.aggregates!.map((x, j) => (j === i ? (fn === "count" ? { fn: "count" as AggFn } : { fn: fn as AggFn, field: x.field ?? numericFields[0]?.key }) : x)) })} options={(Object.keys(AGG_LABEL) as AggFn[]).filter((fn) => fn === "count" || numericFields.length).map((fn) => ({ value: fn, label: AGG_LABEL[fn] }))} />
                      {a.fn !== "count" ? <Select size="sm" className="min-w-0 flex-1" value={a.field ?? ""} onChange={(f) => set({ aggregates: config.aggregates!.map((x, j) => (j === i ? { ...x, field: f } : x)) })} options={numericFields.map((f) => ({ value: f.key, label: f.label }))} /> : <span className="flex-1 text-[12px] text-fg-3">عدد السجلات</span>}
                      {(config.aggregates ?? []).length > 1 ? <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => set({ aggregates: config.aggregates!.filter((_, j) => j !== i) })}><X className="size-3.5" /></Button> : null}
                    </div>
                  ))}
                  {(config.aggregates ?? []).length < 6 ? <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set({ aggregates: [...(config.aggregates ?? []), numericFields[0] ? { fn: "sum", field: numericFields[0].key } : { fn: "count" }] })}>قيمة محسوبة</Button> : null}
                </div>
              ) : null}
            </section>
            <section className="grid grid-cols-2 gap-2">
              <Field label="الفرز">
                <Select size="sm" value={config.sort ? `${config.sort.key}|${config.sort.dir}` : "NONE"} onChange={(v) => set({ sort: v === "NONE" ? null : { key: v.split("|")[0]!, dir: v.split("|")[1] as "asc" | "desc" } })} options={[{ value: "NONE", label: "افتراضي" }, ...(result?.columns ?? []).flatMap((c) => [{ value: `${c.key}|asc`, label: `${c.label} ↑` }, { value: `${c.key}|desc`, label: `${c.label} ↓` }])]} />
              </Field>
              <Field label="الحد الأقصى">
                <Input type="number" className="h-7" min={1} value={config.limit ?? ""} placeholder="الكل" onChange={(e) => set({ limit: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
              </Field>
            </section>
            {grouped ? (
              <Field label="الرسم">
                <Segmented value={config.chart?.type ?? "none"} onChange={(t) => set({ chart: t === "none" ? null : { type: t as "bar" | "column" | "line" } })} options={[{ value: "none", label: "بلا" }, { value: "bar", label: "أعمدة أفقية" }, { value: "column", label: "أعمدة" }, { value: "line", label: "خطي" }]} />
              </Field>
            ) : null}
          </aside>

          {/* النتائج */}
          <main className="min-w-0 space-y-4">
            {!grouped ? <ColumnsZone columns={config.columns} byKey={byKey} onRemove={(k) => set({ columns: config.columns.filter((c) => c !== k) })} /> : null}
            {run.error ? <EmptyState illustration="lock" title="تعذر تشغيل التقرير" description={run.error.message} /> : null}
            {result ? (
              <div className={cn("space-y-4 transition-opacity", run.isFetching && "opacity-60")}>
                <p className="text-[13px] text-fg-3" aria-live="polite">
                  {formatNumber(result.total, prefs.digits)} {grouped ? "مجموعة" : "سجل"}
                  {result.truncated ? ` — يُعرض أول ${formatNumber(result.rows.length, prefs.digits)} (صدّر للكل)` : ""}
                  {ds ? ` · ${ds.label}` : ""}
                </p>
                {chartData && chartData.rows.length ? (
                  <ChartCard title={`${chartData.v.label} حسب ${chartData.g.label}`} table={{ columns: [chartData.g.label, chartData.v.label], rows: chartData.rows.map((r) => [r.label, valueFormat(r.value)]) }}>
                    {config.chart?.type === "line" ? (
                      <Lines labels={chartData.rows.map((r) => r.label)} series={[{ key: "v", label: chartData.v.label, color: "chart-1", values: chartData.rows.map((r) => r.value) }]} format={valueFormat} />
                    ) : config.chart?.type === "column" ? (
                      <Columns data={chartData.rows} format={valueFormat} />
                    ) : (
                      <HBars data={chartData.rows} format={valueFormat} labelWidth={160} />
                    )}
                  </ChartCard>
                ) : null}
                {result.rows.length ? (
                  <FinTable
                    dense
                    head={<tr>{result.columns.map((c) => <th key={c.key} className={isNumeric(c.type) ? "text-end" : ""}>{c.label}</th>)}</tr>}
                    foot={Object.keys(result.totals).length ? <tr>{result.columns.map((c, i) => <td key={c.key} className={isNumeric(c.type) ? num : ""}>{i === 0 ? "الإجمالي" : c.key in result.totals ? cell(result.totals[c.key], c) : ""}</td>)}</tr> : undefined}
                  >
                    {result.rows.slice(0, shown).map((r, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => (
                          <td key={c.key} className={isNumeric(c.type) ? num : "max-w-[260px] truncate"}>{cell(r[c.key], c)}</td>
                        ))}
                      </tr>
                    ))}
                  </FinTable>
                ) : (
                  <EmptyState compact illustration="search" title="لا سجلات مطابقة" description="غيّر شروط التصفية أو اختر مجموعة بيانات أخرى." />
                )}
                {result.rows.length > shown ? <Button size="sm" variant="ghost" className="no-print" onClick={() => setShown((s) => s + 500)}>عرض المزيد ({formatNumber(result.rows.length - shown, prefs.digits)})</Button> : null}
              </div>
            ) : run.isLoading ? (
              <SkeletonLines lines={8} />
            ) : null}
          </main>
        </div>
      </DndContext>
      {dialog === "save" ? <SaveDialog report={initial.report} dataset={dataset} config={config} defaultName={initial.name} onClose={() => setDialog(null)} onSaved={(rid) => (setDialog(null), initial.report ? router.refresh() : router.replace(`/reports/${rid}`))} /> : null}
      {dialog === "schedule" && initial.report ? <ScheduleDialog report={initial.report} runs={initial.runs} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete" && initial.report ? <DeleteDialog id={initial.report.id} name={initial.report.name} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function FieldChip({ field, used, onAdd }: { field: FieldDef; used: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `field:${field.key}` });
  return (
    <span ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-card ps-1 text-[12px]", used && "opacity-50", isDragging && "z-20 shadow-drag")}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab py-1 text-fg-4 active:cursor-grabbing" aria-label={`اسحب ${field.label}`}>
        <GripVertical className="size-3" />
      </button>
      <span className="py-1">{field.label}</span>
      <button type="button" onClick={onAdd} disabled={used} className="grid size-5 place-items-center rounded-e-md text-fg-3 hover:bg-hover hover:text-fg disabled:cursor-default" aria-label={`أضف ${field.label} للأعمدة`}>
        <Plus className="size-3" />
      </button>
    </span>
  );
}

function ColumnsZone({ columns, byKey, onRemove }: { columns: string[]; byKey: Map<string, FieldDef>; onRemove: (k: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "columns-zone" });
  return (
    <div ref={setNodeRef} className={cn("no-print flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-line-strong p-2", isOver && "border-navy-600 bg-hover")} aria-label="أعمدة التقرير">
      {columns.length ? (
        <SortableContext items={columns.map((c) => `col:${c}`)} strategy={horizontalListSortingStrategy}>
          {columns.map((c) => (
            <ColumnPill key={c} id={c} label={byKey.get(c)?.label ?? c} onRemove={() => onRemove(c)} />
          ))}
        </SortableContext>
      ) : (
        <span className="px-1 text-[13px] text-fg-3">اسحب الحقول هنا لتحديد أعمدة التقرير وترتيبها (بدونها تظهر أول ستة حقول)</span>
      )}
    </div>
  );
}

function ColumnPill({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `col:${id}` });
  return (
    <span ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("inline-flex items-center gap-1 rounded-full bg-navy-700 py-0.5 pe-1 ps-2 text-[12px] text-on-primary", isDragging && "z-10 shadow-drag")}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing" aria-label={`إعادة ترتيب ${label}`}>
        {label}
      </button>
      <button type="button" onClick={onRemove} className="grid size-4 place-items-center rounded-full hover:bg-white/20" aria-label={`إزالة ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------
// الحفظ والمشاركة
// ---------------------------------------------------------------------

function SaveDialog({ report, dataset, config, defaultName, onClose, onSaved }: { report: SavedReport | null; dataset: string; config: ReportConfig; defaultName: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { can } = useApp();
  const targets = trpc.reports.shareTargets.useQuery();
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: report?.name ?? defaultName, description: report?.description ?? "", visibility: (report?.visibility ?? "PRIVATE") as "PRIVATE" | "ROLES" | "ALL", sharedRoleIds: report?.sharedRoleIds ?? ([] as string[]), isPinned: report?.isPinned ?? false });
  const save = trpc.reports.save.useMutation({
    onSuccess: (r) => {
      toast.success("حُفظ التقرير");
      void utils.reports.invalidate();
      onSaved(r.id);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={report ? "حفظ التعديلات" : "حفظ التقرير"} description="التقرير المشارك يُشغَّل دائماً بصلاحيات من يفتحه، فلا يرى أحد بيانات خارج نطاقه." width={560}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
          <Field label="الوصف"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="المشاركة">
            <Segmented value={v.visibility} onChange={(vis) => setV({ ...v, visibility: vis as typeof v.visibility })} options={[{ value: "PRIVATE", label: "خاص بي" }, { value: "ROLES", label: "أدوار محددة" }, ...(can("custom_reports", "update") ? [{ value: "ALL", label: "كل من يملك الصلاحية" }] : [])]} />
          </Field>
          {v.visibility === "ROLES" ? (
            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-line p-2 thin-scroll">
              {(targets.data?.roles ?? []).map((r) => (
                <Checkbox key={r.id} label={r.name} checked={v.sharedRoleIds.includes(r.id)} onChange={(on) => setV({ ...v, sharedRoleIds: on ? [...v.sharedRoleIds, r.id] : v.sharedRoleIds.filter((x) => x !== r.id) })} />
              ))}
            </div>
          ) : null}
          <Switch checked={v.isPinned} onChange={(isPinned) => setV({ ...v, isPinned })} label="تثبيت في أعلى القائمة" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" icon={<Share2 className="size-3.5" />} loading={save.isPending} disabled={v.name.trim().length < 2 || (v.visibility === "ROLES" && !v.sharedRoleIds.length)} onClick={() => save.mutate({ id: report?.id ?? null, dataset, config, ...v })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const del = trpc.reports.delete.useMutation({ onSuccess: () => (toast.success("حُذف التقرير"), void utils.reports.invalidate(), router.push("/reports")), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="حذف التقرير" description={`سيُحذف «${name}» ويتوقف إرساله المجدول. سجل التشغيل السابق يبقى في التدقيق.`} width={440}>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>تراجع</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => del.mutate({ id })}>حذف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الجدولة
// ---------------------------------------------------------------------

function ScheduleDialog({ report, runs, onClose }: { report: SavedReport; runs: Run[]; onClose: () => void }) {
  const router = useRouter();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const targets = trpc.reports.shareTargets.useQuery();
  const utils = trpc.useUtils();
  const initial: ReportSchedule = report.schedule ?? { frequency: "WEEKLY", time: "07:00", weekday: 0, monthDay: 1, format: "XLSX", userIds: [], emails: [] };
  const [s, setS] = useState<ReportSchedule>(initial);
  const [enabled, setEnabled] = useState(report.scheduleEnabled || !report.schedule);
  const [emails, setEmails] = useState(initial.emails.join("، "));
  const [q, setQ] = useState("");
  const parsedEmails = emails.split(/[,،\s]+/).map((x) => x.trim()).filter(Boolean);
  const badEmail = parsedEmails.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const done = () => (void utils.reports.invalidate(), router.refresh());
  const save = trpc.reports.schedule.useMutation({ onSuccess: () => (toast.success(enabled ? "فُعّل الإرسال المجدول" : "أُوقف الإرسال المجدول"), done(), onClose()), onError: (e) => toast.error(e.message) });
  const send = trpc.reports.sendNow.useMutation({ onSuccess: (r) => (r.status === "SUCCESS" ? toast.success(`أُرسل التقرير (${r.rowCount} سجل)`) : toast.error(r.error ?? "تعذر الإرسال"), done()), onError: (e) => toast.error(e.message) });
  const users = (targets.data?.users ?? []).filter((u) => !q || u.name.includes(q));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="الإرسال المجدول" description="يُشغَّل التقرير بصلاحيات مالكه ويُرسل لمستلمين يملكون صلاحية بياناته فقط، مع رابط تنزيل آمن." width={640}>
        <div className="space-y-3 px-5 pb-4">
          <Switch checked={enabled} onChange={setEnabled} label="تفعيل الإرسال المجدول" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="التكرار"><Segmented value={s.frequency} onChange={(f) => setS({ ...s, frequency: f as ReportSchedule["frequency"] })} options={(Object.keys(FREQUENCY_LABEL) as ReportSchedule["frequency"][]).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} /></Field>
            <Field label="الوقت (بتوقيت المدرسة)"><Input type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} /></Field>
            {s.frequency === "WEEKLY" ? <Field label="اليوم"><Select value={String(s.weekday ?? 0)} onChange={(d) => setS({ ...s, weekday: Number(d) })} options={WEEKDAY_LABEL.map((l, i) => ({ value: String(i), label: l }))} /></Field> : null}
            {s.frequency === "MONTHLY" ? <Field label="يوم الشهر" hint="١–٢٨"><Input type="number" min={1} max={28} value={s.monthDay ?? 1} onChange={(e) => setS({ ...s, monthDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} /></Field> : null}
          </div>
          <Field label="صيغة الملف"><Segmented value={s.format} onChange={(f) => setS({ ...s, format: f as "XLSX" | "CSV" })} options={[{ value: "XLSX", label: "Excel" }, { value: "CSV", label: "CSV" }]} /></Field>
          <Field label="المستلمون من النظام" hint="يصلهم إشعار برابط التنزيل">
            <Input className="mb-1.5 h-7" placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-line p-2 thin-scroll">
              {users.map((u) => (
                <Checkbox key={u.id} label={u.name} checked={s.userIds.includes(u.id)} onChange={(on) => setS({ ...s, userIds: on ? [...s.userIds, u.id] : s.userIds.filter((x) => x !== u.id) })} />
              ))}
            </div>
          </Field>
          <Field label="بريد إلكتروني إضافي" hint="افصل بفاصلة" error={badEmail ? `بريد غير صالح: ${badEmail}` : null}>
            <Input dir="ltr" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="board@example.com" />
          </Field>
          {enabled ? <p className="text-[12px] text-fg-3">{describeSchedule(s)}{report.nextRunAt && report.scheduleEnabled ? ` — الموعد القادم ${fmtDate(report.nextRunAt, "long")}` : ""}</p> : null}
          {runs.length ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-fg-3">آخر عمليات التشغيل</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-[12px] thin-scroll">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-fg-2">{fmtDate(r.createdAt)} · {r.trigger === "SCHEDULE" ? "مجدول" : "يدوي"} · {r.format}</span>
                    {r.status === "SUCCESS" ? <span className="text-fg-3">{formatNumber(r.rowCount, prefs.digits)} سجل{r.fileId ? <> · <a className="underline" href={`/api/reports/runs/${r.id}`}>تنزيل</a></> : null}</span> : <span className="text-danger-700">فشل: {r.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {report.schedule ? <Button variant="ghost" icon={<Send className="size-3.5" />} loading={send.isPending} onClick={() => send.mutate({ id: report.id })}>أرسل الآن</Button> : null}
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={Boolean(badEmail) || (enabled && !s.userIds.length && !parsedEmails.length)} onClick={() => save.mutate({ id: report.id, enabled, schedule: { ...s, emails: parsedEmails } })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { aggKey };
