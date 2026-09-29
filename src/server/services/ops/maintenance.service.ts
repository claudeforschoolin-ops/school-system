/**
 * المرافق والصيانة: طلبات الصيانة بلوحة كانبان (جديد ← قيد التنفيذ ← بانتظار قطع ← مكتمل)، الأولوية والفنيون،
 * صور قبل/بعد، قطع الغيار من المخزون، التكلفة الخارجية بقيد (مصروف صيانة ← الصندوق/البنك/الموردون) مع رقابة الموازنة،
 * الصيانة الوقائية الدورية، وحجز القاعات والملاعب والمختبرات دون تعارض مع الحجوزات أو جدول الحصص.
 */
import { timesOverlap } from "@/lib/ops/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { checkBudget } from "@/server/services/finance/budget.service";
import { branchCostCenter, postEntry, type Tx } from "@/server/services/finance/ledger";
import { notify } from "@/server/services/notifications.service";
import { canOps, dateOnly, ensureOpsAccounts, isoOf, money, nextNo, requireOps, todayOf } from "./common";
import { issueStockCore } from "./inventory.service";
import { resolveScope } from "@/lib/rbac/access";

export const MAINT_STATUSES = ["NEW", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANCELLED"] as const;
export type MaintStatus = (typeof MAINT_STATUSES)[number];

/** طلبات يراها المستخدم: فريق الصيانة بنطاقه، وغيرهم ما أبلغوا عنه أو أُسند إليهم */
async function visibleWhere(session: SessionData) {
  if (canOps(session, "maintenance", "view")) {
    const s = requireOps(session, "maintenance", "view");
    return s.kind === "all" ? {} : { OR: [{ branchId: { in: s.branchIds } }, { branchId: null }, { reportedById: session.user.id }] };
  }
  return { OR: [{ reportedById: session.user.id }, { assigneeId: session.user.id }] };
}

export async function board(db: TenantDb, session: SessionData, input: { branchId?: string | null; category?: string | null; assigneeId?: string | null; q?: string | null } = {}) {
  const where = await visibleWhere(session);
  const q = input.q?.trim();
  const [rows, users, rooms, branches] = await Promise.all([
    db.maintenanceRequest.findMany({ where: { deletedAt: null, AND: [where, input.branchId ? { branchId: input.branchId } : {}, input.category ? { category: input.category } : {}, input.assigneeId ? { assigneeId: input.assigneeId } : {}, q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] } : {}] }, orderBy: [{ position: "asc" }, { number: "desc" }] }),
    db.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.room.findMany({ where: { deletedAt: null }, select: { id: true, name: true, branchId: true } }),
    db.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const today = todayOf(session);
  const technicians = await technicianOptions(db);
  return {
    requests: rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      category: r.category,
      priority: r.priority,
      status: r.status,
      location: [rooms.find((x) => x.id === r.roomId)?.name, r.location].filter(Boolean).join(" — ") || branches.find((b) => b.id === r.branchId)?.name || "",
      branch: branches.find((b) => b.id === r.branchId)?.name ?? null,
      assignee: users.find((u) => u.id === r.assigneeId)?.name ?? null,
      assigneeId: r.assigneeId,
      reporter: users.find((u) => u.id === r.reportedById)?.name ?? null,
      dueDate: r.dueDate,
      overdue: Boolean(r.dueDate && !["DONE", "CANCELLED"].includes(r.status) && isoOf(r.dueDate)! < today),
      photos: (r.beforePhotos as unknown[]).length + (r.afterPhotos as unknown[]).length,
      costMinor: r.partsCostMinor + r.externalCostMinor,
      scheduled: Boolean(r.scheduleId),
      createdAt: r.createdAt,
      position: r.position,
    })),
    technicians,
    canManage: canOps(session, "maintenance", "update"),
  };
}

