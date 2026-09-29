/**
 * المواصلات: الحافلات (سائق ومشرفة، تأمين ورخصة وفحص بتنبيهات)، الخطوط والمحطات بإحداثياتها وأوقاتها،
 * تسكين الطلاب (بسعة الحافلة) مع فاتورة رسوم النقل تلقائياً بنسبة المدة المتبقية، سجل الحافلة بتكاليفه المرحّلة،
 * والرحلة اليومية: المشرفة تحدّث المحطة الحالية فيُشعَر أولياء أمور المحطة التالية باقتراب الحافلة.
 */
import { transportFee } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { buildDraft, issueDraft } from "@/server/services/finance/billing.service";
import { checkBudget } from "@/server/services/finance/budget.service";
import { branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { notify } from "@/server/services/notifications.service";
import { canOps, dateOnly, ensureOpsAccounts, isoOf, money, requireOps, settingsOf, todayOf } from "./common";

async function familyStudentIds(db: TenantDb, session: SessionData) {
  const rows = await db.student.findMany({ where: { deletedAt: null, OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** هل المستخدم سائق أو مشرفة هذه الحافلة */
async function isCrew(db: TenantDb, session: SessionData, bus: { driverId: string | null; supervisorId: string | null }) {
  const emp = await db.employee.findFirst({ where: { userId: session.user.id, deletedAt: null }, select: { id: true } });
  return Boolean(emp && (emp.id === bus.driverId || emp.id === bus.supervisorId));
}

// ---------------------------------------------------------------------
// الحافلات
// ---------------------------------------------------------------------

export async function listBuses(db: TenantDb, session: SessionData) {
  requireOps(session, "transport", "view");
  const [buses, routes, assignments, emps] = await Promise.all([
    db.bus.findMany({ orderBy: { code: "asc" } }),
    db.transportRoute.findMany({ where: { isActive: true }, select: { id: true, busId: true, name: true } }),
    db.transportAssignment.findMany({ where: { status: "ACTIVE" }, select: { routeId: true } }),
    db.employee.findMany({ where: { deletedAt: null }, select: { id: true, fullName: true, phone: true } }),
  ]);
  const alertDays = settingsOf(session, "transport").expiryAlertDays;
  const limit = dateOnly(todayOf(session)).getTime() + alertDays * 86_400_000;
  return buses.map((b) => {
    const rs = routes.filter((r) => r.busId === b.id);
    const riders = assignments.filter((a) => rs.some((r) => r.id === a.routeId)).length;
    const exp = ([["التأمين", b.insuranceExpiry], ["الرخصة", b.licenseExpiry], ["الفحص الدوري", b.inspectionExpiry]] as const).filter(([, d]) => d && d.getTime() <= limit).map(([k, d]) => ({ kind: k, date: isoOf(d)! }));
    return { ...b, driver: emps.find((e) => e.id === b.driverId)?.fullName ?? null, driverPhone: emps.find((e) => e.id === b.driverId)?.phone ?? null, supervisor: emps.find((e) => e.id === b.supervisorId)?.fullName ?? null, routes: rs.map((r) => r.name), riders, expiring: exp };
  });
}

export async function saveBus(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; plateNumber: string; model?: string | null; year?: number | null; capacity: number; branchId?: string | null; driverId?: string | null; supervisorId?: string | null; insuranceExpiry?: string | null; licenseExpiry?: string | null; inspectionExpiry?: string | null; status: string; notes?: string | null }) {
  requireOps(session, "transport", "update");
  if (input.capacity < 1 || input.capacity > 120) throw badRequest("سعة غير صالحة");
  const code = input.code.trim().toUpperCase();
  if (await db.bus.findFirst({ where: { code, ...(input.id ? { id: { not: input.id } } : {}) } })) throw badRequest("رمز الحافلة مستخدم");
  const d = (v?: string | null) => (v ? dateOnly(v) : null);
  const data = { code, plateNumber: input.plateNumber.trim(), model: input.model || null, year: input.year ?? null, capacity: input.capacity, branchId: input.branchId || null, driverId: input.driverId || null, supervisorId: input.supervisorId || null, insuranceExpiry: d(input.insuranceExpiry), licenseExpiry: d(input.licenseExpiry), inspectionExpiry: d(input.inspectionExpiry), status: input.status, notes: input.notes || null };
  return input.id ? db.bus.update({ where: { id: input.id }, data }) : db.bus.create({ data: { tenantId: session.tenant.id, ...data } });
}

export async function getBus(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "transport", "view");
  const b = await db.bus.findFirst({ where: { id }, include: { logs: { orderBy: { date: "desc" } }, routes: { include: { stops: { orderBy: { order: "asc" } } } } } });
  if (!b) throw notFound("الحافلة غير موجودة");
  const [emps, maint, banks] = await Promise.all([
    db.employee.findMany({ where: { id: { in: [b.driverId, b.supervisorId].filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true, phone: true } }),
    db.maintenanceRequest.findMany({ where: { busId: b.id, deletedAt: null }, orderBy: { number: "desc" }, take: 20, select: { id: true, number: true, title: true, status: true, createdAt: true } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  return { bus: { ...b, driver: emps.find((e) => e.id === b.driverId) ?? null, supervisor: emps.find((e) => e.id === b.supervisorId) ?? null }, maintenance: maint, banks, totalCostMinor: b.logs.reduce((s, l) => s + l.costMinor, 0), canEdit: canOps(session, "transport", "update") };
}

/** سجل الحافلة (وقود، صيانة، فحص، تأمين، حادث) — التكلفة تُرحَّل مصروف نقل بمركز تكلفة الفرع */
export async function addBusLog(db: TenantDb, session: SessionData, input: { busId: string; kind: string; date: string; odometer?: number | null; costMinor: number; description: string; paidFrom?: "CASH" | "BANK" | "AP" | null; bankAccountId?: string | null }) {
  requireOps(session, "transport", "update");
  const bus = await db.bus.findFirst({ where: { id: input.busId } });
  if (!bus) throw notFound("الحافلة غير موجودة");
  if (input.costMinor < 0) throw badRequest("تكلفة غير صالحة");
  if (input.costMinor > 0 && !input.paidFrom) throw badRequest("حدد طريقة السداد");
  await ensureOpsAccounts(db, session.tenant.id);
  const cc = await branchCostCenter(db, session.tenant.id, bus.branchId);
  const expense = (await db.account.findFirstOrThrow({ where: { systemKey: "TRANSPORT_EXPENSE", deletedAt: null } })).id;
  const warning = input.costMinor > 0 ? ((await checkBudget(db, session, { accountId: expense, costCenterId: cc, date: dateOnly(input.date), amountMinor: input.costMinor }))?.message ?? null) : null;
  const log = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let entryId: string | null = null;
    if (input.costMinor > 0) {
      let credit = input.paidFrom === "CASH" ? "key:CASH" : "key:AP";
      if (input.paidFrom === "BANK") {
        const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId } }) : null;
        if (!bank) throw badRequest("اختر الحساب البنكي");
        credit = bank.accountId;
      }
      entryId = (await postEntry(tx, session, { date: input.date, description: `حافلة ${bus.code} (${bus.plateNumber}): ${input.description}`, source: "OPERATING_EXPENSE", sourceType: "Bus", sourceId: bus.id, lines: [{ account: expense, debit: input.costMinor, costCenterId: cc }, { account: credit, credit: input.costMinor }] })).id;
    }
    return tx.busLog.create({ data: { tenantId: session.tenant.id, busId: bus.id, kind: input.kind, date: dateOnly(input.date), odometer: input.odometer ?? null, costMinor: input.costMinor, description: input.description.trim(), journalEntryId: entryId, createdById: session.user.id } });
  });
  return { log, warning };
}

// ---------------------------------------------------------------------
// الخطوط والمحطات
// ---------------------------------------------------------------------

export async function listRoutes(db: TenantDb, session: SessionData) {
  requireOps(session, "transport", "view");
  const [routes, buses, counts] = await Promise.all([
    db.transportRoute.findMany({ orderBy: { code: "asc" }, include: { stops: { orderBy: { order: "asc" } } } }),
    db.bus.findMany({ select: { id: true, code: true, plateNumber: true, capacity: true } }),
    db.transportAssignment.groupBy({ by: ["routeId"], where: { status: "ACTIVE" }, _count: true }),
  ]);
  return routes.map((r) => {
    const bus = buses.find((b) => b.id === r.busId) ?? null;
    const riders = counts.find((c) => c.routeId === r.id)?._count ?? 0;
    return { ...r, bus, riders, capacity: bus?.capacity ?? 0, full: bus ? riders >= bus.capacity : false };
  });
}

export async function saveRoute(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; name: string; busId?: string | null; branchId?: string | null; annualFeeMinor: number; isActive: boolean; stops: Array<{ id?: string | null; name: string; lat?: number | null; lng?: number | null; morningTime?: string | null; afternoonTime?: string | null }> }) {
  requireOps(session, "transport", "update");
  const code = input.code.trim().toUpperCase();
  if (await db.transportRoute.findFirst({ where: { code, ...(input.id ? { id: { not: input.id } } : {}) } })) throw badRequest("رمز الخط مستخدم");
  if (input.annualFeeMinor < 0) throw badRequest("رسوم غير صالحة");
  for (const s of input.stops) {
    if (!s.name.trim()) throw badRequest("اسم كل محطة مطلوب");
    if ((s.lat !== null && s.lat !== undefined && (s.lat < -90 || s.lat > 90)) || (s.lng !== null && s.lng !== undefined && (s.lng < -180 || s.lng > 180))) throw badRequest("إحداثيات غير صالحة");
    for (const t of [s.morningTime, s.afternoonTime]) if (t && !/^\d{2}:\d{2}$/.test(t)) throw badRequest("الوقت بصيغة HH:MM");
  }
  const data = { code, name: input.name.trim(), busId: input.busId || null, branchId: input.branchId || null, annualFeeMinor: input.annualFeeMinor, isActive: input.isActive };
  return db.$transaction(async (tx) => {
    const route = input.id ? await tx.transportRoute.update({ where: { id: input.id }, data }) : await tx.transportRoute.create({ data: { tenantId: session.tenant.id, ...data } });
    const keep = input.stops.map((s) => s.id).filter((x): x is string => Boolean(x));
    // المحطات المحذوفة: الطلاب المسكنون عليها يبقون على الخط دون محطة
    const removed = await tx.transportStop.findMany({ where: { routeId: route.id, id: { notIn: keep } }, select: { id: true } });
    if (removed.length) {
      await tx.transportAssignment.updateMany({ where: { stopId: { in: removed.map((r) => r.id) } }, data: { stopId: null } });
      await tx.transportStop.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    }
    for (const [i, s] of input.stops.entries()) {
      const d = { name: s.name.trim(), order: i + 1, lat: s.lat ?? null, lng: s.lng ?? null, morningTime: s.morningTime || null, afternoonTime: s.afternoonTime || null };
      if (s.id) await tx.transportStop.update({ where: { id: s.id }, data: d });
      else await tx.transportStop.create({ data: { tenantId: session.tenant.id, routeId: route.id, ...d } });
    }
    return route;
  });
}

export async function getRoute(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "transport", "view");
  const r = await db.transportRoute.findFirst({ where: { id }, include: { stops: { orderBy: { order: "asc" } }, bus: true, assignments: { where: { status: "ACTIVE" } } } });
  if (!r) throw notFound("الخط غير موجود");
  const students = await db.student.findMany({ where: { id: { in: r.assignments.map((a) => a.studentId) } }, select: { id: true, fullName: true, academicNumber: true, grade: { select: { name: true } }, guardians: { where: { isPrimary: true }, include: { guardian: { select: { name: true, phone: true } } } } } });
  const trips = await db.busTrip.findMany({ where: { routeId: r.id, date: dateOnly(todayOf(session)) } });
  return {
    route: r,
    riders: r.assignments.map((a) => {
      const s = students.find((x) => x.id === a.studentId);
      return { assignmentId: a.id, studentId: a.studentId, name: s?.fullName ?? "", number: s?.academicNumber ?? "", grade: s?.grade.name ?? "", guardian: s?.guardians[0]?.guardian.name ?? null, phone: s?.guardians[0]?.guardian.phone ?? null, stopId: a.stopId, stop: r.stops.find((x) => x.id === a.stopId)?.name ?? null, direction: a.direction, startDate: a.startDate, invoiceId: a.invoiceId };
    }),
    trips,
    canEdit: canOps(session, "transport", "update"),
  };
}

/**
 * تسكين طالب على خط: يُنهي تسكينه السابق، ويتحقق من سعة الحافلة، ويصدر فاتورة النقل تلقائياً
 * (بنسبة الأشهر المتبقية من العام إن فُعّل، ونسبة الاتجاه الواحد).
 */
export async function assignStudent(db: TenantDb, session: SessionData, input: { studentId: string; routeId: string; stopId?: string | null; direction: "BOTH" | "MORNING" | "AFTERNOON"; startDate: string; invoice?: boolean }) {
  requireOps(session, "transport", "create");
  const route = await db.transportRoute.findFirst({ where: { id: input.routeId, isActive: true }, include: { bus: true, stops: true } });
  if (!route) throw notFound("الخط غير موجود أو موقوف");
  if (input.stopId && !route.stops.some((s) => s.id === input.stopId)) throw badRequest("المحطة ليست على هذا الخط");
  const student = await db.student.findFirst({ where: { id: input.studentId, deletedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true, academicYearId: true, branchId: true } });
  if (!student) throw notFound("الطالب غير موجود أو غير نشط");
  const riders = await db.transportAssignment.count({ where: { routeId: route.id, status: "ACTIVE", studentId: { not: student.id } } });
  if (route.bus && riders >= route.bus.capacity) throw badRequest(`الحافلة ممتلئة (${route.bus.capacity} مقعداً)`);
  const s = settingsOf(session, "transport");
  const year = await db.academicYear.findFirst({ where: { id: student.academicYearId } });
  const fee = transportFee({ annualFeeMinor: route.annualFeeMinor, direction: input.direction, oneWayBp: s.oneWayBp, prorate: s.prorate, yearStartIso: isoOf(year?.startDate) ?? input.startDate, yearEndIso: isoOf(year?.endDate) ?? input.startDate, startIso: input.startDate });
  const doInvoice = (input.invoice ?? s.autoInvoice) && fee.amountMinor > 0;
  const feeItem = doInvoice ? await db.feeItem.findFirst({ where: { kind: "TRANSPORT", isActive: true } }) : null;
  if (doInvoice && !feeItem) throw badRequest("لا يوجد بند رسوم نقل مفعّل في «إعداد الرسوم»");
  const result = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    await tx.transportAssignment.updateMany({ where: { studentId: student.id, status: "ACTIVE" }, data: { status: "ENDED", endDate: new Date(dateOnly(input.startDate).getTime() - 86_400_000) } });
    let invoiceId: string | null = null;
    if (doInvoice && feeItem) {
      const label = `رسوم النقل — ${route.name}${input.direction !== "BOTH" ? (input.direction === "MORNING" ? " (ذهاب فقط)" : " (عودة فقط)") : ""}${fee.months ? ` — ${fee.months} من ${fee.totalMonths} أشهر` : ""}`;
      const draft = await buildDraft(tx, { studentId: student.id, lines: [{ feeItemId: feeItem.id, description: label, unitMinor: fee.amountMinor }], applyDiscounts: true, onDate: dateOnly(input.startDate) });
      const inv = await issueDraft(tx, session, draft, { source: "TRANSPORT", issueDate: todayOf(session), notes: `تسكين على خط ${route.code}` });
      invoiceId = inv.id;
    }
    const a = await tx.transportAssignment.create({ data: { tenantId: session.tenant.id, studentId: student.id, routeId: route.id, stopId: input.stopId || null, direction: input.direction, startDate: dateOnly(input.startDate), invoiceId, createdById: session.user.id } });
    await tx.student.update({ where: { id: student.id }, data: { transportMode: "BUS" } });
    return a;
  });
  return { assignment: result, feeMinor: doInvoice ? fee.amountMinor : 0, feeText: doInvoice ? money(session, fee.amountMinor) : null };
}

