/**
 * الحضور والغياب: التحضير اليومي أو بالحصة، قفل التعديل بعد مدة، إشعار ولي الأمر عند الغياب،
 * وتنبيه تجاوز حد الغياب (يُسجَّل سلوكاً ويُبلَّغ المرشد والوكيل)، مع لوحة «غياب اليوم» والتقارير.
 */
import type { Prisma } from "@/generated/prisma/client";
import { ATTENDANCE_STATUS, type AttendanceStatusKey } from "@/lib/students";
import { resolveScope, can } from "@/lib/rbac/access";
import { toISODate, zonedTimeToUtc } from "@/lib/dates";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { currentYear } from "@/server/collections/options";
import { messageGuardians } from "./guardian-messages";
import { readModuleSettings } from "./module-settings.service";
import { nextNumber } from "./sequence.service";
import { notify } from "./notifications.service";
import { requireStudentWhere, teacherSectionIds } from "./student-scope";

export const DEFAULT_SCHOOL_DAYS = [0, 1, 2, 3, 4];
export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

function settingsOf(session: SessionData) {
  return readModuleSettings(session.tenant.settings, "attendance");
}

/** هل يملك المستخدم التحضير/العرض لهذا الفصل؟ */
export async function canAccessSection(db: TenantDb, session: SessionData, section: { id: string; branchId: string; grade: { stageId: string } }, action: "view" | "create" | "update") {
  const scope = resolveScope(session.access, "attendance", action);
  if (!scope) return false;
  if (scope.kind === "all") return true;
  if (scope.branchIds.includes(section.branchId)) return true;
  if (scope.stageIds.includes(section.grade.stageId)) return true;
  if (scope.assigned) return (await teacherSectionIds(db, session.user.id)).includes(section.id);
  return false;
}

/** أيام الدراسة والعطل */
export async function schoolDayInfo(db: TenantDb, branchId: string, iso: string) {
  const bell = await db.bellSchedule.findFirst({ where: { branchId } });
  const days = bell?.days?.length ? bell.days : DEFAULT_SCHOOL_DAYS;
  const weekday = dateOnly(iso).getUTCDay();
  const start = dateOnly(iso);
  const end = new Date(start.getTime() + 86_400_000);
  const holiday = await db.calendarEvent.findFirst({
    where: { category: "HOLIDAY", deletedAt: null, startAt: { lt: end }, endAt: { gte: start }, OR: [{ branchId: null }, { branchId }] },
    select: { title: true },
  });
  const periods = Array.isArray(bell?.periods) ? (bell!.periods as unknown[]).length : 7;
  return { isSchoolDay: days.includes(weekday) && !holiday, holiday: holiday?.title ?? null, weekend: !days.includes(weekday), periods };
}

function isLocked(session: SessionData, iso: string) {
  if (can(session.access, "attendance", "approve")) return false;
  const { lockHours } = settingsOf(session);
  const endOfDay = zonedTimeToUtc(`${iso}T23:59`, session.tenant.timezone);
  return Date.now() > endOfDay.getTime() + lockHours * 3_600_000;
}

/** الفصول التي يستطيع المستخدم تحضيرها مع حالة التحضير لليوم */
export async function mySections(db: TenantDb, session: SessionData, iso: string) {
  const year = await currentYear(db);
  if (!year) return [];
  const sections = await db.section.findMany({
    where: { academicYearId: year.id, deletedAt: null },
    include: { grade: { select: { name: true, stageId: true, order: true, stage: { select: { order: true } } } }, branch: { select: { name: true } } },
  });
  const visible = [];
  for (const s of sections) if (await canAccessSection(db, session, s, "view")) visible.push(s);
  const ids = visible.map((s) => s.id);
  const [students, records] = await Promise.all([
    db.student.groupBy({ by: ["sectionId"], where: { sectionId: { in: ids }, status: "ACTIVE", deletedAt: null }, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["sectionId", "status"], where: { sectionId: { in: ids }, date: dateOnly(iso), period: 0 }, _count: { _all: true } }),
  ]);
  const canTake = new Set<string>();
  for (const s of visible) if (await canAccessSection(db, session, s, "create")) canTake.add(s.id);
  return visible
    .sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name, "ar"))
    .map((s) => {
      const counts = Object.fromEntries(records.filter((r) => r.sectionId === s.id).map((r) => [r.status, r._count._all])) as Partial<Record<AttendanceStatusKey, number>>;
      const recorded = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);
      return {
        id: s.id,
        label: `${s.grade.name} / ${s.name}`,
        branchId: s.branchId,
        branchName: s.branch.name,
        students: students.find((x) => x.sectionId === s.id)?._count._all ?? 0,
        recorded,
        counts,
        canTake: canTake.has(s.id),
      };
    });
}

