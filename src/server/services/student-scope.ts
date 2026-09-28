/**
 * نطاق الطلاب حسب الصلاحية: كل المدرسة / فرع / مرحلة / فصول المعلم / أبناء ولي الأمر أو الطالب نفسه.
 * يُعاد شرط Prisma على جدول الطلاب، أو null عند عدم وجود أي صلاحية.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Action } from "@/lib/rbac/catalog";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden } from "@/server/errors";

/** الفصول المسندة للمعلم (مربي فصل أو مسند إليه مادة) في العام الحالي */
export async function teacherSectionIds(db: TenantDb, userId: string): Promise<string[]> {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) return [];
  const [homeroom, assignments] = await Promise.all([
    db.section.findMany({ where: { academicYearId: year.id, homeroomUserId: userId, deletedAt: null }, select: { id: true } }),
    db.teacherAssignment.findMany({ where: { academicYearId: year.id, teacherId: userId }, select: { sectionId: true } }),
  ]);
  return [...new Set([...homeroom.map((s) => s.id), ...assignments.map((a) => a.sectionId)])];
}

export async function studentWhere(db: TenantDb, session: SessionData, module: string, action: Action): Promise<Prisma.StudentWhereInput | null> {
  const scope = resolveScope(session.access, module, action);
  if (!scope) return null;
  if (scope.kind === "all") return {};
  const or: Prisma.StudentWhereInput[] = [];
  if (scope.branchIds.length) or.push({ branchId: { in: scope.branchIds } });
  if (scope.stageIds.length) or.push({ grade: { stageId: { in: scope.stageIds } } });
  if (scope.assigned) {
    const sections = await teacherSectionIds(db, session.user.id);
    if (sections.length) or.push({ sectionId: { in: sections } });
    // ولي الأمر: «المسند إليه» = أبناؤه
    or.push({ guardians: { some: { guardian: { userId: session.user.id } } } });
  }
  if (scope.own) {
    or.push({ userId: session.user.id });
    or.push({ guardians: { some: { guardian: { userId: session.user.id } } } });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}

export async function requireStudentWhere(db: TenantDb, session: SessionData, module: string, action: Action, message?: string) {
  const where = await studentWhere(db, session, module, action);
  if (!where) throw forbidden(message);
  return where;
}

/** نطاق سجلات مرتبطة بفرع (القبول، الأنشطة…): الفروع المسموحة أو null = كل الفروع */
export function branchScope(session: SessionData, module: string, action: Action): { all: true } | { branchIds: string[] } | null {
  const scope = resolveScope(session.access, module, action);
  if (!scope) return null;
  if (scope.kind === "all") return { all: true };
  return { branchIds: scope.branchIds };
}

export function branchWhere(session: SessionData, module: string, action: Action): { branchId?: { in: string[] } } | null {
  const scope = branchScope(session, module, action);
  if (!scope) return null;
  return "all" in scope ? {} : { branchId: { in: scope.branchIds } };
}
