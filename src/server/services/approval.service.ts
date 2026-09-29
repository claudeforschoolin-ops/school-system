/**
 * محرك الموافقات متعددة المراحل: خطوات متسلسلة، لكل خطوة معتمد (دور أو مستخدم).
 * تستخدمه الوحدات (الخصومات، المصروفات، الإجازات، تعديل الدرجات...) عبر createApprovalRequest.
 */
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { notify } from "./notifications.service";

export interface ApprovalStepInput {
  name: string;
  approverRoleKey?: string;
  approverUserId?: string;
  dueHours?: number;
}

async function approverUserIds(db: TenantDb, step: { approverRoleId: string | null; approverUserId: string | null }) {
  if (step.approverUserId) return [step.approverUserId];
  if (step.approverRoleId) {
    const holders = await db.userRole.findMany({ where: { roleId: step.approverRoleId }, select: { userId: true } });
    return holders.map((h) => h.userId);
  }
  return [];
}

/** ربط قرارات الموافقة بالوحدات (تحميل كسول لتجنب الاعتماد الدائري) */
export interface ApprovalHookEvent {
  decision: "APPROVED" | "REJECTED";
  stepName: string;
  final: boolean;
}
type ApprovalHook = (db: TenantDb, session: SessionData, request: { id: string; entityType: string | null; entityId: string | null; type: string }, event: ApprovalHookEvent) => Promise<void>;
const APPROVAL_HOOKS: Record<string, () => Promise<ApprovalHook>> = {
  student_transfer: () => import("./transfers.service").then((m) => m.onTransferApproval),
  student_discount: () => import("./finance/billing.service").then((m) => m.onDiscountApproval),
  finance_refund: () => import("./finance/collections.service").then((m) => m.onRefundApproval),
  payment_voucher: () => import("./finance/banking.service").then((m) => m.onVoucherApproval),
  grade_change: () => import("./assessment/grades.service").then((m) => m.onGradeChangeApproval),
  staff_leave: () => import("./hr/time.service").then((m) => m.onStaffLeaveApproval),
  payroll_run: () => import("./hr/payroll.service").then((m) => m.onPayrollApproval),
  employee_loan: () => import("./hr/payroll.service").then((m) => m.onLoanApproval),
  end_of_service: () => import("./hr/eos.service").then((m) => m.onEosApproval),
};

async function runApprovalHook(db: TenantDb, session: SessionData, request: { id: string; entityType: string | null; entityId: string | null; type: string }, event: ApprovalHookEvent) {
  const loader = APPROVAL_HOOKS[request.type];
  if (loader) await (await loader())(db, session, request, event);
}

export async function createApprovalRequest(
  db: TenantDb,
  session: SessionData,
  input: {
    type: string;
    title: string;
    description?: string;
    entityType?: string;
    entityId?: string;
    link?: string;
    payload?: Record<string, unknown>;
    steps: ApprovalStepInput[];
  },
) {
  if (input.steps.length === 0) throw badRequest("يجب تحديد خطوة موافقة واحدة على الأقل");
  const roles = await db.role.findMany({ where: { key: { in: input.steps.map((s) => s.approverRoleKey ?? "").filter(Boolean) } } });
  const request = await db.approvalRequest.create({
    data: {
      tenantId: session.tenant.id,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      link: input.link ?? null,
      payload: (input.payload ?? {}) as never,
      requestedById: session.user.id,
    },
  });
  for (const [i, step] of input.steps.entries()) {
    await db.approvalStep.create({
      data: {
        tenantId: session.tenant.id,
        requestId: request.id,
        order: i + 1,
        name: step.name,
        approverRoleId: step.approverRoleKey ? (roles.find((r) => r.key === step.approverRoleKey)?.id ?? null) : null,
        approverUserId: step.approverUserId ?? null,
        dueHours: step.dueHours ?? null,
      },
    });
  }
  const first = await db.approvalStep.findFirstOrThrow({ where: { requestId: request.id, order: 1 } });
  await notify(db, {
    tenantId: session.tenant.id,
    userIds: await approverUserIds(db, first),
    type: "APPROVAL",
    title: `طلب موافقة: ${input.title}`,
    body: `بانتظار اعتمادك (${first.name}) — مقدّم من ${session.user.name}`,
    link: `/inbox?tab=approvals`,
    actorId: session.user.id,
    entityType: "ApprovalRequest",
    entityId: request.id,
  });
  return request;
}

