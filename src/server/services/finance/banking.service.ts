/**
 * البنوك والمصروفات: الحسابات البنكية بأرصدتها، استيراد كشف الحساب (CSV)، المطابقة البنكية باقتراحات
 * (المبلغ + التاريخ ± ٣ أيام + المرجع) وتأكيد يدوي، التحويل بين الحسابات، ورسوم البنك من الكشف،
 * وسندات الصرف بموافقة المدير فوق حد الإعدادات.
 */
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { formatMoney, parseMoney } from "@/lib/money";
import { applyBp } from "@/lib/finance/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { nextNumber } from "@/server/services/sequence.service";
import { dateOnly, financeSettings, hasPerm, requirePerm, todayIso } from "./common";
import { accountBalance, accountByKey, n, postEntry, reverseEntry, type Tx } from "./ledger";

// =====================================================================
// الحسابات البنكية
// =====================================================================

export async function listBankAccounts(db: TenantDb, session: SessionData) {
  requirePerm(session, "banking", "view", "لا تملك صلاحية الحسابات البنكية");
  const banks = await db.bankAccount.findMany({ orderBy: { createdAt: "asc" } });
  const out = [];
  for (const b of banks) {
    const bal = await accountBalance(db, [b.accountId]);
    const [unmatched, lastImport] = await Promise.all([
      db.bankStatementLine.count({ where: { bankAccountId: b.id, matchedAt: null } }),
      db.bankStatementLine.findFirst({ where: { bankAccountId: b.id }, orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    const account = await db.account.findFirst({ where: { id: b.accountId }, select: { code: true, name: true } });
    out.push({ ...b, account, balanceMinor: bal.debit - bal.credit, unmatched, lastStatementDate: lastImport?.date ?? null });
  }
  const cashAccounts = await db.account.findMany({ where: { cashFlowGroup: "CASH", isGroup: false, id: { notIn: banks.map((b) => b.accountId) } }, select: { id: true, code: true, name: true } });
  const cash = [];
  for (const c of cashAccounts) {
    const bal = await accountBalance(db, [c.id]);
    cash.push({ ...c, balanceMinor: bal.debit - bal.credit });
  }
  return { banks: out, cash, canEdit: hasPerm(session, "banking", "update") };
}

export async function saveBankAccount(db: TenantDb, session: SessionData, id: string | null, input: { name: string; bankName: string; iban: string; accountId?: string | null; branchId?: string | null; isActive: boolean }) {
  requirePerm(session, "banking", "update", "إدارة الحسابات البنكية من صلاحية المحاسب");
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!/^SA\d{22}$/.test(iban)) throw badRequest("رقم الآيبان السعودي: SA متبوعاً بـ٢٢ رقماً");
  if (id) return db.bankAccount.update({ where: { id }, data: { name: input.name.trim(), bankName: input.bankName.trim(), iban, branchId: input.branchId ?? null, isActive: input.isActive } });
  let accountId = input.accountId ?? null;
  if (!accountId) {
    // حساب أستاذ جديد تحت «النقد وما في حكمه»
    const parent = await db.account.findFirst({ where: { code: "11", isGroup: true } });
    if (!parent) throw badRequest("مجموعة النقد (11) غير موجودة في الدليل");
    const siblings = await db.account.findMany({ where: { parentId: parent.id, code: { startsWith: "111" } }, select: { code: true } });
    const next = String(Math.max(1110, ...siblings.map((s) => Number(s.code))) + 1);
    const acc = await db.account.create({ data: { tenantId: session.tenant.id, code: next, name: `${input.bankName.trim()} — ${input.name.trim()}`, type: "ASSET", normalSide: "DEBIT", parentId: parent.id, cashFlowGroup: "CASH", createdById: session.user.id } });
    accountId = acc.id;
  }
  if (await db.bankAccount.findFirst({ where: { accountId } })) throw badRequest("حساب الأستاذ مرتبط بحساب بنكي آخر");
  return db.bankAccount.create({ data: { tenantId: session.tenant.id, name: input.name.trim(), bankName: input.bankName.trim(), iban, accountId, branchId: input.branchId ?? null, isActive: input.isActive } });
}

// =====================================================================
// كشف الحساب والمطابقة
// =====================================================================

/** تحليل CSV مرن: تاريخ، بيان، مرجع، ومبلغ (أو مدين/دائن) */
export function parseStatementCsv(text: string, currency: string) {
  const rows = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[,;\t](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim()));
  if (rows.length < 2) throw badRequest("الملف فارغ أو بلا بيانات");
  const header = rows[0]!.map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((nm) => h.includes(nm)));
  const iDate = col("date", "تاريخ");
  const iDesc = col("desc", "بيان", "وصف", "narration");
  const iRef = col("ref", "مرجع");
  const iAmount = col("amount", "مبلغ");
  const iDebit = col("debit", "مدين", "سحب", "withdraw");
  const iCredit = col("credit", "دائن", "إيداع", "deposit");
  if (iDate < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) throw badRequest("أعمدة مطلوبة: التاريخ، والمبلغ (أو مدين ودائن)");
  const money = (v: string | undefined) => (v && v.trim() ? parseMoney(v, currency) : 0);
  return rows.slice(1).map((r, i) => {
    const rawDate = r[iDate] ?? "";
    const m = rawDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) ?? rawDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) throw badRequest(`تاريخ غير صالح في السطر ${i + 2}`);
    const iso = m[1]!.length === 4 ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    const amount = iAmount >= 0 ? money(r[iAmount]) : money(r[iCredit]) - money(r[iDebit]);
    return { date: iso, description: (iDesc >= 0 ? r[iDesc] : "") || "حركة بنكية", reference: iRef >= 0 ? r[iRef] || null : null, amountMinor: amount };
  });
}