export async function endAssignment(db: TenantDb, session: SessionData, id: string, endDate: string) {
  requireOps(session, "transport", "update");
  const a = await db.transportAssignment.findFirst({ where: { id, status: "ACTIVE" } });
  if (!a) throw notFound("التسكين غير موجود");
  await db.student.update({ where: { id: a.studentId }, data: { transportMode: null } });
  // تسوية الرسوم (إشعار دائن) تتم من الفاتورة في المالية حسب سياسة الاسترداد
  return db.transportAssignment.update({ where: { id }, data: { status: "ENDED", endDate: dateOnly(endDate) } });
}

/** طلاب بلا تسكين ممن اختاروا حافلة المدرسة (للتسكين السريع) */
export async function unassigned(db: TenantDb, session: SessionData, input: { q?: string | null }) {
  requireOps(session, "transport", "view");
  const active = await db.transportAssignment.findMany({ where: { status: "ACTIVE" }, select: { studentId: true } });
  const q = input.q?.trim();
  return db.student.findMany({ where: { deletedAt: null, status: "ACTIVE", id: { notIn: active.map((a) => a.studentId) }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { academicNumber: { contains: q } }] } : { transportMode: "BUS" }) }, select: { id: true, fullName: true, academicNumber: true, grade: { select: { name: true } } }, take: 50, orderBy: { fullName: "asc" } });
}