export async function rollCall(db: TenantDb, session: SessionData, input: { sectionId: string; date: string; period?: number }) {
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, include: { grade: { select: { name: true, stageId: true } }, branch: { select: { name: true } } } });
  if (!section) throw notFound("الفصل غير موجود");
  if (!(await canAccessSection(db, session, section, "view"))) throw forbidden("لا تملك صلاحية على هذا الفصل");
  const period = input.period ?? 0;
  const date = dateOnly(input.date);
  const [students, records, leaves, day] = await Promise.all([
    db.student.findMany({
      where: { sectionId: section.id, status: "ACTIVE", deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, academicNumber: true, photoUrl: true, criticalHealth: true, chronicConditions: true, allergies: true },
    }),
    db.attendance.findMany({ where: { sectionId: section.id, date, period } }),
    db.studentLeave.findMany({ where: { student: { sectionId: section.id }, status: "APPROVED", deletedAt: null, startDate: { lte: date }, endDate: { gte: date } }, select: { studentId: true, kind: true, reason: true } }),
    schoolDayInfo(db, section.branchId, input.date),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const leaveBy = new Map(leaves.map((l) => [l.studentId, l]));
  return {
    section: { id: section.id, label: `${section.grade.name} / ${section.name}`, branchName: section.branch.name },
    date: input.date,
    period,
    mode: settingsOf(session).mode,
    day,
    locked: isLocked(session, input.date),
    canEdit: (await canAccessSection(db, session, section, "create")) && !isLocked(session, input.date),
    taken: records.length > 0,
    students: students.map((s) => {
      const r = byStudent.get(s.id);
      const leave = leaveBy.get(s.id);
      return {
        ...s,
        healthNote: s.criticalHealth ? [s.chronicConditions, s.allergies].filter(Boolean).join(" — ") : null,
        status: (r?.status ?? null) as AttendanceStatusKey | null,
        reason: r?.reason ?? null,
        minutesLate: r?.minutesLate ?? null,
        source: r?.source ?? null,
        leave: leave ? { kind: leave.kind, reason: leave.reason } : null,
      };
    }),
  };
}

export interface RollCallEntry {
  studentId: string;
  status: AttendanceStatusKey;
  reason?: string | null;
  minutesLate?: number | null;
}

export async function saveRollCall(db: TenantDb, session: SessionData, input: { sectionId: string; date: string; period?: number; entries: RollCallEntry[] }) {
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, include: { grade: { select: { name: true, stageId: true } } } });
  if (!section) throw notFound("الفصل غير موجود");
  if (!(await canAccessSection(db, session, section, "create"))) throw forbidden("لا تملك صلاحية تحضير هذا الفصل");
  if (isLocked(session, input.date)) throw forbidden("انتهت مدة تعديل التحضير لهذا اليوم؛ يلزم اعتماد الوكيل");
  const todayIso = toISODate(new Date(), session.tenant.timezone);
  if (input.date > todayIso) throw badRequest("لا يمكن التحضير ليوم قادم");
  const day = await schoolDayInfo(db, section.branchId, input.date);
  if (!day.isSchoolDay) throw badRequest(day.holiday ? `اليوم إجازة: ${day.holiday}` : "اليوم ليس يوم دراسة");
  const period = input.period ?? 0;
  const date = dateOnly(input.date);

  const students = await db.student.findMany({ where: { sectionId: section.id, status: "ACTIVE", deletedAt: null }, select: { id: true, fullName: true } });
  const valid = new Set(students.map((s) => s.id));
  for (const e of input.entries) {
    if (!valid.has(e.studentId)) throw badRequest("طالب غير موجود في هذا الفصل");
    if (!(e.status in ATTENDANCE_STATUS)) throw badRequest("حالة غير صالحة");
  }
  const existing = new Map((await db.attendance.findMany({ where: { sectionId: section.id, date, period } })).map((r) => [r.studentId, r]));
  const toCreate: Prisma.AttendanceCreateManyInput[] = [];
  const newlyAbsent: string[] = [];
  const newlyLate: string[] = [];
  for (const e of input.entries) {
    const prev = existing.get(e.studentId);
    const reason = e.reason?.trim().slice(0, 300) || null;
    const minutesLate = e.status === "LATE" && e.minutesLate ? Math.max(1, Math.min(240, Math.round(e.minutesLate))) : null;
    if (!prev) {
      toCreate.push({ tenantId: session.tenant.id, branchId: section.branchId, studentId: e.studentId, sectionId: section.id, date, period, status: e.status, reason, minutesLate, recordedById: session.user.id });
    } else if (prev.status !== e.status || prev.reason !== reason || prev.minutesLate !== minutesLate) {
      await db.attendance.update({ where: { id: prev.id }, data: { status: e.status, reason, minutesLate, source: "MANUAL", updatedById: session.user.id } });
    } else continue;
    if (e.status === "ABSENT" && prev?.status !== "ABSENT") newlyAbsent.push(e.studentId);
    if (e.status === "LATE" && prev?.status !== "LATE") newlyLate.push(e.studentId);
  }
  if (toCreate.length) await db.attendance.createMany({ data: toCreate });

  const settings = settingsOf(session);
  const names = new Map(students.map((s) => [s.id, s.fullName]));
  // الإشعار ليوم اليوم فقط (تصحيح أيام سابقة لا يرسل رسائل متأخرة)
  if (input.date === todayIso) {
    if (settings.notifyAbsence) for (const id of newlyAbsent) await messageGuardians(db, session, id, "absence", { student: names.get(id), date: input.date }, { link: `/students/${id}?tab=attendance` });
    if (settings.notifyLate) for (const id of newlyLate) await messageGuardians(db, session, id, "late", { student: names.get(id), date: input.date });
  }
  const alerts = await checkAbsenceThreshold(db, session, newlyAbsent, input.date, section.branchId);
  return { saved: input.entries.length, created: toCreate.length, notified: input.date === todayIso && settings.notifyAbsence ? newlyAbsent.length : 0, thresholdAlerts: alerts };
}

