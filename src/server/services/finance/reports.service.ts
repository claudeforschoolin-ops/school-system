/**
 * التقارير المالية: ميزان المراجعة، دفتر الأستاذ، قائمة الدخل (بمقارنة وحسب مركز التكلفة)، الميزانية العمومية،
 * التدفقات النقدية (المباشرة)، تقادم الذمم، إقرار ضريبة القيمة المضافة، الإيراد المؤجل مقابل المحقق،
 * التحصيل مقابل المستهدف، الخصومات والمنح، حركة الصندوق اليومية، ولوحة المالية.
 * كل رقم قابل للنزول إلى القيد ثم المستند المصدر.
 */
import type { Prisma } from "@/generated/prisma/client";
import { AGING_BUCKETS, agingBucket, applyBp, type AgingKey } from "@/lib/finance/calc";
import { allocateMinor } from "@/lib/money";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { notFound } from "@/server/errors";
import { balances, sourceLink } from "./accounting.service";
import { balanceOf, dateOnly, displayStatus, financeSettings, isoOf, requirePerm, todayIso } from "./common";
import { n } from "./ledger";

const DAY = 86_400_000;

async function postingAccounts(db: TenantDb) {
  return db.account.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } });
}

const signed = (a: { normalSide: string }, debit: number, credit: number) =>
  a.normalSide === "DEBIT" ? debit - credit : credit - debit;

// ---------------------------------------------------------------------
// ميزان المراجعة ودفتر الأستاذ
// ---------------------------------------------------------------------

export async function trialBalance(
  db: TenantDb,
  session: SessionData,
  input: { from: string; to: string; costCenterId?: string | null; includeZero?: boolean },
) {
  requirePerm(session, "finance_reports", "view", "لا تملك صلاحية التقارير المالية");
  const from = dateOnly(input.from);
  const to = dateOnly(input.to);
  const [accounts, opening, movement] = await Promise.all([
    postingAccounts(db),
    balances(db, { to: new Date(from.getTime() - DAY), costCenterId: input.costCenterId }),
    balances(db, { from, to, costCenterId: input.costCenterId }),
  ]);
  const rows = accounts
    .filter((a) => !a.isGroup)
    .map((a) => {
      const o = opening.get(a.id) ?? { debit: 0, credit: 0 };
      const m = movement.get(a.id) ?? { debit: 0, credit: 0 };
      const openNet = o.debit - o.credit;
      const closeNet = openNet + m.debit - m.credit;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        openingDebit: Math.max(openNet, 0),
        openingCredit: Math.max(-openNet, 0),
        debit: m.debit,
        credit: m.credit,
        closingDebit: Math.max(closeNet, 0),
        closingCredit: Math.max(-closeNet, 0),
      };
    })
    .filter((r) => input.includeZero || r.openingDebit || r.openingCredit || r.debit || r.credit);
  const total = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const totals = {
    openingDebit: total("openingDebit"),
    openingCredit: total("openingCredit"),
    debit: total("debit"),
    credit: total("credit"),
    closingDebit: total("closingDebit"),
    closingCredit: total("closingCredit"),
  };
  return {
    rows,
    totals,
    balanced: totals.debit === totals.credit && totals.closingDebit === totals.closingCredit,
  };
}

