/**
 * المخزون: الأصناف والمستودعات والأرصدة، الرصيد الافتتاحي، الصرف للأقسام بقيد (مصروف ← مخزون)،
 * التحويل بين المستودعات، والجرد الدوري بقيد العجز والزيادة. التكلفة بالمتوسط المرجّح.
 */
import { averageCost } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { accountByKey, branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { canOps, dateOnly, ensureOpsAccounts, lowStockItems, moveStock, nextNo, requireOps, todayOf } from "./common";

export const ITEM_CATEGORIES = ["UNIFORM", "BOOK", "SUPPLY", "CANTEEN", "SPARE_PART", "MEDICAL", "OTHER"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** الحسابات الافتراضية لكل فئة */
const CATEGORY_KEYS: Record<ItemCategory, { inv: string; cogs?: string; rev?: string; exp: string }> = {
  UNIFORM: { inv: "INV_STORE", cogs: "COGS_STORE", rev: "REV_SALES", exp: "SUPPLIES_EDU" },
  BOOK: { inv: "INV_STORE", cogs: "COGS_STORE", rev: "REV_SALES", exp: "SUPPLIES_EDU" },
  CANTEEN: { inv: "INV_CANTEEN", cogs: "COGS_CANTEEN", rev: "REV_CANTEEN", exp: "SUPPLIES_OFFICE" },
  SUPPLY: { inv: "INV_SUPPLIES", exp: "SUPPLIES_OFFICE" },
  SPARE_PART: { inv: "INV_SUPPLIES", exp: "MAINTENANCE_EXPENSE" },
  MEDICAL: { inv: "INV_SUPPLIES", exp: "SUPPLIES_OFFICE" },
  OTHER: { inv: "INV_SUPPLIES", exp: "SUPPLIES_OFFICE" },
};

export async function defaultAccounts(db: TenantDb, tenantId: string, category: ItemCategory) {
  await ensureOpsAccounts(db, tenantId);
  const k = CATEGORY_KEYS[category];
  return {
    inventoryAccountId: await accountByKey(db, k.inv),
    cogsAccountId: k.cogs ? await accountByKey(db, k.cogs) : null,
    revenueAccountId: k.rev ? await accountByKey(db, k.rev) : null,
    expenseAccountId: await accountByKey(db, k.exp),
  };
}

// ---------------------------------------------------------------------
// المستودعات
// ---------------------------------------------------------------------

export async function listWarehouses(db: TenantDb, session: SessionData) {
  requireOps(session, "inventory", "view");
  const [whs, branches] = await Promise.all([db.warehouse.findMany({ orderBy: { code: "asc" }, include: { levels: { include: { item: { select: { onHandQty: true, stockValueMinor: true } } } } } }), db.branch.findMany({ select: { id: true, name: true } })]);
  return whs.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    kind: w.kind,
    branchId: w.branchId,
    branch: branches.find((b) => b.id === w.branchId)?.name ?? null,
    isActive: w.isActive,
    items: w.levels.filter((l) => l.quantity > 0).length,
    // قيمة تقديرية: كمية المستودع × متوسط التكلفة
    valueMinor: w.levels.reduce((s, l) => s + (l.item.onHandQty ? Math.round((l.item.stockValueMinor * l.quantity) / l.item.onHandQty) : 0), 0),
  }));
}

export async function saveWarehouse(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; name: string; kind: string; branchId?: string | null; isActive: boolean }) {
  requireOps(session, "inventory", "update");
  const data = { code: input.code.trim().toUpperCase(), name: input.name.trim(), kind: input.kind, branchId: input.branchId || null, isActive: input.isActive };
  if (await db.warehouse.findFirst({ where: { code: data.code, ...(input.id ? { id: { not: input.id } } : {}) } })) throw badRequest("رمز المستودع مستخدم");
  return input.id ? db.warehouse.update({ where: { id: input.id }, data }) : db.warehouse.create({ data: { tenantId: session.tenant.id, ...data } });
}

// ---------------------------------------------------------------------
// الأصناف
// ---------------------------------------------------------------------

