/**
 * تنسيق الأرقام حسب تفضيل المستخدم: أرقام عربية (٠١٢٣) أو لاتينية (0123).
 */
export type DigitsPreference = "arab" | "latn";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function localeFor(digits: DigitsPreference): string {
  return `ar-SA-u-nu-${digits}`;
}

export function formatNumber(value: number, digits: DigitsPreference = "arab", options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeFor(digits), options).format(value);
}

export function formatPercent(value: number, digits: DigitsPreference = "arab", fractionDigits = 0): string {
  return new Intl.NumberFormat(localeFor(digits), {
    style: "percent",
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** تحويل الأرقام اللاتينية داخل نص إلى عربية */
export function toArabicDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

/** تحويل الأرقام العربية/الفارسية داخل نص إلى لاتينية */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

export function applyDigits(input: string | number, digits: DigitsPreference): string {
  return digits === "arab" ? toArabicDigits(input) : toLatinDigits(String(input));
}
