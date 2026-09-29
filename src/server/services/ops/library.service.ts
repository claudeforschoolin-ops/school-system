/**
 * المكتبة والموارد: الفهرسة (ISBN وباركود النسخ)، الإعارة والإرجاع والتمديد بالمسح، غرامات التأخير تُضاف لحساب الطالب
 * تلقائياً بفاتورة، الحجز وإشعار توفر الكتاب، الجرد بالمسح، والموارد الرقمية. القواعد من إعدادات المكتبة.
 */
import { addDaysIso, isbnValid, libraryFine } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { buildDraft, issueDraft } from "@/server/services/finance/billing.service";
import type { Tx } from "@/server/services/finance/ledger";
import { notify } from "@/server/services/notifications.service";
import { canOps, dateOnly, ensureFeeItem, isoOf, money, nextNo, requireOps, settingsOf, todayOf } from "./common";

async function familyStudentIds(db: TenantDb, session: SessionData) {
  const rows = await db.student.findMany({ where: { deletedAt: null, OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function guardianUserIds(db: TenantDb, studentId: string) {
  const rows = await db.studentGuardian.findMany({ where: { studentId }, include: { guardian: { select: { userId: true } }, student: { select: { userId: true } } } });
  return [...new Set(rows.flatMap((r) => [r.guardian.userId, r.student.userId]).filter((x): x is string => Boolean(x)))];
}

// ---------------------------------------------------------------------
// الفهرس
// ---------------------------------------------------------------------

export async function listBooks(db: TenantDb, session: SessionData, input: { q?: string | null; category?: string | null; digital?: boolean | null } = {}) {
  // الفهرس متاح لكل من له عرض المكتبة (الطلاب وأولياء الأمور للبحث والحجز)
  if (!canOps(session, "library", "view") && !(await familyStudentIds(db, session)).length) throw forbidden();
  const q = input.q?.trim();
  const books = await db.libraryBook.findMany({
    where: { deletedAt: null, ...(input.category ? { category: input.category } : {}), ...(input.digital !== null && input.digital !== undefined ? { isDigital: input.digital } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { author: { contains: q, mode: "insensitive" } }, { isbn: { contains: q.replace(/-/g, "") } }, { copies: { some: { barcode: q } } }] } : {}) },
    include: { copies: { select: { status: true } }, reservations: { where: { status: { in: ["WAITING", "READY"] } }, select: { id: true } } },
    orderBy: { title: "asc" },
    take: 300,
  });
  const cats = await db.libraryBook.groupBy({ by: ["category"], where: { deletedAt: null }, _count: true });
  return {
    books: books.map((b) => ({ id: b.id, title: b.title, author: b.author, isbn: b.isbn, category: b.category, year: b.year, callNumber: b.callNumber, isDigital: b.isDigital, digitalUrl: b.digitalUrl, coverUrl: b.coverUrl, copies: b.copies.length, available: b.copies.filter((c) => c.status === "AVAILABLE").length, onLoan: b.copies.filter((c) => c.status === "ON_LOAN").length, reservations: b.reservations.length })),
    categories: cats.map((c) => ({ name: c.category ?? "بلا تصنيف", count: c._count })),
    canEdit: canOps(session, "library", "update"),
  };
}

export interface BookInput {
  id?: string | null;
  isbn?: string | null;
  title: string;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  category?: string | null;
  language?: string;
  callNumber?: string | null;
  description?: string | null;
  isDigital: boolean;
  digitalUrl?: string | null;
  branchId?: string | null;
  /** عدد النسخ الجديدة (للإضافة) */
  newCopies?: number;
  shelf?: string | null;
}

export async function saveBook(db: TenantDb, session: SessionData, input: BookInput) {
  requireOps(session, "library", "update");
  const isbn = input.isbn?.replace(/[\s-]/g, "") || null;
  if (isbn && !isbnValid(isbn)) throw badRequest("رقم ISBN غير صحيح (خانة التحقق)");
  if (input.isDigital && !input.digitalUrl) throw badRequest("أدخل رابط المورد الرقمي");
  if (input.digitalUrl && !/^https?:\/\//.test(input.digitalUrl)) throw badRequest("الرابط يبدأ بـ http(s)");
  const data = { isbn, title: input.title.trim(), author: input.author || null, publisher: input.publisher || null, year: input.year ?? null, category: input.category || null, language: input.language ?? "ar", callNumber: input.callNumber || null, description: input.description || null, isDigital: input.isDigital, digitalUrl: input.digitalUrl || null, branchId: input.branchId || null };
  if (!data.title) throw badRequest("العنوان مطلوب");
  const book = input.id ? await db.libraryBook.update({ where: { id: input.id }, data }) : await db.libraryBook.create({ data: { tenantId: session.tenant.id, ...data } });
  if (!input.isDigital && input.newCopies && input.newCopies > 0) await addCopies(db, session, { bookId: book.id, count: input.newCopies, shelf: input.shelf ?? null });
  return book;
}

export async function addCopies(db: TenantDb, session: SessionData, input: { bookId: string; count: number; shelf?: string | null; priceMinor?: number | null }) {
  requireOps(session, "library", "update");
  if (input.count < 1 || input.count > 200) throw badRequest("عدد النسخ بين ١ و٢٠٠");
  const created = [];
  for (let i = 0; i < input.count; i++) {
    const n = await nextNo(db, session, "library-copy");
    created.push(await db.libraryCopy.create({ data: { tenantId: session.tenant.id, bookId: input.bookId, barcode: `LIB${String(n).padStart(6, "0")}`, shelf: input.shelf ?? null, priceMinor: input.priceMinor ?? null, acquiredAt: dateOnly(todayOf(session)) } }));
  }
  return created;
}

export async function getBook(db: TenantDb, session: SessionData, id: string) {
  if (!canOps(session, "library", "view") && !(await familyStudentIds(db, session)).length) throw forbidden();
  const b = await db.libraryBook.findFirst({ where: { id, deletedAt: null }, include: { copies: { orderBy: { barcode: "asc" } }, reservations: { where: { status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" } } } });
  if (!b) throw notFound("الكتاب غير موجود");
  const staff = canOps(session, "library", "view");
  const loans = staff ? await db.libraryLoan.findMany({ where: { copy: { bookId: b.id } }, orderBy: { loanedAt: "desc" }, take: 30, include: { copy: { select: { barcode: true } } } }) : [];
  return { book: b, loans, staff, canEdit: canOps(session, "library", "update"), reservations: staff ? b.reservations : b.reservations.map((r) => ({ ...r, name: "—" })) };
}

export async function setCopyStatus(db: TenantDb, session: SessionData, input: { copyId: string; status: "AVAILABLE" | "LOST" | "DAMAGED" | "WITHDRAWN"; shelf?: string | null }) {
  requireOps(session, "library", "update");
  const c = await db.libraryCopy.findFirst({ where: { id: input.copyId } });
  if (!c) throw notFound("النسخة غير موجودة");
  if (c.status === "ON_LOAN") throw badRequest("النسخة معارة؛ سجّل إرجاعها أولاً");
  return db.libraryCopy.update({ where: { id: c.id }, data: { status: input.status, ...(input.shelf !== undefined ? { shelf: input.shelf } : {}) } });
}

// ---------------------------------------------------------------------
// الإعارة
// ---------------------------------------------------------------------

async function unpaidFines(db: TenantDb, studentId: string) {
  const loans = await db.libraryLoan.findMany({ where: { studentId, fineStatus: "INVOICED", fineInvoiceId: { not: null } }, select: { fineInvoiceId: true } });
  if (!loans.length) return 0;
  const invs = await db.invoice.findMany({ where: { id: { in: loans.map((l) => l.fineInvoiceId!) }, status: { in: ["ISSUED", "PARTIAL"] } }, select: { totalMinor: true, paidMinor: true } });
  return invs.reduce((s, i) => s + i.totalMinor - i.paidMinor, 0);
}

/** إعارة بالمسح: نسخة متاحة (أو محجوزة لنفس المستعير) لطالب أو موظف */
export async function checkout(db: TenantDb, session: SessionData, input: { barcode: string; studentId?: string | null; userId?: string | null; dueDate?: string | null }) {
  requireOps(session, "library", "create");
  if (!input.studentId && !input.userId) throw badRequest("اختر المستعير");
  const rules = settingsOf(session, "library");
  const copy = await db.libraryCopy.findFirst({ where: { barcode: input.barcode.trim().toUpperCase() }, include: { book: true } });
  if (!copy) throw notFound("لا نسخة بهذا الباركود");
  const borrower = input.studentId ? await db.student.findFirst({ where: { id: input.studentId, deletedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true } }) : null;
  const user = input.userId ? await db.user.findFirst({ where: { id: input.userId, status: "ACTIVE" }, select: { id: true, name: true } }) : null;
  if (input.studentId && !borrower) throw notFound("الطالب غير موجود أو غير نشط");
  if (input.userId && !user) throw notFound("المستخدم غير موجود");
  if (copy.status === "ON_HOLD") {
    const hold = await db.libraryReservation.findFirst({ where: { copyId: copy.id, status: "READY" } });
    if (!hold || (hold.studentId ?? null) !== (input.studentId ?? null) || (hold.userId ?? null) !== (input.userId ?? null)) throw badRequest("النسخة محجوزة لمستعير آخر");
    await db.libraryReservation.update({ where: { id: hold.id }, data: { status: "FULFILLED" } });
  } else if (copy.status !== "AVAILABLE") throw badRequest(`النسخة غير متاحة (${copy.status === "ON_LOAN" ? "معارة" : "خارج التداول"})`);
  const active = await db.libraryLoan.count({ where: { returnedAt: null, ...(input.studentId ? { studentId: input.studentId } : { userId: input.userId }) } });
  if (active >= rules.maxLoans) throw badRequest(`الحد الأقصى ${rules.maxLoans} كتب معارة في الوقت نفسه`);
  if (input.studentId && rules.blockWithFines) {
    const due = await unpaidFines(db, input.studentId);
    if (due > 0) throw badRequest(`على الطالب غرامات مكتبة غير مسددة ${money(session, due)}`);
  }
  const overdue = await db.libraryLoan.findFirst({ where: { returnedAt: null, dueDate: { lt: dateOnly(todayOf(session)) }, ...(input.studentId ? { studentId: input.studentId } : { userId: input.userId }) } });
  if (overdue) throw badRequest("لدى المستعير كتاب متأخر؛ يُرجع أولاً");
  const due = input.dueDate ?? addDaysIso(todayOf(session), input.studentId ? rules.loanDays : rules.staffLoanDays);
  return db.$transaction(async (tx) => {
    await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: "ON_LOAN", lastSeenAt: new Date() } });
    return tx.libraryLoan.create({ data: { tenantId: session.tenant.id, copyId: copy.id, studentId: input.studentId ?? null, userId: input.userId ?? null, borrowerName: borrower?.fullName ?? user!.name, dueDate: dateOnly(due), issuedById: session.user.id } });
  });
}

/**
 * الإرجاع بالمسح: تُحسب غرامة التأخير وتُضاف لحساب الطالب بفاتورة (إن فُعّل)، ثم تُعرض النسخة على أول حجز منتظر.
 */
export async function checkin(db: TenantDb, session: SessionData, input: { barcode: string; condition?: "GOOD" | "DAMAGED" | null; notes?: string | null }) {
  requireOps(session, "library", "create");
  const copy = await db.libraryCopy.findFirst({ where: { barcode: input.barcode.trim().toUpperCase() }, include: { book: true } });
  if (!copy) throw notFound("لا نسخة بهذا الباركود");
  const loan = await db.libraryLoan.findFirst({ where: { copyId: copy.id, returnedAt: null } });
  if (!loan) throw badRequest("النسخة غير معارة");
  const rules = settingsOf(session, "library");
  const today = todayOf(session);
  const fine = libraryFine(isoOf(loan.dueDate)!, today, rules);
  const fee = fine.fineMinor > 0 && loan.studentId && rules.autoInvoiceFines ? await ensureFeeItem(db, session.tenant.id, "LIBRARY_FINE") : null;
  const result = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let invoiceId: string | null = null;
    if (fee && loan.studentId) {
      const draft = await buildDraft(tx, { studentId: loan.studentId, lines: [{ feeItemId: fee.id, description: `غرامة تأخير «${copy.book.title}» — ${fine.lateDays} يوماً`, unitMinor: fine.fineMinor }], applyDiscounts: false, onDate: dateOnly(today) });
      invoiceId = (await issueDraft(tx, session, draft, { source: "LIBRARY", issueDate: today, notes: `نسخة ${copy.barcode}` })).id;
    }
    const updated = await tx.libraryLoan.update({ where: { id: loan.id }, data: { returnedAt: new Date(), fineMinor: fine.fineMinor, fineStatus: invoiceId ? "INVOICED" : fine.fineMinor > 0 ? "NONE" : "NONE", fineInvoiceId: invoiceId, notes: input.notes ?? loan.notes } });
    // الحجز التالي على الكتاب
    const next = input.condition === "DAMAGED" ? null : await tx.libraryReservation.findFirst({ where: { bookId: copy.bookId, status: "WAITING" }, orderBy: { createdAt: "asc" } });
    if (next) await tx.libraryReservation.update({ where: { id: next.id }, data: { status: "READY", copyId: copy.id, readyUntil: dateOnly(addDaysIso(today, rules.holdDays)) } });
    await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: input.condition === "DAMAGED" ? "DAMAGED" : next ? "ON_HOLD" : "AVAILABLE", lastSeenAt: new Date() } });
    return { loan: updated, next };
  });
  if (result.next) {
    const ids = result.next.studentId ? await guardianUserIds(db, result.next.studentId) : result.next.userId ? [result.next.userId] : [];
    await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "SYSTEM", title: `الكتاب المحجوز متاح: ${copy.book.title}`, body: `يُحتفظ به حتى ${addDaysIso(today, rules.holdDays)}`, link: "/library/my", actorId: session.user.id, entityType: "LibraryReservation", entityId: result.next.id });
  }
  return { title: copy.book.title, borrower: loan.borrowerName, lateDays: fine.lateDays, fineMinor: fine.fineMinor, invoiced: result.loan.fineStatus === "INVOICED", heldFor: result.next?.name ?? null };
}

