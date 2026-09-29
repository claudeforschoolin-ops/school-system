/**
 * المحاسبة العامة: دليل الحسابات بأرصدته، مراكز التكلفة، القيود اليدوية وعكسها، الفترات المحاسبية
 * وقائمة تحقق الإقفال، الاعتراف الشهري بالإيراد المؤجل، وإقفال السنة المالية.
 */
import type { AccountType, JournalSource, Prisma } from "@/generated/prisma/client";
import { recognizedToDate } from "@/lib/finance/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createFiscalYear } from "./defaults";
import { dateOnly, hasPerm, isoOf, requirePerm, todayIso } from "./common";
import { accountByKey, accountIds, n, postEntry, reverseEntry, type PostLine, type Tx } from "./ledger";

// =====================================================================
// دليل الحسابات
// =====================================================================

/** أرصدة كل الحسابات (مدين/دائن) حتى تاريخ، مع إمكانية فترة */
export async function balances(db: TenantDb, opts: { from?: Date; to?: Date; costCenterId?: string | null } = {}) {
  const dateFilter = opts.from || opts.to ? { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {};
  const rows = await db.journalLine.groupBy({
    by: ["accountId"],
    where: { entry: dateFilter, ...(opts.costCenterId ? { costCenterId: opts.costCenterId } : {}) },
    _sum: { debitMinor: true, creditMinor: true },
  });
  return new Map(rows.map((r) => [r.accountId, { debit: n(r._sum.debitMinor), credit: n(r._sum.creditMinor) }]));
}

export async function chartOfAccounts(db: TenantDb, session: SessionData, asOfIso?: string) {
  requirePerm(session, "accounting", "view", "لا تملك صلاحية المحاسبة العامة");
  const asOf = asOfIso ? dateOnly(asOfIso) : undefined;
  const [accounts, bal] = await Promise.all([db.account.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }), balances(db, { to: asOf })]);
  // الحسابات التجميعية تجمع أرصدة أبنائها
  const children = new Map<string | null, typeof accounts>();
  for (const a of accounts) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a]);
  const totals = new Map<string, { debit: number; credit: number }>();
  const walk = (id: string): { debit: number; credit: number } => {
    const own = bal.get(id) ?? { debit: 0, credit: 0 };
    const sum = (children.get(id) ?? []).reduce((acc, c) => {
      const t = walk(c.id);
      return { debit: acc.debit + t.debit, credit: acc.credit + t.credit };
    }, own);
    totals.set(id, sum);
    return sum;
  };
  for (const root of children.get(null) ?? []) walk(root.id);
  return {
    canEdit: hasPerm(session, "accounting", "update"),
    accounts: accounts.map((a) => {
      const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
      const balance = a.normalSide === "DEBIT" ? t.debit - t.credit : t.credit - t.debit;
      return { id: a.id, code: a.code, name: a.name, type: a.type, normalSide: a.normalSide, parentId: a.parentId, isGroup: a.isGroup, systemKey: a.systemKey, cashFlowGroup: a.cashFlowGroup, isActive: a.isActive, description: a.description, debit: t.debit, credit: t.credit, balance };
    }),
  };
}