export async function listItems(db: TenantDb, session: SessionData, input: { category?: string | null; q?: string | null; warehouseId?: string | null; sellable?: boolean | null; lowOnly?: boolean } = {}) {
  requireOps(session, "inventory", "view");
  const q = input.q?.trim();
  const items = await db.inventoryItem.findMany({
    where: { deletedAt: null, ...(input.category ? { category: input.category } : {}), ...(input.sellable !== null && input.sellable !== undefined ? { sellable: input.sellable } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: q }] } : {}) },
    include: { levels: { include: { warehouse: { select: { name: true } } } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const rows = items.map((i) => ({
    id: i.id,
    sku: i.sku,
    barcode: i.barcode,
    name: i.name,
    category: i.category,
    unit: i.unit,
    minQty: i.minQty,
    reorderQty: i.reorderQty,
    onHandQty: input.warehouseId ? (i.levels.find((l) => l.warehouseId === input.warehouseId)?.quantity ?? 0) : i.onHandQty,
    totalQty: i.onHandQty,
    avgCostMinor: averageCost(i.onHandQty, i.stockValueMinor),
    stockValueMinor: i.stockValueMinor,
    salePriceMinor: i.salePriceMinor,
    sellable: i.sellable,
    taxCodeId: i.taxCodeId,
    isActive: i.isActive,
    low: i.minQty > 0 && i.onHandQty <= i.minQty,
    levels: i.levels.map((l) => ({ warehouseId: l.warehouseId, warehouse: l.warehouse.name, quantity: l.quantity })),
  }));
  const filtered = input.lowOnly ? rows.filter((r) => r.low) : rows;
  return {
    items: filtered,
    totals: { value: rows.reduce((s, r) => s + r.stockValueMinor, 0), low: rows.filter((r) => r.low).length, count: rows.length },
    canEdit: canOps(session, "inventory", "update"),
  };
}

export interface ItemInput {
  id?: string | null;
  sku: string;
  barcode?: string | null;
  name: string;
  category: ItemCategory;
  unit: string;
  minQty: number;
  reorderQty: number;
  sellable: boolean;
  salePriceMinor?: number | null;
  taxCodeId?: string | null;
  isActive: boolean;
}

export async function saveItem(db: TenantDb, session: SessionData, input: ItemInput) {
  requireOps(session, "inventory", "update");
  const sku = input.sku.trim().toUpperCase();
  if (!sku) throw badRequest("رمز الصنف مطلوب");
  if (await db.inventoryItem.findFirst({ where: { sku, deletedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } })) throw badRequest("رمز الصنف مستخدم");
  if (input.barcode && (await db.inventoryItem.findFirst({ where: { barcode: input.barcode, deletedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } }))) throw badRequest("الباركود مستخدم لصنف آخر");
  if (input.sellable && !input.salePriceMinor) throw badRequest("حدد سعر البيع للصنف القابل للبيع");
  const base = { sku, barcode: input.barcode || null, name: input.name.trim(), category: input.category, unit: input.unit.trim() || "حبة", minQty: Math.max(0, input.minQty), reorderQty: Math.max(0, input.reorderQty), sellable: input.sellable, salePriceMinor: input.salePriceMinor ?? null, taxCodeId: input.taxCodeId || null, isActive: input.isActive };
  if (input.id) {
    const cur = await db.inventoryItem.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!cur) throw notFound("الصنف غير موجود");
    // تغيير الفئة يغيّر حسابات الصنف فقط إذا لم يكن له رصيد (حتى لا يختل رصيد حساب المخزون)
    if (cur.category !== input.category && cur.onHandQty > 0) throw badRequest("لا يمكن تغيير فئة صنف له رصيد؛ اصرف رصيده أولاً");
    const acc = cur.category !== input.category ? await defaultAccounts(db, session.tenant.id, input.category) : {};
    return db.inventoryItem.update({ where: { id: cur.id }, data: { ...base, ...acc } });
  }
  return db.inventoryItem.create({ data: { tenantId: session.tenant.id, ...base, ...(await defaultAccounts(db, session.tenant.id, input.category)) } });
}

