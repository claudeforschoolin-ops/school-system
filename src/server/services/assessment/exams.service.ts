/**
 * الاختبارات: دورات الاختبار (يومي/شهري/منتصف/نهائي) وجدول جلساتها، اللجان والقاعات والمراقبون،
 * أرقام الجلوس بتوزيع متداخل للصفوف، محاضر المراقبة (الغياب والمخالفات)،
 * وتوليد كشوف الرصد من الجلسة مع تعبئة الغياب تلقائياً من المحاضر.
 */
import type { ExamKind } from "@/generated/prisma/client";
import { resolveScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { notify } from "@/server/services/notifications.service";
import { nextNumber } from "@/server/services/sequence.service";
import { assertComponent, requireTerm, schemeFor } from "./common";

export const EXAM_KIND: Record<ExamKind, string> = { DAILY: "يومي/قصير", MONTHLY: "شهري", MIDTERM: "منتصف الفصل", FINAL: "نهائي" };
const DEFAULT_COMPONENT: Record<ExamKind, string> = { DAILY: "quizzes", MONTHLY: "quizzes", MIDTERM: "midterm", FINAL: "final" };

/** أيام الدراسة: الأحد–الخميس */
const WEEKEND = new Set([5, 6]);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

function examScope(session: SessionData, action: Action) {
  const s = resolveScope(session.access, "exams", action);
  if (!s) return null;
  if (s.kind === "all") return { all: true, branchIds: [] as string[], assigned: false };
  return { all: false, branchIds: s.branchIds, assigned: s.assigned || s.own };
}

function requireManage(session: SessionData, action: Action = "update") {
  const s = examScope(session, action);
  if (!s || (!s.all && !s.branchIds.length)) throw forbidden("إدارة الاختبارات لوكيل الشؤون الأكاديمية أو المدير");
  return s;
}

function examWhere(session: SessionData) {
  const s = examScope(session, "view");
  if (!s) throw forbidden("ليس لديك صلاحية على الاختبارات");
  // المعلم (نطاق المسند) يرى جداول الاختبارات كلها للاطلاع، واللجان المسندة إليه فقط
  if (s.all || s.assigned) return {};
  return { OR: [{ branchId: null }, { branchId: { in: s.branchIds } }] };
}

async function loadExam(db: TenantDb, session: SessionData, id: string) {
  const exam = await db.exam.findFirst({ where: { id, deletedAt: null, ...examWhere(session) } });
  if (!exam) throw notFound("الاختبار غير موجود أو خارج نطاقك");
  return exam;
}

function assertBranch(scope: { all: boolean; branchIds: string[] }, branchId: string | null) {
  if (scope.all) return;
  if (!branchId || !scope.branchIds.includes(branchId)) throw forbidden("الاختبار خارج فرعك");
}

export async function listExams(db: TenantDb, session: SessionData, input: { termId?: string | null }) {
  const exams = await db.exam.findMany({ where: { deletedAt: null, ...(input.termId ? { termId: input.termId } : {}), ...examWhere(session) }, orderBy: [{ startDate: "desc" }], include: { _count: { select: { sessions: true, committees: true, seats: true } } } });
  const [terms, grades, branches] = await Promise.all([
    db.term.findMany({ where: { id: { in: [...new Set(exams.map((e) => e.termId))] } }, select: { id: true, name: true } }),
    db.grade.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const today = iso(new Date());
  return exams.map((e) => ({
    ...e,
    term: terms.find((t) => t.id === e.termId)?.name ?? "",
    branch: e.branchId ? (branches.find((b) => b.id === e.branchId)?.name ?? "") : "كل الفروع",
    grades: e.gradeIds.map((g) => grades.find((x) => x.id === g)?.name ?? "").filter(Boolean),
    phase: iso(e.endDate) < today ? "DONE" : iso(e.startDate) <= today ? "RUNNING" : "UPCOMING",
  }));
}

export interface ExamInput {
  termId: string;
  title: string;
  kind: ExamKind;
  componentKey?: string | null;
  gradeIds: string[];
  branchId?: string | null;
  startDate: string;
  endDate: string;
  instructions?: string | null;
}

async function validateExamInput(db: TenantDb, session: SessionData, input: ExamInput) {
  const term = await requireTerm(db, input.termId);
  if (!input.title.trim()) throw badRequest("عنوان الاختبار مطلوب");
  if (!input.gradeIds.length) throw badRequest("اختر صفاً واحداً على الأقل");
  if (input.endDate < input.startDate) throw badRequest("نهاية الاختبارات قبل بدايتها");
  if (day(input.startDate) < term.startDate || day(input.endDate) > term.endDate) throw badRequest("فترة الاختبار خارج الفصل الدراسي");
  const grades = await db.grade.findMany({ where: { id: { in: input.gradeIds }, deletedAt: null }, select: { id: true, stageId: true } });
  if (grades.length !== input.gradeIds.length) throw badRequest("صف غير موجود");
  const componentKey = input.componentKey || DEFAULT_COMPONENT[input.kind];
  for (const stageId of new Set(grades.map((g) => g.stageId))) assertComponent(await schemeFor(db, session.tenant.id, stageId), componentKey);
  return { term, componentKey };
}

export async function createExam(db: TenantDb, session: SessionData, input: ExamInput) {
  const scope = requireManage(session, "create");
  assertBranch(scope, input.branchId ?? null);
  const { term, componentKey } = await validateExamInput(db, session, input);
  return db.exam.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "exam"),
      academicYearId: term.academicYearId,
      termId: term.id,
      branchId: input.branchId ?? null,
      title: input.title.trim(),
      kind: input.kind,
      componentKey,
      gradeIds: input.gradeIds,
      startDate: day(input.startDate),
      endDate: day(input.endDate),
      instructions: input.instructions ?? null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
}

export async function updateExam(db: TenantDb, session: SessionData, id: string, input: ExamInput) {
  const scope = requireManage(session);
  const exam = await loadExam(db, session, id);
  assertBranch(scope, exam.branchId);
  assertBranch(scope, input.branchId ?? null);
  const { componentKey } = await validateExamInput(db, session, input);
  const sheets = await db.assessment.count({ where: { examSessionId: { in: (await db.examSession.findMany({ where: { examId: id }, select: { id: true } })).map((s) => s.id) } } });
  if (sheets && (componentKey !== exam.componentKey || input.termId !== exam.termId)) throw badRequest("أُنشئت كشوف رصد من هذا الاختبار؛ لا يُغيَّر الفصل أو المكوّن");
  return db.exam.update({ where: { id }, data: { title: input.title.trim(), kind: input.kind, componentKey, gradeIds: input.gradeIds, branchId: input.branchId ?? null, startDate: day(input.startDate), endDate: day(input.endDate), instructions: input.instructions ?? null, updatedById: session.user.id } });
}

export async function deleteExam(db: TenantDb, session: SessionData, id: string) {
  const scope = requireManage(session, "delete");
  const exam = await loadExam(db, session, id);
  assertBranch(scope, exam.branchId);
  const sessions = await db.examSession.findMany({ where: { examId: id }, select: { id: true } });
  if (await db.assessment.count({ where: { examSessionId: { in: sessions.map((s) => s.id) } } })) throw badRequest("أُنشئت كشوف رصد من هذا الاختبار؛ لا يُحذف");
  await db.exam.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  return { ok: true };
}

/** تفاصيل الاختبار: الجدول واللجان والمحاضر وكشوف الرصد المتولدة */
export async function getExam(db: TenantDb, session: SessionData, id: string) {
  const exam = await loadExam(db, session, id);
  const scope = examScope(session, "view")!;
  const manage = examScope(session, "update");
  const canManage = Boolean(manage && (manage.all || (exam.branchId && manage.branchIds.includes(exam.branchId))));
  const [sessions, committees, grades, term, subjects] = await Promise.all([
    db.examSession.findMany({ where: { examId: id }, orderBy: [{ date: "asc" }, { startTime: "asc" }], include: { reports: { select: { committeeId: true, absentStudentIds: true } } } }),
    db.examCommittee.findMany({ where: { examId: id }, orderBy: { number: "asc" }, include: { seats: { select: { studentId: true, seatNumber: true } } } }),
    db.grade.findMany({ where: { id: { in: exam.gradeIds } }, include: { stage: { select: { order: true } } } }),
    db.term.findFirst({ where: { id: exam.termId }, select: { id: true, name: true } }),
    db.subject.findMany({ where: { deletedAt: null }, select: { id: true, name: true, color: true } }),
  ]);
  const visibleCommittees = scope.all || scope.branchIds.length || canManage ? committees : committees.filter((c) => c.invigilatorIds.includes(session.user.id));
  const [rooms, users, branches, sheets, seatedStudents] = await Promise.all([
    db.room.findMany({ where: { id: { in: committees.map((c) => c.roomId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, code: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(committees.flatMap((c) => c.invigilatorIds))] } }, select: { id: true, name: true } }),
    db.branch.findMany({ select: { id: true, name: true } }),
    db.assessment.groupBy({ by: ["examSessionId", "status"], where: { examSessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } }),
    db.student.findMany({ where: { id: { in: committees.flatMap((c) => c.seats.map((s) => s.studentId)) } }, select: { id: true, gradeId: true } }),
  ]);
  const gradeOf = new Map(seatedStudents.map((s) => [s.id, s.gradeId]));
  const orderedGrades = grades.sort((a, b) => a.stage.order - b.stage.order || a.order - b.order);
  const today = iso(new Date());
  return {
    exam: { ...exam, kindLabel: EXAM_KIND[exam.kind], term: term?.name ?? "", branch: exam.branchId ? (branches.find((b) => b.id === exam.branchId)?.name ?? "") : "كل الفروع", phase: iso(exam.endDate) < today ? "DONE" : iso(exam.startDate) <= today ? "RUNNING" : "UPCOMING" },
    canManage,
    grades: orderedGrades.map((g) => ({ id: g.id, name: g.name })),
    sessions: sessions.map((s) => {
      const bySheet = sheets.filter((x) => x.examSessionId === s.id);
      return {
        id: s.id,
        gradeId: s.gradeId,
        grade: grades.find((g) => g.id === s.gradeId)?.name ?? "",
        subjectId: s.subjectId,
        subject: subjects.find((x) => x.id === s.subjectId)?.name ?? "",
        color: subjects.find((x) => x.id === s.subjectId)?.color ?? "navy",
        date: s.date,
        startTime: s.startTime,
        durationMin: s.durationMin,
        maxTenths: s.maxTenths,
        reports: s.reports.length,
        absent: s.reports.reduce((n, r) => n + r.absentStudentIds.length, 0),
        sheets: bySheet.reduce((n, x) => n + x._count._all, 0),
        sheetsApproved: bySheet.filter((x) => x.status === "APPROVED").reduce((n, x) => n + x._count._all, 0),
      };
    }),
    committees: visibleCommittees.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      branch: branches.find((b) => b.id === c.branchId)?.name ?? "",
      roomId: c.roomId,
      room: rooms.find((r) => r.id === c.roomId)?.name ?? null,
      capacity: c.capacity,
      invigilatorIds: c.invigilatorIds,
      invigilators: c.invigilatorIds.map((u) => users.find((x) => x.id === u)?.name ?? "").filter(Boolean),
      seats: c.seats.length,
      seatRange: c.seats.length ? [Math.min(...c.seats.map((s) => s.seatNumber)), Math.max(...c.seats.map((s) => s.seatNumber))] : null,
      byGrade: orderedGrades.map((g) => ({ grade: g.name, count: c.seats.filter((s) => gradeOf.get(s.studentId) === g.id).length })).filter((x) => x.count),
      mine: c.invigilatorIds.includes(session.user.id),
    })),
    totals: { committees: committees.length, seats: committees.reduce((n, c) => n + c.seats.length, 0), sessions: sessions.length },
  };
}

