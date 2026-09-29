/**
 * المقررات: المواد، الخطة الدراسية لكل صف (الحصص الأسبوعية والكتاب)، الوحدات والدروس بأسابيعها،
 * ونسبة الإنجاز لكل فصل (يعلّم المعلم الدرس منجزاً لفصله) مقارنةً بالخطة الزمنية.
 */
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { currentYear } from "@/server/collections/options";
import { requireSectionWhere } from "./academic.service";

/** إدارة المقررات (مشتركة بين الفروع): نطاق المدرسة أو فرع — لا يكفي نطاق «المسند إليه» */
function canManage(session: SessionData) {
  const s = resolveScope(session.access, "curriculum", "update");
  return Boolean(s && (s.kind === "all" || s.branchIds.length || s.stageIds.length));
}
function requireManage(session: SessionData) {
  if (!canManage(session)) throw forbidden("تعديل المقررات من صلاحية الشؤون الأكاديمية");
}

/** الأسبوع الدراسي الحالي (١ = أسبوع بداية العام) */
export function schoolWeek(yearStart: Date, now = new Date()) {
  const diff = now.getTime() - yearStart.getTime();
  return Math.max(1, Math.floor(diff / (7 * 86_400_000)) + 1);
}

// ---------------------------------------------------------------------
// المواد
// ---------------------------------------------------------------------

export async function listSubjects(db: TenantDb, session: SessionData) {
  if (!resolveScope(session.access, "curriculum", "view")) throw forbidden();
  const [subjects, usage] = await Promise.all([
    db.subject.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    db.gradeSubject.groupBy({ by: ["subjectId"], _count: { _all: true }, _sum: { weeklyPeriods: true } }),
  ]);
  const u = new Map(usage.map((x) => [x.subjectId, { grades: x._count._all, periods: x._sum.weeklyPeriods ?? 0 }]));
  return { canManage: canManage(session), subjects: subjects.map((s) => ({ ...s, grades: u.get(s.id)?.grades ?? 0, periods: u.get(s.id)?.periods ?? 0 })) };
}

export async function saveSubject(db: TenantDb, session: SessionData, id: string | null, input: { code: string; name: string; color: string; roomKind: string | null }) {
  requireManage(session);
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw badRequest("رمز المادة واسمها مطلوبان");
  const dup = await db.subject.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (dup && !dup.deletedAt) throw badRequest("يوجد مادة بالرمز نفسه");
  const data = { code, name, color: input.color, roomKind: input.roomKind || null, updatedById: session.user.id };
  if (id) return db.subject.update({ where: { id }, data });
  if (dup) return db.subject.update({ where: { id: dup.id }, data: { ...data, deletedAt: null } });
  return db.subject.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
}

export async function deleteSubject(db: TenantDb, session: SessionData, id: string) {
  requireManage(session);
  const used = await db.gradeSubject.count({ where: { subjectId: id } });
  if (used) throw badRequest(`المادة ضمن الخطة الدراسية لـ${used} صف؛ احذفها من الخطط أولاً`);
  await db.subject.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// الخطة الدراسية
// ---------------------------------------------------------------------

/** قائمة الصفوف مع ملخص الخطة (للتنقل) */
export async function planOverview(db: TenantDb, session: SessionData) {
  const where = await requireSectionWhere(db, session, "curriculum", "view", "لا تملك صلاحية عرض المقررات");
  const year = await currentYear(db);
  const visibleSections = year ? await db.section.findMany({ where: { ...where, academicYearId: year.id, deletedAt: null }, select: { gradeId: true } }) : [];
  const visibleGrades = new Set(visibleSections.map((s) => s.gradeId));
  const [grades, plans] = await Promise.all([
    db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { name: true, order: true } } } }),
    db.gradeSubject.groupBy({ by: ["gradeId"], _count: { _all: true }, _sum: { weeklyPeriods: true } }),
  ]);
  const p = new Map(plans.map((x) => [x.gradeId, { subjects: x._count._all, periods: x._sum.weeklyPeriods ?? 0 }]));
  const manage = canManage(session);
  return grades
    .filter((g) => manage || visibleGrades.has(g.id))
    .sort((a, b) => a.stage.order - b.stage.order || a.order - b.order)
    .map((g) => ({ id: g.id, name: g.name, stageName: g.stage.name, subjects: p.get(g.id)?.subjects ?? 0, periods: p.get(g.id)?.periods ?? 0 }));
}

