/**
 * الرواتب: مسير شهري (مسودة ← مراجعة ← معتمد ← مصروف) يُحتسب من العقد والحضور والإجازات
 * والبنود المتغيرة والسلف، مع التأمينات الاجتماعية واستحقاق مخصص نهاية الخدمة.
 * الاعتماد يرحّل قيد الاستحقاق تلقائياً، والصرف يرحّل قيد البنك، ويُولَّد ملف حماية الأجور وقسائم الراتب.
 */
import { monthlyEosAccrual, salaryLine, serviceDays, type SalaryLine } from "@/lib/hr/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { notify } from "@/server/services/notifications.service";
import { nextNumber } from "@/server/services/sequence.service";
import { CATEGORY_ACCOUNT, dateOnly, hrRules, hrSettings, isHrStaff, isoOf, myEmployee, otherTotal, requireHr, today } from "./common";
import { monthSummary } from "./time.service";

export const RUN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "مسودة", color: "gray" },
  REVIEW: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمد — بانتظار الصرف", color: "navy" },
  PAID: { label: "مصروف", color: "green" },
  CANCELLED: { label: "ملغى", color: "red" },
};
export const ADJ_KIND: Record<string, { label: string; sign: 1 | -1 }> = {
  BONUS: { label: "مكافأة", sign: 1 },
  ALLOWANCE: { label: "بدل متغير", sign: 1 },
  OVERTIME: { label: "عمل إضافي (ساعات)", sign: 1 },
  PENALTY: { label: "جزاء", sign: -1 },
  DEDUCTION: { label: "استقطاع آخر", sign: -1 },
};

const monthRange = (month: string) => {
  const start = dateOnly(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end, days: end.getUTCDate() };
};

/** حسابات الرواتب النظامية (تُكمَّل في دليل حسابات قديم عند أول استخدام) */
export async function ensurePayrollAccounts(db: TenantDb, tenantId: string) {
  const byKey = async (key: string, code: string, name: string) => {
    if (await db.account.findFirst({ where: { systemKey: key, deletedAt: null } })) return;
    const existing = await db.account.findFirst({ where: { code, deletedAt: null } });
    if (existing) {
      await db.account.update({ where: { id: existing.id }, data: { systemKey: key } });
      return;
    }
    const parent = await db.account.findFirst({ where: { code: "6", deletedAt: null } });
    await db.account.create({ data: { tenantId, code, name, type: "EXPENSE", normalSide: "DEBIT", parentId: parent?.id ?? null, systemKey: key } });
  };
  await byKey("ALLOWANCES", "6201", "بدلات ومكافآت");
  await byKey("GOSI_EXPENSE", "6301", "تأمينات اجتماعية");
  await byKey("EOS_EXPENSE", "6202", "مكافأة نهاية الخدمة");
}

// ---------------------------------------------------------------------
// المسيرات
// ---------------------------------------------------------------------

export async function listRuns(db: TenantDb, session: SessionData) {
  requireHr(session, "payroll", "view");
  return db.payrollRun.findMany({ orderBy: { month: "desc" } });
}

