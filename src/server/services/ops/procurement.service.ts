/**
 * المشتريات: الموردون وتقييمهم، طلب الشراء ← الموافقة ← أمر الشراء ← الاستلام ← فاتورة المورد ← السداد.
 * المطابقة الثلاثية: لا تُفوتر كمية لم تُستلم، وفرق السعر عن أمر الشراء ضمن نسبة مسموحة وإلا يلزم الاعتماد.
 * القيود: الاستلام (مخزون/مصروف ← مشتريات مستلمة لم تُفوتر)، الفاتورة (مستلمة لم تُفوتر + فروق + ضريبة مدخلات ← الموردون)،
 * السداد (الموردون ← البنك/الصندوق).
 */
import { applyBp } from "@/lib/finance/calc";
import { validTaxNumber, readRegion } from "@/lib/region";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { checkBudget } from "@/server/services/finance/budget.service";
import { branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { canOps, dateOnly, ensureOpsAccounts, isoOf, money, moveStock, nextNo, requireOps, settingsOf, todayOf } from "./common";

const lineNet = (l: { quantity: number; unitMinor: number }) => l.quantity * l.unitMinor;

// ---------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------

export async function listSuppliers(db: TenantDb, session: SessionData, input: { q?: string | null } = {}) {
  requireOps(session, "inventory", "view");
  const q = input.q?.trim();
  const [suppliers, bills] = await Promise.all([
    db.supplier.findMany({ where: { deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { taxNumber: { contains: q } }] } : {}) }, include: { ratings: { select: { quality: true, delivery: true, price: true } } }, orderBy: { name: "asc" } }),
    db.supplierBill.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { supplierId: true, totalMinor: true, paidMinor: true, dueDate: true } }),
  ]);
  const today = todayOf(session);
  return {
    suppliers: suppliers.map((s) => {
      const open = bills.filter((b) => b.supplierId === s.id);
      const r = s.ratings;
      return {
        id: s.id,
        number: s.number,
        name: s.name,
        category: s.category,
        phone: s.phone,
        email: s.email,
        taxNumber: s.taxNumber,
        paymentTermsDays: s.paymentTermsDays,
        isActive: s.isActive,
        balanceMinor: open.reduce((t, b) => t + b.totalMinor - b.paidMinor, 0),
        overdueMinor: open.filter((b) => isoOf(b.dueDate)! < today).reduce((t, b) => t + b.totalMinor - b.paidMinor, 0),
        ratingTenths: r.length ? Math.round((r.reduce((t, x) => t + x.quality + x.delivery + x.price, 0) * 10) / (r.length * 3)) : null,
        ratings: r.length,
      };
    }),
    canEdit: canOps(session, "inventory", "update"),
  };
}

export interface SupplierInput {
  id?: string | null;
  name: string;
  taxNumber?: string | null;
  crNumber?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  iban?: string | null;
  paymentTermsDays: number;
  category?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export async function saveSupplier(db: TenantDb, session: SessionData, input: SupplierInput) {
  requireOps(session, "inventory", "update");
  if (input.name.trim().length < 2) throw badRequest("اسم المورد مطلوب");
  const region = readRegion(session.tenant.settings);
  if (input.taxNumber && !validTaxNumber(input.taxNumber, region)) throw badRequest(`${region.taxNumberLabel}: صيغة غير صحيحة`);
  const data = { name: input.name.trim(), taxNumber: input.taxNumber || null, crNumber: input.crNumber || null, contactName: input.contactName || null, phone: input.phone || null, email: input.email || null, address: input.address || null, iban: input.iban?.replace(/\s/g, "").toUpperCase() || null, paymentTermsDays: Math.max(0, input.paymentTermsDays), category: input.category || null, notes: input.notes || null, isActive: input.isActive };
  return input.id ? db.supplier.update({ where: { id: input.id }, data }) : db.supplier.create({ data: { tenantId: session.tenant.id, number: await nextNo(db, session, "supplier"), ...data } });
}

export async function getSupplier(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "view");
  const s = await db.supplier.findFirst({ where: { id, deletedAt: null }, include: { ratings: { orderBy: { createdAt: "desc" } } } });
  if (!s) throw notFound("المورد غير موجود");
  const [orders, bills, payments] = await Promise.all([
    db.purchaseOrder.findMany({ where: { supplierId: id }, orderBy: { number: "desc" }, take: 50 }),
    db.supplierBill.findMany({ where: { supplierId: id }, orderBy: { billDate: "desc" }, take: 50 }),
    db.supplierPayment.findMany({ where: { supplierId: id }, orderBy: { date: "desc" }, take: 50 }),
  ]);
  return { supplier: s, orders, bills, payments, balanceMinor: bills.filter((b) => b.status !== "CANCELLED").reduce((t, b) => t + b.totalMinor - b.paidMinor, 0), canEdit: canOps(session, "inventory", "update") };
}

