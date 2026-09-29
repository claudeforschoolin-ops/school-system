/**
 * نقطة البيع: متجر الزي والكتب (نقد، بطاقة، أو على حساب الطالب بفاتورة) والمقصف (نقد أو محفظة الطالب).
 * محفظة الطالب مسبقة الدفع: شحن من الصندوق أو من رصيد ولي الأمر الدائن، حد يومي، فئات ممنوعة، إشعارات، وسجل حركات غير قابل للتعديل.
 * القيود: المبيعات (الصندوق/البنك/المحافظ ← الإيراد + الضريبة)، تكلفة البضاعة (التكلفة ← المخزون)، الشحن (الصندوق ← أرصدة المحافظ).
 */
import { toISODate } from "@/lib/dates";
import { resolveScope } from "@/lib/rbac/access";
import { exceedsDailyLimit, posTotals } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { buildDraft, issueDraft } from "@/server/services/finance/billing.service";
import { guardianCreditBalance } from "@/server/services/finance/collections.service";
import { branchCostCenter, postEntry, reverseEntry, type Tx } from "@/server/services/finance/ledger";
import { notify } from "@/server/services/notifications.service";
import { canOps, dateOnly, ensureFeeItem, ensureOpsAccounts, money, moveStock, nextNo, requireOps, settingsOf, todayOf } from "./common";

const MODULE = { STORE: "inventory", CANTEEN: "canteen" } as const;

/** أبناء المستخدم (ولي أمر) أو الطالب نفسه */
async function familyStudentIds(db: TenantDb, session: SessionData) {
  const rows = await db.student.findMany({ where: { deletedAt: null, OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function guardianUsers(db: TenantDb, studentId: string) {
  const rows = await db.studentGuardian.findMany({ where: { studentId }, include: { guardian: { select: { userId: true, id: true } } } });
  return { userIds: rows.map((r) => r.guardian.userId).filter((x): x is string => Boolean(x)), primaryGuardianId: rows.find((r) => r.isPrimary)?.guardian.id ?? rows[0]?.guardian.id ?? null };
}

// ---------------------------------------------------------------------
// كتالوج البيع
// ---------------------------------------------------------------------

/** قائمة المقصف للقراءة (لمنع أصناف بعينها من محفظة الابن) — لكل من يرى المقصف بما فيهم الأسرة */
export async function canteenMenu(db: TenantDb, session: SessionData) {
  // أي نطاق عرض (بما فيه نطاق الأسرة) يكفي؛ القائمة أسماء وأسعار فقط
  if (!resolveScope(session.access, "canteen", "view")) throw forbidden("ليست لديك صلاحية على المقصف");
  const items = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true, sellable: true, category: "CANTEEN" }, select: { id: true, name: true, salePriceMinor: true }, orderBy: { name: "asc" } });
  return items.map((i) => ({ id: i.id, name: i.name, priceMinor: i.salePriceMinor ?? 0 }));
}

export async function posCatalog(db: TenantDb, session: SessionData, kind: "STORE" | "CANTEEN") {
  requireOps(session, MODULE[kind], "create");
  const categories = kind === "STORE" ? ["UNIFORM", "BOOK", "SUPPLY", "OTHER"] : ["CANTEEN"];
  const [items, warehouses, taxCodes] = await Promise.all([
    db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true, sellable: true, category: { in: categories } }, include: { levels: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { isActive: true, kind: kind === "STORE" ? "STORE" : "CANTEEN" }, orderBy: { code: "asc" } }),
    db.taxCode.findMany({ select: { id: true, rateBp: true } }),
  ]);
  return {
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, branchId: w.branchId })),
    items: items.map((i) => ({ id: i.id, sku: i.sku, barcode: i.barcode, name: i.name, category: i.category, unit: i.unit, priceMinor: i.salePriceMinor ?? 0, taxBp: taxCodes.find((t) => t.id === i.taxCodeId)?.rateBp ?? 0, stock: Object.fromEntries(i.levels.map((l) => [l.warehouseId, l.quantity])) })),
  };
}

export interface SaleInput {
  kind: "STORE" | "CANTEEN";
  warehouseId: string;
  paymentMethod: "CASH" | "CARD" | "STUDENT_ACCOUNT" | "WALLET";
  studentId?: string | null;
  customerName?: string | null;
  lines: Array<{ itemId: string; quantity: number }>;
}

