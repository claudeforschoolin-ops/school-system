/**
 * تهيئة مستأجر جديد: الأدوار النظامية بصلاحياتها، ومساحات الفرق الافتراضية.
 */
import { rootDb } from "@/server/db/client";
import { SYSTEM_ROLES } from "@/lib/rbac/defaults";

export interface TeamspaceSeed {
  key: string;
  name: string;
  icon: string;
  description: string;
  moduleKeys: string[];
}

/** مساحات الفرق الافتراضية (الجزء ٥.٢) */
export const DEFAULT_TEAMSPACES: readonly TeamspaceSeed[] = [
  {
    key: "management",
    name: "إدارة المدرسة",
    icon: "lucide:landmark",
    description: "لوحة القيادة، القرارات، الاجتماعات، والخطة التشغيلية",
    moduleKeys: ["management"],
  },
  {
    key: "academic",
    name: "الشؤون الأكاديمية",
    icon: "lucide:graduation-cap",
    description: "الصفوف والمقررات والجداول والإشراف التربوي",
    moduleKeys: ["classes", "curriculum", "timetable", "teacher_assignments", "activities", "exams", "grade_entry"],
  },
  {
    key: "students",
    name: "شؤون الطلاب",
    icon: "lucide:users",
    description: "القبول والحضور والتحويلات والإرشاد",
    moduleKeys: ["admissions", "students", "attendance", "transfers", "counseling"],
  },
  {
    key: "hr",
    name: "الموارد البشرية",
    icon: "lucide:id-card",
    description: "الموظفون والتوظيف والرواتب والتقييم",
    moduleKeys: ["employees", "payroll", "hr_attendance", "performance", "end_of_service"],
  },
  {
    key: "finance",
    name: "المالية والمحاسبة",
    icon: "lucide:wallet",
    description: "المحاسبة والفوترة والتحصيل والموازنة",
    moduleKeys: ["accounting", "invoices", "collections", "expenses", "banking", "finance_reports"],
  },
  {
    key: "operations",
    name: "العمليات والخدمات",
    icon: "lucide:wrench",
    description: "الصيانة والمخزون والمواصلات والمكتبة والمقصف",
    moduleKeys: ["maintenance", "inventory", "transport", "library", "safety", "canteen"],
  },
  {
    key: "communication",
    name: "التواصل",
    icon: "lucide:megaphone",
    description: "الرسائل والإعلانات والفعاليات",
    moduleKeys: ["messages", "announcements", "events"],
  },
  {
    key: "system",
    name: "مركز الإدارة والنظام",
    icon: "lucide:settings-2",
    description: "المستخدمون والصلاحيات والإعدادات والتدقيق",
    moduleKeys: ["users", "roles", "settings", "audit", "security"],
  },
];

export async function provisionTenant(input: {
  slug: string;
  name: string;
  platformName?: string;
  currency?: string;
  timezone?: string;
  isDemo?: boolean;
}) {
  const tenant = await rootDb.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
      platformName: input.platformName ?? "منصة",
      currency: input.currency ?? "SAR",
      timezone: input.timezone ?? "Asia/Riyadh",
      isDemo: input.isDemo ?? false,
      settings: { defaultDigits: "arab", defaultCalendar: "both" },
    },
  });

  const roles: Record<string, string> = {};
  for (const [index, def] of SYSTEM_ROLES.entries()) {
    const role = await rootDb.role.create({
      data: {
        tenantId: tenant.id,
        key: def.key,
        name: def.name,
        description: def.description,
        isSystem: true,
        requires2fa: def.requires2fa,
        color: def.color,
        position: index,
      },
    });
    roles[def.key] = role.id;
    await rootDb.rolePermission.createMany({
      data: def.grants.map((g) => ({ tenantId: tenant.id, roleId: role.id, module: g.module, action: g.action, scope: g.scope })),
    });
  }

  const teamspaces: Record<string, string> = {};
  for (const [index, ts] of DEFAULT_TEAMSPACES.entries()) {
    const created = await rootDb.teamspace.create({
      data: {
        tenantId: tenant.id,
        key: ts.key,
        name: ts.name,
        icon: ts.icon,
        description: ts.description,
        moduleKeys: ts.moduleKeys,
        position: (index + 1) * 1024,
      },
    });
    teamspaces[ts.key] = created.id;
  }

  return { tenant, roles, teamspaces };
}
