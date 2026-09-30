/**
 * محرك الاستعلام لمنشئ التقارير وقواعد الأتمتة (نقي: بلا قاعدة بيانات).
 * ---------------------------------------------------------------------
 * - الحقول مكتوبة الأنواع: نص، رقم، مبلغ (بأصغر وحدة)، نسبة (bp)، تاريخ (YYYY-MM-DD)، قائمة، منطقي.
 * - التصفية بمعاملات صريحة، منها تواريخ نسبية («هذا الشهر»، «آخر ٣٠ يوماً») تُحسب عند التشغيل
 *   فيبقى التقرير المجدول صحيحاً كل مرة.
 * - التجميع بحقل (والتاريخ بيوم/شهر/سنة) مع دوال: عدد، مجموع، متوسط، أدنى، أعلى.
 * - المبالغ أعداد صحيحة دائماً؛ المتوسط يُقرَّب لأقرب وحدة صغرى.
 */

export type FieldType = "string" | "number" | "money" | "percent" | "date" | "enum" | "boolean";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** تسميات القيم للقوائم */
  options?: Record<string, string>;
  /** وحدة صلاحيات إضافية مطلوبة لرؤية الحقل (مثل الأرصدة المالية في بيانات الطلاب) */
  module?: string;
}

export type FilterOp = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "empty" | "notEmpty" | "relative" | "isTrue" | "isFalse";

export type RelativeRange = "today" | "yesterday" | "this_week" | "last_7" | "this_month" | "last_month" | "last_30" | "last_90" | "this_year" | "next_7" | "next_30" | "overdue";

export interface Filter {
  field: string;
  op: FilterOp;
  value?: string | number | boolean | Array<string | number> | null;
  /** للنطاق between */
  value2?: string | number | null;
}

export type AggFn = "count" | "sum" | "avg" | "min" | "max";
export type DateBucket = "day" | "month" | "year";

export interface Aggregate {
  fn: AggFn;
  /** غير مطلوب للعدد */
  field?: string;
}

export interface ReportConfig {
  columns: string[];
  filters: Filter[];
  groupBy?: { field: string; bucket?: DateBucket } | null;
  aggregates?: Aggregate[];
  sort?: { key: string; dir: "asc" | "desc" } | null;
  limit?: number | null;
  chart?: { type: "bar" | "column" | "line"; } | null;
}

export type Row = Record<string, string | number | boolean | null>;

export interface QueryColumn {
  key: string;
  label: string;
  type: FieldType;
  options?: Record<string, string>;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Row[];
  /** إجماليات الأعمدة الرقمية (للتقارير التفصيلية) */
  totals: Record<string, number>;
  total: number;
  truncated: boolean;
}

export const OP_LABEL: Record<FilterOp, string> = {
  eq: "يساوي",
  neq: "لا يساوي",
  contains: "يحتوي",
  gt: "أكبر من",
  gte: "أكبر من أو يساوي",
  lt: "أصغر من",
  lte: "أصغر من أو يساوي",
  between: "بين",
  in: "أحد",
  empty: "فارغ",
  notEmpty: "غير فارغ",
  relative: "خلال",
  isTrue: "نعم",
  isFalse: "لا",
};

export const RELATIVE_LABEL: Record<RelativeRange, string> = {
  today: "اليوم",
  yesterday: "أمس",
  this_week: "هذا الأسبوع",
  last_7: "آخر ٧ أيام",
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  last_30: "آخر ٣٠ يوماً",
  last_90: "آخر ٩٠ يوماً",
  this_year: "هذه السنة",
  next_7: "الأيام السبعة القادمة",
  next_30: "الثلاثون يوماً القادمة",
  overdue: "قبل اليوم (متأخر)",
};

export const AGG_LABEL: Record<AggFn, string> = { count: "العدد", sum: "المجموع", avg: "المتوسط", min: "الأدنى", max: "الأعلى" };