export async function ledger(
  db: TenantDb,
  session: SessionData,
  input: { accountId: string; from: string; to: string; costCenterId?: string | null },
) {
  requirePerm(session, "finance_reports", "view");
  const account = await db.account.findFirst({ where: { id: input.accountId } });
  if (!account) throw notFound("الحساب غير موجود");
  const from = dateOnly(input.from);
  const to = dateOnly(input.to);
  const ccWhere = input.costCenterId ? { costCenterId: input.costCenterId } : {};
  const [openAgg, lines] = await Promise.all([
    db.journalLine.aggregate({
      where: { accountId: account.id, ...ccWhere, entry: { date: { lt: from } } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.journalLine.findMany({
      where: { accountId: account.id, ...ccWhere, entry: { date: { gte: from, lte: to } } },
      include: {
        entry: {
          select: {
            id: true,
            number: true,
            date: true,
            description: true,
            source: true,
            sourceType: true,
            sourceId: true,
            reference: true,
          },
        },
      },
      orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    }),
  ]);
  const opening = signed(account, n(openAgg._sum.debitMinor), n(openAgg._sum.creditMinor));
  let running = opening;
  const students = await db.student.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.studentId).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  return {
    account: { id: account.id, code: account.code, name: account.name, normalSide: account.normalSide },
    opening,
    rows: lines.map((l) => {
      const d = n(l.debitMinor);
      const c = n(l.creditMinor);
      running += signed(account, d, c);
      return {
        id: l.id,
        entryId: l.entry.id,
        number: l.entry.number,
        date: l.entry.date,
        description: l.description ?? l.entry.description,
        source: l.entry.source,
        reference: l.entry.reference,
        student: students.find((s) => s.id === l.studentId)?.fullName ?? null,
        debit: d,
        credit: c,
        balance: running,
        sourceLink: sourceLink(l.entry.sourceType, l.entry.sourceId),
      };
    }),
    closing: running,
  };
}

// ---------------------------------------------------------------------
// قائمة الدخل والميزانية
// ---------------------------------------------------------------------

type Section = {
  key: string;
  label: string;
  rows: Array<{ id: string; code: string; name: string; amount: number; compare?: number }>;
  total: number;
  compareTotal?: number;
};

async function plSections(db: TenantDb, from: Date, to: Date, costCenterId?: string | null) {
  const [accounts, mov] = await Promise.all([postingAccounts(db), balances(db, { from, to, costCenterId })]);
  const byCode = (prefix: string[], type: string, sign: 1 | -1) =>
    accounts
      .filter((a) => !a.isGroup && a.type === type && prefix.some((p) => a.code.startsWith(p)))
      .map((a) => {
        const m = mov.get(a.id) ?? { debit: 0, credit: 0 };
        return { id: a.id, code: a.code, name: a.name, amount: sign * (m.credit - m.debit) };
      });
  const revenue = byCode(["4"], "REVENUE", 1);
  const cost = byCode(["5"], "EXPENSE", -1);
  const expenses = byCode(["6", "7"], "EXPENSE", -1);
  return { revenue, cost, expenses };
}

export async function incomeStatement(
  db: TenantDb,
  session: SessionData,
  input: {
    from: string;
    to: string;
    compareFrom?: string | null;
    compareTo?: string | null;
    costCenterId?: string | null;
  },
) {
  requirePerm(session, "finance_reports", "view");
  const cur = await plSections(db, dateOnly(input.from), dateOnly(input.to), input.costCenterId);
  const cmp =
    input.compareFrom && input.compareTo
      ? await plSections(db, dateOnly(input.compareFrom), dateOnly(input.compareTo), input.costCenterId)
      : null;
  const build = (key: "revenue" | "cost" | "expenses", label: string): Section => {
    const rows = cur[key]
      .map((r) => ({ ...r, compare: cmp?.[key].find((c) => c.id === r.id)?.amount }))
      .filter((r) => r.amount || r.compare);
    return {
      key,
      label,
      rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
      compareTotal: cmp ? rows.reduce((s, r) => s + (r.compare ?? 0), 0) : undefined,
    };
  };
  const sections = [
    build("revenue", "الإيرادات (بعد الخصومات)"),
    build("cost", "تكلفة الإيراد"),
    build("expenses", "المصروفات التشغيلية"),
  ];
  const net = sections[0]!.total - sections[1]!.total - sections[2]!.total;
  const compareNet = cmp
    ? (sections[0]!.compareTotal ?? 0) - (sections[1]!.compareTotal ?? 0) - (sections[2]!.compareTotal ?? 0)
    : undefined;
  return { sections, grossProfit: sections[0]!.total - sections[1]!.total, net, compareNet };
}

/** قائمة الدخل حسب الفرع (أعمدة مراكز التكلفة الفرعية) */
export async function incomeByBranch(
  db: TenantDb,
  session: SessionData,
  input: { from: string; to: string },
) {
  requirePerm(session, "finance_reports", "view");
  const centers = await db.costCenter.findMany({
    where: { kind: "BRANCH", isActive: true },
    orderBy: { code: "asc" },
  });
  const cols = [];
  for (const c of centers) {
    const s = await plSections(db, dateOnly(input.from), dateOnly(input.to), c.id);
    const rev = s.revenue.reduce((a, r) => a + r.amount, 0);
    const exp = s.cost.reduce((a, r) => a + r.amount, 0) + s.expenses.reduce((a, r) => a + r.amount, 0);
    cols.push({ id: c.id, name: c.name, revenue: rev, expenses: exp, net: rev - exp });
  }
  return cols;
}

export async function balanceSheet(db: TenantDb, session: SessionData, input: { asOf: string }) {
  requirePerm(session, "finance_reports", "view");
  const asOf = dateOnly(input.asOf);
  const [accounts, bal] = await Promise.all([postingAccounts(db), balances(db, { to: asOf })]);
  const pick = (type: string) =>
    accounts
      .filter((a) => !a.isGroup && a.type === type)
      .map((a) => {
        const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          amount: type === "ASSET" ? b.debit - b.credit : b.credit - b.debit,
        };
      })
      .filter((r) => r.amount);
  const assets = pick("ASSET");
  const liabilities = pick("LIABILITY");
  const equity = pick("EQUITY");
  // أرباح غير مقفلة (كل الإيرادات والمصروفات حتى التاريخ؛ قيود الإقفال تصفّر ما سبق)
  const earnings = accounts
    .filter((a) => !a.isGroup && (a.type === "REVENUE" || a.type === "EXPENSE"))
    .reduce((s, a) => {
      const b = bal.get(a.id) ?? { debit: 0, credit: 0 };
      return s + b.credit - b.debit;
    }, 0);
  const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + earnings;
  return {
    assets,
    liabilities,
    equity,
    earnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

// ---------------------------------------------------------------------
// التدفقات النقدية (الطريقة المباشرة)
// ---------------------------------------------------------------------

export async function cashFlow(db: TenantDb, session: SessionData, input: { from: string; to: string }) {
  requirePerm(session, "finance_reports", "view");
  const from = dateOnly(input.from);
  const to = dateOnly(input.to);
  const accounts = await postingAccounts(db);
  const cashIds = new Set(accounts.filter((a) => a.cashFlowGroup === "CASH").map((a) => a.id));
  const entries = await db.journalEntry.findMany({
    where: { date: { gte: from, lte: to }, lines: { some: { accountId: { in: [...cashIds] } } } },
    include: { lines: true },
  });
  const groups = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const cashDelta = e.lines
      .filter((l) => cashIds.has(l.accountId))
      .reduce((s, l) => s + n(l.debitMinor) - n(l.creditMinor), 0);
    if (!cashDelta) continue; // تحويلات داخلية بين النقد والبنوك
    const others = e.lines.filter((l) => !cashIds.has(l.accountId));
    if (!others.length) continue;
    // توزيع أثر النقد على الحسابات المقابلة بلا فقد هللات
    const shares = allocateMinor(
      cashDelta,
      others.map((l) => n(l.debitMinor) + n(l.creditMinor) || 1),
    );
    for (const [i, l] of others.entries()) {
      const a = accounts.find((x) => x.id === l.accountId)!;
      const group =
        a.cashFlowGroup === "INVESTING" || a.cashFlowGroup === "FINANCING" ? a.cashFlowGroup : "OPERATING";
      const parent = accounts.find((x) => x.id === a.parentId);
      const label =
        a.type === "REVENUE" || a.code.startsWith("12") || a.code.startsWith("22") || a.code.startsWith("23")
          ? "المتحصلات من أولياء الأمور"
          : a.type === "EXPENSE" || a.code.startsWith("21") || a.code.startsWith("24")
            ? "المدفوعات للمصروفات والموردين"
            : (parent?.name ?? a.name);
      const share = shares[i]!;
      const g = groups.get(group) ?? new Map<string, number>();
      g.set(label, (g.get(label) ?? 0) + share);
      groups.set(group, g);
    }
  }
  const [openingBal, closingBal] = await Promise.all([
    balances(db, { to: new Date(from.getTime() - DAY) }),
    balances(db, { to }),
  ]);
  const cashOf = (m: Map<string, { debit: number; credit: number }>) =>
    [...cashIds].reduce((s, id) => s + (m.get(id)?.debit ?? 0) - (m.get(id)?.credit ?? 0), 0);
  const labels = {
    OPERATING: "الأنشطة التشغيلية",
    INVESTING: "الأنشطة الاستثمارية",
    FINANCING: "الأنشطة التمويلية",
  } as const;
  const sections = (["OPERATING", "INVESTING", "FINANCING"] as const).map((k) => {
    const rows = [...(groups.get(k) ?? new Map()).entries()].map(([label, amount]) => ({ label, amount }));
    return { key: k, label: labels[k], rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  });
  const opening = cashOf(openingBal);
  const closing = cashOf(closingBal);
  return { sections, opening, closing, net: closing - opening };
}

// ---------------------------------------------------------------------
// الذمم: التقادم
// ---------------------------------------------------------------------

export async function aging(
  db: TenantDb,
  session: SessionData,
  input: { asOf: string; branchId?: string | null },
) {
  requirePerm(session, "finance_reports", "view");
  const asOf = dateOnly(input.asOf);
  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIAL"] },
      deletedAt: null,
      issueDate: { lte: asOf },
      ...(input.branchId ? { branchId: input.branchId } : {}),
    },
    include: {
      installments: true,
      guardian: { select: { id: true, name: true, phone: true } },
      student: { select: { fullName: true } },
    },
  });
  type Row = {
    guardianId: string;
    guardian: string;
    phone: string | null;
    students: Set<string>;
    buckets: Record<AgingKey, number>;
    total: number;
    oldestDays: number;
  };
  const rows = new Map<string, Row>();
  const totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0])) as Record<AgingKey, number>;
  for (const inv of invoices) {
    const key = inv.guardianId ?? `student:${inv.studentId}`;
    const r = rows.get(key) ?? {
      guardianId: inv.guardianId ?? "",
      guardian: inv.guardian?.name ?? inv.student.fullName,
      phone: inv.guardian?.phone ?? null,
      students: new Set<string>(),
      buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0])) as Record<AgingKey, number>,
      total: 0,
      oldestDays: 0,
    };
    r.students.add(inv.student.fullName);
    // المتبقي على الأقساط (بعد الإشعارات الدائنة)
    let credited = inv.creditedMinor;
    for (const i of [...inv.installments].sort((a, b) => a.seq - b.seq)) {
      let unpaid = i.amountMinor - i.paidMinor;
      const c = Math.min(credited, Math.max(0, unpaid));
      unpaid -= c;
      credited -= c;
      if (unpaid <= 0) continue;
      const b = agingBucket(i.dueDate, asOf);
      r.buckets[b] += unpaid;
      totals[b] += unpaid;
      r.total += unpaid;
      r.oldestDays = Math.max(r.oldestDays, Math.floor((asOf.getTime() - i.dueDate.getTime()) / DAY));
    }
    rows.set(key, r);
  }
  const list = [...rows.values()]
    .filter((r) => r.total > 0)
    .sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total)
    .map((r) => ({ ...r, students: [...r.students] }));
  return {
    buckets: AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, amount: totals[b.key] })),
    rows: list,
    total: list.reduce((s, r) => s + r.total, 0),
  };
}