/** نطاق الفصل الدراسي الذي يقع فيه التاريخ (أو العام الدراسي) */
async function termRange(db: TenantDb, iso: string) {
  const d = dateOnly(iso);
  const term = await db.term.findFirst({ where: { deletedAt: null, startDate: { lte: d }, endDate: { gte: d } } });
  if (term) return { start: term.startDate, end: term.endDate, name: term.name };
  const year = await currentYear(db);
  return year ? { start: year.startDate, end: year.endDate, name: year.name } : null;
}

/** عند بلوغ حد الغياب: سجل سلوك + رسالة لولي الأمر + تنبيه المرشد والوكيل (مرة واحدة لكل فصل دراسي) */
async function checkAbsenceThreshold(db: TenantDb, session: SessionData, studentIds: string[], iso: string, branchId: string) {
  if (!studentIds.length) return 0;
  const range = await termRange(db, iso);
  if (!range) return 0;
  const { absenceThreshold } = settingsOf(session);
  let alerts = 0;
  for (const studentId of studentIds) {
    const days = await db.attendance.findMany({ where: { studentId, status: "ABSENT", date: { gte: range.start, lte: range.end } }, distinct: ["date"], select: { date: true } });
    if (days.length < absenceThreshold) continue;
    const already = await db.behaviorRecord.findFirst({ where: { studentId, source: "ATTENDANCE_THRESHOLD", occurredAt: { gte: range.start, lte: new Date(range.end.getTime() + 86_400_000) }, deletedAt: null } });
    if (already) continue;
    const student = await db.student.findFirstOrThrow({ where: { id: studentId }, select: { fullName: true } });
    await db.behaviorRecord.create({
      data: {
        tenantId: session.tenant.id,
        branchId,
        number: await nextNumber(db, session.tenant.id, "behavior"),
        studentId,
        kind: "NEGATIVE",
        category: "absence",
        points: -3,
        severity: days.length >= absenceThreshold * 2 ? "HIGH" : "MEDIUM",
        occurredAt: new Date(),
        description: `تجاوز حد الغياب: ${days.length} أيام في ${range.name}`,
        actionTaken: "إشعار ولي الأمر وإحالة للمرشد الطلابي",
        guardianNotified: true,
        source: "ATTENDANCE_THRESHOLD",
        reportedById: session.user.id,
        createdById: session.user.id,
      },
    });
    await messageGuardians(db, session, studentId, "absence_threshold", { student: student.fullName, count: days.length });
    const staff = await db.userRole.findMany({ where: { role: { key: { in: ["COUNSELOR", "VP_STUDENTS"] } }, OR: [{ branchId }, { branchId: null }] }, select: { userId: true } });
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: staff.map((s) => s.userId),
      type: "SYSTEM",
      title: `تجاوز حد الغياب: ${student.fullName} (${days.length} أيام)`,
      link: `/students/${studentId}?tab=attendance`,
      actorId: session.user.id,
      entityType: "Student",
      entityId: studentId,
    });
    alerts += 1;
  }
  return alerts;
}