export async function rateSupplier(db: TenantDb, session: SessionData, input: { supplierId: string; orderId?: string | null; quality: number; delivery: number; price: number; comment?: string | null }) {
  requireOps(session, "inventory", "update");
  for (const v of [input.quality, input.delivery, input.price]) if (!Number.isInteger(v) || v < 1 || v > 5) throw badRequest("التقييم من ١ إلى ٥");
  return db.supplierRating.create({ data: { tenantId: session.tenant.id, supplierId: input.supplierId, orderId: input.orderId ?? null, quality: input.quality, delivery: input.delivery, price: input.price, comment: input.comment ?? null, createdById: session.user.id } });
}

// ---------------------------------------------------------------------
// طلبات الشراء
// ---------------------------------------------------------------------

export async function listRequests(db: TenantDb, session: SessionData) {
  const mine = !canOps(session, "inventory", "view");
  const [reqs, users] = await Promise.all([
    db.purchaseRequest.findMany({ where: mine ? { requestedById: session.user.id } : {}, orderBy: { number: "desc" }, include: { lines: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  return {
    requests: reqs.map((r) => ({ ...r, requestedBy: users.find((u) => u.id === r.requestedById)?.name ?? "" })),
    canManage: canOps(session, "inventory", "create"),
  };
}

export async function saveRequest(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; branchId?: string | null; neededBy?: string | null; justification?: string | null; lines: Array<{ itemId?: string | null; description: string; quantity: number; estUnitMinor: number }> }) {
  // أي موظف له صلاحية إنشاء في المخزون أو المشتريات يطلب؛ الموظف العادي عبر «سجلاتي»
  if (!canOps(session, "inventory", "create") && !canOps(session, "maintenance", "create")) throw forbidden("طلب الشراء لمسؤولي المخزون والصيانة");
  if (!input.lines.length) throw badRequest("أضف بنداً واحداً على الأقل");
  for (const l of input.lines) if (l.quantity <= 0 || l.estUnitMinor < 0 || !l.description.trim()) throw badRequest("كل بند بوصف وكمية موجبة");
  const total = input.lines.reduce((s, l) => s + l.quantity * l.estUnitMinor, 0);
  const costCenterId = await branchCostCenter(db, session.tenant.id, input.branchId);
  const data = { title: input.title.trim(), branchId: input.branchId || null, costCenterId, neededBy: input.neededBy ? dateOnly(input.neededBy) : null, justification: input.justification || null, estimatedTotalMinor: total };
  const lines = input.lines.map((l) => ({ tenantId: session.tenant.id, itemId: l.itemId || null, description: l.description.trim(), quantity: l.quantity, estUnitMinor: l.estUnitMinor }));
  if (input.id) {
    const r = await db.purchaseRequest.findFirst({ where: { id: input.id } });
    if (!r) throw notFound("الطلب غير موجود");
    if (r.status !== "DRAFT" && r.status !== "REJECTED") throw badRequest("يُعدَّل الطلب قبل رفعه فقط");
    return db.$transaction(async (tx) => {
      await tx.purchaseRequestLine.deleteMany({ where: { requestId: r.id } });
      return tx.purchaseRequest.update({ where: { id: r.id }, data: { ...data, status: "DRAFT", lines: { create: lines } } });
    });
  }
  return db.purchaseRequest.create({ data: { tenantId: session.tenant.id, number: await nextNo(db, session, "purchase-request"), requestedById: session.user.id, ...data, lines: { create: lines } } });
}

export async function submitRequest(db: TenantDb, session: SessionData, id: string) {
  const r = await db.purchaseRequest.findFirst({ where: { id }, include: { lines: true } });
  if (!r) throw notFound("الطلب غير موجود");
  if (r.requestedById !== session.user.id && !canOps(session, "inventory", "update")) throw forbidden();
  if (r.status !== "DRAFT" && r.status !== "REJECTED") throw badRequest("الطلب مرفوع مسبقاً");
  const above = r.estimatedTotalMinor > settingsOf(session, "procurement").principalApprovalAboveMinor;
  const req = await createApprovalRequest(db, session, {
    type: "purchase_request",
    title: `طلب شراء ${r.number}: ${r.title}`,
    description: `القيمة التقديرية ${money(session, r.estimatedTotalMinor)} — ${r.lines.length} بنود`,
    entityType: "PurchaseRequest",
    entityId: r.id,
    link: `/inventory/purchasing/requests/${r.id}`,
    steps: [{ name: "مراجعة المحاسب", approverRoleKey: "ACCOUNTANT" }, ...(above ? [{ name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" }] : [])],
  });
  return db.purchaseRequest.update({ where: { id: r.id }, data: { status: "PENDING", approvalRequestId: req.id } });
}

export async function onPurchaseRequestApproval(db: TenantDb, _session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  await db.purchaseRequest.updateMany({ where: { id: request.entityId, status: "PENDING" }, data: { status: event.decision === "APPROVED" ? "APPROVED" : "REJECTED" } });
}

export async function getRequest(db: TenantDb, session: SessionData, id: string) {
  const r = await db.purchaseRequest.findFirst({ where: { id }, include: { lines: true } });
  if (!r) throw notFound("الطلب غير موجود");
  if (r.requestedById !== session.user.id) requireOps(session, "inventory", "view");
  const [approval, orders, requester] = await Promise.all([
    r.approvalRequestId ? db.approvalRequest.findFirst({ where: { id: r.approvalRequestId }, include: { steps: { orderBy: { order: "asc" } } } }) : null,
    db.purchaseOrder.findMany({ where: { requestId: r.id }, select: { id: true, number: true, status: true, totalMinor: true } }),
    db.user.findFirst({ where: { id: r.requestedById }, select: { name: true } }),
  ]);
  return { request: { ...r, requestedBy: requester?.name ?? "" }, approval, orders, canOrder: r.status === "APPROVED" && canOps(session, "inventory", "create"), canEdit: (r.status === "DRAFT" || r.status === "REJECTED") && (r.requestedById === session.user.id || canOps(session, "inventory", "update")) };
}

// ---------------------------------------------------------------------
// أوامر الشراء
// ---------------------------------------------------------------------

export async function listOrders(db: TenantDb, session: SessionData, input: { status?: string | null } = {}) {
  requireOps(session, "inventory", "view");
  const [orders, suppliers] = await Promise.all([db.purchaseOrder.findMany({ where: input.status ? { status: input.status } : {}, orderBy: { number: "desc" }, include: { lines: true } }), db.supplier.findMany({ select: { id: true, name: true } })]);
  return orders.map((o) => ({ ...o, supplier: suppliers.find((s) => s.id === o.supplierId)?.name ?? "", receivedPct: Math.round((o.lines.reduce((t, l) => t + l.receivedQty, 0) * 100) / Math.max(1, o.lines.reduce((t, l) => t + l.quantity, 0))) }));
}

export interface OrderLineInput {
  itemId?: string | null;
  expenseAccountId?: string | null;
  description: string;
  quantity: number;
  unitMinor: number;
  taxBp: number;
}

/** إنشاء أمر شراء: من طلب معتمد، أو مباشرة لمن يملك صلاحية الاعتماد */
export async function createOrder(db: TenantDb, session: SessionData, input: { supplierId: string; requestId?: string | null; warehouseId: string; orderDate: string; expectedDate?: string | null; notes?: string | null; lines: OrderLineInput[] }) {
  requireOps(session, "inventory", "create");
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null, isActive: true } });
  if (!supplier) throw notFound("المورد غير موجود أو موقوف");
  let costCenterId: string | null = null;
  if (input.requestId) {
    const r = await db.purchaseRequest.findFirst({ where: { id: input.requestId } });
    if (!r || r.status !== "APPROVED") throw badRequest("طلب الشراء غير معتمد");
    costCenterId = r.costCenterId;
  } else if (!canOps(session, "inventory", "approve")) throw forbidden("أمر الشراء المباشر (دون طلب معتمد) يتطلب صلاحية الاعتماد");
  if (!input.lines.length) throw badRequest("أضف بنداً واحداً على الأقل");
  for (const l of input.lines) {
    if (l.quantity <= 0 || l.unitMinor < 0) throw badRequest("كمية موجبة وسعر غير سالب");
    if (!l.itemId && !l.expenseAccountId) throw badRequest(`البند «${l.description}»: اختر صنفاً مخزنياً أو حساب مصروف للخدمة`);
    if (l.taxBp < 0 || l.taxBp > 5000) throw badRequest("نسبة ضريبة غير صالحة");
  }
  const subtotal = input.lines.reduce((s, l) => s + lineNet(l), 0);
  const tax = input.lines.reduce((s, l) => s + applyBp(lineNet(l), l.taxBp), 0);
  return db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        tenantId: session.tenant.id,
        number: await nextNo(tx as unknown as TenantDb, session, "purchase-order"),
        supplierId: supplier.id,
        requestId: input.requestId ?? null,
        warehouseId: input.warehouseId,
        orderDate: dateOnly(input.orderDate),
        expectedDate: input.expectedDate ? dateOnly(input.expectedDate) : null,
        subtotalMinor: subtotal,
        taxMinor: tax,
        totalMinor: subtotal + tax,
        costCenterId,
        notes: input.notes ?? null,
        createdById: session.user.id,
        lines: { create: input.lines.map((l) => ({ tenantId: session.tenant.id, itemId: l.itemId || null, expenseAccountId: l.itemId ? null : l.expenseAccountId, description: l.description.trim(), quantity: l.quantity, unitMinor: l.unitMinor, taxBp: l.taxBp })) },
      },
    });
    if (input.requestId) await tx.purchaseRequest.update({ where: { id: input.requestId }, data: { status: "ORDERED" } });
    return po;
  });
}