// ---------------------------------------------------------------------
// الضريبة
// ---------------------------------------------------------------------

export async function vatReturn(db: TenantDb, session: SessionData, input: { from: string; to: string }) {
  requirePerm(session, "taxes", "view", "لا تملك صلاحية الضرائب");
  const from = dateOnly(input.from);
  const to = dateOnly(input.to);
  const taxCodes = await db.taxCode.findMany();
  const outputIds = [
    ...new Set(taxCodes.map((t) => t.outputAccountId).filter((x): x is string => Boolean(x))),
  ];
  const inputIds = [...new Set(taxCodes.map((t) => t.inputAccountId).filter((x): x is string => Boolean(x)))];
  const [outAgg, inAgg, lines, credits, vouchers] = await Promise.all([
    db.journalLine.aggregate({
      where: { accountId: { in: outputIds }, entry: { date: { gte: from, lte: to } } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.journalLine.aggregate({
      where: { accountId: { in: inputIds }, entry: { date: { gte: from, lte: to } } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.invoiceLine.findMany({
      where: { invoice: { issueDate: { gte: from, lte: to }, status: { not: "DRAFT" }, deletedAt: null } },
      select: {
        taxCodeId: true,
        amountMinor: true,
        discountMinor: true,
        taxMinor: true,
        invoice: { select: { status: true } },
      },
    }),
    db.creditNote.findMany({
      where: { date: { gte: from, lte: to } },
      select: { amountMinor: true, taxMinor: true },
    }),
    db.paymentVoucher.findMany({
      where: { status: "PAID", date: { gte: from, lte: to }, deletedAt: null },
      select: { amountMinor: true, taxMinor: true, taxCodeId: true },
    }),
  ]);
  const byCode = taxCodes.map((t) => {
    const ls = lines.filter((l) => l.taxCodeId === t.id);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      rateBp: t.rateBp,
      kind: t.kind,
      base: ls.reduce((s, l) => s + l.amountMinor - l.discountMinor, 0),
      tax: ls.reduce((s, l) => s + l.taxMinor, 0),
    };
  });
  const output = n(outAgg._sum.creditMinor) - n(outAgg._sum.debitMinor);
  const inputTax = n(inAgg._sum.debitMinor) - n(inAgg._sum.creditMinor);
  return {
    sales: byCode.filter((c) => c.base || c.tax),
    salesAdjustments: {
      base: -credits.reduce((s, c) => s + c.amountMinor, 0),
      tax: -credits.reduce((s, c) => s + c.taxMinor, 0),
    },
    purchases: {
      base: vouchers.filter((v) => v.taxMinor > 0).reduce((s, v) => s + v.amountMinor, 0),
      tax: vouchers.reduce((s, v) => s + v.taxMinor, 0),
      exemptBase: vouchers.filter((v) => !v.taxMinor).reduce((s, v) => s + v.amountMinor, 0),
    },
    output,
    input: inputTax,
    net: output - inputTax,
  };
}

// ---------------------------------------------------------------------
// الإيراد المؤجل مقابل المحقق
// ---------------------------------------------------------------------

export async function deferredRevenue(
  db: TenantDb,
  session: SessionData,
  input: { academicYearId?: string | null },
) {
  requirePerm(session, "finance_reports", "view");
  const lines = await db.invoiceLine.findMany({
    where: {
      deferred: true,
      invoice: {
        status: { in: ["ISSUED", "PARTIAL", "PAID"] },
        deletedAt: null,
        ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
      },
    },
    select: { amountMinor: true, creditedMinor: true, recognizedMinor: true, revenueAccountId: true },
  });
  const accounts = await db.account.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.revenueAccountId))] } },
    select: { id: true, code: true, name: true },
  });
  const rows = accounts
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => {
      const ls = lines.filter((l) => l.revenueAccountId === a.id);
      const billed = ls.reduce((s, l) => s + l.amountMinor - l.creditedMinor, 0);
      const recognized = ls.reduce((s, l) => s + l.recognizedMinor, 0);
      return { id: a.id, code: a.code, name: a.name, billed, recognized, deferred: billed - recognized };
    });
  const deferredAcc = await db.account.findFirst({ where: { systemKey: "DEFERRED_REVENUE" } });
  const bal = deferredAcc ? (await balances(db)).get(deferredAcc.id) : undefined;
  return {
    rows,
    totals: {
      billed: rows.reduce((s, r) => s + r.billed, 0),
      recognized: rows.reduce((s, r) => s + r.recognized, 0),
      deferred: rows.reduce((s, r) => s + r.deferred, 0),
    },
    ledgerBalance: bal ? bal.credit - bal.debit : 0,
  };
}

