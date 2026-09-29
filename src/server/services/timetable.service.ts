/**
 * جداول الحصص: جدول الجرس لكل فرع، التوليد الآلي بالقيود، العرض حسب الفصل/المعلم/القاعة/الطالب،
 * النقل اليدوي بالسحب (مع التبديل وفحص التعارض) والتثبيت، وحصص الانتظار (البديل) عند غياب معلم.
 */
import type { Prisma } from "@/generated/prisma/client";
import { resolveScope } from "@/lib/rbac/access";
import { findConflicts, generateTimetable, maxPerDay } from "@/lib/timetable/generator";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { DEFAULT_SCHOOL_DAYS, dateOnly } from "./attendance.service";
import { branchTeachers, branchesFor, canOnBranch, requireBranch, requireSectionWhere, requireYear } from "./academic.service";
import { notify } from "./notifications.service";
import { requireStudentWhere } from "./student-scope";

export interface BellPeriod {
  index: number;
  start: string;
  end: string;
}

export const DEFAULT_PERIODS: BellPeriod[] = [
  { index: 1, start: "06:45", end: "07:30" },
  { index: 2, start: "07:30", end: "08:15" },
  { index: 3, start: "08:15", end: "09:00" },
  { index: 4, start: "09:25", end: "10:10" },
  { index: 5, start: "10:10", end: "10:55" },
  { index: 6, start: "11:10", end: "11:55" },
  { index: 7, start: "11:55", end: "12:40" },
];

export async function getBell(db: TenantDb, branchId: string) {
  const bell = await db.bellSchedule.findFirst({ where: { branchId } });
  const periods = Array.isArray(bell?.periods) ? (bell.periods as unknown as BellPeriod[]) : DEFAULT_PERIODS;
  return { id: bell?.id ?? null, name: bell?.name ?? "الجدول الصيفي/الشتوي", days: bell?.days?.length ? bell.days : DEFAULT_SCHOOL_DAYS, periods, maxConsecutive: bell?.maxConsecutive ?? 4 };
}

export async function saveBell(db: TenantDb, session: SessionData, branchId: string, input: { name: string; days: number[]; periods: Array<{ start: string; end: string }>; maxConsecutive: number }) {
  requireBranch(session, "timetable", "update", branchId);
  const days = [...new Set(input.days)].sort();
  if (!days.length) throw badRequest("اختر يوم دراسة واحداً على الأقل");
  const periods = input.periods.map((p, i) => ({ index: i + 1, start: p.start, end: p.end }));
  for (const [i, p] of periods.entries()) {
    if (!(p.end > p.start)) throw badRequest(`نهاية الحصة ${i + 1} قبل بدايتها`);
    const prev = periods[i - 1];
    if (prev && p.start < prev.end) throw badRequest(`الحصة ${i + 1} تبدأ قبل نهاية السابقة`);
  }
  const year = await requireYear(db);
  // حذف الحصص الواقعة خارج الأيام/الحصص الجديدة
  const removed = await db.timetableSlot.deleteMany({ where: { academicYearId: year.id, sectionId: { in: (await db.section.findMany({ where: { branchId, academicYearId: year.id }, select: { id: true } })).map((s) => s.id) }, OR: [{ day: { notIn: days } }, { period: { gt: periods.length } }] } });
  const existing = await db.bellSchedule.findFirst({ where: { branchId } });
  const data = { name: input.name.trim() || "جدول الجرس", days, periods: periods as unknown as Prisma.InputJsonValue, maxConsecutive: input.maxConsecutive, updatedById: session.user.id };
  if (existing) await db.bellSchedule.update({ where: { id: existing.id }, data });
  else await db.bellSchedule.create({ data: { tenantId: session.tenant.id, branchId, ...data } });
  return { ok: true, removedSlots: removed.count };
}

// ---------------------------------------------------------------------
// التوليد
// ---------------------------------------------------------------------

