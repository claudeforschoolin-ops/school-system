/**
 * أدوات مشتركة للتقييم: نظام التقييم للمرحلة، ونطاق المستخدم على (الفصل × المادة):
 * المدرسة كاملة، أو فروع، أو ما يدرّسه المعلم، أو المواد التي يرأس قسمها.
 */
import { DEFAULT_BANDS, DEFAULT_COMPONENTS, type GradeBand, type Scheme, type SchemeComponent } from "@/lib/assessment/calc";
import type { Prisma } from "@/generated/prisma/client";
import { resolveScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { readModuleSettings } from "@/server/services/module-settings.service";

export function assessmentSettings(session: Pick<SessionData, "tenant">) {
  return readModuleSettings(session.tenant.settings, "assessment");
}

export type LoadedScheme = Scheme & { id: string; name: string; display: string };

/** نظام التقييم للمرحلة (أو الافتراضي)، ويُنشأ الافتراضي عند أول استخدام */
export async function schemeFor(db: TenantDb, tenantId: string, stageId: string | null): Promise<LoadedScheme> {
  const found = (stageId ? await db.gradingScheme.findFirst({ where: { stageId, isActive: true } }) : null) ?? (await db.gradingScheme.findFirst({ where: { stageId: null, isActive: true } }));
  const row = found ?? (await db.gradingScheme.create({ data: { tenantId, name: "النظام الافتراضي", components: DEFAULT_COMPONENTS as unknown as Prisma.InputJsonValue, bands: DEFAULT_BANDS as unknown as Prisma.InputJsonValue } }));
  return { id: row.id, name: row.name, display: row.display, components: row.components as unknown as SchemeComponent[], bands: row.bands as unknown as GradeBand[], passBp: row.passBp, maxSecondRoundSubjects: row.maxSecondRoundSubjects };
}

export async function requireTerm(db: TenantDb, termId: string) {
  const term = await db.term.findFirst({ where: { id: termId, deletedAt: null }, include: { academicYear: { select: { id: true, name: true, isCurrent: true } } } });
  if (!term) throw notFound("الفصل الدراسي غير موجود");
  return term;
}

/** الفصل الدراسي الحالي (أو الأقرب) في العام الحالي */
export async function currentTerm(db: TenantDb, todayIso: string) {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) return null;
  const terms = await db.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" } });
  const today = new Date(`${todayIso}T00:00:00Z`);
  return terms.find((t) => t.startDate <= today && t.endDate >= today) ?? terms.find((t) => t.startDate > today) ?? terms.at(-1) ?? null;
}

export interface GradeScope {
  all: boolean;
  branchIds: string[];
  /** «الفصل|المادة» التي يدرّسها المستخدم */
  teaching: Set<string>;
  /** فصول يرعاها (رائد فصل): عرض فقط */
  homeroom: Set<string>;
  /** مواد يرأس قسمها: عرض ومراجعة */
  headSubjects: Set<string>;
}

export async function gradeScope(db: TenantDb, session: SessionData, action: Action = "view"): Promise<GradeScope | null> {
  const scope = resolveScope(session.access, "grade_entry", action);
  const heads = Object.entries(assessmentSettings(session).subjectHeads).filter(([, u]) => u === session.user.id).map(([s]) => s);
  if (!scope && !heads.length) return null;
  const out: GradeScope = { all: scope?.kind === "all", branchIds: scope && scope.kind === "limited" ? scope.branchIds : [], teaching: new Set(), homeroom: new Set(), headSubjects: new Set(heads) };
  if (scope && scope.kind === "limited" && (scope.assigned || scope.own)) {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
    if (year) {
      const [assignments, homeroom] = await Promise.all([
        db.teacherAssignment.findMany({ where: { academicYearId: year.id, teacherId: session.user.id }, select: { sectionId: true, subjectId: true } }),
        action === "view" ? db.section.findMany({ where: { academicYearId: year.id, homeroomUserId: session.user.id, deletedAt: null }, select: { id: true } }) : [],
      ]);
      for (const a of assignments) out.teaching.add(`${a.sectionId}|${a.subjectId}`);
      for (const h of homeroom) out.homeroom.add(h.id);
    }
  }
  return out;
}

export function inScope(scope: GradeScope, section: { id: string; branchId: string }, subjectId: string) {
  return scope.all || scope.branchIds.includes(section.branchId) || scope.teaching.has(`${section.id}|${subjectId}`) || scope.homeroom.has(section.id) || scope.headSubjects.has(subjectId);
}

/** صلاحيات المستخدم على كشف (فصل × مادة) */
export async function sheetPermissions(db: TenantDb, session: SessionData, section: { id: string; branchId: string }, subjectId: string) {
  const [view, edit, approve] = await Promise.all([gradeScope(db, session, "view"), gradeScope(db, session, "update"), gradeScope(db, session, "approve")]);
  const canView = Boolean(view && inScope(view, section, subjectId));
  const canEdit = Boolean(edit && (edit.all || edit.branchIds.includes(section.branchId) || edit.teaching.has(`${section.id}|${subjectId}`)));
  const canApprove = Boolean(approve && (approve.all || approve.branchIds.includes(section.branchId)));
  const head = assessmentSettings(session).subjectHeads[subjectId] ?? null;
  const canReview = canApprove || head === session.user.id;
  return { canView, canEdit, canReview, canApprove, headUserId: head };
}

export async function requireSheet(db: TenantDb, session: SessionData, sectionId: string, subjectId: string) {
  const section = await db.section.findFirst({ where: { id: sectionId, deletedAt: null }, include: { grade: { select: { id: true, name: true, stageId: true } }, branch: { select: { id: true, name: true } } } });
  if (!section) throw notFound("الفصل غير موجود");
  const subject = await db.subject.findFirst({ where: { id: subjectId, deletedAt: null } });
  if (!subject) throw notFound("المادة غير موجودة");
  const perms = await sheetPermissions(db, session, section, subjectId);
  if (!perms.canView) throw forbidden("ليس لديك صلاحية على درجات هذه المادة في هذا الفصل");
  return { section, subject, perms };
}

export function assertComponent(scheme: LoadedScheme, key: string) {
  if (!scheme.components.some((c) => c.key === key)) throw badRequest("مكوّن غير موجود في نظام التقييم");
}