/** بيع: يتحقق من المخزون والمحفظة وحدودها، ثم يرحّل المبيعات والتكلفة */
export async function createSale(db: TenantDb, session: SessionData, input: SaleInput) {
  requireOps(session, MODULE[input.kind], "create");
  if (!input.lines.length) throw badRequest("السلة فارغة");
  if (input.kind === "CANTEEN" && input.paymentMethod === "STUDENT_ACCOUNT") throw badRequest("مشتريات المقصف نقداً أو من المحفظة");
  if (input.kind === "STORE" && input.paymentMethod === "WALLET") throw badRequest("المحفظة للمقصف فقط");
  if ((input.paymentMethod === "WALLET" || input.paymentMethod === "STUDENT_ACCOUNT") && !input.studentId) throw badRequest("اختر الطالب");
  const wh = await db.warehouse.findFirst({ where: { id: input.warehouseId, isActive: true } });
  if (!wh) throw notFound("المستودع غير موجود");
  await ensureOpsAccounts(db, session.tenant.id);
  const merged = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0) throw badRequest("كميات صحيحة موجبة");
    merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
  }
  const items = await db.inventoryItem.findMany({ where: { id: { in: [...merged.keys()] }, deletedAt: null, sellable: true, isActive: true } });
  if (items.length !== merged.size) throw badRequest("صنف غير متاح للبيع");
  const taxCodes = await db.taxCode.findMany({ select: { id: true, rateBp: true } });
  const priced = [...merged.entries()].map(([itemId, quantity]) => {
    const i = items.find((x) => x.id === itemId)!;
    return { item: i, quantity, unitMinor: i.salePriceMinor ?? 0, taxBp: taxCodes.find((t) => t.id === i.taxCodeId)?.rateBp ?? 0 };
  });
  const totals = posTotals(priced);
  const student = input.studentId ? await db.student.findFirst({ where: { id: input.studentId, deletedAt: null }, select: { id: true, fullName: true, branchId: true } }) : null;
  if (input.studentId && !student) throw notFound("الطالب غير موجود");

  // المحفظة: الرصيد، والحد اليومي، والفئات الممنوعة
  let wallet: Awaited<ReturnType<typeof ensureWallet>> | null = null;
  if (input.paymentMethod === "WALLET") {
    wallet = await ensureWallet(db, session, student!.id);
    if (!wallet.isActive) throw badRequest("محفظة الطالب موقوفة");
    const blocked = (wallet.blockedCategories as string[]) ?? [];
    const bad = priced.find((p) => blocked.includes(p.item.category) || blocked.includes(p.item.id));
    if (bad) throw badRequest(`«${bad.item.name}» غير مسموح لهذا الطالب (قيد ولي الأمر)`);
    if (wallet.balanceMinor < totals.totalMinor) throw badRequest(`رصيد المحفظة ${money(session, wallet.balanceMinor)} لا يكفي`);
    const spent = await spentToday(db, session, wallet.id);
    if (exceedsDailyLimit(spent, totals.totalMinor, wallet.dailyLimitMinor)) throw badRequest(`يتجاوز الحد اليومي (${money(session, wallet.dailyLimitMinor ?? 0)}؛ صُرف اليوم ${money(session, spent)})`);
  }

  const sale = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const number = await nextNo(tx, session, "sale");
    const today = todayOf(session);
    const cc = await branchCostCenter(tx, session.tenant.id, wh.branchId);
    let costTotal = 0;
    const costLines: Array<{ account: string; debit?: number; credit?: number; costCenterId?: string | null }> = [];
    const saleLines = [];
    const moveIds: string[] = [];
    for (const [idx, p] of priced.entries()) {
      const { value, movement } = await moveStock(tx, session, { itemId: p.item.id, warehouseId: wh.id, quantity: -p.quantity, kind: "SALE", date: today, reference: `بيع ${input.kind === "STORE" ? "متجر" : "مقصف"} ${number}`, sourceType: "Sale" });
      moveIds.push(movement.id);
      const cost = -value;
      costTotal += cost;
      if (cost) costLines.push({ account: p.item.cogsAccountId ?? "key:COGS_STORE", debit: cost, costCenterId: cc }, { account: p.item.inventoryAccountId, credit: cost });
      const t = totals.lines[idx]!;
      saleLines.push({ tenantId: session.tenant.id, itemId: p.item.id, name: p.item.name, quantity: p.quantity, unitMinor: p.unitMinor, taxBp: p.taxBp, taxMinor: t.taxMinor, totalMinor: t.totalMinor, costMinor: cost });
    }
    let invoiceId: string | null = null;
    let total = totals.totalMinor;
    let tax = totals.taxMinor;
    let revenueLines: Array<{ account: string; debit?: number; credit?: number; costCenterId?: string | null; studentId?: string | null }> = [];
    if (input.paymentMethod === "STUDENT_ACCOUNT") {
      // على حساب الطالب: فاتورة رسوم تظهر في كشف الأسرة (تُسدَّد من التحصيل)
      const fee = await ensureFeeItem(tx, session.tenant.id, "STORE_SALES");
      const draft = await buildDraft(tx, { studentId: student!.id, lines: priced.map((p) => ({ feeItemId: fee.id, description: `${p.item.name}`, unitMinor: p.unitMinor, quantity: p.quantity })), applyDiscounts: false, onDate: dateOnly(today) });
      const inv = await issueDraft(tx, session, draft, { source: "POS", issueDate: today, notes: `مشتريات المتجر المدرسي — بيع ${number}` });
      invoiceId = inv.id;
      total = inv.totalMinor;
      tax = inv.taxMinor;
    } else {
      const debit = input.paymentMethod === "CASH" ? "key:CASH" : input.paymentMethod === "CARD" ? "key:BANK_DEFAULT" : "key:STUDENT_WALLETS";
      const byRevenue = new Map<string, number>();
      for (const p of priced) {
        const acc = p.item.revenueAccountId ?? "key:REV_SALES";
        byRevenue.set(acc, (byRevenue.get(acc) ?? 0) + p.unitMinor * p.quantity);
      }
      revenueLines = [
        { account: debit, debit: total, studentId: student?.id ?? null },
        ...[...byRevenue.entries()].map(([account, v]) => ({ account, credit: v, costCenterId: cc })),
        ...(tax ? [{ account: "key:VAT_OUTPUT", credit: tax }] : []),
      ];
    }
    const lines = [...revenueLines, ...costLines];
    const entry = lines.length >= 2 ? await postEntry(tx, session, { date: today, description: `${input.kind === "STORE" ? "مبيعات المتجر" : "مبيعات المقصف"} رقم ${number}${student ? ` — ${student.fullName}` : ""}`, source: "SALE", sourceType: "Sale", reference: `${input.kind}-${number}`, lines }) : null;
    const s = await tx.sale.create({ data: { tenantId: session.tenant.id, number, kind: input.kind, warehouseId: wh.id, branchId: wh.branchId, studentId: student?.id ?? null, customerName: input.customerName ?? student?.fullName ?? null, paymentMethod: input.paymentMethod, subtotalMinor: totals.subtotalMinor, taxMinor: tax, totalMinor: total, costMinor: costTotal, invoiceId, journalEntryId: entry?.id ?? null, cashierId: session.user.id, lines: { create: saleLines } } });
    if (entry) await tx.journalEntry.update({ where: { id: entry.id }, data: { sourceId: s.id } });
    await tx.stockMovement.updateMany({ where: { id: { in: moveIds } }, data: { sourceId: s.id, journalEntryId: entry?.id ?? null } });
    if (wallet) {
      const updated = await tx.studentWallet.update({ where: { id: wallet.id }, data: { balanceMinor: { decrement: total } } });
      await tx.walletTransaction.create({ data: { tenantId: session.tenant.id, walletId: wallet.id, kind: "PURCHASE", amountMinor: -total, balanceAfterMinor: updated.balanceMinor, saleId: s.id, journalEntryId: entry?.id ?? null, note: priced.map((p) => `${p.item.name}×${p.quantity}`).join("، "), createdById: session.user.id } });
    }
    return s;
  });

  if (wallet && student) {
    const fresh = await db.studentWallet.findFirstOrThrow({ where: { id: wallet.id } });
    const { userIds } = await guardianUsers(db, student.id);
    const low = fresh.lowBalanceMinor ?? settingsOf(session, "canteen").lowBalanceMinor;
    if (fresh.notifyPurchases && userIds.length) await notify(db, { tenantId: session.tenant.id, userIds, type: "SYSTEM", title: `مشتريات المقصف: ${student.fullName}`, body: `${money(session, sale.totalMinor)} — الرصيد ${money(session, fresh.balanceMinor)}`, link: "/canteen/wallet", actorId: session.user.id, entityType: "StudentWallet", entityId: fresh.id });
    if (low > 0 && fresh.balanceMinor < low && wallet.balanceMinor >= low && userIds.length) await notify(db, { tenantId: session.tenant.id, userIds, type: "SYSTEM", title: `رصيد محفظة ${student.fullName} منخفض`, body: `الرصيد ${money(session, fresh.balanceMinor)}؛ اشحن المحفظة لتجنب رفض المشتريات`, link: "/canteen/wallet", entityType: "StudentWallet", entityId: fresh.id });
  }
  return sale;
}