async function generationInput(db: TenantDb, branchId: string, yearId: string) {
  const bell = await getBell(db, branchId);
  const sections = await db.section.findMany({ where: { branchId, academicYearId: yearId, deletedAt: null }, select: { id: true, gradeId: true } });
  const sectionIds = sections.map((s) => s.id);
  const [assignments, plans, subjects, rooms, loads, locked, otherBusy] = await Promise.all([
    db.teacherAssignment.findMany({ where: { academicYearId: yearId, sectionId: { in: sectionIds } } }),
    db.gradeSubject.findMany({ where: { gradeId: { in: [...new Set(sections.map((s) => s.gradeId))] } } }),
    db.subject.findMany({ where: { deletedAt: null }, select: { id: true, roomKind: true, name: true } }),
    db.room.findMany({ where: { branchId, deletedAt: null, isActive: true, kind: { not: "CLASSROOM" } }, select: { id: true, kind: true } }),
    db.teacherLoad.findMany({ where: { academicYearId: yearId } }),
    db.timetableSlot.findMany({ where: { academicYearId: yearId, sectionId: { in: sectionIds }, locked: true } }),
    db.timetableSlot.findMany({ where: { academicYearId: yearId, sectionId: { notIn: sectionIds } }, select: { teacherId: true, day: true, period: true } }),
  ]);
  const gradeOf = new Map(sections.map((s) => [s.id, s.gradeId]));
  const subjectBy = new Map(subjects.map((s) => [s.id, s]));
  const roomKinds = new Set(rooms.map((r) => r.kind));
  const lessons = assignments.map((a) => {
    const plan = plans.find((p) => p.gradeId === gradeOf.get(a.sectionId) && p.subjectId === a.subjectId);
    const kind = subjectBy.get(a.subjectId)?.roomKind ?? null;
    return { sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId, count: a.weeklyPeriods, heavy: plan?.heavy ?? false, roomKind: kind && roomKinds.has(kind) ? kind : null };
  });
  return {
    bell,
    sections,
    input: {
      days: bell.days,
      periods: bell.periods.length,
      maxConsecutive: bell.maxConsecutive,
      lessons,
      rooms,
      teacherFreeDay: Object.fromEntries(loads.map((l) => [l.userId, l.freeDay])),
      locked: locked.map((s) => ({ sectionId: s.sectionId, day: s.day, period: s.period, subjectId: s.subjectId, teacherId: s.teacherId, roomId: s.roomId, locked: true })),
      teacherBusy: otherBusy,
    },
  };
}

export async function generate(db: TenantDb, session: SessionData, input: { branchId: string; seed?: number }) {
  requireBranch(session, "timetable", "update", input.branchId);
  const year = await requireYear(db);
  const { input: gen, sections } = await generationInput(db, input.branchId, year.id);
  if (!gen.lessons.length) throw badRequest("لا يوجد إسناد للمعلمين في هذا الفرع؛ أسند المواد من «تعيين المعلمين» أولاً");
  const started = Date.now();
  const result = generateTimetable({ ...gen, seed: input.seed ?? Math.floor(Math.random() * 1e9), attempts: 6 });
  const sectionIds = sections.map((s) => s.id);
  await db.$transaction(async (tx) => {
    await tx.timetableSlot.deleteMany({ where: { academicYearId: year.id, sectionId: { in: sectionIds }, locked: false } });
    const fresh = result.slots.filter((s) => !s.locked);
    if (fresh.length) {
      await tx.timetableSlot.createMany({
        data: fresh.map((s) => ({ tenantId: session.tenant.id, academicYearId: year.id, sectionId: s.sectionId, day: s.day, period: s.period, subjectId: s.subjectId, teacherId: s.teacherId, roomId: s.roomId, createdById: session.user.id, updatedById: session.user.id })),
      });
    }
  });
  const [subjects, users, secs] = await Promise.all([
    db.subject.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: result.unplaced.map((u) => u.teacherId) } }, select: { id: true, name: true } }),
    db.section.findMany({ where: { id: { in: result.unplaced.map((u) => u.sectionId) } }, include: { grade: { select: { name: true } } } }),
  ]);
  return {
    placed: result.slots.length,
    total: gen.lessons.reduce((s, l) => s + l.count, 0),
    freeDayViolations: result.freeDayViolations,
    ms: Date.now() - started,
    unplaced: result.unplaced.map((u) => ({
      section: (() => {
        const s = secs.find((x) => x.id === u.sectionId);
        return s ? `${s.grade.name} / ${s.name}` : "";
      })(),
      subject: subjects.find((s) => s.id === u.subjectId)?.name ?? "",
      teacher: users.find((t) => t.id === u.teacherId)?.name ?? "",
      missing: u.missing,
      reason: u.reason,
    })),
  };
}

// ---------------------------------------------------------------------
// العرض
// ---------------------------------------------------------------------

export type GridKind = "section" | "teacher" | "room" | "student";

