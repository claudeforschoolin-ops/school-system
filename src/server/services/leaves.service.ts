/**
 * إجازات الطلاب واستئذانهم: يسجلها الموظف بطلب ولي الأمر (سبب + مرفق طبي)، يعتمدها الوكيل،
 * فتنعكس تلقائياً على الحضور (غائب بعذر أو مستأذن) وتُزال إن أُلغي الاعتماد.
 */
import type { Prisma } from "@/generated/prisma/client";
import { LEAVE_KIND } from "@/lib/students";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { DEFAULT_SCHOOL_DAYS, dateOnly } from "./attendance.service";
import { messageGuardians } from "./guardian-messages";
import { nextNumber } from "./sequence.service";
import { notify } from "./notifications.service";
import { requireStudentWhere } from "./student-scope";

export interface LeaveInput {
  studentId: string;
  kind: "LEAVE" | "EARLY_DISMISSAL";
  startDate: string;
  endDate: string;
  reason: string;
  requestedBy?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; size?: number; mime?: string }>;
}

export async function createLeave(db: TenantDb, session: SessionData, input: LeaveInput) {
  const where = await requireStudentWhere(db, session, "transfers", "create", "لا تملك صلاحية تسجيل الإجازات");
  const student = await db.student.findFirst({ where: { ...where, id: input.studentId, deletedAt: null } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  if (input.endDate < input.startDate) throw badRequest("تاريخ النهاية قبل البداية");
  if (input.kind === "EARLY_DISMISSAL" && input.endDate !== input.startDate) throw badRequest("الاستئذان ليوم واحد");
  const days = (dateOnly(input.endDate).getTime() - dateOnly(input.startDate).getTime()) / 86_400_000 + 1;
  if (days > 60) throw badRequest("الإجازة تتجاوز ٦٠ يوماً؛ استخدم «التحويلات» (انسحاب/تأجيل)");
  const ids = (input.attachments ?? []).map((a) => a.id);
  const files = ids.length ? await db.fileObject.findMany({ where: { id: { in: ids } } }) : [];
  const leave = await db.studentLeave.create({
    data: {
      tenantId: session.tenant.id,
      branchId: student.branchId,
      number: await nextNumber(db, session.tenant.id, "leave"),
      studentId: student.id,
      kind: input.kind,
      startDate: dateOnly(input.startDate),
      endDate: dateOnly(input.endDate),
      reason: input.reason.trim(),
      requestedBy: input.requestedBy?.trim() || null,
      attachments: files.map((f) => ({ id: f.id, name: f.name, url: `/api/files/${f.id}`, size: f.size, mime: f.mime })) as Prisma.InputJsonValue,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  const approvers = await db.userRole.findMany({ where: { role: { key: { in: ["VP_STUDENTS"] } }, OR: [{ branchId: student.branchId }, { branchId: null }] }, select: { userId: true } });
  await notify(db, { tenantId: session.tenant.id, userIds: approvers.map((a) => a.userId), type: "APPROVAL", title: `طلب ${LEAVE_KIND[input.kind].label} لـ${student.fullName} بانتظار اعتمادك`, link: `/leaves/${leave.id}`, actorId: session.user.id, entityType: "StudentLeave", entityId: leave.id });
  return leave;
}

async function scopedLeave(db: TenantDb, session: SessionData, id: string, action: "view" | "update" | "approve") {
  const where = await requireStudentWhere(db, session, "transfers", action, action === "approve" ? "اعتماد الإجازات من صلاحية الوكيل" : undefined);
  const leave = await db.studentLeave.findFirst({ where: { id, deletedAt: null, student: where }, include: { student: { select: { id: true, fullName: true, branchId: true, sectionId: true } } } });
  if (!leave) throw notFound("الطلب غير موجود أو خارج نطاق صلاحيتك");
  return leave;
}

/** أيام الدراسة ضمن فترة الإجازة */
async function schoolDaysBetween(db: TenantDb, branchId: string, start: Date, end: Date) {
  const bell = await db.bellSchedule.findFirst({ where: { branchId } });
  const days = bell?.days?.length ? bell.days : DEFAULT_SCHOOL_DAYS;
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) if (days.includes(d.getUTCDay())) out.push(d);
  return out;
}

export async function decideLeave(db: TenantDb, session: SessionData, id: string, decision: "APPROVED" | "REJECTED", note?: string | null) {
  const leave = await scopedLeave(db, session, id, "approve");
  if (leave.createdById === session.user.id && decision === "APPROVED" && !resolveScope(session.access, "transfers", "approve")) throw forbidden();
  if (leave.status === decision) return leave;
  if (leave.status === "CANCELLED") throw badRequest("الطلب ملغى");
  const updated = await db.studentLeave.update({ where: { id }, data: { status: decision, decidedById: session.user.id, decidedAt: new Date(), decisionNote: note ?? null, updatedById: session.user.id } });
  if (decision === "APPROVED") await applyToAttendance(db, session, leave);
  else await removeFromAttendance(db, leave.id);
  const dateText = leave.startDate.getTime() === leave.endDate.getTime() ? leave.startDate.toISOString().slice(0, 10) : `${leave.startDate.toISOString().slice(0, 10)} — ${leave.endDate.toISOString().slice(0, 10)}`;
  await messageGuardians(db, session, leave.studentId, "leave_decision", { student: leave.student.fullName, kind: LEAVE_KIND[leave.kind as keyof typeof LEAVE_KIND].label, date: dateText, decision: decision === "APPROVED" ? "تمت الموافقة" : "لم تتم الموافقة" });
  return updated;
}

export async function cancelLeave(db: TenantDb, session: SessionData, id: string) {
  const leave = await scopedLeave(db, session, id, "update");
  await db.studentLeave.update({ where: { id }, data: { status: "CANCELLED", updatedById: session.user.id } });
  await removeFromAttendance(db, leave.id);
  return { ok: true };
}

/** يسجّل «غائب بعذر» (إجازة) أو «مستأذن» (استئذان) لأيام الإجازة، دون المساس بتحضير يدوي أخذ «حاضر» */
async function applyToAttendance(db: TenantDb, session: SessionData, leave: { id: string; kind: string; studentId: string; startDate: Date; endDate: Date; reason: string; student: { branchId: string; sectionId: string | null } }) {
  if (!leave.student.sectionId) return;
  const status = leave.kind === "EARLY_DISMISSAL" ? "PERMISSION" : "EXCUSED";
  for (const date of await schoolDaysBetween(db, leave.student.branchId, leave.startDate, leave.endDate)) {
    const existing = await db.attendance.findFirst({ where: { studentId: leave.studentId, date, period: 0 } });
    if (existing && existing.status === "PRESENT" && leave.kind === "LEAVE") continue;
    if (existing) {
      await db.attendance.update({ where: { id: existing.id }, data: { status, reason: leave.reason.slice(0, 300), source: "LEAVE", leaveId: leave.id, updatedById: session.user.id } });
    } else {
      await db.attendance.create({
        data: { tenantId: session.tenant.id, branchId: leave.student.branchId, studentId: leave.studentId, sectionId: leave.student.sectionId, date, period: 0, status, reason: leave.reason.slice(0, 300), source: "LEAVE", leaveId: leave.id, recordedById: session.user.id },
      });
    }
  }
}

async function removeFromAttendance(db: TenantDb, leaveId: string) {
  await db.attendance.deleteMany({ where: { leaveId, source: "LEAVE" } });
}

export async function getLeave(db: TenantDb, session: SessionData, id: string) {
  const leave = await scopedLeave(db, session, id, "view");
  const [student, decidedBy, createdBy] = await Promise.all([
    db.student.findFirst({ where: { id: leave.studentId }, select: { id: true, fullName: true, academicNumber: true, photoUrl: true, grade: { select: { name: true } }, section: { select: { name: true } } } }),
    leave.decidedById ? db.user.findFirst({ where: { id: leave.decidedById }, select: { name: true } }) : null,
    leave.createdById ? db.user.findFirst({ where: { id: leave.createdById }, select: { name: true } }) : null,
  ]);
  const scope = resolveScope(session.access, "transfers", "approve");
  return {
    ...leave,
    attachments: (Array.isArray(leave.attachments) ? leave.attachments : []) as Array<{ id: string; name: string; url: string; size?: number; mime?: string }>,
    student,
    decidedBy: decidedBy?.name ?? null,
    createdBy: createdBy?.name ?? null,
    canDecide: Boolean(scope) && leave.status === "PENDING",
    canCancel: leave.status !== "CANCELLED" && leave.status !== "REJECTED",
  };
}
