/**
 * التحصيل: البحث عن الأسرة، كشف حسابها، سند القبض بتخصيص تلقائي (الأقدم أولاً) أو يدوي والزائد رصيد دائن،
 * إلغاء السند، الشيكات (تحصيل/ارتداد)، استخدام الرصيد الدائن، الاستردادات بموافقة، ووردية الصندوق.
 */
import type { PaymentMethod } from "@/generated/prisma/client";
import { allocateMinor, formatMoney } from "@/lib/money";
import { PAYMENT_METHOD } from "@/lib/finance/labels";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { messageGuardians } from "@/server/services/guardian-messages";
import { idFingerprint } from "@/server/pii";
import { nextNumber } from "@/server/services/sequence.service";
import { refreshInvoice } from "./billing.service";
import {
  assertFamilyAccess,
  balanceOf,
  dateOnly,
  displayStatus,
  hasPerm,
  isoOf,
  isStaff,
  ownGuardianIds,
  requirePerm,
  requireStaff,
  todayIso,
} from "./common";
import {
  accountByKey,
  accountIds,
  branchCostCenter,
  n,
  postEntry,
  reverseEntry,
  type PostLine,
  type Tx,
} from "./ledger";

// =====================================================================
// البحث وكشف حساب الأسرة
// =====================================================================

/** بحث سريع بالاسم أو الرقم الأكاديمي أو آخر ٤ أرقام من الهوية أو جوال ولي الأمر */
export async function searchPayers(db: TenantDb, session: SessionData, query: string) {
  if (!isStaff(session, "collections", "create") && !isStaff(session, "invoices", "view"))
    throw forbidden("البحث في الأسر لموظفي المالية");
  const q = query.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (q.length < 2) return [];
  const byId = /^\d{10}$/.test(q) ? idFingerprint(session.tenant.id, q) : null;
  const students = await db.student.findMany({
    where: {
      deletedAt: null,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { academicNumber: { startsWith: q } },
        ...(byId ? [{ nationalIdHash: byId }] : []),
        ...(/^\d{4}$/.test(q) ? [{ nationalIdLast4: q }] : []),
        {
          guardians: {
            some: {
              guardian: {
                OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" as const } }],
              },
            },
          },
        },
      ],
    },
    take: 12,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      academicNumber: true,
      status: true,
      photoUrl: true,
      grade: { select: { name: true } },
      section: { select: { name: true } },
      guardians: {
        where: { isPrimary: true },
        take: 1,
        select: { guardian: { select: { id: true, name: true, phone: true } } },
      },
    },
  });
  const guardianIds = [
    ...new Set(students.map((s) => s.guardians[0]?.guardian.id).filter((x): x is string => Boolean(x))),
  ];
  const open = guardianIds.length
    ? await db.invoice.findMany({
        where: { guardianId: { in: guardianIds }, status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null },
        select: { guardianId: true, totalMinor: true, paidMinor: true, creditedMinor: true },
      })
    : [];
  const due = new Map<string, number>();
  for (const i of open) due.set(i.guardianId!, (due.get(i.guardianId!) ?? 0) + balanceOf(i));
  return students.map((s) => {
    const g = s.guardians[0]?.guardian ?? null;
    return {
      studentId: s.id,
      fullName: s.fullName,
      academicNumber: s.academicNumber,
      status: s.status,
      photoUrl: s.photoUrl,
      grade: s.grade.name,
      section: s.section?.name ?? null,
      guardian: g,
      familyDue: g ? (due.get(g.id) ?? 0) : 0,
    };
  });
}

