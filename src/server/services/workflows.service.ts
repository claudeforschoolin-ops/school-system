/**
 * مسارات الموافقة: التخصيص (محرر مرئي)، المراقبة (المهل والاختناقات)، والتصعيد الآلي.
 * ---------------------------------------------------------------------
 * - تعديل المسار يحتاج صلاحية «سير العمل والموافقات» (تعديل)، والعرض والمراقبة صلاحية العرض.
 * - الطلبات القائمة تبقى على خطواتها وقت إنشائها؛ التعديل يسري على الطلبات الجديدة (برقم إصدار).
 * - التصعيد: بعد انقضاء مهلة الخطوة تُضاف جهة التصعيد معتمداً (دون إسقاط المعتمد الأصلي)
 *   ويُشعَر الطرفان؛ وقبل الانقضاء بربع المهلة يُذكَّر المعتمد.
 */
import { z } from "zod";
import { APPROVAL_TYPE_MAP, APPROVAL_TYPES, slaState, validateWorkflow, type WorkflowStep } from "@/lib/workflows/engine";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import { createTenantDb, writeAudit, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { approverUserIds } from "./approval.service";
import { readModuleSettings } from "./module-settings.service";
import { notify } from "./notifications.service";

const approverSchema = z.object({ kind: z.enum(["ROLE", "USER", "MANAGER"]), roleKey: z.string().max(40).nullish(), userId: z.string().max(64).nullish() });
export const stepSchema = z.object({
  key: z.string().max(40),
  name: z.string().trim().max(80),
  approver: approverSchema,
  dueHours: z.number().int().min(1).max(720).nullish(),
  escalate: approverSchema.nullish(),
  minAmountMinor: z.number().int().min(0).nullish(),
  maxAmountMinor: z.number().int().min(0).nullish(),
});

function requireWorkflows(session: SessionData, action: "view" | "update") {
  if (!resolveScope(session.access, "workflows", action)) throw forbidden(action === "view" ? "ليست لديك صلاحية مسارات الموافقة" : "تعديل مسارات الموافقة لمسؤول سير العمل");
}

/** المسار الافتراضي مع حد اعتماد المدير في المشتريات من الإعدادات */
function defaultSteps(session: SessionData, type: string): WorkflowStep[] {
  const def = APPROVAL_TYPE_MAP.get(type)!;
  if (type === "purchase_request") {
    const limit = readModuleSettings(session.tenant.settings, "procurement").principalApprovalAboveMinor;
    return def.defaultSteps.map((s) => (s.key === "pr" ? { ...s, minAmountMinor: limit + 1 } : s));
  }
  return def.defaultSteps;
}

export async function listWorkflows(db: TenantDb, session: SessionData) {
  requireWorkflows(session, "view");
  const [custom, pending] = await Promise.all([
    db.approvalWorkflow.findMany(),
    db.approvalStep.findMany({ where: { status: "PENDING", request: { status: "PENDING" } }, select: { dueHours: true, activatedAt: true, escalatedAt: true, order: true, request: { select: { type: true, currentStep: true } } } }),
  ]);
  const now = new Date();
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const decided = await db.approvalStep.findMany({ where: { decidedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } }, select: { decidedAt: true, activatedAt: true, request: { select: { type: true, createdAt: true } } } });
  return APPROVAL_TYPES.map((t) => {
    const wf = custom.find((c) => c.type === t.key);
    const current = pending.filter((p) => p.request.type === t.key && p.order === p.request.currentStep);
    const times = decided.filter((d) => d.request.type === t.key).map((d) => (d.decidedAt!.getTime() - (d.activatedAt ?? d.request.createdAt).getTime()) / 3_600_000);
    const steps = wf?.isActive ? (wf.steps as unknown as WorkflowStep[]) : defaultSteps(session, t.key);
    return {
      key: t.key, label: t.label, description: t.description, custom: Boolean(wf?.isActive), version: wf?.version ?? null, updatedAt: wf?.updatedAt ?? null,
      steps: steps.map((s) => ({ name: s.name, dueHours: s.dueHours ?? null, conditional: Boolean(s.minAmountMinor || s.maxAmountMinor || s.approver.kind === "MANAGER") })),
      pending: current.length,
      overdue: current.filter((c) => ["OVERDUE", "ESCALATED"].includes(slaState(c, now).state)).length,
      avgHours: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null,
    };
  });
}

