/**
 * الأصول الثابتة: السجل والفئات، الاقتناء بقيد (بنك/صندوق/مورد/رصيد افتتاحي)، الإهلاك الشهري بقيد واحد
 * (قسط ثابت أو متناقص، مع استكمال الأشهر الفائتة)، النقل بين المواقع، والاستبعاد أو البيع بربح/خسارة.
 */
import { disposalGain, monthlyDepreciation, monthsBetween, nextMonth } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { accountByKey, branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { dateOnly, ensureOpsAccounts, isoOf, money, nextNo, todayOf } from "@/server/services/ops/common";
import { hasPerm, requirePerm } from "./common";

const DEFAULT_CATEGORIES: Array<[code: string, name: string, key: string, months: number, method: string]> = [
  ["LAND", "أراضٍ", "ASSET_LAND", 1, "NONE"],
  ["BLDG", "مبانٍ", "ASSET_BUILDINGS", 300, "STRAIGHT_LINE"],
  ["FURN", "أثاث وتجهيزات", "ASSET_FURNITURE", 60, "STRAIGHT_LINE"],
  ["IT", "أجهزة حاسب وتقنية", "ASSET_COMPUTERS", 36, "DECLINING"],
  ["BUS", "حافلات ومركبات", "ASSET_BUSES", 120, "STRAIGHT_LINE"],
];

export async function ensureAssetCategories(db: TenantDb, tenantId: string) {
  if (await db.assetCategory.count()) return;
  await ensureOpsAccounts(db, tenantId);
  const accum = await accountByKey(db, "ACCUMULATED_DEPRECIATION");
  const exp = await accountByKey(db, "DEPRECIATION");
  for (const [code, name, key, months, method] of DEFAULT_CATEGORIES)
    await db.assetCategory.create({ data: { tenantId, code, name, assetAccountId: await accountByKey(db, key), accumAccountId: accum, expenseAccountId: exp, usefulLifeMonths: months, method } });
}

const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const monthEnd = (month: string) => {
  const [y = 2000, m = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0));
};
const prevMonth = (month: string) => {
  const [y = 2000, m = 1] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
/** الأشهر المهلكة حتى نهاية شهر معين (شهر بدء التشغيل يُهلك كاملاً) */
const elapsed = (inService: Date, lastMonth: string | null) => (lastMonth ? Math.max(0, monthsBetween(monthOf(inService), lastMonth)) : 0);

export async function listCategories(db: TenantDb, session: SessionData) {
  requirePerm(session, "assets", "view");
  await ensureAssetCategories(db, session.tenant.id);
  const [cats, accounts] = await Promise.all([
    db.assetCategory.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { assets: true } } } }),
    db.account.findMany({ where: { deletedAt: null, isGroup: false, type: { in: ["ASSET", "EXPENSE"] } }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" } }),
  ]);
  return { categories: cats, accounts, canEdit: hasPerm(session, "assets", "update") };
}

export async function saveCategory(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; name: string; assetAccountId: string; accumAccountId: string; expenseAccountId: string; method: "STRAIGHT_LINE" | "DECLINING" | "NONE"; usefulLifeMonths: number; decliningRateBp?: number | null; isActive: boolean }) {
  requirePerm(session, "assets", "update");
  if (input.usefulLifeMonths < 1) throw badRequest("العمر الإنتاجي شهر على الأقل");
  const data = { code: input.code.trim().toUpperCase(), name: input.name.trim(), assetAccountId: input.assetAccountId, accumAccountId: input.accumAccountId, expenseAccountId: input.expenseAccountId, method: input.method, usefulLifeMonths: input.usefulLifeMonths, decliningRateBp: input.decliningRateBp ?? null, isActive: input.isActive };
  return input.id ? db.assetCategory.update({ where: { id: input.id }, data }) : db.assetCategory.create({ data: { tenantId: session.tenant.id, ...data } });
}