export async function renew(db: TenantDb, session: SessionData, loanId: string) {
  const loan = await db.libraryLoan.findFirst({ where: { id: loanId, returnedAt: null }, include: { copy: true } });
  if (!loan) throw notFound("الإعارة غير موجودة");
  const staff = canOps(session, "library", "create");
  if (!staff && !(loan.studentId && (await familyStudentIds(db, session)).includes(loan.studentId)) && loan.userId !== session.user.id) throw forbidden();
  const rules = settingsOf(session, "library");
  if (loan.renewals >= rules.maxRenewals) throw badRequest(`استُنفد التمديد (${rules.maxRenewals} مرات)`);
  if (isoOf(loan.dueDate)! < todayOf(session)) throw badRequest("الإعارة متأخرة؛ لا تمديد قبل الإرجاع");
  if (await db.libraryReservation.findFirst({ where: { bookId: loan.copy.bookId, status: "WAITING" } })) throw badRequest("على الكتاب حجز منتظر؛ لا يمكن التمديد");
  return db.libraryLoan.update({ where: { id: loan.id }, data: { renewals: { increment: 1 }, dueDate: dateOnly(addDaysIso(isoOf(loan.dueDate)!, loan.studentId ? rules.loanDays : rules.staffLoanDays)) } });
}

