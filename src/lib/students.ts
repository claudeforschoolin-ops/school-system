/**
 * ثوابت ووسوم شؤون الطلاب والأكاديمي — مشتركة بين الواجهة والخادم.
 * الألوان من لوحة الوسوم الهادئة فقط (OPTION_COLORS).
 */
import type { OptionColor, SelectOption } from "@/lib/database/types";

type Labeled<K extends string> = Record<K, { label: string; color: OptionColor }>;

export const STUDENT_STATUS = {
  ACTIVE: { label: "منتظم", color: "green" },
  INACTIVE: { label: "منقطع", color: "orange" },
  TRANSFERRED: { label: "منقول", color: "slate" },
  GRADUATED: { label: "متخرج", color: "navy" },
  WITHDRAWN: { label: "منسحب", color: "red" },
  DEFERRED: { label: "مؤجل", color: "gold" },
} as const satisfies Labeled<string>;
export type StudentStatusKey = keyof typeof STUDENT_STATUS;

export const ADMISSION_STAGE = {
  NEW: { label: "طلب جديد", color: "gray" },
  REVIEW: { label: "قيد المراجعة", color: "gold" },
  ASSESSMENT: { label: "اختبار/مقابلة", color: "purple" },
  ACCEPTED: { label: "مقبول", color: "teal" },
  WAITLIST: { label: "قائمة انتظار", color: "orange" },
  REJECTED: { label: "مرفوض", color: "red" },
  ENROLLED: { label: "مسجّل", color: "green" },
} as const satisfies Labeled<string>;
export type AdmissionStageKey = keyof typeof ADMISSION_STAGE;
/** ترتيب أعمدة لوحة القبول */
export const ADMISSION_FLOW: AdmissionStageKey[] = ["NEW", "REVIEW", "ASSESSMENT", "ACCEPTED", "WAITLIST", "REJECTED", "ENROLLED"];
/** مراحل لم يُحسم فيها الطلب بعد (يُمنع تكرار الهوية بينها) */
export const OPEN_ADMISSION_STAGES: AdmissionStageKey[] = ["NEW", "REVIEW", "ASSESSMENT", "ACCEPTED", "WAITLIST"];

export const ATTENDANCE_STATUS = {
  PRESENT: { label: "حاضر", color: "green", short: "ح" },
  ABSENT: { label: "غائب", color: "red", short: "غ" },
  LATE: { label: "متأخر", color: "gold", short: "م" },
  PERMISSION: { label: "مستأذن", color: "purple", short: "س" },
  EXCUSED: { label: "بعذر", color: "slate", short: "ع" },
} as const satisfies Record<string, { label: string; color: OptionColor; short: string }>;
export type AttendanceStatusKey = keyof typeof ATTENDANCE_STATUS;
export const ATTENDANCE_ORDER: AttendanceStatusKey[] = ["PRESENT", "ABSENT", "LATE", "PERMISSION", "EXCUSED"];
/** حالات تُحسب غياباً في النسب والتنبيهات */
export const COUNTS_AS_ABSENCE: AttendanceStatusKey[] = ["ABSENT"];

export const GUARDIAN_RELATION = {
  FATHER: { label: "الأب", color: "navy" },
  MOTHER: { label: "الأم", color: "purple" },
  GUARDIAN: { label: "الوصي", color: "teal" },
  OTHER: { label: "آخر", color: "gray" },
} as const satisfies Labeled<string>;

export const ID_TYPE = {
  NATIONAL_ID: { label: "هوية وطنية", color: "navy" },
  IQAMA: { label: "إقامة", color: "teal" },
  PASSPORT: { label: "جواز سفر", color: "slate" },
} as const satisfies Labeled<string>;

export const GENDER = {
  MALE: { label: "ذكر", color: "navy" },
  FEMALE: { label: "أنثى", color: "purple" },
} as const satisfies Labeled<string>;

export const TRANSFER_TYPE = {
  SECTION: { label: "نقل بين الفصول", color: "slate" },
  GRADE: { label: "نقل صف/مرحلة", color: "navy" },
  INCOMING: { label: "قادم من مدرسة أخرى", color: "teal" },
  OUTGOING: { label: "إلى مدرسة أخرى", color: "orange" },
  WITHDRAWAL: { label: "انسحاب", color: "red" },
} as const satisfies Labeled<string>;

export const TRANSFER_STATUS = {
  PENDING: { label: "بانتظار الموافقات", color: "gold" },
  APPROVED: { label: "معتمد", color: "teal" },
  REJECTED: { label: "مرفوض", color: "red" },
  COMPLETED: { label: "منفّذ", color: "green" },
  CANCELLED: { label: "ملغى", color: "gray" },
} as const satisfies Labeled<string>;

export const REQUEST_STATUS = {
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمد", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
  CANCELLED: { label: "ملغى", color: "gray" },
} as const satisfies Labeled<string>;