/** إلغاء بيع نقدي أو بالمحفظة في اليوم نفسه: إرجاع المخزون بتكلفته، وقيد عكسي، واسترداد المحفظة */
export async function voidSale(db: TenantDb, session: SessionData, id: string, reason: string) {
  const s = await db.sale.findFirst({ where: { id }, include: { lines: true } });
  if (!s) throw notFound("عملية البيع غير موجودة");
  requireOps(session, MODULE[s.kind as "STORE"], "approve", "إلغاء البيع يتطلب صلاحية الاعتماد");
  if (s.status !== "COMPLETED") throw badRequest("العملية ملغاة مسبقاً");
  if (s.paymentMethod === "STUDENT_ACCOUNT") throw badRequest("البيع على الحساب يُلغى بإشعار دائن على فاتورته من المالية");
  if (toISODate(s.date, session.tenant.timezone) !== todayOf(session)) throw badRequest("يُلغى البيع في يومه فقط؛ استخدم مرتجعاً");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    for (const l of s.lines) await moveStock(tx, session, { itemId: l.itemId, warehouseId: s.warehouseId, quantity: l.quantity, valueMinor: l.costMinor, kind: "SALE_RETURN", date: todayOf(session), reference: `إلغاء بيع ${s.number}`, sourceType: "Sale", sourceId: s.id, notes: reason });
    if (s.journalEntryId) await reverseEntry(tx, session, s.journalEntryId, { reason: `إلغاء بيع ${s.number}: ${reason}` });
    if (s.paymentMethod === "WALLET" && s.studentId) {
      const w = await tx.studentWallet.findFirstOrThrow({ where: { studentId: s.studentId } });
      const updated = await tx.studentWallet.update({ where: { id: w.id }, data: { balanceMinor: { increment: s.totalMinor } } });
      await tx.walletTransaction.create({ data: { tenantId: session.tenant.id, walletId: w.id, kind: "REFUND", amountMinor: s.totalMinor, balanceAfterMinor: updated.balanceMinor, saleId: s.id, note: `إلغاء بيع ${s.number}: ${reason}`, createdById: session.user.id } });
    }
    return tx.sale.update({ where: { id: s.id }, data: { status: "VOIDED" } });
  });
}