export async function getOrder(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "view");
  const o = await db.purchaseOrder.findFirst({ where: { id }, include: { lines: true } });
  if (!o) throw notFound("أمر الشراء غير موجود");
  const [supplier, warehouse, receipts, bills, items, accounts] = await Promise.all([
    db.supplier.findFirst({ where: { id: o.supplierId } }),
    db.warehouse.findFirst({ where: { id: o.warehouseId }, select: { name: true } }),
    db.goodsReceipt.findMany({ where: { orderId: o.id }, include: { lines: true }, orderBy: { number: "asc" } }),
    db.supplierBill.findMany({ where: { orderId: o.id }, orderBy: { number: "asc" } }),
    db.inventoryItem.findMany({ where: { id: { in: o.lines.map((l) => l.itemId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, unit: true, sku: true } }),
    db.account.findMany({ where: { id: { in: o.lines.map((l) => l.expenseAccountId).filter((x): x is string => Boolean(x)) } }, select: { id: true, code: true, name: true } }),
  ]);
  return {
    order: { ...o, supplier: supplier?.name ?? "", supplierId: o.supplierId, warehouse: warehouse?.name ?? "" },
    lines: o.lines.map((l) => ({ ...l, item: items.find((i) => i.id === l.itemId) ?? null, account: accounts.find((a) => a.id === l.expenseAccountId) ?? null, netMinor: lineNet(l) })),
    receipts,
    bills,
    canReceive: ["ISSUED", "PARTIAL"].includes(o.status) && canOps(session, "inventory", "create"),
    canIssue: o.status === "DRAFT" && canOps(session, "inventory", "create"),
    canBill: o.lines.some((l) => l.billedQty < l.receivedQty) && canOps(session, "inventory", "create"),
  };
}

export async function issueOrder(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "create");
  const o = await db.purchaseOrder.findFirst({ where: { id } });
  if (!o || o.status !== "DRAFT") throw badRequest("يُصدر أمر الشراء من المسودة فقط");
  return db.purchaseOrder.update({ where: { id }, data: { status: "ISSUED" } });
}