export async function gradePlan(db: TenantDb, session: SessionData, gradeId: string) {
  const where = await requireSectionWhere(db, session, "curriculum", "view", "لا تملك صلاحية عرض المقررات");
  const grade = await db.grade.findFirst({ where: { id: gradeId, deletedAt: null }, include: { stage: { select: { name: true } } } });
  if (!grade) throw notFound("الصف غير موجود");
  const year = await currentYear(db);
  const [items, sections] = await Promise.all([
    db.gradeSubject.findMany({ where: { gradeId }, include: { subject: true, units: { select: { id: true, lessons: { select: { id: true, week: true } } } } } }),
    year ? db.section.findMany({ where: { ...where, gradeId, academicYearId: year.id, deletedAt: null }, include: { branch: { select: { name: true } } }, orderBy: [{ branchId: "asc" }, { name: "asc" }] }) : [],
  ]);
  if (!canManage(session) && !sections.length) throw forbidden("هذا الصف خارج فصولك");
  const lessonIds = items.flatMap((i) => i.units.flatMap((u) => u.lessons.map((l) => l.id)));
  const progress = lessonIds.length && sections.length ? await db.lessonProgress.groupBy({ by: ["sectionId", "lessonId"], where: { lessonId: { in: lessonIds }, sectionId: { in: sections.map((s) => s.id) } } }) : [];
  const done = new Set(progress.map((p) => `${p.sectionId}|${p.lessonId}`));
  const week = year ? schoolWeek(year.startDate) : 1;
  const assignments = year ? await db.teacherAssignment.findMany({ where: { academicYearId: year.id, sectionId: { in: sections.map((s) => s.id) } }, select: { sectionId: true, subjectId: true, teacherId: true } }) : [];
  const teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  const teachers = teacherIds.length ? await db.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }) : [];
  const tName = new Map(teachers.map((t) => [t.id, t.name]));
  return {
    grade: { id: grade.id, name: grade.name, stageName: grade.stage.name },
    week,
    canManage: canManage(session),
    totalPeriods: items.reduce((s, i) => s + i.weeklyPeriods, 0),
    sections: sections.map((s) => ({ id: s.id, label: `${s.name}`, branchName: s.branch.name })),
    subjects: items
      .sort((a, b) => a.subject.code.localeCompare(b.subject.code))
      .map((i) => {
        const lessons = i.units.flatMap((u) => u.lessons);
        const expected = lessons.filter((l) => l.week !== null && l.week <= week).length;
        return {
          id: i.id,
          subject: { id: i.subject.id, code: i.subject.code, name: i.subject.name, color: i.subject.color, roomKind: i.subject.roomKind },
          weeklyPeriods: i.weeklyPeriods,
          heavy: i.heavy,
          textbook: i.textbook,
          units: i.units.length,
          lessons: lessons.length,
          expected,
          sections: sections.map((s) => {
            const completed = lessons.filter((l) => done.has(`${s.id}|${l.id}`)).length;
            const a = assignments.find((x) => x.sectionId === s.id && x.subjectId === i.subjectId);
            return { sectionId: s.id, completed, teacherName: a ? (tName.get(a.teacherId) ?? null) : null };
          }),
        };
      }),
  };
}

export async function saveGradeSubject(db: TenantDb, session: SessionData, input: { gradeId: string; subjectId: string; weeklyPeriods: number; heavy: boolean; textbook?: string | null }) {
  requireManage(session);
  const [grade, subject] = await Promise.all([db.grade.findFirst({ where: { id: input.gradeId, deletedAt: null } }), db.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } })]);
  if (!grade || !subject) throw notFound("الصف أو المادة غير موجودة");
  const existing = await db.gradeSubject.findFirst({ where: { gradeId: input.gradeId, subjectId: input.subjectId } });
  const data = { weeklyPeriods: input.weeklyPeriods, heavy: input.heavy, textbook: input.textbook?.trim() || null, updatedById: session.user.id };
  const saved = existing
    ? await db.gradeSubject.update({ where: { id: existing.id }, data })
    : await db.gradeSubject.create({ data: { tenantId: session.tenant.id, gradeId: input.gradeId, subjectId: input.subjectId, ...data, createdById: session.user.id } });
  // مزامنة عدد الحصص في الإسناد القائم لهذا الصف
  const year = await currentYear(db);
  if (year && existing && existing.weeklyPeriods !== input.weeklyPeriods) {
    await db.teacherAssignment.updateMany({ where: { academicYearId: year.id, subjectId: input.subjectId, section: { gradeId: input.gradeId } }, data: { weeklyPeriods: input.weeklyPeriods, updatedById: session.user.id } });
  }
  return saved;
}

