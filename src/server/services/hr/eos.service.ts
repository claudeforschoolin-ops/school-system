/**
 * نهاية الخدمة: احتساب المكافأة (حسب قواعد إعدادات الرواتب) وبدل رصيد الإجازة وراتب الأيام الأخيرة ناقص السلف،
 * بموافقة الموارد البشرية ثم المدير. الاعتماد يرحّل القيد (من المخصص أولاً) ويُنهي الخدمة:
 * إيقاف حساب الدخول وجلساته، وإعادة إسناد مهامه وفصوله وموافقاته المعلقة لمديره المباشر.
 */
import { eosAward, leaveEncashment, serviceDays, wageBy, WAGE_BASIS_LABEL, type EosReason } from "@/lib/hr/calc";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { accountByKey, postEntry, type Tx } from "@/server/services/finance/ledger";
import { nextNumber } from "@/server/services/sequence.service";
import { CATEGORY_ACCOUNT, dateOnly, hrRules, hrSettings, isoOf, money, monthlyWage, otherTotal, requireHr } from "./common";
import { ensurePayrollAccounts } from "./payroll.service";

export const EOS_REASON: Record<EosReason, string> = {
  RESIGNATION: "استقالة",
  TERMINATION: "إنهاء من صاحب العمل",
  CONTRACT_END: "انتهاء العقد",
  RETIREMENT: "تقاعد",
  DEATH: "وفاة",
  ARTICLE_80: "فصل تأديبي (دون مكافأة)",
};
export const EOS_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمدة — بانتظار الصرف", color: "navy" },
  PAID: { label: "مصروفة", color: "green" },
  CANCELLED: { label: "ملغاة", color: "red" },
};

/** احتساب التصفية دون حفظ */
export async function previewEos(db: TenantDb, session: SessionData, input: { employeeId: string; reason: EosReason; lastWorkingDay: string; otherDeductionsMinor?: number }) {
  requireHr(session, "end_of_service", "view");
  const e = await db.employee.findFirst({ where: { id: input.employeeId, deletedAt: null }, include: { contracts: { orderBy: { startDate: "desc" }, take: 1 } } });
  if (!e) throw notFound("الموظف غير موجود");
  const c = e.contracts[0];
  if (!c) throw badRequest("لا عقد للموظف");
  const hire = isoOf(e.hireDate)!;
  if (input.lastWorkingDay < hire) throw badRequest("آخر يوم عمل قبل تاريخ المباشرة");
  const rules = hrRules(session);
  const days = serviceDays(hire, input.lastWorkingDay);
  const wage = monthlyWage(c);
  const parts = { basicMinor: c.basicMinor, housingMinor: c.housingMinor, transportMinor: c.transportMinor, otherAllowancesMinor: otherTotal(c.otherAllowances) };
  const eosWage = wageBy(rules.eosWageBasis, parts);
  const eos = eosAward(eosWage, days, input.reason, rules);
  // رصيد الإجازة السنوية غير المستخدم (يُنشأ استحقاق السنة إن لم يُحتسب بعد)
  const year = Number(input.lastWorkingDay.slice(0, 4));
  const { balancesFor } = await import("./time.service");
  const annualId = (await balancesFor(db, session, e.id, year)).find((b) => b.type.code === "ANNUAL")?.balanceId;
  const bal = annualId ? await db.leaveBalance.findFirst({ where: { id: annualId } }) : null;
  // الاستحقاق النسبي للسنة الأخيرة: الأيام المستحقة حتى آخر يوم عمل
  const yearStart = `${year}-01-01`;
  const fromIso = hire > yearStart ? hire : yearStart;
  const accruedDays = bal ? Math.floor((bal.entitledDays * serviceDays(fromIso, input.lastWorkingDay)) / rules.eosYearDays) + bal.carriedDays + bal.adjustedDays : 0;
  const leaveDays = Math.max(0, accruedDays - (bal?.usedDays ?? 0));
  const leave = leaveEncashment(wageBy(hrSettings(session).leaveEncashmentBasis, parts), leaveDays, rules.monthDays);
  // راتب الأيام الأخيرة إن لم يشملها مسير معتمد
  const month = input.lastWorkingDay.slice(0, 7);
  const paid = await db.payrollLine.findFirst({ where: { employeeId: e.id, run: { month, status: { in: ["APPROVED", "PAID", "REVIEW"] } } } });
  const monthStart = `${month}-01`;
  const workedDays = paid ? 0 : serviceDays(hire > monthStart ? hire : monthStart, input.lastWorkingDay);
  const unpaid = workedDays ? Math.floor((wage * Math.min(workedDays, rules.monthDays) * 2 + rules.monthDays) / (rules.monthDays * 2)) : 0;
  const loans = await db.employeeLoan.findMany({ where: { employeeId: e.id, status: "ACTIVE", journalEntryId: { not: null } } });
  const loanBalance = loans.reduce((s, l) => s + l.amountMinor - l.repaidMinor, 0);
  const dues = eos.awardMinor + leave + unpaid;
  const other = Math.max(0, input.otherDeductionsMinor ?? 0);
  const loanDeducted = Math.min(loanBalance, dues);
  const otherDeducted = Math.min(other, dues - loanDeducted);
  const net = dues - loanDeducted - otherDeducted;
  return {
    employee: { id: e.id, fullName: e.fullName, hireDate: e.hireDate, category: e.category, status: e.status },
    serviceDays: days,
    wageMinor: eosWage,
    eos,
    leaveDays,
    leaveEncashmentMinor: leave,
    unpaidDays: workedDays,
    unpaidSalaryMinor: unpaid,
    loanBalanceMinor: loanBalance,
    loanDeductedMinor: loanDeducted,
    otherDeductionsMinor: otherDeducted,
    netMinor: net,
    remainingLoanMinor: loanBalance - loanDeducted,
    steps: [...eos.steps, `أجر المكافأة (${WAGE_BASIS_LABEL[rules.eosWageBasis]}): ${money(session, eosWage)}`, `رصيد الإجازة المستحق: ${leaveDays} يوماً`, workedDays ? `راتب ${workedDays} يوماً من الشهر الأخير` : "الشهر الأخير مشمول في مسير", ...(loanBalance ? [`سلف قائمة ${money(session, loanBalance)}${loanBalance > loanDeducted ? " (يتجاوز المستحقات؛ يبقى الفرق ذمة)" : ""}`] : [])],
  };
}