export async function guardianCreditBalance(db: TenantDb | Tx, guardianId: string) {
  const agg = await db.guardianCredit.aggregate({ where: { guardianId }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

/** كشف حساب الأسرة: الأبناء، الفواتير المفتوحة والمغلقة، السندات، الإشعارات، الرصيد الدائن، والحركة التراكمية */
export async function familyAccount(
  db: TenantDb,
  session: SessionData,
  input: { guardianId?: string | null; studentId?: string | null },
) {
  if (!hasPerm(session, "invoices", "view") && !hasPerm(session, "collections", "create")) throw forbidden();
  let guardianId = input.guardianId ?? null;
  if (!guardianId && input.studentId) {
    const link = await db.studentGuardian.findFirst({
      where: { studentId: input.studentId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    guardianId = link?.guardianId ?? null;
  }
  if (!guardianId) throw notFound("لا يوجد ولي أمر مرتبط بهذا الطالب");
  // ولي الأمر يرى حساب أسرته فقط
  await assertFamilyAccess(db, session, guardianId);
  const guardian = await db.guardian.findFirst({
    where: { id: guardianId, deletedAt: null },
    select: { id: true, name: true, phone: true, email: true },
  });
  if (!guardian) throw notFound("ولي الأمر غير موجود");
  const [students, invoices, receipts, credit, credits] = await Promise.all([
    db.student.findMany({
      where: { guardians: { some: { guardianId } }, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        academicNumber: true,
        status: true,
        photoUrl: true,
        grade: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: { birthDate: "asc" },
    }),
    db.invoice.findMany({
      where: {
        OR: [{ guardianId }, { student: { guardians: { some: { guardianId } } } }],
        deletedAt: null,
        status: { not: "DRAFT" },
      },
      include: {
        installments: { orderBy: { seq: "asc" } },
        student: { select: { fullName: true } },
        creditNotes: {
          select: { id: true, number: true, date: true, totalMinor: true, reason: true, kind: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    }),
    db.receipt.findMany({
      where: { guardianId },
      orderBy: [{ date: "asc" }, { number: "asc" }],
      include: {
        allocations: { where: { reversedAt: null }, select: { invoiceId: true, amountMinor: true } },
      },
    }),
    guardianCreditBalance(db, guardianId),
    db.guardianCredit.findMany({ where: { guardianId }, orderBy: { createdAt: "asc" } }),
  ]);
  const today = dateOnly(todayIso(session));
  const open = invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIAL");
  // حركة الحساب (كشف): فواتير مدينة، سندات ومشعارات دائنة، استردادات مدينة
  type Move = {
    date: string;
    kind: "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "REFUND" | "CANCELLED";
    ref: string;
    description: string;
    debit: number;
    credit: number;
    link: string | null;
  };
  const moves: Move[] = [];
  for (const i of invoices) {
    moves.push({
      date: isoOf(i.issueDate ?? i.createdAt)!,
      kind: "INVOICE",
      ref: `فاتورة ${i.number}`,
      description: `${i.student.fullName}${i.status === "CANCELLED" ? " (ملغاة)" : ""}`,
      debit: i.totalMinor,
      credit: 0,
      link: `/finance/invoices/${i.id}`,
    });
    for (const c of i.creditNotes)
      moves.push({
        date: isoOf(c.date)!,
        kind: c.kind === "CANCELLATION" ? "CANCELLED" : "CREDIT_NOTE",
        ref: `إشعار دائن ${c.number}`,
        description: c.reason,
        debit: 0,
        credit: c.totalMinor,
        link: `/finance/invoices/${i.id}`,
      });
  }
  for (const r of receipts) {
    moves.push({
      date: isoOf(r.date)!,
      kind: "RECEIPT",
      ref: `سند قبض ${r.number}`,
      description: `${PAYMENT_METHOD[r.method].label}${r.status === "VOID" ? " (ملغى)" : ""}${r.chequeStatus === "BOUNCED" ? " (شيك مرتد)" : ""}`,
      debit: 0,
      credit: r.amountMinor,
      link: `/finance/receipts/${r.id}`,
    });
    if (r.status === "VOID" || r.chequeStatus === "BOUNCED")
      moves.push({
        date: isoOf(r.date)!,
        kind: "RECEIPT",
        ref: `عكس سند ${r.number}`,
        description: r.voidReason ?? "شيك مرتد",
        debit: r.amountMinor,
        credit: 0,
        link: `/finance/receipts/${r.id}`,
      });
  }
  for (const c of credits.filter((x) => x.source === "REFUND"))
    moves.push({
      date: isoOf(c.createdAt)!,
      kind: "REFUND",
      ref: "استرداد",
      description: c.note ?? "",
      debit: -c.amountMinor,
      credit: 0,
      link: null,
    });
  moves.sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const statement = moves.map((m) => ((running += m.debit - m.credit), { ...m, balance: running }));
  return {
    guardian,
    students,
    creditBalance: credit,
    totals: {
      invoiced: invoices.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + i.totalMinor, 0),
      paid: invoices.reduce((s, i) => s + i.paidMinor, 0),
      credited: invoices.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + i.creditedMinor, 0),
      due: open.reduce((s, i) => s + balanceOf(i), 0),
      overdue: open
        .filter((i) => displayStatus(i, today) === "OVERDUE")
        .reduce(
          (s, i) =>
            s +
            i.installments
              .filter((x) => x.dueDate < today)
              .reduce((a, x) => a + (x.amountMinor - x.paidMinor), 0),
          0,
        ),
    },
    openInvoices: open.map((i) => ({
      id: i.id,
      number: i.number,
      student: i.student.fullName,
      studentId: i.studentId,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      totalMinor: i.totalMinor,
      paidMinor: i.paidMinor,
      creditedMinor: i.creditedMinor,
      balanceMinor: balanceOf(i),
      status: displayStatus(i, today),
      installments: i.installments.map((x) => ({
        id: x.id,
        seq: x.seq,
        label: x.label,
        dueDate: x.dueDate,
        amountMinor: x.amountMinor,
        paidMinor: x.paidMinor,
      })),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      student: i.student.fullName,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      totalMinor: i.totalMinor,
      balanceMinor: i.status === "CANCELLED" ? 0 : balanceOf(i),
      status: displayStatus(i, today),
    })),
    receipts: receipts
      .map((r) => ({
        id: r.id,
        number: r.number,
        date: r.date,
        method: r.method,
        amountMinor: r.amountMinor,
        status: r.status,
        chequeStatus: r.chequeStatus,
      }))
      .reverse(),
    statement,
  };
}

// =====================================================================
// سند القبض
// =====================================================================

export interface ReceiptInput {
  guardianId: string;
  studentId?: string | null;
  payerName?: string | null;
  amountMinor: number;
  method: PaymentMethod;
  date: string;
  reference?: string | null;
  bankAccountId?: string | null;
  chequeNumber?: string | null;
  chequeBank?: string | null;
  chequeDate?: string | null;
  /** تخصيص يدوي؛ وإلا فالأقدم استحقاقاً أولاً */
  allocations?: Array<{ invoiceId: string; amountMinor: number }>;
  notes?: string | null;
  notify?: boolean;
}

/** حساب المدين حسب طريقة الدفع */
async function debitAccountFor(
  tx: Tx,
  method: PaymentMethod,
  bankAccountId: string | null | undefined,
  branchId: string | null,
) {
  if (method === "CHEQUE") return accountByKey(tx, "CHEQUES_UNDER_COLLECTION");
  if (method === "CASH") {
    // صندوق فرع البنات إن وُجد للفرع النسائي
    if (branchId) {
      const b = await tx.branch.findFirst({ where: { id: branchId }, select: { gender: true } });
      if (b?.gender === "GIRLS") {
        const girls = await tx.account.findFirst({ where: { systemKey: "CASH_GIRLS", isActive: true } });
        if (girls) return girls.id;
      }
    }
    return accountByKey(tx, "CASH");
  }
  if (bankAccountId) {
    const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, isActive: true } });
    if (!bank) throw badRequest("الحساب البنكي غير متاح");
    return bank.accountId;
  }
  const bank = await tx.bankAccount.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  return bank ? bank.accountId : accountByKey(tx, "BANK_DEFAULT");
}

/** سطور دائن الذمم لتخصيص على فاتورة، بنسب ذمم سطورها */
async function arCredits(
  tx: Tx,
  invoiceId: string,
  amount: number,
  party: { studentId: string | null; guardianId: string | null },
): Promise<PostLine[]> {
  const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId }, include: { lines: true } });
  const byAccount = new Map<string, number>();
  for (const l of inv.lines)
    byAccount.set(
      l.receivableAccountId,
      (byAccount.get(l.receivableAccountId) ?? 0) + Math.max(1, l.totalMinor),
    );
  const accounts = [...byAccount.keys()];
  const shares = allocateMinor(
    amount,
    accounts.map((a) => byAccount.get(a)!),
  );
  return accounts.map((a, i) => ({
    account: a,
    credit: shares[i]!,
    studentId: inv.studentId ?? party.studentId,
    guardianId: inv.guardianId ?? party.guardianId,
    costCenterId: inv.costCenterId,
    description: `سداد الفاتورة ${inv.number}`,
  }));
}

/** توزيع مبلغ على فواتير الأسرة المفتوحة بالأقدم استحقاقاً (أو حسب التخصيص اليدوي) */
async function planAllocations(
  tx: Tx,
  guardianId: string,
  amount: number,
  manual?: Array<{ invoiceId: string; amountMinor: number }>,
) {
  const open = await tx.invoice.findMany({
    where: {
      OR: [{ guardianId }, { student: { guardians: { some: { guardianId } } } }],
      status: { in: ["ISSUED", "PARTIAL"] },
      deletedAt: null,
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
  });
  const plan: Array<{ invoiceId: string; amountMinor: number }> = [];
  let left = amount;
  if (manual?.length) {
    for (const m of manual) {
      const inv = open.find((o) => o.id === m.invoiceId);
      if (!inv) throw badRequest("فاتورة مخصصة غير مفتوحة أو لا تخص الأسرة");
      if (m.amountMinor <= 0) continue;
      if (m.amountMinor > balanceOf(inv)) throw badRequest(`التخصيص يتجاوز رصيد الفاتورة ${inv.number}`);
      plan.push(m);
      left -= m.amountMinor;
    }
    if (left < 0) throw badRequest("مجموع التخصيص أكبر من مبلغ السند");
  } else {
    for (const inv of open) {
      if (left <= 0) break;
      const take = Math.min(left, balanceOf(inv));
      if (take > 0) plan.push({ invoiceId: inv.id, amountMinor: take });
      left -= take;
    }
  }
  return { plan, unapplied: left };
}

export async function createReceipt(db: TenantDb, session: SessionData, input: ReceiptInput) {
  requireStaff(session, "collections", "create", "استلام المدفوعات من صلاحية أمين الصندوق والمحاسبة");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
    throw badRequest("مبلغ السند غير صالح");
  if (input.method === "CHEQUE" && (!input.chequeNumber?.trim() || !input.chequeBank?.trim()))
    throw badRequest("رقم الشيك والبنك مطلوبان");
  if ((input.method === "BANK_TRANSFER" || input.method === "SADAD") && !input.reference?.trim())
    throw badRequest("رقم المرجع مطلوب للتحويل والسداد");
  const guardian = await db.guardian.findFirst({ where: { id: input.guardianId, deletedAt: null } });
  if (!guardian) throw notFound("ولي الأمر غير موجود");
  // النقد يدخل وردية أمين الصندوق المفتوحة
  const session_ =
    input.method === "CASH"
      ? await db.cashSession.findFirst({ where: { cashierId: session.user.id, status: "OPEN" } })
      : null;
  if (input.method === "CASH" && !session_ && session.roleKeys.includes("CASHIER"))
    throw badRequest("افتح وردية الصندوق قبل استلام النقد");
  const student = input.studentId
    ? await db.student.findFirst({
        where: { id: input.studentId },
        select: { id: true, branchId: true, fullName: true },
      })
    : await db.student.findFirst({
        where: { guardians: { some: { guardianId: guardian.id } }, deletedAt: null },
        orderBy: { birthDate: "asc" },
        select: { id: true, branchId: true, fullName: true },
      });

  const receipt = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const { plan, unapplied } = await planAllocations(tx, guardian.id, input.amountMinor, input.allocations);
    const debitAccount = await debitAccountFor(
      tx,
      input.method,
      input.bankAccountId,
      student?.branchId ?? null,
    );
    const costCenterId = await branchCostCenter(tx, session.tenant.id, student?.branchId);
    const number = await nextNumber(tx, session.tenant.id, "receipt");
    const r = await tx.receipt.create({
      data: {
        tenantId: session.tenant.id,
        number,
        date: dateOnly(input.date),
        guardianId: guardian.id,
        studentId: student?.id ?? null,
        payerName: input.payerName?.trim() || guardian.name,
        method: input.method,
        amountMinor: input.amountMinor,
        unappliedMinor: unapplied,
        reference: input.reference?.trim() || null,
        bankAccountId: input.bankAccountId ?? null,
        chequeNumber: input.chequeNumber?.trim() || null,
        chequeBank: input.chequeBank?.trim() || null,
        chequeDate: input.chequeDate ? dateOnly(input.chequeDate) : null,
        chequeStatus: input.method === "CHEQUE" ? "PENDING" : null,
        cashSessionId: session_?.id ?? null,
        branchId: student?.branchId ?? null,
        notes: input.notes ?? null,
        createdById: session.user.id,
        allocations: {
          create: plan.map((p) => ({
            tenantId: session.tenant.id,
            invoiceId: p.invoiceId,
            amountMinor: p.amountMinor,
          })),
        },
      },
    });
    const party = { studentId: student?.id ?? null, guardianId: guardian.id };
    const lines: PostLine[] = [
      {
        account: debitAccount,
        debit: input.amountMinor,
        costCenterId,
        ...party,
        description: `${PAYMENT_METHOD[input.method].label}${input.reference ? ` — ${input.reference}` : ""}`,
      },
    ];
    for (const p of plan) lines.push(...(await arCredits(tx, p.invoiceId, p.amountMinor, party)));
    if (unapplied > 0) {
      lines.push({
        account: await accountByKey(tx, "GUARDIAN_CREDIT"),
        credit: unapplied,
        costCenterId,
        ...party,
        description: "دفعة زائدة — رصيد دائن للأسرة",
      });
      await tx.guardianCredit.create({
        data: {
          tenantId: session.tenant.id,
          guardianId: guardian.id,
          studentId: student?.id ?? null,
          amountMinor: unapplied,
          source: "OVERPAYMENT",
          sourceId: r.id,
          createdById: session.user.id,
        },
      });
    }
    const entry = await postEntry(tx, session, {
      date: input.date,
      description: `سند قبض ${number} — ${guardian.name}`,
      source: "RECEIPT",
      sourceType: "Receipt",
      sourceId: r.id,
      reference: input.reference ?? String(number),
      lines,
    });
    const saved = await tx.receipt.update({ where: { id: r.id }, data: { journalEntryId: entry.id } });
    for (const p of plan) await refreshInvoice(tx, p.invoiceId);
    return saved;
  });
  if (input.notify !== false && student) {
    const due = await db.invoice.findMany({
      where: {
        OR: [{ guardianId: guardian.id }, { student: { guardians: { some: { guardianId: guardian.id } } } }],
        status: { in: ["ISSUED", "PARTIAL"] },
      },
      select: { totalMinor: true, paidMinor: true, creditedMinor: true },
    });
    const money = (v: number) => formatMoney(v, { currency: session.tenant.currency });
    await messageGuardians(
      db,
      session,
      student.id,
      "receipt_issued",
      {
        amount: money(input.amountMinor),
        method: PAYMENT_METHOD[input.method].label,
        number: receipt.number,
        balance: money(due.reduce((s, i) => s + balanceOf(i), 0)),
      },
      { link: `/finance/receipts/${receipt.id}`, title: `سند قبض ${receipt.number}` },
    );
  }
  return receipt;
}

/** عكس أثر السند على الفواتير والرصيد الدائن */
async function unwindReceipt(
  tx: Tx,
  session: SessionData,
  receiptId: string,
  reason: string,
  creditSource: "RECEIPT_VOID",
) {
  const r = await tx.receipt.findFirstOrThrow({
    where: { id: receiptId },
    include: { allocations: { where: { reversedAt: null } } },
  });
  const now = new Date();
  for (const a of r.allocations)
    await tx.receiptAllocation.update({ where: { id: a.id }, data: { reversedAt: now } });
  for (const invoiceId of new Set(r.allocations.map((a) => a.invoiceId))) await refreshInvoice(tx, invoiceId);
  if (r.unappliedMinor > 0 && r.guardianId) {
    await tx.guardianCredit.create({
      data: {
        tenantId: session.tenant.id,
        guardianId: r.guardianId,
        studentId: r.studentId,
        amountMinor: -r.unappliedMinor,
        source: creditSource,
        sourceId: r.id,
        note: reason,
        createdById: session.user.id,
      },
    });
  }
  return r;
}

export async function voidReceipt(db: TenantDb, session: SessionData, id: string, reason: string) {
  requirePerm(session, "collections", "update", "إلغاء السندات من صلاحية المحاسبة");
  const r = await db.receipt.findFirst({ where: { id } });
  if (!r) throw notFound("السند غير موجود");
  if (r.status === "VOID") throw badRequest("السند ملغى مسبقاً");
  if (r.chequeStatus && r.chequeStatus !== "PENDING") throw badRequest("الشيك محصّل أو مرتد؛ لا يُلغى السند");
  if (r.guardianId && r.unappliedMinor > 0) {
    const credit = await guardianCreditBalance(db, r.guardianId);
    if (credit < r.unappliedMinor)
      throw badRequest("استُخدم الرصيد الدائن من هذا السند؛ ألغِ الاستخدام أولاً");
  }
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    await unwindReceipt(tx, session, id, reason, "RECEIPT_VOID");
    if (r.journalEntryId)
      await reverseEntry(tx, session, r.journalEntryId, {
        date: todayIso(session),
        reason: `إلغاء سند القبض ${r.number}: ${reason}`,
      });
    return tx.receipt.update({ where: { id }, data: { status: "VOID", voidReason: reason } });
  });
}