export async function listAssets(db: TenantDb, session: SessionData, input: { status?: string | null; categoryId?: string | null; q?: string | null } = {}) {
  requirePerm(session, "assets", "view");
  await ensureAssetCategories(db, session.tenant.id);
  const q = input.q?.trim();
  const rows = await db.fixedAsset.findMany({
    where: { deletedAt: null, ...(input.status ? { status: input.status } : {}), ...(input.categoryId ? { categoryId: input.categoryId } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { tag: { contains: q } }, { serialNumber: { contains: q } }] } : {}) },
    include: { category: { select: { name: true } } },
    orderBy: { number: "desc" },
  });
  const branches = await db.branch.findMany({ select: { id: true, name: true } });
  const list = rows.map((a) => ({ id: a.id, number: a.number, tag: a.tag, name: a.name, category: a.category.name, categoryId: a.categoryId, branch: branches.find((b) => b.id === a.branchId)?.name ?? null, location: a.location, purchaseDate: a.purchaseDate, costMinor: a.costMinor, accumulatedMinor: a.accumulatedMinor, bookValueMinor: a.costMinor - a.accumulatedMinor, status: a.status, lastDepreciatedMonth: a.lastDepreciatedMonth }));
  const active = list.filter((a) => a.status !== "DISPOSED");
  const lastRun = await db.depreciationRun.findFirst({ orderBy: { month: "desc" } });
  return {
    assets: list,
    totals: { cost: active.reduce((s, a) => s + a.costMinor, 0), accumulated: active.reduce((s, a) => s + a.accumulatedMinor, 0), book: active.reduce((s, a) => s + a.bookValueMinor, 0), count: active.length },
    lastRun: lastRun ? { month: lastRun.month, totalMinor: lastRun.totalMinor, journalEntryId: lastRun.journalEntryId } : null,
    canEdit: hasPerm(session, "assets", "create"),
  };
}

export async function getAsset(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "assets", "view");
  const a = await db.fixedAsset.findFirst({ where: { id, deletedAt: null }, include: { category: true, movements: { orderBy: { createdAt: "desc" } } } });
  if (!a) throw notFound("الأصل غير موجود");
  const [lines, branches, rooms, custodian, supplier] = await Promise.all([
    db.depreciationLine.findMany({ where: { assetId: a.id }, include: { run: { select: { month: true, journalEntryId: true } } }, orderBy: { run: { month: "asc" } } }),
    db.branch.findMany({ select: { id: true, name: true } }),
    db.room.findMany({ where: { deletedAt: null }, select: { id: true, name: true, branchId: true } }),
    a.custodianId ? db.employee.findFirst({ where: { id: a.custodianId }, select: { fullName: true } }) : null,
    a.supplierId ? db.supplier.findFirst({ where: { id: a.supplierId }, select: { name: true } }) : null,
  ]);
  // الجدول المتوقع للأشهر القادمة (١٢ شهراً)
  const forecast: Array<{ month: string; amountMinor: number; bookValueMinor: number }> = [];
  if (a.status === "ACTIVE") {
    let acc = a.accumulatedMinor;
    let month = a.lastDepreciatedMonth ? nextMonth(a.lastDepreciatedMonth) : monthOf(a.inServiceDate);
    let el = elapsed(a.inServiceDate, a.lastDepreciatedMonth);
    for (let i = 0; i < 12; i++) {
      const d = monthlyDepreciation({ ...a, accumulatedMinor: acc, monthsElapsed: el });
      if (!d) break;
      acc += d;
      el++;
      forecast.push({ month, amountMinor: d, bookValueMinor: a.costMinor - acc });
      month = nextMonth(month);
    }
  }
  return {
    asset: { ...a, bookValueMinor: a.costMinor - a.accumulatedMinor, branch: branches.find((b) => b.id === a.branchId)?.name ?? null, room: rooms.find((r) => r.id === a.roomId)?.name ?? null, custodian: custodian?.fullName ?? null, supplier: supplier?.name ?? null },
    history: lines.map((l) => ({ month: l.run.month, amountMinor: l.amountMinor, bookValueMinor: l.bookValueMinor, journalEntryId: l.run.journalEntryId })),
    forecast,
    options: { branches, rooms },
    canEdit: hasPerm(session, "assets", "update"),
  };
}