export async function getItem(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "view");
  const i = await db.inventoryItem.findFirst({ where: { id, deletedAt: null }, include: { levels: { include: { warehouse: { select: { name: true } } } } } });
  if (!i) throw notFound("الصنف غير موجود");
  const moves = await db.stockMovement.findMany({ where: { itemId: id }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 100 });
  const whs = await db.warehouse.findMany({ select: { id: true, name: true } });
  return {
    item: { ...i, avgCostMinor: averageCost(i.onHandQty, i.stockValueMinor) },
    movements: moves.map((m) => ({ ...m, warehouse: whs.find((w) => w.id === m.warehouseId)?.name ?? "" })),
    canEdit: canOps(session, "inventory", "update"),
  };
}

/** رصيد افتتاحي بقيد: مدين المخزون، دائن الأرصدة الافتتاحية */
export async function openingStock(db: TenantDb, session: SessionData, input: { itemId: string; warehouseId: string; quantity: number; unitCostMinor: number; date: string }) {
  requireOps(session, "inventory", "update");
  if (input.quantity <= 0 || input.unitCostMinor < 0) throw badRequest("كمية وتكلفة صحيحتان");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const { value, item, movement } = await moveStock(tx, session, { itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity, unitCostMinor: input.unitCostMinor, kind: "OPENING", date: input.date, reference: "رصيد افتتاحي" });
    if (value > 0) {
      const e = await postEntry(tx, session, { date: input.date, description: `رصيد افتتاحي: ${item.name}`, source: "INVENTORY", sourceType: "InventoryItem", sourceId: item.id, lines: [{ account: item.inventoryAccountId, debit: value }, { account: "key:OPENING_EQUITY", credit: value }] });
      await tx.stockMovement.update({ where: { id: movement.id }, data: { journalEntryId: e.id } });
    }
    return movement;
  });
}

/** صرف للأقسام: مدين مصروف الصنف (بمركز تكلفة الفرع)، دائن المخزون */
export interface IssueInput {
  warehouseId: string;
  date: string;
  branchId?: string | null;
  requestedBy?: string | null;
  purpose: string;
  lines: Array<{ itemId: string; quantity: number }>;
  sourceType?: string;
  sourceId?: string;
  expenseAccountId?: string | null;
}

export async function issueStock(db: TenantDb, session: SessionData, input: IssueInput) {
  requireOps(session, "inventory", "create");
  return issueStockCore(db, session, input);
}

/** الصرف دون فحص صلاحية المخزون (للوحدات التي تصرف ضمن عملها: قطع الصيانة) */
export async function issueStockCore(db: TenantDb, session: SessionData, input: IssueInput) {
  if (!input.lines.length) throw badRequest("أضف صنفاً واحداً على الأقل");
  const wh = await db.warehouse.findFirst({ where: { id: input.warehouseId, isActive: true } });
  if (!wh) throw notFound("المستودع غير موجود");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const cc = await branchCostCenter(tx, session.tenant.id, input.branchId ?? wh.branchId);
    const ref = `صرف ${await nextNo(tx, session, "stock-issue")}`;
    const posting: Array<{ account: string; debit?: number; credit?: number; costCenterId?: string | null; description?: string }> = [];
    let total = 0;
    const moves = [];
    for (const l of input.lines) {
      if (l.quantity <= 0) throw badRequest("الكميات موجبة");
      const { value, item, movement } = await moveStock(tx, session, { itemId: l.itemId, warehouseId: wh.id, quantity: -l.quantity, kind: "ISSUE", date: input.date, reference: ref, sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null, costCenterId: cc, notes: [input.purpose, input.requestedBy].filter(Boolean).join(" — ") });
      moves.push(movement);
      const cost = -value;
      total += cost;
      posting.push({ account: input.expenseAccountId ?? item.expenseAccountId ?? (await accountByKey(tx, "SUPPLIES_OFFICE")), debit: cost, costCenterId: cc, description: `${item.name} × ${l.quantity}` });
      posting.push({ account: item.inventoryAccountId, credit: cost });
    }
    let entryId: string | null = null;
    if (total > 0) {
      const e = await postEntry(tx, session, { date: input.date, description: `صرف مخزون: ${input.purpose}`, source: "INVENTORY", sourceType: input.sourceType ?? "StockIssue", sourceId: input.sourceId ?? null, reference: ref, lines: posting });
      entryId = e.id;
      await tx.stockMovement.updateMany({ where: { id: { in: moves.map((m) => m.id) } }, data: { journalEntryId: e.id } });
    }
    return { reference: ref, totalCostMinor: total, entryId };
  });
}

