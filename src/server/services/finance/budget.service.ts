/**
 * الموازنة السنوية: حساب × مركز تكلفة × شهر، مع النسخ من موازنة سابقة بنسبة زيادة، والاعتماد بموافقة المدير،
 * و«الفعلي مقابل الموازنة» من القيود المرحّلة، والرقابة عند الصرف (تنبيه أو منع حسب الإعدادات).
 */
import { Prisma } from "@/generated/prisma/client";
import { budgetState, upliftBudget } from "@/lib/ops/calc";
import { formatNumber } from "@/lib/numbers";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { money, settingsOf } from "@/server/services/ops/common";
import { hasPerm, requirePerm } from "./common";

const monthsOf = (start: Date, end: Date) => {
  const out: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endKey = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key === endKey) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

export async function listBudgets(db: TenantDb, session: SessionData) {
  requirePerm(session, "expenses", "view");
  const [budgets, years] = await Promise.all([
    db.budget.findMany({ orderBy: { createdAt: "desc" }, include: { lines: { select: { amountMinor: true } } } }),
    db.fiscalYear.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, status: true } }),
  ]);
  return {
    budgets: budgets.map((b) => ({ id: b.id, name: b.name, status: b.status, fiscalYearId: b.fiscalYearId, fiscalYear: years.find((y) => y.id === b.fiscalYearId)?.name ?? "", totalMinor: b.lines.reduce((s, l) => s + l.amountMinor, 0), lines: b.lines.length, approvedAt: b.approvedAt, createdAt: b.createdAt })),
    years,
    canEdit: hasPerm(session, "expenses", "update"),
  };
}

export async function saveBudget(db: TenantDb, session: SessionData, input: { id?: string | null; fiscalYearId: string; name: string; notes?: string | null }) {
  requirePerm(session, "expenses", "update", "إعداد الموازنة من صلاحية المالية");
  const fy = await db.fiscalYear.findFirst({ where: { id: input.fiscalYearId } });
  if (!fy) throw notFound("العام المالي غير موجود");
  if (input.id) {
    const b = await db.budget.findFirst({ where: { id: input.id } });
    if (!b) throw notFound("الموازنة غير موجودة");
    if (b.status !== "DRAFT" && b.status !== "REJECTED") throw badRequest("تُعدَّل المسودة فقط");
    return db.budget.update({ where: { id: b.id }, data: { name: input.name.trim(), notes: input.notes ?? null } });
  }
  return db.budget.create({ data: { tenantId: session.tenant.id, fiscalYearId: fy.id, name: input.name.trim(), notes: input.notes ?? null, createdById: session.user.id } });
}

