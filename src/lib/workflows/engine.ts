/**
 * مسارات الموافقة القابلة للتخصيص (نقي): أنواع الطلبات ومساراتها الافتراضية،
 * وتطبيق المسار على طلب (شروط المبلغ، المدير المباشر)، وحالة المهلة.
 */

export type ApproverKind = "ROLE" | "USER" | "MANAGER";

export interface Approver {
  kind: ApproverKind;
  roleKey?: string | null;
  userId?: string | null;
}

export interface WorkflowStep {
  key: string;
  name: string;
  approver: Approver;
  /** مهلة الخطوة بالساعات؛ بعدها يُصعَّد الطلب */
  dueHours?: number | null;
  /** جهة التصعيد (افتراضياً مدير المدرسة) */
  escalate?: Approver | null;
  /** تُطبَّق الخطوة فقط إن كان المبلغ ≥ هذا الحد */
  minAmountMinor?: number | null;
  /** تُطبَّق الخطوة فقط إن كان المبلغ ≤ هذا الحد */
  maxAmountMinor?: number | null;
}

export interface ApprovalTypeDef {
  key: string;
  label: string;
  description: string;
  /** وحدة الصلاحيات المالكة (لعرض الطلبات في المراقبة) */
  module: string;
  /** للطلب مبلغ تُقيَّم عليه الشروط */
  hasAmount: boolean;
  /** لمقدّم الطلب مدير مباشر معروف (موظف) */
  hasManager: boolean;
  defaultSteps: WorkflowStep[];
}

const role = (roleKey: string): Approver => ({ kind: "ROLE", roleKey });