async function technicianOptions(db: TenantDb) {
  // من يملك دور مسؤول المرافق، أو موظفو الخدمات المرتبطون بحساب
  const roles = await db.userRole.findMany({ where: { role: { key: { in: ["FACILITIES"] } } }, select: { userId: true } });
  const emps = await db.employee.findMany({ where: { deletedAt: null, status: "ACTIVE", category: "SERVICES", userId: { not: null } }, select: { userId: true } });
  const ids = [...new Set([...roles.map((r) => r.userId), ...emps.map((e) => e.userId!)])];
  return db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export interface RequestInput {
  title: string;
  description?: string | null;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  branchId?: string | null;
  roomId?: string | null;
  location?: string | null;
  assetId?: string | null;
  busId?: string | null;
  beforePhotos?: Array<{ url: string; name?: string }>;
}

/** بلاغ صيانة: أي موظف يستطيع الإبلاغ؛ الفريق يُشعَر بالعاجل */
export async function createRequest(db: TenantDb, session: SessionData, input: RequestInput) {
  // أي موظف له «إنشاء» على الصيانة (ولو بنطاق سجلاته) يبلّغ
  if (!resolveScope(session.access, "maintenance", "create")) throw forbidden("الإبلاغ عن الصيانة لموظفي المدرسة");
  if (input.title.trim().length < 3) throw badRequest("اكتب عنوان البلاغ");
  const room = input.roomId ? await db.room.findFirst({ where: { id: input.roomId } }) : null;
  const r = await db.maintenanceRequest.create({
    data: { tenantId: session.tenant.id, number: await nextNo(db, session, "maintenance"), title: input.title.trim(), description: input.description || null, category: input.category, priority: input.priority, branchId: input.branchId ?? room?.branchId ?? null, roomId: input.roomId || null, location: input.location || null, assetId: input.assetId || null, busId: input.busId || null, reportedById: session.user.id, beforePhotos: (input.beforePhotos ?? []) as never, position: -Date.now() / 1000 },
  });
  if (input.priority === "URGENT" || input.priority === "HIGH") {
    const team = await technicianOptions(db);
    await notify(db, { tenantId: session.tenant.id, userIds: team.map((t) => t.id), type: "SYSTEM", title: `بلاغ صيانة ${input.priority === "URGENT" ? "عاجل" : "مهم"}: ${r.title}`, body: r.location ?? room?.name ?? null, link: `/maintenance/${r.id}`, actorId: session.user.id, entityType: "MaintenanceRequest", entityId: r.id });
  }
  return r;
}

export async function getRequest(db: TenantDb, session: SessionData, id: string) {
  const r = await db.maintenanceRequest.findFirst({ where: { id, deletedAt: null, ...(await visibleWhere(session)) } });
  if (!r) throw notFound("البلاغ غير موجود");
  const [users, room, branch, asset, bus, moves, banks, technicians, warehouses] = await Promise.all([
    db.user.findMany({ where: { id: { in: [r.reportedById, r.assigneeId].filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
    r.roomId ? db.room.findFirst({ where: { id: r.roomId }, select: { name: true } }) : null,
    r.branchId ? db.branch.findFirst({ where: { id: r.branchId }, select: { name: true } }) : null,
    r.assetId ? db.fixedAsset.findFirst({ where: { id: r.assetId }, select: { id: true, name: true, tag: true } }) : null,
    r.busId ? db.bus.findFirst({ where: { id: r.busId }, select: { id: true, code: true, plateNumber: true } }) : null,
    db.stockMovement.findMany({ where: { sourceType: "MaintenanceRequest", sourceId: r.id }, orderBy: { createdAt: "asc" } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    technicianOptions(db),
    db.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const items = await db.inventoryItem.findMany({ where: { id: { in: moves.map((m) => m.itemId) } }, select: { id: true, name: true, unit: true } });
  const manage = canOps(session, "maintenance", "update");
  return {
    request: { ...r, reporter: users.find((u) => u.id === r.reportedById)?.name ?? null, assignee: users.find((u) => u.id === r.assigneeId)?.name ?? null, room: room?.name ?? null, branch: branch?.name ?? null, asset, bus },
    parts: moves.map((m) => ({ id: m.id, item: items.find((i) => i.id === m.itemId)?.name ?? "", unit: items.find((i) => i.id === m.itemId)?.unit ?? "", quantity: -m.quantity, valueMinor: -m.valueMinor, date: m.date })),
    options: { banks, technicians, warehouses },
    canManage: manage,
    canWork: manage || r.assigneeId === session.user.id,
  };
}

/** تحديث البلاغ: الإسناد والأولوية والحالة (سحب في اللوحة) والصور والحل */
export async function updateRequest(db: TenantDb, session: SessionData, id: string, input: Partial<RequestInput> & { status?: MaintStatus; assigneeId?: string | null; dueDate?: string | null; resolution?: string | null; afterPhotos?: Array<{ url: string; name?: string }>; position?: number; vendorName?: string | null }) {
  const r = await db.maintenanceRequest.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("البلاغ غير موجود");
  const manage = canOps(session, "maintenance", "update");
  if (!manage && r.assigneeId !== session.user.id) throw forbidden("تحديث البلاغ لفريق الصيانة أو الفني المسند إليه");
  if (r.status === "DONE" && input.status && input.status !== "DONE") throw badRequest("البلاغ مكتمل ومرحّلة تكلفته");
  if (input.status === "DONE") throw badRequest("أكمل البلاغ من زر «إكمال» لتسجيل الحل والتكلفة");
  if (!manage && (input.assigneeId !== undefined || input.priority)) throw forbidden("الإسناد والأولوية لمسؤول الصيانة");
  const data = {
    ...(input.title ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.status ? { status: input.status, ...(input.status === "IN_PROGRESS" && !r.startedAt ? { startedAt: new Date() } : {}) } : {}),
    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? dateOnly(input.dueDate) : null } : {}),
    ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
    ...(input.afterPhotos ? { afterPhotos: input.afterPhotos as never } : {}),
    ...(input.beforePhotos ? { beforePhotos: input.beforePhotos as never } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
  };
  const updated = await db.maintenanceRequest.update({ where: { id }, data });
  if (input.assigneeId && input.assigneeId !== r.assigneeId) await notify(db, { tenantId: session.tenant.id, userIds: [input.assigneeId], type: "ASSIGNMENT", title: `أُسند إليك بلاغ صيانة: ${r.title}`, link: `/maintenance/${r.id}`, actorId: session.user.id, entityType: "MaintenanceRequest", entityId: r.id });
  return updated;
}

/** صرف قطع غيار من المخزون على البلاغ (قيد: مصروف صيانة ← المخزون) */
export async function issueParts(db: TenantDb, session: SessionData, id: string, input: { warehouseId: string; lines: Array<{ itemId: string; quantity: number }> }) {
  const r = await db.maintenanceRequest.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("البلاغ غير موجود");
  if (!canOps(session, "maintenance", "update")) throw forbidden();
  if (["DONE", "CANCELLED"].includes(r.status)) throw badRequest("البلاغ مغلق");
  await ensureOpsAccounts(db, session.tenant.id);
  const expense = (await db.account.findFirstOrThrow({ where: { systemKey: "MAINTENANCE_EXPENSE", deletedAt: null } })).id;
  // الصرف لقطع الصيانة يُسمح به لفريق الصيانة حتى دون صلاحية المخزون الكاملة
  const res = await issueStockCore(db, session, { warehouseId: input.warehouseId, date: todayOf(session), branchId: r.branchId, purpose: `قطع غيار لبلاغ صيانة ${r.number}: ${r.title}`, lines: input.lines, sourceType: "MaintenanceRequest", sourceId: r.id, expenseAccountId: expense });
  await db.maintenanceRequest.update({ where: { id }, data: { partsCostMinor: { increment: res.totalCostMinor } } });
  return res;
}

/**
 * إكمال البلاغ: الحل وصور بعد، والتكلفة الخارجية (فني أو مقاول) بقيد مصروف صيانة بمركز تكلفة الفرع.
 * الرقابة على الموازنة تُطبق (تنبيه أو منع حسب الإعدادات).
 */
export async function completeRequest(db: TenantDb, session: SessionData, id: string, input: { resolution: string; afterPhotos?: Array<{ url: string; name?: string }>; externalCostMinor: number; paidFrom?: "CASH" | "BANK" | "AP" | null; bankAccountId?: string | null; vendorName?: string | null }) {
  const r = await db.maintenanceRequest.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("البلاغ غير موجود");
  if (!canOps(session, "maintenance", "update") && r.assigneeId !== session.user.id) throw forbidden();
  if (["DONE", "CANCELLED"].includes(r.status)) throw badRequest("البلاغ مغلق");
  if (input.resolution.trim().length < 3) throw badRequest("اكتب ما تم إنجازه");
  if (input.externalCostMinor < 0) throw badRequest("تكلفة غير صالحة");
  if (input.externalCostMinor > 0 && !canOps(session, "maintenance", "approve")) throw forbidden("ترحيل التكلفة الخارجية لمسؤول الصيانة");
  if (input.externalCostMinor > 0 && !input.paidFrom) throw badRequest("حدد طريقة سداد التكلفة");
  await ensureOpsAccounts(db, session.tenant.id);
  const cc = await branchCostCenter(db, session.tenant.id, r.branchId);
  const expense = (await db.account.findFirstOrThrow({ where: { systemKey: r.busId ? "TRANSPORT_EXPENSE" : "MAINTENANCE_EXPENSE", deletedAt: null } })).id;
  let warning: string | null = null;
  if (input.externalCostMinor > 0) warning = (await checkBudget(db, session, { accountId: expense, costCenterId: cc, date: dateOnly(todayOf(session)), amountMinor: input.externalCostMinor }))?.message ?? null;
  const updated = await db.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as Tx;
    let entryId: string | null = null;
    if (input.externalCostMinor > 0) {
      let credit = input.paidFrom === "CASH" ? "key:CASH" : "key:AP";
      if (input.paidFrom === "BANK") {
        const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId } }) : null;
        if (!bank) throw badRequest("اختر الحساب البنكي");
        credit = bank.accountId;
      }
      entryId = (await postEntry(tx, session, { date: todayOf(session), description: `تكلفة صيانة — بلاغ ${r.number}: ${r.title}${input.vendorName ? ` (${input.vendorName})` : ""}`, source: "OPERATING_EXPENSE", sourceType: "MaintenanceRequest", sourceId: r.id, reference: `صيانة ${r.number}`, lines: [{ account: expense, debit: input.externalCostMinor, costCenterId: cc }, { account: credit, credit: input.externalCostMinor, description: input.vendorName ?? null }] })).id;
    }
    return tx.maintenanceRequest.update({ where: { id }, data: { status: "DONE", completedAt: new Date(), resolution: input.resolution.trim(), afterPhotos: (input.afterPhotos ?? r.afterPhotos) as never, externalCostMinor: input.externalCostMinor, vendorName: input.vendorName ?? r.vendorName, journalEntryId: entryId } });
  });
  if (r.reportedById && r.reportedById !== session.user.id) await notify(db, { tenantId: session.tenant.id, userIds: [r.reportedById], type: "SYSTEM", title: `اكتمل بلاغ الصيانة: ${r.title}`, body: input.resolution, link: `/maintenance/${r.id}`, actorId: session.user.id, entityType: "MaintenanceRequest", entityId: r.id });
  return { request: updated, warning, costMinor: updated.partsCostMinor + updated.externalCostMinor, costText: money(session, updated.partsCostMinor + updated.externalCostMinor) };
}

// ---------------------------------------------------------------------
// الصيانة الوقائية
// ---------------------------------------------------------------------

export async function listSchedules(db: TenantDb, session: SessionData) {
  requireOps(session, "maintenance", "view");
  const [rows, rooms, users] = await Promise.all([db.maintenanceSchedule.findMany({ orderBy: { nextDue: "asc" } }), db.room.findMany({ select: { id: true, name: true } }), db.user.findMany({ select: { id: true, name: true } })]);
  return rows.map((s) => ({ ...s, room: rooms.find((r) => r.id === s.roomId)?.name ?? null, assignee: users.find((u) => u.id === s.assigneeId)?.name ?? null, due: isoOf(s.nextDue)! <= todayOf(session) }));
}

export async function saveSchedule(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; description?: string | null; category: string; branchId?: string | null; roomId?: string | null; assetId?: string | null; busId?: string | null; assigneeId?: string | null; frequencyDays: number; nextDue: string; isActive: boolean }) {
  requireOps(session, "maintenance", "update");
  if (input.frequencyDays < 1 || input.frequencyDays > 730) throw badRequest("التكرار بين يوم وسنتين");
  const data = { title: input.title.trim(), description: input.description || null, category: input.category, branchId: input.branchId || null, roomId: input.roomId || null, assetId: input.assetId || null, busId: input.busId || null, assigneeId: input.assigneeId || null, frequencyDays: input.frequencyDays, nextDue: dateOnly(input.nextDue), isActive: input.isActive };
  return input.id ? db.maintenanceSchedule.update({ where: { id: input.id }, data }) : db.maintenanceSchedule.create({ data: { tenantId: session.tenant.id, ...data } });
}

/** توليد طلبات الصيانة الوقائية المستحقة (مهمة مجدولة يومية أو يدوياً) */
export async function runSchedules(db: TenantDb, session: SessionData) {
  const today = todayOf(session);
  const due = await db.maintenanceSchedule.findMany({ where: { isActive: true, nextDue: { lte: dateOnly(today) } } });
  let created = 0;
  for (const s of due) {
    // لا تكرار إن بقي طلب سابق من الجدول مفتوحاً
    const open = await db.maintenanceRequest.findFirst({ where: { scheduleId: s.id, status: { in: ["NEW", "IN_PROGRESS", "WAITING_PARTS"] }, deletedAt: null } });
    if (!open) {
      const r = await db.maintenanceRequest.create({ data: { tenantId: s.tenantId, number: await nextNo(db, session, "maintenance"), title: `صيانة دورية: ${s.title}`, description: s.description, category: s.category, priority: "MEDIUM", branchId: s.branchId, roomId: s.roomId, assetId: s.assetId, busId: s.busId, assigneeId: s.assigneeId, dueDate: new Date(dateOnly(today).getTime() + 7 * 86_400_000), scheduleId: s.id, position: -Date.now() / 1000 } });
      created++;
      if (s.assigneeId) await notify(db, { tenantId: s.tenantId, userIds: [s.assigneeId], type: "ASSIGNMENT", title: `صيانة دورية مستحقة: ${s.title}`, link: `/maintenance/${r.id}`, entityType: "MaintenanceRequest", entityId: r.id });
    }
    let next = s.nextDue.getTime();
    while (next <= dateOnly(today).getTime()) next += s.frequencyDays * 86_400_000;
    await db.maintenanceSchedule.update({ where: { id: s.id }, data: { nextDue: new Date(next), lastRunAt: new Date() } });
  }
  return { created };
}

// ---------------------------------------------------------------------
// حجز المرافق
// ---------------------------------------------------------------------

/** الأسبوع لقاعات قابلة للحجز: الحجوزات + الحصص المجدولة في القاعة */
export async function bookings(db: TenantDb, session: SessionData, input: { weekStart: string; roomId?: string | null }) {
  if (!resolveScope(session.access, "maintenance", "view")) throw forbidden();
  const rooms = await db.room.findMany({ where: { deletedAt: null, isActive: true, ...(input.roomId ? { id: input.roomId } : {}) }, orderBy: [{ branchId: "asc" }, { code: "asc" }] });
  const start = dateOnly(input.weekStart);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const [rows, users] = await Promise.all([db.roomBooking.findMany({ where: { status: "CONFIRMED", date: { gte: start, lt: end }, roomId: { in: rooms.map((r) => r.id) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }), db.user.findMany({ select: { id: true, name: true } })]);
  const lessons = input.roomId ? await roomLessons(db, input.roomId, start) : [];
  return {
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind, capacity: r.capacity, branchId: r.branchId })),
    bookings: rows.map((b) => ({ ...b, bookedBy: users.find((u) => u.id === b.bookedById)?.name ?? null, mine: b.bookedById === session.user.id })),
    lessons,
    canManage: canOps(session, "maintenance", "update"),
  };
}

/** حصص القاعة في الأسبوع من جدول العام الحالي (لتجنب التعارض) */
async function roomLessons(db: TenantDb, roomId: string, weekStart: Date) {
  const room = await db.room.findFirst({ where: { id: roomId } });
  if (!room) return [];
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return [];
  const [slots, bell] = await Promise.all([db.timetableSlot.findMany({ where: { academicYearId: year.id, roomId } }), db.bellSchedule.findFirst({ where: { branchId: room.branchId } })]);
  const periods = ((bell?.periods ?? []) as Array<{ index: number; start: string; end: string }>) ?? [];
  const out: Array<{ date: string; startTime: string; endTime: string; title: string }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86_400_000);
    for (const s of slots.filter((x) => x.day === d.getUTCDay())) {
      const p = periods.find((x) => x.index === s.period);
      if (p) out.push({ date: isoOf(d)!, startTime: p.start, endTime: p.end, title: `حصة ${s.period}` });
    }
  }
  return out;
}