export async function waiveFine(db: TenantDb, session: SessionData, loanId: string) {
  requireOps(session, "library", "approve", "الإعفاء من الغرامة يتطلب صلاحية الاعتماد");
  const loan = await db.libraryLoan.findFirst({ where: { id: loanId } });
  if (!loan || loan.fineMinor <= 0) throw badRequest("لا غرامة على هذه الإعارة");
  if (loan.fineStatus === "INVOICED") throw badRequest("الغرامة مفوترة؛ الإعفاء بإشعار دائن من المالية");
  return db.libraryLoan.update({ where: { id: loan.id }, data: { fineStatus: "WAIVED" } });
}

export async function circulation(db: TenantDb, session: SessionData, input: { status?: "ACTIVE" | "OVERDUE" | "RETURNED" | null; q?: string | null } = {}) {
  requireOps(session, "library", "view");
  const today = dateOnly(todayOf(session));
  const q = input.q?.trim();
  const loans = await db.libraryLoan.findMany({
    where: { ...(input.status === "RETURNED" ? { returnedAt: { not: null } } : input.status === "OVERDUE" ? { returnedAt: null, dueDate: { lt: today } } : input.status === "ACTIVE" ? { returnedAt: null } : {}), ...(q ? { OR: [{ borrowerName: { contains: q, mode: "insensitive" } }, { copy: { barcode: q.toUpperCase() } }, { copy: { book: { title: { contains: q, mode: "insensitive" } } } }] } : {}) },
    include: { copy: { select: { barcode: true, book: { select: { id: true, title: true } } } } },
    orderBy: [{ returnedAt: { sort: "desc", nulls: "first" } }, { dueDate: "asc" }],
    take: 300,
  });
  const [active, overdue, today0] = await Promise.all([db.libraryLoan.count({ where: { returnedAt: null } }), db.libraryLoan.count({ where: { returnedAt: null, dueDate: { lt: today } } }), db.libraryLoan.count({ where: { loanedAt: { gte: today } } })]);
  return {
    loans: loans.map((l) => ({ id: l.id, bookId: l.copy.book.id, title: l.copy.book.title, barcode: l.copy.barcode, borrower: l.borrowerName, studentId: l.studentId, loanedAt: l.loanedAt, dueDate: l.dueDate, returnedAt: l.returnedAt, renewals: l.renewals, fineMinor: l.fineMinor, fineStatus: l.fineStatus, fineInvoiceId: l.fineInvoiceId, overdue: !l.returnedAt && l.dueDate < today, lateDays: !l.returnedAt && l.dueDate < today ? Math.round((today.getTime() - l.dueDate.getTime()) / 86_400_000) : 0 })),
    stats: { active, overdue, today: today0 },
    canWaive: canOps(session, "library", "approve"),
  };
}

