/**
 * حسابات العمليات (دون قاعدة بيانات) بأعداد صحيحة بأصغر وحدة وتقريب نصف للأعلى:
 * الإهلاك (قسط ثابت ومتناقص)، التكلفة بالمتوسط المرجّح، غرامات المكتبة، رسوم النقل النسبية،
 * حالة استهلاك الموازنة، وإجماليات نقطة البيع.
 */
import { applyBp } from "@/lib/finance/calc";
import { divRound } from "@/lib/hr/calc";

export type DepreciationMethod = "STRAIGHT_LINE" | "DECLINING" | "NONE";

export interface DepreciableAsset {
  costMinor: number;
  salvageMinor: number;
  usefulLifeMonths: number;
  method: DepreciationMethod | string;
  /** نسبة سنوية للمتناقص (نقاط أساس)؛ الافتراضي ضعف القسط الثابت */
  decliningRateBp?: number | null;
  accumulatedMinor: number;
  /** عدد الأشهر المهلكة حتى الآن */
  monthsElapsed: number;
}

/**
 * قسط الشهر: القسط الثابت = (التكلفة − الخردة) ÷ العمر، والشهر الأخير يستكمل الباقي تماماً.
 * المتناقص: القيمة الدفترية × النسبة السنوية ÷ ١٢، ولا تنزل القيمة تحت الخردة، ويُستكمل الباقي في آخر شهر من العمر.
 */
export function monthlyDepreciation(a: DepreciableAsset): number {
  if (a.method === "NONE") return 0;
  const depreciable = a.costMinor - a.salvageMinor;
  const remaining = depreciable - a.accumulatedMinor;
  if (remaining <= 0) return 0;
  const monthsLeft = a.usefulLifeMonths - a.monthsElapsed;
  if (monthsLeft <= 1) return remaining;
  if (a.method === "DECLINING") {
    const rate = a.decliningRateBp ?? Math.round((2 * 12 * 10000) / a.usefulLifeMonths);
    const book = a.costMinor - a.accumulatedMinor;
    const d = divRound(book * rate, 12 * 10000);
    // يتحول إلى القسط الثابت للباقي حين يصبح أكبر (كما في الممارسة المحاسبية)
    const sl = divRound(remaining, monthsLeft);
    return Math.min(remaining, Math.max(d, sl));
  }
  const base = Math.floor(depreciable / a.usefulLifeMonths);
  return Math.min(remaining, base);
}

/** جدول الإهلاك الكامل (للعرض والاختبار) */
export function depreciationSchedule(a: Omit<DepreciableAsset, "accumulatedMinor" | "monthsElapsed">): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let m = 0; m < a.usefulLifeMonths; m++) {
    const d = monthlyDepreciation({ ...a, accumulatedMinor: acc, monthsElapsed: m });
    out.push(d);
    acc += d;
  }
  return out;
}