export interface AssetInput {
  name: string;
  categoryId: string;
  tag?: string | null;
  serialNumber?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  location?: string | null;
  custodianId?: string | null;
  supplierId?: string | null;
  purchaseDate: string;
  inServiceDate?: string | null;
  costMinor: number;
  salvageMinor: number;
  usefulLifeMonths?: number | null;
  method?: "STRAIGHT_LINE" | "DECLINING" | "NONE" | null;
  /** مصدر التمويل: BANK | CASH | AP (آجل للمورد) | OPENING (رصيد افتتاحي بمجمع إهلاك سابق) */
  fundedBy: "BANK" | "CASH" | "AP" | "OPENING";
  bankAccountId?: string | null;
  openingAccumulatedMinor?: number;
  /** آخر شهر أُهلك قبل النظام (للرصيد الافتتاحي) YYYY-MM */
  openingDepreciatedTo?: string | null;
  notes?: string | null;
}

/** تسجيل أصل وقيد اقتنائه */
export async function createAsset(db: TenantDb, session: SessionData, input: AssetInput) {
  requirePerm(session, "assets", "create", "تسجيل الأصول من صلاحية المالية");
  const cat = await db.assetCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
  if (!cat) throw notFound("فئة الأصل غير موجودة");
  if (!Number.isSafeInteger(input.costMinor) || input.costMinor <= 0) throw badRequest("التكلفة أكبر من صفر");
  if (input.salvageMinor < 0 || input.salvageMinor >= input.costMinor) throw badRequest("قيمة الخردة أقل من التكلفة");
  const opening = input.fundedBy === "OPENING" ? (input.openingAccumulatedMinor ?? 0) : 0;
  if (opening < 0 || opening > input.costMinor - input.salvageMinor) throw badRequest("مجمع الإهلاك الافتتاحي يتجاوز القيمة القابلة للإهلاك");
  if (opening > 0 && !/^\d{4}-\d{2}$/.test(input.openingDepreciatedTo ?? "")) throw badRequest("حدد آخر شهر أُهلك فيه الأصل قبل النظام");
  const inService = input.inServiceDate ?? input.purchaseDate;
  await ensureOpsAccounts(db, session.tenant.id);
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const number = await nextNo(tx, session, "asset");
    const tag = input.tag?.trim() || `AST-${String(number).padStart(5, "0")}`;
    if (await tx.fixedAsset.findFirst({ where: { tag } })) throw badRequest("رقم الملصق مستخدم لأصل آخر");
    const costCenterId = await branchCostCenter(tx, session.tenant.id, input.branchId);
    const asset = await tx.fixedAsset.create({
      data: {
        tenantId: session.tenant.id,
        number,
        tag,
        name: input.name.trim(),
        categoryId: cat.id,
        serialNumber: input.serialNumber || null,
        branchId: input.branchId || null,
        roomId: input.roomId || null,
        location: input.location || null,
        custodianId: input.custodianId || null,
        supplierId: input.supplierId || null,
        costCenterId,
        purchaseDate: dateOnly(input.purchaseDate),
        inServiceDate: dateOnly(inService),
        costMinor: input.costMinor,
        salvageMinor: input.salvageMinor,
        usefulLifeMonths: input.usefulLifeMonths ?? cat.usefulLifeMonths,
        method: input.method ?? cat.method,
        decliningRateBp: cat.decliningRateBp,
        accumulatedMinor: opening,
        lastDepreciatedMonth: opening > 0 ? input.openingDepreciatedTo! : null,
        notes: input.notes ?? null,
        createdById: session.user.id,
      },
    });
    let credit: string;
    if (input.fundedBy === "CASH") credit = "key:CASH";
    else if (input.fundedBy === "AP") credit = "key:AP";
    else if (input.fundedBy === "OPENING") credit = "key:OPENING_EQUITY";
    else {
      const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId } }) : null;
      if (!bank) throw badRequest("اختر الحساب البنكي");
      credit = bank.accountId;
    }
    // الرصيد الافتتاحي لأصل قديم يُقيد في أول فترة محاسبية متاحة
    let entryDate = input.purchaseDate;
    if (input.fundedBy === "OPENING") {
      const first = await tx.fiscalPeriod.findFirst({ where: { status: "OPEN", endDate: { gte: dateOnly(entryDate) } }, orderBy: { startDate: "asc" } });
      if (first && isoOf(first.startDate)! > entryDate) entryDate = isoOf(first.startDate)!;
    }
    const entry = await postEntry(tx, session, {
      date: entryDate,
      description: `${input.fundedBy === "OPENING" ? "رصيد افتتاحي لأصل" : "اقتناء أصل"}: ${asset.name} (${tag})`,
      source: "FIXED_ASSET",
      sourceType: "FixedAsset",
      sourceId: asset.id,
      reference: tag,
      lines: [
        { account: cat.assetAccountId, debit: input.costMinor, costCenterId },
        ...(opening ? [{ account: cat.accumAccountId, credit: opening, costCenterId, description: "مجمع إهلاك افتتاحي" }] : []),
        { account: credit, credit: input.costMinor - opening },
      ],
    });
    await tx.assetMovement.create({ data: { tenantId: session.tenant.id, assetId: asset.id, kind: "ACQUISITION", date: dateOnly(input.purchaseDate), toText: input.location ?? null, notes: input.fundedBy === "OPENING" ? "رصيد افتتاحي" : null, createdById: session.user.id } });
    return tx.fixedAsset.update({ where: { id: asset.id }, data: { acquisitionEntryId: entry.id } });
  });
}