export async function getRun(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "view");
  const run = await db.payrollRun.findFirst({ where: { id }, include: { lines: true } });
  if (!run) throw notFound("المسير غير موجود");
  const [employees, departments, bank, adjustments] = await Promise.all([
    db.employee.findMany({ where: { id: { in: run.lines.map((l) => l.employeeId) } }, select: { id: true, number: true, fullName: true, nationality: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
    run.bankAccountId ? db.bankAccount.findFirst({ where: { id: run.bankAccountId }, select: { name: true } }) : null,
    db.payrollAdjustment.findMany({ where: { month: run.month } }),
  ]);
  const lines = run.lines
    .map((l) => ({ ...l, employee: employees.find((e) => e.id === l.employeeId)!, department: departments.find((d) => d.id === l.departmentId)?.name ?? null }))
    .sort((a, b) => a.employee.number - b.employee.number);
  const sum = (k: keyof (typeof run.lines)[number]) => run.lines.reduce((s, l) => s + (l[k] as number), 0);
  const byDepartment = [...new Set(lines.map((l) => l.department ?? "بلا قسم"))].map((d) => {
    const ls = lines.filter((l) => (l.department ?? "بلا قسم") === d);
    return { name: d, employees: ls.length, grossMinor: ls.reduce((s, l) => s + l.grossMinor, 0), netMinor: ls.reduce((s, l) => s + l.netMinor, 0) };
  });
  return {
    run,
    lines,
    bank: bank?.name ?? null,
    totals: { basic: sum("basicMinor"), housing: sum("housingMinor"), transport: sum("transportMinor"), other: sum("otherAllowancesMinor"), overtime: sum("overtimeMinor"), bonus: sum("bonusMinor"), gross: sum("grossMinor"), gosiEmployee: sum("gosiEmployeeMinor"), gosiEmployer: sum("gosiEmployerMinor"), absence: sum("absenceMinor"), late: sum("lateMinor"), unpaid: sum("unpaidLeaveMinor"), loan: sum("loanMinor"), penalty: sum("penaltyMinor"), otherDeduction: sum("otherDeductionMinor"), deductions: sum("deductionsMinor"), net: sum("netMinor"), eos: sum("eosAccrualMinor") },
    byDepartment,
    adjustments: adjustments.length,
    missingIban: lines.filter((l) => !l.iban).map((l) => l.employee.fullName),
  };
}

/** بناء أسطر المسير لكل موظف نشط له عقد يغطي الشهر */
async function buildLines(db: TenantDb, session: SessionData, month: string) {
  const { start, end, days } = monthRange(month);
  const rules = hrRules(session);
  const accrue = hrSettings(session).accrueEosMonthly;
  const employees = await db.employee.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, hireDate: { lte: end } },
    include: { contracts: { where: { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, orderBy: { startDate: "desc" }, take: 1 }, department: { select: { category: true } } },
  });
  const withContract = employees.filter((e) => e.contracts.length);
  const [summary, adjustments, loans] = await Promise.all([
    monthSummary(db, month, withContract.map((e) => e.id)),
    db.payrollAdjustment.findMany({ where: { month, employeeId: { in: withContract.map((e) => e.id) } } }),
    db.employeeLoan.findMany({ where: { status: "ACTIVE", journalEntryId: { not: null }, startMonth: { lte: month }, employeeId: { in: withContract.map((e) => e.id) } } }),
  ]);
  const skipped = employees.filter((e) => !e.contracts.length).map((e) => e.fullName);
  const lines = withContract.map((e) => {
    const c = e.contracts[0]!;
    const s = summary.get(e.id) ?? { absentDays: 0, lateMinutes: 0, overtimeMinutes: 0, unpaidLeaveDays: 0, leaveDays: 0, presentDays: 0 };
    const adj = adjustments.filter((a) => a.employeeId === e.id);
    const sumKind = (k: string) => adj.filter((a) => a.kind === k).reduce((t, a) => t + a.amountMinor, 0);
    const overtimeHours = adj.filter((a) => a.kind === "OVERTIME").reduce((t, a) => t + (a.hours ?? 0), 0);
    const from = e.hireDate > start ? e.hireDate : start;
    const cEnd = c.endDate && c.endDate < end ? c.endDate : end;
    const paidDays = Math.round((cEnd.getTime() - from.getTime()) / 86_400_000) + 1;
    const loanDue = loans.filter((l) => l.employeeId === e.id).reduce((t, l) => t + Math.min(l.installmentMinor, l.amountMinor - l.repaidMinor), 0);
    const calc: SalaryLine = salaryLine(
      {
        basicMinor: c.basicMinor,
        housingMinor: c.housingMinor,
        transportMinor: c.transportMinor,
        otherAllowancesMinor: otherTotal(c.otherAllowances),
        hoursPerDay: c.hoursPerDay,
        saudi: e.nationality === "SA",
        gosiRegistered: e.gosiRegistered,
        paidDays: paidDays >= days ? undefined : Math.round((paidDays * rules.monthDays) / days),
        absentDays: s.absentDays,
        unpaidLeaveDays: s.unpaidLeaveDays,
        lateMinutes: s.lateMinutes,
        // الإضافي المعتمد: ساعات مدخلة يدوياً في البنود المتغيرة (سجلات البصمة للاسترشاد)
        overtimeMinutes: overtimeHours * 60,
        bonusMinor: sumKind("BONUS"),
        allowanceAdjMinor: sumKind("ALLOWANCE"),
        penaltyMinor: sumKind("PENALTY"),
        otherDeductionMinor: sumKind("DEDUCTION"),
        loanDueMinor: loanDue,
      },
      rules,
    );
    const wage = c.basicMinor + c.housingMinor + c.transportMinor + otherTotal(c.otherAllowances);
    const eos = accrue ? monthlyEosAccrual(wage, serviceDays(isoOf(e.hireDate)!, isoOf(end)!), rules) : 0;
    const { cappedMinor, notes, ...amounts } = calc;
    return {
      employeeId: e.id,
      departmentId: e.departmentId,
      category: e.department?.category ?? e.category,
      branchId: e.branchId,
      iban: e.iban,
      ...amounts,
      eosAccrualMinor: e.status === "SUSPENDED" ? 0 : eos,
      details: { contractId: c.id, paidDays, monthDays: days, attendance: s, recordedOvertimeMinutes: s.overtimeMinutes, adjustments: adj.map((a) => ({ kind: a.kind, amountMinor: a.amountMinor, hours: a.hours, description: a.description })), loanDueMinor: loanDue, cappedMinor, notes },
    };
  });
  return { lines, skipped };
}