export async function cancelOrder(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "update");
  const o = await db.purchaseOrder.findFirst({ where: { id }, include: { lines: true } });
  if (!o) throw notFound("أمر الشراء غير موجود");
  if (o.lines.some((l) => l.receivedQty > 0)) throw badRequest("استُلم جزء من الأمر؛ أغلقه بدلاً من إلغائه");
  return db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
}

/**
 * استلام (كلي أو جزئي): الأصناف المخزنية تدخل المستودع بسعر أمر الشراء، والخدمات تُثبت مصروفاً.
 * القيد: مدين المخزون/المصروف، دائن «مشتريات مستلمة لم تصل فواتيرها».
 */
export async function receiveOrder(db: TenantDb, session: SessionData, input: { orderId: string; date: string; notes?: string | null; lines: Array<{ orderLineId: string; quantity: number }> }) {
  requireOps(session, "inventory", "create");
  const o = await db.purchaseOrder.findFirst({ where: { id: input.orderId }, include: { lines: true } });
  if (!o) throw notFound("أمر الشراء غير موجود");
  if (!["ISSUED", "PARTIAL"].includes(o.status)) throw badRequest("الاستلام لأمر شراء صادر فقط");
  const wanted = input.lines.filter((l) => l.quantity > 0);
  if (!wanted.length) throw badRequest("أدخل الكميات المستلمة");
  await ensureOpsAccounts(db, session.tenant.id);
  const supplier = await db.supplier.findFirstOrThrow({ where: { id: o.supplierId } });
  const warning = [];
  for (const w of wanted) {
    const l = o.lines.find((x) => x.id === w.orderLineId);
    if (l?.expenseAccountId) {
      const b = await checkBudget(db, session, { accountId: l.expenseAccountId, costCenterId: o.costCenterId, date: dateOnly(input.date), amountMinor: w.quantity * l.unitMinor });
      if (b) warning.push(b.message);
    }
  }
  const result = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const number = await nextNo(tx, session, "goods-receipt");
    const posting: Array<{ account: string; debit?: number; credit?: number; costCenterId?: string | null; description?: string }> = [];
    let total = 0;
    for (const w of wanted) {
      const l = o.lines.find((x) => x.id === w.orderLineId);
      if (!l) throw badRequest("بند غير موجود في أمر الشراء");
      if (l.receivedQty + w.quantity > l.quantity) throw badRequest(`«${l.description}»: المستلم يتجاوز المطلوب (${l.quantity - l.receivedQty} متبقية)`);
      const value = w.quantity * l.unitMinor;
      total += value;
      if (l.itemId) {
        const { item } = await moveStock(tx, session, { itemId: l.itemId, warehouseId: o.warehouseId, quantity: w.quantity, unitCostMinor: l.unitMinor, kind: "RECEIPT", date: input.date, reference: `استلام ${number} / أمر ${o.number}`, sourceType: "PurchaseOrder", sourceId: o.id });
        posting.push({ account: item.inventoryAccountId, debit: value, description: `${item.name} × ${w.quantity}` });
      } else posting.push({ account: l.expenseAccountId!, debit: value, costCenterId: o.costCenterId, description: `${l.description} × ${w.quantity}` });
      await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { receivedQty: { increment: w.quantity } } });
    }
    posting.push({ account: "key:GRNI", credit: total, description: `مستلم من ${supplier.name}` });
    const entry = total > 0 ? await postEntry(tx, session, { date: input.date, description: `استلام مشتريات — أمر ${o.number} (${supplier.name})`, source: "GOODS_RECEIPT", sourceType: "PurchaseOrder", sourceId: o.id, reference: `استلام ${number}`, lines: posting }) : null;
    const receipt = await tx.goodsReceipt.create({ data: { tenantId: session.tenant.id, number, orderId: o.id, warehouseId: o.warehouseId, date: dateOnly(input.date), notes: input.notes ?? null, journalEntryId: entry?.id ?? null, createdById: session.user.id, lines: { create: wanted.map((w) => ({ tenantId: session.tenant.id, orderLineId: w.orderLineId, quantity: w.quantity, unitMinor: o.lines.find((l) => l.id === w.orderLineId)!.unitMinor })) } } });
    const fresh = await tx.purchaseOrderLine.findMany({ where: { orderId: o.id } });
    const status = fresh.every((l) => l.receivedQty >= l.quantity) ? "RECEIVED" : "PARTIAL";
    await tx.purchaseOrder.update({ where: { id: o.id }, data: { status } });
    return { receipt, status, totalMinor: total };
  });
  return { ...result, warnings: warning };
}