// ---------------------------------------------------------------------
// الرحلة اليومية وإشعار الاقتراب
// ---------------------------------------------------------------------

async function tripAccess(db: TenantDb, session: SessionData, routeId: string) {
  const route = await db.transportRoute.findFirst({ where: { id: routeId }, include: { bus: true, stops: { orderBy: { order: "asc" } } } });
  if (!route) throw notFound("الخط غير موجود");
  if (!canOps(session, "transport", "update") && !(route.bus && (await isCrew(db, session, route.bus)))) throw forbidden("تشغيل الرحلة لمشرفة الحافلة أو مسؤول النقل");
  return route;
}

export async function startTrip(db: TenantDb, session: SessionData, input: { routeId: string; shift: "MORNING" | "AFTERNOON" }) {
  const route = await tripAccess(db, session, input.routeId);
  if (!route.busId) throw badRequest("لا حافلة مخصصة للخط");
  const date = dateOnly(todayOf(session));
  const found = await db.busTrip.findFirst({ where: { routeId: route.id, date, shift: input.shift } });
  if (found) return found;
  return db.busTrip.create({ data: { tenantId: session.tenant.id, busId: route.busId, routeId: route.id, date, shift: input.shift, createdById: session.user.id } });
}

/**
 * وصول الحافلة إلى محطة: تُحدَّث المحطة الحالية، ويُشعَر أولياء أمور طلاب المحطة التالية بالاقتراب
 * (تتبع يدوي من المشرفة؛ التتبع بـ GPS تكامل اختياري لاحق).
 */