// ---------------------------------------------------------------------
// التحصيل والخصومات والصندوق
// ---------------------------------------------------------------------

export async function collectionsReport(
  db: TenantDb,
  session: SessionData,
  input: { from: string; to: string },
) {
  requirePerm(session, "finance_reports", "view");
  const from = dateOnly(input.from);
  const to = dateOnly(input.to);
  const [receipts, dueInst] = await Promise.all([
    db.receipt.findMany({
      where: { date: { gte: from, lte: to }, status: "POSTED", NOT: { chequeStatus: "BOUNCED" } },
      select: { date: true, amountMinor: true, method: true, createdById: true },
    }),
    db.invoiceInstallment.findMany({
      where: { dueDate: { gte: from, lte: to }, invoice: { status: { not: "CANCELLED" }, deletedAt: null } },
      select: { amountMinor: true, paidMinor: true },
    }),
  ]);
  const byMethod = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byCashier = new Map<string, number>();
  for (const r of receipts) {
    byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amountMinor);
    const d = isoOf(r.date)!;
    byDay.set(d, (byDay.get(d) ?? 0) + r.amountMinor);
    byCashier.set(r.createdById ?? "", (byCashier.get(r.createdById ?? "") ?? 0) + r.amountMinor);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...byCashier.keys()].filter(Boolean) } },
    select: { id: true, name: true },
  });
  const due = dueInst.reduce((s, i) => s + i.amountMinor, 0);
  const target = applyBp(due, financeSettings(session).collectionTargetBp);
  const collected = receipts.reduce((s, r) => s + r.amountMinor, 0);
  return {
    collected,
    due,
    target,
    dueCollected: dueInst.reduce((s, i) => s + i.paidMinor, 0),
    byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
    byDay: [...byDay.entries()].sort().map(([date, amount]) => ({ date, amount })),
    byCashier: [...byCashier.entries()]
      .map(([id, amount]) => ({ name: users.find((u) => u.id === id)?.name ?? "—", amount }))
      .sort((a, b) => b.amount - a.amount),
    count: receipts.length,
  };
}