export async function updateAsset(db: TenantDb, session: SessionData, id: string, input: { name: string; serialNumber?: string | null; notes?: string | null; salvageMinor?: number; usefulLifeMonths?: number }) {
  requirePerm(session, "assets", "update");
  const a = await db.fixedAsset.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw notFound("الأصل غير موجود");
  if (a.status === "DISPOSED") throw badRequest("الأصل مستبعد");
  // تغيير العمر أو الخردة يؤثر على الأشهر القادمة فقط (تغيير تقدير محاسبي)
  const salvage = input.salvageMinor ?? a.salvageMinor;
  if (salvage >= a.costMinor || a.accumulatedMinor > a.costMinor - salvage) throw badRequest("الخردة الجديدة تتعارض مع الإهلاك المتراكم");
  return db.fixedAsset.update({ where: { id }, data: { name: input.name.trim(), serialNumber: input.serialNumber ?? null, notes: input.notes ?? null, salvageMinor: salvage, usefulLifeMonths: input.usefulLifeMonths ?? a.usefulLifeMonths } });
}

/** نقل الأصل بين الفروع/القاعات أو تغيير العهدة */
export async function transferAsset(db: TenantDb, session: SessionData, id: string, input: { branchId?: string | null; roomId?: string | null; location?: string | null; custodianId?: string | null; date: string; notes?: string | null }) {
  requirePerm(session, "assets", "update");
  const a = await db.fixedAsset.findFirst({ where: { id, deletedAt: null } });
  if (!a) throw notFound("الأصل غير موجود");
  if (a.status === "DISPOSED") throw badRequest("الأصل مستبعد");
  const [rooms, branches] = await Promise.all([db.room.findMany({ select: { id: true, name: true } }), db.branch.findMany({ select: { id: true, name: true } })]);
  const place = (b: string | null, r: string | null, l: string | null) => [branches.find((x) => x.id === b)?.name, rooms.find((x) => x.id === r)?.name, l].filter(Boolean).join(" — ") || "—";
  const costCenterId = await branchCostCenter(db, session.tenant.id, input.branchId ?? a.branchId);
  await db.assetMovement.create({ data: { tenantId: session.tenant.id, assetId: a.id, kind: "TRANSFER", date: dateOnly(input.date), fromText: place(a.branchId, a.roomId, a.location), toText: place(input.branchId ?? null, input.roomId ?? null, input.location ?? null), notes: input.notes ?? null, createdById: session.user.id } });
  return db.fixedAsset.update({ where: { id }, data: { branchId: input.branchId ?? null, roomId: input.roomId ?? null, location: input.location ?? null, custodianId: input.custodianId ?? a.custodianId, costCenterId } });
}

/**
 * إهلاك شهر: لكل أصل نشط بدأ تشغيله قبل نهاية الشهر، يُحتسب قسط كل شهر فائت حتى الشهر المطلوب،
 * ويُرحَّل قيد واحد مجمّع حسب (حساب المصروف، مجمع الإهلاك، مركز التكلفة).
 */
