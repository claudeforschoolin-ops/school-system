/**
 * أدوات سجل التدقيق: حجب الحقول الحساسة، واستخراج الفروقات.
 */

/** حقول لا تُكتب قيمتها في سجل التدقيق أبداً */
export const REDACTED_FIELDS = new Set([
  "passwordHash",
  "twoFactorSecret",
  "twoFactorBackup",
  "tokenHash",
  "codeHash",
]);

/** حقول كبيرة يُكتفى بتلخيصها (المحتوى النصي محفوظ في نسخ الصفحات) */
export const SUMMARIZED_FIELDS = new Set(["content"]);

/** حقول تقنية لا معنى لتسجيل تغيّرها */
export const IGNORED_DIFF_FIELDS = new Set(["updatedAt", "updatedById", "lastActiveAt", "rowCounter", "nextValue"]);

function summarize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const json = JSON.stringify(value);
  return { __summary: `محتوى (${json.length} حرف)` };
}

export function redact(record: unknown): Record<string, unknown> | null {
  if (!record || typeof record !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(key)) out[key] = value == null ? value : "[محجوب]";
    else if (SUMMARIZED_FIELDS.has(key)) out[key] = summarize(value);
    else if (value instanceof Date) out[key] = value.toISOString();
    else if (typeof value === "bigint") out[key] = value.toString();
    else if (value && typeof value === "object" && "toFixed" in (value as object)) out[key] = String(value);
    else out[key] = value;
  }
  return out;
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ad = a instanceof Date ? a.toISOString() : a;
    const bd = b instanceof Date ? b.toISOString() : b;
    return ad === bd;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface Diff {
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  changed: string[];
}

/** يستخرج الحقول التي تغيّرت فقط بين نسختين */
export function diffRecords(before: unknown, after: unknown): Diff {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const changed: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    if (!stableEqual(a[key], b[key])) changed.push(key);
  }
  const pick = (rec: Record<string, unknown>) =>
    redact(Object.fromEntries(changed.filter((k) => k in rec).map((k) => [k, rec[k]]))) ?? {};
  return { oldValue: pick(a), newValue: pick(b), changed };
}

/** وصف عربي مختصر للكيان في سجل التدقيق */
export const ENTITY_LABELS: Record<string, string> = {
  Tenant: "المدرسة",
  Branch: "فرع",
  Stage: "مرحلة",
  Grade: "صف",
  Section: "فصل",
  AcademicYear: "عام دراسي",
  Term: "فصل دراسي",
  User: "مستخدم",
  Role: "دور",
  RolePermission: "صلاحية",
  UserRole: "إسناد دور",
  Teamspace: "مساحة فريق",
  TeamspaceMember: "عضو مساحة",
  Page: "صفحة",
  PageShare: "مشاركة صفحة",
  Database: "قاعدة بيانات",
  DatabaseProperty: "خاصية",
  DatabaseView: "عرض",
  DatabaseRow: "سجل",
  DatabaseTemplate: "قالب",
  Automation: "أتمتة",
  Comment: "تعليق",
  Favorite: "مفضلة",
  CalendarEvent: "حدث",
  ApprovalRequest: "طلب موافقة",
  ApprovalStep: "خطوة موافقة",
  Conversation: "محادثة",
  FileObject: "ملف",
  Sequence: "تسلسل ترقيم",
  Auth: "الدخول",
  AuditLog: "سجل التدقيق",
};

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "إنشاء",
  CREATE_MANY: "إنشاء جماعي",
  UPDATE: "تعديل",
  UPDATE_MANY: "تعديل جماعي",
  DELETE: "حذف",
  DELETE_MANY: "حذف جماعي",
  SOFT_DELETE: "نقل إلى المهملات",
  RESTORE: "استرجاع",
  LOGIN: "تسجيل دخول",
  LOGIN_FAILED: "محاولة دخول فاشلة",
  LOGOUT: "تسجيل خروج",
  LOCKED: "قفل الحساب",
  PASSWORD_RESET: "إعادة تعيين كلمة المرور",
  PASSWORD_CHANGE: "تغيير كلمة المرور",
  TWO_FACTOR_ENABLE: "تفعيل المصادقة الثنائية",
  TWO_FACTOR_DISABLE: "تعطيل المصادقة الثنائية",
  SESSION_REVOKE: "إنهاء جلسة",
  EXPORT: "تصدير",
  PERMISSION_CHANGE: "تغيير الصلاحيات",
  APPROVE: "اعتماد",
  REJECT: "رفض",
};