export async function discountsReport(
  db: TenantDb,
  session: SessionData,
  input: { academicYearId?: string | null },
) {
  requirePerm(session, "finance_reports", "view");
  const lines = await db.invoiceLine.findMany({
    where: {
      discountMinor: { gt: 0 },
      invoice: {
        status: { not: "CANCELLED" },
        deletedAt: null,
        ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
      },
    },
    select: {
      discountMinor: true,
      discountDetail: true,
      amountMinor: true,
      invoice: { select: { studentId: true, student: { select: { grade: { select: { name: true } } } } } },
    },
  });
  const byType = new Map<string, { name: string; amount: number; students: Set<string> }>();
  const byGrade = new Map<string, number>();
  for (const l of lines) {
    for (const d of (Array.isArray(l.discountDetail) ? l.discountDetail : []) as Array<{
      id: string;
      name: string;
      amountMinor: number;
    }>) {
      const name = d.name.replace(/\s*\(.*\)$/, "");
      const t = byType.get(name) ?? { name, amount: 0, students: new Set<string>() };
      t.amount += d.amountMinor;
      t.students.add(l.invoice.studentId);
      byType.set(name, t);
    }
    const g = l.invoice.student.grade.name;
    byGrade.set(g, (byGrade.get(g) ?? 0) + l.discountMinor);
  }
  const gross = lines.reduce((s, l) => s + l.amountMinor, 0);
  return {
    total: lines.reduce((s, l) => s + l.discountMinor, 0),
    byType: [...byType.values()]
      .map((t) => ({ name: t.name, amount: t.amount, students: t.students.size }))
      .sort((a, b) => b.amount - a.amount),
    byGrade: [...byGrade.entries()].map(([grade, amount]) => ({ grade, amount })),
    grossOnDiscounted: gross,
  };
}