// ---------------------------------------------------------------------
// الجدول
// ---------------------------------------------------------------------

export async function upsertSession(db: TenantDb, session: SessionData, input: { examId: string; id?: string | null; gradeId: string; subjectId: string; date: string; startTime: string; durationMin: number; maxTenths: number }) {
  const scope = requireManage(session);
  const exam = await loadExam(db, session, input.examId);
  assertBranch(scope, exam.branchId);
  if (!exam.gradeIds.includes(input.gradeId)) throw badRequest("الصف ليس ضمن هذا الاختبار");
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) throw badRequest("وقت البداية بصيغة HH:MM");
  if (input.date < iso(exam.startDate) || input.date > iso(exam.endDate)) throw badRequest("التاريخ خارج فترة الاختبار");
  if (input.durationMin < 10 || input.durationMin > 300) throw badRequest("مدة الجلسة بين ١٠ و٣٠٠ دقيقة");
  if (input.maxTenths <= 0 || input.maxTenths > 10000) throw badRequest("الدرجة العظمى غير صالحة");
  if (!(await db.gradeSubject.findFirst({ where: { gradeId: input.gradeId, subjectId: input.subjectId } }))) throw badRequest("المادة ليست في خطة هذا الصف");
  const data = { gradeId: input.gradeId, subjectId: input.subjectId, date: day(input.date), startTime: input.startTime, durationMin: input.durationMin, maxTenths: input.maxTenths };
  if (input.id) {
    const current = await db.examSession.findFirst({ where: { id: input.id, examId: exam.id } });
    if (!current) throw notFound("الجلسة غير موجودة");
    if ((await db.assessment.count({ where: { examSessionId: current.id } })) && (current.maxTenths !== input.maxTenths || current.subjectId !== input.subjectId || current.gradeId !== input.gradeId)) throw badRequest("أُنشئت كشوف رصد من الجلسة؛ لا تُغيَّر المادة أو الدرجة العظمى");
    return db.examSession.update({ where: { id: current.id }, data });
  }
  if (await db.examSession.findFirst({ where: { examId: exam.id, gradeId: input.gradeId, subjectId: input.subjectId } })) throw badRequest("المادة مجدولة لهذا الصف مسبقاً");
  const created = await db.examSession.create({ data: { tenantId: session.tenant.id, examId: exam.id, ...data } });
  if (exam.status === "PLANNED") await db.exam.update({ where: { id: exam.id }, data: { status: "SCHEDULED" } });
  return created;
}

