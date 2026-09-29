/**
 * كتالوج الصلاحيات: الوحدة ← الإجراء ← نطاق البيانات.
 * هذا الملف مشترك بين الخادم والواجهة (مصفوفة الصلاحيات المرئية).
 * أرقام الأقسام (section) تطابق ترقيم الوحدات الـ٦١ في وثيقة المتطلبات.
 */

export const ACTIONS = ["view", "create", "update", "delete", "approve", "export", "print"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "عرض",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  export: "تصدير",
  print: "طباعة",
};

export const SCOPES = ["ALL", "BRANCH", "STAGE", "ASSIGNED", "OWN"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  ALL: "كل المدرسة",
  BRANCH: "الفرع",
  STAGE: "المرحلة",
  ASSIGNED: "المسند إليه",
  OWN: "سجلاته فقط",
};

/** ترتيب اتساع النطاق: الأوسع أولاً */
export const SCOPE_RANK: Record<Scope, number> = { ALL: 5, BRANCH: 4, STAGE: 3, ASSIGNED: 2, OWN: 1 };

export interface ModuleDef {
  key: string;
  label: string;
  /** رقم القسم في وثيقة المتطلبات (٠ لوحدات المنصة) */
  section: number;
  /** مرحلة التنفيذ المخطط لها */
  phase: number;
  /** الإجراءات المنطبقة على الوحدة (الافتراضي: كلها) */
  actions?: readonly Action[];
}

export interface ModuleGroup {
  key: string;
  label: string;
  modules: readonly ModuleDef[];
}

