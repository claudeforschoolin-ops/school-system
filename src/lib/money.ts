/**
 * المبالغ المالية: تُخزَّن دائماً كأعداد صحيحة بأصغر وحدة (هللة/فلس).
 * ممنوع استخدام الكسور العشرية (float) في الحساب — التحويل إلى عشري للعرض فقط
 * ويتم عبر نص عشري دقيق وليس عبر القسمة.
 */
import { localeFor, toLatinDigits, type DigitsPreference } from "./numbers";

const fractionDigitsCache = new Map<string, number>();

/** عدد المنازل العشرية للعملة (SAR=2، KWD=3، JPY=0...) */
export function currencyFractionDigits(currency: string): number {
  const cached = fractionDigitsCache.get(currency);
  if (cached !== undefined) return cached;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  fractionDigitsCache.set(currency, digits);
  return digits;
}

export class MoneyError extends Error {}

/** تحويل مبلغ بأصغر وحدة إلى نص عشري دقيق: 123450 → "1234.50" */
export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new MoneyError("المبلغ يجب أن يكون عدداً صحيحاً بأصغر وحدة");
  const digits = currencyFractionDigits(currency);
  const negative = minor < 0;
  const abs = String(Math.abs(minor)).padStart(digits + 1, "0");
  const intPart = digits === 0 ? abs : abs.slice(0, -digits);
  const fracPart = digits === 0 ? "" : abs.slice(-digits);
  return `${negative ? "-" : ""}${intPart}${digits ? "." + fracPart : ""}`;
}

/**
 * تحليل مبلغ مُدخل من المستخدم إلى أصغر وحدة دون أي عمليات عشرية.
 * يقبل الأرقام العربية والفواصل العربية (٫ ٬) والفواصل اللاتينية.
 */
export function parseMoney(input: string | number, currency: string): number {
  const digits = currencyFractionDigits(currency);
  let raw = typeof input === "number" ? String(input) : input;
  raw = toLatinDigits(raw).replace(/[٬,\s ]/g, "").replace(/٫/g, ".").replace(/[^\d.\-]/g, "");
  if (!/^-?\d*(\.\d*)?$/.test(raw) || raw === "" || raw === "-" || raw === ".") {
    throw new MoneyError("صيغة المبلغ غير صحيحة");
  }
  const negative = raw.startsWith("-");
  const [intPartRaw = "0", fracRaw = ""] = raw.replace("-", "").split(".");
  if (fracRaw.length > digits) {
    throw new MoneyError(`لا يُسمح بأكثر من ${digits} منازل عشرية لهذه العملة`);
  }
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const composed = intPart + fracRaw.padEnd(digits, "0");
  const value = Number(composed);
  if (!Number.isSafeInteger(value)) throw new MoneyError("المبلغ أكبر من الحد المسموح");
  return negative ? -value : value;
}

export interface FormatMoneyOptions {
  currency: string;
  digits?: DigitsPreference;
  /** إظهار رمز العملة */
  symbol?: boolean;
}

/** عرض المبلغ بتنسيق عربي سليم */
export function formatMoney(minor: number, { currency, digits = "arab", symbol = true }: FormatMoneyOptions): string {
  const decimal = minorToDecimalString(minor, currency);
  const fraction = currencyFractionDigits(currency);
  const formatter = new Intl.NumberFormat(localeFor(digits), {
    style: symbol ? "currency" : "decimal",
    currency: symbol ? currency : undefined,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
  // format يقبل نصاً عشرياً دقيقاً (ES2023) فلا يحدث فقد في الدقة
  return formatter.format(decimal as unknown as number);
}

/** جمع مبالغ بأصغر وحدة مع التحقق من الحدود */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new MoneyError("قيمة غير صالحة في الجمع");
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError("تجاوز المجموع الحد المسموح");
  }
  return total;
}

/**
 * توزيع مبلغ على أجزاء بنسب دون فقد هللات (طريقة الباقي الأكبر).
 * مثال: توزيع 100.00 على ٣ أقساط → 33.34 + 33.33 + 33.33
 */
export function allocateMinor(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new MoneyError("المبلغ يجب أن يكون عدداً صحيحاً");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || weightSum <= 0) throw new MoneyError("أوزان التوزيع غير صالحة");
  const raw = weights.map((w) => (total * w) / weightSum);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    const idx = order[k]!.i;
    floored[idx] = floored[idx]! + 1;
  }
  return floored;
}

/** رمز العملة بالعربية (ر.س.، د.إ.، د.ك.، $…) */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("ar", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency");
    return part?.value.replace(/\u200f/g, "") ?? currency;
  } catch {
    return currency;
  }
}

/** اسم العملة بالعربية (ريال سعودي، درهم إماراتي…) */
export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames("ar", { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}