export async function saveAccount(db: TenantDb, session: SessionData, id: string | null, input: { code: string; name: string; parentId: string | null; isGroup: boolean; description: string | null; cashFlowGroup: string | null; isActive: boolean }) {
  requirePerm(session, "accounting", "update", "تعديل دليل الحسابات من صلاحية المحاسب");
  const code = input.code.trim();
  if (!/^\d{1,8}$/.test(code)) throw badRequest("رمز الحساب أرقام فقط (حتى ٨)");
  const dup = await db.account.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw badRequest("يوجد حساب بالرمز نفسه");
  const parent = input.parentId ? await db.account.findFirst({ where: { id: input.parentId } }) : null;
  if (input.parentId && (!parent || !parent.isGroup)) throw badRequest("الحساب الأب يجب أن يكون تجميعياً");
  if (parent && !code.startsWith(parent.code)) throw badRequest(`رمز الحساب يبدأ برمز الأب (${parent.code})`);
  if (id) {
    const cur = await db.account.findFirst({ where: { id } });
    if (!cur) throw notFound();
    const used = await db.journalLine.count({ where: { accountId: id } });
    if (used && input.isGroup !== cur.isGroup) throw badRequest("لا يتحول حساب عليه حركات إلى تجميعي");
    if (!input.isActive && cur.systemKey) throw badRequest("حساب نظامي تستخدمه القيود الآلية؛ لا يُوقف");
    return db.account.update({ where: { id }, data: { code, name: input.name.trim(), parentId: input.parentId, isGroup: input.isGroup, description: input.description, cashFlowGroup: input.cashFlowGroup, isActive: input.isActive, updatedById: session.user.id } });
  }
  if (!parent) throw badRequest("اختر الحساب الأب");
  return db.account.create({
    data: { tenantId: session.tenant.id, code, name: input.name.trim(), type: parent.type as AccountType, normalSide: parent.type === "ASSET" || parent.type === "EXPENSE" ? "DEBIT" : "CREDIT", parentId: parent.id, isGroup: input.isGroup, description: input.description, cashFlowGroup: input.cashFlowGroup ?? parent.cashFlowGroup, createdById: session.user.id, updatedById: session.user.id },
  });
}

export async function listCostCenters(db: TenantDb, session: SessionData) {
  requirePerm(session, "accounting", "view");
  return db.costCenter.findMany({ orderBy: [{ kind: "asc" }, { code: "asc" }] });
}

export async function saveCostCenter(db: TenantDb, session: SessionData, id: string | null, input: { code: string; name: string; kind: string; isActive: boolean }) {
  requirePerm(session, "accounting", "update");
  if (id) return db.costCenter.update({ where: { id }, data: input });
  return db.costCenter.create({ data: { tenantId: session.tenant.id, ...input, code: input.code.trim().toUpperCase() } });
}

// =====================================================================
// القيود
// =====================================================================

export async function listEntries(db: TenantDb, session: SessionData, input: { from?: string; to?: string; source?: JournalSource | null; q?: string | null; accountId?: string | null; take?: number; cursor?: number | null }) {
  requirePerm(session, "accounting", "view");
  const q = input.q?.trim();
  const where: Prisma.JournalEntryWhereInput = {
    ...(input.from || input.to ? { date: { ...(input.from ? { gte: dateOnly(input.from) } : {}), ...(input.to ? { lte: dateOnly(input.to) } : {}) } } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.accountId ? { lines: { some: { accountId: input.accountId } } } : {}),
    ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { reference: { contains: q } }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] } : {}),
    ...(input.cursor ? { number: { lt: input.cursor } } : {}),
  };
  const take = input.take ?? 100;
  const rows = await db.journalEntry.findMany({ where, orderBy: { number: "desc" }, take: take + 1, include: { period: { select: { name: true, status: true } } } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } });
  return {
    rows: rows.slice(0, take).map((r) => ({ id: r.id, number: r.number, date: r.date, description: r.description, source: r.source, reference: r.reference, totalMinor: n(r.totalMinor), isReversed: r.isReversed, reversalOfId: r.reversalOfId, period: r.period.name, periodClosed: r.period.status === "CLOSED", postedInClosedPeriod: r.postedInClosedPeriod, createdBy: users.find((u) => u.id === r.createdById)?.name ?? null })),
    nextCursor: rows.length > take ? rows[take - 1]!.number : null,
  };
}

/** رابط المستند المصدر للقيد (للنزول من الرقم إلى المستند) */
export function sourceLink(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  switch (sourceType) {
    case "Invoice":
      return `/finance/invoices/${sourceId}`;
    case "Receipt":
      return `/finance/receipts/${sourceId}`;
    case "PaymentVoucher":
      return `/finance/vouchers/${sourceId}`;
    case "Guardian":
      return `/finance/families/${sourceId}`;
    default:
      return null;
  }
}