export async function deleteSession(db: TenantDb, session: SessionData, id: string) {
  const scope = requireManage(session);
  const s = await db.examSession.findFirst({ where: { id }, include: { exam: true } });
  if (!s) throw notFound("الجلسة غير موجودة");
  assertBranch(scope, s.exam.branchId);
  if (await db.assessment.count({ where: { examSessionId: id } })) throw badRequest("أُنشئت كشوف رصد من الجلسة؛ لا تُحذف");
  await db.examSession.delete({ where: { id } });
  return { ok: true };
}

/** أيام الاختبار (دون عطلة نهاية الأسبوع) */
export function examDays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let d = day(startIso); iso(d) <= endIso; d = new Date(d.getTime() + 86_400_000)) if (!WEEKEND.has(d.getUTCDay())) out.push(iso(d));
  return out;
}

const addMinutes = (hhmm: string, min: number) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * جدولة تلقائية: لكل صف مواده من الخطة (الثقيلة أولاً) موزعة على أيام الاختبار،
 * جلسة يومياً، وجلستان إن زادت المواد عن الأيام. الدرجة العظمى الافتراضية = وزن المكوّن.
 */
export async function autoSchedule(db: TenantDb, session: SessionData, input: { examId: string; startTime: string; durationMin: number; maxTenths?: number | null; excludeSubjectIds?: string[] }) {
  const scope = requireManage(session);
  const exam = await loadExam(db, session, input.examId);
  assertBranch(scope, exam.branchId);
  const existing = await db.examSession.findMany({ where: { examId: exam.id }, select: { id: true } });
  if (await db.assessment.count({ where: { examSessionId: { in: existing.map((s) => s.id) } } })) throw badRequest("أُنشئت كشوف رصد من الجدول الحالي؛ لا يُعاد توليده");
  const days = examDays(iso(exam.startDate), iso(exam.endDate));
  if (!days.length) throw badRequest("لا أيام دراسية في فترة الاختبار");
  const grades = await db.grade.findMany({ where: { id: { in: exam.gradeIds } }, select: { id: true, stageId: true } });
  const plan = await db.gradeSubject.findMany({ where: { gradeId: { in: exam.gradeIds }, ...(input.excludeSubjectIds?.length ? { subjectId: { notIn: input.excludeSubjectIds } } : {}) }, orderBy: [{ heavy: "desc" }, { weeklyPeriods: "desc" }] });
  const rows: Array<{ gradeId: string; subjectId: string; date: string; startTime: string; maxTenths: number }> = [];
  for (const g of grades) {
    const scheme = await schemeFor(db, session.tenant.id, g.stageId);
    const weight = scheme.components.find((c) => c.key === exam.componentKey)?.weight ?? 20;
    const subjects = plan.filter((p) => p.gradeId === g.id);
    const perDay = Math.ceil(subjects.length / days.length);
    if (perDay > 2) throw badRequest("مواد الصف أكثر من ضعف أيام الاختبار؛ مدّد الفترة");
    subjects.forEach((p, i) => {
      const dayIdx = perDay === 1 ? i : Math.floor(i / 2);
      const slot = perDay === 1 ? 0 : i % 2;
      rows.push({ gradeId: g.id, subjectId: p.subjectId, date: days[Math.min(dayIdx, days.length - 1)]!, startTime: slot ? addMinutes(input.startTime, input.durationMin + 30) : input.startTime, maxTenths: input.maxTenths ?? weight * 10 });
    });
  }
  await db.$transaction(async (tx) => {
    await tx.examSession.deleteMany({ where: { examId: exam.id } });
    for (const r of rows) await tx.examSession.create({ data: { tenantId: session.tenant.id, examId: exam.id, gradeId: r.gradeId, subjectId: r.subjectId, date: day(r.date), startTime: r.startTime, durationMin: input.durationMin, maxTenths: r.maxTenths } });
    await tx.exam.update({ where: { id: exam.id }, data: { status: "SCHEDULED", updatedById: session.user.id } });
  });
  return { sessions: rows.length, days: new Set(rows.map((r) => r.date)).size };
}