// ---------------------------------------------------------------------
// فواتير الموردين والسداد
// ---------------------------------------------------------------------

export async function listBills(db: TenantDb, session: SessionData, input: { status?: string | null; supplierId?: string | null } = {}) {
  requireOps(session, "inventory", "view");
  const [bills, suppliers] = await Promise.all([db.supplierBill.findMany({ where: { ...(input.status ? { status: input.status } : {}), ...(input.supplierId ? { supplierId: input.supplierId } : {}) }, orderBy: { billDate: "desc" } }), db.supplier.findMany({ select: { id: true, name: true } })]);
  const today = todayOf(session);
  return bills.map((b) => ({ ...b, supplier: suppliers.find((s) => s.id === b.supplierId)?.name ?? "", overdue: ["OPEN", "PARTIAL"].includes(b.status) && isoOf(b.dueDate)! < today }));
}

export interface BillInput {
  supplierId: string;
  orderId?: string | null;
  supplierRef: string;
  billDate: string;
  dueDate?: string | null;
  /** بنود مطابقة لأمر الشراء */
  orderLines?: Array<{ orderLineId: string; quantity: number; unitMinor: number }>;
  /** بنود مباشرة (بلا أمر شراء): مصروف أو خدمة */
  directLines?: Array<{ accountId: string; description: string; quantity: number; unitMinor: number; taxBp: number }>;
  branchId?: string | null;
  attachments?: unknown[];
}