export async function listSales(db: TenantDb, session: SessionData, input: { kind: "STORE" | "CANTEEN"; from?: string | null; to?: string | null }) {
  requireOps(session, MODULE[input.kind], "view");
  const to = input.to ?? todayOf(session);
  const from = input.from ?? to;
  // نافذة موسّعة ثم تصفية بالتاريخ المحلي للمدرسة
  const sales = (await db.sale.findMany({ where: { kind: input.kind, date: { gte: new Date(dateOnly(from).getTime() - 86_400_000), lt: new Date(dateOnly(to).getTime() + 2 * 86_400_000) } }, include: { lines: true }, orderBy: { number: "desc" } })).filter((s) => {
    const d = toISODate(s.date, session.tenant.timezone);
    return d >= from && d <= to;
  });
  const ok = sales.filter((s) => s.status === "COMPLETED");
  const byItem = new Map<string, { name: string; quantity: number; totalMinor: number; costMinor: number }>();
  for (const s of ok)
    for (const l of s.lines) {
      const r = byItem.get(l.itemId) ?? { name: l.name, quantity: 0, totalMinor: 0, costMinor: 0 };
      r.quantity += l.quantity;
      r.totalMinor += l.totalMinor;
      r.costMinor += l.costMinor;
      byItem.set(l.itemId, r);
    }
  const byMethod: Record<string, number> = {};
  for (const s of ok) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.totalMinor;
  const byDay = new Map<string, number>();
  for (const s of ok) {
    const d = s.date.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + s.totalMinor);
  }
  return {
    from,
    to,
    sales: sales.map((s) => ({ id: s.id, number: s.number, date: s.date, customer: s.customerName, paymentMethod: s.paymentMethod, totalMinor: s.totalMinor, taxMinor: s.taxMinor, costMinor: s.costMinor, status: s.status, invoiceId: s.invoiceId, items: s.lines.reduce((t, l) => t + l.quantity, 0) })),
    totals: { salesMinor: ok.reduce((t, s) => t + s.totalMinor, 0), taxMinor: ok.reduce((t, s) => t + s.taxMinor, 0), costMinor: ok.reduce((t, s) => t + s.costMinor, 0), netMinor: ok.reduce((t, s) => t + s.subtotalMinor, 0), count: ok.length },
    byItem: [...byItem.entries()].map(([itemId, r]) => ({ itemId, ...r, marginMinor: r.totalMinor - r.costMinor })).sort((a, b) => b.totalMinor - a.totalMinor),
    byMethod,
    byDay: [...byDay.entries()].sort().map(([date, totalMinor]) => ({ date, totalMinor })),
    canVoid: canOps(session, MODULE[input.kind], "approve"),
  };
}