// ---------------------------------------------------------------------
// اللجان وأرقام الجلوس
// ---------------------------------------------------------------------

/** دمج متداخل: طالب من كل صف بالتناوب حتى لا يجلس طالبان من الصف نفسه متجاورين */
export function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < max; i++) for (const g of groups) if (i < g.length) out.push(g[i]!);
  return out;
}

export async function autoCommittees(db: TenantDb, session: SessionData, input: { examId: string; capacity: number; invigilatorsPerCommittee: number; interleaveGrades: boolean; firstSeat?: number | null }) {
  const scope = requireManage(session);
  const exam = await loadExam(db, session, input.examId);
  assertBranch(scope, exam.branchId);
  if (input.capacity < 5 || input.capacity > 60) throw badRequest("سعة اللجنة بين ٥ و٦٠");
  const sessions = await db.examSession.findMany({ where: { examId: exam.id }, select: { id: true } });
  if (await db.invigilationReport.count({ where: { sessionId: { in: sessions.map((s) => s.id) } } })) throw badRequest("رُفعت محاضر مراقبة؛ لا يُعاد توزيع اللجان");
  const grades = await db.grade.findMany({ where: { id: { in: exam.gradeIds } }, include: { stage: { select: { order: true } } } });
  const gradeOrder = new Map(grades.sort((a, b) => a.stage.order - b.stage.order || a.order - b.order).map((g, i) => [g.id, i]));
  const students = await db.student.findMany({ where: { gradeId: { in: exam.gradeIds }, academicYearId: exam.academicYearId, status: "ACTIVE", deletedAt: null, ...(exam.branchId ? { branchId: exam.branchId } : {}) }, select: { id: true, branchId: true, gradeId: true, fullName: true }, orderBy: { fullName: "asc" } });
  if (!students.length) throw badRequest("لا طلاب منتظمون في صفوف الاختبار");
  const branchIds = [...new Set(students.map((s) => s.branchId))];
  const [rooms, teacherRoles] = await Promise.all([
    db.room.findMany({ where: { branchId: { in: branchIds }, isActive: true, deletedAt: null, kind: { in: ["CLASSROOM", "HALL", "EXAM"] } }, orderBy: [{ capacity: "desc" }, { code: "asc" }] }),
    db.userRole.findMany({ where: { role: { key: "TEACHER" }, user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true, branchId: true } }),
  ]);
  type Plan = { branchId: string; number: number; name: string; roomId: string | null; capacity: number; invigilatorIds: string[]; students: typeof students };
  const plans: Plan[] = [];
  let number = 0;
  for (const branchId of branchIds) {
    const pool = students.filter((s) => s.branchId === branchId);
    const byGrade = [...new Set(pool.map((s) => s.gradeId))].sort((a, b) => (gradeOrder.get(a) ?? 0) - (gradeOrder.get(b) ?? 0)).map((g) => pool.filter((s) => s.gradeId === g));
    const ordered = input.interleaveGrades ? interleave(byGrade) : byGrade.flat();
    const branchRooms = rooms.filter((r) => r.branchId === branchId);
    const teachers = [...new Set(teacherRoles.filter((t) => t.branchId === branchId || t.branchId === null).map((t) => t.userId))];
    let cursor = 0;
    let ri = 0;
    while (cursor < ordered.length) {
      const room = branchRooms[ri] ?? null;
      const cap = Math.max(1, room ? Math.min(input.capacity, room.capacity) : input.capacity);
      const chunk = ordered.slice(cursor, cursor + cap);
      number += 1;
      const inv: string[] = [];
      for (let k = 0; k < input.invigilatorsPerCommittee && teachers.length; k++) {
        const t = teachers[((number - 1) * input.invigilatorsPerCommittee + k) % teachers.length]!;
        if (!inv.includes(t)) inv.push(t);
      }
      plans.push({ branchId, number, name: `لجنة ${number}`, roomId: room?.id ?? null, capacity: cap, invigilatorIds: inv, students: chunk });
      cursor += chunk.length;
      ri += 1;
    }
  }
  let seat = input.firstSeat && input.firstSeat > 0 ? input.firstSeat : 1001;
  await db.$transaction(async (tx) => {
    await tx.examCommittee.deleteMany({ where: { examId: exam.id } });
    for (const p of plans) {
      const c = await tx.examCommittee.create({ data: { tenantId: session.tenant.id, examId: exam.id, branchId: p.branchId, number: p.number, name: p.name, roomId: p.roomId, capacity: p.capacity, invigilatorIds: p.invigilatorIds } });
      await tx.examSeat.createMany({ data: p.students.map((s) => ({ tenantId: session.tenant.id, examId: exam.id, committeeId: c.id, studentId: s.id, seatNumber: seat++ })) });
    }
  });
  const invigilators = [...new Set(plans.flatMap((p) => p.invigilatorIds))];
  if (invigilators.length) await notify(db, { tenantId: session.tenant.id, userIds: invigilators, type: "SYSTEM", title: `كُلّفت بالمراقبة في «${exam.title}»`, body: "راجع لجنتك وجدول الجلسات", link: `/assessment/exams/${exam.id}`, actorId: session.user.id, entityType: "Exam", entityId: exam.id });
  return { committees: plans.length, seats: students.length, withoutRoom: plans.filter((p) => !p.roomId).length };
}

