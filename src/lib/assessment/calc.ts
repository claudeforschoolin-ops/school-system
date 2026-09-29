/**
 * حساب النتائج (دون قاعدة بيانات): نسب المكونات، درجة المادة الموزونة، التقدير، نتيجة الفصل والعام، والترتيب.
 * الدرجات بالأعشار والنسب بنقاط الأساس (١٠٠٪ = 10000)، بعمليات صحيحة وتقريب نصف للأعلى.
 */

export interface SchemeComponent {
  key: string;
  name: string;
  weight: number;
}

export interface GradeBand {
  minBp: number;
  label: string;
  letter: string;
  /** نقاط المعدل (من ٥) بالمئات: 500 = ٥٫٠٠ */
  points: number;
}

export interface Scheme {
  components: SchemeComponent[];
  passBp: number;
  bands: GradeBand[];
  maxSecondRoundSubjects: number;
}

export const DEFAULT_COMPONENTS: SchemeComponent[] = [
  { key: "classwork", name: "المشاركة والتفاعل الصفي", weight: 10 },
  { key: "homework", name: "الواجبات والمهام", weight: 10 },
  { key: "quizzes", name: "الاختبارات القصيرة", weight: 10 },
  { key: "project", name: "المشروع أو النشاط", weight: 10 },
  { key: "midterm", name: "اختبار منتصف الفصل", weight: 20 },
  { key: "final", name: "الاختبار النهائي", weight: 40 },
];

export const DEFAULT_BANDS: GradeBand[] = [
  { minBp: 9000, label: "ممتاز", letter: "A", points: 500 },
  { minBp: 8000, label: "جيد جداً", letter: "B", points: 400 },
  { minBp: 7000, label: "جيد", letter: "C", points: 300 },
  { minBp: 5000, label: "مقبول", letter: "D", points: 200 },
  { minBp: 0, label: "راسب", letter: "F", points: 0 },
];

/** قسمة صحيحة مع تقريب نصف للأعلى (للقيم غير السالبة) */
export function divRound(num: number, den: number): number {
  if (den <= 0) throw new Error("مقام غير صالح");
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) throw new Error("قيم غير صحيحة");
  return Math.floor((num * 2 + den) / (den * 2));
}

export interface MarkInput {
  maxTenths: number;
  scoreTenths: number | null;
  absent?: boolean;
  excused?: boolean;
}

/**
 * نسبة المكوّن: مجموع الدرجات ÷ مجموع العظمى للبنود المحتسبة.
 * الغياب بغير عذر يُحتسب صفراً، والغياب بعذر والبند غير المرصود لا يُحتسبان. null = لا بيانات.
 */
export function componentBp(items: MarkInput[]): number | null {
  let got = 0;
  let max = 0;
  for (const i of items) {
    if (i.excused) continue;
    if (i.absent) {
      max += i.maxTenths;
      continue;
    }
    if (i.scoreTenths === null) continue;
    got += i.scoreTenths;
    max += i.maxTenths;
  }
  return max > 0 ? divRound(got * 10000, max) : null;
}

export interface SubjectResult {
  bp: number | null;
  /** مكونات لم تُرصد بعد */
  missing: string[];
  components: Array<{ key: string; name: string; weight: number; bp: number | null }>;
}

/** درجة المادة: متوسط موزون للمكونات المرصودة (يُعاد توزيع الوزن إن غاب مكوّن ويُعلَّم ناقصاً) */
export function subjectResult(components: SchemeComponent[], byComponent: Record<string, number | null | undefined>): SubjectResult {
  let num = 0;
  let den = 0;
  const missing: string[] = [];
  const out = components.map((c) => {
    const bp = byComponent[c.key] ?? null;
    if (bp === null) missing.push(c.key);
    else {
      num += bp * c.weight;
      den += c.weight;
    }
    return { key: c.key, name: c.name, weight: c.weight, bp };
  });
  return { bp: den > 0 ? divRound(num, den) : null, missing, components: out };
}

export function bandFor(bp: number | null, bands: GradeBand[]): GradeBand | null {
  if (bp === null) return null;
  return [...bands].sort((a, b) => b.minBp - a.minBp).find((b) => bp >= b.minBp) ?? null;
}