export async function getSale(db: TenantDb, session: SessionData, id: string) {
  const s = await db.sale.findFirst({ where: { id }, include: { lines: true } });
  if (!s) throw notFound("عملية البيع غير موجودة");
  requireOps(session, MODULE[s.kind as "STORE"], "view");
  const cashier = s.cashierId ? await db.user.findFirst({ where: { id: s.cashierId }, select: { name: true } }) : null;
  return { ...s, cashier: cashier?.name ?? "" };
}

// ---------------------------------------------------------------------
// المحافظ
// ---------------------------------------------------------------------

async function ensureWallet(db: TenantDb, session: SessionData, studentId: string) {
  const w = await db.studentWallet.findFirst({ where: { studentId } });
  if (w) return w;
  const c = settingsOf(session, "canteen");
  return db.studentWallet.create({ data: { tenantId: session.tenant.id, studentId, dailyLimitMinor: c.defaultDailyLimitMinor || null, notifyPurchases: c.notifyPurchases } });
}

/** المصروف اليوم بتوقيت المدرسة (المشتريات ناقص المسترد) */
async function spentToday(db: TenantDb, session: SessionData, walletId: string) {
  const today = todayOf(session);
  // نافذة واسعة ثم تصفية بالتاريخ المحلي (يغطي أي فارق توقيت)
  const since = new Date(dateOnly(today).getTime() - 14 * 3_600_000);
  const rows = await db.walletTransaction.findMany({ where: { walletId, kind: { in: ["PURCHASE", "REFUND"] }, createdAt: { gte: since } }, select: { amountMinor: true, createdAt: true } });
  const local = rows.filter((t) => new Intl.DateTimeFormat("en-CA", { timeZone: session.tenant.timezone }).format(t.createdAt) === today);
  return -local.reduce((s, t) => s + t.amountMinor, 0);
}

async function assertWalletAccess(db: TenantDb, session: SessionData, studentId: string, action: "view" | "update") {
  if (canOps(session, "canteen", action === "view" ? "view" : "update")) return "staff" as const;
  if (!(await familyStudentIds(db, session)).includes(studentId)) throw forbidden("تعرض محافظ أبنائك فقط");
  return "family" as const;
}

/** المحافظ للموظفين (مع البحث) */
export async function listWallets(db: TenantDb, session: SessionData, input: { q?: string | null }) {
  requireOps(session, "canteen", "view");
  const q = input.q?.trim();
  const students = await db.student.findMany({ where: { deletedAt: null, status: "ACTIVE", ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { academicNumber: { contains: q } }] } : {}) }, select: { id: true, fullName: true, academicNumber: true, grade: { select: { name: true } }, section: { select: { name: true } } }, take: q ? 50 : 200, orderBy: { fullName: "asc" } });
  const wallets = await db.studentWallet.findMany({ where: { studentId: { in: students.map((s) => s.id) } } });
  const all = await db.studentWallet.aggregate({ _sum: { balanceMinor: true }, _count: true });
  return {
    rows: students.map((s) => {
      const w = wallets.find((x) => x.studentId === s.id);
      return { studentId: s.id, name: s.fullName, number: s.academicNumber, grade: `${s.grade.name}${s.section ? ` / ${s.section.name}` : ""}`, balanceMinor: w?.balanceMinor ?? 0, dailyLimitMinor: w?.dailyLimitMinor ?? null, isActive: w?.isActive ?? true, hasWallet: Boolean(w) };
    }),
    totalBalanceMinor: all._sum.balanceMinor ?? 0,
    wallets: all._count,
    canTopup: canOps(session, "canteen", "create"),
  };
}