export async function createRun(db: TenantDb, session: SessionData, input: { month: string; notes?: string | null }) {
  requireHr(session, "payroll", "create");
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw badRequest("الشهر بصيغة YYYY-MM");
  if (await db.payrollRun.findFirst({ where: { month: input.month, status: { not: "CANCELLED" } } })) throw badRequest("يوجد مسير لهذا الشهر");
  const cancelled = await db.payrollRun.findFirst({ where: { month: input.month, status: "CANCELLED" } });
  if (cancelled) await db.payrollRun.delete({ where: { id: cancelled.id } });
  const { start, end } = monthRange(input.month);
  const run = await db.payrollRun.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "payroll-run"), month: input.month, periodStart: start, periodEnd: end, notes: input.notes ?? null, createdById: session.user.id, updatedById: session.user.id } });
  const r = await recalcRun(db, session, run.id);
  return { ...run, skipped: r.skipped };
}

/** إعادة الاحتساب (المسودة فقط) بعد تعديل الحضور أو البنود المتغيرة */
export async function recalcRun(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "update");
  const run = await db.payrollRun.findFirst({ where: { id } });
  if (!run) throw notFound("المسير غير موجود");
  if (run.status !== "DRAFT") throw badRequest("يُعاد احتساب المسودة فقط");
  const { lines, skipped } = await buildLines(db, session, run.month);
  await db.$transaction(async (tx) => {
    await tx.payrollLine.deleteMany({ where: { runId: id } });
    await tx.payrollLine.createMany({ data: lines.map((l) => ({ tenantId: session.tenant.id, runId: id, ...l })) });
    await tx.payrollRun.update({ where: { id }, data: { employees: lines.length, grossMinor: lines.reduce((s, l) => s + l.grossMinor, 0), deductionsMinor: lines.reduce((s, l) => s + l.deductionsMinor, 0), netMinor: lines.reduce((s, l) => s + l.netMinor, 0), employerGosiMinor: lines.reduce((s, l) => s + l.gosiEmployerMinor, 0), eosAccrualMinor: lines.reduce((s, l) => s + l.eosAccrualMinor, 0), updatedById: session.user.id } });
    await tx.payrollAdjustment.updateMany({ where: { month: run.month }, data: { payrollRunId: id } });
  });
  return { employees: lines.length, skipped };
}

/** رفع المسير للاعتماد: مراجعة مدير الموارد البشرية ثم اعتماد المدير */
export async function submitRun(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "update");
  const run = await db.payrollRun.findFirst({ where: { id }, include: { lines: { select: { id: true } } } });
  if (!run) throw notFound("المسير غير موجود");
  if (run.status !== "DRAFT") throw badRequest("المسير ليس مسودة");
  if (!run.lines.length) throw badRequest("المسير فارغ");
  const approval = await createApprovalRequest(db, session, {
    type: "payroll_run",
    title: `مسير رواتب ${run.month}: ${run.employees} موظفاً`,
    description: `صافي ${(run.netMinor / 100).toFixed(2)} ر.س.`,
    entityType: "PayrollRun",
    entityId: run.id,
    link: `/hr/payroll/${run.id}`,
    steps: [
      { name: "مراجعة الموارد البشرية", approverRoleKey: "HR_MANAGER" },
      { name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" },
    ],
  });
  return db.payrollRun.update({ where: { id }, data: { status: "REVIEW", approvalRequestId: approval.id, updatedById: session.user.id } });
}

