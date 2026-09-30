/**
 * جدولة التقارير وقواعد الأتمتة بتوقيت المدرسة (نقي).
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReportSchedule {
  frequency: Frequency;
  /** HH:MM بتوقيت المدرسة */
  time: string;
  /** للأسبوعي: ٠ = الأحد … ٦ = السبت */
  weekday?: number | null;
  /** للشهري: ١..٢٨ */
  monthDay?: number | null;
  format: "XLSX" | "CSV";
  userIds: string[];
  emails: string[];
}

export const FREQUENCY_LABEL: Record<Frequency, string> = { DAILY: "يومياً", WEEKLY: "أسبوعياً", MONTHLY: "شهرياً" };
export const WEEKDAY_LABEL = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** فرق التوقيت (ملّي ثانية) لمنطقة زمنية عند لحظة معينة */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** اللحظة (UTC) الموافقة لتاريخ ووقت محليين في منطقة زمنية */
export function zonedTime(dateIso: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  // تصحيح ثانٍ عند عبور التوقيت الصيفي
  return new Date(guess - tzOffsetMs(new Date(first), timeZone));
}

function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** أقرب موعد تشغيل بعد لحظة معينة */
export function nextRunAt(s: Pick<ReportSchedule, "frequency" | "time" | "weekday" | "monthDay">, after: Date, timeZone: string): Date {
  const start = localDate(after, timeZone);
  for (let i = 0; i < 400; i++) {
    const day = addDays(start, i);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const dom = Number(day.slice(8, 10));
    const ok = s.frequency === "DAILY" || (s.frequency === "WEEKLY" && dow === (s.weekday ?? 0)) || (s.frequency === "MONTHLY" && dom === Math.min(28, Math.max(1, s.monthDay ?? 1)));
    if (!ok) continue;
    const at = zonedTime(day, s.time, timeZone);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("تعذر حساب موعد التشغيل التالي");
}

export function describeSchedule(s: Pick<ReportSchedule, "frequency" | "time" | "weekday" | "monthDay">): string {
  if (s.frequency === "DAILY") return `يومياً الساعة ${s.time}`;
  if (s.frequency === "WEEKLY") return `كل ${WEEKDAY_LABEL[s.weekday ?? 0]} الساعة ${s.time}`;
  return `يوم ${s.monthDay ?? 1} من كل شهر الساعة ${s.time}`;
}