export async function updateCommittee(db: TenantDb, session: SessionData, input: { id: string; name: string; roomId: string | null; invigilatorIds: string[] }) {
  const scope = requireManage(session);
  const c = await db.examCommittee.findFirst({ where: { id: input.id }, include: { exam: true } });
  if (!c) throw notFound("اللجنة غير موجودة");
  assertBranch(scope, c.exam.branchId ?? c.branchId);
  if (input.roomId && !(await db.room.findFirst({ where: { id: input.roomId, branchId: c.branchId, deletedAt: null } }))) throw badRequest("القاعة ليست في فرع اللجنة");
  const busy = input.roomId ? await db.examCommittee.findFirst({ where: { examId: c.examId, roomId: input.roomId, id: { not: c.id } } }) : null;
  if (busy) throw badRequest(`القاعة مستخدمة في ${busy.name}`);
  const added = input.invigilatorIds.filter((u) => !c.invigilatorIds.includes(u));
  const updated = await db.examCommittee.update({ where: { id: c.id }, data: { name: input.name.trim() || c.name, roomId: input.roomId, invigilatorIds: [...new Set(input.invigilatorIds)] } });
  if (added.length) await notify(db, { tenantId: session.tenant.id, userIds: added, type: "SYSTEM", title: `كُلّفت بالمراقبة: ${updated.name} — ${c.exam.title}`, body: "", link: `/assessment/exams/${c.examId}`, actorId: session.user.id, entityType: "Exam", entityId: c.examId });
  return updated;
}