export const APPROVAL_TYPES: ApprovalTypeDef[] = [
  { key: "purchase_request", label: "طلب شراء", description: "طلبات الشراء قبل إصدار أمر الشراء", module: "inventory", hasAmount: true, hasManager: false, defaultSteps: [{ key: "acc", name: "مراجعة المحاسب", approver: role("ACCOUNTANT") }, { key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL"), minAmountMinor: 1_000_000 }] },
  { key: "payment_voucher", label: "سند صرف", description: "سندات الصرف فوق حد الاعتماد", module: "expenses", hasAmount: true, hasManager: false, defaultSteps: [{ key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "finance_refund", label: "استرداد مبلغ", description: "إعادة مبالغ لأولياء الأمور", module: "collections", hasAmount: true, hasManager: false, defaultSteps: [{ key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "student_discount", label: "خصم استثنائي", description: "خصومات الطلاب التي تتطلب اعتماداً", module: "invoices", hasAmount: true, hasManager: false, defaultSteps: [{ key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "budget", label: "الموازنة السنوية", description: "اعتماد الموازنة قبل تفعيل الرقابة", module: "expenses", hasAmount: true, hasManager: false, defaultSteps: [{ key: "acc", name: "مراجعة المدير المالي", approver: role("ACCOUNTANT") }, { key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "staff_leave", label: "إجازة موظف", description: "طلبات إجازات الموظفين", module: "hr_attendance", hasAmount: false, hasManager: true, defaultSteps: [{ key: "mgr", name: "موافقة المدير المباشر", approver: { kind: "MANAGER" } }, { key: "hr", name: "اعتماد الموارد البشرية", approver: role("HR_MANAGER") }] },
  { key: "employee_loan", label: "سلفة موظف", description: "السلف المستقطعة من الراتب", module: "payroll", hasAmount: true, hasManager: true, defaultSteps: [{ key: "hr", name: "اعتماد الموارد البشرية", approver: role("HR_MANAGER") }] },
  { key: "payroll_run", label: "مسير الرواتب", description: "اعتماد المسير الشهري قبل القيد والصرف", module: "payroll", hasAmount: true, hasManager: false, defaultSteps: [{ key: "hr", name: "مراجعة الموارد البشرية", approver: role("HR_MANAGER") }, { key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "end_of_service", label: "مخالصة نهاية الخدمة", description: "تصفية مستحقات الموظف المغادر", module: "end_of_service", hasAmount: true, hasManager: false, defaultSteps: [{ key: "hr", name: "مراجعة مدير الموارد البشرية", approver: role("HR_MANAGER") }, { key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
  { key: "grade_change", label: "تعديل درجة معتمدة", description: "تعديل درجات بعد اعتمادها", module: "grade_entry", hasAmount: false, hasManager: false, defaultSteps: [{ key: "pr", name: "اعتماد مدير المدرسة", approver: role("PRINCIPAL") }] },
];

/** أنواع مساراتها مرتبطة بمنطق الوحدة (خطوة المخالصة المالية في التحويل) فلا تُخصَّص من المحرر */
export const FIXED_APPROVAL_TYPES = new Set(["student_transfer"]);

export const APPROVAL_TYPE_MAP = new Map(APPROVAL_TYPES.map((t) => [t.key, t]));

export interface ResolvedStep {
  name: string;
  approverRoleKey?: string;
  approverUserId?: string;
  dueHours?: number;
  escalateToRoleKey?: string;
  escalateToUserId?: string;
}

/**
 * يطبّق المسار على طلب: يُسقط الخطوات التي لا تنطبق على المبلغ، ويحوّل «المدير المباشر»
 * إلى مستخدم (وتُتجاوز إن لم يوجد مدير أو كان هو مقدّم الطلب).
 */
export function applyWorkflow(steps: WorkflowStep[], ctx: { amountMinor?: number | null; managerUserId?: string | null; requesterId: string }): ResolvedStep[] {
  const out: ResolvedStep[] = [];
  for (const s of steps) {
    const amount = ctx.amountMinor ?? null;
    if (s.minAmountMinor !== null && s.minAmountMinor !== undefined && (amount === null || amount < s.minAmountMinor)) continue;
    if (s.maxAmountMinor !== null && s.maxAmountMinor !== undefined && amount !== null && amount > s.maxAmountMinor) continue;
    const base: ResolvedStep = { name: s.name, ...(s.dueHours ? { dueHours: s.dueHours } : {}) };
    if (s.escalate?.kind === "ROLE" && s.escalate.roleKey) base.escalateToRoleKey = s.escalate.roleKey;
    if (s.escalate?.kind === "USER" && s.escalate.userId) base.escalateToUserId = s.escalate.userId;
    if (s.escalate?.kind === "MANAGER" && ctx.managerUserId && ctx.managerUserId !== ctx.requesterId) base.escalateToUserId = ctx.managerUserId;
    if (s.approver.kind === "ROLE" && s.approver.roleKey) out.push({ ...base, approverRoleKey: s.approver.roleKey });
    else if (s.approver.kind === "USER" && s.approver.userId) out.push({ ...base, approverUserId: s.approver.userId });
    else if (s.approver.kind === "MANAGER" && ctx.managerUserId && ctx.managerUserId !== ctx.requesterId) out.push({ ...base, approverUserId: ctx.managerUserId });
  }
  return out;
}

/** أخطاء التحقق من مسار قبل حفظه (فارغة = صالح) */
export function validateWorkflow(steps: WorkflowStep[], def: Pick<ApprovalTypeDef, "hasAmount" | "hasManager">): string[] {
  const errors: string[] = [];
  if (!steps.length) errors.push("المسار يحتاج خطوة واحدة على الأقل");
  if (steps.length > 8) errors.push("لا يزيد المسار عن ٨ خطوات");
  steps.forEach((s, i) => {
    const n = `الخطوة ${i + 1}`;
    if (s.name.trim().length < 2) errors.push(`${n}: الاسم مطلوب`);
    if (s.approver.kind === "ROLE" && !s.approver.roleKey) errors.push(`${n}: اختر الدور المعتمد`);
    if (s.approver.kind === "USER" && !s.approver.userId) errors.push(`${n}: اختر المستخدم المعتمد`);
    if (s.approver.kind === "MANAGER" && !def.hasManager) errors.push(`${n}: هذا النوع من الطلبات لا مدير مباشر لمقدّمه`);
    if (s.dueHours !== null && s.dueHours !== undefined && (s.dueHours < 1 || s.dueHours > 720)) errors.push(`${n}: المهلة بين ساعة و٧٢٠ ساعة`);
    if ((s.minAmountMinor || s.maxAmountMinor) && !def.hasAmount) errors.push(`${n}: شروط المبلغ غير متاحة لهذا النوع`);
    if (s.minAmountMinor && s.maxAmountMinor && s.minAmountMinor > s.maxAmountMinor) errors.push(`${n}: الحد الأدنى للمبلغ أكبر من الأعلى`);
  });
  // خطوة واحدة على الأقل تنطبق دائماً (بلا شروط مبلغ ولا مدير) ضماناً لوجود معتمد
  if (steps.length && !steps.some((s) => !s.minAmountMinor && !s.maxAmountMinor && s.approver.kind !== "MANAGER")) errors.push("اجعل خطوة واحدة على الأقل تنطبق على كل الطلبات (بلا شرط مبلغ وبمعتمد غير المدير المباشر)");
  return errors;
}

export type SlaState = "NO_SLA" | "ON_TIME" | "DUE_SOON" | "OVERDUE" | "ESCALATED";

export const SLA_LABEL: Record<SlaState, string> = { NO_SLA: "بلا مهلة", ON_TIME: "ضمن المهلة", DUE_SOON: "تقترب المهلة", OVERDUE: "متأخر", ESCALATED: "مُصعَّد" };

/** حالة المهلة: «تقترب» بعد مرور ٧٥٪ منها */
export function slaState(input: { activatedAt: Date | null; dueHours: number | null; escalatedAt: Date | null }, now: Date): { state: SlaState; dueAt: Date | null; hoursLeft: number | null } {
  if (input.escalatedAt) return { state: "ESCALATED", dueAt: input.activatedAt && input.dueHours ? new Date(input.activatedAt.getTime() + input.dueHours * 3_600_000) : null, hoursLeft: null };
  if (!input.dueHours || !input.activatedAt) return { state: "NO_SLA", dueAt: null, hoursLeft: null };
  const dueAt = new Date(input.activatedAt.getTime() + input.dueHours * 3_600_000);
  const left = (dueAt.getTime() - now.getTime()) / 3_600_000;
  if (left < 0) return { state: "OVERDUE", dueAt, hoursLeft: Math.floor(left) };
  if (left <= input.dueHours * 0.25) return { state: "DUE_SOON", dueAt, hoursLeft: Math.floor(left) };
  return { state: "ON_TIME", dueAt, hoursLeft: Math.floor(left) };
}