export async function timetableMeta(db: TenantDb, session: SessionData) {
  const view = resolveScope(session.access, "timetable", "view");
  if (!view) throw forbidden("لا تملك صلاحية عرض الجداول");
  const year = await requireYear(db);
  const branches = await branchesFor(db, session, "timetable", "view");
  const where = await requireSectionWhere(db, session, "timetable", "view");
  const [sections, rooms] = await Promise.all([
    db.section.findMany({ where: { ...where, academicYearId: year.id, deletedAt: null }, include: { grade: { select: { name: true, order: true, stage: { select: { order: true } } } } } }),
    db.room.findMany({ where: { branchId: { in: branches.map((b) => b.id) }, deletedAt: null, kind: { not: "CLASSROOM" } }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true, branchId: true, kind: true } }),
  ]);
  const broad = view.kind === "all" || view.branchIds.length > 0;
  const teachers = broad ? (await Promise.all(branches.map((b) => branchTeachers(db, b.id)))).flatMap((list, i) => list.map((t) => ({ id: t.id, name: t.name, branchId: branches[i]!.id }))) : [];
  const uniqueTeachers = [...new Map(teachers.map((t) => [t.id, t])).values()];
  const isTeacher = await db.userRole.count({ where: { userId: session.user.id, role: { key: "TEACHER" } } });
  const children = view.kind !== "all" && (view.own || view.assigned) ? await db.student.findMany({ where: { deletedAt: null, status: "ACTIVE", OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true, fullName: true } }) : [];
  return {
    year: { id: year.id, name: year.name },
    branches: await Promise.all(branches.map(async (b) => ({ ...b, bell: await getBell(db, b.id), canEdit: canOnBranch(session, "timetable", "update", b.id) }))),
    sections: sections
      .sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name, "ar"))
      .map((s) => ({ id: s.id, label: `${s.grade.name} / ${s.name}`, branchId: s.branchId })),
    teachers: uniqueTeachers,
    rooms,
    children,
    me: isTeacher ? session.user.id : null,
  };
}