/** تحصيل الشيك (إلى البنك) أو ارتداده (يعود الدين على الأسرة) */
export async function chequeAction(
  db: TenantDb,
  session: SessionData,
  input: {
    receiptId: string;
    action: "CLEAR" | "BOUNCE";
    bankAccountId?: string | null;
    date: string;
    note?: string | null;
  },
) {
  requirePerm(session, "collections", "update", "متابعة الشيكات من صلاحية المحاسبة");
  const r = await db.receipt.findFirst({ where: { id: input.receiptId } });
  if (!r || r.method !== "CHEQUE") throw notFound("السند ليس شيكاً");
  if (r.status === "VOID" || r.chequeStatus !== "PENDING") throw badRequest("الشيك ليس تحت التحصيل");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const cheques = await accountByKey(tx, "CHEQUES_UNDER_COLLECTION");
    const party = { studentId: r.studentId, guardianId: r.guardianId };
    if (input.action === "CLEAR") {
      const bank = await debitAccountFor(tx, "BANK_TRANSFER", input.bankAccountId, r.branchId);
      await postEntry(tx, session, {
        date: input.date,
        description: `تحصيل الشيك ${r.chequeNumber} (سند ${r.number})`,
        source: "CHEQUE",
        sourceType: "Receipt",
        sourceId: r.id,
        reference: r.chequeNumber,
        lines: [
          { account: bank, debit: r.amountMinor, ...party },
          { account: cheques, credit: r.amountMinor, ...party },
        ],
      });
      return tx.receipt.update({
        where: { id: r.id },
        data: {
          chequeStatus: "CLEARED",
          chequeUpdatedAt: new Date(),
          bankAccountId: input.bankAccountId ?? r.bankAccountId,
        },
      });
    }
    // الارتداد: الذمم (والرصيد الدائن إن وُجد) تعود مدينة، ويخرج الشيك من «تحت التحصيل»
    const full = await tx.receipt.findFirstOrThrow({
      where: { id: r.id },
      include: { allocations: { where: { reversedAt: null } } },
    });
    const lines: PostLine[] = [
      { account: cheques, credit: r.amountMinor, ...party, description: `شيك مرتد ${r.chequeNumber}` },
    ];
    for (const a of full.allocations)
      for (const l of await arCredits(tx, a.invoiceId, a.amountMinor, party))
        lines.push({ ...l, debit: l.credit, credit: 0, description: `ارتداد شيك — ${l.description ?? ""}` });
    if (r.unappliedMinor > 0)
      lines.push({ account: await accountByKey(tx, "GUARDIAN_CREDIT"), debit: r.unappliedMinor, ...party });
    await unwindReceipt(tx, session, r.id, input.note ?? "شيك مرتد", "RECEIPT_VOID");
    await postEntry(tx, session, {
      date: input.date,
      description: `ارتداد الشيك ${r.chequeNumber} (سند ${r.number})`,
      source: "CHEQUE",
      sourceType: "Receipt",
      sourceId: r.id,
      reference: r.chequeNumber,
      lines,
    });
    return tx.receipt.update({
      where: { id: r.id },
      data: { chequeStatus: "BOUNCED", chequeUpdatedAt: new Date(), voidReason: input.note ?? "شيك مرتد" },
    });
  });
}

