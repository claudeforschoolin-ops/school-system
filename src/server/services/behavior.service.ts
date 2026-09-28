/**
 * السلوك والإرشاد: سجلات سلوكية بنقاط (يسجلها المعلم لطلاب فصوله)، وحالات إرشادية سرّية
 * لا يراها إلا المرشد المسؤول والإدارة، بخطط علاج فردية وجلسات واستدعاء ولي الأمر.
 */
import type { Prisma } from "@/generated/prisma/client";
import { BEHAVIOR_CATEGORIES, CASE_CATEGORIES } from "@/lib/students";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { messageGuardians } from "./guardian-messages";
import { nextNumber } from "./sequence.service";
import { notify } from "./notifications.service";
import { requireStudentWhere } from "./student-scope";

const ADMIN_ROLES = ["OWNER", "PRINCIPAL", "VP_STUDENTS"];

export interface BehaviorInput {
  studentId: string;
  category: string;
  points?: number;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  occurredAt?: Date;
  description?: string | null;
  actionTaken?: string | null;
  notifyGuardian?: boolean;
}

export async function createBehavior(db: TenantDb, session: SessionData, input: BehaviorInput) {
  const where = await requireStudentWhere(db, session, "counseling", "create", "لا تملك صلاحية تسجيل السلوك لهذا الطالب");
  const student = await db.student.findFirst({ where: { ...where, id: input.studentId, deletedAt: null } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  const cat = BEHAVIOR_CATEGORIES.find((c) => c.id === input.category);
  if (!cat) throw badRequest("تصنيف السلوك غير معروف");
  const points = input.points ?? cat.points;
  if (cat.kind === "POSITIVE" && points < 0) throw badRequest("نقاط السلوك الإيجابي لا تكون سالبة");
  if (cat.kind === "NEGATIVE" && points > 0) throw badRequest("نقاط السلوك السلبي لا تكون موجبة");
  const record = await db.behaviorRecord.create({
    data: {
      tenantId: session.tenant.id,
      branchId: student.branchId,
      number: await nextNumber(db, session.tenant.id, "behavior"),
      studentId: student.id,
      kind: cat.kind,
      category: cat.id,
      points,
      severity: input.severity ?? (cat.kind === "POSITIVE" ? "LOW" : Math.abs(points) >= 4 ? "HIGH" : "MEDIUM"),
      occurredAt: input.occurredAt ?? new Date(),
      description: input.description?.trim() || null,
      actionTaken: input.actionTaken?.trim() || null,
      guardianNotified: Boolean(input.notifyGuardian),
      reportedById: session.user.id,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  if (input.notifyGuardian) await messageGuardians(db, session, student.id, "behavior_notice", { student: student.fullName, category: cat.label });
  if (record.severity === "HIGH" || record.severity === "CRITICAL") {
    const staff = await db.userRole.findMany({ where: { role: { key: { in: ["COUNSELOR", "VP_STUDENTS"] } }, OR: [{ branchId: student.branchId }, { branchId: null }] }, select: { userId: true } });
    await notify(db, { tenantId: session.tenant.id, userIds: staff.map((s) => s.userId), type: "SYSTEM", title: `سلوك ${record.severity === "CRITICAL" ? "حرج" : "مرتفع الخطورة"}: ${student.fullName} — ${cat.label}`, link: `/students/${student.id}?tab=behavior`, actorId: session.user.id, entityType: "BehaviorRecord", entityId: record.id });
  }
  return record;
}

export async function behaviorSummary(db: TenantDb, session: SessionData, studentId: string) {
  const where = await requireStudentWhere(db, session, "counseling", "view");
  const student = await db.student.findFirst({ where: { ...where, id: studentId }, select: { id: true } });
  if (!student) throw notFound();
  const records = await db.behaviorRecord.findMany({ where: { studentId, deletedAt: null }, orderBy: { occurredAt: "desc" }, take: 50 });
  const reporters = await db.user.findMany({ where: { id: { in: records.map((r) => r.reportedById ?? "").filter(Boolean) } }, select: { id: true, name: true } });
  return {
    points: records.reduce((a, r) => a + r.points, 0),
    positive: records.filter((r) => r.kind === "POSITIVE").length,
    negative: records.filter((r) => r.kind === "NEGATIVE").length,
    records: records.map((r) => ({ ...r, reportedBy: reporters.find((u) => u.id === r.reportedById)?.name ?? null })),
  };
}

// ---------------------------------------------------------------------
// الحالات الإرشادية (سرّية)
// ---------------------------------------------------------------------

export function isCounselingAdmin(session: SessionData) {
  return session.roleKeys.some((k) => ADMIN_ROLES.includes(k));
}

/** شرط السرية: الإدارة ترى حالات نطاقها، وغيرهم يرى حالاته فقط */
export async function caseWhere(db: TenantDb, session: SessionData, action: "view" | "update" = "view"): Promise<Prisma.CounselingCaseWhereInput> {
  const scope = resolveScope(session.access, "counseling", action);
  if (!scope) throw forbidden("الحالات الإرشادية سرّية");
  const studentWhere = await requireStudentWhere(db, session, "counseling", action);
  if (isCounselingAdmin(session)) return { deletedAt: null, student: studentWhere };
  return { deletedAt: null, counselorId: session.user.id };
}

export function canOpenCases(session: SessionData) {
  return isCounselingAdmin(session) || session.roleKeys.includes("COUNSELOR");
}

export async function createCase(db: TenantDb, session: SessionData, input: { studentId: string; title: string; category: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; counselorId?: string | null; description?: string | null }) {
  if (!canOpenCases(session)) throw forbidden("فتح الحالات الإرشادية للمرشد الطلابي والإدارة");
  const where = await requireStudentWhere(db, session, "counseling", "create");
  const student = await db.student.findFirst({ where: { ...where, id: input.studentId, deletedAt: null } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  if (!CASE_CATEGORIES.some((c) => c.id === input.category)) throw badRequest("تصنيف غير معروف");
  const counselorId = input.counselorId ?? session.user.id;
  const created = await db.counselingCase.create({
    data: {
      tenantId: session.tenant.id,
      branchId: student.branchId,
      number: await nextNumber(db, session.tenant.id, "case"),
      studentId: student.id,
      title: input.title.trim(),
      category: input.category,
      severity: input.severity,
      counselorId,
      plan: input.description ? ({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "وصف الحالة" }] }, { type: "paragraph", content: [{ type: "text", text: input.description }] }] } as Prisma.InputJsonValue) : undefined,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  if (counselorId !== session.user.id) {
    await notify(db, { tenantId: session.tenant.id, userIds: [counselorId], type: "ASSIGNMENT", title: `أُسندت إليك حالة إرشادية رقم ${created.number}`, link: `/counseling/${created.id}`, actorId: session.user.id, entityType: "CounselingCase", entityId: created.id });
  }
  return created;
}

async function scopedCase(db: TenantDb, session: SessionData, id: string, action: "view" | "update" = "view") {
  const c = await db.counselingCase.findFirst({ where: { ...(await caseWhere(db, session, action)), id } });
  if (!c) throw notFound("الحالة غير موجودة أو ليست من صلاحيتك");
  return c;
}

export async function getCase(db: TenantDb, session: SessionData, id: string) {
  const c = await scopedCase(db, session, id);
  const [student, sessions, counselor, behavior] = await Promise.all([
    db.student.findFirst({ where: { id: c.studentId }, select: { id: true, fullName: true, academicNumber: true, photoUrl: true, criticalHealth: true, grade: { select: { name: true } }, section: { select: { name: true } }, guardians: { where: { isPrimary: true }, select: { guardian: { select: { name: true, phone: true } } } } } }),
    db.counselingSession.findMany({ where: { caseId: id }, orderBy: { scheduledAt: "desc" } }),
    db.user.findFirst({ where: { id: c.counselorId }, select: { id: true, name: true, avatarColor: true } }),
    db.behaviorRecord.findMany({ where: { studentId: c.studentId, deletedAt: null }, orderBy: { occurredAt: "desc" }, take: 8 }),
  ]);
  return { ...c, student, sessions, counselor, behavior, canEdit: c.counselorId === session.user.id || isCounselingAdmin(session) };
}

export async function updateCase(
  db: TenantDb,
  session: SessionData,
  id: string,
  patch: { title?: string; category?: string; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; status?: "OPEN" | "IN_PROGRESS" | "MONITORING" | "CLOSED"; counselorId?: string; plan?: unknown },
) {
  const c = await scopedCase(db, session, id, "update");
  if (c.counselorId !== session.user.id && !isCounselingAdmin(session)) throw forbidden();
  if (patch.category && !CASE_CATEGORIES.some((x) => x.id === patch.category)) throw badRequest("تصنيف غير معروف");
  const data: Prisma.CounselingCaseUncheckedUpdateInput = { updatedById: session.user.id };
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.category) data.category = patch.category;
  if (patch.severity) data.severity = patch.severity;
  if (patch.status) {
    data.status = patch.status;
    data.closedAt = patch.status === "CLOSED" ? new Date() : null;
  }
  if (patch.counselorId) {
    if (!isCounselingAdmin(session)) throw forbidden("إعادة إسناد الحالة للإدارة");
    data.counselorId = patch.counselorId;
  }
  if (patch.plan !== undefined) data.plan = patch.plan as Prisma.InputJsonValue;
  return db.counselingCase.update({ where: { id }, data });
}

export async function addSession(db: TenantDb, session: SessionData, caseId: string, input: { scheduledAt: Date; durationMinutes?: number; attendees?: string | null }) {
  const c = await scopedCase(db, session, caseId, "update");
  const created = await db.counselingSession.create({
    data: { tenantId: session.tenant.id, caseId, scheduledAt: input.scheduledAt, durationMinutes: input.durationMinutes ?? 30, attendees: input.attendees ?? null, createdById: session.user.id, updatedById: session.user.id },
  });
  if (c.status === "OPEN") await db.counselingCase.update({ where: { id: caseId }, data: { status: "IN_PROGRESS" } });
  return created;
}

export async function updateSession(db: TenantDb, session: SessionData, sessionId: string, patch: { status?: "SCHEDULED" | "DONE" | "MISSED" | "CANCELLED"; summary?: string | null; scheduledAt?: Date }) {
  const s = await db.counselingSession.findFirst({ where: { id: sessionId } });
  if (!s) throw notFound();
  await scopedCase(db, session, s.caseId, "update");
  return db.counselingSession.update({ where: { id: sessionId }, data: { ...patch, updatedById: session.user.id } });
}

export async function summonGuardian(db: TenantDb, session: SessionData, caseId: string, date: string) {
  const c = await scopedCase(db, session, caseId, "update");
  const student = await db.student.findFirstOrThrow({ where: { id: c.studentId }, select: { fullName: true } });
  const sent = await messageGuardians(db, session, c.studentId, "guardian_summon", { student: student.fullName, date });
  await db.counselingCase.update({ where: { id: caseId }, data: { guardianSummonedAt: new Date(), updatedById: session.user.id } });
  return { sent };
}

export async function getBehavior(db: TenantDb, session: SessionData, id: string) {
  const where = await requireStudentWhere(db, session, "counseling", "view");
  const b = await db.behaviorRecord.findFirst({
    where: { id, deletedAt: null, student: where },
    include: { student: { select: { id: true, fullName: true, academicNumber: true, photoUrl: true, criticalHealth: true, grade: { select: { name: true } }, section: { select: { name: true } } } } },
  });
  if (!b) throw notFound("الملاحظة غير موجودة أو خارج نطاق صلاحيتك");
  const reporter = b.reportedById ? await db.user.findFirst({ where: { id: b.reportedById }, select: { name: true } }) : null;
  return { ...b, reportedBy: reporter?.name ?? null };
}
