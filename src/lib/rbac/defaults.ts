/**
 * الأدوار النظامية الافتراضية ومصفوفة صلاحياتها.
 * تُنشأ لكل مستأجر جديد، ويمكن تعديلها لاحقاً من واجهة مصفوفة الصلاحيات.
 */
import { ACTIONS, ALL_MODULES, MODULE_GROUPS, actionsFor, type Action, type Scope } from "./catalog";

export interface PermissionGrant {
  module: string;
  action: Action;
  scope: Scope;
}

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  requires2fa: boolean;
  color: string;
  grants: PermissionGrant[];
}

type GrantSpec = Partial<Record<Action, Scope>>;

function modulesOfGroup(groupKey: string): string[] {
  return MODULE_GROUPS.find((g) => g.key === groupKey)?.modules.map((m) => m.key) ?? [];
}

/** يبني المنح مع تجاهل الإجراءات غير المنطبقة على الوحدة */
function grant(modules: readonly string[], spec: GrantSpec): PermissionGrant[] {
  const out: PermissionGrant[] = [];
  for (const moduleKey of modules) {
    const allowed = actionsFor(moduleKey);
    for (const [action, scope] of Object.entries(spec) as Array<[Action, Scope]>) {
      if (allowed.includes(action)) out.push({ module: moduleKey, action, scope });
    }
  }
  return out;
}

const FULL = (scope: Scope): GrantSpec => Object.fromEntries(ACTIONS.map((a) => [a, scope])) as GrantSpec;
const MANAGE = (scope: Scope): GrantSpec => ({ view: scope, create: scope, update: scope, export: scope, print: scope });
const READ = (scope: Scope): GrantSpec => ({ view: scope, export: scope, print: scope });
const VIEW = (scope: Scope): GrantSpec => ({ view: scope });

/** دمج المنح مع إبقاء النطاق الأوسع عند التكرار */
function merge(...lists: PermissionGrant[][]): PermissionGrant[] {
  const rank: Record<Scope, number> = { ALL: 5, BRANCH: 4, STAGE: 3, ASSIGNED: 2, OWN: 1 };
  const map = new Map<string, PermissionGrant>();
  for (const g of lists.flat()) {
    const key = `${g.module}:${g.action}`;
    const existing = map.get(key);
    if (!existing || rank[g.scope] > rank[existing.scope]) map.set(key, g);
  }
  return [...map.values()];
}

