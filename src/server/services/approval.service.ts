/**
 * محرك الموافقات متعددة المراحل: خطوات متسلسلة، لكل خطوة معتمد (دور أو مستخدم).
 * تستخدمه الوحدات (الخصومات، المصروفات، الإجازات، تعديل الدرجات...) عبر createApprovalRequest.
 */
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { applyWorkflow, APPROVAL_TYPE_MAP, FIXED_APPROVAL_TYPES, type WorkflowStep } from "@/lib/workflows/engine";
import { notify } from "./notifications.service";

export interface ApprovalStepInput {
  name: string;
  approverRoleKey?: string;
  approverUserId?: string;
  dueHours?: number;
  escalateToRoleKey?: string;
  escalateToUserId?: string;
}

type StepApprovers = { approverRoleId: string | null; approverUserId: string | null; escalatedAt?: Date | null; escalateToRoleId?: string | null; escalateToUserId?: string | null };

async function holdersOf(db: TenantDb, roleId: string | null, userId: string | null) {
  if (userId) return [userId];
  if (roleId) return (await db.userRole.findMany({ where: { roleId }, select: { userId: true } })).map((h) => h.userId);
  return [];
}

/** المعتمدون المخوّلون للخطوة: معتمدها الأصلي، ومعهم جهة التصعيد بعد تصعيدها */
export async function approverUserIds(db: TenantDb, step: StepApprovers) {
  const base = await holdersOf(db, step.approverRoleId, step.approverUserId);
  if (!step.escalatedAt) return base;
  return [...new Set([...base, ...(await holdersOf(db, step.escalateToRoleId ?? null, step.escalateToUserId ?? null))])];
}

/**
 * المسار المخصص (إن وُجد ومفعّلاً) يحل محل المسار الافتراضي في الكود. خطوة دورٍ يحمله مقدّم الطلب
 * وحده تُحوَّل لجهة تصعيدها أو تُتجاوز، حتى لا يعلق الطلب بلا معتمد (لا يعتمد أحد طلبه بنفسه).
 */
async function resolveSteps(db: TenantDb, session: SessionData, input: { type: string; steps: ApprovalStepInput[]; amountMinor?: number | null; managerUserId?: string | null }) {
  if (FIXED_APPROVAL_TYPES.has(input.type) || !APPROVAL_TYPE_MAP.has(input.type)) return { steps: input.steps, version: null };
  const wf = await db.approvalWorkflow.findFirst({ where: { type: input.type, isActive: true } });
  if (!wf) return { steps: input.steps, version: null };
  const resolved = applyWorkflow(wf.steps as unknown as WorkflowStep[], { amountMinor: input.amountMinor, managerUserId: input.managerUserId, requesterId: session.user.id });
  const out: ApprovalStepInput[] = [];
  for (const st of resolved) {
    if (st.approverRoleKey && session.roleKeys.includes(st.approverRoleKey)) {
      const others = await db.userRole.count({ where: { role: { key: st.approverRoleKey }, userId: { not: session.user.id }, user: { status: "ACTIVE", deletedAt: null } } });
      if (!others) {
        if (st.escalateToRoleKey || st.escalateToUserId) out.push({ name: st.name, approverRoleKey: st.escalateToRoleKey, approverUserId: st.escalateToUserId, dueHours: st.dueHours });
        continue;
      }
    }
    if (st.approverUserId === session.user.id) continue;
    out.push(st);
  }
  return out.length ? { steps: out, version: wf.version } : { steps: input.steps, version: null };
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
  budget: () => import("./finance/budget.service").then((m) => m.onBudgetApproval),
  purchase_request: () => import("./ops/procurement.service").then((m) => m.onPurchaseRequestApproval),
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
    /** المبلغ لشروط المسار المخصص */
    amountMinor?: number | null;
    /** المدير المباشر لمقدّم الطلب (لخطوات «المدير المباشر») */
    managerUserId?: string | null;
  },
) {
  const { steps, version } = await resolveSteps(db, session, input);
  if (steps.length === 0) throw badRequest("يجب تحديد خطوة موافقة واحدة على الأقل");
  const roles = await db.role.findMany({ where: { key: { in: steps.flatMap((s) => [s.approverRoleKey ?? "", s.escalateToRoleKey ?? ""]).filter(Boolean) } } });
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
      amountMinor: input.amountMinor ?? null,
      workflowVersion: version,
    },
  });
  const now = new Date();
  for (const [i, step] of steps.entries()) {
    await db.approvalStep.create({
      data: {
        tenantId: session.tenant.id,
        requestId: request.id,
        order: i + 1,
        name: step.name,
        approverRoleId: step.approverRoleKey ? (roles.find((r) => r.key === step.approverRoleKey)?.id ?? null) : null,
        approverUserId: step.approverUserId ?? null,
        dueHours: step.dueHours ?? null,
        activatedAt: i === 0 ? now : null,
        escalateToRoleId: step.escalateToRoleKey ? (roles.find((r) => r.key === step.escalateToRoleKey)?.id ?? null) : null,
        escalateToUserId: step.escalateToUserId ?? null,
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
      OR: [
        { approverUserId: session.user.id },
        { approverRoleId: { in: myRoleIds } },
        { escalatedAt: { not: null }, OR: [{ escalateToUserId: session.user.id }, { escalateToRoleId: { in: myRoleIds } }] },
      ],
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
    await db.approvalStep.update({ where: { id: nextStep.id }, data: { activatedAt: new Date() } });
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