export async function runDepreciation(db: TenantDb, session: SessionData, month: string) {
  requirePerm(session, "assets", "update", "ترحيل الإهلاك من صلاحية المالية");
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("الشهر بصيغة YYYY-MM");
  if (month > todayOf(session).slice(0, 7)) throw badRequest("لا إهلاك لشهر لم يبدأ");
  if (await db.depreciationRun.findFirst({ where: { month } })) throw badRequest(`إهلاك ${month} مرحّل مسبقاً`);
  const end = monthEnd(month);
  const assets = await db.fixedAsset.findMany({ where: { deletedAt: null, status: "ACTIVE", inServiceDate: { lte: end }, OR: [{ lastDepreciatedMonth: null }, { lastDepreciatedMonth: { lt: month } }] }, include: { category: true } });
  const lines: Array<{ assetId: string; amount: number; book: number; expense: string; accum: string; cc: string | null; months: number; done: boolean }> = [];
  for (const a of assets) {
    let acc = a.accumulatedMinor;
    let m = a.lastDepreciatedMonth ? nextMonth(a.lastDepreciatedMonth) : monthOf(a.inServiceDate);
    let el = elapsed(a.inServiceDate, a.lastDepreciatedMonth);
    let total = 0;
    let count = 0;
    while (m <= month) {
      const d = monthlyDepreciation({ ...a, accumulatedMinor: acc, monthsElapsed: el });
      acc += d;
      total += d;
      el++;
      count++;
      m = nextMonth(m);
    }
    lines.push({ assetId: a.id, amount: total, book: a.costMinor - acc, expense: a.category.expenseAccountId, accum: a.category.accumAccountId, cc: a.costCenterId, months: count, done: a.method !== "NONE" && acc >= a.costMinor - a.salvageMinor });
  }
  const posted = lines.filter((l) => l.amount > 0);
  const total = posted.reduce((s, l) => s + l.amount, 0);
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let entryId: string | null = null;
    if (total > 0) {
      const groups = new Map<string, { expense: string; accum: string; cc: string | null; amount: number }>();
      for (const l of posted) {
        const k = `${l.expense}|${l.accum}|${l.cc ?? ""}`;
        const g = groups.get(k) ?? { expense: l.expense, accum: l.accum, cc: l.cc, amount: 0 };
        g.amount += l.amount;
        groups.set(k, g);
      }
      const entry = await postEntry(tx, session, {
        date: end,
        description: `الإهلاك الشهري ${month} (${posted.length} أصلاً)`,
        source: "DEPRECIATION",
        sourceType: "DepreciationRun",
        reference: month,
        lines: [...groups.values()].flatMap((g) => [
          { account: g.expense, debit: g.amount, costCenterId: g.cc },
          { account: g.accum, credit: g.amount, costCenterId: g.cc },
        ]),
      });
      entryId = entry.id;
    }
    const run = await tx.depreciationRun.create({ data: { tenantId: session.tenant.id, month, totalMinor: total, assets: posted.length, journalEntryId: entryId, createdById: session.user.id, lines: { create: posted.map((l) => ({ tenantId: session.tenant.id, assetId: l.assetId, amountMinor: l.amount, bookValueMinor: l.book })) } } });
    if (entryId) await tx.journalEntry.update({ where: { id: entryId }, data: { sourceId: run.id } });
    for (const l of lines) {
      await tx.fixedAsset.update({ where: { id: l.assetId }, data: { accumulatedMinor: { increment: l.amount }, lastDepreciatedMonth: month, ...(l.done ? { status: "FULLY_DEPRECIATED" } : {}) } });
      if (l.done) await tx.assetMovement.create({ data: { tenantId: session.tenant.id, assetId: l.assetId, kind: "DEPRECIATION_COMPLETE", date: end, notes: "اكتمل إهلاك الأصل (يبقى في السجل بقيمة الخردة)" } });
    }
    return { month, totalMinor: total, assets: posted.length, entryId };
  });
}

export async function depreciationRuns(db: TenantDb, session: SessionData) {
  requirePerm(session, "assets", "view");
  const runs = await db.depreciationRun.findMany({ orderBy: { month: "desc" }, take: 36 });
  const last = runs[0]?.month;
  const due = todayOf(session).slice(0, 7);
  // الشهر المقترح: التالي لآخر ترحيل، أو الشهر السابق للحالي
  const suggested = last ? nextMonth(last) : prevMonth(due);
  return { runs, suggested: suggested <= due ? suggested : null, canRun: hasPerm(session, "assets", "update") };
}

