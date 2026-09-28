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

function clockParts(input: Date | string | number, digits: DigitsPreference, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).formatToParts(toDate(input));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase() === "PM" ? "م" : "ص";
  const localize = (v: string) => (digits === "arab" ? v.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!) : v);
  const clock = minute === "00" ? localize(hour) : `${localize(hour)}:${localize(minute)}`;
  return { clock, period };
}

/** وقت مختصر: «١٠ص» أو «١٠:٣٠م» */
export function formatTime(input: Date | string | number, digits: DigitsPreference = "arab", timeZone = DEFAULT_TIMEZONE): string {
  const { clock, period } = clockParts(input, digits, timeZone);
  return `${clock}${period}`;
}

/** نطاق وقت مختصر: «١٠–١١ص» أو «١١ص–١م» */
export function formatTimeRange(start: Date, end: Date, digits: DigitsPreference = "arab", timeZone = DEFAULT_TIMEZONE): string {
  const a = clockParts(start, digits, timeZone);
  const b = clockParts(end, digits, timeZone);
  return a.period === b.period ? `${a.clock}–${b.clock}${b.period}` : `${a.clock}${a.period}–${b.clock}${b.period}`;
}

/** الساعة الحالية في منطقة زمنية (لتحية ثابتة بين الخادم والمتصفح) */
export function hourIn(timeZone = DEFAULT_TIMEZONE, date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(date)) % 24;
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

/** إزاحة المنطقة الزمنية بالدقائق عند لحظة معينة */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** تحويل وقت محلي «YYYY-MM-DDTHH:mm» في منطقة زمنية إلى لحظة UTC */
export function zonedTimeToUtc(local: string, timeZone = DEFAULT_TIMEZONE): Date {
  const [d = "", t = "00:00"] = local.split("T");
  const [y = 1970, m = 1, day = 1] = d.split("-").map(Number);
  const [hh = 0, mm = 0] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const offset = timeZoneOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}