/** عدد الأشهر بين شهرين YYYY-MM (شاملة) */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [y1 = 0, m1 = 1] = fromMonth.split("-").map(Number);
  const [y2 = 0, m2 = 1] = toMonth.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export const nextMonth = (month: string) => {
  const [y = 2000, m = 1] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** ربح/خسارة الاستبعاد: المتحصلات − القيمة الدفترية */
export function disposalGain(costMinor: number, accumulatedMinor: number, proceedsMinor: number) {
  return proceedsMinor - (costMinor - accumulatedMinor);
}

/** تكلفة الصرف بالمتوسط المرجّح؛ آخر وحدة تأخذ كامل القيمة المتبقية (لا فروق تقريب عالقة) */
export function issueCost(onHandQty: number, stockValueMinor: number, qty: number): number {
  if (qty <= 0) throw new Error("كمية غير صالحة");
  if (qty > onHandQty) throw new Error("الكمية أكبر من الرصيد");
  if (qty === onHandQty) return stockValueMinor;
  return divRound(stockValueMinor * qty, onHandQty);
}

export const averageCost = (onHandQty: number, stockValueMinor: number) => (onHandQty > 0 ? divRound(stockValueMinor, onHandQty) : 0);

/** غرامة التأخير: أيام التأخير بعد المهلة × غرامة اليوم، بحد أعلى (0 = بلا حد) */
export function libraryFine(dueIso: string, returnedIso: string, rules: { finePerDayMinor: number; fineCapMinor: number; graceDays: number }) {
  const days = Math.round((Date.parse(`${returnedIso}T00:00:00Z`) - Date.parse(`${dueIso}T00:00:00Z`)) / 86_400_000);
  const late = Math.max(0, days - rules.graceDays);
  const fine = late * rules.finePerDayMinor;
  return { lateDays: Math.max(0, days), fineMinor: rules.fineCapMinor > 0 ? Math.min(fine, rules.fineCapMinor) : fine };
}

/**
 * رسوم النقل عند التسكين: الرسوم السنوية × نسبة الاتجاه (للاتجاه الواحد) × الأشهر المتبقية ÷ أشهر العام.
 * الشهر الجاري يُحتسب كاملاً.
 */
export function transportFee(input: { annualFeeMinor: number; direction: "BOTH" | "MORNING" | "AFTERNOON"; oneWayBp: number; prorate: boolean; yearStartIso: string; yearEndIso: string; startIso: string }) {
  const base = input.direction === "BOTH" ? input.annualFeeMinor : applyBp(input.annualFeeMinor, input.oneWayBp);
  if (!input.prorate || input.startIso <= input.yearStartIso) return { amountMinor: base, months: null as number | null, totalMonths: null as number | null };
  const totalMonths = monthsBetween(input.yearStartIso.slice(0, 7), input.yearEndIso.slice(0, 7));
  const months = Math.max(0, Math.min(totalMonths, monthsBetween(input.startIso.slice(0, 7), input.yearEndIso.slice(0, 7))));
  return { amountMinor: divRound(base * months, totalMonths), months, totalMonths };
}

export type BudgetState = "OK" | "WARNING" | "OVER" | "NONE";

/** حالة الاستهلاك: أخضر، برتقالي عند نسبة التنبيه، أحمر عند التجاوز */
export function budgetState(budgetMinor: number, actualMinor: number, warnBp = 8000): { state: BudgetState; usedBp: number } {
  if (budgetMinor <= 0) return { state: actualMinor > 0 ? "OVER" : "NONE", usedBp: actualMinor > 0 ? 10001 : 0 };
  const usedBp = Math.floor((actualMinor * 10000) / budgetMinor);
  return { state: actualMinor > budgetMinor ? "OVER" : usedBp >= warnBp ? "WARNING" : "OK", usedBp };
}

/** نسخ موازنة بزيادة نسبة (نقاط أساس) مع تقريب نصف للأعلى */
export const upliftBudget = (amountMinor: number, upliftBp: number) => amountMinor + applyBp(amountMinor, upliftBp);

export interface PosLineInput {
  unitMinor: number;
  quantity: number;
  taxBp: number;
}

/** إجماليات نقطة البيع: الضريبة لكل سطر بتقريب نصف للأعلى */
export function posTotals(lines: PosLineInput[]) {
  const out = lines.map((l) => {
    const net = l.unitMinor * l.quantity;
    const tax = applyBp(net, l.taxBp);
    return { netMinor: net, taxMinor: tax, totalMinor: net + tax };
  });
  return {
    lines: out,
    subtotalMinor: out.reduce((s, l) => s + l.netMinor, 0),
    taxMinor: out.reduce((s, l) => s + l.taxMinor, 0),
    totalMinor: out.reduce((s, l) => s + l.totalMinor, 0),
  };
}

/** هل يتجاوز الشراء حد الإنفاق اليومي */
export const exceedsDailyLimit = (spentTodayMinor: number, amountMinor: number, dailyLimitMinor: number | null | undefined) => dailyLimitMinor !== null && dailyLimitMinor !== undefined && dailyLimitMinor > 0 && spentTodayMinor + amountMinor > dailyLimitMinor;

/** تداخل فترتين زمنيتين HH:MM */
export const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

/** تحقق ISBN-10/13 (خانة التحقق) بعد حذف الشرطات والمسافات */
export function isbnValid(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = s.split("").reduce((t, c, i) => t + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    const sum = s.split("").reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  return false;
}

/** تاريخ + أيام (ISO) */
export const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