/** كتب الأبناء المعارة وحجوزاتهم (ولي الأمر/الطالب) */
export async function familyLibrary(db: TenantDb, session: SessionData) {
  const ids = await familyStudentIds(db, session);
  const [students, loans, holds] = await Promise.all([
    db.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
    db.libraryLoan.findMany({ where: { studentId: { in: ids } }, include: { copy: { select: { book: { select: { title: true, author: true } } } } }, orderBy: { loanedAt: "desc" }, take: 60 }),
    db.libraryReservation.findMany({ where: { studentId: { in: ids }, status: { in: ["WAITING", "READY"] } }, include: { book: { select: { title: true } } } }),
  ]);
  const today = dateOnly(todayOf(session));
  return students.map((s) => ({
    studentId: s.id,
    name: s.fullName,
    loans: loans.filter((l) => l.studentId === s.id).map((l) => ({ id: l.id, title: l.copy.book.title, author: l.copy.book.author, dueDate: l.dueDate, returnedAt: l.returnedAt, overdue: !l.returnedAt && l.dueDate < today, renewals: l.renewals, fineMinor: l.fineMinor, fineStatus: l.fineStatus })),
    holds: holds.filter((h) => h.studentId === s.id).map((h) => ({ id: h.id, title: h.book.title, status: h.status, readyUntil: h.readyUntil })),
  }));
}

