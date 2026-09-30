/**
 * تسميات القيم لمجموعات بيانات التقارير (مشتركة بين الخادم والواجهة، بلا ألوان).
 */
import { ADMISSION_STAGE, ATTENDANCE_STATUS, BEHAVIOR_KIND, GENDER, SEVERITY, STUDENT_STATUS } from "@/lib/students";
import { ACCOUNT_TYPE, INVOICE_STATUS, JOURNAL_SOURCE, PAYMENT_METHOD, VOUCHER_STATUS } from "@/lib/finance/labels";

const flat = (m: Record<string, { label: string }>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.label]));

export const L = {
  gender: flat(GENDER),
  studentStatus: flat(STUDENT_STATUS),
  admissionStage: flat(ADMISSION_STAGE),
  attendance: flat(ATTENDANCE_STATUS),
  behaviorKind: flat(BEHAVIOR_KIND),
  severity: flat(SEVERITY),
  invoiceStatus: flat(INVOICE_STATUS),
  paymentMethod: flat(PAYMENT_METHOD),
  voucherStatus: flat(VOUCHER_STATUS),
  accountType: flat(ACCOUNT_TYPE),
  journalSource: flat(JOURNAL_SOURCE),
  employeeStatus: { ACTIVE: "على رأس العمل", ON_LEAVE: "في إجازة", SUSPENDED: "موقوف", TERMINATED: "منتهية خدمته" },
  employeeCategory: { ACADEMIC: "هيئة تعليمية", ADMIN: "إداري", SERVICES: "خدمات" },
  staffAttendance: { PRESENT: "حاضر", LATE: "متأخر", ABSENT: "غائب", ON_LEAVE: "في إجازة", HOLIDAY: "عطلة", EXCUSED: "غياب بعذر" },
  requestStatus: { PENDING: "بانتظار الموافقة", APPROVED: "معتمدة", REJECTED: "مرفوضة", CANCELLED: "ملغاة" },
  termResult: { PASS: "ناجح", SECOND_ROUND: "دور ثانٍ", FAIL: "راسب", INCOMPLETE: "غير مكتمل" },
  maintStatus: { NEW: "جديد", IN_PROGRESS: "قيد التنفيذ", WAITING_PARTS: "بانتظار قطع", DONE: "مكتمل", CANCELLED: "ملغى" },
  maintCategory: { ELECTRICAL: "كهرباء", PLUMBING: "سباكة", HVAC: "تكييف", CARPENTRY: "نجارة", IT: "تقنية", CLEANING: "نظافة", SAFETY: "سلامة", VEHICLE: "مركبات", OTHER: "أخرى" },
  priority: { LOW: "منخفضة", MEDIUM: "متوسطة", HIGH: "عالية", URGENT: "عاجلة" },
  itemCategory: { SUPPLY: "مستلزمات", UNIFORM: "زي مدرسي", BOOK: "كتب", CANTEEN: "مقصف", SPARE_PART: "قطع غيار", MEDICAL: "طبي", OTHER: "أخرى" },
  saleKind: { STORE: "المتجر", CANTEEN: "المقصف" },
  salePay: { CASH: "نقداً", CARD: "بطاقة", STUDENT_ACCOUNT: "على حساب الطالب", WALLET: "المحفظة" },
  saleStatus: { COMPLETED: "مكتملة", VOIDED: "ملغاة" },
  direction: { BOTH: "ذهاب وعودة", MORNING: "ذهاب فقط", AFTERNOON: "عودة فقط" },
  assignmentStatus: { ACTIVE: "نشط", ENDED: "منتهٍ" },
  fineStatus: { NONE: "لا غرامة", PENDING: "مستحقة", INVOICED: "مفوترة", PAID: "مسددة", WAIVED: "معفاة" },
  visitorStatus: { EXPECTED: "متوقع", INSIDE: "بالداخل", LEFT: "غادر" },
} as const;