async function slotRows(db: TenantDb, where: Prisma.TimetableSlotWhereInput) {
  const slots = await db.timetableSlot.findMany({ where });
  const [subjects, users, sections, rooms] = await Promise.all([
    db.subject.findMany({ where: { id: { in: [...new Set(slots.map((s) => s.subjectId))] } }, select: { id: true, name: true, color: true, code: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(slots.map((s) => s.teacherId))] } }, select: { id: true, name: true } }),
    db.section.findMany({ where: { id: { in: [...new Set(slots.map((s) => s.sectionId))] } }, include: { grade: { select: { name: true } } } }),
    db.room.findMany({ where: { id: { in: [...new Set(slots.map((s) => s.roomId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } }),
  ]);
  const sub = new Map(subjects.map((s) => [s.id, s]));
  const usr = new Map(users.map((u) => [u.id, u.name]));
  const sec = new Map(sections.map((s) => [s.id, s]));
  const rm = new Map(rooms.map((r) => [r.id, r.name]));
  return slots.map((s) => {
    const section = sec.get(s.sectionId);
    return {
      id: s.id,
      day: s.day,
      period: s.period,
      locked: s.locked,
      sectionId: s.sectionId,
      sectionLabel: section ? `${section.grade.name} / ${section.name}` : "",
      sectionRoom: section?.room ?? null,
      subjectId: s.subjectId,
      subject: sub.get(s.subjectId)?.name ?? "",
      color: sub.get(s.subjectId)?.color ?? "gray",
      teacherId: s.teacherId,
      teacher: usr.get(s.teacherId) ?? "",
      roomId: s.roomId,
      room: s.roomId ? (rm.get(s.roomId) ?? null) : null,
    };
  });
}

export async function grid(db: TenantDb, session: SessionData, input: { kind: GridKind; id: string }) {
  const year = await requireYear(db);
  let branchId: string;
  let title: string;
  let where: Prisma.TimetableSlotWhereInput;
  let sectionForTray: string | null = null;
  if (input.kind === "section" || input.kind === "student") {
    let sectionId = input.id;
    if (input.kind === "student") {
      const sw = await requireStudentWhere(db, session, "timetable", "view");
      const st = await db.student.findFirst({ where: { ...sw, id: input.id, deletedAt: null } });
      if (!st?.sectionId) throw notFound("الطالب غير مسكّن في فصل");
      sectionId = st.sectionId;
    } else {
      const w = await requireSectionWhere(db, session, "timetable", "view");
      const ok = await db.section.findFirst({ where: { ...w, id: sectionId, deletedAt: null } });
      if (!ok) throw notFound("الفصل غير موجود أو خارج نطاق صلاحيتك");
    }
    const s = await db.section.findFirst({ where: { id: sectionId }, include: { grade: { select: { name: true } }, branch: { select: { name: true } } } });
    if (!s) throw notFound();
    branchId = s.branchId;
    title = `${s.grade.name} / ${s.name} — ${s.branch.name}`;
    where = { academicYearId: year.id, sectionId };
    sectionForTray = sectionId;
  } else if (input.kind === "teacher") {
    const view = resolveScope(session.access, "timetable", "view");
    if (!view) throw forbidden();
    const t = await db.user.findFirst({ where: { id: input.id }, select: { id: true, name: true } });
    if (!t) throw notFound("المعلم غير موجود");
    const roles = await db.userRole.findMany({ where: { userId: t.id, role: { key: "TEACHER" } }, select: { branchId: true } });
    branchId = roles.find((r) => r.branchId)?.branchId ?? "";
    const broad = view.kind === "all" || (branchId && view.branchIds.includes(branchId));
    if (!broad && t.id !== session.user.id) throw forbidden("تعرض جدولك فقط");
    title = t.name;
    where = { academicYearId: year.id, teacherId: t.id };
  } else {
    const room = await db.room.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!room) throw notFound("القاعة غير موجودة");
    if (!canOnBranch(session, "timetable", "view", room.branchId)) throw forbidden();
    branchId = room.branchId;
    title = room.name;
    where = { academicYearId: year.id, roomId: room.id };
  }
  const bell = branchId ? await getBell(db, branchId) : { days: DEFAULT_SCHOOL_DAYS, periods: [], maxConsecutive: 4, id: null, name: "" };
  const slots = await slotRows(db, where);
  // صينية الحصص غير المسكّنة (للفصل): الإسناد ناقص ما في الجدول
  let tray: Array<{ subjectId: string; subject: string; color: string; teacherId: string; teacher: string; missing: number }> = [];
  if (sectionForTray) {
    const assignments = await db.teacherAssignment.findMany({ where: { academicYearId: year.id, sectionId: sectionForTray } });
    const subjects = await db.subject.findMany({ where: { id: { in: assignments.map((a) => a.subjectId) } }, select: { id: true, name: true, color: true } });
    const teachers = await db.user.findMany({ where: { id: { in: assignments.map((a) => a.teacherId) } }, select: { id: true, name: true } });
    tray = assignments
      .map((a) => ({
        subjectId: a.subjectId,
        subject: subjects.find((s) => s.id === a.subjectId)?.name ?? "",
        color: subjects.find((s) => s.id === a.subjectId)?.color ?? "gray",
        teacherId: a.teacherId,
        teacher: teachers.find((t) => t.id === a.teacherId)?.name ?? "",
        missing: a.weeklyPeriods - slots.filter((s) => s.subjectId === a.subjectId).length,
      }))
      .filter((t) => t.missing > 0);
  }
  const canEdit = Boolean(branchId) && input.kind !== "student" && canOnBranch(session, "timetable", "update", branchId);
  return { title, branchId, sectionId: sectionForTray, days: bell.days, periods: bell.periods, maxConsecutive: bell.maxConsecutive, slots, tray, canEdit, weeklyPeriods: slots.length };
}

// ---------------------------------------------------------------------
// التعديل اليدوي
// ---------------------------------------------------------------------

async function validateBranchSlots(db: TenantDb, yearId: string, branchId: string, changed: Array<{ id?: string; sectionId: string; day: number; period: number; subjectId: string; teacherId: string; roomId: string | null }>) {
  const bell = await getBell(db, branchId);
  const teacherIds = [...new Set(changed.map((c) => c.teacherId))];
  const sectionIds = [...new Set(changed.map((c) => c.sectionId))];
  const roomIds = [...new Set(changed.map((c) => c.roomId).filter((x): x is string => Boolean(x)))];
  const others = await db.timetableSlot.findMany({
    where: { academicYearId: yearId, id: { notIn: changed.map((c) => c.id).filter((x): x is string => Boolean(x)) }, OR: [{ teacherId: { in: teacherIds } }, { sectionId: { in: sectionIds } }, ...(roomIds.length ? [{ roomId: { in: roomIds } }] : [])] },
  });
  for (const c of changed) {
    if (!bell.days.includes(c.day) || c.period < 1 || c.period > bell.periods.length) throw badRequest("الخانة خارج أيام الدراسة أو عدد الحصص");
  }
  const all = [...others, ...changed];
  const plans = await db.gradeSubject.findMany({ where: { subjectId: { in: [...new Set(changed.map((c) => c.subjectId))] } } });
  const sections = await db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, gradeId: true } });
  const planOf = (sectionId: string, subjectId: string) => plans.find((p) => p.subjectId === subjectId && p.gradeId === sections.find((s) => s.id === sectionId)?.gradeId);
  const conflicts = findConflicts(all, {
    periods: bell.periods.length,
    maxConsecutive: bell.maxConsecutive,
    dayCount: bell.days.length,
    heavy: (s, subj) => (sectionIds.includes(s) ? (planOf(s, subj)?.heavy ?? false) : false),
    counts: (s, subj) => (sectionIds.includes(s) ? (planOf(s, subj)?.weeklyPeriods ?? 99) : 99),
  }).filter((c) => changed.some((x) => x.day === c.day && (c.period === 0 || x.period === c.period || c.kind === "consecutive")));
  if (conflicts.length) throw badRequest(conflicts[0]!.message, { conflicts });
  // يوم الراحة المفضل: تحذير فقط
  const loads = await db.teacherLoad.findMany({ where: { academicYearId: yearId, userId: { in: teacherIds } } });
  const warnings = changed.filter((c) => loads.some((l) => l.userId === c.teacherId && l.freeDay === c.day)).map(() => "الحصة في يوم الراحة المفضل للمعلم");
  return { warnings: [...new Set(warnings)] };
}