/** محفظة طالب: الرصيد والحدود والحركات (لولي الأمر أو الموظف) */
export async function getWallet(db: TenantDb, session: SessionData, studentId: string) {
  const who = await assertWalletAccess(db, session, studentId, "view");
  const student = await db.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { id: true, fullName: true, academicNumber: true, photoUrl: true } });
  if (!student) throw notFound("الطالب غير موجود");
  const w = await ensureWallet(db, session, studentId);
  const [txs, spent, { primaryGuardianId }] = await Promise.all([db.walletTransaction.findMany({ where: { walletId: w.id }, orderBy: { createdAt: "desc" }, take: 100 }), spentToday(db, session, w.id), guardianUsers(db, studentId)]);
  const credit = primaryGuardianId ? await guardianCreditBalance(db, primaryGuardianId) : 0;
  const s = settingsOf(session, "canteen");
  return {
    student,
    wallet: { ...w, blockedCategories: (w.blockedCategories as string[]) ?? [], lowBalanceMinor: w.lowBalanceMinor ?? s.lowBalanceMinor },
    transactions: txs,
    spentTodayMinor: spent,
    guardianCreditMinor: s.allowTopupFromCredit ? credit : 0,
    canTopupCash: who === "staff" && canOps(session, "canteen", "create"),
    canTopupFromCredit: s.allowTopupFromCredit && credit > 0,
    canEditLimits: who === "family" || canOps(session, "canteen", "update"),
    canWithdraw: who === "staff" && canOps(session, "canteen", "approve"),
  };
}

/** أبناء ولي الأمر مع أرصدة محافظهم */
export async function myWallets(db: TenantDb, session: SessionData) {
  const ids = await familyStudentIds(db, session);
  const students = await db.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  const wallets = await db.studentWallet.findMany({ where: { studentId: { in: ids } } });
  return students.map((s) => ({ studentId: s.id, name: s.fullName, balanceMinor: wallets.find((w) => w.studentId === s.id)?.balanceMinor ?? 0 }));
}

/**
 * شحن المحفظة: من الصندوق/البطاقة (موظف المقصف أو الصندوق) أو من رصيد ولي الأمر الدائن (ولي الأمر نفسه أو الموظف).
 */