export async function cancelRun(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "update");
  const run = await db.payrollRun.findFirst({ where: { id } });
  if (!run) throw notFound("المسير غير موجود");
  if (run.status !== "DRAFT") throw badRequest("يُلغى المسير في مرحلة المسودة فقط");
  await db.payrollAdjustment.updateMany({ where: { payrollRunId: id }, data: { payrollRunId: null } });
  return db.payrollRun.update({ where: { id }, data: { status: "CANCELLED", updatedById: session.user.id } });
}

/** قرار الاعتماد: قيد الاستحقاق، وخصم أقساط السلف، وإشعار الموظفين بقسائمهم */
export async function onPayrollApproval(db: TenantDb, session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  const run = await db.payrollRun.findFirst({ where: { id: request.entityId, status: "REVIEW" }, include: { lines: true } });
  if (!run) return;
  if (event.decision === "REJECTED") {
    await db.payrollRun.update({ where: { id: run.id }, data: { status: "DRAFT", approvalRequestId: null } });
    return;
  }
  await ensurePayrollAccounts(db, run.tenantId);
  const departments = await db.department.findMany({ select: { id: true, costCenterId: true } });
  // تجميع حسب الفئة ومركز التكلفة (القسم وإلا الفرع)
  const groups = new Map<string, { category: string; costCenterId: string | null; salary: number; allowances: number; gosiEmployer: number; eos: number }>();
  for (const l of run.lines) {
    const cc = departments.find((d) => d.id === l.departmentId)?.costCenterId ?? (await branchCostCenter(db, run.tenantId, l.branchId));
    const key = `${l.category}|${cc ?? ""}`;
    const g = groups.get(key) ?? { category: l.category, costCenterId: cc ?? null, salary: 0, allowances: 0, gosiEmployer: 0, eos: 0 };
    g.salary += l.basicMinor + l.housingMinor + l.transportMinor + l.otherAllowancesMinor - l.absenceMinor - l.lateMinor - l.unpaidLeaveMinor - l.penaltyMinor - l.otherDeductionMinor;
    g.allowances += l.overtimeMinor + l.bonusMinor;
    g.gosiEmployer += l.gosiEmployerMinor;
    g.eos += l.eosAccrualMinor;
    groups.set(key, g);
  }
  const t = (k: "netMinor" | "gosiEmployeeMinor" | "gosiEmployerMinor" | "loanMinor" | "eosAccrualMinor") => run.lines.reduce((s, l) => s + l[k], 0);
  const debit = [...groups.values()].flatMap((g) => {
    const salaryLines = g.salary >= 0 ? [{ account: CATEGORY_ACCOUNT[g.category] ?? "key:SAL_ADMIN", debit: g.salary, costCenterId: g.costCenterId, description: "الرواتب والبدلات الثابتة بعد استقطاعات الحضور" }] : [{ account: CATEGORY_ACCOUNT[g.category] ?? "key:SAL_ADMIN", credit: -g.salary, costCenterId: g.costCenterId }];
    return [...salaryLines, { account: "key:ALLOWANCES", debit: g.allowances, costCenterId: g.costCenterId, description: "إضافي ومكافآت" }, { account: "key:GOSI_EXPENSE", debit: g.gosiEmployer, costCenterId: g.costCenterId, description: "حصة المنشأة في التأمينات" }, { account: "key:EOS_EXPENSE", debit: g.eos, costCenterId: g.costCenterId, description: "استحقاق مكافأة نهاية الخدمة" }];
  });
  const entry = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const e = await postEntry(tx, session, {
      date: run.periodEnd,
      description: `استحقاق رواتب شهر ${run.month}`,
      source: "PAYROLL",
      sourceType: "PayrollRun",
      sourceId: run.id,
      reference: `مسير ${run.number}`,
      lines: [
        ...debit,
        { account: "key:SALARIES_PAYABLE", credit: t("netMinor"), description: "صافي الرواتب المستحقة" },
        { account: "key:GOSI_PAYABLE", credit: t("gosiEmployeeMinor") + t("gosiEmployerMinor"), description: "التأمينات الاجتماعية المستحقة" },
        { account: "key:AR_STAFF", credit: t("loanMinor"), description: "أقساط السلف المستردة" },
        { account: "key:EOS_PROVISION", credit: t("eosAccrualMinor"), description: "مخصص نهاية الخدمة" },
      ],
    });
    // أقساط السلف
    for (const l of run.lines.filter((x) => x.loanMinor > 0)) {
      let left = l.loanMinor;
      const loans = await tx.employeeLoan.findMany({ where: { employeeId: l.employeeId, status: "ACTIVE", journalEntryId: { not: null } }, orderBy: { createdAt: "asc" } });
      for (const loan of loans) {
        if (!left) break;
        const take = Math.min(left, loan.installmentMinor, loan.amountMinor - loan.repaidMinor);
        left -= take;
        await tx.employeeLoan.update({ where: { id: loan.id }, data: { repaidMinor: { increment: take }, ...(loan.repaidMinor + take >= loan.amountMinor ? { status: "SETTLED" } : {}) } });
      }
    }
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: session.user.id, journalEntryId: e.id } });
    return e;
  });
  const users = await db.employee.findMany({ where: { id: { in: run.lines.map((l) => l.employeeId) }, userId: { not: null } }, select: { userId: true } });
  if (users.length) await notify(db, { tenantId: run.tenantId, userIds: users.map((u) => u.userId!), type: "SYSTEM", title: `قسيمة راتب ${run.month} متاحة`, link: "/hr/me", actorId: session.user.id, entityType: "PayrollRun", entityId: run.id });
  const accountants = await db.userRole.findMany({ where: { role: { key: "ACCOUNTANT" } }, select: { userId: true } });
  if (accountants.length) await notify(db, { tenantId: run.tenantId, userIds: accountants.map((a) => a.userId), type: "APPROVAL", title: `اعتُمد مسير ${run.month} — بانتظار الصرف`, body: `القيد ${entry.number}`, link: `/hr/payroll/${run.id}`, actorId: session.user.id, entityType: "PayrollRun", entityId: run.id });
}