/** المعاملات المتاحة لكل نوع حقل */
export function opsFor(type: FieldType): FilterOp[] {
  switch (type) {
    case "string":
      return ["contains", "eq", "neq", "empty", "notEmpty"];
    case "enum":
      return ["eq", "neq", "in", "empty", "notEmpty"];
    case "boolean":
      return ["isTrue", "isFalse"];
    case "date":
      return ["relative", "eq", "gte", "lte", "between", "empty", "notEmpty"];
    default:
      return ["eq", "neq", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"];
  }
}

// ---------------------------------------------------------------------
// التواريخ
// ---------------------------------------------------------------------

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** نطاق تاريخ نسبي [from, to] شاملاً، بالنسبة لتاريخ اليوم المحلي. أول الأسبوع الأحد. */
export function resolveRelative(range: RelativeRange, today: string): { from: string | null; to: string | null } {
  const t = toMs(today);
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: toIso(t - DAY), to: toIso(t - DAY) };
    case "this_week": {
      const start = t - d.getUTCDay() * DAY;
      return { from: toIso(start), to: toIso(start + 6 * DAY) };
    }
    case "last_7":
      return { from: toIso(t - 6 * DAY), to: today };
    case "this_month":
      return { from: toIso(Date.UTC(y, m, 1)), to: toIso(Date.UTC(y, m + 1, 0)) };
    case "last_month":
      return { from: toIso(Date.UTC(y, m - 1, 1)), to: toIso(Date.UTC(y, m, 0)) };
    case "last_30":
      return { from: toIso(t - 29 * DAY), to: today };
    case "last_90":
      return { from: toIso(t - 89 * DAY), to: today };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "next_7":
      return { from: today, to: toIso(t + 6 * DAY) };
    case "next_30":
      return { from: today, to: toIso(t + 29 * DAY) };
    case "overdue":
      return { from: null, to: toIso(t - DAY) };
  }
}