/** نقل حصة إلى خانة أخرى في جدول الفصل؛ إن كانت الخانة مشغولة بحصة غير مثبّتة تُبدَّلان */
export async function moveSlot(db: TenantDb, session: SessionData, input: { slotId: string; day: number; period: number }) {
  const year = await requireYear(db);
  const slot = await db.timetableSlot.findFirst({ where: { id: input.slotId, academicYearId: year.id } });
  if (!slot) throw notFound("الحصة غير موجودة");
  const section = await db.section.findFirst({ where: { id: slot.sectionId } });
  if (!section) throw notFound();
  requireBranch(session, "timetable", "update", section.branchId);
  if (slot.locked) throw badRequest("الحصة مثبّتة؛ ألغِ التثبيت أولاً");
  if (slot.day === input.day && slot.period === input.period) return { ok: true, warnings: [] };
  const target = await db.timetableSlot.findFirst({ where: { academicYearId: year.id, sectionId: slot.sectionId, day: input.day, period: input.period } });
  if (target?.locked) throw badRequest("الخانة الهدف فيها حصة مثبّتة");
  const changed = [{ ...slot, day: input.day, period: input.period }, ...(target ? [{ ...target, day: slot.day, period: slot.period }] : [])];
  const { warnings } = await validateBranchSlots(db, year.id, section.branchId, changed);
  // تبديل آمن مع القيود الفريدة: نقل مؤقت لخانة وهمية
  await db.$transaction(async (tx) => {
    if (target) await tx.timetableSlot.update({ where: { id: target.id }, data: { day: -1, period: -1 } });
    await tx.timetableSlot.update({ where: { id: slot.id }, data: { day: input.day, period: input.period, updatedById: session.user.id } });
    if (target) await tx.timetableSlot.update({ where: { id: target.id }, data: { day: slot.day, period: slot.period, updatedById: session.user.id } });
  });
  return { ok: true, swapped: Boolean(target), warnings };
}

/** وضع حصة من الصينية (مادة غير مكتملة) في خانة فارغة */
export async function placeSlot(db: TenantDb, session: SessionData, input: { sectionId: string; subjectId: string; day: number; period: number }) {
  const year = await requireYear(db);
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null } });
  if (!section) throw notFound();
  requireBranch(session, "timetable", "update", section.branchId);
  const a = await db.teacherAssignment.findFirst({ where: { academicYearId: year.id, sectionId: section.id, subjectId: input.subjectId } });
  if (!a) throw badRequest("المادة غير مسندة لمعلم في هذا الفصل");
  const placed = await db.timetableSlot.count({ where: { academicYearId: year.id, sectionId: section.id, subjectId: input.subjectId } });
  if (placed >= a.weeklyPeriods) throw badRequest("اكتملت حصص المادة الأسبوعية");
  const busy = await db.timetableSlot.findFirst({ where: { academicYearId: year.id, sectionId: section.id, day: input.day, period: input.period } });
  if (busy) throw badRequest("الخانة مشغولة");
  const subject = await db.subject.findFirst({ where: { id: input.subjectId } });
  let roomId: string | null = null;
  if (subject?.roomKind) {
    const rooms = await db.room.findMany({ where: { branchId: section.branchId, kind: subject.roomKind, deletedAt: null, isActive: true } });
    const taken = await db.timetableSlot.findMany({ where: { academicYearId: year.id, day: input.day, period: input.period, roomId: { in: rooms.map((r) => r.id) } }, select: { roomId: true } });
    roomId = rooms.find((r) => !taken.some((t) => t.roomId === r.id))?.id ?? null;
    if (rooms.length && !roomId) throw badRequest("لا توجد قاعة متاحة من النوع المطلوب في هذه الخانة");
  }
  const candidate = { sectionId: section.id, day: input.day, period: input.period, subjectId: input.subjectId, teacherId: a.teacherId, roomId };
  const { warnings } = await validateBranchSlots(db, year.id, section.branchId, [candidate]);
  const slot = await db.timetableSlot.create({ data: { tenantId: session.tenant.id, academicYearId: year.id, ...candidate, createdById: session.user.id, updatedById: session.user.id } });
  return { ok: true, id: slot.id, warnings };
}