// ---------------------------------------------------------------------
// الحجز
// ---------------------------------------------------------------------

export async function reserve(db: TenantDb, session: SessionData, input: { bookId: string; studentId?: string | null }) {
  const staff = canOps(session, "library", "create");
  const family = await familyStudentIds(db, session);
  if (input.studentId && !staff && !family.includes(input.studentId)) throw forbidden("الحجز لأبنائك فقط");
  if (!input.studentId && !staff) throw badRequest("اختر الطالب");
  const book = await db.libraryBook.findFirst({ where: { id: input.bookId, deletedAt: null, isDigital: false }, include: { copies: true } });
  if (!book) throw notFound("الكتاب غير موجود");
  if (!book.copies.length) throw badRequest("لا نسخ ورقية لهذا الكتاب");
  if (await db.libraryReservation.findFirst({ where: { bookId: book.id, status: { in: ["WAITING", "READY"] }, ...(input.studentId ? { studentId: input.studentId } : { userId: session.user.id }) } })) throw badRequest("يوجد حجز قائم لهذا الكتاب");
  const student = input.studentId ? await db.student.findFirst({ where: { id: input.studentId }, select: { fullName: true } }) : null;
  const available = book.copies.find((c) => c.status === "AVAILABLE");
  const rules = settingsOf(session, "library");
  return db.$transaction(async (tx) => {
    if (available) await tx.libraryCopy.update({ where: { id: available.id }, data: { status: "ON_HOLD" } });
    return tx.libraryReservation.create({ data: { tenantId: session.tenant.id, bookId: book.id, studentId: input.studentId ?? null, userId: input.studentId ? null : session.user.id, name: student?.fullName ?? session.user.name, status: available ? "READY" : "WAITING", copyId: available?.id ?? null, readyUntil: available ? dateOnly(addDaysIso(todayOf(session), rules.holdDays)) : null } });
  });
}

