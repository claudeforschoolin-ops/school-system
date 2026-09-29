/**
 * مجموعات المالية: الفواتير (لوحة بالحالة، تقويم الاستحقاق، جدول) وسندات الصرف.
 * الحالة والمبالغ تتغير عبر سير العمل (الإصدار، التحصيل، الإشعارات) لا من الخلايا.
 */
import type { Prisma } from "@/generated/prisma/client";
import { INVOICE_FLOW, INVOICE_STATUS, VOUCHER_STATUS } from "@/lib/finance/labels";
import { toOptions } from "@/lib/students";
import { forbidden, notFound } from "@/server/errors";
import { balanceOf, dateOnly, displayStatus, invoiceWhere, requirePerm, todayIso } from "@/server/services/finance/common";
import { branchOptions, gradeOptions } from "./options";
import { customOf, isoDate, personValue, type CollectionCtx, type SystemCollection, type SystemRow } from "./types";

const invoiceInclude = {
  student: { select: { fullName: true, gradeId: true, academicNumber: true } },
  guardian: { select: { name: true } },
  installments: { select: { dueDate: true, amountMinor: true, paidMinor: true } },
} as const;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const SOURCE = {
  MANUAL: { label: "يدوية", color: "gray" },
  BULK: { label: "فوترة جماعية", color: "navy" },
  ADMISSION: { label: "تسجيل وقبول", color: "teal" },
  ACTIVITY: { label: "نشاط", color: "purple" },
  LATE_FEE: { label: "غرامة تأخير", color: "red" },
  DEBIT_NOTE: { label: "إشعار مدين", color: "orange" },
  TRANSFER: { label: "تحويل", color: "slate" },
} as const;

function invoiceRow(i: InvoiceRow, today: Date): SystemRow {
  return {
    id: i.id,
    number: i.number ?? 0,
    title: i.student.fullName,
    position: i.position,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    createdById: i.createdById,
    updatedById: i.updatedById,
    values: {
      number: i.number,
      status: displayStatus(i, today),
      guardian: i.guardian?.name ?? null,
      academicNumber: i.student.academicNumber,
      grade: i.student.gradeId,
      branch: i.branchId,
      issueDate: isoDate(i.issueDate),
      dueDate: isoDate(i.dueDate),
      total: i.totalMinor,
      discount: i.discountMinor,
      tax: i.taxMinor,
      paid: i.paidMinor,
      balance: i.status === "CANCELLED" ? 0 : balanceOf(i),
      source: i.source,
      createdBy: personValue(i.createdById),
    },
    custom: customOf(i.customValues),
  };
}

async function updateCustom(ctx: CollectionCtx, model: "invoice" | "paymentVoucher", id: string, patch: { custom?: Record<string, unknown>; position?: number }, module: string) {
  requirePerm(ctx.session, module, "update");
  const delegate = ctx.db[model] as unknown as { findFirst: (a: object) => Promise<{ customValues: unknown } | null>; update: (a: object) => Promise<unknown> };
  const row = await delegate.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw notFound();
  const data: Record<string, unknown> = { updatedById: ctx.session.user.id };
  if (patch.custom) data.customValues = { ...customOf(row.customValues), ...patch.custom } as Prisma.InputJsonValue;
  if (patch.position !== undefined) data.position = patch.position;
  await delegate.update({ where: { id }, data });
}

const money = { currency: "SAR" };

export const invoicesCollection: SystemCollection = {
  source: "invoices",
  module: "invoices",
  teamspace: "finance",
  page: { title: "الفواتير", icon: "lucide:receipt-text", description: "فواتير الرسوم بحالاتها وأقساطها: الصادرة والمدفوعة جزئياً والمتأخرة." },
  titleLabel: "الطالب",
  titleEditable: false,
  href: (id) => `/finance/invoices/${id}`,
  createLabel: "فاتورة",
  properties: [
    { key: "number", name: "رقم الفاتورة", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "status", name: "الحالة", type: "SELECT", readOnly: true, config: { options: toOptions(INVOICE_STATUS, INVOICE_FLOW) } },
    { key: "guardian", name: "ولي الأمر", type: "TEXT", readOnly: true },
    { key: "academicNumber", name: "الرقم الأكاديمي", type: "TEXT", readOnly: true },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "branch", name: "الفرع", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "issueDate", name: "تاريخ الإصدار", type: "DATE", readOnly: true },
    { key: "dueDate", name: "الاستحقاق", type: "DATE", readOnly: true },
    { key: "total", name: "الإجمالي", type: "MONEY", readOnly: true, config: money },
    { key: "discount", name: "الخصم", type: "MONEY", readOnly: true, config: money },
    { key: "tax", name: "الضريبة", type: "MONEY", readOnly: true, config: money },
    { key: "paid", name: "المدفوع", type: "MONEY", readOnly: true, config: money },
    { key: "balance", name: "المتبقي", type: "MONEY", readOnly: true, config: money },
    { key: "source", name: "المصدر", type: "SELECT", readOnly: true, config: { options: toOptions(SOURCE) } },
    { key: "createdBy", name: "أصدرها", type: "PERSON", readOnly: true },
  ],
  views: [
    { name: "كل الفواتير", type: "TABLE", config: { sorts: [{ propertyId: "number", direction: "desc" }], hiddenProperties: ["academicNumber", "tax", "discount", "createdBy", "branch"] } },
    { name: "حسب الحالة", type: "BOARD", config: { groupBy: "status", cardSize: "small", hiddenProperties: ["status", "academicNumber", "grade", "branch", "issueDate", "discount", "tax", "paid", "source", "createdBy", "guardian"] } },
    { name: "تقويم الاستحقاق", type: "CALENDAR", config: { dateProperty: "dueDate" } },
  ],
  options: async ({ db }) => ({ grade: await gradeOptions(db), branch: await branchOptions(db) }),
  async list(ctx) {
    const where = await invoiceWhere(ctx.db, ctx.session, "view");
    const rows = await ctx.db.invoice.findMany({ where: { ...where, status: { not: "DRAFT" } }, include: invoiceInclude, orderBy: { number: "desc" }, take: 5000 });
    const today = dateOnly(todayIso(ctx.session));
    return rows.map((r) => invoiceRow(r, today));
  },
  async get(ctx, id) {
    const where = await invoiceWhere(ctx.db, ctx.session, "view");
    const r = await ctx.db.invoice.findFirst({ where: { ...where, id }, include: invoiceInclude });
    return r ? invoiceRow(r, dateOnly(todayIso(ctx.session))) : null;
  },
  update: (ctx, id, patch) => updateCustom(ctx, "invoice", id, patch, "invoices"),
};

