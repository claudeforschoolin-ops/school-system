/**
 * تعيين المعلمين: نصاب كل معلم وتفضيلاته (يوم الراحة، المواد المؤهل لها)، ومصفوفة (فصل × مادة → معلم)
 * مع حساب العبء، والإسناد التلقائي (المؤهل الأقل عبئاً، مع تفضيل استمرارية المعلم في الصف نفسه).
 */
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { branchTeachers, branchesFor, requireBranch, requireYear } from "./academic.service";
import { notify } from "./notifications.service";

export async function assignmentBoard(db: TenantDb, session: SessionData, branchId?: string | null) {
  const branches = await branchesFor(db, session, "teacher_assignments", "view");
  if (!branches.length) return { branches, branchId: null, year: null, sections: [], teachers: [], subjects: [], allSubjects: [], canEdit: false, totals: { required: 0, assigned: 0, periods: 0, quota: 0 } };
  const branch = branches.find((b) => b.id === branchId) ?? branches[0]!;
  const year = await requireYear(db);
  const [sections, assignments, teachers, loads, subjects] = await Promise.all([
    db.section.findMany({
      where: { branchId: branch.id, academicYearId: year.id, deletedAt: null },
      include: { grade: { select: { id: true, name: true, order: true, stage: { select: { order: true } }, gradeSubjects: { select: { subjectId: true, weeklyPeriods: true } } } } },
    }),
    db.teacherAssignment.findMany({ where: { academicYearId: year.id, section: { branchId: branch.id } } }),
    branchTeachers(db, branch.id),
    db.teacherLoad.findMany({ where: { academicYearId: year.id } }),
    db.subject.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, color: true } }),
  ]);
  // حمل المعلم يشمل كل الفروع (قد يدرّس في أكثر من فرع)
  const allAssignments = await db.teacherAssignment.groupBy({ by: ["teacherId"], where: { academicYearId: year.id }, _sum: { weeklyPeriods: true } });
  const periods = new Map(allAssignments.map((a) => [a.teacherId, a._sum.weeklyPeriods ?? 0]));
  const loadBy = new Map(loads.map((l) => [l.userId, l]));
  const sorted = sections.sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name, "ar"));
  const usedSubjects = new Set(sorted.flatMap((s) => s.grade.gradeSubjects.map((g) => g.subjectId)));
  let required = 0;
  let assignedCount = 0;
  const outSections = sorted.map((s) => ({
    id: s.id,
    label: `${s.grade.name} / ${s.name}`,
    gradeId: s.gradeId,
    cells: s.grade.gradeSubjects.map((g) => {
      required++;
      const a = assignments.find((x) => x.sectionId === s.id && x.subjectId === g.subjectId);
      if (a) assignedCount++;
      return { subjectId: g.subjectId, weeklyPeriods: g.weeklyPeriods, teacherId: a?.teacherId ?? null };
    }),
  }));
  const outTeachers = teachers.map((t) => {
    const l = loadBy.get(t.id);
    return { id: t.id, name: t.name, jobTitle: t.jobTitle, avatarColor: t.avatarColor, avatarUrl: t.avatarUrl, quota: l?.quota ?? 24, freeDay: l?.freeDay ?? null, subjectIds: l?.subjectIds ?? [], periods: periods.get(t.id) ?? 0 };
  });
  return {
    branches,
    branchId: branch.id,
    year: { id: year.id, name: year.name },
    subjects: subjects.filter((s) => usedSubjects.has(s.id)),
    allSubjects: subjects,
    sections: outSections,
    teachers: outTeachers,
    canEdit: (() => {
      try {
        requireBranch(session, "teacher_assignments", "update", branch.id);
        return true;
      } catch {
        return false;
      }
    })(),
    totals: { required, assigned: assignedCount, periods: outTeachers.reduce((s, t) => s + t.periods, 0), quota: outTeachers.reduce((s, t) => s + t.quota, 0) },
  };
}

