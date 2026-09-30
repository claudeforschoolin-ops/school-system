/**
 * المؤشرات الشهرية: تعريفاتها وحساب الاتجاه والمقارنة والتوقع (نقي).
 */

export type MetricUnit = "count" | "money" | "bp";

export interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  /** الارتفاع جيد؟ (يحدد لون السهم) */
  higherIsBetter: boolean;
  /** يُجمع عبر الأشهر (للمقارنة السنوية) أم لقطة نقطية/نسبة (يُؤخذ متوسطها) */
  additive: boolean;
  module: string;
  group: "الطلاب" | "المالية" | "الموارد البشرية" | "العمليات";
}

export const METRICS: MetricDef[] = [
  { key: "students_active", label: "الطلاب المنتظمون", unit: "count", higherIsBetter: true, additive: false, module: "students", group: "الطلاب" },
  { key: "students_new", label: "الملتحقون الجدد", unit: "count", higherIsBetter: true, additive: true, module: "students", group: "الطلاب" },
  { key: "applications", label: "طلبات القبول", unit: "count", higherIsBetter: true, additive: true, module: "admissions", group: "الطلاب" },
  { key: "attendance_rate", label: "نسبة حضور الطلاب", unit: "bp", higherIsBetter: true, additive: false, module: "attendance", group: "الطلاب" },
  { key: "behavior_negative", label: "ملاحظات سلوكية سلبية", unit: "count", higherIsBetter: false, additive: true, module: "counseling", group: "الطلاب" },
  { key: "billed", label: "الفواتير الصادرة", unit: "money", higherIsBetter: true, additive: true, module: "finance_reports", group: "المالية" },
  { key: "collected", label: "التحصيل", unit: "money", higherIsBetter: true, additive: true, module: "finance_reports", group: "المالية" },
  { key: "revenue", label: "الإيرادات", unit: "money", higherIsBetter: true, additive: true, module: "finance_reports", group: "المالية" },
  { key: "expenses", label: "المصروفات", unit: "money", higherIsBetter: false, additive: true, module: "finance_reports", group: "المالية" },
  { key: "net_income", label: "صافي الدخل", unit: "money", higherIsBetter: true, additive: true, module: "finance_reports", group: "المالية" },
  { key: "employees_active", label: "الموظفون على رأس العمل", unit: "count", higherIsBetter: true, additive: false, module: "employees", group: "الموارد البشرية" },
  { key: "staff_attendance_rate", label: "نسبة حضور الموظفين", unit: "bp", higherIsBetter: true, additive: false, module: "hr_attendance", group: "الموارد البشرية" },
  { key: "payroll_cost", label: "تكلفة الرواتب", unit: "money", higherIsBetter: false, additive: true, module: "payroll", group: "الموارد البشرية" },
  { key: "maintenance_opened", label: "بلاغات الصيانة", unit: "count", higherIsBetter: false, additive: true, module: "maintenance", group: "العمليات" },
];

export const METRIC_MAP = new Map(METRICS.map((m) => [m.key, m]));

// ---------------------------------------------------------------------
// الأشهر والأعوام الدراسية
// ---------------------------------------------------------------------

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to && out.length < 240; p = addMonths(p, 1)) out.push(p);
  return out;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function monthLabel(period: string, withYear = false): string {
  const m = Number(period.slice(5, 7));
  return `${MONTHS_AR[m - 1]}${withYear ? ` ${period.slice(0, 4)}` : ""}`;
}

/**
 * العام الدراسي الذي يقع فيه الشهر، بشهر بداية قابل للضبط (افتراضياً سبتمبر ← أغسطس).
 * يُعاد بصيغة «2025/2026».
 */
export function schoolYearOf(period: string, startMonth = 9): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  const start = m >= startMonth ? y : y - 1;
  return `${start}/${start + 1}`;
}

export function schoolYearMonths(label: string, startMonth = 9): string[] {
  const start = Number(label.slice(0, 4));
  const first = `${start}-${String(startMonth).padStart(2, "0")}`;
  return monthRange(first, addMonths(first, 11));
}