export async function createSettlement(db: TenantDb, session: SessionData, input: { employeeId: string; reason: EosReason; lastWorkingDay: string; otherDeductionsMinor?: number; notes?: string | null }) {
  requireHr(session, "end_of_service", "create");
  if (await db.endOfService.findFirst({ where: { employeeId: input.employeeId, status: { in: ["DRAFT", "APPROVED", "PAID"] } } })) throw badRequest("توجد تصفية لهذا الموظف");
  const p = await previewEos(db, session, input);
  if (p.employee.status === "TERMINATED") throw badRequest("انتهت خدمة الموظف مسبقاً");
  const eos = await db.endOfService.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "eos"),
      employeeId: p.employee.id,
      reason: input.reason,
      lastWorkingDay: dateOnly(input.lastWorkingDay),
      serviceDays: p.serviceDays,
      wageMinor: p.wageMinor,
      eosMinor: p.eos.awardMinor,
      leaveDays: p.leaveDays,
      leaveEncashmentMinor: p.leaveEncashmentMinor,
      unpaidSalaryMinor: p.unpaidSalaryMinor,
      loanBalanceMinor: p.loanDeductedMinor,
      otherDeductionsMinor: p.otherDeductionsMinor,
      netMinor: p.netMinor,
      calculation: { steps: p.steps, factorBp: p.eos.factorBp, fullMinor: p.eos.fullMinor, unpaidDays: p.unpaidDays, remainingLoanMinor: p.remainingLoanMinor },
      notes: input.notes ?? null,
      createdById: session.user.id,
    },
  });
  const approval = await createApprovalRequest(db, session, {
    type: "end_of_service",
    title: `تصفية نهاية خدمة ${p.employee.fullName} (${EOS_REASON[input.reason]}): صافي ${money(session, p.netMinor)}`,
    description: p.steps.join("\n"),
    entityType: "EndOfService",
    entityId: eos.id,
    link: `/hr/end-of-service/${eos.id}`,
    steps: [
      { name: "مراجعة مدير الموارد البشرية", approverRoleKey: "HR_MANAGER" },
      { name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" },
    ],
  });
  return db.endOfService.update({ where: { id: eos.id }, data: { approvalRequestId: approval.id } });
}

async function accountBalance(db: TenantDb, accountId: string) {
  const s = await db.journalLine.aggregate({ where: { accountId }, _sum: { debitMinor: true, creditMinor: true } });
  return Number(s._sum.creditMinor ?? 0n) - Number(s._sum.debitMinor ?? 0n);
}