/** الطلبات بانتظار اعتمادي + الطلبات التي قدمتها */
export async function listApprovals(db: TenantDb, session: SessionData) {
  const myRoleIds = (await db.userRole.findMany({ where: { userId: session.user.id }, select: { roleId: true } })).map((r) => r.roleId);
  const pendingSteps = await db.approvalStep.findMany({
    where: {
      status: "PENDING",
      request: { status: "PENDING" },
      OR: [{ approverUserId: session.user.id }, { approverRoleId: { in: myRoleIds } }],
    },
    include: { request: { include: { steps: { orderBy: { order: "asc" } } } } },
    orderBy: { request: { createdAt: "desc" } },
  });
  const awaitingMe = pendingSteps.filter((s) => s.request.currentStep === s.order).map((s) => s.request);
  const mine = await db.approvalRequest.findMany({
    where: { requestedById: session.user.id },
    include: { steps: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const userIds = [...new Set([...awaitingMe, ...mine].flatMap((r) => [r.requestedById, ...r.steps.map((s) => s.decidedById ?? "")]))].filter(Boolean);
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarColor: true } });
  const withNames = <T extends { requestedById: string }>(r: T) => ({ ...r, requestedBy: users.find((u) => u.id === r.requestedById) ?? null });
  return { awaitingMe: awaitingMe.map(withNames), mine: mine.map(withNames), users };
}

export async function decideApproval(
  db: TenantDb,
  session: SessionData,
  input: { requestId: string; decision: "APPROVED" | "REJECTED"; comment?: string },
) {
  const request = await db.approvalRequest.findFirst({ where: { id: input.requestId }, include: { steps: { orderBy: { order: "asc" } } } });
  if (!request) throw notFound("طلب الموافقة غير موجود");
  if (request.status !== "PENDING") throw badRequest("تم البت في هذا الطلب مسبقاً");
  const step = request.steps.find((s) => s.order === request.currentStep);
  if (!step) throw notFound("خطوة الموافقة غير موجودة");
  const allowed = await approverUserIds(db, step);
  if (!allowed.includes(session.user.id)) throw forbidden("لست المعتمد المخوّل لهذه الخطوة");
  if (request.requestedById === session.user.id) throw forbidden("لا يمكنك اعتماد طلب قدمته بنفسك");

  await db.approvalStep.update({
    where: { id: step.id },
    data: { status: input.decision, decidedById: session.user.id, decidedAt: new Date(), comment: input.comment ?? null },
  });
  const nextStep = request.steps.find((s) => s.order === request.currentStep + 1);
  const ctx = { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } };

  if (input.decision === "REJECTED" || !nextStep) {
    await db.approvalRequest.update({ where: { id: request.id }, data: { status: input.decision, decidedAt: new Date() } });
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: [request.requestedById],
      type: "APPROVAL",
      title: input.decision === "APPROVED" ? `تم اعتماد طلبك: ${request.title}` : `تم رفض طلبك: ${request.title}`,
      body: input.comment ?? null,
      link: `/inbox?tab=approvals`,
      actorId: session.user.id,
      entityType: "ApprovalRequest",
      entityId: request.id,
    });
  } else {
    await db.approvalRequest.update({ where: { id: request.id }, data: { currentStep: nextStep.order } });
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: await approverUserIds(db, nextStep),
      type: "APPROVAL",
      title: `طلب موافقة: ${request.title}`,
      body: `اعتمد ${session.user.name} الخطوة «${step.name}» وبانتظار اعتمادك (${nextStep.name})`,
      link: `/inbox?tab=approvals`,
      actorId: session.user.id,
      entityType: "ApprovalRequest",
      entityId: request.id,
    });
  }
  await runApprovalHook(db, session, request, { decision: input.decision, stepName: step.name, final: input.decision === "REJECTED" || !nextStep });
  await writeAudit(ctx, {
    action: input.decision === "APPROVED" ? "APPROVE" : "REJECT",
    entityType: "ApprovalRequest",
    entityId: request.id,
    summary: `${request.title} — ${step.name}`,
    newValue: { comment: input.comment ?? null },
  });
  return { ok: true };
}

export async function cancelApproval(db: TenantDb, session: SessionData, requestId: string) {
  const request = await db.approvalRequest.findFirst({ where: { id: requestId } });
  if (!request) throw notFound("طلب الموافقة غير موجود");
  if (request.requestedById !== session.user.id) throw forbidden("يمكنك إلغاء طلباتك فقط");
  if (request.status !== "PENDING") throw badRequest("لا يمكن إلغاء طلب تم البت فيه");
  await db.approvalRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
  return { ok: true };
}
