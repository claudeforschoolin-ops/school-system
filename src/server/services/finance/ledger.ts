/**
 * محرّك القيود: كل حدث مالي يُحوَّل إلى قيد مزدوج متوازن يُرحَّل في فترة مفتوحة برقم تسلسلي غير منقطع.
 * التحقق هنا (رسائل واضحة) ثم في قاعدة البيانات (مشغّلات لا يمكن تجاوزها).
 */
import type { JournalSource, Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { nextNumber } from "@/server/services/sequence.service";

/** عميل داخل معاملة (أو خارجها) — نفس واجهة TenantDb */
export type Tx = TenantDb;

export interface PostLine {
  /** معرّف الحساب أو «key:مفتاح_نظامي» */
  account: string;
  debit?: number;
  credit?: number;
  costCenterId?: string | null;
  studentId?: string | null;
  guardianId?: string | null;
  description?: string | null;
}

export interface PostInput {
  date: Date | string;
  description: string;
  source: JournalSource;
  sourceType?: string | null;
  sourceId?: string | null;
  reference?: string | null;
  academicYearId?: string | null;
  lines: PostLine[];
  /** الترحيل في فترة مقفلة (صلاحية استثنائية تُسجَّل) */
  allowClosedPeriod?: boolean;
  reversalOfId?: string;
}

export const toDate = (d: Date | string) => (typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
export const n = (v: bigint | number | null | undefined) => {
  const x = typeof v === "bigint" ? Number(v) : (v ?? 0);
  if (!Number.isSafeInteger(x)) throw new Error("مبلغ خارج الحدود الآمنة");
  return x;
};

/** حسابات بالمفاتيح النظامية (مع ذاكرة داخل الطلب) */
export async function accountIds(db: Tx, keys: string[]) {
  const wanted = [...new Set(keys)];
  const rows = await db.account.findMany({ where: { systemKey: { in: wanted }, deletedAt: null }, select: { id: true, systemKey: true } });
  const map = new Map(rows.map((r) => [r.systemKey!, r.id]));
  for (const k of wanted) if (!map.has(k)) throw badRequest(`الحساب النظامي «${k}» غير معرّف في دليل الحسابات`);
  return map;
}

export async function accountByKey(db: Tx, key: string) {
  return (await accountIds(db, [key])).get(key)!;
}

/** الفترة التي يقع فيها التاريخ */
export async function periodFor(db: Tx, date: Date) {
  return db.fiscalPeriod.findFirst({ where: { startDate: { lte: date }, endDate: { gte: date } }, include: { fiscalYear: { select: { status: true, name: true } } } });
}

/** مركز تكلفة الفرع (يُنشأ عند الحاجة) */
export async function branchCostCenter(db: Tx, tenantId: string, branchId: string | null | undefined) {
  if (!branchId) return null;
  const found = await db.costCenter.findFirst({ where: { branchId, kind: "BRANCH" } });
  if (found) return found.id;
  const b = await db.branch.findFirst({ where: { id: branchId } });
  if (!b) return null;
  const created = await db.costCenter.create({ data: { tenantId, code: `BR-${b.code}`, name: b.name, kind: "BRANCH", branchId } });
  return created.id;
}

/**
 * يرحّل قيداً. يجب استدعاؤه داخل معاملة ($transaction) ليبقى الترقيم غير منقطع وتعمل الفحوص المؤجلة.
 */
export async function postEntry(tx: Tx, session: Pick<SessionData, "tenant" | "user" | "access">, input: PostInput) {
  const date = toDate(input.date);
  const keyNames = input.lines.filter((l) => l.account.startsWith("key:")).map((l) => l.account.slice(4));
  const keys = keyNames.length ? await accountIds(tx, keyNames) : new Map<string, string>();
  const lines = input.lines
    .map((l) => ({ ...l, accountId: l.account.startsWith("key:") ? keys.get(l.account.slice(4))! : l.account, debit: l.debit ?? 0, credit: l.credit ?? 0 }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  for (const l of lines) {
    if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit)) throw badRequest("المبالغ يجب أن تكون بأصغر وحدة (أعداد صحيحة)");
    if (l.debit < 0 || l.credit < 0) throw badRequest("لا مبالغ سالبة في سطور القيد");
    if (l.debit > 0 && l.credit > 0) throw badRequest("السطر إما مدين أو دائن");
  }
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (lines.length < 2) throw badRequest("القيد يحتاج سطرين على الأقل");
  if (debit !== credit) throw badRequest(`القيد غير متوازن: المدين ${debit} والدائن ${credit}`);
  if (debit === 0) throw badRequest("قيد بلا مبالغ");

  const accounts = await tx.account.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.accountId))] } }, select: { id: true, isGroup: true, isActive: true, name: true } });
  for (const l of lines) {
    const a = accounts.find((x) => x.id === l.accountId);
    if (!a) throw badRequest("حساب غير موجود في دليل الحسابات");
    if (a.isGroup) throw badRequest(`«${a.name}» حساب تجميعي لا يُرحَّل عليه`);
    if (!a.isActive) throw badRequest(`«${a.name}» حساب موقوف`);
  }

  const period = await periodFor(tx, date);
  if (!period) throw badRequest("لا توجد فترة محاسبية لهذا التاريخ؛ أنشئ العام المالي من «الفترات المحاسبية»");
  let postedInClosedPeriod = false;
  if (period.status === "CLOSED") {
    if (!input.allowClosedPeriod) throw badRequest(`الفترة «${period.name}» مقفلة؛ لا ترحيل فيها`);
    if (!can(session.access, "accounting_periods", "approve")) throw forbidden("الترحيل في فترة مقفلة يتطلب صلاحية اعتماد الفترات");
    await tx.$executeRawUnsafe("SELECT set_config('manassa.allow_closed_period', 'on', true)");
    postedInClosedPeriod = true;
  }

  const number = await nextNumber(tx, session.tenant.id, "journal");
  const data: Prisma.JournalEntryUncheckedCreateInput = {
    tenantId: session.tenant.id,
    number,
    date,
    periodId: period.id,
    description: input.description,
    source: input.source,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    reference: input.reference ?? null,
    academicYearId: input.academicYearId ?? null,
    totalMinor: BigInt(debit),
    postedInClosedPeriod,
    reversalOfId: input.reversalOfId ?? null,
    createdById: session.user.id,
    lines: {
      create: lines.map((l) => ({
        tenantId: session.tenant.id,
        accountId: l.accountId,
        debitMinor: BigInt(l.debit),
        creditMinor: BigInt(l.credit),
        costCenterId: l.costCenterId ?? null,
        studentId: l.studentId ?? null,
        guardianId: l.guardianId ?? null,
        description: l.description ?? null,
      })),
    },
  };
  return tx.journalEntry.create({ data });
}