/** الاعتماد: القيد ثم إنهاء الخدمة وإعادة الإسناد */
export async function onEosApproval(db: TenantDb, session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  const s = await db.endOfService.findFirst({ where: { id: request.entityId, status: "DRAFT" } });
  if (!s) return;
  if (event.decision === "REJECTED") {
    await db.endOfService.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
    return;
  }
  await ensurePayrollAccounts(db, s.tenantId);
  const e = await db.employee.findFirst({ where: { id: s.employeeId }, include: { department: { select: { category: true, costCenterId: true } } } });
  if (!e) return;
  const provision = Math.max(0, await accountBalance(db, await accountByKey(db, "EOS_PROVISION")));
  const fromProvision = Math.min(provision, s.eosMinor);
  const salaryAccount = CATEGORY_ACCOUNT[e.department?.category ?? e.category] ?? "key:SAL_ADMIN";
  const cc = e.department?.costCenterId ?? null;
  await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const entry = await postEntry(tx, session, {
      date: s.lastWorkingDay,
      description: `تصفية نهاية خدمة ${e.fullName}`,
      source: "END_OF_SERVICE",
      sourceType: "EndOfService",
      sourceId: s.id,
      reference: `تصفية ${s.number}`,
      lines: [
        { account: "key:EOS_PROVISION", debit: fromProvision, description: "من مخصص نهاية الخدمة" },
        { account: "key:EOS_EXPENSE", debit: s.eosMinor - fromProvision, costCenterId: cc, description: "ما يتجاوز المخصص" },
        { account: salaryAccount, debit: s.leaveEncashmentMinor + s.unpaidSalaryMinor, costCenterId: cc, description: "بدل الإجازة وراتب الأيام الأخيرة" },
        { account: "key:AR_STAFF", credit: s.loanBalanceMinor + s.otherDeductionsMinor, description: "استرداد السلف والذمم" },
        { account: "key:SALARIES_PAYABLE", credit: s.netMinor, description: "صافي المستحق للموظف" },
      ],
    });
    await tx.endOfService.update({ where: { id: s.id }, data: { status: "APPROVED", journalEntryId: entry.id } });
    // تسوية السلف المستقطعة
    let left = s.loanBalanceMinor;
    for (const loan of await tx.employeeLoan.findMany({ where: { employeeId: e.id, status: "ACTIVE", journalEntryId: { not: null } }, orderBy: { createdAt: "asc" } })) {
      const take = Math.min(left, loan.amountMinor - loan.repaidMinor);
      left -= take;
      await tx.employeeLoan.update({ where: { id: loan.id }, data: { repaidMinor: { increment: take }, ...(loan.repaidMinor + take >= loan.amountMinor ? { status: "SETTLED" } : {}) } });
    }
  });
  await offboard(db, session, { employeeId: e.id, lastWorkingDay: isoOf(s.lastWorkingDay)!, reason: EOS_REASON[s.reason as EosReason] ?? s.reason });
}

/**
 * إنهاء الخدمة إدارياً: حالة «منتهية خدمته»، إنهاء العقد، إيقاف حساب الدخول وإبطال جلساته،
 * وإعادة إسناد العمل للمدير المباشر (إسنادات التدريس، ريادة الفصول، خطوات الموافقة المعلقة، المهام).
 */