/** شبكة الموازنة: صفوف (حساب، مركز تكلفة) × أعمدة الأشهر، مع الفعلي لكل خلية */
export async function getBudget(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "expenses", "view");
  const b = await db.budget.findFirst({ where: { id }, include: { lines: true } });
  if (!b) throw notFound("الموازنة غير موجودة");
  const fy = await db.fiscalYear.findFirstOrThrow({ where: { id: b.fiscalYearId } });
  const months = monthsOf(fy.startDate, fy.endDate);
  const [accounts, costCenters, actual, approval] = await Promise.all([
    db.account.findMany({ where: { deletedAt: null, isGroup: false, type: { in: ["EXPENSE", "REVENUE"] } }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" } }),
    db.costCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    actuals(db, session.tenant.id, fy.startDate, fy.endDate),
    b.approvalRequestId ? db.approvalRequest.findFirst({ where: { id: b.approvalRequestId }, include: { steps: { orderBy: { order: "asc" } } } }) : null,
  ]);
  const rowKey = (a: string, c: string | null) => `${a}|${c ?? ""}`;
  const rows = new Map<string, { accountId: string; costCenterId: string | null; months: Record<string, number>; actual: Record<string, number> }>();
  for (const l of b.lines) {
    const k = rowKey(l.accountId, l.costCenterId);
    const r = rows.get(k) ?? { accountId: l.accountId, costCenterId: l.costCenterId, months: {}, actual: {} };
    r.months[l.month] = (r.months[l.month] ?? 0) + l.amountMinor;
    rows.set(k, r);
  }
  for (const r of rows.values()) {
    for (const a of actual.filter((x) => x.accountId === r.accountId && (r.costCenterId === null || x.costCenterId === r.costCenterId))) r.actual[a.month] = (r.actual[a.month] ?? 0) + a.amountMinor;
  }
  const warnBp = settingsOf(session, "finance").budgetWarnBp;
  return {
    budget: { id: b.id, name: b.name, status: b.status, notes: b.notes, fiscalYear: fy.name, fiscalYearId: fy.id, approvedAt: b.approvedAt },
    months,
    accounts,
    costCenters,
    rows: [...rows.values()].map((r) => {
      const acc = accounts.find((a) => a.id === r.accountId);
      const total = Object.values(r.months).reduce((s, v) => s + v, 0);
      const act = Object.values(r.actual).reduce((s, v) => s + v, 0);
      return { ...r, code: acc?.code ?? "", name: acc?.name ?? "", type: acc?.type ?? "EXPENSE", costCenter: costCenters.find((c) => c.id === r.costCenterId)?.name ?? null, totalMinor: total, actualMinor: act, ...budgetState(total, act, warnBp) };
    }).sort((x, y) => x.code.localeCompare(y.code)),
    warnBp,
    approval,
    canEdit: hasPerm(session, "expenses", "update") && (b.status === "DRAFT" || b.status === "REJECTED"),
  };
}

/** الفعلي من القيود: مدين−دائن للمصروفات، ودائن−مدين للإيرادات، حسب الشهر ومركز التكلفة */
async function actuals(db: TenantDb, tenantId: string, from: Date, to: Date) {
  const rows = await db.$queryRaw<Array<{ accountId: string; costCenterId: string | null; month: string; type: string; debit: bigint; credit: bigint }>>(Prisma.sql`
    SELECT l."accountId", l."costCenterId", to_char(e."date", 'YYYY-MM') AS month, a."type"::text AS type,
           SUM(l."debitMinor")::bigint AS debit, SUM(l."creditMinor")::bigint AS credit
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e.id = l."entryId"
    JOIN "Account" a ON a.id = l."accountId"
    WHERE l."tenantId" = ${tenantId} AND e."date" >= ${from} AND e."date" <= ${to} AND a."type" IN ('EXPENSE', 'REVENUE') AND e."source" <> 'CLOSING'
    GROUP BY 1, 2, 3, 4`);
  return rows.map((r) => ({ accountId: r.accountId, costCenterId: r.costCenterId, month: r.month, amountMinor: r.type === "REVENUE" ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit) }));
}

/** حفظ صف (حساب + مركز تكلفة) بمبالغ الأشهر */
export async function setBudgetRow(db: TenantDb, session: SessionData, input: { budgetId: string; accountId: string; costCenterId: string | null; months: Record<string, number>; previousCostCenterId?: string | null; remove?: boolean }) {
  requirePerm(session, "expenses", "update");
  const b = await db.budget.findFirst({ where: { id: input.budgetId } });
  if (!b) throw notFound("الموازنة غير موجودة");
  if (b.status !== "DRAFT" && b.status !== "REJECTED") throw badRequest("الموازنة المعتمدة أو المرفوعة لا تُعدَّل");
  const fy = await db.fiscalYear.findFirstOrThrow({ where: { id: b.fiscalYearId } });
  const valid = new Set(monthsOf(fy.startDate, fy.endDate));
  const acc = await db.account.findFirst({ where: { id: input.accountId, isGroup: false, type: { in: ["EXPENSE", "REVENUE"] } } });
  if (!acc) throw badRequest("اختر حساب مصروف أو إيراد تفصيلياً");
  for (const [m, v] of Object.entries(input.months)) {
    if (!valid.has(m)) throw badRequest(`الشهر ${m} خارج العام المالي`);
    if (!Number.isSafeInteger(v) || v < 0) throw badRequest("مبالغ الموازنة أعداد صحيحة غير سالبة");
  }
  await db.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({ where: { budgetId: b.id, accountId: acc.id, costCenterId: input.previousCostCenterId !== undefined ? input.previousCostCenterId : input.costCenterId } });
    if (input.remove) return;
    const data = Object.entries(input.months).filter(([, v]) => v > 0).map(([month, amountMinor]) => ({ tenantId: session.tenant.id, budgetId: b.id, accountId: acc.id, costCenterId: input.costCenterId, month, amountMinor }));
    if (data.length) await tx.budgetLine.createMany({ data });
  });
  return { ok: true };
}