/** لوحة «غياب اليوم»: الغائبون والمتأخرون والمستأذنون ضمن نطاق المستخدم */
export async function dayBoard(db: TenantDb, session: SessionData, iso: string) {
  const where = await requireStudentWhere(db, session, "attendance", "view");
  const rows = await db.attendance.findMany({
    where: { date: dateOnly(iso), status: { not: "PRESENT" }, student: where },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          photoUrl: true,
          criticalHealth: true,
          grade: { select: { name: true } },
          section: { select: { name: true } },
          guardians: { where: { isPrimary: true }, select: { guardian: { select: { name: true, phone: true } } }, take: 1 },
        },
      },
    },
    orderBy: [{ period: "asc" }, { createdAt: "asc" }],
  });
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(`${r.studentId}:${r.status}`) ? false : (seen.add(`${r.studentId}:${r.status}`), true)));
  return unique.map((r) => ({
    id: r.id,
    status: r.status as AttendanceStatusKey,
    period: r.period,
    reason: r.reason,
    minutesLate: r.minutesLate,
    source: r.source,
    student: { id: r.student.id, fullName: r.student.fullName, photoUrl: r.student.photoUrl, criticalHealth: r.student.criticalHealth, section: `${r.student.grade.name}${r.student.section ? ` / ${r.student.section.name}` : ""}` },
    guardian: r.student.guardians[0]?.guardian ?? null,
  }));
}

