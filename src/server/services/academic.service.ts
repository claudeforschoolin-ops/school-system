/**
 * الشؤون الأكاديمية: الفصول والطاقة الاستيعابية، المواد والخطة الدراسية، الإسناد، والجداول.
 */
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { currentYear } from "@/server/collections/options";

/** فصول العام الحالي مع الإشغال (لمنتقيات التسكين) */
export async function sectionOptions(db: TenantDb, session: SessionData) {
  void session;
  const year = await currentYear(db);
  if (!year) return [];
  const [sections, counts] = await Promise.all([
    db.section.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      include: { grade: { select: { id: true, name: true, order: true, stage: { select: { order: true } } } }, branch: { select: { id: true, name: true } } },
    }),
    db.student.groupBy({ by: ["sectionId"], where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null, sectionId: { not: null } }, _count: { _all: true } }),
  ]);
  const occupied = new Map(counts.map((c) => [c.sectionId!, c._count._all]));
  return sections
    .sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name, "ar"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      label: `${s.grade.name} / ${s.name}`,
      gradeId: s.gradeId,
      gradeName: s.grade.name,
      branchId: s.branchId,
      branchName: s.branch.name,
      capacity: s.capacity,
      occupied: occupied.get(s.id) ?? 0,
      homeroomUserId: s.homeroomUserId,
      room: s.room,
    }));
}

export function canManageClasses(session: SessionData) {
  return can(session.access, "classes", "update");
}
