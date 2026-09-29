/**
 * أدوات مشتركة للوحدات المالية: الصلاحيات، نطاق الفواتير، إعدادات المالية، وتواريخ اليوم.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Action } from "@/lib/rbac/catalog";
import { resolveScope } from "@/lib/rbac/access";
import { toISODate } from "@/lib/dates";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden } from "@/server/errors";
import { readModuleSettings } from "@/server/services/module-settings.service";
import { studentWhere } from "@/server/services/student-scope";

export function requirePerm(session: SessionData, module: string, action: Action, message?: string) {
  const scope = resolveScope(session.access, module, action);
  if (!scope) throw forbidden(message ?? "ليست لديك صلاحية لهذا الإجراء المالي");
  return scope;
}

export function hasPerm(session: SessionData, module: string, action: Action) {
  return Boolean(resolveScope(session.access, module, action));
}

/**
 * صلاحية «موظف» على الوحدة: المدرسة كاملة أو فرع أو ما أنشأه. نطاق «المسند إليه» وحده (ولي الأمر)
 * لا يكفي للبحث في الأسر أو التحصيل أو الإعداد؛ ولي الأمر يرى حساب أسرته فقط عبر familyAccess.
 */
export function requireStaff(session: SessionData, module: string, action: Action, message?: string) {
  const scope = requirePerm(session, module, action, message);
  if (scope.kind === "limited" && !scope.branchIds.length && !scope.stageIds.length && !scope.own)
    throw forbidden(message ?? "هذا الإجراء لموظفي المالية");
  return scope;
}

export function isStaff(session: SessionData, module: string, action: Action) {
  const scope = resolveScope(session.access, module, action);
  return Boolean(
    scope && (scope.kind === "all" || scope.branchIds.length || scope.stageIds.length || scope.own),
  );
}

/** معرّفات أولياء الأمور المرتبطين بحساب المستخدم (لنطاق ولي الأمر) */
export async function ownGuardianIds(db: TenantDb, session: SessionData) {
  return (
    await db.guardian.findMany({ where: { userId: session.user.id, deletedAt: null }, select: { id: true } })
  ).map((g) => g.id);
}

/** الوصول لحساب أسرة: موظف المالية، أو ولي الأمر لأسرته فقط */
export async function assertFamilyAccess(db: TenantDb, session: SessionData, guardianId: string) {
  if (isStaff(session, "invoices", "view") || isStaff(session, "collections", "create")) return;
  if (!hasPerm(session, "invoices", "view")) throw forbidden();
  if (!(await ownGuardianIds(db, session)).includes(guardianId)) throw forbidden("تعرض كشف حساب أسرتك فقط");
}

/** نطاق الفواتير: المدرسة / الفرع / أبناء ولي الأمر */
export async function invoiceWhere(
  db: TenantDb,
  session: SessionData,
  action: Action = "view",
): Promise<Prisma.InvoiceWhereInput> {
  const scope = requirePerm(session, "invoices", action, "لا تملك صلاحية الاطلاع على الفواتير");
  if (scope.kind === "all") return { deletedAt: null };
  const or: Prisma.InvoiceWhereInput[] = [];
  if (scope.branchIds.length) or.push({ branchId: { in: scope.branchIds } });
  if (scope.assigned || scope.own || scope.stageIds.length) {
    const sw = await studentWhere(db, session, "invoices", action);
    if (sw) or.push({ student: sw });
  }
  return { deletedAt: null, ...(or.length ? { OR: or } : { id: { in: [] } }) };
}

export function financeSettings(session: Pick<SessionData, "tenant">) {
  return readModuleSettings(session.tenant.settings, "finance");
}

export function todayIso(session: Pick<SessionData, "tenant">) {
  return toISODate(new Date(), session.tenant.timezone);
}

export const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** حالة العرض للفاتورة (المتأخرة محسوبة من أقرب قسط غير مسدد) */
export function displayStatus(
  inv: {
    status: string;
    dueDate: Date;
    installments?: Array<{ dueDate: Date; amountMinor: number; paidMinor: number }>;
  },
  today: Date,
) {
  if (inv.status !== "ISSUED" && inv.status !== "PARTIAL")
    return inv.status as "DRAFT" | "PAID" | "CANCELLED" | "ISSUED" | "PARTIAL";
  const due = inv.installments?.length
    ? inv.installments.filter((i) => i.paidMinor < i.amountMinor).map((i) => i.dueDate)
    : [inv.dueDate];
  const earliest = due.sort((a, b) => a.getTime() - b.getTime())[0];
  return earliest && earliest < today ? ("OVERDUE" as const) : (inv.status as "ISSUED" | "PARTIAL");
}

export const balanceOf = (inv: { totalMinor: number; paidMinor: number; creditedMinor: number }) =>
  inv.totalMinor - inv.paidMinor - inv.creditedMinor;