/** نسخ موازنة (أو الفعلي) من عام سابق مع نسبة زيادة؛ الأشهر تُطابق بالترتيب */
export async function copyBudget(db: TenantDb, session: SessionData, input: { budgetId: string; source: { budgetId: string } | { actualFiscalYearId: string }; upliftBp: number }) {
  requirePerm(session, "expenses", "update");
  const b = await db.budget.findFirst({ where: { id: input.budgetId } });
  if (!b) throw notFound("الموازنة غير موجودة");
  if (b.status !== "DRAFT" && b.status !== "REJECTED") throw badRequest("تُعدَّل المسودة فقط");
  const fy = await db.fiscalYear.findFirstOrThrow({ where: { id: b.fiscalYearId } });
  const target = monthsOf(fy.startDate, fy.endDate);
  let src: Array<{ accountId: string; costCenterId: string | null; month: string; amountMinor: number }>;
  let srcMonths: string[];
  if ("budgetId" in input.source) {
    const s = await db.budget.findFirst({ where: { id: input.source.budgetId }, include: { lines: true } });
    if (!s) throw notFound("الموازنة المصدر غير موجودة");
    const sfy = await db.fiscalYear.findFirstOrThrow({ where: { id: s.fiscalYearId } });
    srcMonths = monthsOf(sfy.startDate, sfy.endDate);
    src = s.lines;
  } else {
    const sfy = await db.fiscalYear.findFirst({ where: { id: input.source.actualFiscalYearId } });
    if (!sfy) throw notFound("العام المالي المصدر غير موجود");
    srcMonths = monthsOf(sfy.startDate, sfy.endDate);
    src = (await actuals(db, session.tenant.id, sfy.startDate, sfy.endDate)).filter((a) => a.amountMinor > 0);
  }
  const merged = new Map<string, { accountId: string; costCenterId: string | null; month: string; amountMinor: number }>();
  for (const l of src) {
    const idx = srcMonths.indexOf(l.month);
    const month = target[idx];
    if (idx < 0 || !month) continue;
    const k = `${l.accountId}|${l.costCenterId ?? ""}|${month}`;
    const cur = merged.get(k);
    merged.set(k, { accountId: l.accountId, costCenterId: l.costCenterId, month, amountMinor: (cur?.amountMinor ?? 0) + upliftBudget(l.amountMinor, input.upliftBp) });
  }
  await db.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({ where: { budgetId: b.id } });
    if (merged.size) await tx.budgetLine.createMany({ data: [...merged.values()].map((l) => ({ tenantId: session.tenant.id, budgetId: b.id, ...l })) });
  });
  return { lines: merged.size };
}