export async function arriveAtStop(db: TenantDb, session: SessionData, input: { tripId: string; stopId: string }) {
  const trip = await db.busTrip.findFirst({ where: { id: input.tripId } });
  if (!trip || trip.status !== "STARTED") throw badRequest("الرحلة غير جارية");
  const route = await tripAccess(db, session, trip.routeId);
  const ordered = trip.shift === "MORNING" ? route.stops : [...route.stops].reverse();
  const idx = ordered.findIndex((s) => s.id === input.stopId);
  if (idx < 0) throw badRequest("المحطة ليست على الخط");
  await db.busTrip.update({ where: { id: trip.id }, data: { currentStopId: input.stopId } });
  const next = ordered[idx + 1];
  let notified = 0;
  if (next && settingsOf(session, "transport").notifyApproach) {
    const riders = await db.transportAssignment.findMany({ where: { routeId: route.id, stopId: next.id, status: "ACTIVE", direction: { in: ["BOTH", trip.shift] } }, select: { studentId: true } });
    const links = await db.studentGuardian.findMany({ where: { studentId: { in: riders.map((r) => r.studentId) } }, include: { guardian: { select: { userId: true } }, student: { select: { fullName: true } } } });
    const userIds = [...new Set(links.map((l) => l.guardian.userId).filter((x): x is string => Boolean(x)))];
    notified = await notify(db, { tenantId: session.tenant.id, userIds, type: "SYSTEM", title: trip.shift === "MORNING" ? `الحافلة تقترب من محطة ${next.name}` : `الحافلة تقترب من محطة ${next.name} (العودة)`, body: `خط ${route.name}${route.bus ? ` — حافلة ${route.bus.code}` : ""}`, link: "/transport/my", actorId: session.user.id, entityType: "BusTrip", entityId: trip.id });
  }
  return { current: input.stopId, next: next?.name ?? null, notified };
}