export async function topUp(db: TenantDb, session: SessionData, input: { studentId: string; amountMinor: number; method: "CASH" | "CARD" | "FROM_CREDIT"; note?: string | null }) {
  const who = await assertWalletAccess(db, session, input.studentId, "view");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw badRequest("مبلغ الشحن أكبر من صفر");
  if (input.method !== "FROM_CREDIT" && !(who === "staff" && canOps(session, "canteen", "create"))) throw forbidden("الشحن النقدي من نقطة المقصف أو الصندوق");
  const s = settingsOf(session, "canteen");
  const { primaryGuardianId, userIds } = await guardianUsers(db, input.studentId);
  if (input.method === "FROM_CREDIT") {
    if (!s.allowTopupFromCredit) throw badRequest("الشحن من الرصيد الدائن غير مفعّل");
    if (!primaryGuardianId) throw badRequest("الطالب غير مرتبط بولي أمر");
    const credit = await guardianCreditBalance(db, primaryGuardianId);
    if (credit < input.amountMinor) throw badRequest(`الرصيد الدائن ${money(session, credit)} لا يكفي`);
  }
  await ensureOpsAccounts(db, session.tenant.id);
  const student = await db.student.findFirstOrThrow({ where: { id: input.studentId }, select: { fullName: true } });
  const w = await ensureWallet(db, session, input.studentId);
  const result = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const debit = input.method === "CASH" ? "key:CASH" : input.method === "CARD" ? "key:BANK_DEFAULT" : "key:GUARDIAN_CREDIT";
    const entry = await postEntry(tx, session, { date: todayOf(session), description: `شحن محفظة ${student.fullName}`, source: "WALLET", sourceType: "StudentWallet", sourceId: w.id, lines: [{ account: debit, debit: input.amountMinor, studentId: input.studentId, guardianId: input.method === "FROM_CREDIT" ? primaryGuardianId : null }, { account: "key:STUDENT_WALLETS", credit: input.amountMinor, studentId: input.studentId }] });
    if (input.method === "FROM_CREDIT") await tx.guardianCredit.create({ data: { tenantId: session.tenant.id, guardianId: primaryGuardianId!, studentId: input.studentId, amountMinor: -input.amountMinor, source: "APPLIED", sourceId: w.id, note: `شحن محفظة المقصف لـ${student.fullName}`, createdById: session.user.id } });
    const updated = await tx.studentWallet.update({ where: { id: w.id }, data: { balanceMinor: { increment: input.amountMinor } } });
    return tx.walletTransaction.create({ data: { tenantId: session.tenant.id, walletId: w.id, kind: input.method === "FROM_CREDIT" ? "FROM_CREDIT" : "TOPUP", amountMinor: input.amountMinor, balanceAfterMinor: updated.balanceMinor, method: input.method, journalEntryId: entry.id, note: input.note ?? null, createdById: session.user.id } });
  });
  if (userIds.length) await notify(db, { tenantId: session.tenant.id, userIds, type: "SYSTEM", title: `شُحنت محفظة ${student.fullName}`, body: `${money(session, input.amountMinor)} — الرصيد ${money(session, result.balanceAfterMinor)}`, link: "/canteen/wallet", actorId: session.user.id, entityType: "StudentWallet", entityId: w.id });
  return result;
}

/** حدود المحفظة: الحد اليومي، الفئات الممنوعة، الإشعارات (ولي الأمر أو موظف المقصف) */
export async function setWalletLimits(db: TenantDb, session: SessionData, input: { studentId: string; dailyLimitMinor: number | null; blockedCategories: string[]; notifyPurchases: boolean; lowBalanceMinor: number | null; isActive?: boolean }) {
  const who = await assertWalletAccess(db, session, input.studentId, "update");
  if (input.dailyLimitMinor !== null && input.dailyLimitMinor < 0) throw badRequest("حد غير صالح");
  const w = await ensureWallet(db, session, input.studentId);
  return db.studentWallet.update({ where: { id: w.id }, data: { dailyLimitMinor: input.dailyLimitMinor, blockedCategories: input.blockedCategories.slice(0, 50), notifyPurchases: input.notifyPurchases, lowBalanceMinor: input.lowBalanceMinor, ...(who === "staff" && input.isActive !== undefined ? { isActive: input.isActive } : {}) } });
}

/** سحب/استرداد الرصيد نقداً (عند الانسحاب مثلاً): مدين أرصدة المحافظ، دائن الصندوق */
export async function withdraw(db: TenantDb, session: SessionData, input: { studentId: string; amountMinor: number; reason: string }) {
  requireOps(session, "canteen", "approve", "استرداد رصيد المحفظة يتطلب صلاحية الاعتماد");
  const w = await db.studentWallet.findFirst({ where: { studentId: input.studentId } });
  if (!w) throw notFound("لا محفظة للطالب");
  if (input.amountMinor <= 0 || input.amountMinor > w.balanceMinor) throw badRequest("المبلغ يتجاوز الرصيد");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const entry = await postEntry(tx, session, { date: todayOf(session), description: `استرداد رصيد محفظة: ${input.reason}`, source: "WALLET", sourceType: "StudentWallet", sourceId: w.id, lines: [{ account: "key:STUDENT_WALLETS", debit: input.amountMinor, studentId: input.studentId }, { account: "key:CASH", credit: input.amountMinor }] });
    const updated = await tx.studentWallet.update({ where: { id: w.id }, data: { balanceMinor: { decrement: input.amountMinor } } });
    return tx.walletTransaction.create({ data: { tenantId: session.tenant.id, walletId: w.id, kind: "WITHDRAWAL", amountMinor: -input.amountMinor, balanceAfterMinor: updated.balanceMinor, journalEntryId: entry.id, note: input.reason, createdById: session.user.id } });
  });
}