export async function createBooking(db: TenantDb, session: SessionData, input: { roomId: string; title: string; date: string; startTime: string; endTime: string; notes?: string | null }) {
  // الحجز لأي موظف (نطاق سجلاتي على الصيانة) أو فريق المرافق
  if (!resolveScope(session.access, "maintenance", "create")) throw forbidden("حجز المرافق لموظفي المدرسة");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.startTime >= input.endTime) throw badRequest("وقت البداية قبل النهاية");
  if (input.date < todayOf(session)) throw badRequest("لا حجز في تاريخ مضى");
  const room = await db.room.findFirst({ where: { id: input.roomId, deletedAt: null, isActive: true } });
  if (!room) throw notFound("القاعة غير موجودة");
  const same = await db.roomBooking.findMany({ where: { roomId: room.id, date: dateOnly(input.date), status: "CONFIRMED" } });
  const clash = same.find((b) => timesOverlap(b.startTime, b.endTime, input.startTime, input.endTime));
  if (clash) throw badRequest(`القاعة محجوزة ${clash.startTime}–${clash.endTime} (${clash.title})`);
  const d = dateOnly(input.date);
  const weekStart = new Date(d.getTime() - d.getUTCDay() * 86_400_000);
  const lesson = (await roomLessons(db, room.id, weekStart)).find((l) => l.date === input.date && timesOverlap(l.startTime, l.endTime, input.startTime, input.endTime));
  if (lesson) throw badRequest(`تتعارض مع ${lesson.title} في جدول الحصص (${lesson.startTime}–${lesson.endTime})`);
  return db.roomBooking.create({ data: { tenantId: session.tenant.id, roomId: room.id, title: input.title.trim(), date: d, startTime: input.startTime, endTime: input.endTime, notes: input.notes ?? null, bookedById: session.user.id } });
}