// ---------------------------------------------------------------------
// المقارنة والتلخيص
// ---------------------------------------------------------------------

/** التغير النسبي بنقاط الأساس (١٠٠ = ١٪)؛ null إذا لا أساس للمقارنة */
export function changeBp(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000);
}

/** اتجاه الحكم على التغير: جيد/سيئ/محايد */
export function deltaTone(delta: number | null, higherIsBetter: boolean): "good" | "bad" | "neutral" {
  if (delta === null || Math.abs(delta) < 50) return "neutral";
  return delta > 0 === higherIsBetter ? "good" : "bad";
}

/** قيمة عام كامل لمؤشر: مجموع للمؤشرات التراكمية، ومتوسط لغيرها (بتجاهل الأشهر الفارغة) */
export function summarize(values: Array<number | null>, additive: boolean): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return null;
  const sum = known.reduce((s, v) => s + v, 0);
  return additive ? sum : Math.round(sum / known.length);
}

// ---------------------------------------------------------------------
// التوقع
// ---------------------------------------------------------------------

/** انحدار خطي بالمربعات الصغرى على سلسلة (يتجاهل القيم الفارغة) */
export function linearTrend(values: Array<number | null>): { slope: number; intercept: number; r2: number } | null {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  return { slope, intercept, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

/** توقع الأشهر القادمة: الاتجاه الخطي مع موسمية العام السابق (نسبة الشهر إلى متوسط عامه) إن توفرت */
export function forecastSeries(history: Array<number | null>, horizon: number, seasonal?: Array<number | null>): number[] {
  const trend = linearTrend(history);
  const known = history.filter((v): v is number => v !== null);
  const base = known.length ? known[known.length - 1]! : 0;
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const x = history.length - 1 + h;
    let v = trend ? trend.intercept + trend.slope * x : base;
    const s = seasonal?.[h - 1];
    if (s !== null && s !== undefined && Number.isFinite(s)) v *= s;
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}

/**
 * توقع التحصيل لبقية العام: المستحق غير المسدد لكل شهر × كفاءة التحصيل التاريخية
 * (نسبة ما حُصّل خلال ٣٠ يوماً من الاستحقاق في الأشهر المنقضية)، مع هامش ± بحسب تذبذب الكفاءة.
 */
export function collectionForecast(dueByMonth: Array<{ period: string; dueMinor: number }>, efficiencyBps: number[]): Array<{ period: string; dueMinor: number; expectedMinor: number; lowMinor: number; highMinor: number }> {
  const known = efficiencyBps.filter((e) => Number.isFinite(e));
  const mean = known.length ? known.reduce((s, e) => s + e, 0) / known.length : 8500;
  const sd = known.length > 1 ? Math.sqrt(known.reduce((s, e) => s + (e - mean) ** 2, 0) / (known.length - 1)) : 800;
  const clamp = (bp: number) => Math.min(10000, Math.max(0, bp));
  return dueByMonth.map((d) => ({
    period: d.period,
    dueMinor: d.dueMinor,
    expectedMinor: Math.round((d.dueMinor * clamp(mean)) / 10000),
    lowMinor: Math.round((d.dueMinor * clamp(mean - sd)) / 10000),
    highMinor: Math.round((d.dueMinor * clamp(mean + sd)) / 10000),
  }));
}

/**
 * توقع التسجيل للعام القادم: المستمرون (الحاليون عدا الصف الأخير × نسبة الاستبقاء)
 * + الملتحقون المتوقعون من طلبات القبول المفتوحة × نسبة التحويل التاريخية.
 */
export function enrollmentForecast(input: { currentActive: number; finalGradeCount: number; retentionBp: number; openApplications: number; conversionBp: number; acceptedPending: number }) {
  const continuing = Math.round(((input.currentActive - input.finalGradeCount) * input.retentionBp) / 10000);
  const fromPipeline = input.acceptedPending + Math.round((input.openApplications * input.conversionBp) / 10000);
  return { continuing, fromPipeline, total: continuing + fromPipeline };
}