/** صرف الرواتب: قيد البنك وإقفال المسير */
export async function payRun(db: TenantDb, session: SessionData, input: { id: string; bankAccountId: string; date: string }) {
  if (!isHrStaff(session, "payroll", "approve") && !isHrStaff(session, "banking", "create")) throw forbidden("الصرف لمدير الموارد البشرية أو المحاسب");
  const run = await db.payrollRun.findFirst({ where: { id: input.id } });
  if (!run) throw notFound("المسير غير موجود");
  if (run.status !== "APPROVED") throw badRequest("يُصرف المسير المعتمد فقط");
  if (input.date < isoOf(run.periodEnd)!.slice(0, 8) + "01") throw badRequest("تاريخ الصرف قبل شهر المسير");
  const bank = await db.bankAccount.findFirst({ where: { id: input.bankAccountId, isActive: true } });
  if (!bank) throw notFound("الحساب البنكي غير موجود");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const e = await postEntry(tx, session, { date: input.date, description: `صرف رواتب شهر ${run.month} عبر نظام حماية الأجور`, source: "PAYROLL_PAYMENT", sourceType: "PayrollRun", sourceId: run.id, reference: `مسير ${run.number}`, lines: [{ account: "key:SALARIES_PAYABLE", debit: run.netMinor }, { account: bank.accountId, credit: run.netMinor }] });
    return tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date(), bankAccountId: bank.id, paymentEntryId: e.id, updatedById: session.user.id } });
  });
}

/**
 * ملف حماية الأجور (CSV): صيغة عامة بحقول نظام «مدد»/البنوك (رقم الهوية، الاسم، الآيبان، رمز البنك،
 * الأساسي، السكن، البدلات الأخرى، الاستقطاعات، الصافي). تتطلب بعض البنوك صيغة SIF خاصة — راجع التقرير.
 */