export async function toggleBoarded(db: TenantDb, session: SessionData, input: { tripId: string; studentId: string; boarded: boolean }) {
  const trip = await db.busTrip.findFirst({ where: { id: input.tripId } });
  if (!trip || trip.status !== "STARTED") throw badRequest("الرحلة غير جارية");
  await tripAccess(db, session, trip.routeId);
  const list = new Set((trip.boarded as string[]) ?? []);
  if (input.boarded) list.add(input.studentId);
  else list.delete(input.studentId);
  return db.busTrip.update({ where: { id: trip.id }, data: { boarded: [...list] } });
}

export async function completeTrip(db: TenantDb, session: SessionData, tripId: string) {
  const trip = await db.busTrip.findFirst({ where: { id: tripId } });
  if (!trip || trip.status !== "STARTED") throw badRequest("الرحلة غير جارية");
  await tripAccess(db, session, trip.routeId);
  return db.busTrip.update({ where: { id: trip.id }, data: { status: "COMPLETED", completedAt: new Date() } });
}

/** رحلات اليوم لمشرفة/سائق (أو مسؤول النقل): خطوطهم وطلابها وحالة الرحلة */
export async function myTrips(db: TenantDb, session: SessionData) {
  const emp = await db.employee.findFirst({ where: { userId: session.user.id, deletedAt: null }, select: { id: true } });
  const staff = canOps(session, "transport", "update");
  const buses = await db.bus.findMany({ where: staff ? { status: "ACTIVE" } : emp ? { OR: [{ driverId: emp.id }, { supervisorId: emp.id }] } : { id: "-" }, select: { id: true } });
  const routes = await db.transportRoute.findMany({ where: { busId: { in: buses.map((b) => b.id) }, isActive: true }, include: { stops: { orderBy: { order: "asc" } }, bus: { select: { code: true, plateNumber: true } }, assignments: { where: { status: "ACTIVE" } } } });
  const trips = await db.busTrip.findMany({ where: { routeId: { in: routes.map((r) => r.id) }, date: dateOnly(todayOf(session)) } });
  const students = await db.student.findMany({ where: { id: { in: routes.flatMap((r) => r.assignments.map((a) => a.studentId)) } }, select: { id: true, fullName: true } });
  return routes.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    bus: r.bus,
    stops: r.stops,
    riders: r.assignments.map((a) => ({ studentId: a.studentId, name: students.find((s) => s.id === a.studentId)?.fullName ?? "", stopId: a.stopId, direction: a.direction })),
    trips: trips.filter((t) => t.routeId === r.id),
  }));
}

