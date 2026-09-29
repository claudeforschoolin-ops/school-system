/**
 * أدوات مشتركة لوحدات العمليات: الصلاحيات ونطاق الفروع، الحسابات النظامية للعمليات، بنود الرسوم
 * المساندة (غرامات المكتبة، مبيعات المتجر)، ومحرّك حركات المخزون بالمتوسط المرجّح.
 */
import { toISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { issueCost } from "@/lib/ops/calc";
import { resolveScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { readModuleSettings, type ModuleSettingsKey } from "@/server/services/module-settings.service";
import { nextNumber } from "@/server/services/sequence.service";

export type { Tx } from "@/server/services/finance/ledger";
type Db = TenantDb;

/** صلاحية موظف على الوحدة (المدرسة أو فرع أو مرحلة)؛ لا تكفي «سجلاتي/المسند إليه» */
export function requireOps(session: SessionData, module: string, action: Action, message?: string) {
  const s = resolveScope(session.access, module, action);
  if (!s || (s.kind === "limited" && !s.branchIds.length && !s.stageIds.length)) throw forbidden(message ?? "ليست لديك صلاحية على هذه الوحدة");
  return s;
}

export function canOps(session: SessionData, module: string, action: Action) {
  const s = resolveScope(session.access, module, action);
  return Boolean(s && (s.kind === "all" || s.branchIds.length || s.stageIds.length));
}

/** شرط الفروع حسب النطاق (السجلات بلا فرع مرئية للجميع) */
export function branchFilter(session: SessionData, module: string, action: Action = "view"): { OR?: Array<{ branchId: { in: string[] } | null }> } {
  const s = requireOps(session, module, action);
  return s.kind === "all" ? {} : { OR: [{ branchId: { in: s.branchIds } }, { branchId: null }] };
}

export function assertBranch(session: SessionData, module: string, action: Action, branchId: string | null | undefined) {
  const s = requireOps(session, module, action);
  if (s.kind === "limited" && branchId && !s.branchIds.includes(branchId)) throw forbidden("السجل في فرع خارج نطاقك");
}

export const settingsOf = <K extends ModuleSettingsKey>(session: Pick<SessionData, "tenant">, key: K) => readModuleSettings(session.tenant.settings, key);
export const todayOf = (session: Pick<SessionData, "tenant">) => toISODate(new Date(), session.tenant.timezone);
export const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const money = (session: Pick<SessionData, "tenant">, minor: number) => formatMoney(minor, { currency: session.tenant.currency, digits: "arab" });
export const nextNo = (db: Db, session: Pick<SessionData, "tenant">, key: string) => nextNumber(db, session.tenant.id, key);

// ---------------------------------------------------------------------
// الحسابات النظامية للعمليات (تُربط بالرموز القائمة في الدليل أو تُنشأ)
// ---------------------------------------------------------------------

type AccType = "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE";
const OPS_ACCOUNTS: Array<[key: string, code: string, name: string, type: AccType, parent: string]> = [
  ["INV_STORE", "1301", "مخزون الكتب والزي", "ASSET", "13"],
  ["INV_SUPPLIES", "1302", "مخزون المستلزمات", "ASSET", "13"],
  ["INV_CANTEEN", "1303", "مخزون المقصف", "ASSET", "13"],
  ["ASSET_LAND", "1501", "أراضٍ", "ASSET", "15"],
  ["ASSET_BUILDINGS", "1502", "مبانٍ", "ASSET", "15"],
  ["ASSET_FURNITURE", "1503", "أثاث وتجهيزات", "ASSET", "15"],
  ["ASSET_COMPUTERS", "1504", "أجهزة حاسب", "ASSET", "15"],
  ["ASSET_BUSES", "1505", "حافلات", "ASSET", "15"],
  ["GRNI", "2102", "مشتريات مستلمة لم تصل فواتيرها", "LIABILITY", "21"],
  ["REV_LIBRARY_FINES", "4702", "غرامات المكتبة", "REVENUE", "4"],
  ["ASSET_GAIN", "4803", "أرباح بيع أصول", "REVENUE", "4"],
  ["COGS_STORE", "5101", "تكلفة مبيعات الزي والكتب", "EXPENSE", "5"],
  ["COGS_CANTEEN", "5102", "تكلفة مبيعات المقصف", "EXPENSE", "5"],
  ["PURCHASE_VARIANCE", "5103", "فروقات أسعار المشتريات", "EXPENSE", "5"],
  ["INVENTORY_VARIANCE", "5104", "عجز وزيادة المخزون", "EXPENSE", "5"],
  ["MAINTENANCE_EXPENSE", "6601", "صيانة وإصلاح", "EXPENSE", "6"],
  ["TRANSPORT_EXPENSE", "6701", "نقل ووقود", "EXPENSE", "6"],
  ["SUPPLIES_EDU", "6801", "مستلزمات تعليمية", "EXPENSE", "6"],
  ["SUPPLIES_OFFICE", "6802", "مستلزمات مكتبية وقرطاسية", "EXPENSE", "6"],
  ["ASSET_LOSS", "7503", "خسائر استبعاد أصول", "EXPENSE", "6"],
];

const ensured = new Set<string>();

export async function ensureOpsAccounts(db: Db, tenantId: string) {
  if (ensured.has(tenantId)) return;
  for (const [key, code, name, type, parentCode] of OPS_ACCOUNTS) {
    if (await db.account.findFirst({ where: { systemKey: key, deletedAt: null } })) continue;
    const existing = await db.account.findFirst({ where: { code, deletedAt: null } });
    if (existing) {
      await db.account.update({ where: { id: existing.id }, data: { systemKey: key } });
      continue;
    }
    const parent = (await db.account.findFirst({ where: { code: parentCode, deletedAt: null } })) ?? (await db.account.findFirst({ where: { code: parentCode.slice(0, 1), deletedAt: null } }));
    await db.account.create({ data: { tenantId, code, name, type, normalSide: type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT", parentId: parent?.id ?? null, systemKey: key } });
  }
  ensured.add(tenantId);
}

/** بند رسوم مساند للفوترة من الوحدات (غرامات المكتبة، مبيعات المتجر على حساب الطالب) */
export async function ensureFeeItem(db: Db, tenantId: string, code: "LIBRARY_FINE" | "STORE_SALES") {
  const found = await db.feeItem.findFirst({ where: { code } });
  if (found) return found;
  await ensureOpsAccounts(db, tenantId);
  const acc = async (key: string) => (await db.account.findFirstOrThrow({ where: { systemKey: key, deletedAt: null } })).id;
  const vat = await db.taxCode.findFirst({ where: { code: "VAT" } });
  return db.feeItem.create({
    data:
      code === "LIBRARY_FINE"
        ? { tenantId, code, name: "غرامة تأخير إرجاع كتاب", kind: "OTHER", revenueAccountId: await acc("REV_LIBRARY_FINES"), receivableAccountId: await acc("AR_OTHER"), deferred: false, refundable: false, position: 90 }
        : { tenantId, code, name: "مشتريات المتجر المدرسي", kind: "OTHER", revenueAccountId: await acc("REV_SALES"), receivableAccountId: await acc("AR_OTHER"), deferred: false, refundable: false, taxCodeId: vat?.id ?? null, position: 91 },
  });
}

// ---------------------------------------------------------------------
// محرّك المخزون: كل وارد يرفع القيمة بتكلفته، وكل صادر يخرج بالمتوسط المرجّح
// ---------------------------------------------------------------------

export interface MoveInput {
  itemId: string;
  warehouseId: string;
  /** موجبة للوارد وسالبة للصادر */
  quantity: number;
  /** تكلفة الوحدة للوارد (تُحسب تلقائياً للصادر) */
  unitCostMinor?: number;
  /** قيمة الوارد الكاملة (بدل تكلفة الوحدة، لتجنب التقريب في التحويلات) */
  valueMinor?: number;
  kind: "OPENING" | "RECEIPT" | "ISSUE" | "SALE" | "SALE_RETURN" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT";
  date: string;
  reference?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  costCenterId?: string | null;
  notes?: string | null;
  allowNegative?: boolean;
}

/** يسجل حركة ويحدّث الرصيد والقيمة؛ يُستدعى داخل معاملة. يعيد قيمة الحركة (موجبة للوارد وسالبة للصادر) */
export async function moveStock(tx: Db, session: SessionData, m: MoveInput) {
  if (!Number.isSafeInteger(m.quantity) || m.quantity === 0) throw badRequest("كمية غير صالحة");
  const item = await tx.inventoryItem.findFirst({ where: { id: m.itemId, deletedAt: null } });
  if (!item) throw notFound("الصنف غير موجود");
  const level = await tx.stockLevel.findFirst({ where: { itemId: item.id, warehouseId: m.warehouseId } });
  let value: number;
  if (m.quantity > 0) {
    value = m.valueMinor ?? m.quantity * (m.unitCostMinor ?? 0);
    if (value < 0) throw badRequest("تكلفة غير صالحة");
  } else {
    const qty = -m.quantity;
    const inWarehouse = level?.quantity ?? 0;
    if (qty > inWarehouse) throw badRequest(`رصيد «${item.name}» في المستودع ${inWarehouse} ${item.unit} فقط`);
    value = -issueCost(item.onHandQty, item.stockValueMinor, qty);
  }
  await tx.inventoryItem.update({ where: { id: item.id }, data: { onHandQty: { increment: m.quantity }, stockValueMinor: { increment: value } } });
  if (level) await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: { increment: m.quantity } } });
  else await tx.stockLevel.create({ data: { tenantId: session.tenant.id, itemId: item.id, warehouseId: m.warehouseId, quantity: m.quantity } });
  const unitCost = Math.round(Math.abs(value) / Math.abs(m.quantity));
  const movement = await tx.stockMovement.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(tx, session.tenant.id, "stock-move"),
      itemId: item.id,
      warehouseId: m.warehouseId,
      kind: m.kind,
      quantity: m.quantity,
      unitCostMinor: unitCost,
      valueMinor: value,
      date: dateOnly(m.date),
      reference: m.reference ?? null,
      sourceType: m.sourceType ?? null,
      sourceId: m.sourceId ?? null,
      costCenterId: m.costCenterId ?? null,
      notes: m.notes ?? null,
      createdById: session.user.id,
    },
  });
  return { value, movement, item };
}

/** أصناف تحت الحد الأدنى (للتنبيهات ولوحة المخزون) */
export async function lowStockItems(db: Db) {
  const items = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true, minQty: { gt: 0 } }, select: { id: true, sku: true, name: true, onHandQty: true, minQty: true, reorderQty: true, unit: true, category: true } });
  return items.filter((i) => i.onHandQty <= i.minQty);
}