/** استخدام الرصيد الدائن للأسرة لسداد فواتيرها المفتوحة */
export async function applyCredit(
  db: TenantDb,
  session: SessionData,
  input: { guardianId: string; amountMinor?: number | null },
) {
  requirePerm(session, "collections", "update");
  const available = await guardianCreditBalance(db, input.guardianId);
  const amount = Math.min(available, input.amountMinor ?? available);
  if (amount <= 0) throw badRequest("لا يوجد رصيد دائن للأسرة");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const { plan } = await planAllocations(tx, input.guardianId, amount);
    const used = plan.reduce((s, p) => s + p.amountMinor, 0);
    if (!used) throw badRequest("لا فواتير مفتوحة للأسرة");
    const party = { studentId: null, guardianId: input.guardianId };
    const lines: PostLine[] = [
      {
        account: await accountByKey(tx, "GUARDIAN_CREDIT"),
        debit: used,
        ...party,
        description: "استخدام الرصيد الدائن",
      },
    ];
    for (const p of plan) {
      lines.push(...(await arCredits(tx, p.invoiceId, p.amountMinor, party)));
      await tx.receiptAllocation.create({
        data: {
          tenantId: session.tenant.id,
          invoiceId: p.invoiceId,
          amountMinor: p.amountMinor,
          source: "CREDIT",
        },
      });
    }
    const entry = await postEntry(tx, session, {
      date: todayIso(session),
      description: "تسوية الرصيد الدائن للأسرة على فواتيرها",
      source: "CREDIT_APPLICATION",
      sourceType: "Guardian",
      sourceId: input.guardianId,
      lines,
    });
    await tx.guardianCredit.create({
      data: {
        tenantId: session.tenant.id,
        guardianId: input.guardianId,
        amountMinor: -used,
        source: "APPLIED",
        sourceId: entry.id,
        createdById: session.user.id,
      },
    });
    for (const p of plan) await refreshInvoice(tx, p.invoiceId);
    return { used };
  });
}

