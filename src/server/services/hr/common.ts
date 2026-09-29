/**
 * أدوات مشتركة للموارد البشرية: القواعد من الإعدادات، الصلاحيات (موظف موارد بشرية أم خدمة ذاتية)،
 * وملف الموظف المرتبط بحساب المستخدم، والتواريخ.
 */
import type { HrRules } from "@/lib/hr/calc";
import { toISODate } from "@/lib/dates";
import { resolveScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden, notFound } from "@/server/errors";
import { readModuleSettings } from "@/server/services/module-settings.service";

export function hrSettings(session: Pick<SessionData, "tenant">) {
  return readModuleSettings(session.tenant.settings, "hr");
}

export function hrRules(session: Pick<SessionData, "tenant">): HrRules {
  const s = hrSettings(session);
  return { gosiSaudiEmployeeBp: s.gosiSaudiEmployeeBp, gosiSaudiEmployerBp: s.gosiSaudiEmployerBp, gosiNonSaudiEmployerBp: s.gosiNonSaudiEmployerBp, gosiCapMinor: s.gosiCapMinor, deductAbsence: s.deductAbsence, deductLate: s.deductLate, lateMonthlyGraceMinutes: s.lateMonthlyGraceMinutes, overtimeRateBp: s.overtimeRateBp, monthDays: s.monthDays, eosFirstYearsMonthsBp: s.eosFirstYearsMonthsBp, eosLaterYearsMonthsBp: s.eosLaterYearsMonthsBp };
}

/** صلاحية موظف الموارد البشرية (المدرسة أو فرع)؛ نطاق «الخاص» وحده خدمة ذاتية لا تكفي */
export function isHrStaff(session: SessionData, module: string, action: Action) {
  const s = resolveScope(session.access, module, action);
  return Boolean(s && (s.kind === "all" || s.branchIds.length || s.stageIds.length));
}

export function requireHr(session: SessionData, module: string, action: Action, message?: string) {
  const s = resolveScope(session.access, module, action);
  if (!s || (s.kind === "limited" && !s.branchIds.length && !s.stageIds.length)) throw forbidden(message ?? "هذا الإجراء لموظفي الموارد البشرية");
  return s;
}

/** شرط الفروع لموظف موارد بشرية بنطاق فرع */
export function hrBranchWhere(session: SessionData, module: string, action: Action) {
  const s = requireHr(session, module, action);
  return s.kind === "all" ? {} : { OR: [{ branchId: { in: s.branchIds } }, { branchId: null }] };
}

/** ملف الموظف المرتبط بالمستخدم الحالي */
export async function myEmployee(db: TenantDb, session: SessionData) {
  return db.employee.findFirst({ where: { userId: session.user.id, deletedAt: null } });
}

export async function requireMyEmployee(db: TenantDb, session: SessionData) {
  const e = await myEmployee(db, session);
  if (!e) throw notFound("حسابك غير مرتبط بملف موظف؛ راجع الموارد البشرية");
  return e;
}

export const today = (session: Pick<SessionData, "tenant">) => toISODate(new Date(), session.tenant.timezone);
export const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** الأجر الشهري الثابت من العقد */
export const monthlyWage = (c: { basicMinor: number; housingMinor: number; transportMinor: number; otherAllowances: unknown }) => c.basicMinor + c.housingMinor + c.transportMinor + otherTotal(c.otherAllowances);
export const otherTotal = (json: unknown) => (Array.isArray(json) ? (json as Array<{ amountMinor?: number }>).reduce((s, a) => s + (Number.isSafeInteger(a.amountMinor) ? a.amountMinor! : 0), 0) : 0);

export const CATEGORY_ACCOUNT: Record<string, string> = { ACADEMIC: "key:SAL_ACADEMIC", ADMIN: "key:SAL_ADMIN", SERVICES: "key:SAL_SERVICES" };
