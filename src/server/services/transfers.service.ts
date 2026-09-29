/**
 * التحويلات: بين الفصول/الصفوف، أو من/إلى مدرسة أخرى، أو انسحاب — بسير عمل موافقات:
 * وكيل شؤون الطلاب ← المدير ← المالية (خلو الطرف) للمغادرة. لا تُنفَّذ المغادرة ولا تُصدر
 * شهادة النقل قبل خلو الطرف المالي. (التحقق الآلي من الرصيد يُضاف مع النظام المحاسبي — المرحلة ٣.)
 */
import type { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/money";
import { TRANSFER_TYPE } from "@/lib/students";
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { assertSectionFits } from "@/server/collections/students";
import { createApprovalRequest, type ApprovalHookEvent } from "./approval.service";
import { dateOnly } from "./attendance.service";
import { messageGuardians } from "./guardian-messages";
import { nextNumber, nextSequence } from "./sequence.service";
import { requireStudentWhere } from "./student-scope";

type TransferType = keyof typeof TRANSFER_TYPE;
export const CLEARANCE_STEP = "خلو الطرف المالي";
const LEAVING: TransferType[] = ["OUTGOING", "WITHDRAWAL"];

function stepsFor(type: TransferType) {
  const steps: Array<{ name: string; approverRoleKey: string }> = [{ name: "وكيل شؤون الطلاب", approverRoleKey: "VP_STUDENTS" }];
  if (type !== "SECTION" && type !== "INCOMING") steps.push({ name: "مدير المدرسة", approverRoleKey: "PRINCIPAL" });
  if (LEAVING.includes(type)) steps.push({ name: CLEARANCE_STEP, approverRoleKey: "ACCOUNTANT" });
  return steps;
}

export interface TransferInput {
  studentId: string;
  type: TransferType;
  toSectionId?: string | null;
  toGradeId?: string | null;
  otherSchool?: string | null;
  reason: string;
  effectiveDate: string;
  attachments?: Array<{ id: string; name: string; url: string; size?: number; mime?: string }>;
}

export async function createTransfer(db: TenantDb, session: SessionData, input: TransferInput) {
  const where = await requireStudentWhere(db, session, "transfers", "create", "لا تملك صلاحية إنشاء التحويلات");
  const student = await db.student.findFirst({ where: { ...where, id: input.studentId, deletedAt: null }, include: { grade: true } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  if (student.status !== "ACTIVE" && input.type !== "INCOMING") throw badRequest("التحويل للطلاب المنتظمين فقط");
  const open = await db.transfer.findFirst({ where: { studentId: student.id, status: { in: ["PENDING", "APPROVED"] }, deletedAt: null } });
  if (open) throw badRequest(`يوجد طلب تحويل مفتوح للطالب (رقم ${open.number})`);
  if (input.type === "SECTION") {
    if (!input.toSectionId) throw badRequest("اختر الفصل الجديد");
    const s = await db.section.findFirst({ where: { id: input.toSectionId, deletedAt: null } });
    if (!s || s.gradeId !== student.gradeId || s.branchId !== student.branchId) throw badRequest("الفصل الجديد يجب أن يكون من صف الطالب وفرعه");
  }
  if (input.type === "GRADE" && !input.toGradeId) throw badRequest("اختر الصف الجديد");
  if ((input.type === "OUTGOING" || input.type === "INCOMING") && !input.otherSchool?.trim()) throw badRequest("اكتب اسم المدرسة الأخرى");
  const ids = (input.attachments ?? []).map((a) => a.id);
  const files = ids.length ? await db.fileObject.findMany({ where: { id: { in: ids } } }) : [];

  const transfer = await db.transfer.create({
    data: {
      tenantId: session.tenant.id,
      branchId: student.branchId,
      number: await nextNumber(db, session.tenant.id, "transfer"),
      studentId: student.id,
      type: input.type,
      fromSectionId: student.sectionId,
      toSectionId: input.toSectionId ?? null,
      toGradeId: input.toGradeId ?? null,
      otherSchool: input.otherSchool?.trim() || null,
      reason: input.reason.trim(),
      effectiveDate: dateOnly(input.effectiveDate),
      attachments: files.map((f) => ({ id: f.id, name: f.name, url: `/api/files/${f.id}`, size: f.size, mime: f.mime })) as Prisma.InputJsonValue,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  const approval = await createApprovalRequest(db, session, {
    type: "student_transfer",
    title: `${TRANSFER_TYPE[input.type].label}: ${student.fullName}`,
    description: input.reason,
    entityType: "Transfer",
    entityId: transfer.id,
    link: `/transfers/${transfer.id}`,
    steps: stepsFor(input.type),
  });
  return db.transfer.update({ where: { id: transfer.id }, data: { approvalRequestId: approval.id } });
}

/** ربط قرارات الموافقة بحالة التحويل */
export async function onTransferApproval(db: TenantDb, session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId) return;
  const transfer = await db.transfer.findFirst({ where: { id: request.entityId } });
  if (!transfer || transfer.status !== "PENDING") return;
  const data: Prisma.TransferUncheckedUpdateInput = { updatedById: session.user.id };
  if (event.stepName === CLEARANCE_STEP && event.decision === "APPROVED") Object.assign(data, { financialClearance: true, clearedById: session.user.id, clearedAt: new Date() });
  if (event.final) data.status = event.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  await db.transfer.update({ where: { id: transfer.id }, data });
}

/** تنفيذ التحويل المعتمد: نقل الطالب أو تغيير حالته وإصدار شهادة النقل */
export async function completeTransfer(db: TenantDb, session: SessionData, id: string) {
  const where = await requireStudentWhere(db, session, "transfers", "update", "تنفيذ التحويلات من صلاحية شؤون الطلاب");
  const t = await db.transfer.findFirst({ where: { id, deletedAt: null, student: where }, include: { student: true } });
  if (!t) throw notFound("التحويل غير موجود أو خارج نطاق صلاحيتك");
  if (t.status !== "APPROVED") throw badRequest("لا يُنفَّذ التحويل قبل اكتمال الموافقات");
  const type = t.type as TransferType;
  if (LEAVING.includes(type) && !t.financialClearance) throw badRequest("لم يُعتمد خلو الطرف المالي بعد");
  if (LEAVING.includes(type)) {
    // سياسة المديونية: لا تصدر شهادة النقل مع رصيد مستحق (قابلة للتعطيل من إعدادات المالية)
    const { studentOutstanding } = await import("./finance/billing.service");
    const { financeSettings } = await import("./finance/common");
    const due = await studentOutstanding(db, t.studentId);
    if (due > 0 && financeSettings(session).blockTransferCertificate) throw badRequest(`على الطالب مستحقات قائمة (${formatMoney(due, { currency: session.tenant.currency })})؛ سوِّها أو أصدر التسوية التناسبية قبل إصدار الشهادة`);
  }
  const ctx = { db, session };
  let certificateNumber: string | null = null;

  if (type === "SECTION") {
    await assertSectionFits(ctx, t.student, t.toSectionId!);
    await db.student.update({ where: { id: t.studentId }, data: { sectionId: t.toSectionId, updatedById: session.user.id } });
  } else if (type === "GRADE") {
    const grade = await db.grade.findFirst({ where: { id: t.toGradeId! } });
    if (!grade) throw badRequest("الصف الجديد غير موجود");
    let sectionId: string | null = null;
    if (t.toSectionId) {
      await assertSectionFits(ctx, { ...t.student, gradeId: grade.id, sectionId: null }, t.toSectionId);
      sectionId = t.toSectionId;
    }
    await db.student.update({ where: { id: t.studentId }, data: { gradeId: grade.id, sectionId, updatedById: session.user.id } });
  } else if (type === "INCOMING") {
    await db.student.update({ where: { id: t.studentId }, data: { previousSchool: t.otherSchool, updatedById: session.user.id } });
  } else {
    const year = new Date().getUTCFullYear();
    certificateNumber = (await nextSequence(db, session.tenant.id, `transfer-cert:${year}`, { prefix: `${year}/`, padding: 4 })).formatted;
    await db.student.update({ where: { id: t.studentId }, data: { status: type === "OUTGOING" ? "TRANSFERRED" : "WITHDRAWN", sectionId: null, updatedById: session.user.id } });
  }
  const updated = await db.transfer.update({
    where: { id },
    data: { status: "COMPLETED", ...(certificateNumber ? { certificateNumber, certificateIssuedAt: new Date() } : {}), updatedById: session.user.id },
  });
  await messageGuardians(db, session, t.studentId, "transfer_completed", { student: t.student.fullName, kind: TRANSFER_TYPE[type].label, certificate: certificateNumber ?? "—" });
  return updated;
}

export async function cancelTransfer(db: TenantDb, session: SessionData, id: string) {
  const where = await requireStudentWhere(db, session, "transfers", "update");
  const t = await db.transfer.findFirst({ where: { id, deletedAt: null, student: where } });
  if (!t) throw notFound();
  if (t.status === "COMPLETED") throw badRequest("لا يمكن إلغاء تحويل منفّذ");
  await db.transfer.update({ where: { id }, data: { status: "CANCELLED", updatedById: session.user.id } });
  if (t.approvalRequestId) await db.approvalRequest.updateMany({ where: { id: t.approvalRequestId, status: "PENDING" }, data: { status: "CANCELLED" } });
  return { ok: true };
}

export async function getTransfer(db: TenantDb, session: SessionData, id: string) {
  const where = await requireStudentWhere(db, session, "transfers", "view");
  const t = await db.transfer.findFirst({
    where: { id, deletedAt: null, student: where },
    include: { student: { select: { id: true, fullName: true, academicNumber: true, photoUrl: true, nationalIdLast4: true, birthDate: true, nationality: true, status: true, grade: { select: { name: true } }, section: { select: { name: true } }, branch: { select: { name: true } } } } },
  });
  if (!t) throw notFound("التحويل غير موجود أو خارج نطاق صلاحيتك");
  const [approval, fromSection, toSection, toGrade] = await Promise.all([
    t.approvalRequestId ? db.approvalRequest.findFirst({ where: { id: t.approvalRequestId }, include: { steps: { orderBy: { order: "asc" } } } }) : null,
    t.fromSectionId ? db.section.findFirst({ where: { id: t.fromSectionId }, include: { grade: { select: { name: true } } } }) : null,
    t.toSectionId ? db.section.findFirst({ where: { id: t.toSectionId }, include: { grade: { select: { name: true } } } }) : null,
    t.toGradeId ? db.grade.findFirst({ where: { id: t.toGradeId }, select: { name: true } }) : null,
  ]);
  const deciders = approval ? await db.user.findMany({ where: { id: { in: approval.steps.map((s) => s.decidedById ?? "").filter(Boolean) } }, select: { id: true, name: true } }) : [];
  return {
    ...t,
    attachments: (Array.isArray(t.attachments) ? t.attachments : []) as Array<{ id: string; name: string; url: string; size?: number; mime?: string }>,
    from: fromSection ? `${fromSection.grade.name} / ${fromSection.name}` : null,
    to: toSection ? `${toSection.grade.name} / ${toSection.name}` : toGrade?.name ?? t.otherSchool,
    approval: approval ? { status: approval.status, currentStep: approval.currentStep, steps: approval.steps.map((s) => ({ order: s.order, name: s.name, status: s.status, decidedAt: s.decidedAt, comment: s.comment, decidedBy: deciders.find((d) => d.id === s.decidedById)?.name ?? null })) } : null,
    permissions: { canComplete: can(session.access, "transfers", "update") && t.status === "APPROVED", canCancel: can(session.access, "transfers", "update") && ["PENDING", "APPROVED"].includes(t.status) },
  };
}

/** شهادة النقل: تُصدر فقط للتحويلات المنفذة بعد خلو الطرف */
export async function transferCertificate(db: TenantDb, session: SessionData, id: string) {
  const t = await getTransfer(db, session, id);
  if (!t.certificateNumber) throw forbidden("لا توجد شهادة نقل لهذا التحويل");
  return t;
}