/** مواصلات الأبناء لولي الأمر: الخط والمحطة والأوقات والحافلة وحالة رحلة اليوم */
export async function familyTransport(db: TenantDb, session: SessionData) {
  const ids = await familyStudentIds(db, session);
  const [students, assignments] = await Promise.all([db.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }), db.transportAssignment.findMany({ where: { studentId: { in: ids }, status: "ACTIVE" }, include: { route: { include: { stops: { orderBy: { order: "asc" } }, bus: true } } } })]);
  const trips = await db.busTrip.findMany({ where: { routeId: { in: assignments.map((a) => a.routeId) }, date: dateOnly(todayOf(session)) } });
  const emps = await db.employee.findMany({ where: { id: { in: assignments.flatMap((a) => [a.route.bus?.driverId, a.route.bus?.supervisorId]).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true, phone: true } });
  return students.map((s) => {
    const a = assignments.find((x) => x.studentId === s.id);
    if (!a) return { studentId: s.id, name: s.fullName, assignment: null };
    const stop = a.route.stops.find((x) => x.id === a.stopId) ?? null;
    return {
      studentId: s.id,
      name: s.fullName,
      assignment: {
        route: a.route.name,
        direction: a.direction,
        stop,
        stops: a.route.stops,
        bus: a.route.bus ? { code: a.route.bus.code, plateNumber: a.route.bus.plateNumber, model: a.route.bus.model } : null,
        supervisor: emps.find((e) => e.id === a.route.bus?.supervisorId) ?? null,
        driver: emps.find((e) => e.id === a.route.bus?.driverId)?.fullName ?? null,
        trips: trips.filter((t) => t.routeId === a.routeId).map((t) => ({ shift: t.shift, status: t.status, currentStop: a.route.stops.find((x) => x.id === t.currentStopId)?.name ?? null, boarded: ((t.boarded as string[]) ?? []).includes(s.id) })),
      },
    };
  });
}

/** تنبيهات انتهاء وثائق الحافلات (مهمة يومية) */
export async function notifyBusExpiries(db: TenantDb, session: SessionData) {
  const buses = await listBuses(db, session);
  const alerts = buses.filter((b) => b.expiring.length);
  if (!alerts.length) return 0;
  const officers = await db.userRole.findMany({ where: { role: { key: "TRANSPORT" } }, select: { userId: true } });
  return notify(db, { tenantId: session.tenant.id, userIds: officers.map((o) => o.userId), type: "SYSTEM", title: `وثائق حافلات تنتهي قريباً (${alerts.length})`, body: alerts.map((b) => `${b.code}: ${b.expiring.map((e) => `${e.kind} ${e.date}`).join("، ")}`).join(" · "), link: "/transport/buses", entityType: "Bus" });
}