export async function wpsFile(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "export");
  const d = await getRun(db, session, id);
  if (d.run.status !== "APPROVED" && d.run.status !== "PAID") throw badRequest("ملف الأجور للمسير المعتمد");
  const emps = await db.employee.findMany({ where: { id: { in: d.lines.map((l) => l.employeeId) } }, select: { id: true, nationalIdLast4: true, nationalIdEnc: true, idType: true } });
  const { revealId } = await import("@/server/pii");
  const amount = (m: number) => (m / 100).toFixed(2);
  const header = ["EmployeeID", "IDType", "EmployeeName", "IBAN", "BankCode", "BasicSalary", "HousingAllowance", "OtherEarnings", "Deductions", "NetSalary", "PaymentMonth"];
  const rows = d.lines.map((l) => {
    const e = emps.find((x) => x.id === l.employeeId);
    return [revealId(e?.nationalIdEnc) ?? "", e?.idType === "IQAMA" ? "I" : "N", l.employee.fullName, l.iban ?? "", l.iban ? l.iban.slice(4, 6) : "", amount(l.basicMinor), amount(l.housingMinor), amount(l.transportMinor + l.otherAllowancesMinor + l.overtimeMinor + l.bonusMinor), amount(l.deductionsMinor), amount(l.netMinor), d.run.month];
  });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return { filename: `WPS-${d.run.month}.csv`, content: [header, ...rows].map((r) => r.map(esc).join(",")).join("\n"), missingIban: d.missingIban };
}

/** قسيمة راتب: للموظف نفسه أو موظفي الرواتب */
export async function payslip(db: TenantDb, session: SessionData, lineId: string) {
  const line = await db.payrollLine.findFirst({ where: { id: lineId }, include: { run: true } });
  if (!line) throw notFound("القسيمة غير موجودة");
  const self = await myEmployee(db, session);
  if (self?.id !== line.employeeId) requireHr(session, "payroll", "view");
  if (self?.id === line.employeeId && !["APPROVED", "PAID"].includes(line.run.status)) throw forbidden("تتاح القسيمة بعد اعتماد المسير");
  const e = await db.employee.findFirst({ where: { id: line.employeeId }, include: { department: { select: { name: true } }, positionRef: { select: { title: true } } } });
  const tenant = await db.tenant.findFirst({ where: { id: session.tenant.id }, select: { name: true, logoUrl: true } });
  return { line, employee: { number: e?.number, fullName: e?.fullName, department: e?.department?.name ?? null, position: e?.positionRef?.title ?? null, iban: e?.iban ? `••••${e.iban.slice(-4)}` : null, hireDate: e?.hireDate }, school: tenant };
}

// ---------------------------------------------------------------------
// البنود المتغيرة والسلف
// ---------------------------------------------------------------------

export async function listAdjustments(db: TenantDb, session: SessionData, month: string) {
  requireHr(session, "payroll", "view");
  const rows = await db.payrollAdjustment.findMany({ where: { month }, orderBy: { createdAt: "desc" } });
  const emps = await db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, fullName: true, number: true } });
  return rows.map((r) => ({ ...r, employee: emps.find((e) => e.id === r.employeeId)! }));
}

async function assertMonthOpen(db: TenantDb, month: string) {
  const run = await db.payrollRun.findFirst({ where: { month, status: { in: ["REVIEW", "APPROVED", "PAID"] } } });
  if (run) throw badRequest(`مسير ${month} مرفوع للاعتماد أو معتمد؛ لا تُعدَّل بنوده`);
}

export async function saveAdjustment(db: TenantDb, session: SessionData, input: { id?: string | null; employeeId: string; month: string; kind: "BONUS" | "OVERTIME" | "PENALTY" | "DEDUCTION" | "ALLOWANCE"; amountMinor: number; hours: number | null; description: string }) {
  requireHr(session, "payroll", "update");
  await assertMonthOpen(db, input.month);
  if (input.kind === "OVERTIME" ? !input.hours || input.hours <= 0 : input.amountMinor <= 0) throw badRequest(input.kind === "OVERTIME" ? "عدد ساعات الإضافي مطلوب" : "المبلغ مطلوب");
  const data = { employeeId: input.employeeId, month: input.month, kind: input.kind, amountMinor: input.kind === "OVERTIME" ? 0 : input.amountMinor, hours: input.kind === "OVERTIME" ? input.hours : null, description: input.description.trim() };
  return input.id ? db.payrollAdjustment.update({ where: { id: input.id }, data }) : db.payrollAdjustment.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
}

export async function deleteAdjustment(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "payroll", "update");
  const a = await db.payrollAdjustment.findFirst({ where: { id } });
  if (!a) throw notFound("البند غير موجود");
  await assertMonthOpen(db, a.month);
  await db.payrollAdjustment.delete({ where: { id } });
  return { ok: true };
}

