/**
 * تقييم الصلاحيات (منطق نقي قابل للاختبار دون قاعدة بيانات).
 * المستخدم قد يحمل عدة أدوار، وكل دور قد يكون مقيّداً بفرع أو مرحلة.
 * النطاق النهائي هو اتحاد نطاقات كل المنح المطابقة.
 */
import type { Action, Scope } from "./catalog";

export interface GrantRecord {
  module: string;
  action: string;
  scope: Scope;
}

export interface RoleAssignment {
  roleKey: string;
  roleName: string;
  branchId: string | null;
  stageId: string | null;
  grants: readonly GrantRecord[];
}

export interface AccessProfile {
  userId: string;
  assignments: readonly RoleAssignment[];
}

export type DataScope =
  | { kind: "all" }
  | { kind: "limited"; branchIds: string[]; stageIds: string[]; assigned: boolean; own: boolean };

export function resolveScope(profile: AccessProfile, module: string, action: Action): DataScope | null {
  const branchIds = new Set<string>();
  const stageIds = new Set<string>();
  let assigned = false;
  let own = false;
  let matched = false;

  for (const assignment of profile.assignments) {
    for (const g of assignment.grants) {
      if (g.module !== module || g.action !== action) continue;
      matched = true;
      switch (g.scope) {
        case "ALL":
          return { kind: "all" };
        case "BRANCH":
          // دور بنطاق فرع دون فرع محدد لا يمنح شيئاً (لا توسيع ضمني للصلاحية)
          if (assignment.branchId) branchIds.add(assignment.branchId);
          break;
        case "STAGE":
          if (assignment.stageId) stageIds.add(assignment.stageId);
          break;
        case "ASSIGNED":
          assigned = true;
          break;
        case "OWN":
          own = true;
          break;
      }
    }
  }

  if (!matched) return null;
  if (branchIds.size === 0 && stageIds.size === 0 && !assigned && !own) return null;
  return { kind: "limited", branchIds: [...branchIds], stageIds: [...stageIds], assigned, own };
}

export function can(profile: AccessProfile, module: string, action: Action): boolean {
  return resolveScope(profile, module, action) !== null;
}

/** هل يملك نطاقاً «واسعاً» (كل المدرسة أو فرع أو مرحلة) وليس فقط سجلاته/المسند إليه */
export function hasBroadScope(profile: AccessProfile, module: string, action: Action): boolean {
  const scope = resolveScope(profile, module, action);
  if (!scope) return false;
  if (scope.kind === "all") return true;
  return scope.branchIds.length > 0 || scope.stageIds.length > 0;
}

export interface ScopeFieldMap {
  /** اسم حقل الفرع في الكيان */
  branchField?: string;
  /** اسم حقل المرحلة في الكيان */
  stageField?: string;
  /** اسم حقل المالك/المنشئ في الكيان */
  ownerField?: string;
  /** شرط «المسند إليه» الخاص بالوحدة (فصول المعلم، أبناء ولي الأمر...) */
  assignedWhere?: Record<string, unknown>;
}

/** شرط لا يطابق أي سجل */
export const MATCH_NOTHING = { id: { in: [] as string[] } } as const;

/**
 * يحوّل نطاق البيانات إلى شرط Prisma يُضاف إلى الاستعلام.
 * يعيد undefined عندما لا يلزم أي تقييد (نطاق كل المدرسة).
 */
export function scopeWhere(
  scope: DataScope | null,
  fields: ScopeFieldMap,
  userId: string,
): Record<string, unknown> | undefined {
  if (!scope) return MATCH_NOTHING;
  if (scope.kind === "all") return undefined;
  const or: Record<string, unknown>[] = [];
  if (fields.branchField && scope.branchIds.length) or.push({ [fields.branchField]: { in: scope.branchIds } });
  if (fields.stageField && scope.stageIds.length) or.push({ [fields.stageField]: { in: scope.stageIds } });
  if (scope.assigned && fields.assignedWhere) or.push(fields.assignedWhere);
  if ((scope.own || scope.assigned) && fields.ownerField) or.push({ [fields.ownerField]: userId });
  if (or.length === 0) return MATCH_NOTHING;
  return or.length === 1 ? or[0] : { OR: or };
}

/** قائمة مختصرة بمفاتيح الصلاحيات المتاحة (لإرسالها للواجهة) */
export function flattenPermissions(profile: AccessProfile): Record<string, Scope> {
  const rank: Record<Scope, number> = { ALL: 5, BRANCH: 4, STAGE: 3, ASSIGNED: 2, OWN: 1 };
  const out: Record<string, Scope> = {};
  for (const a of profile.assignments) {
    for (const g of a.grants) {
      const key = `${g.module}:${g.action}`;
      const existing = out[key];
      if (!existing || rank[g.scope] > rank[existing]) out[key] = g.scope;
    }
  }
  return out;
}