export type ResultStatus = "PASS" | "SECOND_ROUND" | "FAIL" | "INCOMPLETE";

export interface TermResult {
  averageBp: number | null;
  /** المعدل بالنقاط (من ٥) بالمئات */
  gpa: number | null;
  failed: number;
  result: ResultStatus;
}

/** نتيجة الطالب: متوسط المواد، وعدد مواد الرسوب ← ناجح / دور ثانٍ / راسب */
export function termResult(subjectBps: Array<number | null>, scheme: Pick<Scheme, "passBp" | "bands" | "maxSecondRoundSubjects">): TermResult {
  const known = subjectBps.filter((b): b is number => b !== null);
  if (!known.length) return { averageBp: null, gpa: null, failed: 0, result: "INCOMPLETE" };
  const averageBp = divRound(known.reduce((s, b) => s + b, 0), known.length);
  const gpa = divRound(known.reduce((s, b) => s + (bandFor(b, scheme.bands)?.points ?? 0), 0), known.length);
  const failed = known.filter((b) => b < scheme.passBp).length;
  const result: ResultStatus = known.length < subjectBps.length ? "INCOMPLETE" : failed === 0 ? "PASS" : failed <= scheme.maxSecondRoundSubjects ? "SECOND_ROUND" : "FAIL";
  return { averageBp, gpa, failed, result };
}

/** ترتيب تنافسي (١، ٢، ٢، ٤) من الأعلى؛ غير المكتمل بلا ترتيب */
export function rankBy<T>(rows: T[], value: (r: T) => number | null): Map<T, number | null> {
  const sorted = rows.filter((r) => value(r) !== null).sort((a, b) => value(b)! - value(a)!);
  const out = new Map<T, number | null>(rows.map((r) => [r, null]));
  let prev: number | null = null;
  let rank = 0;
  sorted.forEach((r, i) => {
    const v = value(r)!;
    if (v !== prev) rank = i + 1;
    prev = v;
    out.set(r, rank);
  });
  return out;
}

/** نسبة مئوية للعرض من نقاط الأساس: 8750 → "87.5" */
export function bpToPercentString(bp: number, fraction = 1): string {
  const scaled = divRound(bp * 10 ** fraction, 100);
  const s = String(scaled).padStart(fraction + 1, "0");
  return fraction ? `${s.slice(0, -fraction)}.${s.slice(-fraction)}` : s;
}

/** أعشار الدرجة ↔ نص: 175 → "17.5" */
export function tenthsToString(tenths: number): string {
  return tenths % 10 === 0 ? String(tenths / 10) : `${Math.trunc(tenths / 10)}.${Math.abs(tenths % 10)}`;
}

/** تحليل درجة مدخلة (أرقام عربية، فاصلة عشرية واحدة كحد أقصى) إلى أعشار */
export function parseTenths(input: string): number | null {
  const t = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫,]/g, ".");
  if (!t) return null;
  const m = /^(\d{1,4})(?:\.(\d))?$/.exec(t);
  if (!m) return Number.NaN;
  return Number(m[1]) * 10 + Number(m[2] ?? 0);
}

export function validateScheme(s: Pick<Scheme, "components" | "bands" | "passBp">): string | null {
  if (!s.components.length) return "أضف مكوّناً واحداً على الأقل";
  const keys = new Set(s.components.map((c) => c.key));
  if (keys.size !== s.components.length) return "رموز المكونات يجب أن تكون مختلفة";
  if (s.components.some((c) => !Number.isInteger(c.weight) || c.weight <= 0)) return "الأوزان أعداد صحيحة موجبة";
  if (s.components.reduce((a, c) => a + c.weight, 0) !== 100) return "مجموع الأوزان يجب أن يساوي ١٠٠";
  if (!s.bands.some((b) => b.minBp === 0)) return "يلزم تقدير يبدأ من الصفر";
  if (s.passBp < 0 || s.passBp > 10000) return "درجة النجاح بين ٠ و١٠٠٪";
  return null;
}