export async function getEntry(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "accounting", "view");
  const e = await db.journalEntry.findFirst({ where: { id }, include: { lines: { include: { account: { select: { code: true, name: true } } } }, period: { select: { name: true, status: true } } } });
  if (!e) throw notFound("القيد غير موجود");
  const [creator, reversal, original, centers, invoiceForCn] = await Promise.all([
    e.createdById ? db.user.findFirst({ where: { id: e.createdById }, select: { name: true } }) : null,
    e.isReversed ? db.journalEntry.findFirst({ where: { reversalOfId: e.id }, select: { id: true, number: true } }) : null,
    e.reversalOfId ? db.journalEntry.findFirst({ where: { id: e.reversalOfId }, select: { id: true, number: true } }) : null,
    db.costCenter.findMany({ select: { id: true, name: true } }),
    e.sourceType === "CreditNote" && e.sourceId ? db.creditNote.findFirst({ where: { id: e.sourceId }, select: { invoiceId: true } }) : null,
  ]);
  const studentIds = [...new Set(e.lines.map((l) => l.studentId).filter((x): x is string => Boolean(x)))];
  const students = studentIds.length ? await db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true } }) : [];
  return {
    id: e.id,
    number: e.number,
    date: e.date,
    description: e.description,
    source: e.source,
    reference: e.reference,
    period: e.period,
    totalMinor: n(e.totalMinor),
    isReversed: e.isReversed,
    postedInClosedPeriod: e.postedInClosedPeriod,
    createdBy: creator?.name ?? null,
    createdAt: e.createdAt,
    reversal,
    original,
    sourceLink: invoiceForCn ? `/finance/invoices/${invoiceForCn.invoiceId}` : sourceLink(e.sourceType, e.sourceId),
    canReverse: e.source === "MANUAL" && !e.isReversed && hasPerm(session, "accounting", "update"),
    lines: e.lines.map((l) => ({ id: l.id, accountId: l.accountId, code: l.account.code, name: l.account.name, debit: n(l.debitMinor), credit: n(l.creditMinor), costCenter: centers.find((c) => c.id === l.costCenterId)?.name ?? null, student: students.find((s) => s.id === l.studentId)?.fullName ?? null, description: l.description, reconciled: Boolean(l.statementLineId) })),
  };
}

export async function createManualEntry(db: TenantDb, session: SessionData, input: { date: string; description: string; reference?: string | null; lines: Array<{ accountId: string; debit: number; credit: number; costCenterId?: string | null; description?: string | null }>; allowClosedPeriod?: boolean; closedReason?: string | null }) {
  requirePerm(session, "accounting", "create", "القيود اليدوية من صلاحية المحاسب");
  if (input.allowClosedPeriod && !input.closedReason?.trim()) throw badRequest("اذكر سبب الترحيل في فترة مقفلة");
  const entry = await db.$transaction((tx) =>
    postEntry(tx as unknown as Tx, session, {
      date: input.date,
      description: input.description.trim(),
      reference: input.reference ?? null,
      source: "MANUAL",
      allowClosedPeriod: input.allowClosedPeriod,
      lines: input.lines.map((l) => ({ account: l.accountId, debit: l.debit, credit: l.credit, costCenterId: l.costCenterId ?? null, description: l.description ?? null })),
    }),
  );
  if (entry.postedInClosedPeriod) {
    await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "OVERRIDE", entityType: "JournalEntry", entityId: entry.id, summary: `ترحيل في فترة مقفلة: ${input.closedReason}` });
  }
  return entry;
}

export async function reverseManualEntry(db: TenantDb, session: SessionData, id: string, reason: string, date?: string) {
  requirePerm(session, "accounting", "update");
  const e = await db.journalEntry.findFirst({ where: { id } });
  if (!e) throw notFound();
  if (e.source !== "MANUAL") throw badRequest("القيود الآلية تُعكس من مستندها (إلغاء السند/الفاتورة)");
  return db.$transaction((tx) => reverseEntry(tx as unknown as Tx, session, id, { reason, date: date ?? todayIso(session) }));
}

// =====================================================================
// الفترات
// =====================================================================