export async function cancelReservation(db: TenantDb, session: SessionData, id: string) {
  const r = await db.libraryReservation.findFirst({ where: { id } });
  if (!r) throw notFound("الحجز غير موجود");
  if (!canOps(session, "library", "update") && !(r.studentId && (await familyStudentIds(db, session)).includes(r.studentId)) && r.userId !== session.user.id) throw forbidden();
  return releaseHold(db, r, "CANCELLED");
}

async function releaseHold(db: TenantDb, r: { id: string; copyId: string | null; bookId: string }, status: "CANCELLED" | "EXPIRED") {
  return db.$transaction(async (tx) => {
    if (r.copyId) {
      const next = await tx.libraryReservation.findFirst({ where: { bookId: r.bookId, status: "WAITING", id: { not: r.id } }, orderBy: { createdAt: "asc" } });
      if (next) await tx.libraryReservation.update({ where: { id: next.id }, data: { status: "READY", copyId: r.copyId } });
      else await tx.libraryCopy.updateMany({ where: { id: r.copyId, status: "ON_HOLD" }, data: { status: "AVAILABLE" } });
    }
    return tx.libraryReservation.update({ where: { id: r.id }, data: { status } });
  });
}

export async function listReservations(db: TenantDb, session: SessionData) {
  requireOps(session, "library", "view");
  return db.libraryReservation.findMany({ where: { status: { in: ["WAITING", "READY"] } }, include: { book: { select: { title: true } } }, orderBy: { createdAt: "asc" } });
}

/** مهمة يومية: انتهاء الحجوزات غير المستلمة، وتذكير المتأخرين */
export async function libraryDaily(db: TenantDb, session: SessionData) {
  const today = dateOnly(todayOf(session));
  const expired = await db.libraryReservation.findMany({ where: { status: "READY", readyUntil: { lt: today } } });
  for (const r of expired) await releaseHold(db, r, "EXPIRED");
  const overdue = await db.libraryLoan.findMany({ where: { returnedAt: null, dueDate: { lt: today }, studentId: { not: null } }, include: { copy: { select: { book: { select: { title: true } } } } } });
  let reminded = 0;
  for (const l of overdue) {
    const ids = await guardianUserIds(db, l.studentId!);
    reminded += await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "SYSTEM", title: `كتاب متأخر: ${l.copy.book.title}`, body: `كان موعد إرجاعه ${isoOf(l.dueDate)}؛ تُحتسب غرامة عن كل يوم تأخير`, link: "/library/my", entityType: "LibraryLoan", entityId: l.id });
  }
  return { expired: expired.length, reminded };
}

// ---------------------------------------------------------------------
// الجرد
// ---------------------------------------------------------------------

export async function currentStockTake(db: TenantDb, session: SessionData) {
  requireOps(session, "library", "view");
  const t = await db.libraryStockTake.findFirst({ where: { closedAt: null }, orderBy: { startedAt: "desc" } });
  const last = await db.libraryStockTake.findFirst({ where: { closedAt: { not: null } }, orderBy: { closedAt: "desc" } });
  const expected = await db.libraryCopy.count({ where: { status: { in: ["AVAILABLE", "ON_HOLD"] } } });
  return { open: t ? { ...t, scanned: (t.scanned as string[]).length } : null, last, expected };
}

