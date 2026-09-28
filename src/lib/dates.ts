/**
 * التواريخ: دعم الميلادي والهجري (أم القرى) معاً عبر Intl دون مكتبات خارجية.
 */
import { localeFor, type DigitsPreference } from "./numbers";

export type CalendarPreference = "gregory" | "hijri" | "both";

export const DEFAULT_TIMEZONE = "Asia/Riyadh";

export interface DateFormatOptions {
  calendar?: CalendarPreference;
  digits?: DigitsPreference;
  style?: "short" | "medium" | "long" | "full";
  withTime?: boolean;
  timeZone?: string;
}

function toDate(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // تاريخ بدون وقت: نعامله كمنتصف النهار لتجنب انزياح المنطقة الزمنية
    return new Date(`${input}T12:00:00Z`);
  }
  return new Date(input);
}

function formatOne(
  date: Date,
  calendar: "gregory" | "islamic-umalqura",
  { digits = "arab", style = "medium", withTime = false, timeZone = DEFAULT_TIMEZONE }: DateFormatOptions,
): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone };
  if (style === "short") Object.assign(opts, { year: "numeric", month: "2-digit", day: "2-digit" });
  else if (style === "medium") Object.assign(opts, { year: "numeric", month: "short", day: "numeric" });
  else if (style === "long") Object.assign(opts, { year: "numeric", month: "long", day: "numeric" });
  else Object.assign(opts, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  if (withTime) Object.assign(opts, { hour: "numeric", minute: "2-digit" });
  // صيغة اللغة: ar-SA-u-ca-islamic-umalqura-nu-arab
  const tag = `ar-SA-u-ca-${calendar}-nu-${digits}`;
  return new Intl.DateTimeFormat(tag, opts).format(date);
}

/** تنسيق تاريخ حسب تفضيل التقويم (ميلادي، هجري، أو كلاهما) */
export function formatDate(input: Date | string | number, options: DateFormatOptions = {}): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "";
  const calendar = options.calendar ?? "gregory";
  if (calendar === "gregory") return formatOne(date, "gregory", options);
  if (calendar === "hijri") return formatOne(date, "islamic-umalqura", options);
  return `${formatOne(date, "gregory", options)} · ${formatOne(date, "islamic-umalqura", { ...options, withTime: false })}`;
}

export function formatHijri(input: Date | string | number, options: DateFormatOptions = {}): string {
  return formatDate(input, { ...options, calendar: "hijri" });
}

export function formatTime(input: Date | string | number, digits: DigitsPreference = "arab", timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(localeFor(digits), { hour: "numeric", minute: "2-digit", timeZone }).format(toDate(input));
}

/** نطاق وقت مختصر: «١٠–١١ص» */
export function formatTimeRange(start: Date, end: Date, digits: DigitsPreference = "arab", timeZone = DEFAULT_TIMEZONE): string {
  const fmt = new Intl.DateTimeFormat(localeFor(digits), { hour: "numeric", minute: "2-digit", timeZone });
  if (typeof fmt.formatRange === "function") return fmt.formatRange(start, end);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** وقت نسبي بالعربية: «منذ ٥ دقائق» */
export function formatRelative(input: Date | string | number, now: Date = new Date(), digits: DigitsPreference = "arab"): string {
  const date = toDate(input);
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "الآن";
  const rtf = new Intl.RelativeTimeFormat(localeFor(digits), { numeric: "auto" });
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (abs >= seconds) return rtf.format(Math.round(diffSeconds / seconds), unit);
  }
  return rtf.format(Math.round(diffSeconds / 60), "minute");
}

/** YYYY-MM-DD لتاريخ في منطقة زمنية محددة */
export function toISODate(input: Date | string | number, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    toDate(input),
  );
  return parts;
}

export function parseISODate(value: string): Date {
  return toDate(value);
}

/** أسماء أيام الأسبوع بدءاً من الأحد (أسبوع العمل في السعودية يبدأ الأحد) */
export function weekdayNames(style: "long" | "short" | "narrow" = "short"): string[] {
  const base = new Date(Date.UTC(2024, 0, 7, 12)); // يوم أحد
  const fmt = new Intl.DateTimeFormat("ar-SA", { weekday: style, timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(base.getTime() + i * 86400000)));
}

export function monthTitle(year: number, monthIndex: number, calendar: CalendarPreference = "gregory", digits: DigitsPreference = "arab"): string {
  const date = new Date(Date.UTC(year, monthIndex, 15, 12));
  const greg = new Intl.DateTimeFormat(`ar-SA-u-ca-gregory-nu-${digits}`, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  if (calendar === "gregory") return greg;
  const start = new Date(Date.UTC(year, monthIndex, 1, 12));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
  const hFmt = new Intl.DateTimeFormat(`ar-SA-u-ca-islamic-umalqura-nu-${digits}`, { month: "long", year: "numeric", timeZone: "UTC" });
  const h1 = hFmt.format(start);
  const h2 = hFmt.format(end);
  const hijri = h1 === h2 ? h1 : `${h1.split(" ")[0]} – ${h2}`;
  return calendar === "hijri" ? hijri : `${greg} · ${hijri}`;
}

/** رقم اليوم الهجري لعرضه صغيراً في خانات التقويم */
export function hijriDayNumber(input: Date | string, digits: DigitsPreference = "arab"): string {
  return new Intl.DateTimeFormat(`ar-SA-u-ca-islamic-umalqura-nu-${digits}`, { day: "numeric", timeZone: "UTC" }).format(
    toDate(input),
  );
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "صباح الخير";
  return "مساء الخير";
}