const allModuleKeys = ALL_MODULES.map((m) => m.key);
const workspaceStaff = grant(["workspace"], { view: "ALL", create: "ALL", update: "ALL", delete: "OWN", export: "ALL", print: "ALL" });
const commonStaff = merge(
  workspaceStaff,
  grant(["events", "announcements"], VIEW("ALL")),
  grant(["messages"], { view: "OWN", create: "OWN" }),
  grant(["approvals"], { view: "OWN" }),
  // الخدمة الذاتية للموظف: تسجيل حضوره وطلب إجازته وقسائم راتبه
  grant(["hr_attendance"], { view: "OWN", create: "OWN" }),
  grant(["payroll", "performance"], VIEW("OWN")),
);

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: "OWNER",
    name: "مالك النظام",
    description: "صلاحيات كاملة على كل الوحدات والإعدادات",
    requires2fa: true,
    color: "navy",
    grants: grant(allModuleKeys, FULL("ALL")),
  },
  {
    key: "PRINCIPAL",
    name: "مدير المدرسة",
    description: "إدارة كاملة للمدرسة واعتماد الطلبات",
    requires2fa: true,
    color: "navy",
    grants: merge(
      grant(allModuleKeys, { view: "ALL", create: "ALL", update: "ALL", approve: "ALL", export: "ALL", print: "ALL" }),
      grant(["workspace", "management", "events", "announcements"], FULL("ALL")),
      grant(["backups"], { create: "ALL" }),
    ).filter((g) => !(g.module === "roles" && g.action !== "view")),
  },
  {
    key: "VP_STUDENTS",
    name: "وكيل شؤون الطلاب",
    description: "القبول والحضور والتحويلات والسلوك في فرعه",
    requires2fa: false,
    color: "teal",
    grants: merge(
      commonStaff,
      grant(modulesOfGroup("students"), { ...MANAGE("BRANCH"), approve: "BRANCH" }),
      grant(modulesOfGroup("academic"), READ("BRANCH")),
      grant(["events", "announcements"], MANAGE("BRANCH")),
      grant(["approvals"], { view: "BRANCH", approve: "BRANCH" }),
      grant(["management"], VIEW("ALL")),
    ),
  },
  {
    key: "VP_ACADEMIC",
    name: "وكيل الشؤون الأكاديمية",
    description: "الصفوف والمقررات والجداول والتقييم في فرعه",
    requires2fa: false,
    color: "teal",
    grants: merge(
      commonStaff,
      grant(modulesOfGroup("academic"), { ...MANAGE("BRANCH"), approve: "BRANCH" }),
      grant(modulesOfGroup("assessment"), { ...MANAGE("BRANCH"), approve: "BRANCH" }),
      grant(["students", "attendance"], READ("BRANCH")),
      grant(["approvals"], { view: "BRANCH", approve: "BRANCH" }),
      grant(["management"], VIEW("ALL")),
    ),
  },
  {
    key: "TEACHER",
    name: "معلم",
    description: "فصوله ومواده فقط: التحضير والدرجات والجداول",
    requires2fa: false,
    color: "slate",
    grants: merge(
      commonStaff,
      grant(["students"], VIEW("ASSIGNED")),
      grant(["attendance", "grade_entry"], { view: "ASSIGNED", create: "ASSIGNED", update: "ASSIGNED" }),
      grant(["timetable", "exams", "curriculum", "classes", "activities"], VIEW("ASSIGNED")),
      // المعلم يسجّل الملاحظات السلوكية لطلاب فصوله (دون الاطلاع على حالات الإرشاد السرية)
      grant(["counseling"], { view: "ASSIGNED", create: "ASSIGNED" }),
    ),
  },
  {
    key: "COUNSELOR",
    name: "مرشد طلابي",
    description: "الإرشاد والسلوك (سجلات سرية)",
    requires2fa: false,
    color: "slate",
    grants: merge(
      commonStaff,
      grant(["counseling"], FULL("BRANCH")),
      grant(["students", "attendance"], READ("BRANCH")),
    ),
  },
  {
    key: "ADMISSIONS",
    name: "مسؤول قبول",
    description: "طلبات القبول والتسجيل",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["admissions"], FULL("BRANCH")), grant(["students"], { view: "BRANCH", create: "BRANCH" })),
  },
  {
    key: "ACCOUNTANT",
    name: "محاسب",
    description: "النظام المحاسبي كاملاً دون تعديل البيانات الأكاديمية",
    requires2fa: true,
    color: "teal",
    grants: merge(
      commonStaff,
      grant(modulesOfGroup("finance"), MANAGE("ALL")),
      grant(["students"], VIEW("ALL")),
      grant(["approvals"], { view: "ALL" }),
    ),
  },
  {
    key: "CASHIER",
    name: "أمين صندوق",
    description: "استلام المدفوعات وإصدار السندات فقط",
    requires2fa: true,
    color: "slate",
    grants: merge(
      commonStaff,
      grant(["collections"], { view: "OWN", create: "OWN", print: "OWN" }),
      grant(["invoices"], VIEW("ALL")),
      grant(["students"], VIEW("ALL")),
    ),
  },
  {
    key: "HR_MANAGER",
    name: "مدير موارد بشرية",
    description: "شؤون الموظفين والرواتب واعتمادها",
    requires2fa: true,
    color: "teal",
    grants: merge(commonStaff, grant(modulesOfGroup("hr"), FULL("ALL")), grant(["approvals"], { view: "ALL", approve: "ALL" })),
  },
  {
    key: "HR_OFFICER",
    name: "موظف موارد بشرية",
    description: "إدخال بيانات الموظفين والحضور دون اعتماد",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(modulesOfGroup("hr"), MANAGE("ALL"))),
  },
  {
    key: "LIBRARIAN",
    name: "أمين مكتبة",
    description: "الفهرسة والإعارة",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["library"], FULL("BRANCH")), grant(["students"], VIEW("BRANCH"))),
  },
  {
    key: "FACILITIES",
    name: "مسؤول مرافق وصيانة",
    description: "طلبات الصيانة وحجز المرافق",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["maintenance"], FULL("BRANCH"))),
  },
  {
    key: "PROCUREMENT",
    name: "مسؤول مخزون ومشتريات",
    description: "الأصناف والمستودعات وطلبات الشراء",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["inventory"], FULL("ALL"))),
  },
  {
    key: "TRANSPORT",
    name: "مسؤول مواصلات",
    description: "الحافلات والخطوط وتسكين الطلاب",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["transport"], FULL("ALL")), grant(["students"], VIEW("ALL"))),
  },
  {
    key: "RECEPTION",
    name: "موظف استقبال",
    description: "الزوار واستلام الطلاب",
    requires2fa: false,
    color: "slate",
    grants: merge(commonStaff, grant(["safety"], { view: "BRANCH", create: "BRANCH" }), grant(["students"], VIEW("BRANCH"))),
  },
  {
    key: "PARENT",
    name: "ولي أمر",
    description: "يرى أبناءه فقط: الحضور والدرجات والفواتير والتواصل",
    requires2fa: false,
    color: "slate",
    grants: merge(
      grant(["students", "attendance", "report_cards", "invoices", "transport", "timetable"], VIEW("ASSIGNED")),
      // سندات أسرته فقط؛ لا تسجيل مدفوعات (الدفع الإلكتروني غير مفعّل)
      grant(["collections"], VIEW("ASSIGNED")),
      grant(["transfers"], { view: "ASSIGNED", create: "ASSIGNED" }),
      grant(["messages"], { view: "OWN", create: "OWN" }),
      grant(["announcements", "events"], VIEW("ALL")),
    ),
  },
  {
    key: "STUDENT",
    name: "طالب",
    description: "جدوله ونتائجه والإعلانات",
    requires2fa: false,
    color: "slate",
    grants: merge(
      grant(["timetable", "report_cards", "attendance"], VIEW("OWN")),
      grant(["announcements", "events", "library"], VIEW("ALL")),
    ),
  },
  {
    key: "AUDITOR",
    name: "مدقق",
    description: "قراءة فقط لكل الوحدات مع سجل التدقيق",
    requires2fa: true,
    color: "gold",
    grants: grant(allModuleKeys, READ("ALL")),
  },
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);