/** ملخص حضور الطالب (لملفه): عدّ حسب الحالة، ونسبة الحضور، وتقويم الشهر */
export async function studentAttendance(db: TenantDb, session: SessionData, studentId: string, month?: string) {
  const where = await requireStudentWhere(db, session, "attendance", "view");
  const student = await db.student.findFirst({ where: { ...where, id: studentId }, select: { id: true, branchId: true } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  const year = await currentYear(db);
  const [counts, recent] = await Promise.all([
    db.attendance.groupBy({ by: ["status"], where: { studentId, period: 0, ...(year ? { date: { gte: year.startDate, lte: year.endDate } } : {}) }, _count: { _all: true } }),
    db.attendance.findMany({ where: { studentId, status: { not: "PRESENT" } }, orderBy: { date: "desc" }, take: 20, select: { id: true, date: true, status: true, reason: true, period: true, source: true } }),
  ]);
  const m = month ?? toISODate(new Date(), session.tenant.timezone).slice(0, 7);
  const monthStart = dateOnly(`${m}-01`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const days = await db.attendance.findMany({ where: { studentId, period: 0, date: { gte: monthStart, lte: monthEnd } }, select: { date: true, status: true } });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<AttendanceStatusKey, number>>;
  const total = Object.values(byStatus).reduce((a, n) => a + (n ?? 0), 0);
  return {
    byStatus,
    total,
    presentRate: total ? ((byStatus.PRESENT ?? 0) + (byStatus.LATE ?? 0)) / total : null,
    month: m,
    days: days.map((d) => ({ date: isoOf(d.date), status: d.status as AttendanceStatusKey })),
    recent: recent.map((r) => ({ ...r, date: isoOf(r.date), status: r.status as AttendanceStatusKey })),
  };
}

/** الشهر لفصل: مصفوفة الطلاب × الأيام */
export async function sectionMonth(db: TenantDb, session: SessionData, sectionId: string, month: string) {
  const section = await db.section.findFirst({ where: { id: sectionId, deletedAt: null }, include: { grade: { select: { name: true, stageId: true } } } });
  if (!section) throw notFound();
  if (!(await canAccessSection(db, session, section, "view"))) throw forbidden();
  const start = dateOnly(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [students, records, bell] = await Promise.all([
    db.student.findMany({ where: { sectionId, status: "ACTIVE", deletedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.attendance.findMany({ where: { sectionId, period: 0, date: { gte: start, lte: end } }, select: { studentId: true, date: true, status: true } }),
    db.bellSchedule.findFirst({ where: { branchId: section.branchId } }),
  ]);
  const days: string[] = [];
  const schoolDays = bell?.days?.length ? bell.days : DEFAULT_SCHOOL_DAYS;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) if (schoolDays.includes(d.getUTCDay())) days.push(isoOf(d));
  const grid: Record<string, Record<string, AttendanceStatusKey>> = {};
  for (const r of records) (grid[r.studentId] ??= {})[isoOf(r.date)] = r.status as AttendanceStatusKey;
  return { section: { id: section.id, label: `${section.grade.name} / ${section.name}` }, month, days, students: students.map((s) => ({ ...s, days: grid[s.id] ?? {} })) };
}

/** تقارير الحضور لفترة */
export async function attendanceReport(db: TenantDb, session: SessionData, input: { from: string; to: string }) {
  const where = await requireStudentWhere(db, session, "attendance", "view");
  const range = { gte: dateOnly(input.from), lte: dateOnly(input.to) };
  const [byDay, bySection, topAbsent] = await Promise.all([
    db.attendance.groupBy({ by: ["date", "status"], where: { date: range, period: 0, student: where }, _count: { _all: true }, orderBy: { date: "asc" } }),
    db.attendance.groupBy({ by: ["sectionId", "status"], where: { date: range, period: 0, student: where }, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["studentId"], where: { date: range, period: 0, status: "ABSENT", student: where }, _count: { _all: true }, orderBy: { _count: { studentId: "desc" } }, take: 10 }),
  ]);
  const days = new Map<string, { total: number; absent: number; late: number }>();
  for (const r of byDay) {
    const k = isoOf(r.date);
    const d = days.get(k) ?? { total: 0, absent: 0, late: 0 };
    d.total += r._count._all;
    if (r.status === "ABSENT") d.absent += r._count._all;
    if (r.status === "LATE") d.late += r._count._all;
    days.set(k, d);
  }
  const sectionIds = [...new Set(bySection.map((s) => s.sectionId))];
  const sections = await db.section.findMany({ where: { id: { in: sectionIds } }, include: { grade: { select: { name: true, order: true, stage: { select: { order: true } } } } } });
  const sectionStats = sections
    .map((s) => {
      const rows = bySection.filter((r) => r.sectionId === s.id);
      const total = rows.reduce((a, r) => a + r._count._all, 0);
      const absent = rows.filter((r) => r.status === "ABSENT").reduce((a, r) => a + r._count._all, 0);
      return { id: s.id, label: `${s.grade.name} / ${s.name}`, order: s.grade.stage.order * 100 + s.grade.order, total, absent, rate: total ? absent / total : 0 };
    })
    .sort((a, b) => b.rate - a.rate);
  const students = await db.student.findMany({ where: { id: { in: topAbsent.map((t) => t.studentId) } }, select: { id: true, fullName: true, grade: { select: { name: true } }, section: { select: { name: true } } } });
  const totalAll = [...days.values()].reduce((a, d) => a + d.total, 0);
  const absentAll = [...days.values()].reduce((a, d) => a + d.absent, 0);
  const lateAll = [...days.values()].reduce((a, d) => a + d.late, 0);
  return {
    totals: { records: totalAll, absent: absentAll, late: lateAll, absenceRate: totalAll ? absentAll / totalAll : null, days: days.size },
    daily: [...days.entries()].map(([date, d]) => ({ date, rate: d.total ? d.absent / d.total : 0, absent: d.absent, total: d.total })),
    bySection: sectionStats,
    topAbsent: topAbsent.map((t) => {
      const s = students.find((x) => x.id === t.studentId);
      return { id: t.studentId, name: s?.fullName ?? "", section: s ? `${s.grade.name}${s.section ? ` / ${s.section.name}` : ""}` : "", absent: t._count._all };
    }),
  };
}
