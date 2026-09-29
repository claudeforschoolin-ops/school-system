import { z } from "zod";
import * as accounting from "@/server/services/finance/accounting.service";
import * as banking from "@/server/services/finance/banking.service";
import * as billing from "@/server/services/finance/billing.service";
import * as collections from "@/server/services/finance/collections.service";
import * as reports from "@/server/services/finance/reports.service";
import { systemDatabaseId } from "@/server/services/system-db.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const minor = z.number().int().min(0).max(1_000_000_000_000);
const method = z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "SADAD"]);
const feeKind = z.enum(["TUITION", "REGISTRATION", "TRANSPORT", "ACTIVITY", "BOOKS", "UNIFORM", "MEALS", "LATE_FEE", "OTHER"]);
const draftLine = z.object({ feeItemId: id.nullable(), description: z.string().trim().max(200), unitMinor: minor, quantity: z.number().int().min(1).max(1000).optional() });
const range = z.object({ from: isoDate, to: isoDate });
const fileValue = z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500), size: z.number().optional(), mime: z.string().max(120).optional() });
const journalSource = z.enum(["MANUAL", "OPENING", "INVOICE", "CREDIT_NOTE", "RECEIPT", "RECEIPT_VOID", "CREDIT_APPLICATION", "REFUND", "PAYMENT_VOUCHER", "REVENUE_RECOGNITION", "CHEQUE", "CASH_SESSION", "BANK_TRANSFER", "WRITE_OFF", "CLOSING", "REVERSAL"]);
const bulk = z.object({ academicYearId: id, branchId: id.nullish(), gradeIds: z.array(id).max(40).optional(), sectionId: id.nullish(), feeItemIds: z.array(id).min(1).max(20), planId: id.nullable(), issueDate: isoDate, applyDiscounts: z.boolean() });

const setupRouter = router({
  get: authedProcedure.query(({ ctx }) => billing.feeSetup(ctx.db, ctx.session)),
  saveItem: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(120), kind: feeKind, revenueAccountId: id, receivableAccountId: id, deferred: z.boolean(), taxCodeId: id.nullable(), citizenTaxCodeId: id.nullable(), refundable: z.boolean(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const { id: itemId, ...rest } = input;
      return billing.saveFeeItem(ctx.db, ctx.session, itemId ?? null, rest);
    }),
  saveTax: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(120), rateBp: z.number().int().min(0).max(10000), kind: z.enum(["STANDARD", "ZERO", "EXEMPT", "OUT_OF_SCOPE"]), outputAccountId: id.nullable(), inputAccountId: id.nullable(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const { id: taxId, ...rest } = input;
      return billing.saveTaxCode(ctx.db, ctx.session, taxId ?? null, rest);
    }),
  saveSchedule: authedProcedure
    .input(z.object({ id: id.nullish(), academicYearId: id, name: z.string().trim().min(2).max(120), branchId: id.nullable(), stageId: id.nullable(), gradeId: id.nullable(), isActive: z.boolean(), lines: z.array(z.object({ feeItemId: id, amountMinor: minor, optional: z.boolean() })).max(30) }))
    .mutation(({ ctx, input }) => {
      const { id: sid, ...rest } = input;
      return billing.saveSchedule(ctx.db, ctx.session, sid ?? null, rest);
    }),
  savePlan: authedProcedure
    .input(z.object({ id: id.nullish(), name: z.string().trim().min(2).max(120), kind: z.enum(["SINGLE", "TERMLY", "MONTHLY", "CUSTOM"]), parts: z.array(z.object({ label: z.string().trim().min(1).max(60), weight: z.number().int().min(1).max(100), dueDate: isoDate })).min(1).max(12), lateFeeKind: z.enum(["NONE", "PERCENT", "FIXED"]), lateFeeValue: z.number().int().min(0).max(100_000_000), graceDays: z.number().int().min(0).max(120), isDefault: z.boolean(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const { id: pid, ...rest } = input;
      return billing.savePlan(ctx.db, ctx.session, pid ?? null, rest);
    }),
  saveDiscount: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(120), kind: z.enum(["SIBLING", "STAFF", "MERIT", "SCHOLARSHIP", "EARLY_PAYMENT", "MANUAL"]), method: z.enum(["PERCENT", "FIXED"]), value: z.number().int().min(0).max(100_000_000), siblingTiers: z.array(z.object({ order: z.number().int().min(2).max(10), valueBp: z.number().int().min(0).max(10000) })).max(8).nullable(), feeItemIds: z.array(id).max(20), approvalLimitMinor: minor.nullable(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const { id: did, ...rest } = input;
      return billing.saveDiscountType(ctx.db, ctx.session, did ?? null, rest);
    }),
  studentDiscounts: authedProcedure.input(z.object({ studentId: id })).query(async ({ ctx, input }) => {
    const { requireStaff } = await import("@/server/services/finance/common");
    requireStaff(ctx.session, "invoices", "view");
    const rows = await ctx.db.studentDiscount.findMany({ where: { studentId: input.studentId }, orderBy: { createdAt: "desc" } });
    const types = await ctx.db.discountType.findMany({ where: { id: { in: rows.map((r) => r.discountTypeId) } } });
    return rows.map((r) => ({ ...r, type: types.find((t) => t.id === r.discountTypeId) ?? null }));
  }),
  grantDiscount: authedProcedure.input(z.object({ studentId: id, discountTypeId: id, valueOverride: z.number().int().min(0).max(100_000_000).nullable(), note: z.string().max(300).nullable() })).mutation(({ ctx, input }) => billing.grantStudentDiscount(ctx.db, ctx.session, input)),
  revokeDiscount: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => billing.revokeStudentDiscount(ctx.db, ctx.session, input.id)),
});