/** تحويل بين مستودعين (بدون أثر محاسبي ما دام حساب المخزون واحداً) */
export async function transferStock(db: TenantDb, session: SessionData, input: { fromId: string; toId: string; date: string; lines: Array<{ itemId: string; quantity: number }>; notes?: string | null }) {
  requireOps(session, "inventory", "create");
  if (input.fromId === input.toId) throw badRequest("اختر مستودعين مختلفين");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const ref = `تحويل ${await nextNo(tx, session, "stock-transfer")}`;
    for (const l of input.lines) {
      if (l.quantity <= 0) throw badRequest("الكميات موجبة");
      const out = await moveStock(tx, session, { itemId: l.itemId, warehouseId: input.fromId, quantity: -l.quantity, kind: "TRANSFER_OUT", date: input.date, reference: ref, notes: input.notes ?? null });
      await moveStock(tx, session, { itemId: l.itemId, warehouseId: input.toId, quantity: l.quantity, valueMinor: -out.value, kind: "TRANSFER_IN", date: input.date, reference: ref, notes: input.notes ?? null });
    }
    return { reference: ref };
  });
}

// ---------------------------------------------------------------------
// الجرد الدوري
// ---------------------------------------------------------------------

export async function listCounts(db: TenantDb, session: SessionData) {
  requireOps(session, "inventory", "view");
  const [counts, whs] = await Promise.all([db.stockCount.findMany({ orderBy: { number: "desc" }, include: { _count: { select: { lines: true } } } }), db.warehouse.findMany({ select: { id: true, name: true } })]);
  return counts.map((c) => ({ ...c, warehouse: whs.find((w) => w.id === c.warehouseId)?.name ?? "", lines: c._count.lines }));
}

/** بدء جرد: لقطة بأرصدة النظام لكل أصناف المستودع */
export async function startCount(db: TenantDb, session: SessionData, input: { warehouseId: string; date: string; notes?: string | null }) {
  requireOps(session, "inventory", "create");
  if (await db.stockCount.findFirst({ where: { warehouseId: input.warehouseId, status: "OPEN" } })) throw badRequest("يوجد جرد مفتوح لهذا المستودع");
  const levels = await db.stockLevel.findMany({ where: { warehouseId: input.warehouseId, item: { deletedAt: null, isActive: true } } });
  const items = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } });
  return db.stockCount.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNo(db, session, "stock-count"),
      warehouseId: input.warehouseId,
      date: dateOnly(input.date),
      notes: input.notes ?? null,
      createdById: session.user.id,
      lines: { create: items.map((i) => ({ tenantId: session.tenant.id, itemId: i.id, systemQty: levels.find((l) => l.itemId === i.id)?.quantity ?? 0 })) },
    },
  });
}