export async function startStockTake(db: TenantDb, session: SessionData) {
  requireOps(session, "library", "update");
  if (await db.libraryStockTake.findFirst({ where: { closedAt: null } })) throw badRequest("يوجد جرد مفتوح");
  return db.libraryStockTake.create({ data: { tenantId: session.tenant.id, createdById: session.user.id } });
}

export async function scanStockTake(db: TenantDb, session: SessionData, barcode: string) {
  requireOps(session, "library", "update");
  const t = await db.libraryStockTake.findFirst({ where: { closedAt: null } });
  if (!t) throw badRequest("لا جرد مفتوح");
  const code = barcode.trim().toUpperCase();
  const copy = await db.libraryCopy.findFirst({ where: { barcode: code }, include: { book: { select: { title: true } } } });
  if (!copy) throw notFound("باركود غير معروف");
  const list = new Set(t.scanned as string[]);
  const dup = list.has(code);
  list.add(code);
  await db.libraryStockTake.update({ where: { id: t.id }, data: { scanned: [...list] } });
  await db.libraryCopy.update({ where: { id: copy.id }, data: { lastSeenAt: new Date() } });
  return { title: copy.book.title, status: copy.status, duplicate: dup, scanned: list.size };
}

/** إغلاق الجرد: النسخ المتاحة غير الممسوحة تُعد مفقودة (وتُعلَّم كذلك إن طُلب) */
export async function closeStockTake(db: TenantDb, session: SessionData, input: { markMissingLost: boolean }) {
  requireOps(session, "library", "approve", "إغلاق الجرد يتطلب صلاحية الاعتماد");
  const t = await db.libraryStockTake.findFirst({ where: { closedAt: null } });
  if (!t) throw badRequest("لا جرد مفتوح");
  const scanned = new Set(t.scanned as string[]);
  const shelf = await db.libraryCopy.findMany({ where: { status: { in: ["AVAILABLE", "ON_HOLD"] } }, include: { book: { select: { title: true } } } });
  const missing = shelf.filter((c) => !scanned.has(c.barcode));
  if (input.markMissingLost && missing.length) await db.libraryCopy.updateMany({ where: { id: { in: missing.map((m) => m.id) }, status: "AVAILABLE" }, data: { status: "LOST" } });
  await db.libraryStockTake.update({ where: { id: t.id }, data: { closedAt: new Date(), missing: missing.length } });
  return { scanned: scanned.size, missing: missing.map((m) => ({ barcode: m.barcode, title: m.book.title, shelf: m.shelf })) };
}

export async function libraryStats(db: TenantDb, session: SessionData) {
  requireOps(session, "library", "view");
  const since = new Date(dateOnly(todayOf(session)).getTime() - 30 * 86_400_000);
  const [books, copies, loans30, top, fines] = await Promise.all([
    db.libraryBook.count({ where: { deletedAt: null } }),
    db.libraryCopy.groupBy({ by: ["status"], _count: true }),
    db.libraryLoan.count({ where: { loanedAt: { gte: since } } }),
    db.libraryLoan.groupBy({ by: ["copyId"], _count: true, where: { loanedAt: { gte: new Date(since.getTime() - 60 * 86_400_000) } }, orderBy: { _count: { copyId: "desc" } }, take: 30 }),
    db.libraryLoan.aggregate({ where: { fineStatus: "INVOICED" }, _sum: { fineMinor: true } }),
  ]);
  const topCopies = await db.libraryCopy.findMany({ where: { id: { in: top.map((t) => t.copyId) } }, select: { id: true, book: { select: { id: true, title: true } } } });
  const byBook = new Map<string, { title: string; count: number }>();
  for (const t of top) {
    const c = topCopies.find((x) => x.id === t.copyId);
    if (!c) continue;
    const r = byBook.get(c.book.id) ?? { title: c.book.title, count: 0 };
    r.count += t._count;
    byBook.set(c.book.id, r);
  }
  return { books, copies: Object.fromEntries(copies.map((c) => [c.status, c._count])), loans30, finesInvoicedMinor: fines._sum.fineMinor ?? 0, topBooks: [...byBook.values()].sort((a, b) => b.count - a.count).slice(0, 8) };
}