export function bucketOf(iso: string, bucket: DateBucket): string {
  if (bucket === "year") return iso.slice(0, 4);
  if (bucket === "month") return iso.slice(0, 7);
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------
// التصفية
// ---------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

function numeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cmp(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

export function matchFilter(row: Row, f: Filter, field: FieldDef | undefined, today: string): boolean {
  if (!field) return true;
  const raw = row[f.field];
  const empty = raw === null || raw === undefined || raw === "";
  if (f.op === "empty") return empty;
  if (f.op === "notEmpty") return !empty;
  if (f.op === "isTrue") return raw === true;
  if (f.op === "isFalse") return raw !== true;
  if (empty) return f.op === "neq";
  const isNum = field.type === "number" || field.type === "money" || field.type === "percent";
  const val = isNum ? (numeric(raw) as number) : field.type === "date" ? String(raw).slice(0, 10) : String(raw);
  const arg = (v: unknown) => (isNum ? numeric(v) : v === null || v === undefined ? null : String(v));
  switch (f.op) {
    case "contains":
      return norm(String(raw)).includes(norm(String(f.value ?? "")));
    case "eq": {
      const a = arg(f.value);
      return a !== null && cmp(val, a) === 0;
    }
    case "neq": {
      const a = arg(f.value);
      return a === null || cmp(val, a) !== 0;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = arg(f.value);
      if (a === null) return true;
      const c = cmp(val, a);
      return f.op === "gt" ? c > 0 : f.op === "gte" ? c >= 0 : f.op === "lt" ? c < 0 : c <= 0;
    }
    case "between": {
      const a = arg(f.value);
      const b = arg(f.value2);
      return (a === null || cmp(val, a) >= 0) && (b === null || cmp(val, b) <= 0);
    }
    case "in": {
      const list = Array.isArray(f.value) ? f.value.map(String) : String(f.value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      return list.length === 0 || list.includes(String(raw));
    }
    case "relative": {
      if (field.type !== "date") return true;
      const r = resolveRelative(f.value as RelativeRange, today);
      return (r.from === null || val >= r.from) && (r.to === null || val <= r.to);
    }
    default:
      return true;
  }
}

export function applyFilters(rows: Row[], filters: Filter[], fields: FieldDef[], today: string): Row[] {
  if (!filters.length) return rows;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return rows.filter((r) => filters.every((f) => matchFilter(r, f, byKey.get(f.field), today)));
}

// ---------------------------------------------------------------------
// التجميع والتشغيل
// ---------------------------------------------------------------------

export function aggKey(a: Aggregate) {
  return a.fn === "count" ? "count" : `${a.fn}_${a.field}`;
}

function aggregate(rows: Row[], a: Aggregate): number {
  if (a.fn === "count") return rows.length;
  const nums = rows.map((r) => numeric(r[a.field!])).filter((n): n is number => n !== null);
  if (!nums.length) return 0;
  switch (a.fn) {
    case "sum":
      return nums.reduce((s, n) => s + n, 0);
    case "avg":
      return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
  }
}

const NUMERIC: FieldType[] = ["number", "money", "percent"];

/** يتحقق من صحة الإعداد مقابل الحقول المتاحة ويُسقط ما لا يعرفه */
export function sanitizeConfig(config: ReportConfig, fields: FieldDef[]): ReportConfig {
  const keys = new Set(fields.map((f) => f.key));
  const numericKeys = new Set(fields.filter((f) => NUMERIC.includes(f.type)).map((f) => f.key));
  const groupBy = config.groupBy && keys.has(config.groupBy.field) ? config.groupBy : null;
  const aggregates = (config.aggregates ?? []).filter((a) => a.fn === "count" || (a.field && numericKeys.has(a.field)));
  return {
    columns: config.columns.filter((c) => keys.has(c)),
    filters: config.filters.filter((f) => keys.has(f.field)),
    groupBy,
    aggregates: groupBy && !aggregates.length ? [{ fn: "count" }] : aggregates,
    sort: config.sort ?? null,
    limit: config.limit ? Math.min(Math.max(1, Math.floor(config.limit)), 50_000) : null,
    chart: config.chart ?? null,
  };
}

export function runQuery(source: Row[], rawConfig: ReportConfig, fields: FieldDef[], opts: { today: string; maxRows?: number }): QueryResult {
  const config = sanitizeConfig(rawConfig, fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const filtered = applyFilters(source, config.filters, fields, opts.today);
  let columns: QueryColumn[];
  let rows: Row[];
  if (config.groupBy) {
    const g = config.groupBy;
    const gField = byKey.get(g.field)!;
    const bucket = gField.type === "date" ? (g.bucket ?? "month") : null;
    const groups = new Map<string, Row[]>();
    for (const r of filtered) {
      const v = r[g.field];
      const k = v === null || v === undefined || v === "" ? "" : bucket ? bucketOf(String(v), bucket) : String(v);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const aggs = config.aggregates!;
    columns = [
      { key: g.field, label: gField.label + (bucket ? ` (${bucket === "day" ? "يوم" : bucket === "month" ? "شهر" : "سنة"})` : ""), type: bucket ? "string" : gField.type, options: gField.options },
      ...aggs.map((a) => {
        const f = a.field ? byKey.get(a.field) : undefined;
        return { key: aggKey(a), label: a.fn === "count" ? "العدد" : `${AGG_LABEL[a.fn]} ${f?.label ?? ""}`, type: (a.fn === "count" ? "number" : f?.type ?? "number") as FieldType };
      }),
    ];
    rows = [...groups.entries()].map(([k, rs]) => {
      const out: Row = { [g.field]: k === "" ? null : gField.type === "boolean" ? k === "true" : k };
      for (const a of aggs) out[aggKey(a)] = aggregate(rs, a);
      return out;
    });
    // الترتيب الافتراضي: بالتاريخ تصاعدياً أو بأول تجميع تنازلياً
    const sortKey = config.sort && columns.some((c) => c.key === config.sort!.key) ? config.sort : bucket ? { key: g.field, dir: "asc" as const } : { key: aggKey(aggs[0]!), dir: "desc" as const };
    rows.sort((a, b) => sortRows(a, b, sortKey));
  } else {
    const cols = config.columns.length ? config.columns : fields.slice(0, 6).map((f) => f.key);
    columns = cols.map((k) => ({ key: k, label: byKey.get(k)!.label, type: byKey.get(k)!.type, options: byKey.get(k)!.options }));
    rows = filtered.map((r) => Object.fromEntries(cols.map((k) => [k, r[k] ?? null])) as Row);
    if (config.sort && byKey.has(config.sort.key)) rows.sort((a, b) => sortRows(a, b, config.sort!));
  }
  const total = rows.length;
  const cap = Math.min(config.limit ?? Infinity, opts.maxRows ?? 50_000);
  const truncated = rows.length > cap;
  if (truncated) rows = rows.slice(0, cap);
  const totals: Record<string, number> = {};
  for (const c of columns) {
    if (!NUMERIC.includes(c.type) || c.type === "percent") continue;
    if (c.key === config.groupBy?.field) continue;
    if (config.groupBy && !c.key.startsWith("sum_") && c.key !== "count") continue;
    totals[c.key] = rows.reduce((s, r) => s + (numeric(r[c.key]) ?? 0), 0);
  }
  return { columns, rows, totals, total, truncated };
}

function sortRows(a: Row, b: Row, s: { key: string; dir: "asc" | "desc" }) {
  const x = a[s.key];
  const y = b[s.key];
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;
  const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
  return s.dir === "asc" ? c : -c;
}

/** قيمة معروضة كنص (للتصدير CSV ونص الرسائل) — الأرقام بالإنجليزية لتبقى قابلة للمعالجة */
export function plainValue(v: Row[string], col: QueryColumn, fmtMoney: (minor: number) => string): string {
  if (v === null || v === undefined) return "";
  if (col.type === "boolean") return v ? "نعم" : "لا";
  if (col.type === "money" && typeof v === "number") return fmtMoney(v);
  if (col.type === "percent" && typeof v === "number") return `${(v / 100).toFixed(1)}%`;
  if (col.options && typeof v === "string") return col.options[v] ?? v;
  return String(v);
}