export async function cancelBooking(db: TenantDb, session: SessionData, id: string) {
  const b = await db.roomBooking.findFirst({ where: { id } });
  if (!b) throw notFound("الحجز غير موجود");
  if (b.bookedById !== session.user.id && !canOps(session, "maintenance", "update")) throw forbidden("يلغي الحجز صاحبه أو مسؤول المرافق");
  return db.roomBooking.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function maintenanceStats(db: TenantDb, session: SessionData) {
  requireOps(session, "maintenance", "view");
  const rows = await db.maintenanceRequest.findMany({ where: { deletedAt: null, ...(await visibleWhere(session)) }, select: { status: true, priority: true, category: true, createdAt: true, completedAt: true, partsCostMinor: true, externalCostMinor: true } });
  const done = rows.filter((r) => r.status === "DONE" && r.completedAt);
  const avgHours = done.length ? Math.round(done.reduce((s, r) => s + (r.completedAt!.getTime() - r.createdAt.getTime()), 0) / done.length / 3_600_000) : null;
  const byCategory: Record<string, number> = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  return { open: rows.filter((r) => !["DONE", "CANCELLED"].includes(r.status)).length, urgent: rows.filter((r) => r.priority === "URGENT" && !["DONE", "CANCELLED"].includes(r.status)).length, done: done.length, avgHours, costMinor: rows.reduce((s, r) => s + r.partsCostMinor + r.externalCostMinor, 0), byCategory };
}