// =====================================================================
// الاسترداد (بموافقة)
// =====================================================================

export async function listRefunds(db: TenantDb, session: SessionData, guardianId: string) {
  await assertFamilyAccess(db, session, guardianId);
  return db.refund.findMany({ where: { guardianId }, orderBy: { createdAt: "desc" } });
}

export async function requestRefund(
  db: TenantDb,
  session: SessionData,
  input: {
    guardianId: string;
    amountMinor: number;
    method: PaymentMethod;
    bankAccountId?: string | null;
    reason: string;
  },
) {
  requirePerm(session, "collections", "update", "طلبات الاسترداد من صلاحية المحاسبة");
  const available = await guardianCreditBalance(db, input.guardianId);
  if (input.amountMinor <= 0 || input.amountMinor > available)
    throw badRequest(
      `يمكن استرداد الرصيد الدائن فقط (${formatMoney(available, { currency: session.tenant.currency })})`,
    );
  const guardian = await db.guardian.findFirstOrThrow({ where: { id: input.guardianId } });
  const refund = await db.refund.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "refund"),
      guardianId: guardian.id,
      amountMinor: input.amountMinor,
      method: input.method,
      bankAccountId: input.bankAccountId ?? null,
      reason: input.reason,
      createdById: session.user.id,
    },
  });
  const req = await createApprovalRequest(db, session, {
    type: "finance_refund",
    title: `استرداد ${formatMoney(input.amountMinor, { currency: session.tenant.currency })} لـ${guardian.name}`,
    description: input.reason,
    entityType: "Refund",
    entityId: refund.id,
    link: `/finance/families/${guardian.id}`,
    steps: [{ name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" }],
  });
  return db.refund.update({ where: { id: refund.id }, data: { approvalRequestId: req.id } });
}

export async function onRefundApproval(
  db: TenantDb,
  _session: SessionData,
  request: { entityId: string | null },
  event: ApprovalHookEvent,
) {
  if (!request.entityId || !event.final) return;
  await db.refund.updateMany({
    where: { id: request.entityId, status: "PENDING" },
    data: { status: event.decision === "APPROVED" ? "APPROVED" : "REJECTED" },
  });
}

export async function payRefund(db: TenantDb, session: SessionData, id: string, date: string) {
  requirePerm(session, "collections", "update");
  const refund = await db.refund.findFirst({ where: { id } });
  if (!refund) throw notFound("طلب الاسترداد غير موجود");
  if (refund.status !== "APPROVED") throw badRequest("لم يُعتمد الاسترداد بعد");
  const available = await guardianCreditBalance(db, refund.guardianId);
  if (available < refund.amountMinor) throw badRequest("الرصيد الدائن الحالي أقل من مبلغ الاسترداد");
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    const credit = await debitAccountFor(tx, refund.method, refund.bankAccountId, null);
    const entry = await postEntry(tx, session, {
      date,
      description: `استرداد رقم ${refund.number}: ${refund.reason}`,
      source: "REFUND",
      sourceType: "Refund",
      sourceId: refund.id,
      lines: [
        {
          account: await accountByKey(tx, "GUARDIAN_CREDIT"),
          debit: refund.amountMinor,
          guardianId: refund.guardianId,
        },
        { account: credit, credit: refund.amountMinor, guardianId: refund.guardianId },
      ],
    });
    await tx.guardianCredit.create({
      data: {
        tenantId: session.tenant.id,
        guardianId: refund.guardianId,
        amountMinor: -refund.amountMinor,
        source: "REFUND",
        sourceId: refund.id,
        note: refund.reason,
        createdById: session.user.id,
      },
    });
    return tx.refund.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date(), journalEntryId: entry.id },
    });
  });
}