export async function dailyCash(db: TenantDb, session: SessionData, input: { date: string }) {
  requirePerm(session, "finance_reports", "view");
  const date = dateOnly(input.date);
  const [receipts, sessions] = await Promise.all([
    db.receipt.findMany({ where: { date }, orderBy: { number: "asc" } }),
    db.cashSession.findMany({ where: { openedAt: { gte: date, lt: new Date(date.getTime() + DAY) } } }),
  ]);
  const users = await db.user.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            [...receipts.map((r) => r.createdById), ...sessions.map((s) => s.cashierId)].filter(
              (x): x is string => Boolean(x),
            ),
          ),
        ],
      },
    },
    select: { id: true, name: true },
  });
  return {
    receipts: receipts.map((r) => ({
      id: r.id,
      number: r.number,
      payer: r.payerName,
      method: r.method,
      amount: r.amountMinor,
      status: r.status,
      cashier: users.find((u) => u.id === r.createdById)?.name ?? null,
    })),
    sessions: sessions.map((s) => ({ ...s, cashier: users.find((u) => u.id === s.cashierId)?.name ?? null })),
    totals: {
      count: receipts.filter((r) => r.status === "POSTED").length,
      amount: receipts.filter((r) => r.status === "POSTED").reduce((s, r) => s + r.amountMinor, 0),
      cash: receipts
        .filter((r) => r.status === "POSTED" && r.method === "CASH")
        .reduce((s, r) => s + r.amountMinor, 0),
    },
  };
}