export async function offboard(db: TenantDb, session: SessionData, input: { employeeId: string; lastWorkingDay: string; reason: string }) {
  const e = await db.employee.findFirst({ where: { id: input.employeeId }, include: { manager: { select: { userId: true, fullName: true } } } });
  if (!e) throw notFound("الموظف غير موجود");
  const to = e.manager?.userId ?? null;
  const counts = { assignments: 0, homeroom: 0, approvals: 0, tasks: 0, sessions: 0 };
  await db.employee.update({ where: { id: e.id }, data: { status: "TERMINATED", terminationDate: dateOnly(input.lastWorkingDay), terminationReason: input.reason, updatedById: session.user.id } });
  await db.employmentContract.updateMany({ where: { employeeId: e.id, status: "ACTIVE" }, data: { status: "ENDED", endDate: dateOnly(input.lastWorkingDay) } });
  if (e.userId) {
    const uid = e.userId;
    await db.user.update({ where: { id: uid }, data: { status: "SUSPENDED" } });
    counts.sessions = (await rootDb.session.updateMany({ where: { tenantId: e.tenantId, userId: uid, revokedAt: null }, data: { revokedAt: new Date() } })).count;
    const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
    if (year && to) counts.assignments = (await db.teacherAssignment.updateMany({ where: { academicYearId: year.id, teacherId: uid }, data: { teacherId: to } })).count;
    if (year) counts.homeroom = (await db.section.updateMany({ where: { academicYearId: year.id, homeroomUserId: uid }, data: { homeroomUserId: to } })).count;
    if (to) counts.approvals = (await db.approvalStep.updateMany({ where: { approverUserId: uid, status: "PENDING" }, data: { approverUserId: to } })).count;
    // المهام: سجلات قواعد البيانات المسندة للمستخدم (خصائص «شخص»)
    const rows = await rootDb.$queryRaw<Array<{ id: string }>>`
      SELECT r.id FROM "DatabaseRow" r
      WHERE r."tenantId" = ${e.tenantId} AND r."deletedAt" IS NULL
        AND jsonb_path_exists(r."values", '$.*[*] ? (@ == $u)', jsonb_build_object('u', ${uid}::text))`;
    for (const { id } of rows) {
      const row = await db.databaseRow.findFirst({ where: { id } });
      if (!row) continue;
      const values = row.values as Record<string, unknown>;
      const next = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v.map((x) => (x === uid ? to : x)).filter((x) => x !== null))] : v]));
      await db.databaseRow.update({ where: { id }, data: { values: next as never } });
      counts.tasks += 1;
    }
  }
  await writeAudit({ tenantId: e.tenantId, actor: { id: session.user.id, name: session.user.name } }, { action: "UPDATE", entityType: "Employee", entityId: e.id, summary: `إنهاء خدمة ${e.fullName}: ${input.reason}. أُعيد إسناد ${counts.assignments} مادة و${counts.homeroom} ريادة و${counts.approvals} موافقة و${counts.tasks} مهمة${to ? ` إلى ${e.manager?.fullName}` : ""}، وأُوقف الحساب`, newValue: counts });
  return counts;
}

export async function payEos(db: TenantDb, session: SessionData, input: { id: string; bankAccountId: string; date: string }) {
  requireHr(session, "end_of_service", "approve", "صرف المستحقات لمدير الموارد البشرية");
  const s = await db.endOfService.findFirst({ where: { id: input.id } });
  if (!s) throw notFound("التصفية غير موجودة");
  if (s.status !== "APPROVED") throw badRequest("تُصرف التصفية المعتمدة فقط");
  const bank = await db.bankAccount.findFirst({ where: { id: input.bankAccountId, isActive: true } });
  if (!bank) throw notFound("الحساب البنكي غير موجود");
  const emp = await db.employee.findFirst({ where: { id: s.employeeId }, select: { fullName: true } });
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const e = s.netMinor ? await postEntry(tx, session, { date: input.date, description: `صرف مستحقات نهاية خدمة ${emp?.fullName ?? ""}`, source: "END_OF_SERVICE", sourceType: "EndOfService", sourceId: s.id, reference: `تصفية ${s.number}`, lines: [{ account: "key:SALARIES_PAYABLE", debit: s.netMinor }, { account: bank.accountId, credit: s.netMinor }] }) : null;
    return tx.endOfService.update({ where: { id: s.id }, data: { status: "PAID", paymentEntryId: e?.id ?? null } });
  });
}

export async function listSettlements(db: TenantDb, session: SessionData) {
  requireHr(session, "end_of_service", "view");
  const rows = await db.endOfService.findMany({ orderBy: { createdAt: "desc" } });
  const emps = await db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, fullName: true, number: true } });
  // المخصص المتراكم مقارنة بالالتزام الحالي لكل الموظفين النشطين
  const active = await db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" } }, include: { contracts: { where: { status: "ACTIVE" }, take: 1 } } });
  const t = new Date().toISOString().slice(0, 10);
  const liability = active.reduce((sum, e) => (e.contracts[0] ? sum + eosAward(monthlyWage(e.contracts[0]), serviceDays(isoOf(e.hireDate)!, t), "TERMINATION", hrRules(session)).awardMinor : sum), 0);
  let provision = 0;
  try {
    provision = await accountBalance(db, await accountByKey(db, "EOS_PROVISION"));
  } catch {
    provision = 0;
  }
  return { rows: rows.map((r) => ({ ...r, employee: emps.find((e) => e.id === r.employeeId)! })), liabilityMinor: liability, provisionMinor: provision, activeEmployees: active.length };
}

export async function getSettlement(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "end_of_service", "view");
  const s = await db.endOfService.findFirst({ where: { id } });
  if (!s) throw notFound("التصفية غير موجودة");
  const e = await db.employee.findFirst({ where: { id: s.employeeId }, select: { id: true, fullName: true, number: true, hireDate: true, status: true, terminationDate: true } });
  return { settlement: s, employee: e, calculation: s.calculation as { steps: string[]; factorBp: number; fullMinor: number; unpaidDays: number; remainingLoanMinor: number } };
}