export async function getCount(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "view");
  const c = await db.stockCount.findFirst({ where: { id }, include: { lines: true } });
  if (!c) throw notFound("الجرد غير موجود");
  const items = await db.inventoryItem.findMany({ where: { id: { in: c.lines.map((l) => l.itemId) } }, select: { id: true, sku: true, name: true, unit: true, barcode: true, onHandQty: true, stockValueMinor: true } });
  const wh = await db.warehouse.findFirst({ where: { id: c.warehouseId }, select: { name: true } });
  return {
    count: { ...c, warehouse: wh?.name ?? "" },
    lines: c.lines
      .map((l) => {
        const i = items.find((x) => x.id === l.itemId);
        const avg = i ? averageCost(i.onHandQty, i.stockValueMinor) : 0;
        const diff = l.countedQty === null ? null : l.countedQty - l.systemQty;
        return { id: l.id, itemId: l.itemId, sku: i?.sku ?? "", name: i?.name ?? "", unit: i?.unit ?? "", barcode: i?.barcode ?? null, systemQty: l.systemQty, countedQty: l.countedQty, diff, diffValueMinor: diff === null ? null : diff * avg };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar")),
    canEdit: c.status === "OPEN" && canOps(session, "inventory", "update"),
  };
}

export async function setCountLines(db: TenantDb, session: SessionData, input: { countId: string; lines: Array<{ id: string; countedQty: number | null }> }) {
  requireOps(session, "inventory", "update");
  const c = await db.stockCount.findFirst({ where: { id: input.countId } });
  if (!c || c.status !== "OPEN") throw badRequest("الجرد غير مفتوح");
  for (const l of input.lines) {
    if (l.countedQty !== null && (!Number.isSafeInteger(l.countedQty) || l.countedQty < 0)) throw badRequest("الكمية المعدودة عدد صحيح غير سالب");
    await db.stockCountLine.updateMany({ where: { id: l.id, countId: c.id }, data: { countedQty: l.countedQty } });
  }
  return { ok: true };
}

/** اعتماد الجرد: فروقات الأصناف المعدودة تُسوّى بحركة وقيد (عجز/زيادة المخزون) */
export async function postCount(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "approve", "اعتماد الجرد يتطلب صلاحية الاعتماد");
  const c = await db.stockCount.findFirst({ where: { id }, include: { lines: true } });
  if (!c || c.status !== "OPEN") throw badRequest("الجرد غير مفتوح");
  if (c.lines.some((l) => l.countedQty === null && l.systemQty > 0)) throw badRequest("أكمل عدّ الأصناف التي لها رصيد (أو أدخل صفراً)");
  await ensureOpsAccounts(db, session.tenant.id);
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    // الرصيد قد تغيّر منذ بدء الجرد: الفرق يُحسب على الرصيد الحالي للمستودع
    const lines: Array<{ account: string; debit?: number; credit?: number; description?: string }> = [];
    let net = 0;
    for (const l of c.lines) {
      if (l.countedQty === null) continue;
      const level = await tx.stockLevel.findFirst({ where: { itemId: l.itemId, warehouseId: c.warehouseId } });
      const current = level?.quantity ?? 0;
      const diff = l.countedQty - current;
      if (!diff) continue;
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      const unit = averageCost(item.onHandQty, item.stockValueMinor);
      const { value } = await moveStock(tx, session, { itemId: l.itemId, warehouseId: c.warehouseId, quantity: diff, unitCostMinor: unit, kind: "ADJUSTMENT", date: isoDate(c.date), reference: `جرد ${c.number}`, sourceType: "StockCount", sourceId: c.id });
      net += value;
      if (value > 0) lines.push({ account: item.inventoryAccountId, debit: value, description: `زيادة ${item.name}` }, { account: "key:INVENTORY_VARIANCE", credit: value });
      else if (value < 0) lines.push({ account: "key:INVENTORY_VARIANCE", debit: -value, description: `عجز ${item.name}` }, { account: item.inventoryAccountId, credit: -value });
    }
    let entryId: string | null = null;
    if (lines.length) entryId = (await postEntry(tx, session, { date: c.date, description: `تسوية جرد رقم ${c.number}`, source: "INVENTORY", sourceType: "StockCount", sourceId: c.id, lines })).id;
    return tx.stockCount.update({ where: { id: c.id }, data: { status: "POSTED", varianceMinor: net, journalEntryId: entryId } });
  });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function inventoryDashboard(db: TenantDb, session: SessionData) {
  requireOps(session, "inventory", "view");
  const today = todayOf(session);
  const [low, value, pendingPr, openPo, openBills, recent] = await Promise.all([
    lowStockItems(db),
    db.inventoryItem.aggregate({ where: { deletedAt: null }, _sum: { stockValueMinor: true } }),
    db.purchaseRequest.count({ where: { status: "PENDING" } }),
    db.purchaseOrder.count({ where: { status: { in: ["ISSUED", "PARTIAL"] } } }),
    db.supplierBill.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true, dueDate: true } }),
    db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const items = await db.inventoryItem.findMany({ where: { id: { in: recent.map((r) => r.itemId) } }, select: { id: true, name: true, unit: true } });
  return {
    low,
    stockValueMinor: value._sum.stockValueMinor ?? 0,
    pendingRequests: pendingPr,
    openOrders: openPo,
    payableMinor: openBills.reduce((s, b) => s + b.totalMinor - b.paidMinor, 0),
    overdueMinor: openBills.filter((b) => isoDate(b.dueDate) < today).reduce((s, b) => s + b.totalMinor - b.paidMinor, 0),
    recent: recent.map((m) => ({ ...m, item: items.find((i) => i.id === m.itemId)?.name ?? "", unit: items.find((i) => i.id === m.itemId)?.unit ?? "" })),
  };
}