// =====================================================================
// عرض السندات
// =====================================================================

export async function getReceipt(db: TenantDb, session: SessionData, id: string) {
  const scope =
    resolveScope(session.access, "collections", "view") ?? resolveScope(session.access, "invoices", "view");
  if (!scope) throw forbidden();
  const limited = scope.kind === "limited" && !scope.branchIds.length && !scope.stageIds.length;
  const r = await db.receipt.findFirst({
    where: {
      id,
      ...(limited
        ? scope.own
          ? { createdById: session.user.id }
          : { guardianId: { in: await ownGuardianIds(db, session) } }
        : {}),
    },
    include: {
      allocations: {
        include: {
          invoice: {
            select: { id: true, number: true, totalMinor: true, student: { select: { fullName: true } } },
          },
        },
      },
    },
  });
  if (!r) throw notFound("السند غير موجود");
  const [guardian, student, cashier, entry, bank] = await Promise.all([
    r.guardianId
      ? db.guardian.findFirst({ where: { id: r.guardianId }, select: { id: true, name: true, phone: true } })
      : null,
    r.studentId
      ? db.student.findFirst({
          where: { id: r.studentId },
          select: { id: true, fullName: true, academicNumber: true },
        })
      : null,
    r.createdById ? db.user.findFirst({ where: { id: r.createdById }, select: { name: true } }) : null,
    r.journalEntryId
      ? db.journalEntry.findFirst({ where: { id: r.journalEntryId }, select: { id: true, number: true } })
      : null,
    r.bankAccountId
      ? db.bankAccount.findFirst({ where: { id: r.bankAccountId }, select: { name: true } })
      : null,
  ]);
  return {
    ...r,
    guardian,
    student,
    cashier: cashier?.name ?? null,
    journalEntry: entry,
    bankName: bank?.name ?? null,
    canManage: hasPerm(session, "collections", "update"),
  };
}