export async function removeSlot(db: TenantDb, session: SessionData, slotId: string) {
  const slot = await db.timetableSlot.findFirst({ where: { id: slotId } });
  if (!slot) throw notFound();
  const section = await db.section.findFirst({ where: { id: slot.sectionId } });
  requireBranch(session, "timetable", "update", section!.branchId);
  await db.substitution.deleteMany({ where: { slotId, date: { gte: dateOnly(new Date().toISOString().slice(0, 10)) } } });
  await db.timetableSlot.delete({ where: { id: slotId } });
  return { ok: true };
}

export async function toggleLock(db: TenantDb, session: SessionData, slotId: string) {
  const slot = await db.timetableSlot.findFirst({ where: { id: slotId } });
  if (!slot) throw notFound();
  const section = await db.section.findFirst({ where: { id: slot.sectionId } });
  requireBranch(session, "timetable", "update", section!.branchId);
  await db.timetableSlot.update({ where: { id: slotId }, data: { locked: !slot.locked, updatedById: session.user.id } });
  return { locked: !slot.locked };
}

/** خانات يمكن نقل الحصة إليها دون تعارض (لتلوين الخانات أثناء السحب) */
export async function feasibleCells(db: TenantDb, session: SessionData, slotId: string) {
  const year = await requireYear(db);
  const slot = await db.timetableSlot.findFirst({ where: { id: slotId, academicYearId: year.id } });
  if (!slot) throw notFound();
  const section = await db.section.findFirst({ where: { id: slot.sectionId } });
  if (!section || !canOnBranch(session, "timetable", "update", section.branchId)) throw forbidden();
  const bell = await getBell(db, section.branchId);
  const [teacherSlots, sectionSlots, roomSlots, plan, load] = await Promise.all([
    db.timetableSlot.findMany({ where: { academicYearId: year.id, teacherId: slot.teacherId, id: { not: slot.id } }, select: { day: true, period: true } }),
    db.timetableSlot.findMany({ where: { academicYearId: year.id, sectionId: slot.sectionId, id: { not: slot.id } }, select: { day: true, period: true, subjectId: true, locked: true, teacherId: true } }),
    slot.roomId ? db.timetableSlot.findMany({ where: { academicYearId: year.id, roomId: slot.roomId, id: { not: slot.id } }, select: { day: true, period: true } }) : [],
    db.gradeSubject.findFirst({ where: { gradeId: section.gradeId, subjectId: slot.subjectId } }),
    db.teacherLoad.findFirst({ where: { academicYearId: year.id, userId: slot.teacherId } }),
  ]);
  const cap = maxPerDay({ heavy: plan?.heavy ?? false, count: plan?.weeklyPeriods ?? 1 }, bell.days.length);
  const cells: Array<{ day: number; period: number; ok: boolean; soft?: boolean }> = [];
  for (const day of bell.days) {
    const sameDay = sectionSlots.filter((s) => s.day === day && s.subjectId === slot.subjectId).length;
    for (let period = 1; period <= bell.periods.length; period++) {
      const occupant = sectionSlots.find((s) => s.day === day && s.period === period);
      let ok = !teacherSlots.some((t) => t.day === day && t.period === period) && !(roomSlots as Array<{ day: number; period: number }>).some((r) => r.day === day && r.period === period);
      if (occupant?.locked) ok = false;
      if (day !== slot.day && sameDay >= cap) ok = false;
      // الحصة المُبدَّلة يجب أن يتفرغ معلمها في الخانة الأصلية
      if (ok && occupant) {
        const busy = await db.timetableSlot.findFirst({ where: { academicYearId: year.id, teacherId: occupant.teacherId, day: slot.day, period: slot.period, id: { not: slot.id } } });
        if (busy) ok = false;
      }
      cells.push({ day, period, ok, soft: load?.freeDay === day });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------
// حصص الانتظار (البديل)
// ---------------------------------------------------------------------

export async function substitutionDay(db: TenantDb, session: SessionData, date: string) {
  const branches = await branchesFor(db, session, "timetable", "view");
  const year = await requireYear(db);
  const day = dateOnly(date);
  const subs = await db.substitution.findMany({ where: { date: day }, orderBy: { createdAt: "asc" } });
  const slots = await slotRows(db, { id: { in: subs.map((s) => s.slotId) } });
  const sectionBranch = new Map((await db.section.findMany({ where: { id: { in: slots.map((s) => s.sectionId) } }, select: { id: true, branchId: true } })).map((s) => [s.id, s.branchId]));
  const allowed = new Set(branches.map((b) => b.id));
  const userIds = [...new Set(subs.flatMap((s) => [s.absentTeacherId, s.substituteTeacherId].filter((x): x is string => Boolean(x))))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const uName = new Map(users.map((u) => [u.id, u.name]));
  const rows = subs
    .map((s) => {
      const slot = slots.find((x) => x.id === s.slotId);
      if (!slot) return null;
      const branchId = sectionBranch.get(slot.sectionId) ?? "";
      if (!allowed.has(branchId)) return null;
      return { id: s.id, status: s.status, note: s.note, absentTeacherId: s.absentTeacherId, absentTeacher: uName.get(s.absentTeacherId) ?? "", substituteTeacherId: s.substituteTeacherId, substituteTeacher: s.substituteTeacherId ? (uName.get(s.substituteTeacherId) ?? "") : null, slot, branchId, canEdit: canOnBranch(session, "timetable", "update", branchId) };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.slot.period - b.slot.period);
  const bells = await Promise.all(branches.map(async (b) => ({ branchId: b.id, bell: await getBell(db, b.id) })));
  void year;
  return { date, weekday: day.getUTCDay(), rows, bells, branches: branches.map((b) => ({ ...b, canEdit: canOnBranch(session, "timetable", "update", b.id) })) };
}

/** تسجيل غياب معلم في يوم: تُنشأ حصص انتظار لكل حصصه في ذلك اليوم */
export async function recordTeacherAbsence(db: TenantDb, session: SessionData, input: { date: string; teacherId: string; note?: string | null }) {
  const year = await requireYear(db);
  const day = dateOnly(input.date);
  const slots = await db.timetableSlot.findMany({ where: { academicYearId: year.id, teacherId: input.teacherId, day: day.getUTCDay() } });
  if (!slots.length) throw badRequest("لا توجد حصص للمعلم في هذا اليوم");
  const sections = await db.section.findMany({ where: { id: { in: slots.map((s) => s.sectionId) } }, select: { id: true, branchId: true } });
  for (const b of new Set(sections.map((s) => s.branchId))) requireBranch(session, "timetable", "update", b);
  let created = 0;
  for (const s of slots) {
    const exists = await db.substitution.findFirst({ where: { slotId: s.id, date: day } });
    if (exists) continue;
    await db.substitution.create({ data: { tenantId: session.tenant.id, slotId: s.id, date: day, absentTeacherId: input.teacherId, note: input.note?.trim() || null, createdById: session.user.id, updatedById: session.user.id } });
    created++;
  }
  return { created, total: slots.length };
}

/** المعلمون المتفرغون في خانة الحصة، مرتبين: مؤهل للمادة، يدرّس الفصل، أقل حصص انتظار هذا الشهر، أقل حصص في اليوم */
export async function substituteSuggestions(db: TenantDb, session: SessionData, substitutionId: string) {
  const year = await requireYear(db);
  const sub = await db.substitution.findFirst({ where: { id: substitutionId } });
  if (!sub) throw notFound();
  const slot = await db.timetableSlot.findFirst({ where: { id: sub.slotId } });
  if (!slot) throw notFound();
  const section = await db.section.findFirst({ where: { id: slot.sectionId } });
  if (!section || !canOnBranch(session, "timetable", "update", section.branchId)) throw forbidden();
  const teachers = await branchTeachers(db, section.branchId);
  const [busy, absent, loads, teachesSection, monthSubs, dayCounts] = await Promise.all([
    db.timetableSlot.findMany({ where: { academicYearId: year.id, day: slot.day, period: slot.period }, select: { teacherId: true } }),
    db.substitution.findMany({ where: { date: sub.date }, select: { absentTeacherId: true, substituteTeacherId: true, slotId: true } }),
    db.teacherLoad.findMany({ where: { academicYearId: year.id } }),
    db.teacherAssignment.findMany({ where: { academicYearId: year.id, sectionId: slot.sectionId }, select: { teacherId: true } }),
    db.substitution.groupBy({ by: ["substituteTeacherId"], where: { status: "ASSIGNED", date: { gte: new Date(sub.date.getTime() - 30 * 86_400_000), lte: sub.date } }, _count: { _all: true } }),
    db.timetableSlot.groupBy({ by: ["teacherId"], where: { academicYearId: year.id, day: slot.day }, _count: { _all: true } }),
  ]);
  const busyIds = new Set(busy.map((b) => b.teacherId));
  const absentIds = new Set(absent.map((a) => a.absentTeacherId));
  // من كُلّف بانتظار آخر في الخانة نفسها
  const sameSlotSubs = await db.substitution.findMany({ where: { date: sub.date, status: "ASSIGNED", id: { not: sub.id }, slotId: { in: (await db.timetableSlot.findMany({ where: { academicYearId: year.id, day: slot.day, period: slot.period }, select: { id: true } })).map((s) => s.id) } }, select: { substituteTeacherId: true } });
  const alsoBusy = new Set(sameSlotSubs.map((s) => s.substituteTeacherId));
  const monthly = new Map(monthSubs.map((m) => [m.substituteTeacherId, m._count._all]));
  const daily = new Map(dayCounts.map((d) => [d.teacherId, d._count._all]));
  const qualified = new Set(loads.filter((l) => l.subjectIds.includes(slot.subjectId)).map((l) => l.userId));
  const knows = new Set(teachesSection.map((t) => t.teacherId));
  return teachers
    .filter((t) => !busyIds.has(t.id) && !absentIds.has(t.id) && !alsoBusy.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, jobTitle: t.jobTitle, qualified: qualified.has(t.id), knowsSection: knows.has(t.id), monthCount: monthly.get(t.id) ?? 0, dayLoad: daily.get(t.id) ?? 0 }))
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || Number(b.knowsSection) - Number(a.knowsSection) || a.monthCount - b.monthCount || a.dayLoad - b.dayLoad);
}

export async function assignSubstitute(db: TenantDb, session: SessionData, input: { id: string; teacherId: string | null; note?: string | null }) {
  const sub = await db.substitution.findFirst({ where: { id: input.id } });
  if (!sub) throw notFound();
  const slot = await db.timetableSlot.findFirst({ where: { id: sub.slotId } });
  if (!slot) throw notFound();
  const section = await db.section.findFirst({ where: { id: slot.sectionId }, include: { grade: { select: { name: true } } } });
  requireBranch(session, "timetable", "update", section!.branchId);
  if (input.teacherId) {
    const options = await substituteSuggestions(db, session, sub.id);
    if (!options.some((o) => o.id === input.teacherId)) throw badRequest("المعلم غير متفرغ في هذه الحصة");
  }
  await db.substitution.update({ where: { id: sub.id }, data: { substituteTeacherId: input.teacherId, status: input.teacherId ? "ASSIGNED" : "PENDING", note: input.note ?? sub.note, updatedById: session.user.id } });
  if (input.teacherId) {
    const subject = await db.subject.findFirst({ where: { id: slot.subjectId }, select: { name: true } });
    const date = sub.date.toISOString().slice(0, 10);
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: [input.teacherId],
      type: "ASSIGNMENT",
      title: `حصة انتظار: ${subject?.name ?? ""} — ${section!.grade.name} / ${section!.name}، الحصة ${slot.period} يوم ${date}`,
      link: `/academic/timetable/substitutions?date=${date}`,
      actorId: session.user.id,
      entityType: "Substitution",
      entityId: sub.id,
    });
  }
  return { ok: true };
}

export async function cancelSubstitution(db: TenantDb, session: SessionData, id: string) {
  const sub = await db.substitution.findFirst({ where: { id } });
  if (!sub) throw notFound();
  const slot = await db.timetableSlot.findFirst({ where: { id: sub.slotId } });
  const section = slot ? await db.section.findFirst({ where: { id: slot.sectionId } }) : null;
  if (section) requireBranch(session, "timetable", "update", section.branchId);
  await db.substitution.delete({ where: { id } });
  return { ok: true };
}

/** جدولي اليوم (للمعلم): حصصه وحصص الانتظار المكلّف بها */
export async function myDay(db: TenantDb, session: SessionData, date: string) {
  const year = await requireYear(db);
  const day = dateOnly(date);
  const own = await slotRows(db, { academicYearId: year.id, teacherId: session.user.id, day: day.getUTCDay() });
  const subs = await db.substitution.findMany({ where: { date: day, substituteTeacherId: session.user.id, status: "ASSIGNED" } });
  const covering = subs.length ? await slotRows(db, { id: { in: subs.map((s) => s.slotId) } }) : [];
  return { own: own.sort((a, b) => a.period - b.period), covering };
}