export const LEAVE_KIND = {
  LEAVE: { label: "إجازة", color: "slate" },
  EARLY_DISMISSAL: { label: "استئذان", color: "purple" },
} as const satisfies Labeled<string>;

export const SEVERITY = {
  LOW: { label: "منخفضة", color: "gray" },
  MEDIUM: { label: "متوسطة", color: "gold" },
  HIGH: { label: "عالية", color: "orange" },
  CRITICAL: { label: "حرجة", color: "red" },
} as const satisfies Labeled<string>;

export const BEHAVIOR_KIND = {
  POSITIVE: { label: "إيجابي", color: "green" },
  NEGATIVE: { label: "سلبي", color: "red" },
} as const satisfies Labeled<string>;

/** تصنيفات السلوك الافتراضية مع نقاطها (قابلة للتعديل من إعدادات الوحدة) */
export const BEHAVIOR_CATEGORIES: Array<{ id: string; label: string; kind: "POSITIVE" | "NEGATIVE"; points: number; color: OptionColor }> = [
  { id: "excellence", label: "تميّز دراسي", kind: "POSITIVE", points: 5, color: "green" },
  { id: "participation", label: "مشاركة فاعلة", kind: "POSITIVE", points: 3, color: "teal" },
  { id: "helping", label: "مساعدة الآخرين", kind: "POSITIVE", points: 3, color: "navy" },
  { id: "volunteering", label: "عمل تطوعي", kind: "POSITIVE", points: 4, color: "purple" },
  { id: "lateness", label: "تأخر صباحي", kind: "NEGATIVE", points: -1, color: "gold" },
  { id: "absence", label: "غياب متكرر", kind: "NEGATIVE", points: -3, color: "orange" },
  { id: "uniform", label: "مخالفة الزي", kind: "NEGATIVE", points: -1, color: "brown" },
  { id: "disruption", label: "إخلال بالنظام", kind: "NEGATIVE", points: -2, color: "orange" },
  { id: "disrespect", label: "إساءة لفظية", kind: "NEGATIVE", points: -4, color: "red" },
  { id: "bullying", label: "تنمّر", kind: "NEGATIVE", points: -6, color: "red" },
  { id: "devices", label: "استخدام الجوال", kind: "NEGATIVE", points: -2, color: "slate" },
];

export const CASE_STATUS = {
  OPEN: { label: "مفتوحة", color: "gold" },
  IN_PROGRESS: { label: "قيد المتابعة", color: "navy" },
  MONITORING: { label: "مراقبة", color: "purple" },
  CLOSED: { label: "مغلقة", color: "green" },
} as const satisfies Labeled<string>;

export const CASE_CATEGORIES: SelectOption[] = [
  { id: "academic", name: "أكاديمية", color: "navy" },
  { id: "behavioral", name: "سلوكية", color: "orange" },
  { id: "social", name: "اجتماعية", color: "teal" },
  { id: "psychological", name: "نفسية", color: "purple" },
  { id: "health", name: "صحية", color: "red" },
  { id: "family", name: "أسرية", color: "brown" },
];

export const ACTIVITY_KIND = {
  CLUB: { label: "نادٍ", color: "navy" },
  COMMITTEE: { label: "لجنة", color: "slate" },
  TRIP: { label: "رحلة", color: "teal" },
  COMPETITION: { label: "مسابقة", color: "gold" },
  EVENT: { label: "فعالية", color: "purple" },
} as const satisfies Labeled<string>;

export const ACTIVITY_STATUS = {
  PLANNED: { label: "مخطط", color: "gray" },
  REGISTRATION: { label: "التسجيل مفتوح", color: "teal" },
  IN_PROGRESS: { label: "جارٍ", color: "navy" },
  COMPLETED: { label: "منتهٍ", color: "green" },
  CANCELLED: { label: "ملغى", color: "red" },
} as const satisfies Labeled<string>;

export const DOCUMENT_TYPES: Array<{ id: string; label: string; required: boolean }> = [
  { id: "BIRTH_CERTIFICATE", label: "شهادة الميلاد", required: true },
  { id: "ID_COPY", label: "صورة الهوية/الإقامة", required: true },
  { id: "LAST_REPORT", label: "آخر شهادة دراسية", required: true },
  { id: "VACCINATION", label: "سجل التطعيمات", required: true },
  { id: "PHOTO", label: "صورة شخصية", required: true },
  { id: "MEDICAL", label: "تقرير طبي", required: false },
  { id: "OTHER", label: "مستند آخر", required: false },
];

