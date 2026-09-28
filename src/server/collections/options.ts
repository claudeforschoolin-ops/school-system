/**
 * خيارات مولَّدة من البيانات للخصائص النظامية: الفروع، الصفوف، الفصول (العام الحالي).
 */
import type { OptionColor, SelectOption } from "@/lib/database/types";
import type { TenantDb } from "@/server/db/tenant";

const STAGE_COLORS: OptionColor[] = ["teal", "navy", "purple", "gold", "brown", "slate"];

export async function currentYear(db: TenantDb) {
  return db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
}

export async function branchOptions(db: TenantDb): Promise<SelectOption[]> {
  const branches = await db.branch.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } });
  return branches.map((b, i) => ({ id: b.id, name: b.name, color: (["navy", "purple", "teal", "gold"] as OptionColor[])[i % 4]! }));
}

export async function gradeOptions(db: TenantDb): Promise<SelectOption[]> {
  const grades = await db.grade.findMany({ where: { deletedAt: null }, include: { stage: true }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });
  const stageIndex = new Map<string, number>();
  for (const g of grades) if (!stageIndex.has(g.stageId)) stageIndex.set(g.stageId, stageIndex.size);
  return grades.map((g) => ({ id: g.id, name: g.name, color: STAGE_COLORS[(stageIndex.get(g.stageId) ?? 0) % STAGE_COLORS.length]! }));
}

export async function sectionOptions(db: TenantDb): Promise<SelectOption[]> {
  const year = await currentYear(db);
  if (!year) return [];
  const sections = await db.section.findMany({
    where: { academicYearId: year.id, deletedAt: null },
    include: { grade: true, branch: true },
    orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
  });
  return sections.map((s) => ({ id: s.id, name: sectionLabel(s), color: "gray" }));
}

export function sectionLabel(s: { name: string; grade: { name: string }; branch?: { name: string; code?: string } | null }): string {
  return `${s.grade.name} / ${s.name}`;
}