export async function listFiscalYears(db: TenantDb, session: SessionData) {
  requirePerm(session, "accounting_periods", "view", "لا تملك صلاحية الفترات المحاسبية");
  const years = await db.fiscalYear.findMany({ orderBy: { startDate: "desc" }, include: { periods: { orderBy: { startDate: "asc" } } } });
  const counts = await db.journalEntry.groupBy({ by: ["periodId"], _count: { _all: true } });
  const users = await db.user.findMany({ where: { id: { in: years.flatMap((y) => y.periods.map((p) => p.closedById)).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
  return {
    canClose: hasPerm(session, "accounting_periods", "update"),
    canReopen: hasPerm(session, "accounting_periods", "approve"),
    years: years.map((y) => ({ ...y, periods: y.periods.map((p) => ({ ...p, entries: counts.find((c) => c.periodId === p.id)?._count._all ?? 0, closedBy: users.find((u) => u.id === p.closedById)?.name ?? null })) })),
  };
}

export async function addFiscalYear(db: TenantDb, session: SessionData, year: number) {
  requirePerm(session, "accounting_periods", "update");
  if (await db.fiscalYear.findFirst({ where: { startDate: new Date(Date.UTC(year, 0, 1)) } })) throw badRequest("العام المالي موجود");
  return createFiscalYear(db, session.tenant.id, year);
}

/** قائمة تحقق إقفال الفترة */
export async function closeChecklist(db: TenantDb, session: SessionData, periodId: string) {
  requirePerm(session, "accounting_periods", "view");
  const p = await db.fiscalPeriod.findFirst({ where: { id: periodId } });
  if (!p) throw notFound("الفترة غير موجودة");
  const [drafts, openSessions, pendingCheques, unmatched, recognition, pendingVouchers] = await Promise.all([
    db.invoice.count({ where: { status: "DRAFT", deletedAt: null, createdAt: { lte: new Date(p.endDate.getTime() + 86_400_000) } } }),
    db.cashSession.count({ where: { status: "OPEN", openedAt: { lte: new Date(p.endDate.getTime() + 86_400_000) } } }),
    db.receipt.count({ where: { chequeStatus: "PENDING", status: "POSTED", chequeDate: { lte: p.endDate } } }),
    db.bankStatementLine.count({ where: { matchedAt: null, date: { gte: p.startDate, lte: p.endDate } } }),
    revenueRecognitionPreview(db, p.endDate),
    db.paymentVoucher.count({ where: { status: "APPROVED", date: { lte: p.endDate }, deletedAt: null } }),
  ]);
  return {
    period: p,
    items: [
      { key: "drafts", label: "لا فواتير مسودة", ok: drafts === 0, detail: drafts ? `${drafts} مسودة` : null, blocking: false },
      { key: "recognition", label: "الاعتراف بالإيراد المؤجل للشهر", ok: recognition.total === 0, detail: recognition.total ? `مستحق الاعتراف: ${recognition.total} هللة` : null, blocking: true },
      { key: "cash", label: "إغلاق ورديات الصندوق", ok: openSessions === 0, detail: openSessions ? `${openSessions} وردية مفتوحة` : null, blocking: true },
      { key: "bank", label: "مطابقة كشوف البنك", ok: unmatched === 0, detail: unmatched ? `${unmatched} حركة غير مطابقة` : null, blocking: false },
      { key: "cheques", label: "متابعة الشيكات المستحقة", ok: pendingCheques === 0, detail: pendingCheques ? `${pendingCheques} شيك مستحق تحت التحصيل` : null, blocking: false },
      { key: "vouchers", label: "صرف سندات الصرف المعتمدة", ok: pendingVouchers === 0, detail: pendingVouchers ? `${pendingVouchers} سند معتمد لم يُصرف` : null, blocking: false },
    ],
  };
}

export async function closePeriod(db: TenantDb, session: SessionData, periodId: string, force = false) {
  requirePerm(session, "accounting_periods", "update", "إقفال الفترات من صلاحية المحاسب");
  const p = await db.fiscalPeriod.findFirst({ where: { id: periodId } });
  if (!p) throw notFound();
  if (p.status === "CLOSED") throw badRequest("الفترة مقفلة مسبقاً");
  const earlier = await db.fiscalPeriod.count({ where: { startDate: { lt: p.startDate }, status: "OPEN" } });
  if (earlier) throw badRequest("أقفل الفترات السابقة أولاً");
  const check = await closeChecklist(db, session, periodId);
  const blocking = check.items.filter((i) => i.blocking && !i.ok);
  if (blocking.length && !force) throw badRequest(`لا يمكن الإقفال: ${blocking.map((b) => b.label).join("، ")}`);
  return db.fiscalPeriod.update({ where: { id: periodId }, data: { status: "CLOSED", closedAt: new Date(), closedById: session.user.id } });
}

export async function reopenPeriod(db: TenantDb, session: SessionData, periodId: string, reason: string) {
  requirePerm(session, "accounting_periods", "approve", "إعادة فتح فترة مقفلة من صلاحية مدير المدرسة");
  const p = await db.fiscalPeriod.findFirst({ where: { id: periodId }, include: { fiscalYear: true } });
  if (!p) throw notFound();
  if (p.fiscalYear.status === "CLOSED") throw badRequest("السنة المالية مقفلة");
  const later = await db.fiscalPeriod.count({ where: { startDate: { gt: p.startDate }, status: "CLOSED" } });
  if (later) throw badRequest("أعد فتح الفترات اللاحقة أولاً");
  return db.fiscalPeriod.update({ where: { id: periodId }, data: { status: "OPEN", reopenReason: reason, closedAt: null } });
}

// =====================================================================
// الاعتراف بالإيراد المؤجل
// =====================================================================

async function recognitionDeltas(db: TenantDb | Tx, periodEnd: Date) {
  const lines = await db.invoiceLine.findMany({
    where: { deferred: true, serviceStart: { lte: periodEnd }, invoice: { status: { in: ["ISSUED", "PARTIAL", "PAID"] }, deletedAt: null, issueDate: { lte: periodEnd } } },
    select: { id: true, amountMinor: true, creditedMinor: true, recognizedMinor: true, serviceStart: true, serviceEnd: true, revenueAccountId: true, invoice: { select: { costCenterId: true } } },
  });
  const deltas: Array<{ lineId: string; revenueAccountId: string; costCenterId: string | null; delta: number; target: number }> = [];
  for (const l of lines) {
    const base = l.amountMinor - l.creditedMinor;
    const target = recognizedToDate(base, l.serviceStart!, l.serviceEnd!, periodEnd);
    const delta = target - l.recognizedMinor;
    if (delta !== 0) deltas.push({ lineId: l.id, revenueAccountId: l.revenueAccountId, costCenterId: l.invoice.costCenterId, delta, target });
  }
  return deltas;
}

export async function revenueRecognitionPreview(db: TenantDb, periodEnd: Date) {
  const deltas = await recognitionDeltas(db, periodEnd);
  const byAccount = new Map<string, number>();
  for (const d of deltas) byAccount.set(d.revenueAccountId, (byAccount.get(d.revenueAccountId) ?? 0) + d.delta);
  return { total: deltas.reduce((s, d) => s + d.delta, 0), lines: deltas.length, byAccount: [...byAccount.entries()].map(([accountId, amount]) => ({ accountId, amount })) };
}

/** قيد الاعتراف الشهري: مدين الإيراد المؤجل، دائن إيراد الرسوم (حسب المرحلة ومركز التكلفة) */
export async function runRevenueRecognition(db: TenantDb, session: SessionData, periodId: string) {
  requirePerm(session, "accounting", "create", "الاعتراف بالإيراد من صلاحية المحاسب");
  const p = await db.fiscalPeriod.findFirst({ where: { id: periodId } });
  if (!p) throw notFound("الفترة غير موجودة");
  return db.$transaction(
    async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      const deltas = await recognitionDeltas(tx, p.endDate);
      if (!deltas.length) return { posted: false, total: 0, entryId: null as string | null };
      const deferred = await accountByKey(tx, "DEFERRED_REVENUE");
      const groups = new Map<string, number>();
      for (const d of deltas) groups.set(`${d.revenueAccountId}|${d.costCenterId ?? ""}`, (groups.get(`${d.revenueAccountId}|${d.costCenterId ?? ""}`) ?? 0) + d.delta);
      const lines: PostLine[] = [];
      for (const [key, amount] of groups) {
        if (!amount) continue;
        const [acc, cc] = key.split("|") as [string, string];
        const costCenterId = cc || null;
        if (amount > 0) lines.push({ account: deferred, debit: amount, costCenterId }, { account: acc, credit: amount, costCenterId });
        else lines.push({ account: acc, debit: -amount, costCenterId }, { account: deferred, credit: -amount, costCenterId });
      }
      const total = deltas.reduce((s, d) => s + d.delta, 0);
      const entry = await postEntry(tx, session, { date: p.endDate, description: `الاعتراف بالإيراد المؤجل — ${p.name}`, source: "REVENUE_RECOGNITION", sourceType: "FiscalPeriod", sourceId: p.id, lines });
      for (const d of deltas) await tx.invoiceLine.update({ where: { id: d.lineId }, data: { recognizedMinor: d.target } });
      return { posted: true, total, entryId: entry.id };
    },
    { timeout: 120_000 },
  );
}

// =====================================================================
// إقفال السنة المالية
// =====================================================================

/** قيد الإقفال: تصفير الإيرادات والمصروفات إلى الأرباح المبقاة، ثم قفل السنة وإنشاء التالية */
export async function closeFiscalYear(db: TenantDb, session: SessionData, fiscalYearId: string) {
  requirePerm(session, "accounting_periods", "approve", "إقفال السنة المالية من صلاحية مدير المدرسة");
  const fy = await db.fiscalYear.findFirst({ where: { id: fiscalYearId }, include: { periods: { orderBy: { startDate: "asc" } } } });
  if (!fy) throw notFound();
  if (fy.status === "CLOSED") throw badRequest("السنة مقفلة مسبقاً");
  const open = fy.periods.filter((p) => p.status === "OPEN");
  if (open.length) throw badRequest(`أقفل كل الفترات أولاً (${open.length} مفتوحة)`);
  return db.$transaction(
    async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      const pl = await tx.account.findMany({ where: { type: { in: ["REVENUE", "EXPENSE"] }, isGroup: false } });
      const rows = await tx.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: pl.map((a) => a.id) }, entry: { date: { gte: fy.startDate, lte: fy.endDate } } }, _sum: { debitMinor: true, creditMinor: true } });
      const lines: PostLine[] = [];
      let net = 0; // صافي الربح (دائن)
      for (const r of rows) {
        const bal = n(r._sum.creditMinor) - n(r._sum.debitMinor);
        if (!bal) continue;
        net += bal;
        lines.push(bal > 0 ? { account: r.accountId, debit: bal } : { account: r.accountId, credit: -bal });
      }
      const retained = await accountByKey(tx, "RETAINED_EARNINGS");
      if (net > 0) lines.push({ account: retained, credit: net });
      else if (net < 0) lines.push({ account: retained, debit: -net });
      let entryId: string | null = null;
      if (lines.length >= 2) {
        const entry = await postEntry(tx, session, { date: fy.endDate, description: `قيد إقفال ${fy.name}`, source: "CLOSING", sourceType: "FiscalYear", sourceId: fy.id, lines, allowClosedPeriod: true });
        entryId = entry.id;
      }
      await tx.fiscalYear.update({ where: { id: fy.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: session.user.id, closingEntryId: entryId } });
      const nextYear = fy.endDate.getUTCFullYear() + 1;
      if (!(await tx.fiscalYear.findFirst({ where: { startDate: new Date(Date.UTC(nextYear, 0, 1)) } }))) await createFiscalYear(tx, session.tenant.id, nextYear);
      return { net, entryId };
    },
    { timeout: 120_000 },
  );
}

export { accountIds, isoOf, forbidden };