export async function submitBudget(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "expenses", "update");
  const b = await db.budget.findFirst({ where: { id }, include: { lines: { select: { amountMinor: true } } } });
  if (!b) throw notFound("الموازنة غير موجودة");
  if (b.status !== "DRAFT" && b.status !== "REJECTED") throw badRequest("الموازنة مرفوعة مسبقاً");
  if (!b.lines.length) throw badRequest("الموازنة فارغة");
  const total = b.lines.reduce((s, l) => s + l.amountMinor, 0);
  const req = await createApprovalRequest(db, session, {
    type: "budget",
    title: `اعتماد الموازنة: ${b.name}`,
    description: `إجمالي البنود ${money(session, total)}`,
    entityType: "Budget",
    entityId: b.id,
    link: `/finance/budget/${b.id}`,
    amountMinor: total,
    steps: [{ name: "مراجعة المدير المالي", approverRoleKey: "ACCOUNTANT" }, { name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" }],
  });
  return db.budget.update({ where: { id: b.id }, data: { status: "PENDING", approvalRequestId: req.id } });
}

export async function onBudgetApproval(db: TenantDb, _session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  const b = await db.budget.findFirst({ where: { id: request.entityId } });
  if (!b || b.status !== "PENDING") return;
  if (event.decision === "APPROVED") {
    // موازنة معتمدة واحدة لكل عام: السابقة تعود مسودة مؤرشفة بالاسم
    await db.budget.updateMany({ where: { fiscalYearId: b.fiscalYearId, status: "APPROVED", id: { not: b.id } }, data: { status: "SUPERSEDED" } });
    await db.budget.update({ where: { id: b.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  } else await db.budget.update({ where: { id: b.id }, data: { status: "REJECTED" } });
}

/** الموازنة المعتمدة للعام الذي يقع فيه التاريخ */
async function approvedBudgetFor(db: TenantDb, date: Date) {
  const fy = await db.fiscalYear.findFirst({ where: { startDate: { lte: date }, endDate: { gte: date } } });
  if (!fy) return null;
  const b = await db.budget.findFirst({ where: { fiscalYearId: fy.id, status: "APPROVED" } });
  return b ? { budget: b, fy } : null;
}

/**
 * الرقابة عند الصرف: يقارن (الفعلي حتى الآن + المبلغ الجديد) بموازنة الحساب للعام (ولمركز التكلفة إن وُجدت له بنود).
 * BLOCK: يمنع التجاوز. WARN: يعيد تنبيهاً يُعرض للمستخدم. لا موازنة للحساب: لا رقابة.
 */
export async function checkBudget(db: TenantDb, session: SessionData, input: { accountId: string; costCenterId?: string | null; date: Date; amountMinor: number }) {
  const control = settingsOf(session, "finance").budgetControl;
  if (control === "NONE") return null;
  const found = await approvedBudgetFor(db, input.date);
  if (!found) return null;
  const lines = await db.budgetLine.findMany({ where: { budgetId: found.budget.id, accountId: input.accountId } });
  if (!lines.length) return null;
  const withCc = input.costCenterId ? lines.filter((l) => l.costCenterId === input.costCenterId) : [];
  const scoped = withCc.length ? withCc : lines;
  const budgetMinor = scoped.reduce((s, l) => s + l.amountMinor, 0);
  const act = (await actuals(db, session.tenant.id, found.fy.startDate, found.fy.endDate)).filter((a) => a.accountId === input.accountId && (!withCc.length || a.costCenterId === input.costCenterId)).reduce((s, a) => s + a.amountMinor, 0);
  const after = act + input.amountMinor;
  const st = budgetState(budgetMinor, after, settingsOf(session, "finance").budgetWarnBp);
  const acc = await db.account.findFirst({ where: { id: input.accountId }, select: { name: true } });
  const message = st.state === "OVER" ? `يتجاوز موازنة «${acc?.name ?? ""}»: المعتمد ${money(session, budgetMinor)} والمصروف بعد العملية ${money(session, after)}` : st.state === "WARNING" ? `استُهلك ${formatNumber(Math.floor(st.usedBp / 100), "arab")}٪ من موازنة «${acc?.name ?? ""}»` : null;
  if (st.state === "OVER" && control === "BLOCK") throw badRequest(`${message}. سياسة الموازنة تمنع التجاوز؛ عدّل الموازنة أو اطلب اعتماد تعديلها.`);
  return message ? { state: st.state, message, budgetMinor, afterMinor: after } : null;
}

/** الفعلي مقابل الموازنة المعتمدة (أو المحددة) مجمّعاً بالحساب */
export async function budgetVsActual(db: TenantDb, session: SessionData, input: { budgetId?: string | null }) {
  requirePerm(session, "expenses", "view");
  const b = input.budgetId ? await db.budget.findFirst({ where: { id: input.budgetId } }) : await db.budget.findFirst({ where: { status: "APPROVED" }, orderBy: { approvedAt: "desc" } });
  if (!b) return null;
  return getBudget(db, session, b.id);
}