export async function listLoans(db: TenantDb, session: SessionData) {
  const self = await myEmployee(db, session);
  const hr = isHrStaff(session, "payroll", "view");
  if (!hr && !self) throw forbidden();
  const rows = await db.employeeLoan.findMany({ where: hr ? {} : { employeeId: self!.id }, include: { employee: { select: { id: true, fullName: true, number: true } } }, orderBy: { createdAt: "desc" } });
  return { hr, rows };
}

export async function requestLoan(db: TenantDb, session: SessionData, input: { employeeId?: string | null; amountMinor: number; installmentMinor: number; startMonth: string; reason: string }) {
  const self = await myEmployee(db, session);
  const employeeId = input.employeeId ?? self?.id;
  if (!employeeId) throw badRequest("حسابك غير مرتبط بملف موظف");
  if (employeeId !== self?.id) requireHr(session, "payroll", "create");
  const e = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null, status: "ACTIVE" }, include: { contracts: { where: { status: "ACTIVE" }, take: 1 } } });
  if (!e) throw notFound("الموظف غير موجود");
  if (input.installmentMinor <= 0 || input.installmentMinor > input.amountMinor) throw badRequest("القسط أكبر من صفر ولا يتجاوز المبلغ");
  const basic = e.contracts[0]?.basicMinor ?? 0;
  if (input.amountMinor > basic * 3) throw badRequest("السلفة لا تتجاوز ثلاثة رواتب أساسية");
  if (await db.employeeLoan.findFirst({ where: { employeeId: e.id, status: { in: ["PENDING", "ACTIVE"] } } })) throw badRequest("لدى الموظف سلفة قائمة");
  const loan = await db.employeeLoan.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "loan"), employeeId: e.id, amountMinor: input.amountMinor, installmentMinor: input.installmentMinor, startMonth: input.startMonth, reason: input.reason.trim(), createdById: session.user.id } });
  const approval = await createApprovalRequest(db, session, { type: "employee_loan", title: `سلفة ${e.fullName}: ${(input.amountMinor / 100).toFixed(2)} ر.س. على ${Math.ceil(input.amountMinor / input.installmentMinor)} أقساط`, description: input.reason, entityType: "EmployeeLoan", entityId: loan.id, link: "/hr/payroll/loans", steps: [{ name: "اعتماد مدير الموارد البشرية", approverRoleKey: "HR_MANAGER" }] });
  return db.employeeLoan.update({ where: { id: loan.id }, data: { approvalRequestId: approval.id } });
}

export async function onLoanApproval(db: TenantDb, _session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  await db.employeeLoan.updateMany({ where: { id: request.entityId, status: "PENDING" }, data: { status: event.decision === "APPROVED" ? "ACTIVE" : "REJECTED" } });
}

/** صرف السلفة المعتمدة: قيد ذمة الموظف مقابل البنك؛ تُستقطع أقساطها بعد الصرف فقط */
export async function disburseLoan(db: TenantDb, session: SessionData, input: { id: string; bankAccountId: string; date: string }) {
  requireHr(session, "payroll", "approve", "صرف السلف لمدير الموارد البشرية");
  const loan = await db.employeeLoan.findFirst({ where: { id: input.id }, include: { employee: { select: { fullName: true } } } });
  if (!loan) throw notFound("السلفة غير موجودة");
  if (loan.status !== "ACTIVE" || loan.journalEntryId) throw badRequest("السلفة غير معتمدة أو صُرفت");
  const bank = await db.bankAccount.findFirst({ where: { id: input.bankAccountId, isActive: true } });
  if (!bank) throw notFound("الحساب البنكي غير موجود");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const e = await postEntry(tx, session, { date: input.date, description: `صرف سلفة ${loan.employee.fullName}`, source: "STAFF_LOAN", sourceType: "EmployeeLoan", sourceId: loan.id, reference: `سلفة ${loan.number}`, lines: [{ account: "key:AR_STAFF", debit: loan.amountMinor }, { account: bank.accountId, credit: loan.amountMinor }] });
    return tx.employeeLoan.update({ where: { id: loan.id }, data: { journalEntryId: e.id } });
  });
}

export async function payrollOptions(db: TenantDb, session: SessionData) {
  requireHr(session, "payroll", "view");
  const [banks, employees] = await Promise.all([db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }), db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, number: true }, orderBy: { number: "asc" } })]);
  return { banks, employees, today: today(session) };
}