const invoicesRouter = router({
  databaseId: authedProcedure.query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "invoices")),
  get: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => billing.getInvoice(ctx.db, ctx.session, input.id)),
  preview: authedProcedure.input(z.object({ studentId: id, lines: z.array(draftLine).max(30).optional(), feeItemIds: z.array(id).max(20).optional(), applyDiscounts: z.boolean().optional() })).query(({ ctx, input }) => billing.previewInvoice(ctx.db, ctx.session, input)),
  create: authedProcedure
    .input(z.object({ studentId: id, lines: z.array(draftLine).max(30).optional(), feeItemIds: z.array(id).max(20).optional(), planId: id.nullish(), issueDate: isoDate, dueDate: isoDate.nullish(), notes: z.string().max(500).nullish(), applyDiscounts: z.boolean().optional(), notify: z.boolean().optional() }))
    .mutation(({ ctx, input }) => billing.createInvoice(ctx.db, ctx.session, input)),
  bulkPreview: authedProcedure.input(bulk).query(({ ctx, input }) => billing.bulkPreview(ctx.db, ctx.session, input)),
  bulkIssue: authedProcedure.input(bulk.extend({ description: z.string().trim().min(3).max(200), notify: z.boolean() })).mutation(({ ctx, input }) => billing.bulkIssue(ctx.db, ctx.session, input)),
  cancel: authedProcedure.input(z.object({ id, reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => billing.cancelInvoice(ctx.db, ctx.session, input.id, input.reason)),
  creditNote: authedProcedure.input(z.object({ invoiceId: id, totalMinor: minor.min(1), reason: z.string().trim().min(3).max(300), kind: z.enum(["ADJUSTMENT", "DISCOUNT"]) })).mutation(({ ctx, input }) => billing.creditNote(ctx.db, ctx.session, input)),
  debitNote: authedProcedure.input(z.object({ invoiceId: id, lines: z.array(draftLine).min(1).max(10), reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => billing.debitNote(ctx.db, ctx.session, input)),
  sendReminders: authedProcedure.mutation(async ({ ctx }) => {
    const { requirePerm, todayIso } = await import("@/server/services/finance/common");
    const { runPaymentReminders } = await import("@/server/services/finance/reminders.service");
    requirePerm(ctx.session, "invoices", "update", "تذكيرات السداد من صلاحية المحاسبة");
    return runPaymentReminders(ctx.db, ctx.session.tenant, ctx.session.user.id, todayIso(ctx.session));
  }),
  applyLateFees: authedProcedure.input(z.object({ asOf: isoDate.optional() })).mutation(({ ctx, input }) => billing.applyLateFees(ctx.db, ctx.session, input.asOf)),
  pauseReminders: authedProcedure.input(z.object({ id, paused: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { requirePerm } = await import("@/server/services/finance/common");
    requirePerm(ctx.session, "invoices", "update");
    return ctx.db.invoice.update({ where: { id: input.id }, data: { remindersPaused: input.paused } });
  }),
  settlement: authedProcedure.input(z.object({ studentId: id, effectiveDate: isoDate })).query(({ ctx, input }) => billing.withdrawalSettlement(ctx.db, ctx.session, input.studentId, input.effectiveDate)),
  applySettlement: authedProcedure.input(z.object({ studentId: id, effectiveDate: isoDate, transferId: id.nullish() })).mutation(({ ctx, input }) => billing.applyWithdrawalSettlement(ctx.db, ctx.session, input)),
  forStudent: authedProcedure.input(z.object({ studentId: id })).query(async ({ ctx, input }) => {
    const { invoiceWhere, displayStatus, balanceOf, dateOnly, todayIso } = await import("@/server/services/finance/common");
    const where = await invoiceWhere(ctx.db, ctx.session, "view");
    const rows = await ctx.db.invoice.findMany({ where: { ...where, studentId: input.studentId, status: { not: "DRAFT" } }, include: { installments: true }, orderBy: { number: "desc" } });
    const today = dateOnly(todayIso(ctx.session));
    return rows.map((r) => ({ id: r.id, number: r.number, issueDate: r.issueDate, dueDate: r.dueDate, totalMinor: r.totalMinor, paidMinor: r.paidMinor, balanceMinor: r.status === "CANCELLED" ? 0 : balanceOf(r), status: displayStatus(r, today), source: r.source }));
  }),
});

const receiptsRouter = router({
  search: authedProcedure.input(z.object({ q: z.string().max(80) })).query(({ ctx, input }) => collections.searchPayers(ctx.db, ctx.session, input.q)),
  family: authedProcedure.input(z.object({ guardianId: id.nullish(), studentId: id.nullish() })).query(({ ctx, input }) => collections.familyAccount(ctx.db, ctx.session, input)),
  create: authedProcedure
    .input(z.object({ guardianId: id, studentId: id.nullish(), payerName: z.string().max(120).nullish(), amountMinor: minor.min(1), method, date: isoDate, reference: z.string().max(80).nullish(), bankAccountId: id.nullish(), chequeNumber: z.string().max(40).nullish(), chequeBank: z.string().max(80).nullish(), chequeDate: isoDate.nullish(), allocations: z.array(z.object({ invoiceId: id, amountMinor: minor })).max(50).optional(), notes: z.string().max(300).nullish(), notify: z.boolean().optional() }))
    .mutation(({ ctx, input }) => collections.createReceipt(ctx.db, ctx.session, input)),
  get: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => collections.getReceipt(ctx.db, ctx.session, input.id)),
  list: authedProcedure.input(z.object({ from: isoDate.optional(), to: isoDate.optional(), method: method.nullish(), q: z.string().max(80).nullish() })).query(({ ctx, input }) => collections.listReceipts(ctx.db, ctx.session, input)),
  void: authedProcedure.input(z.object({ id, reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => collections.voidReceipt(ctx.db, ctx.session, input.id, input.reason)),
  cheque: authedProcedure.input(z.object({ receiptId: id, action: z.enum(["CLEAR", "BOUNCE"]), bankAccountId: id.nullish(), date: isoDate, note: z.string().max(300).nullish() })).mutation(({ ctx, input }) => collections.chequeAction(ctx.db, ctx.session, input)),
  applyCredit: authedProcedure.input(z.object({ guardianId: id, amountMinor: minor.nullish() })).mutation(({ ctx, input }) => collections.applyCredit(ctx.db, ctx.session, input)),
  requestRefund: authedProcedure.input(z.object({ guardianId: id, amountMinor: minor.min(1), method, bankAccountId: id.nullish(), reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => collections.requestRefund(ctx.db, ctx.session, input)),
  payRefund: authedProcedure.input(z.object({ id, date: isoDate })).mutation(({ ctx, input }) => collections.payRefund(ctx.db, ctx.session, input.id, input.date)),
  refunds: authedProcedure.input(z.object({ guardianId: id })).query(({ ctx, input }) => collections.listRefunds(ctx.db, ctx.session, input.guardianId)),
  cashSession: authedProcedure.query(({ ctx }) => collections.currentCashSession(ctx.db, ctx.session)),
  openSession: authedProcedure.input(z.object({ openingFloatMinor: minor, branchId: id.nullish() })).mutation(({ ctx, input }) => collections.openCashSession(ctx.db, ctx.session, input)),
  closeSession: authedProcedure.input(z.object({ countedMinor: minor, note: z.string().max(300).nullish() })).mutation(({ ctx, input }) => collections.closeCashSession(ctx.db, ctx.session, input)),
});

const accountingRouter = router({
  chart: authedProcedure.input(z.object({ asOf: isoDate.optional() })).query(({ ctx, input }) => accounting.chartOfAccounts(ctx.db, ctx.session, input.asOf)),
  saveAccount: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(8), name: z.string().trim().min(2).max(120), parentId: id.nullable(), isGroup: z.boolean(), description: z.string().max(300).nullable(), cashFlowGroup: z.enum(["CASH", "OPERATING", "INVESTING", "FINANCING"]).nullable(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const { id: aid, ...rest } = input;
      return accounting.saveAccount(ctx.db, ctx.session, aid ?? null, rest);
    }),
  costCenters: authedProcedure.query(({ ctx }) => accounting.listCostCenters(ctx.db, ctx.session)),
  saveCostCenter: authedProcedure.input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(120), kind: z.enum(["BRANCH", "STAGE", "DEPARTMENT"]), isActive: z.boolean() })).mutation(({ ctx, input }) => {
    const { id: cid, ...rest } = input;
    return accounting.saveCostCenter(ctx.db, ctx.session, cid ?? null, rest);
  }),
  entries: authedProcedure.input(z.object({ from: isoDate.optional(), to: isoDate.optional(), source: journalSource.nullish(), q: z.string().max(80).nullish(), accountId: id.nullish(), cursor: z.number().int().nullish() })).query(({ ctx, input }) => accounting.listEntries(ctx.db, ctx.session, input)),
  entry: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => accounting.getEntry(ctx.db, ctx.session, input.id)),
  createEntry: authedProcedure
    .input(z.object({ date: isoDate, description: z.string().trim().min(3).max(300), reference: z.string().max(80).nullish(), lines: z.array(z.object({ accountId: id, debit: minor, credit: minor, costCenterId: id.nullish(), description: z.string().max(200).nullish() })).min(2).max(60), allowClosedPeriod: z.boolean().optional(), closedReason: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => accounting.createManualEntry(ctx.db, ctx.session, input)),
  reverse: authedProcedure.input(z.object({ id, reason: z.string().trim().min(3).max(300), date: isoDate.optional() })).mutation(({ ctx, input }) => accounting.reverseManualEntry(ctx.db, ctx.session, input.id, input.reason, input.date)),
  years: authedProcedure.query(({ ctx }) => accounting.listFiscalYears(ctx.db, ctx.session)),
  addYear: authedProcedure.input(z.object({ year: z.number().int().min(2000).max(2100) })).mutation(({ ctx, input }) => accounting.addFiscalYear(ctx.db, ctx.session, input.year)),
  checklist: authedProcedure.input(z.object({ periodId: id })).query(({ ctx, input }) => accounting.closeChecklist(ctx.db, ctx.session, input.periodId)),
  closePeriod: authedProcedure.input(z.object({ periodId: id, force: z.boolean().optional() })).mutation(({ ctx, input }) => accounting.closePeriod(ctx.db, ctx.session, input.periodId, input.force)),
  reopenPeriod: authedProcedure.input(z.object({ periodId: id, reason: z.string().trim().min(5).max(300) })).mutation(({ ctx, input }) => accounting.reopenPeriod(ctx.db, ctx.session, input.periodId, input.reason)),
  recognize: authedProcedure.input(z.object({ periodId: id })).mutation(({ ctx, input }) => accounting.runRevenueRecognition(ctx.db, ctx.session, input.periodId)),
  closeYear: authedProcedure.input(z.object({ fiscalYearId: id })).mutation(({ ctx, input }) => accounting.closeFiscalYear(ctx.db, ctx.session, input.fiscalYearId)),
});

const bankingRouter = router({
  accounts: authedProcedure.query(({ ctx }) => banking.listBankAccounts(ctx.db, ctx.session)),
  saveAccount: authedProcedure.input(z.object({ id: id.nullish(), name: z.string().trim().min(2).max(120), bankName: z.string().trim().min(2).max(120), iban: z.string().trim().max(40), branchId: id.nullish(), isActive: z.boolean() })).mutation(({ ctx, input }) => {
    const { id: bid, ...rest } = input;
    return banking.saveBankAccount(ctx.db, ctx.session, bid ?? null, rest);
  }),
  importStatement: authedProcedure.input(z.object({ bankAccountId: id, csv: z.string().min(10).max(2_000_000) })).mutation(({ ctx, input }) => banking.importStatement(ctx.db, ctx.session, input)),
  reconciliation: authedProcedure.input(z.object({ bankAccountId: id })).query(({ ctx, input }) => banking.reconciliation(ctx.db, ctx.session, input.bankAccountId)),
  match: authedProcedure.input(z.object({ statementLineId: id, journalLineId: id })).mutation(({ ctx, input }) => banking.matchLine(ctx.db, ctx.session, input)),
  unmatch: authedProcedure.input(z.object({ statementLineId: id })).mutation(({ ctx, input }) => banking.unmatchLine(ctx.db, ctx.session, input.statementLineId)),
  autoMatch: authedProcedure.input(z.object({ bankAccountId: id })).mutation(({ ctx, input }) => banking.autoMatch(ctx.db, ctx.session, input.bankAccountId)),
  postFromStatement: authedProcedure.input(z.object({ statementLineId: id, accountId: id, description: z.string().max(200).nullish() })).mutation(({ ctx, input }) => banking.postFromStatement(ctx.db, ctx.session, input)),
  transfer: authedProcedure.input(z.object({ fromAccountId: id, toAccountId: id, amountMinor: minor.min(1), date: isoDate, description: z.string().max(200) })).mutation(({ ctx, input }) => banking.transferFunds(ctx.db, ctx.session, input)),
  vouchersDatabaseId: authedProcedure.query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "vouchers")),
  voucher: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => banking.getVoucher(ctx.db, ctx.session, input.id)),
  createVoucher: authedProcedure
    .input(z.object({ date: isoDate, payee: z.string().trim().min(2).max(160), expenseAccountId: id, costCenterId: id.nullish(), method, bankAccountId: id.nullish(), amountMinor: minor.min(1), taxCodeId: id.nullish(), description: z.string().trim().min(3).max(500), attachments: z.array(fileValue).max(10).optional() }))
    .mutation(({ ctx, input }) => banking.createVoucher(ctx.db, ctx.session, input)),
  payVoucher: authedProcedure.input(z.object({ id, date: isoDate.optional() })).mutation(({ ctx, input }) => banking.payVoucher(ctx.db, ctx.session, input.id, input.date)),
  cancelVoucher: authedProcedure.input(z.object({ id, reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => banking.cancelVoucher(ctx.db, ctx.session, input.id, input.reason)),
});

const reportsRouter = router({
  dashboard: authedProcedure.query(({ ctx }) => reports.financeDashboard(ctx.db, ctx.session)),
  trialBalance: authedProcedure.input(range.extend({ costCenterId: id.nullish(), includeZero: z.boolean().optional() })).query(({ ctx, input }) => reports.trialBalance(ctx.db, ctx.session, input)),
  ledger: authedProcedure.input(range.extend({ accountId: id, costCenterId: id.nullish() })).query(({ ctx, input }) => reports.ledger(ctx.db, ctx.session, input)),
  incomeStatement: authedProcedure.input(range.extend({ compareFrom: isoDate.nullish(), compareTo: isoDate.nullish(), costCenterId: id.nullish() })).query(({ ctx, input }) => reports.incomeStatement(ctx.db, ctx.session, input)),
  incomeByBranch: authedProcedure.input(range).query(({ ctx, input }) => reports.incomeByBranch(ctx.db, ctx.session, input)),
  balanceSheet: authedProcedure.input(z.object({ asOf: isoDate })).query(({ ctx, input }) => reports.balanceSheet(ctx.db, ctx.session, input)),
  cashFlow: authedProcedure.input(range).query(({ ctx, input }) => reports.cashFlow(ctx.db, ctx.session, input)),
  aging: authedProcedure.input(z.object({ asOf: isoDate, branchId: id.nullish() })).query(({ ctx, input }) => reports.aging(ctx.db, ctx.session, input)),
  vat: authedProcedure.input(range).query(({ ctx, input }) => reports.vatReturn(ctx.db, ctx.session, input)),
  deferred: authedProcedure.input(z.object({ academicYearId: id.nullish() })).query(({ ctx, input }) => reports.deferredRevenue(ctx.db, ctx.session, input)),
  collections: authedProcedure.input(range).query(({ ctx, input }) => reports.collectionsReport(ctx.db, ctx.session, input)),
  discounts: authedProcedure.input(z.object({ academicYearId: id.nullish() })).query(({ ctx, input }) => reports.discountsReport(ctx.db, ctx.session, input)),
  dailyCash: authedProcedure.input(z.object({ date: isoDate })).query(({ ctx, input }) => reports.dailyCash(ctx.db, ctx.session, input)),
});

export const financeRouter = router({
  setup: setupRouter,
  invoices: invoicesRouter,
  receipts: receiptsRouter,
  accounting: accountingRouter,
  banking: bankingRouter,
  reports: reportsRouter,
});