export async function createBill(db: TenantDb, session: SessionData, input: BillInput) {
  requireOps(session, "inventory", "create");
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null } });
  if (!supplier) throw notFound("المورد غير موجود");
  const ref = input.supplierRef.trim();
  if (!ref) throw badRequest("رقم فاتورة المورد مطلوب");
  if (await db.supplierBill.findFirst({ where: { supplierId: supplier.id, supplierRef: ref } })) throw badRequest("فاتورة المورد مسجلة مسبقاً بنفس الرقم");
  const tolerance = settingsOf(session, "procurement").priceToleranceBp;
  await ensureOpsAccounts(db, session.tenant.id);
  const o = input.orderId ? await db.purchaseOrder.findFirst({ where: { id: input.orderId, supplierId: supplier.id }, include: { lines: true } }) : null;
  if (input.orderId && !o) throw badRequest("أمر الشراء لا يخص هذا المورد");
  const orderLines = (input.orderLines ?? []).filter((l) => l.quantity > 0);
  const direct = input.directLines ?? [];
  if (!orderLines.length && !direct.length) throw badRequest("الفاتورة بلا بنود");
  if (orderLines.length && !o) throw badRequest("البنود المطابقة تحتاج أمر شراء");
  // المطابقة الثلاثية: الكمية ≤ المستلم غير المفوتر، والسعر ضمن السماحية
  let received = 0;
  let billedNet = 0;
  let tax = 0;
  let variance = 0;
  let outOfTolerance = false;
  const lines: Array<{ orderLineId: string | null; accountId: string | null; description: string; quantity: number; unitMinor: number; taxBp: number }> = [];
  for (const l of orderLines) {
    const pl = o!.lines.find((x) => x.id === l.orderLineId);
    if (!pl) throw badRequest("بند غير موجود في أمر الشراء");
    const open = pl.receivedQty - pl.billedQty;
    if (l.quantity > open) throw badRequest(`«${pl.description}»: لا تُفوتر كمية لم تُستلم (المستلم غير المفوتر ${open})`);
    const rv = l.quantity * pl.unitMinor;
    const bv = l.quantity * l.unitMinor;
    received += rv;
    billedNet += bv;
    variance += bv - rv;
    if (Math.abs(bv - rv) > applyBp(rv, tolerance)) outOfTolerance = true;
    tax += applyBp(bv, pl.taxBp);
    lines.push({ orderLineId: pl.id, accountId: null, description: pl.description, quantity: l.quantity, unitMinor: l.unitMinor, taxBp: pl.taxBp });
  }
  const costCenterId = o?.costCenterId ?? (await branchCostCenter(db, session.tenant.id, input.branchId));
  const warnings: string[] = [];
  for (const l of direct) {
    if (l.quantity <= 0 || l.unitMinor < 0) throw badRequest("كمية موجبة وسعر غير سالب");
    const net = lineNet(l);
    billedNet += net;
    tax += applyBp(net, l.taxBp);
    lines.push({ orderLineId: null, accountId: l.accountId, description: l.description.trim(), quantity: l.quantity, unitMinor: l.unitMinor, taxBp: l.taxBp });
    const b = await checkBudget(db, session, { accountId: l.accountId, costCenterId, date: dateOnly(input.billDate), amountMinor: net });
    if (b) warnings.push(b.message);
  }
  if (outOfTolerance && !canOps(session, "inventory", "approve")) throw forbidden(`فرق السعر عن أمر الشراء يتجاوز ${tolerance / 100}٪؛ يلزم مسؤول بصلاحية الاعتماد`);
  const total = billedNet + tax;
  const due = input.dueDate ?? new Date(dateOnly(input.billDate).getTime() + supplier.paymentTermsDays * 86_400_000).toISOString().slice(0, 10);
  const bill = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const number = await nextNo(tx, session, "supplier-bill");
    const entry = await postEntry(tx, session, {
      date: input.billDate,
      description: `فاتورة المورد ${supplier.name} رقم ${ref}`,
      source: "SUPPLIER_BILL",
      sourceType: "SupplierBill",
      reference: ref,
      lines: [
        ...(received ? [{ account: "key:GRNI", debit: received, description: "إقفال المستلم غير المفوتر" }] : []),
        ...(variance > 0 ? [{ account: "key:PURCHASE_VARIANCE", debit: variance, costCenterId }] : []),
        ...lines.filter((l) => l.accountId).map((l) => ({ account: l.accountId!, debit: lineNet(l), costCenterId, description: l.description })),
        ...(tax ? [{ account: "key:VAT_INPUT", debit: tax }] : []),
        ...(variance < 0 ? [{ account: "key:PURCHASE_VARIANCE", credit: -variance, costCenterId }] : []),
        { account: "key:AP", credit: total, description: supplier.name },
      ],
    });
    const b = await tx.supplierBill.create({
      data: {
        tenantId: session.tenant.id,
        number,
        supplierId: supplier.id,
        orderId: o?.id ?? null,
        supplierRef: ref,
        billDate: dateOnly(input.billDate),
        dueDate: dateOnly(due),
        subtotalMinor: billedNet,
        taxMinor: tax,
        totalMinor: total,
        matchStatus: !o ? "DIRECT" : variance ? "PRICE_VARIANCE" : "MATCHED",
        varianceMinor: variance,
        journalEntryId: entry.id,
        attachments: (input.attachments ?? []) as never,
        createdById: session.user.id,
        lines: { create: lines.map((l) => ({ tenantId: session.tenant.id, ...l })) },
      },
    });
    await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: b.id } });
    for (const l of orderLines) await tx.purchaseOrderLine.update({ where: { id: l.orderLineId }, data: { billedQty: { increment: l.quantity } } });
    if (o) {
      const fresh = await tx.purchaseOrderLine.findMany({ where: { orderId: o.id } });
      if (fresh.every((l) => l.billedQty >= l.quantity)) await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: "CLOSED" } });
    }
    return b;
  });
  return { bill, warnings };
}