/**
 * إسناد مادة فصل لمعلم (أو إلغاؤه). عند تغيير المعلم تُنقل حصص الجدول القائمة إليه إن كان متفرغاً فيها،
 * وما تعارض منها يُحذف ويُطلب إعادة التوليد.
 */
export async function setAssignment(db: TenantDb, session: SessionData, input: { sectionId: string; subjectId: string; teacherId: string | null }) {
  const year = await requireYear(db);
  const section = await db.section.findFirst({ where: { id: input.sectionId, academicYearId: year.id, deletedAt: null }, include: { grade: { select: { name: true } } } });
  if (!section) throw notFound("الفصل غير موجود");
  requireBranch(session, "teacher_assignments", "update", section.branchId);
  const plan = await db.gradeSubject.findFirst({ where: { gradeId: section.gradeId, subjectId: input.subjectId }, include: { subject: { select: { name: true } } } });
  if (!plan) throw badRequest("المادة ليست ضمن الخطة الدراسية لهذا الصف");
  const existing = await db.teacherAssignment.findFirst({ where: { academicYearId: year.id, sectionId: section.id, subjectId: input.subjectId } });
  const slots = await db.timetableSlot.findMany({ where: { academicYearId: year.id, sectionId: section.id, subjectId: input.subjectId } });
  let removedSlots = 0;
  if (!input.teacherId) {
    if (existing) await db.teacherAssignment.delete({ where: { id: existing.id } });
    if (slots.length) {
      await db.timetableSlot.deleteMany({ where: { id: { in: slots.map((s) => s.id) } } });
      removedSlots = slots.length;
    }
    return { ok: true, removedSlots, overQuota: false };
  }
  const teachers = await branchTeachers(db, section.branchId);
  if (!teachers.some((t) => t.id === input.teacherId)) throw badRequest("المعلم ليس من معلمي هذا الفرع");
  if (existing?.teacherId === input.teacherId) return { ok: true, removedSlots: 0, overQuota: false };
  if (existing) await db.teacherAssignment.update({ where: { id: existing.id }, data: { teacherId: input.teacherId, weeklyPeriods: plan.weeklyPeriods, updatedById: session.user.id } });
  else
    await db.teacherAssignment.create({
      data: { tenantId: session.tenant.id, academicYearId: year.id, sectionId: section.id, subjectId: input.subjectId, teacherId: input.teacherId, weeklyPeriods: plan.weeklyPeriods, createdById: session.user.id, updatedById: session.user.id },
    });
  // نقل الحصص القائمة للمعلم الجديد
  for (const s of slots) {
    const busy = await db.timetableSlot.findFirst({ where: { academicYearId: year.id, teacherId: input.teacherId, day: s.day, period: s.period } });
    if (busy) {
      await db.timetableSlot.delete({ where: { id: s.id } });
      removedSlots++;
    } else {
      await db.timetableSlot.update({ where: { id: s.id }, data: { teacherId: input.teacherId, updatedById: session.user.id } });
    }
  }
  const [load, total] = await Promise.all([
    db.teacherLoad.findFirst({ where: { userId: input.teacherId, academicYearId: year.id } }),
    db.teacherAssignment.aggregate({ where: { academicYearId: year.id, teacherId: input.teacherId }, _sum: { weeklyPeriods: true } }),
  ]);
  const periods = total._sum.weeklyPeriods ?? 0;
  if (input.teacherId !== session.user.id) {
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: [input.teacherId],
      type: "ASSIGNMENT",
      title: `أُسند إليك تدريس ${plan.subject.name} لفصل ${section.grade.name} / ${section.name}`,
      link: "/academic/timetable",
      actorId: session.user.id,
      entityType: "TeacherAssignment",
      entityId: section.id,
    });
  }
  return { ok: true, removedSlots, overQuota: periods > (load?.quota ?? 24), periods, quota: load?.quota ?? 24 };
}