export async function importStatement(db: TenantDb, session: SessionData, input: { bankAccountId: string; csv: string }) {
  requirePerm(session, "banking", "create", "استيراد الكشوف من صلاحية المحاسب");
  const bank = await db.bankAccount.findFirst({ where: { id: input.bankAccountId } });
  if (!bank) throw notFound("الحساب البنكي غير موجود");
  const lines = parseStatementCsv(input.csv, session.tenant.currency).filter((l) => l.amountMinor !== 0);
  const batch = `imp-${Date.now()}`;
  // تجاهل المكرر (نفس التاريخ والمبلغ والمرجع)
  let created = 0;
  for (const l of lines) {
    const dup = await db.bankStatementLine.findFirst({ where: { bankAccountId: bank.id, date: dateOnly(l.date), amountMinor: l.amountMinor, reference: l.reference } });
    if (dup) continue;
    await db.bankStatementLine.create({ data: { tenantId: session.tenant.id, bankAccountId: bank.id, date: dateOnly(l.date), description: l.description, reference: l.reference, amountMinor: l.amountMinor, importBatch: batch } });
    created++;
  }
  return { created, skipped: lines.length - created };
}

export async function reconciliation(db: TenantDb, session: SessionData, bankAccountId: string) {
  requirePerm(session, "banking", "view");
  const bank = await db.bankAccount.findFirst({ where: { id: bankAccountId } });
  if (!bank) throw notFound();
  const [statement, ledger, bookBal] = await Promise.all([
    db.bankStatementLine.findMany({ where: { bankAccountId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.journalLine.findMany({ where: { accountId: bank.accountId }, include: { entry: { select: { id: true, number: true, date: true, description: true, reference: true, source: true, sourceType: true, sourceId: true } } }, orderBy: { entry: { date: "asc" } } }),
    accountBalance(db, [bank.accountId]),
  ]);
  const matchedLineIds = new Set(ledger.filter((l) => l.statementLineId).map((l) => l.statementLineId!));
  const unmatchedLedger = ledger.filter((l) => !l.statementLineId).map((l) => ({ id: l.id, date: l.entry.date, number: l.entry.number, entryId: l.entry.id, description: l.description ?? l.entry.description, reference: l.entry.reference, amountMinor: n(l.debitMinor) - n(l.creditMinor) }));
  const used = new Set<string>();
  const statementRows = statement.map((s) => {
    let suggestion: string | null = null;
    if (!s.matchedAt) {
      const cands = unmatchedLedger
        .filter((l) => !used.has(l.id) && l.amountMinor === s.amountMinor && Math.abs(l.date.getTime() - s.date.getTime()) <= 3 * 86_400_000)
        .sort((a, b) => Number(Boolean(b.reference && s.reference && s.reference.includes(b.reference))) - Number(Boolean(a.reference && s.reference && s.reference.includes(a.reference))) || Math.abs(a.date.getTime() - s.date.getTime()) - Math.abs(b.date.getTime() - s.date.getTime()));
      if (cands[0]) {
        suggestion = cands[0].id;
        used.add(cands[0].id);
      }
    }
    const matched = s.matchedAt ? ledger.find((l) => l.statementLineId === s.id) : null;
    return { ...s, matched: matched ? { lineId: matched.id, entryNumber: matched.entry.number, entryId: matched.entry.id } : null, suggestion };
  });
  const statementBalance = statement.reduce((a, s) => a + s.amountMinor, 0);
  // المقارنة على فترة الكشف المستورد فقط: حركة الدفاتر في الفترة مقابل حركة الكشف
  const from = statement[0]?.date ?? null;
  const to = statement.at(-1)?.date ?? null;
  const inPeriod = from && to ? ledger.filter((l) => l.entry.date >= from && l.entry.date <= to) : [];
  const bookMovement = inPeriod.reduce((a, l) => a + n(l.debitMinor) - n(l.creditMinor), 0);
  return {
    bank,
    bookBalance: bookBal.debit - bookBal.credit,
    statementBalance,
    period: from && to ? { from, to } : null,
    bookMovement,
    statement: statementRows,
    unmatchedLedger,
    matchedCount: matchedLineIds.size,
    canEdit: hasPerm(session, "banking", "update"),
  };
}

export async function matchLine(db: TenantDb, session: SessionData, input: { statementLineId: string; journalLineId: string }) {
  requirePerm(session, "banking", "update");
  const s = await db.bankStatementLine.findFirst({ where: { id: input.statementLineId }, include: { bankAccount: true } });
  const l = await db.journalLine.findFirst({ where: { id: input.journalLineId } });
  if (!s || !l) throw notFound();
  if (s.matchedAt || l.statementLineId) throw badRequest("مطابق مسبقاً");
  if (l.accountId !== s.bankAccount.accountId) throw badRequest("القيد ليس على حساب هذا البنك");
  if (n(l.debitMinor) - n(l.creditMinor) !== s.amountMinor) throw badRequest("المبلغان غير متساويين");
  await db.journalLine.update({ where: { id: l.id }, data: { statementLineId: s.id, reconciledAt: new Date() } });
  await db.bankStatementLine.update({ where: { id: s.id }, data: { matchedAt: new Date(), matchedById: session.user.id } });
  return { ok: true };
}

export async function unmatchLine(db: TenantDb, session: SessionData, statementLineId: string) {
  requirePerm(session, "banking", "update");
  const l = await db.journalLine.findFirst({ where: { statementLineId } });
  if (l) await db.journalLine.update({ where: { id: l.id }, data: { statementLineId: null, reconciledAt: null } });
  await db.bankStatementLine.update({ where: { id: statementLineId }, data: { matchedAt: null, matchedById: null } });
  return { ok: true };
}

export async function autoMatch(db: TenantDb, session: SessionData, bankAccountId: string) {
  const r = await reconciliation(db, session, bankAccountId);
  let matched = 0;
  for (const s of r.statement) {
    if (s.suggestion && !s.matchedAt) {
      await matchLine(db, session, { statementLineId: s.id, journalLineId: s.suggestion });
      matched++;
    }
  }
  return { matched };
}

/** حركة في الكشف غير مسجلة (رسوم بنكية، عمولة…) ← قيد ومطابقة مباشرة */
export async function postFromStatement(db: TenantDb, session: SessionData, input: { statementLineId: string; accountId: string; description?: string | null }) {
  requirePerm(session, "banking", "update");
  const s = await db.bankStatementLine.findFirst({ where: { id: input.statementLineId }, include: { bankAccount: true } });
  if (!s) throw notFound();
  if (s.matchedAt) throw badRequest("مطابق مسبقاً");
  const abs = Math.abs(s.amountMinor);
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const bankAcc = s.bankAccount.accountId;
    const entry = await postEntry(tx, session, {
      date: s.date,
      description: input.description?.trim() || s.description,
      source: "MANUAL",
      reference: s.reference,
      lines: s.amountMinor < 0 ? [{ account: input.accountId, debit: abs }, { account: bankAcc, credit: abs }] : [{ account: bankAcc, debit: abs }, { account: input.accountId, credit: abs }],
    });
    const line = await tx.journalLine.findFirstOrThrow({ where: { entryId: entry.id, accountId: bankAcc } });
    await tx.journalLine.update({ where: { id: line.id }, data: { statementLineId: s.id, reconciledAt: new Date() } });
    await tx.bankStatementLine.update({ where: { id: s.id }, data: { matchedAt: new Date(), matchedById: session.user.id } });
    return entry;
  });
}

/** تحويل بين حسابات النقد والبنوك */
export async function transferFunds(db: TenantDb, session: SessionData, input: { fromAccountId: string; toAccountId: string; amountMinor: number; date: string; description: string }) {
  requirePerm(session, "banking", "create");
  if (input.fromAccountId === input.toAccountId) throw badRequest("اختر حسابين مختلفين");
  const accs = await db.account.findMany({ where: { id: { in: [input.fromAccountId, input.toAccountId] }, cashFlowGroup: "CASH" } });
  if (accs.length !== 2) throw badRequest("التحويل بين حسابات النقد والبنوك فقط");
  const bal = await accountBalance(db, [input.fromAccountId]);
  if (bal.debit - bal.credit < input.amountMinor) throw badRequest("الرصيد غير كافٍ في الحساب المحوَّل منه");
  return db.$transaction((tx) =>
    postEntry(tx as unknown as Tx, session, { date: input.date, description: input.description || "تحويل بين الحسابات", source: "BANK_TRANSFER", lines: [{ account: input.toAccountId, debit: input.amountMinor }, { account: input.fromAccountId, credit: input.amountMinor }] }),
  );
}

// =====================================================================
// سندات الصرف
// =====================================================================

export interface VoucherInput {
  date: string;
  payee: string;
  expenseAccountId: string;
  costCenterId?: string | null;
  method: PaymentMethod;
  bankAccountId?: string | null;
  amountMinor: number;
  taxCodeId?: string | null;
  description: string;
  attachments?: Array<{ id: string; name: string; url: string; size?: number; mime?: string }>;
}

export async function createVoucher(db: TenantDb, session: SessionData, input: VoucherInput) {
  requirePerm(session, "expenses", "create", "سندات الصرف من صلاحية المحاسب");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw badRequest("مبلغ غير صالح");
  const acc = await db.account.findFirst({ where: { id: input.expenseAccountId, isGroup: false, isActive: true } });
  if (!acc) throw badRequest("حساب المصروف غير صالح");
  const tax = input.taxCodeId ? await db.taxCode.findFirst({ where: { id: input.taxCodeId } }) : null;
  const taxMinor = tax ? applyBp(input.amountMinor, tax.rateBp) : 0;
  const total = input.amountMinor + taxMinor;
  const limit = financeSettings(session).voucherApprovalLimitMinor;
  const needsApproval = total > limit;
  const ids = (input.attachments ?? []).map((a) => a.id);
  const files = ids.length ? await db.fileObject.findMany({ where: { id: { in: ids } } }) : [];
  const v = await db.paymentVoucher.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "voucher"),
      date: dateOnly(input.date),
      payee: input.payee.trim(),
      expenseAccountId: acc.id,
      costCenterId: input.costCenterId ?? null,
      method: input.method,
      bankAccountId: input.bankAccountId ?? null,
      amountMinor: input.amountMinor,
      taxCodeId: tax?.id ?? null,
      taxMinor,
      totalMinor: total,
      description: input.description.trim(),
      attachments: files.map((f) => ({ id: f.id, name: f.name, url: `/api/files/${f.id}`, size: f.size, mime: f.mime })) as Prisma.InputJsonValue,
      status: needsApproval ? "PENDING" : "APPROVED",
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  if (needsApproval) {
    const req = await createApprovalRequest(db, session, {
      type: "payment_voucher",
      title: `سند صرف ${v.number}: ${v.payee} — ${formatMoney(total, { currency: session.tenant.currency })}`,
      description: v.description,
      entityType: "PaymentVoucher",
      entityId: v.id,
      link: `/finance/vouchers/${v.id}`,
      steps: [{ name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" }],
    });
    return db.paymentVoucher.update({ where: { id: v.id }, data: { approvalRequestId: req.id } });
  }
  return v;
}

export async function onVoucherApproval(db: TenantDb, _session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  await db.paymentVoucher.updateMany({ where: { id: request.entityId, status: "PENDING" }, data: { status: event.decision === "APPROVED" ? "APPROVED" : "REJECTED" } });
}

/** صرف السند: مدين المصروف والضريبة المدخلة، دائن الصندوق/البنك */
export async function payVoucher(db: TenantDb, session: SessionData, id: string, date?: string) {
  requirePerm(session, "expenses", "update");
  const v = await db.paymentVoucher.findFirst({ where: { id, deletedAt: null } });
  if (!v) throw notFound("السند غير موجود");
  if (v.status !== "APPROVED") throw badRequest(v.status === "PENDING" ? "السند بانتظار اعتماد المدير" : "السند غير قابل للصرف");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let credit: string;
    if (v.method === "CASH") credit = await accountByKey(tx, "CASH");
    else {
      const bank = v.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: v.bankAccountId } }) : await tx.bankAccount.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
      credit = bank ? bank.accountId : await accountByKey(tx, "BANK_DEFAULT");
    }
    const tax = v.taxCodeId ? await tx.taxCode.findFirst({ where: { id: v.taxCodeId } }) : null;
    if (v.taxMinor && !tax?.inputAccountId) throw badRequest("رمز الضريبة بلا حساب مدخلات");
    const entry = await postEntry(tx, session, {
      date: date ?? todayIso(session),
      description: `سند صرف ${v.number}: ${v.payee} — ${v.description}`,
      source: "PAYMENT_VOUCHER",
      sourceType: "PaymentVoucher",
      sourceId: v.id,
      reference: String(v.number),
      lines: [
        { account: v.expenseAccountId, debit: v.amountMinor, costCenterId: v.costCenterId, description: v.description },
        ...(v.taxMinor ? [{ account: tax!.inputAccountId!, debit: v.taxMinor, costCenterId: v.costCenterId, description: "ضريبة مدخلات" }] : []),
        { account: credit, credit: v.totalMinor, costCenterId: v.costCenterId },
      ],
    });
    return tx.paymentVoucher.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), journalEntryId: entry.id, updatedById: session.user.id } });
  });
}