// ---------------------------------------------------------------------
// لوحة المالية
// ---------------------------------------------------------------------

export async function financeDashboard(db: TenantDb, session: SessionData) {
  requirePerm(session, "finance_reports", "view");
  const todayStr = todayIso(session);
  const today = dateOnly(todayStr);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  const accounts = await postingAccounts(db);
  const cashIds = accounts.filter((a) => a.cashFlowGroup === "CASH").map((a) => a.id);
  const expenseIds = accounts.filter((a) => a.type === "EXPENSE" && !a.isGroup).map((a) => a.id);
  const [
    collectedMonth,
    openInvoices,
    expMonth,
    cashBal,
    pendingVouchers,
    pendingRefunds,
    pendingDiscounts,
    pendingCheques,
    receiptsYear,
    dueYear,
  ] = await Promise.all([
    db.receipt.aggregate({
      where: { date: { gte: monthStart, lte: today }, status: "POSTED", NOT: { chequeStatus: "BOUNCED" } },
      _sum: { amountMinor: true },
    }),
    db.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null },
      include: {
        installments: true,
        student: { select: { fullName: true } },
        guardian: { select: { name: true } },
      },
    }),
    db.journalLine.aggregate({
      where: { accountId: { in: expenseIds }, entry: { date: { gte: monthStart, lte: today } } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.journalLine.aggregate({
      where: { accountId: { in: cashIds } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    db.paymentVoucher.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] }, deletedAt: null },
      orderBy: { date: "asc" },
      take: 10,
    }),
    db.refund.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } }, take: 10 }),
    db.studentDiscount.count({ where: { status: "PENDING" } }),
    db.receipt.findMany({
      where: { chequeStatus: "PENDING", status: "POSTED" },
      orderBy: { chequeDate: "asc" },
      take: 10,
    }),
    year
      ? db.receipt.findMany({
          where: {
            date: { gte: year.startDate, lte: today },
            status: "POSTED",
            NOT: { chequeStatus: "BOUNCED" },
          },
          select: { date: true, amountMinor: true },
        })
      : [],
    year
      ? db.invoiceInstallment.findMany({
          where: { invoice: { academicYearId: year.id, status: { not: "CANCELLED" }, deletedAt: null } },
          select: { dueDate: true, amountMinor: true },
        })
      : [],
  ]);
  const overdueRows = openInvoices
    .map((i) => ({
      i,
      status: displayStatus(i, today),
      overdue:
        i.installments.filter((x) => x.dueDate < today).reduce((s, x) => s + x.amountMinor - x.paidMinor, 0) -
        0,
    }))
    .filter((x) => x.status === "OVERDUE");
  // التحصيل مقابل المستهدف شهرياً للعام الدراسي
  const months: Array<{ key: string; collected: number; due: number }> = [];
  if (year) {
    for (
      let d = new Date(Date.UTC(year.startDate.getUTCFullYear(), year.startDate.getUTCMonth(), 1));
      d <= year.endDate;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const key = d.toISOString().slice(0, 7);
      months.push({
        key,
        collected: receiptsYear
          .filter((r) => isoOf(r.date)!.startsWith(key))
          .reduce((s, r) => s + r.amountMinor, 0),
        due: dueYear.filter((x) => isoOf(x.dueDate)!.startsWith(key)).reduce((s, x) => s + x.amountMinor, 0),
      });
    }
  }
  const targetBp = financeSettings(session).collectionTargetBp;
  return {
    kpis: {
      collectedMonth: collectedMonth._sum.amountMinor ?? 0,
      receivable: openInvoices.reduce((s, i) => s + balanceOf(i), 0),
      overdue: overdueRows.reduce((s, x) => s + Math.min(x.overdue, balanceOf(x.i)), 0),
      overdueCount: overdueRows.length,
      expensesMonth: n(expMonth._sum.debitMinor) - n(expMonth._sum.creditMinor),
      cashAndBank: n(cashBal._sum.debitMinor) - n(cashBal._sum.creditMinor),
    },
    months: months.map((m) => ({ ...m, target: applyBp(m.due, targetBp) })),
    actions: {
      overdue: overdueRows
        .sort((a, b) => a.i.dueDate.getTime() - b.i.dueDate.getTime())
        .slice(0, 8)
        .map((x) => ({
          id: x.i.id,
          number: x.i.number,
          student: x.i.student.fullName,
          guardian: x.i.guardian?.name ?? null,
          dueDate: x.i.dueDate,
          balance: balanceOf(x.i),
          days: Math.floor((today.getTime() - x.i.dueDate.getTime()) / DAY),
        })),
      vouchers: pendingVouchers.map((v) => ({
        id: v.id,
        number: v.number,
        payee: v.payee,
        total: v.totalMinor,
        status: v.status,
      })),
      refunds: pendingRefunds.map((r) => ({
        id: r.id,
        number: r.number,
        amount: r.amountMinor,
        status: r.status,
        guardianId: r.guardianId,
      })),
      pendingDiscounts,
      cheques: pendingCheques.map((c) => ({
        id: c.id,
        number: c.number,
        chequeNumber: c.chequeNumber,
        bank: c.chequeBank,
        amount: c.amountMinor,
        date: c.chequeDate,
        payer: c.payerName,
      })),
    },
  };
}

export type { Prisma };