const READ_EXPORT: readonly Action[] = ["view", "export", "print"];

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  {
    key: "platform",
    label: "المنصة ومساحات العمل",
    modules: [
      { key: "workspace", label: "الصفحات وقواعد البيانات", section: 0, phase: 1 },
      { key: "management", label: "إدارة المدرسة (القرارات والاجتماعات والخطة)", section: 0, phase: 1 },
      { key: "approvals", label: "الموافقات", section: 59, phase: 1, actions: ["view", "approve"] },
    ],
  },
  {
    key: "students",
    label: "إدارة الطلاب والقبول",
    modules: [
      { key: "admissions", label: "القبول والتسجيل", section: 1, phase: 2 },
      { key: "students", label: "ملفات الطلاب", section: 2, phase: 2 },
      { key: "attendance", label: "الحضور والغياب", section: 3, phase: 2 },
      { key: "transfers", label: "التحويلات والإجازات", section: 4, phase: 2 },
      { key: "counseling", label: "الإرشاد الطلابي والسلوك", section: 5, phase: 2 },
    ],
  },
  {
    key: "academic",
    label: "الشؤون الأكاديمية",
    modules: [
      { key: "classes", label: "الصفوف والفصول", section: 6, phase: 2 },
      { key: "curriculum", label: "المقررات الدراسية", section: 7, phase: 2 },
      { key: "timetable", label: "جداول الحصص", section: 8, phase: 2 },
      { key: "teacher_assignments", label: "تعيين المعلمين", section: 9, phase: 2 },
      { key: "activities", label: "الأنشطة والفعاليات", section: 10, phase: 2 },
    ],
  },
  {
    key: "assessment",
    label: "التقييم والدرجات",
    modules: [
      { key: "exams", label: "إدارة الاختبارات", section: 11, phase: 4 },
      { key: "grade_entry", label: "إدخال الدرجات", section: 12, phase: 4 },
      { key: "gpa", label: "حساب المعدلات", section: 13, phase: 4 },
      { key: "report_cards", label: "الشهادات والتقارير", section: 14, phase: 4 },
      { key: "academic_reports", label: "التقارير الإحصائية", section: 15, phase: 4, actions: READ_EXPORT },
    ],
  },
  {
    key: "hr",
    label: "الموارد البشرية والرواتب",
    modules: [
      { key: "employees", label: "إدارة الموظفين", section: 16, phase: 4 },
      { key: "payroll", label: "الرواتب", section: 17, phase: 4 },
      { key: "hr_attendance", label: "حضور وإجازات الموظفين", section: 18, phase: 4 },
      { key: "performance", label: "تقييم الأداء", section: 19, phase: 4 },
      { key: "end_of_service", label: "المستحقات ونهاية الخدمة", section: 20, phase: 4 },
    ],
  },
  {
    key: "finance",
    label: "المالية والمحاسبة",
    modules: [
      { key: "accounting", label: "المحاسبة العامة", section: 21, phase: 3 },
      { key: "banking", label: "الحسابات البنكية", section: 22, phase: 3 },
      { key: "invoices", label: "الفواتير والمستحقات", section: 23, phase: 3 },
      { key: "expenses", label: "المصروفات والموازنة", section: 24, phase: 3 },
      { key: "finance_reports", label: "التقارير المالية", section: 25, phase: 3, actions: READ_EXPORT },
      { key: "taxes", label: "الضرائب والرسوم", section: 26, phase: 3 },
      { key: "accounting_periods", label: "الدوريات المحاسبية", section: 27, phase: 3 },
      { key: "collections", label: "التحصيل والدفع", section: 28, phase: 3 },
      { key: "assets", label: "الأصول والخصوم", section: 29, phase: 5 },
      { key: "finance_audit", label: "التدقيق والامتثال المالي", section: 30, phase: 3, actions: READ_EXPORT },
    ],
  },
  {
    key: "operations",
    label: "العمليات والخدمات",
    modules: [
      { key: "maintenance", label: "المرافق والصيانة", section: 31, phase: 5 },
      { key: "inventory", label: "المخزون والمشتريات", section: 32, phase: 5 },
      { key: "transport", label: "المواصلات", section: 33, phase: 5 },
      { key: "library", label: "المكتبة والموارد", section: 34, phase: 5 },
      { key: "safety", label: "الأمن والسلامة", section: 35, phase: 5 },
      { key: "clinic", label: "العيادة المدرسية", section: 35, phase: 5 },
      { key: "canteen", label: "المقصف", section: 36, phase: 5 },
    ],
  },
  {
    key: "communication",
    label: "التواصل",
    modules: [
      // الرسائل الداخلية والإعلانات تعمل ضمن مساحة «التواصل» منذ المرحلة ١.
      // المرحلة ٦ (البوابات، تطبيق أولياء الأمور، بوابة المعلمين، الواجهات البرمجية العامة) أُلغيت بطلب المالك.
      { key: "messages", label: "الرسائل والإشعارات", section: 37, phase: 1 },
      { key: "announcements", label: "لوحة الإعلانات", section: 38, phase: 1 },
      { key: "events", label: "الأحداث والمناسبات", section: 41, phase: 1 },
    ],
  },
  {
    key: "system",
    label: "الإدارة والنظام",
    modules: [
      { key: "users", label: "إدارة المستخدمين", section: 42, phase: 1 },
      { key: "roles", label: "الأدوار والصلاحيات", section: 42, phase: 1, actions: ["view", "create", "update", "delete"] },
      { key: "settings", label: "الإعدادات والتخصيص", section: 43, phase: 1, actions: ["view", "update"] },
      { key: "backups", label: "النسخ الاحتياطية", section: 44, phase: 7, actions: ["view", "create", "export"] },
      { key: "security", label: "الأمان والتشفير", section: 45, phase: 1, actions: ["view", "update"] },
      { key: "audit", label: "السجلات والتدقيق", section: 46, phase: 1, actions: READ_EXPORT },
    ],
  },
  {
    key: "analytics",
    label: "التقارير والتحليلات",
    modules: [
      { key: "custom_reports", label: "التقارير المخصصة", section: 47, phase: 7 },
      { key: "dashboards", label: "لوحات التحكم", section: 48, phase: 7, actions: READ_EXPORT },
      { key: "analytics", label: "تحليل البيانات", section: 49, phase: 7, actions: READ_EXPORT },
      { key: "data_export", label: "تصدير البيانات", section: 50, phase: 7, actions: ["view", "export"] },
      { key: "ai", label: "الذكاء الاصطناعي", section: 51, phase: 8, actions: ["view", "create", "approve"] },
    ],
  },
  {
    key: "advanced",
    label: "الامتثال والمميزات المتقدمة",
    modules: [
      { key: "compliance", label: "الامتثال القانوني", section: 57, phase: 7 },
      { key: "e_documents", label: "التوثيق الإلكتروني", section: 58, phase: 7 },
      { key: "workflows", label: "سير العمل والموافقات", section: 59, phase: 7 },
      { key: "projects", label: "إدارة المشاريع", section: 60, phase: 7 },
      { key: "support", label: "الدعم الفني والتدريب", section: 61, phase: 7 },
    ],
  },
];

export const ALL_MODULES: readonly ModuleDef[] = MODULE_GROUPS.flatMap((g) => g.modules);

export const MODULE_MAP: ReadonlyMap<string, ModuleDef> = new Map(ALL_MODULES.map((m) => [m.key, m]));

export function actionsFor(moduleKey: string): readonly Action[] {
  return MODULE_MAP.get(moduleKey)?.actions ?? ACTIONS;
}

export function isValidPermission(moduleKey: string, action: string): action is Action {
  const mod = MODULE_MAP.get(moduleKey);
  if (!mod) return false;
  return (mod.actions ?? ACTIONS).includes(action as Action);
}

export function permissionKey(moduleKey: string, action: Action): string {
  return `${moduleKey}:${action}`;
}