type VoucherRow = Prisma.PaymentVoucherGetPayload<object>;
function voucherRow(v: VoucherRow): SystemRow {
  return {
    id: v.id,
    number: v.number,
    title: v.payee,
    position: v.position,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    createdById: v.createdById,
    updatedById: v.updatedById,
    values: { number: v.number, status: v.status, date: isoDate(v.date), description: v.description, account: v.expenseAccountId, total: v.totalMinor, tax: v.taxMinor, method: v.method, createdBy: personValue(v.createdById) },
    custom: customOf(v.customValues),
  };
}

export const vouchersCollection: SystemCollection = {
  source: "vouchers",
  module: "expenses",
  teamspace: "finance",
  page: { title: "سندات الصرف", icon: "lucide:hand-coins", description: "المصروفات والمدفوعات للموردين بموافقات حسب المبلغ." },
  titleLabel: "المستفيد",
  titleEditable: false,
  href: (id) => `/finance/vouchers/${id}`,
  createLabel: "سند صرف",
  properties: [
    { key: "number", name: "الرقم", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "status", name: "الحالة", type: "SELECT", readOnly: true, config: { options: toOptions(VOUCHER_STATUS) } },
    { key: "date", name: "التاريخ", type: "DATE", readOnly: true },
    { key: "description", name: "البيان", type: "TEXT", readOnly: true },
    { key: "account", name: "حساب المصروف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "total", name: "الإجمالي", type: "MONEY", readOnly: true, config: money },
    { key: "tax", name: "ضريبة المدخلات", type: "MONEY", readOnly: true, config: money },
    { key: "method", name: "طريقة الدفع", type: "SELECT", readOnly: true, config: { options: [{ id: "CASH", name: "نقد", color: "green" }, { id: "BANK_TRANSFER", name: "تحويل بنكي", color: "navy" }, { id: "CHEQUE", name: "شيك", color: "gold" }, { id: "CARD", name: "بطاقة", color: "teal" }, { id: "SADAD", name: "سداد", color: "purple" }] } },
    { key: "createdBy", name: "أنشأه", type: "PERSON", readOnly: true },
  ],
  views: [
    { name: "حسب الحالة", type: "BOARD", config: { groupBy: "status", cardSize: "small", hiddenProperties: ["status", "description", "tax", "method", "createdBy", "number"] } },
    { name: "كل السندات", type: "TABLE", config: { sorts: [{ propertyId: "number", direction: "desc" }], hiddenProperties: ["createdBy"] } },
  ],
  options: async ({ db }) => {
    const accounts = await db.account.findMany({ where: { type: "EXPENSE", isGroup: false }, orderBy: { code: "asc" }, select: { id: true, name: true } });
    return { account: accounts.map((a) => ({ id: a.id, name: a.name, color: "brown" as const })) };
  },
  async list(ctx) {
    requirePerm(ctx.session, "expenses", "view");
    const rows = await ctx.db.paymentVoucher.findMany({ where: { deletedAt: null }, orderBy: { number: "desc" }, take: 5000 });
    return rows.map(voucherRow);
  },
  async get(ctx, id) {
    requirePerm(ctx.session, "expenses", "view");
    const v = await ctx.db.paymentVoucher.findFirst({ where: { id, deletedAt: null } });
    return v ? voucherRow(v) : null;
  },
  update: (ctx, id, patch) => updateCustom(ctx, "paymentVoucher", id, patch, "expenses"),
  async trash(ctx, id) {
    requirePerm(ctx.session, "expenses", "delete");
    const v = await ctx.db.paymentVoucher.findFirst({ where: { id } });
    if (!v) throw notFound();
    if (v.status === "PAID") throw forbidden("سند مصروف؛ ألغِه بقيد عكسي بدلاً من حذفه");
    await ctx.db.paymentVoucher.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
