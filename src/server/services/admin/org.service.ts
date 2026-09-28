/**
 * إعدادات المدرسة والفروع والهيكل.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { BranchGender } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac/access";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/server/auth/password";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, forbidden, notFound } from "@/server/errors";

export const ACCENT_COLORS = ["navy", "teal", "slate"] as const;

export interface TenantSettingsShape {
  passwordPolicy?: PasswordPolicy;
  defaultDigits?: "arab" | "latn";
  defaultCalendar?: "gregory" | "hijri" | "both";
  weekStartsOn?: 0 | 6;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  crNumber?: string;
}

export async function getSettings(db: TenantDb, session: SessionData) {
  const tenant = await db.tenant.findFirstOrThrow({ where: { id: session.tenant.id } });
  const settings = (tenant.settings ?? {}) as TenantSettingsShape;
  return {
    ...tenant,
    settings: { ...settings, passwordPolicy: { ...DEFAULT_PASSWORD_POLICY, ...(settings.passwordPolicy ?? {}) } },
  };
}

export async function updateSettings(
  db: TenantDb,
  session: SessionData,
  input: {
    name?: string;
    platformName?: string;
    logoUrl?: string | null;
    accentColor?: string;
    currency?: string;
    timezone?: string;
    settings?: TenantSettingsShape;
  },
) {
  const tenant = await db.tenant.findFirstOrThrow({ where: { id: session.tenant.id } });
  const current = (tenant.settings ?? {}) as TenantSettingsShape;
  if (input.settings?.passwordPolicy && !can(session.access, "security", "update")) {
    throw forbidden("تعديل سياسة كلمات المرور يتطلب صلاحية الأمان");
  }
  if (input.accentColor && !(ACCENT_COLORS as readonly string[]).includes(input.accentColor)) {
    throw badRequest("اللون يجب أن يكون من الألوان الرسمية المعتمدة");
  }
  if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) throw badRequest("رمز العملة غير صالح");
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw badRequest("المنطقة الزمنية غير صالحة");
    }
  }
  const policy = input.settings?.passwordPolicy;
  if (policy && (policy.minLength < 8 || policy.maxFailedAttempts < 3 || policy.lockMinutes < 1)) {
    throw badRequest("سياسة كلمات المرور أضعف من الحد الأدنى المسموح (٨ أحرف، ٣ محاولات)");
  }
  return db.tenant.update({
    where: { id: tenant.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() || tenant.name } : {}),
      ...(input.platformName !== undefined ? { platformName: input.platformName.trim() || tenant.platformName } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.settings ? { settings: { ...current, ...input.settings } as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function listBranches(db: TenantDb, includeArchived = false) {
  const branches = await db.branch.findMany({
    where: includeArchived ? {} : { deletedAt: null },
    orderBy: { code: "asc" },
  });
  const counts = await db.userRole.groupBy({ by: ["branchId"], where: { branchId: { not: null } }, _count: { _all: true } });
  return branches.map((b) => ({ ...b, assignedUsers: counts.find((c) => c.branchId === b.id)?._count._all ?? 0 }));
}

export interface BranchInput {
  code: string;
  name: string;
  gender: BranchGender;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export async function createBranch(db: TenantDb, session: SessionData, input: BranchInput) {
  if (!input.name.trim() || !input.code.trim()) throw badRequest("اسم الفرع ورمزه مطلوبان");
  return db.branch.create({
    data: { tenantId: session.tenant.id, ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), createdById: session.user.id },
  });
}

export async function updateBranch(db: TenantDb, session: SessionData, id: string, input: Partial<BranchInput> & { isActive?: boolean }) {
  const branch = await db.branch.findFirst({ where: { id } });
  if (!branch) throw notFound("الفرع غير موجود");
  return db.branch.update({
    where: { id },
    data: { ...input, ...(input.code ? { code: input.code.trim().toUpperCase() } : {}), updatedById: session.user.id },
  });
}

export async function archiveBranch(db: TenantDb, session: SessionData, id: string) {
  const branch = await db.branch.findFirst({ where: { id, deletedAt: null } });
  if (!branch) throw notFound("الفرع غير موجود");
  const active = await db.branch.count({ where: { deletedAt: null } });
  if (active <= 1) throw new AppError("CONFLICT", "لا يمكن أرشفة الفرع الوحيد");
  return db.branch.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedById: session.user.id } });
}

export async function structure(db: TenantDb) {
  const [stages, years] = await Promise.all([
    db.stage.findMany({ where: { deletedAt: null }, orderBy: { order: "asc" }, include: { grades: { where: { deletedAt: null }, orderBy: { order: "asc" } } } }),
    db.academicYear.findMany({ where: { deletedAt: null }, orderBy: { startDate: "desc" }, include: { terms: { orderBy: { order: "asc" } } } }),
  ]);
  return { stages, years };
}