export async function getBill(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "inventory", "view");
  const b = await db.supplierBill.findFirst({ where: { id }, include: { lines: true } });
  if (!b) throw notFound("الفاتورة غير موجودة");
  const [supplier, payments, order, accounts, banks] = await Promise.all([
    db.supplier.findFirst({ where: { id: b.supplierId } }),
    db.supplierPayment.findMany({ where: { billId: b.id }, orderBy: { date: "asc" } }),
    b.orderId ? db.purchaseOrder.findFirst({ where: { id: b.orderId }, select: { id: true, number: true } }) : null,
    db.account.findMany({ where: { id: { in: b.lines.map((l) => l.accountId).filter((x): x is string => Boolean(x)) } }, select: { id: true, code: true, name: true } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  return { bill: { ...b, supplier: supplier?.name ?? "" }, lines: b.lines.map((l) => ({ ...l, account: accounts.find((a) => a.id === l.accountId) ?? null })), payments, order, banks, canPay: ["OPEN", "PARTIAL"].includes(b.status) && canOps(session, "inventory", "approve") };
}

/** سداد فاتورة مورد (كلي أو جزئي): مدين الموردون، دائن البنك/الصندوق */
export async function paySupplier(db: TenantDb, session: SessionData, input: { billId: string; amountMinor: number; date: string; method: "CASH" | "BANK_TRANSFER" | "CHEQUE"; bankAccountId?: string | null; reference?: string | null }) {
  requireOps(session, "inventory", "approve", "سداد الموردين يتطلب صلاحية الاعتماد");
  const b = await db.supplierBill.findFirst({ where: { id: input.billId } });
  if (!b) throw notFound("الفاتورة غير موجودة");
  if (!["OPEN", "PARTIAL"].includes(b.status)) throw badRequest("الفاتورة مسددة أو ملغاة");
  const due = b.totalMinor - b.paidMinor;
  if (input.amountMinor <= 0 || input.amountMinor > due) throw badRequest(`المبلغ بين ١ والمتبقي (${money(session, due)})`);
  const supplier = await db.supplier.findFirstOrThrow({ where: { id: b.supplierId } });
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let credit = "key:CASH";
    if (input.method !== "CASH") {
      const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId } }) : null;
      if (!bank) throw badRequest("اختر الحساب البنكي");
      credit = bank.accountId;
    }
    const number = await nextNo(tx, session, "supplier-payment");
    const entry = await postEntry(tx, session, { date: input.date, description: `سداد المورد ${supplier.name} — فاتورة ${b.supplierRef}`, source: "SUPPLIER_PAYMENT", sourceType: "SupplierBill", sourceId: b.id, reference: input.reference ?? `سداد ${number}`, lines: [{ account: "key:AP", debit: input.amountMinor, description: supplier.name }, { account: credit, credit: input.amountMinor }] });
    const p = await tx.supplierPayment.create({ data: { tenantId: session.tenant.id, number, supplierId: supplier.id, billId: b.id, date: dateOnly(input.date), amountMinor: input.amountMinor, method: input.method, bankAccountId: input.bankAccountId ?? null, reference: input.reference ?? null, journalEntryId: entry.id, createdById: session.user.id } });
    const paid = b.paidMinor + input.amountMinor;
    await tx.supplierBill.update({ where: { id: b.id }, data: { paidMinor: paid, status: paid >= b.totalMinor ? "PAID" : "PARTIAL" } });
    return p;
  });
}