export const ADMISSION_SOURCES: SelectOption[] = [
  { id: "sibling", name: "أخ/أخت في المدرسة", color: "green" },
  { id: "friend", name: "توصية من معارف", color: "teal" },
  { id: "social", name: "وسائل التواصل", color: "purple" },
  { id: "website", name: "الموقع الإلكتروني", color: "navy" },
  { id: "signboard", name: "لوحات إعلانية", color: "gold" },
  { id: "other", name: "أخرى", color: "gray" },
];

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const TRANSPORT_MODES: SelectOption[] = [
  { id: "BUS", name: "حافلة المدرسة", color: "gold" },
  { id: "GUARDIAN", name: "ولي الأمر", color: "navy" },
  { id: "PRIVATE", name: "سائق خاص", color: "slate" },
  { id: "WALK", name: "مشياً", color: "green" },
];

export const NATIONALITIES: SelectOption[] = [
  { id: "SA", name: "سعودي", color: "green" },
  { id: "EG", name: "مصري", color: "gold" },
  { id: "JO", name: "أردني", color: "navy" },
  { id: "SY", name: "سوري", color: "teal" },
  { id: "YE", name: "يمني", color: "brown" },
  { id: "SD", name: "سوداني", color: "orange" },
  { id: "PK", name: "باكستاني", color: "slate" },
  { id: "IN", name: "هندي", color: "purple" },
  { id: "OTHER", name: "أخرى", color: "gray" },
];

export const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

export const ROOM_KINDS: SelectOption[] = [
  { id: "CLASSROOM", name: "فصل", color: "gray" },
  { id: "LAB", name: "مختبر", color: "teal" },
  { id: "COMPUTER", name: "معمل حاسب", color: "navy" },
  { id: "GYM", name: "صالة رياضية", color: "green" },
  { id: "LIBRARY", name: "مصادر التعلم", color: "brown" },
  { id: "ART", name: "مرسم", color: "purple" },
  { id: "HALL", name: "مسرح/قاعة", color: "gold" },
];

/** يحوّل خريطة وسوم إلى خيارات لخاصية اختيار */
export function toOptions(map: Record<string, { label: string; color: OptionColor }>, order?: readonly string[]): SelectOption[] {
  const keys = order ?? Object.keys(map);
  return keys.map((k) => ({ id: k, name: map[k]!.label, color: map[k]!.color }));
}

/** الاسم الرباعي */
export function composeFullName(parts: { firstName: string; fatherName?: string | null; grandfatherName?: string | null; familyName?: string | null }): string {
  return [parts.firstName, parts.fatherName, parts.grandfatherName, parts.familyName].map((p) => p?.trim()).filter(Boolean).join(" ");
}

/** تقسيم اسم مكتوب في حقل واحد إلى أجزائه الأربعة (الأخير = العائلة) */
export function splitFullName(name: string): { firstName: string; fatherName: string; grandfatherName: string; familyName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const familyName = parts.length ? parts.pop()! : "";
  const fatherName = parts.shift() ?? "";
  const grandfatherName = parts.join(" ");
  return { firstName, fatherName, grandfatherName, familyName };
}

/**
 * التحقق من رقم الهوية الوطنية/الإقامة السعودية: ١٠ أرقام تبدأ بـ ١ (مواطن) أو ٢ (مقيم)
 * مع خانة تحقق (خوارزمية لون على الأرقام العشرة).
 */
export function isValidSaudiId(raw: string): boolean {
  const id = normalizeDigits(raw);
  if (!/^[12]\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(id[i]);
    if (i % 2 === 0) {
      const doubled = d * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else sum += d;
  }
  return sum % 10 === 0;
}

export function normalizeDigits(raw: string): string {
  return raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\s|-/g, "");
}

/** التحقق من رقم الهوية حسب نوعها */
export function validateIdNumber(type: "NATIONAL_ID" | "IQAMA" | "PASSPORT", raw: string): string | null {
  const id = normalizeDigits(raw);
  if (type === "PASSPORT") return /^[A-Z0-9]{6,12}$/i.test(id) ? null : "رقم الجواز غير صالح";
  if (!isValidSaudiId(id)) return "رقم الهوية غير صالح";
  if (type === "NATIONAL_ID" && !id.startsWith("1")) return "رقم الهوية الوطنية يبدأ بالرقم ١";
  if (type === "IQAMA" && !id.startsWith("2")) return "رقم الإقامة يبدأ بالرقم ٢";
  return null;
}

/** جوال سعودي بصيغة 05XXXXXXXX أو +9665XXXXXXXX */
export function normalizeSaudiMobile(raw: string): string | null {
  const d = normalizeDigits(raw).replace(/[()+]/g, "");
  const m = d.match(/^(?:966|0)?(5\d{8})$/);
  return m ? `05${m[1]!.slice(1)}` : null;
}

/** العمر بالسنوات عند تاريخ مرجعي */
export function ageAt(birthDate: Date | string, at = new Date()): number {
  const b = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  let age = at.getUTCFullYear() - b.getUTCFullYear();
  if (at.getUTCMonth() < b.getUTCMonth() || (at.getUTCMonth() === b.getUTCMonth() && at.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