export async function getWorkflow(db: TenantDb, session: SessionData, type: string) {
  requireWorkflows(session, "view");
  const def = APPROVAL_TYPE_MAP.get(type);
  if (!def) throw notFound("نوع الطلب غير معروف");
  const wf = await db.approvalWorkflow.findFirst({ where: { type } });
  const [roles, users, history] = await Promise.all([
    db.role.findMany({ where: { key: { notIn: ["PARENT", "STUDENT"] } }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { deletedAt: null, status: "ACTIVE", roles: { some: { role: { key: { notIn: ["PARENT", "STUDENT"] } } } } }, select: { id: true, name: true, jobTitle: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ where: { entityType: "ApprovalWorkflow", entityId: wf?.id ?? "-" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, userName: true, action: true, summary: true, createdAt: true } }),
  ]);
  return {
    type: { key: def.key, label: def.label, description: def.description, hasAmount: def.hasAmount, hasManager: def.hasManager },
    custom: wf ? { id: wf.id, isActive: wf.isActive, version: wf.version, steps: wf.steps as unknown as WorkflowStep[], updatedAt: wf.updatedAt } : null,
    defaultSteps: defaultSteps(session, type),
    roles,
    users,
    history,
    canEdit: Boolean(resolveScope(session.access, "workflows", "update")),
  };
}

export async function saveWorkflow(db: TenantDb, session: SessionData, input: { type: string; isActive: boolean; steps: WorkflowStep[] }) {
  requireWorkflows(session, "update");
  const def = APPROVAL_TYPE_MAP.get(input.type);
  if (!def) throw notFound("نوع الطلب غير معروف");
  const errors = validateWorkflow(input.steps, def);
  if (errors.length) throw badRequest(errors.join("؛ "));
  // المعتمدون موجودون فعلاً
  const roleKeys = input.steps.flatMap((s) => [s.approver.kind === "ROLE" ? s.approver.roleKey : null, s.escalate?.kind === "ROLE" ? s.escalate.roleKey : null]).filter(Boolean) as string[];
  const userIds = input.steps.flatMap((s) => [s.approver.kind === "USER" ? s.approver.userId : null, s.escalate?.kind === "USER" ? s.escalate.userId : null]).filter(Boolean) as string[];
  if ((await db.role.count({ where: { key: { in: roleKeys } } })) !== new Set(roleKeys).size) throw badRequest("أحد الأدوار المختارة غير موجود");
  if ((await db.user.count({ where: { id: { in: userIds }, status: "ACTIVE", deletedAt: null } })) !== new Set(userIds).size) throw badRequest("أحد المستخدمين المختارين غير نشط");
  const steps = input.steps.map((s, i) => ({ ...s, key: s.key || `s${i + 1}`, name: s.name.trim() }));
  const existing = await db.approvalWorkflow.findFirst({ where: { type: input.type } });
  if (existing) return db.approvalWorkflow.update({ where: { id: existing.id }, data: { steps: steps as never, isActive: input.isActive, version: existing.version + 1, updatedById: session.user.id } });
  return db.approvalWorkflow.create({ data: { tenantId: session.tenant.id, type: input.type, name: def.label, steps: steps as never, isActive: input.isActive, updatedById: session.user.id } });
}

/** العودة للمسار الافتراضي (يُحذف التخصيص؛ يبقى أثره في سجل التدقيق) */
export async function resetWorkflow(db: TenantDb, session: SessionData, type: string) {
  requireWorkflows(session, "update");
  const wf = await db.approvalWorkflow.findFirst({ where: { type } });
  if (wf) await db.approvalWorkflow.delete({ where: { id: wf.id } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// المراقبة
// ---------------------------------------------------------------------

export async function monitor(db: TenantDb, session: SessionData, input: { type?: string | null; state?: string | null }) {
  requireWorkflows(session, "view");
  const now = new Date();
  const requests = await db.approvalRequest.findMany({ where: { status: "PENDING", ...(input.type ? { type: input.type } : {}) }, include: { steps: { orderBy: { order: "asc" } } }, orderBy: { createdAt: "asc" }, take: 500 });
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  for (const r of requests) {
    userIds.add(r.requestedById);
    for (const s of r.steps) {
      if (s.approverUserId) userIds.add(s.approverUserId);
      if (s.escalateToUserId) userIds.add(s.escalateToUserId);
      if (s.approverRoleId) roleIds.add(s.approverRoleId);
      if (s.escalateToRoleId) roleIds.add(s.escalateToRoleId);
    }
  }
  const [users, roles] = await Promise.all([db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }), db.role.findMany({ where: { id: { in: [...roleIds] } }, select: { id: true, name: true } })]);
  const who = (roleId: string | null, userId: string | null) => (userId ? users.find((u) => u.id === userId)?.name : roles.find((r) => r.id === roleId)?.name) ?? "—";
  const rows = requests
    .map((r) => {
      const step = r.steps.find((s) => s.order === r.currentStep);
      if (!step) return null;
      const sla = slaState(step, now);
      return {
        id: r.id, title: r.title, type: r.type, typeLabel: APPROVAL_TYPE_MAP.get(r.type)?.label ?? r.type, link: r.link, createdAt: r.createdAt,
        requester: users.find((u) => u.id === r.requestedById)?.name ?? "—", step: step.name, stepOf: `${step.order}/${r.steps.length}`,
        approver: who(step.approverRoleId, step.approverUserId), escalatedTo: step.escalatedAt ? who(step.escalateToRoleId, step.escalateToUserId) : null,
        waitingHours: Math.floor((now.getTime() - (step.activatedAt ?? r.createdAt).getTime()) / 3_600_000), dueAt: sla.dueAt, hoursLeft: sla.hoursLeft, state: sla.state,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((x) => !input.state || x.state === input.state);
  // الاختناقات: متوسط ساعات القرار لكل خطوة خلال ٩٠ يوماً
  const decided = await db.approvalStep.findMany({ where: { decidedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, select: { name: true, decidedAt: true, activatedAt: true, request: { select: { type: true, createdAt: true } } } });
  const agg = new Map<string, { label: string; total: number; n: number }>();
  for (const d of decided) {
    const k = `${d.request.type}|${d.name}`;
    const e = agg.get(k) ?? { label: `${APPROVAL_TYPE_MAP.get(d.request.type)?.label ?? d.request.type} — ${d.name}`, total: 0, n: 0 };
    e.total += (d.decidedAt!.getTime() - (d.activatedAt ?? d.request.createdAt).getTime()) / 3_600_000;
    e.n++;
    agg.set(k, e);
  }
  return {
    rows,
    counts: { total: rows.length, overdue: rows.filter((r) => r.state === "OVERDUE").length, escalated: rows.filter((r) => r.state === "ESCALATED").length, dueSoon: rows.filter((r) => r.state === "DUE_SOON").length },
    bottlenecks: [...agg.entries()].map(([key, e]) => ({ key, label: e.label, hours: Math.round((e.total / e.n) * 10) / 10, decisions: e.n })).sort((a, b) => b.hours - a.hours).slice(0, 10),
  };
}

// ---------------------------------------------------------------------
// التصعيد الآلي (المهمة الدورية)
// ---------------------------------------------------------------------

export async function runEscalations(tenantId: string, now = new Date()) {
  const db = createTenantDb({ tenantId, actor: null });
  const steps = await rootDb.approvalStep.findMany({ where: { tenantId, status: "PENDING", dueHours: { not: null }, activatedAt: { not: null }, escalatedAt: null, request: { status: "PENDING" } }, include: { request: true } });
  let escalated = 0;
  let reminded = 0;
  const principal = await rootDb.role.findFirst({ where: { tenantId, key: "PRINCIPAL" } });
  for (const s of steps) {
    if (s.order !== s.request.currentStep) continue;
    const sla = slaState(s, now);
    if (sla.state === "OVERDUE") {
      // بلا جهة تصعيد محددة: مدير المدرسة
      const toRole = s.escalateToRoleId ?? (s.escalateToUserId ? null : (principal?.id ?? null));
      await rootDb.approvalStep.update({ where: { id: s.id }, data: { escalatedAt: now, escalateToRoleId: toRole, escalateToUserId: s.escalateToUserId } });
      const approvers = await approverUserIds(db, { approverRoleId: s.approverRoleId, approverUserId: s.approverUserId });
      const escalation = await approverUserIds(db, { approverRoleId: null, approverUserId: null, escalatedAt: now, escalateToRoleId: toRole, escalateToUserId: s.escalateToUserId });
      await notify(db, { tenantId, userIds: escalation.filter((u) => u !== s.request.requestedById), type: "APPROVAL", title: `تصعيد: ${s.request.title}`, body: `تجاوزت خطوة «${s.name}» مهلتها (${s.dueHours} ساعة) دون قرار، وأصبح بإمكانك البت فيها`, link: "/inbox?tab=approvals", entityType: "ApprovalRequest", entityId: s.requestId });
      await notify(db, { tenantId, userIds: approvers, type: "APPROVAL", title: `انقضت مهلة: ${s.request.title}`, body: `صُعِّد الطلب بعد تجاوز مهلة «${s.name}»`, link: "/inbox?tab=approvals", entityType: "ApprovalRequest", entityId: s.requestId });
      await writeAudit({ tenantId, actor: null }, { action: "ESCALATE", entityType: "ApprovalRequest", entityId: s.requestId, summary: `${s.request.title} — ${s.name} (بعد ${s.dueHours} ساعة)` });
      escalated++;
    } else if (sla.state === "DUE_SOON" && !s.remindedAt) {
      const approvers = await approverUserIds(db, { approverRoleId: s.approverRoleId, approverUserId: s.approverUserId });
      await notify(db, { tenantId, userIds: approvers, type: "APPROVAL", title: `تذكير: ${s.request.title}`, body: `تنتهي مهلة «${s.name}» خلال ${Math.max(1, sla.hoursLeft ?? 1)} ساعة ثم يُصعَّد الطلب`, link: "/inbox?tab=approvals", entityType: "ApprovalRequest", entityId: s.requestId });
      await rootDb.approvalStep.update({ where: { id: s.id }, data: { remindedAt: now } });
      reminded++;
    }
  }
  return { escalated, reminded };
}