/** قيد عكسي لقيد مرحّل (بتاريخ اليوم أو تاريخ محدد في فترة مفتوحة) */
export async function reverseEntry(tx: Tx, session: Pick<SessionData, "tenant" | "user" | "access">, entryId: string, input: { date?: Date | string; reason: string }) {
  const entry = await tx.journalEntry.findFirst({ where: { id: entryId }, include: { lines: true } });
  if (!entry) throw notFound("القيد غير موجود");
  if (entry.isReversed) throw badRequest("القيد معكوس مسبقاً");
  if (entry.source === "REVERSAL") throw badRequest("لا يُعكس قيد عكسي");
  const reversal = await postEntry(tx, session, {
    date: input.date ?? new Date(),
    description: `عكس القيد رقم ${entry.number}: ${input.reason}`,
    source: "REVERSAL",
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    reference: String(entry.number),
    academicYearId: entry.academicYearId,
    reversalOfId: entry.id,
    lines: entry.lines.map((l) => ({ account: l.accountId, debit: n(l.creditMinor), credit: n(l.debitMinor), costCenterId: l.costCenterId, studentId: l.studentId, guardianId: l.guardianId, description: l.description })),
  });
  await tx.journalEntry.update({ where: { id: entry.id }, data: { isReversed: true } });
  return reversal;
}

/** رصيد حساب (أو مجموعة حسابات) حتى تاريخ — موجب بجانبه الطبيعي */
export async function accountBalance(db: Tx, accountIdList: string[], opts: { to?: Date; from?: Date } = {}) {
  const where: Prisma.JournalLineWhereInput = { accountId: { in: accountIdList }, entry: { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } };
  const agg = await db.journalLine.aggregate({ where, _sum: { debitMinor: true, creditMinor: true } });
  return { debit: n(agg._sum.debitMinor), credit: n(agg._sum.creditMinor) };
}
