import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** دمج أصناف Tailwind مع إزالة التعارضات */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** تأخير بسيط (للاختبارات والحركات) */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** تجميع مصفوفة حسب مفتاح */
export function groupBy<T, K extends string | number>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** الأحرف الأولى من الاسم للصورة الرمزية */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/** تحويل آمن لقيمة JSON مجهولة إلى كائن */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** تطبيع النص العربي للبحث: إزالة التشكيل وتوحيد الهمزات والتاء المربوطة والياء */
export function normalizeArabic(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .trim();
}

export function matchesSearch(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return normalizeArabic(haystack).includes(normalizeArabic(needle));
}