export async function removeGradeSubject(db: TenantDb, session: SessionData, id: string) {
  requireManage(session);
  const gs = await db.gradeSubject.findFirst({ where: { id } });
  if (!gs) throw notFound();
  const year = await currentYear(db);
  if (year) {
    const slots = await db.timetableSlot.count({ where: { academicYearId: year.id, subjectId: gs.subjectId, sectionId: { in: (await db.section.findMany({ where: { gradeId: gs.gradeId, academicYearId: year.id }, select: { id: true } })).map((s) => s.id) } } });
    if (slots) throw badRequest("للمادة حصص في جداول هذا الصف؛ أعد توليد الجدول بعد تعديل الإسناد");
    await db.teacherAssignment.deleteMany({ where: { academicYearId: year.id, subjectId: gs.subjectId, section: { gradeId: gs.gradeId } } });
  }
  await db.gradeSubject.delete({ where: { id } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// الوحدات والدروس والإنجاز
// ---------------------------------------------------------------------

async function assignedTo(db: TenantDb, session: SessionData, sectionId: string, subjectId: string) {
  const year = await currentYear(db);
  if (!year) return false;
  const a = await db.teacherAssignment.findFirst({ where: { academicYearId: year.id, sectionId, subjectId, teacherId: session.user.id } });
  return Boolean(a);
}

export async function syllabus(db: TenantDb, session: SessionData, gradeSubjectId: string, sectionId?: string | null) {
  const where = await requireSectionWhere(db, session, "curriculum", "view", "لا تملك صلاحية عرض المقررات");
  const gs = await db.gradeSubject.findFirst({
    where: { id: gradeSubjectId },
    include: { subject: true, grade: { include: { stage: { select: { name: true } } } }, units: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
  });
  if (!gs) throw notFound("المادة غير موجودة في الخطة");
  const year = await currentYear(db);
  const sections = year ? await db.section.findMany({ where: { ...where, gradeId: gs.gradeId, academicYearId: year.id, deletedAt: null }, include: { branch: { select: { name: true } } }, orderBy: [{ branchId: "asc" }, { name: "asc" }] }) : [];
  const manage = canManage(session);
  if (!manage && !sections.length) throw forbidden("هذا الصف خارج فصولك");
  const lessonIds = gs.units.flatMap((u) => u.lessons.map((l) => l.id));
  const progress = lessonIds.length && sections.length ? await db.lessonProgress.findMany({ where: { lessonId: { in: lessonIds }, sectionId: { in: sections.map((s) => s.id) } } }) : [];
  const selected = sections.find((s) => s.id === sectionId) ?? null;
  const byIds = [...new Set(progress.map((p) => p.completedById).filter((x): x is string => Boolean(x)))];
  const users = byIds.length ? await db.user.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } }) : [];
  const uName = new Map(users.map((u) => [u.id, u.name]));
  const week = year ? schoolWeek(year.startDate) : 1;
  const canMark = selected ? manage || (await assignedTo(db, session, selected.id, gs.subjectId)) : false;
  return {
    id: gs.id,
    subject: gs.subject,
    grade: { id: gs.grade.id, name: gs.grade.name, stageName: gs.grade.stage.name },
    weeklyPeriods: gs.weeklyPeriods,
    heavy: gs.heavy,
    textbook: gs.textbook,
    week,
    canManage: manage,
    canMark,
    sections: sections.map((s) => ({ id: s.id, label: s.name, branchName: s.branch.name, completed: progress.filter((p) => p.sectionId === s.id).length })),
    selectedSectionId: selected?.id ?? null,
    totalLessons: lessonIds.length,
    units: gs.units.map((u) => ({
      id: u.id,
      title: u.title,
      objectives: u.objectives,
      order: u.order,
      lessons: u.lessons.map((l) => {
        const p = selected ? progress.find((x) => x.lessonId === l.id && x.sectionId === selected.id) : undefined;
        return {
          id: l.id,
          title: l.title,
          order: l.order,
          week: l.week,
          periods: l.periods,
          objectives: l.objectives,
          done: p ? { at: p.completedAt, by: p.completedById ? (uName.get(p.completedById) ?? null) : null, note: p.note } : null,
          sectionsDone: progress.filter((x) => x.lessonId === l.id).length,
        };
      }),
    })),
  };
}

export async function saveUnit(db: TenantDb, session: SessionData, input: { id?: string | null; gradeSubjectId: string; title: string; objectives?: string | null }) {
  requireManage(session);
  const title = input.title.trim();
  if (!title) throw badRequest("عنوان الوحدة مطلوب");
  if (input.id) return db.curriculumUnit.update({ where: { id: input.id }, data: { title, objectives: input.objectives?.trim() || null } });
  const last = await db.curriculumUnit.findFirst({ where: { gradeSubjectId: input.gradeSubjectId }, orderBy: { order: "desc" } });
  return db.curriculumUnit.create({ data: { tenantId: session.tenant.id, gradeSubjectId: input.gradeSubjectId, title, objectives: input.objectives?.trim() || null, order: (last?.order ?? 0) + 1 } });
}

export async function deleteUnit(db: TenantDb, session: SessionData, id: string) {
  requireManage(session);
  const done = await db.lessonProgress.count({ where: { lesson: { unitId: id } } });
  if (done) throw badRequest(`الوحدة فيها ${done} إنجاز مسجّل للفصول؛ لا يمكن حذفها`);
  await db.curriculumUnit.delete({ where: { id } });
  return { ok: true };
}

export async function saveLesson(db: TenantDb, session: SessionData, input: { id?: string | null; unitId: string; title: string; week?: number | null; periods: number; objectives?: string | null }) {
  requireManage(session);
  const title = input.title.trim();
  if (!title) throw badRequest("عنوان الدرس مطلوب");
  const data = { title, week: input.week ?? null, periods: input.periods, objectives: input.objectives?.trim() || null };
  if (input.id) return db.curriculumLesson.update({ where: { id: input.id }, data });
  const last = await db.curriculumLesson.findFirst({ where: { unitId: input.unitId }, orderBy: { order: "desc" } });
  return db.curriculumLesson.create({ data: { tenantId: session.tenant.id, unitId: input.unitId, ...data, order: (last?.order ?? 0) + 1 } });
}

export async function deleteLesson(db: TenantDb, session: SessionData, id: string) {
  requireManage(session);
  const done = await db.lessonProgress.count({ where: { lessonId: id } });
  if (done) throw badRequest(`الدرس مسجّل منجزاً في ${done} فصل؛ لا يمكن حذفه`);
  await db.curriculumLesson.delete({ where: { id } });
  return { ok: true };
}

/** نقل وحدة أو درس للأعلى/للأسفل */
export async function moveItem(db: TenantDb, session: SessionData, input: { kind: "unit" | "lesson"; id: string; direction: -1 | 1 }) {
  requireManage(session);
  if (input.kind === "unit") {
    const u = await db.curriculumUnit.findFirst({ where: { id: input.id } });
    if (!u) throw notFound();
    const siblings = await db.curriculumUnit.findMany({ where: { gradeSubjectId: u.gradeSubjectId }, orderBy: { order: "asc" } });
    const i = siblings.findIndex((s) => s.id === u.id);
    const other = siblings[i + input.direction];
    if (!other) return { ok: true };
    await db.curriculumUnit.update({ where: { id: u.id }, data: { order: other.order } });
    await db.curriculumUnit.update({ where: { id: other.id }, data: { order: u.order } });
    return { ok: true };
  }
  const l = await db.curriculumLesson.findFirst({ where: { id: input.id } });
  if (!l) throw notFound();
  const siblings = await db.curriculumLesson.findMany({ where: { unitId: l.unitId }, orderBy: { order: "asc" } });
  const i = siblings.findIndex((s) => s.id === l.id);
  const other = siblings[i + input.direction];
  if (!other) return { ok: true };
  await db.curriculumLesson.update({ where: { id: l.id }, data: { order: other.order } });
  await db.curriculumLesson.update({ where: { id: other.id }, data: { order: l.order } });
  return { ok: true };
}

/** تعليم درس منجزاً لفصل (معلم المادة في الفصل أو الإدارة الأكاديمية) */
export async function markLesson(db: TenantDb, session: SessionData, input: { lessonId: string; sectionId: string; done: boolean; note?: string | null }) {
  const lesson = await db.curriculumLesson.findFirst({ where: { id: input.lessonId }, include: { unit: { include: { gradeSubject: true } } } });
  if (!lesson) throw notFound("الدرس غير موجود");
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null } });
  if (!section || section.gradeId !== lesson.unit.gradeSubject.gradeId) throw badRequest("الفصل لا يتبع صف هذا المقرر");
  if (!canManage(session) && !(await assignedTo(db, session, section.id, lesson.unit.gradeSubject.subjectId))) throw forbidden("تسجيل الإنجاز لمعلم المادة في هذا الفصل");
  const existing = await db.lessonProgress.findFirst({ where: { lessonId: lesson.id, sectionId: section.id } });
  if (input.done) {
    if (existing) return db.lessonProgress.update({ where: { id: existing.id }, data: { note: input.note ?? existing.note } });
    return db.lessonProgress.create({ data: { tenantId: session.tenant.id, lessonId: lesson.id, sectionId: section.id, completedById: session.user.id, note: input.note?.trim() || null } });
  }
  if (existing) await db.lessonProgress.delete({ where: { id: existing.id } });
  return { ok: true };
}