/** كشف اللجنة للطباعة: المقاعد مرتبة بأرقام الجلوس مع الجلسات */
export async function committeeSheet(db: TenantDb, session: SessionData, committeeId: string) {
  const c = await db.examCommittee.findFirst({ where: { id: committeeId }, include: { exam: true, seats: { orderBy: { seatNumber: "asc" } } } });
  if (!c) throw notFound("اللجنة غير موجودة");
  await loadExam(db, session, c.examId);
  const scope = examScope(session, "view")!;
  if (!scope.all && !scope.branchIds.includes(c.branchId) && !c.invigilatorIds.includes(session.user.id)) throw forbidden("اللجنة غير مسندة إليك");
  const students = await db.student.findMany({ where: { id: { in: c.seats.map((s) => s.studentId) } }, select: { id: true, fullName: true, academicNumber: true, gradeId: true, section: { select: { name: true } }, grade: { select: { name: true } } } });
  const [sessions, room, users, subjects, reports] = await Promise.all([
    db.examSession.findMany({ where: { examId: c.examId, gradeId: { in: [...new Set(students.map((s) => s.gradeId))] } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    c.roomId ? db.room.findFirst({ where: { id: c.roomId }, select: { name: true, code: true } }) : null,
    db.user.findMany({ where: { id: { in: c.invigilatorIds } }, select: { id: true, name: true } }),
    db.subject.findMany({ select: { id: true, name: true } }),
    db.invigilationReport.findMany({ where: { committeeId: c.id } }),
  ]);
  return {
    exam: { id: c.exam.id, title: c.exam.title, kind: EXAM_KIND[c.exam.kind] },
    committee: { id: c.id, name: c.name, number: c.number, room: room ? `${room.name} (${room.code})` : null, invigilators: users.map((u) => u.name), invigilatorIds: c.invigilatorIds, mine: c.invigilatorIds.includes(session.user.id) },
    seats: c.seats.map((s) => {
      const st = students.find((x) => x.id === s.studentId)!;
      return { seatNumber: s.seatNumber, studentId: s.studentId, name: st.fullName, academicNumber: st.academicNumber, grade: st.grade.name, gradeId: st.gradeId, section: st.section?.name ?? "" };
    }),
    sessions: sessions.map((s) => {
      const r = reports.find((x) => x.sessionId === s.id);
      return { id: s.id, date: s.date, startTime: s.startTime, durationMin: s.durationMin, gradeId: s.gradeId, subject: subjects.find((x) => x.id === s.subjectId)?.name ?? "", report: r ? { absent: r.absentStudentIds, incidents: r.incidents as Array<{ studentId: string; kind: string; note: string }>, notes: r.notes, submittedAt: r.submittedAt } : null };
    }),
  };
}

/** محضر المراقبة: الغياب والمخالفات لجلسة في لجنة (المراقب أو إدارة الاختبارات) */
export async function saveInvigilationReport(db: TenantDb, session: SessionData, input: { sessionId: string; committeeId: string; absentStudentIds: string[]; incidents: Array<{ studentId: string; kind: string; note: string }>; notes?: string | null }) {
  const c = await db.examCommittee.findFirst({ where: { id: input.committeeId }, include: { exam: true, seats: { select: { studentId: true } } } });
  const s = await db.examSession.findFirst({ where: { id: input.sessionId } });
  if (!c || !s || s.examId !== c.examId) throw notFound("الجلسة أو اللجنة غير موجودة");
  const manage = examScope(session, "update");
  const canManage = Boolean(manage && (manage.all || manage.branchIds.includes(c.branchId)));
  if (!canManage && !c.invigilatorIds.includes(session.user.id)) throw forbidden("المحضر لمراقبي اللجنة");
  const seated = new Set(c.seats.map((x) => x.studentId));
  const gradeStudents = new Set((await db.student.findMany({ where: { id: { in: [...seated] }, gradeId: s.gradeId }, select: { id: true } })).map((x) => x.id));
  for (const id of [...input.absentStudentIds, ...input.incidents.map((i) => i.studentId)]) if (!gradeStudents.has(id)) throw badRequest("طالب ليس في هذه اللجنة أو لا يختبر هذه المادة");
  if (await db.assessment.count({ where: { examSessionId: s.id, status: { not: "DRAFT" } } })) throw badRequest("أُرسلت درجات هذه الجلسة؛ لا يُعدَّل المحضر");
  const data = { absentStudentIds: [...new Set(input.absentStudentIds)], incidents: input.incidents, notes: input.notes ?? null, submittedById: session.user.id, submittedAt: new Date() };
  return db.invigilationReport.upsert({ where: { sessionId_committeeId: { sessionId: s.id, committeeId: c.id } }, create: { tenantId: session.tenant.id, sessionId: s.id, committeeId: c.id, ...data }, update: data });
}

/** لجاني: جلسات المراقبة القادمة للمستخدم */
export async function myInvigilation(db: TenantDb, session: SessionData) {
  const committees = await db.examCommittee.findMany({ where: { invigilatorIds: { has: session.user.id }, exam: { deletedAt: null } }, include: { exam: { select: { id: true, title: true, endDate: true, gradeIds: true } }, _count: { select: { seats: true } } } });
  const today = day(iso(new Date()));
  return committees.filter((c) => c.exam.endDate >= today).map((c) => ({ id: c.id, name: c.name, seats: c._count.seats, exam: { id: c.exam.id, title: c.exam.title } }));
}

/**
 * توليد كشوف الرصد من جلسة: بند للمكوّن في كل فصل من الصف (بمعلم المادة)،
 * مع تعبئة «غائب» لمن سُجّل غيابه في محاضر المراقبة.
 */
export async function createSheetsFromSession(db: TenantDb, session: SessionData, sessionId: string) {
  const s = await db.examSession.findFirst({ where: { id: sessionId }, include: { exam: true } });
  if (!s || s.exam.deletedAt) throw notFound("الجلسة غير موجودة");
  const scope = requireManage(session);
  assertBranch(scope, s.exam.branchId);
  const sections = await db.section.findMany({ where: { gradeId: s.gradeId, academicYearId: s.exam.academicYearId, deletedAt: null, ...(s.exam.branchId ? { branchId: s.exam.branchId } : scope.all ? {} : { branchId: { in: scope.branchIds } }) } });
  const [existing, reports, assignments] = await Promise.all([
    db.assessment.findMany({ where: { examSessionId: s.id }, select: { sectionId: true } }),
    db.invigilationReport.findMany({ where: { sessionId: s.id } }),
    db.teacherAssignment.findMany({ where: { sectionId: { in: sections.map((x) => x.id) }, subjectId: s.subjectId } }),
  ]);
  const absent = new Set(reports.flatMap((r) => r.absentStudentIds));
  let created = 0;
  let absences = 0;
  for (const sec of sections) {
    if (existing.some((e) => e.sectionId === sec.id)) continue;
    const teacherId = assignments.find((a) => a.sectionId === sec.id)?.teacherId ?? null;
    const a = await db.assessment.create({ data: { tenantId: session.tenant.id, termId: s.exam.termId, sectionId: sec.id, subjectId: s.subjectId, teacherId, componentKey: s.exam.componentKey, title: s.exam.title, maxTenths: s.maxTenths, date: s.date, examSessionId: s.id, createdById: session.user.id, updatedById: session.user.id } });
    const secStudents = await db.student.findMany({ where: { sectionId: sec.id, status: "ACTIVE", deletedAt: null, id: { in: [...absent] } }, select: { id: true } });
    if (secStudents.length) await db.mark.createMany({ data: secStudents.map((st) => ({ tenantId: session.tenant.id, assessmentId: a.id, studentId: st.id, absent: true, note: "غائب حسب محضر اللجنة", updatedById: session.user.id })) });
    absences += secStudents.length;
    created += 1;
    if (teacherId) await notify(db, { tenantId: session.tenant.id, userIds: [teacherId], type: "SYSTEM", title: `كشف رصد جديد: ${s.exam.title}`, body: `${sec.name} — ارصد الدرجات وأرسلها للاعتماد`, link: `/assessment/grades/${sec.id}/${s.subjectId}?term=${s.exam.termId}`, actorId: session.user.id, entityType: "Assessment", entityId: a.id });
  }
  if (created && s.exam.status !== "GRADING") await db.exam.update({ where: { id: s.exam.id }, data: { status: "GRADING" } });
  return { created, absences, skipped: existing.length };
}

/** خيارات النماذج: الصفوف ومواد خططها، القاعات، المعلمون */
export async function examOptions(db: TenantDb) {
  const [grades, plan, subjects, rooms, teachers, branches] = await Promise.all([
    db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { order: true, name: true } } } }),
    db.gradeSubject.findMany({ select: { gradeId: true, subjectId: true } }),
    db.subject.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.room.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, code: true, branchId: true, capacity: true }, orderBy: { code: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: ["TEACHER", "VP_ACADEMIC", "VP_STUDENTS", "COUNSELOR"] } } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return {
    grades: grades.sort((a, b) => a.stage.order - b.stage.order || a.order - b.order).map((g) => ({ id: g.id, name: g.name, stage: g.stage.name, subjects: plan.filter((p) => p.gradeId === g.id).map((p) => ({ id: p.subjectId, name: subjects.find((s) => s.id === p.subjectId)?.name ?? "" })) })),
    rooms,
    teachers,
    branches,
    kinds: Object.entries(EXAM_KIND).map(([value, label]) => ({ value, label })),
  };
}