export async function saveTeacherLoad(db: TenantDb, session: SessionData, input: { userId: string; quota: number; freeDay: number | null; subjectIds: string[] }) {
  const year = await requireYear(db);
  const roles = await db.userRole.findMany({ where: { userId: input.userId, role: { key: "TEACHER" } }, select: { branchId: true } });
  if (!roles.length) throw badRequest("المستخدم ليس معلماً");
  const branchId = roles.find((r) => r.branchId)?.branchId;
  if (branchId) requireBranch(session, "teacher_assignments", "update", branchId);
  else requireBranch(session, "teacher_assignments", "update", "__all__");
  if (input.freeDay !== null && (input.freeDay < 0 || input.freeDay > 6)) throw badRequest("يوم غير صالح");
  const existing = await db.teacherLoad.findFirst({ where: { userId: input.userId, academicYearId: year.id } });
  const data = { quota: input.quota, freeDay: input.freeDay, subjectIds: input.subjectIds, updatedById: session.user.id };
  if (existing) return db.teacherLoad.update({ where: { id: existing.id }, data });
  return db.teacherLoad.create({ data: { tenantId: session.tenant.id, userId: input.userId, academicYearId: year.id, ...data, createdById: session.user.id } });
}

/**
 * إسناد تلقائي للخانات الفارغة في فرع: المعلم المؤهل للمادة (من ملف نصابه) صاحب أكبر متبقٍّ من النصاب،
 * مع تفضيل من يدرّس المادة نفسها للصف نفسه (استمرارية) — ولا يتجاوز النصاب.
 */
export async function autoAssign(db: TenantDb, session: SessionData, branchId: string) {
  requireBranch(session, "teacher_assignments", "update", branchId);
  const board = await assignmentBoard(db, session, branchId);
  const year = await requireYear(db);
  const remaining = new Map(board.teachers.map((t) => [t.id, t.quota - t.periods]));
  const created: Array<{ section: string; subjectId: string; teacherId: string }> = [];
  const skipped: Array<{ section: string; subjectId: string; reason: string }> = [];
  // الأكثر حصصاً أولاً (أصعب في التسكين)
  const empty = board.sections.flatMap((s) => s.cells.filter((c) => !c.teacherId).map((c) => ({ section: s, cell: c }))).sort((a, b) => b.cell.weeklyPeriods - a.cell.weeklyPeriods);
  for (const { section, cell } of empty) {
    const qualified = board.teachers.filter((t) => t.subjectIds.includes(cell.subjectId));
    if (!qualified.length) {
      skipped.push({ section: section.label, subjectId: cell.subjectId, reason: "لا يوجد معلم مؤهل لهذه المادة" });
      continue;
    }
    const sameGrade = new Set(board.sections.filter((s) => s.gradeId === section.gradeId).flatMap((s) => s.cells.filter((c) => c.subjectId === cell.subjectId && c.teacherId).map((c) => c.teacherId!)));
    const candidates = qualified
      .filter((t) => (remaining.get(t.id) ?? 0) >= cell.weeklyPeriods)
      .sort((a, b) => Number(sameGrade.has(b.id)) - Number(sameGrade.has(a.id)) || (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0));
    const pick = candidates[0];
    if (!pick) {
      skipped.push({ section: section.label, subjectId: cell.subjectId, reason: "نصاب المعلمين المؤهلين مكتمل" });
      continue;
    }
    await db.teacherAssignment.create({
      data: { tenantId: session.tenant.id, academicYearId: year.id, sectionId: section.id, subjectId: cell.subjectId, teacherId: pick.id, weeklyPeriods: cell.weeklyPeriods, createdById: session.user.id, updatedById: session.user.id },
    });
    remaining.set(pick.id, (remaining.get(pick.id) ?? 0) - cell.weeklyPeriods);
    cell.teacherId = pick.id;
    created.push({ section: section.label, subjectId: cell.subjectId, teacherId: pick.id });
  }
  const subjectName = new Map(board.allSubjects.map((s) => [s.id, s.name]));
  return { created: created.length, skipped: skipped.map((s) => ({ ...s, subject: subjectName.get(s.subjectId) ?? "" })) };
}