export async function cancelVoucher(db: TenantDb, session: SessionData, id: string, reason: string) {
  requirePerm(session, "expenses", "update");
  const v = await db.paymentVoucher.findFirst({ where: { id } });
  if (!v) throw notFound();
  if (v.status === "CANCELLED") throw badRequest("ملغى مسبقاً");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    if (v.journalEntryId) await reverseEntry(tx, session, v.journalEntryId, { reason: `إلغاء سند الصرف ${v.number}: ${reason}` });
    return tx.paymentVoucher.update({ where: { id }, data: { status: "CANCELLED", updatedById: session.user.id } });
  });
}

export async function getVoucher(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "expenses", "view", "لا تملك صلاحية المصروفات");
  const v = await db.paymentVoucher.findFirst({ where: { id, deletedAt: null } });
  if (!v) throw notFound("السند غير موجود");
  const [account, costCenter, bank, creator, entry, approval] = await Promise.all([
    db.account.findFirst({ where: { id: v.expenseAccountId }, select: { code: true, name: true } }),
    v.costCenterId ? db.costCenter.findFirst({ where: { id: v.costCenterId }, select: { name: true } }) : null,
    v.bankAccountId ? db.bankAccount.findFirst({ where: { id: v.bankAccountId }, select: { name: true } }) : null,
    v.createdById ? db.user.findFirst({ where: { id: v.createdById }, select: { name: true } }) : null,
    v.journalEntryId ? db.journalEntry.findFirst({ where: { id: v.journalEntryId }, select: { id: true, number: true } }) : null,
    v.approvalRequestId ? db.approvalRequest.findFirst({ where: { id: v.approvalRequestId }, include: { steps: { orderBy: { order: "asc" } } } }) : null,
  ]);
  return { ...v, attachments: (Array.isArray(v.attachments) ? v.attachments : []) as Array<{ id: string; name: string; url: string }>, account, costCenter: costCenter?.name ?? null, bank: bank?.name ?? null, createdBy: creator?.name ?? null, journalEntry: entry, approval, canPay: hasPerm(session, "expenses", "update") && v.status === "APPROVED", canCancel: hasPerm(session, "expenses", "update") && v.status !== "CANCELLED" };
}