export async function listReceipts(
  db: TenantDb,
  session: SessionData,
  input: { from?: string; to?: string; method?: PaymentMethod | null; q?: string | null; take?: number },
) {
  const scope = requirePerm(session, "collections", "view");
  const limited = scope.kind === "limited" && !scope.branchIds.length && !scope.stageIds.length;
  const rows = await db.receipt.findMany({
    where: {
      ...(limited
        ? scope.own
          ? { createdById: session.user.id }
          : { guardianId: { in: await ownGuardianIds(db, session) } }
        : {}),
      ...(input.from || input.to
        ? {
            date: {
              ...(input.from ? { gte: dateOnly(input.from) } : {}),
              ...(input.to ? { lte: dateOnly(input.to) } : {}),
            },
          }
        : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(input.q?.trim()
        ? {
            OR: [
              { payerName: { contains: input.q.trim(), mode: "insensitive" as const } },
              { reference: { contains: input.q.trim() } },
              ...(/^\d+$/.test(input.q.trim()) ? [{ number: Number(input.q.trim()) }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: input.take ?? 300,
  });
  const users = await db.user.findMany({
    where: {
      id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)))] },
    },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ ...r, cashier: users.find((u) => u.id === r.createdById)?.name ?? null }));
}

// =====================================================================
// وردية الصندوق
// =====================================================================

export async function currentCashSession(db: TenantDb, session: SessionData) {
  requireStaff(session, "collections", "create");
  const s = await db.cashSession.findFirst({ where: { cashierId: session.user.id, status: "OPEN" } });
  if (!s)
    return {
      open: null,
      recent: await db.cashSession.findMany({
        where: { cashierId: session.user.id },
        orderBy: { openedAt: "desc" },
        take: 10,
      }),
    };
  const receipts = await db.receipt.findMany({
    where: { cashSessionId: s.id, status: "POSTED" },
    select: { amountMinor: true },
  });
  const collected = receipts.reduce((a, r) => a + r.amountMinor, 0);
  return {
    open: {
      ...s,
      collectedMinor: collected,
      count: receipts.length,
      expectedMinor: s.openingFloatMinor + collected,
    },
    recent: await db.cashSession.findMany({
      where: { cashierId: session.user.id, status: "CLOSED" },
      orderBy: { openedAt: "desc" },
      take: 10,
    }),
  };
}

export async function openCashSession(
  db: TenantDb,
  session: SessionData,
  input: { openingFloatMinor: number; branchId?: string | null },
) {
  requireStaff(session, "collections", "create");
  if (await db.cashSession.findFirst({ where: { cashierId: session.user.id, status: "OPEN" } }))
    throw badRequest("لديك وردية مفتوحة");
  return db.cashSession.create({
    data: {
      tenantId: session.tenant.id,
      cashierId: session.user.id,
      branchId: input.branchId ?? null,
      openingFloatMinor: input.openingFloatMinor,
    },
  });
}

/** إغلاق الوردية: مطابقة النقد الفعلي مع المتوقع، وتسجيل الفرق بقيد (عجز/زيادة) */
export async function closeCashSession(
  db: TenantDb,
  session: SessionData,
  input: { countedMinor: number; note?: string | null },
) {
  const cur = await currentCashSession(db, session);
  if (!cur.open) throw badRequest("لا توجد وردية مفتوحة");
  const s = cur.open;
  const difference = input.countedMinor - s.expectedMinor;
  return db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let entryId: string | null = null;
    if (difference !== 0) {
      const keys = await accountIds(tx, ["CASH", "CASH_OVER_SHORT"]);
      const abs = Math.abs(difference);
      const entry = await postEntry(tx, session, {
        date: todayIso(session),
        description: `${difference < 0 ? "عجز" : "زيادة"} صندوق عند إغلاق وردية ${session.user.name}`,
        source: "CASH_SESSION",
        sourceType: "CashSession",
        sourceId: s.id,
        lines:
          difference < 0
            ? [
                { account: keys.get("CASH_OVER_SHORT")!, debit: abs },
                { account: keys.get("CASH")!, credit: abs },
              ]
            : [
                { account: keys.get("CASH")!, debit: abs },
                { account: keys.get("CASH_OVER_SHORT")!, credit: abs },
              ],
      });
      entryId = entry.id;
    }
    return tx.cashSession.update({
      where: { id: s.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        expectedMinor: s.expectedMinor,
        countedMinor: input.countedMinor,
        differenceMinor: difference,
        differenceEntryId: entryId,
        note: input.note ?? null,
      },
    });
  });
}

export { n };