/**
 * استبعاد الأصل (بيع أو إتلاف): يُهلك حتى الشهر السابق للاستبعاد إن لزم، ثم قيد: مدين مجمع الإهلاك والمتحصلات،
 * دائن التكلفة، والفرق ربح أو خسارة.
 */
export async function disposeAsset(db: TenantDb, session: SessionData, id: string, input: { date: string; proceedsMinor: number; receivedIn: "CASH" | "BANK" | "NONE"; bankAccountId?: string | null; reason: string }) {
  requirePerm(session, "assets", "approve", "استبعاد الأصول يتطلب صلاحية الاعتماد");
  const a = await db.fixedAsset.findFirst({ where: { id, deletedAt: null }, include: { category: true } });
  if (!a) throw notFound("الأصل غير موجود");
  if (a.status === "DISPOSED") throw badRequest("الأصل مستبعد مسبقاً");
  if (input.proceedsMinor < 0) throw badRequest("المتحصلات غير سالبة");
  if (input.proceedsMinor > 0 && input.receivedIn === "NONE") throw badRequest("حدد أين استُلمت المتحصلات");
  const pending = a.status === "ACTIVE" && a.method !== "NONE" && (!a.lastDepreciatedMonth || a.lastDepreciatedMonth < prevMonth(input.date.slice(0, 7))) && monthOf(a.inServiceDate) <= prevMonth(input.date.slice(0, 7));
  if (pending) throw badRequest(`رحّل إهلاك الأشهر حتى ${prevMonth(input.date.slice(0, 7))} قبل الاستبعاد (آخر ترحيل ${a.lastDepreciatedMonth ?? "لا يوجد"})`);
  await ensureOpsAccounts(db, session.tenant.id);
  const gain = disposalGain(a.costMinor, a.accumulatedMinor, input.proceedsMinor);
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let cashAcc: string | null = null;
    if (input.proceedsMinor > 0) {
      if (input.receivedIn === "CASH") cashAcc = "key:CASH";
      else {
        const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId } }) : null;
        if (!bank) throw badRequest("اختر الحساب البنكي");
        cashAcc = bank.accountId;
      }
    }
    const entry = await postEntry(tx, session, {
      date: input.date,
      description: `استبعاد أصل: ${a.name} (${a.tag}) — ${input.reason}`,
      source: "FIXED_ASSET",
      sourceType: "FixedAsset",
      sourceId: a.id,
      reference: a.tag,
      lines: [
        { account: a.category.accumAccountId, debit: a.accumulatedMinor, costCenterId: a.costCenterId },
        ...(cashAcc ? [{ account: cashAcc, debit: input.proceedsMinor }] : []),
        ...(gain < 0 ? [{ account: "key:ASSET_LOSS", debit: -gain, costCenterId: a.costCenterId }] : []),
        { account: a.category.assetAccountId, credit: a.costMinor, costCenterId: a.costCenterId },
        ...(gain > 0 ? [{ account: "key:ASSET_GAIN", credit: gain }] : []),
      ],
    });
    await tx.assetMovement.create({ data: { tenantId: session.tenant.id, assetId: a.id, kind: "DISPOSAL", date: dateOnly(input.date), fromText: a.location, notes: `${input.reason}${input.proceedsMinor ? ` — متحصلات ${money(session, input.proceedsMinor)}` : ""}`, createdById: session.user.id } });
    return tx.fixedAsset.update({ where: { id: a.id }, data: { status: "DISPOSED", disposedAt: dateOnly(input.date), disposalProceedsMinor: input.proceedsMinor, disposalGainMinor: gain, disposalEntryId: entry.id } });
  });
}

/** المهمة المجدولة: ترحيل إهلاك الشهر المنصرم تلقائياً إن فُعّل */
export async function autoDepreciate(db: TenantDb, session: SessionData) {
  const month = prevMonth(todayOf(session).slice(0, 7));
  if (await db.depreciationRun.findFirst({ where: { month } })) return null;
  if (!(await db.fixedAsset.count({ where: { status: "ACTIVE", deletedAt: null } }))) return null;
  return runDepreciation(db, session, month);
}

export { isoOf };
