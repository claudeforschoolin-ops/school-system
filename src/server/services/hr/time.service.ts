/**
 * دوام الموظفين وإجازاتهم: الورديات، الحضور اليومي (يدوي، أو تسجيل ذاتي، أو استيراد من جهاز البصمة CSV)
 * مع احتساب التأخر والإضافي، وأنواع الإجازات وأرصدتها السنوية، وطلبات الإجازة بموافقة المدير المباشر
 * ثم الموارد البشرية، وانعكاسها على الحضور وعلى الراتب (الإجازة غير المدفوعة).
 */
import type { Prisma, StaffAttendanceStatus } from "@/generated/prisma/client";
import { lateMinutes, serviceDays, workingDays } from "@/lib/hr/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { notify } from "@/server/services/notifications.service";
import { nextNumber } from "@/server/services/sequence.service";
import { readModuleSettings } from "@/server/services/module-settings.service";
import { dateOnly, hrBranchWhere, hrSettings, isHrStaff, isoOf, myEmployee, requireHr, requireMyEmployee, today } from "./common";

const DEFAULT_WORK_DAYS = [0, 1, 2, 3, 4];

export const STAFF_STATUS: Record<StaffAttendanceStatus, string> = { PRESENT: "حاضر", LATE: "متأخر", ABSENT: "غائب", ON_LEAVE: "في إجازة", HOLIDAY: "عطلة", EXCUSED: "غياب بعذر" };

// ---------------------------------------------------------------------
// الورديات
// ---------------------------------------------------------------------

export async function listShifts(db: TenantDb) {
  const [shifts, counts] = await Promise.all([db.workShift.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] }), db.employee.groupBy({ by: ["shiftId"], where: { deletedAt: null, status: { not: "TERMINATED" } }, _count: { _all: true } })]);
  const unassigned = counts.find((c) => c.shiftId === null)?._count._all ?? 0;
  return shifts.map((s) => ({ ...s, employees: (counts.find((c) => c.shiftId === s.id)?._count._all ?? 0) + (s.isDefault ? unassigned : 0) }));
}

export async function saveShift(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; startTime: string; endTime: string; graceMinutes: number; workDays: number[]; isDefault: boolean }) {
  requireHr(session, "hr_attendance", "update");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.endTime <= input.startTime) throw badRequest("أوقات الدوام غير صحيحة");
  if (!input.workDays.length) throw badRequest("اختر أيام الدوام");
  const data = { name: input.name.trim(), startTime: input.startTime, endTime: input.endTime, graceMinutes: input.graceMinutes, workDays: [...new Set(input.workDays)].sort(), isDefault: input.isDefault };
  const saved = input.id ? await db.workShift.update({ where: { id: input.id }, data }) : await db.workShift.create({ data: { tenantId: session.tenant.id, ...data } });
  if (input.isDefault) await db.workShift.updateMany({ where: { id: { not: saved.id } }, data: { isDefault: false } });
  return saved;
}

async function shiftOf(db: TenantDb, shiftId: string | null) {
  return (shiftId ? await db.workShift.findFirst({ where: { id: shiftId } }) : null) ?? (await db.workShift.findFirst({ where: { isDefault: true } }));
}

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** وقت محلي HH:MM لتاريخ حسب منطقة المدرسة */
function localHHMM(d: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(d);
}
/** تحويل «تاريخ + وقت محلي» إلى لحظة (يعالج أي منطقة زمنية بفارقها في ذلك اليوم) */
function atLocal(dateIso: string, hhmm: string, timezone: string) {
  const guess = new Date(`${dateIso}T${hhmm}:00Z`);
  const shown = localHHMM(guess, timezone);
  const offset = minutesOf(shown) - minutesOf(hhmm);
  return new Date(guess.getTime() - offset * 60_000);
}

function computeTimes(shift: { startTime: string; endTime: string; graceMinutes: number } | null, inHHMM: string | null, outHHMM: string | null, overtimeMin = 30) {
  if (!shift) return { late: 0, early: 0, overtime: 0 };
  const late = inHHMM ? lateMinutes(inHHMM, shift.startTime, shift.graceMinutes) : 0;
  const early = outHHMM && minutesOf(outHHMM) < minutesOf(shift.endTime) ? minutesOf(shift.endTime) - minutesOf(outHHMM) : 0;
  // الإضافي يُسجَّل بعد مدة من نهاية الدوام (إعدادات الرواتب، الافتراضي ٣٠ دقيقة)، ويحتاج اعتماد الموارد البشرية في المسير
  const after = outHHMM ? minutesOf(outHHMM) - minutesOf(shift.endTime) : 0;
  return { late, early, overtime: after >= overtimeMin ? after : 0 };
}

// ---------------------------------------------------------------------
// الحضور اليومي
// ---------------------------------------------------------------------

export async function daySheet(db: TenantDb, session: SessionData, input: { date: string; departmentId?: string | null }) {
  requireHr(session, "hr_attendance", "view");
  const date = dateOnly(input.date);
  const [employees, records, shifts, leaves] = await Promise.all([
    db.employee.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, hireDate: { lte: date }, ...hrBranchWhere(session, "hr_attendance", "view"), ...(input.departmentId ? { departmentId: input.departmentId } : {}) }, select: { id: true, number: true, fullName: true, shiftId: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.employeeAttendance.findMany({ where: { date } }),
    db.workShift.findMany(),
    db.staffLeaveRequest.findMany({ where: { status: "APPROVED", startDate: { lte: date }, endDate: { gte: date }, deletedAt: null }, select: { employeeId: true, leaveTypeId: true } }),
  ]);
  const def = shifts.find((s) => s.isDefault) ?? null;
  const weekday = date.getUTCDay();
  const rows = employees.map((e) => {
    const shift = shifts.find((s) => s.id === e.shiftId) ?? def;
    const r = records.find((x) => x.employeeId === e.id);
    return {
      employee: { id: e.id, number: e.number, fullName: e.fullName, department: e.department?.name ?? null },
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
      workday: (shift?.workDays ?? DEFAULT_WORK_DAYS).includes(weekday),
      onLeave: leaves.some((l) => l.employeeId === e.id),
      record: r ? { status: r.status, checkIn: r.checkIn ? localHHMM(r.checkIn, session.tenant.timezone) : null, checkOut: r.checkOut ? localHHMM(r.checkOut, session.tenant.timezone) : null, lateMinutes: r.lateMinutes, overtimeMinutes: r.overtimeMinutes, earlyLeaveMinutes: r.earlyLeaveMinutes, source: r.source, note: r.note } : null,
    };
  });
  const count = (s: StaffAttendanceStatus) => rows.filter((r) => r.record?.status === s).length;
  return { date: input.date, rows, summary: { total: rows.filter((r) => r.workday).length, present: count("PRESENT"), late: count("LATE"), absent: count("ABSENT"), leave: count("ON_LEAVE") + rows.filter((r) => r.onLeave && !r.record).length, unrecorded: rows.filter((r) => r.workday && !r.record && !r.onLeave).length } };
}

export async function setAttendance(db: TenantDb, session: SessionData, input: { employeeId: string; date: string; status: StaffAttendanceStatus; checkIn?: string | null; checkOut?: string | null; note?: string | null }) {
  requireHr(session, "hr_attendance", "update");
  const e = await db.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!e) throw notFound("الموظف غير موجود");
  if (input.date > today(session)) throw badRequest("لا يُسجَّل حضور لتاريخ مستقبلي");
  const shift = await shiftOf(db, e.shiftId);
  const present = input.status === "PRESENT" || input.status === "LATE";
  const t = present ? computeTimes(shift, input.checkIn ?? null, input.checkOut ?? null, hrSettings(session).overtimeMinMinutes) : { late: 0, early: 0, overtime: 0 };
  const status: StaffAttendanceStatus = present ? (t.late ? "LATE" : "PRESENT") : input.status;
  const data = { status, checkIn: present && input.checkIn ? atLocal(input.date, input.checkIn, session.tenant.timezone) : null, checkOut: present && input.checkOut ? atLocal(input.date, input.checkOut, session.tenant.timezone) : null, lateMinutes: t.late, earlyLeaveMinutes: t.early, overtimeMinutes: t.overtime, source: "MANUAL", note: input.note ?? null, updatedById: session.user.id };
  return db.employeeAttendance.upsert({ where: { employeeId_date: { employeeId: e.id, date: dateOnly(input.date) } }, create: { tenantId: session.tenant.id, employeeId: e.id, date: dateOnly(input.date), ...data }, update: data });
}

/** تحضير جماعي: وضع «حاضر» لمن لم يُسجَّل في يوم عمل */
export async function markAllPresent(db: TenantDb, session: SessionData, input: { date: string }) {
  const sheet = await daySheet(db, session, input);
  let n = 0;
  for (const r of sheet.rows.filter((x) => x.workday && !x.record && !x.onLeave)) {
    await setAttendance(db, session, { employeeId: r.employee.id, date: input.date, status: "PRESENT", checkIn: r.shift?.startTime ?? null, checkOut: r.shift?.endTime ?? null });
    n += 1;
  }
  return { marked: n };
}

/** تسجيل الحضور/الانصراف الذاتي (من حساب الموظف) */
export async function selfCheck(db: TenantDb, session: SessionData, kind: "IN" | "OUT") {
  const e = await requireMyEmployee(db, session);
  const now = new Date();
  const date = today(session);
  const hhmm = localHHMM(now, session.tenant.timezone);
  const shift = await shiftOf(db, e.shiftId);
  const current = await db.employeeAttendance.findFirst({ where: { employeeId: e.id, date: dateOnly(date) } });
  if (kind === "IN") {
    if (current?.checkIn) throw badRequest("سُجّل حضورك اليوم مسبقاً");
    const t = computeTimes(shift, hhmm, null);
    const data = { status: (t.late ? "LATE" : "PRESENT") as StaffAttendanceStatus, checkIn: now, lateMinutes: t.late, source: "SELF", updatedById: session.user.id };
    return db.employeeAttendance.upsert({ where: { employeeId_date: { employeeId: e.id, date: dateOnly(date) } }, create: { tenantId: session.tenant.id, employeeId: e.id, date: dateOnly(date), ...data }, update: data });
  }
  if (!current?.checkIn) throw badRequest("سجّل الحضور أولاً");
  const t = computeTimes(shift, localHHMM(current.checkIn, session.tenant.timezone), hhmm, hrSettings(session).overtimeMinMinutes);
  return db.employeeAttendance.update({ where: { id: current.id }, data: { checkOut: now, earlyLeaveMinutes: t.early, overtimeMinutes: t.overtime, updatedById: session.user.id } });
}

/** استيراد حركات جهاز البصمة: رقم الموظف، التاريخ، الحضور، الانصراف */
export async function importAttendance(db: TenantDb, session: SessionData, rows: Array<{ number: number; date: string; checkIn: string | null; checkOut: string | null }>) {
  requireHr(session, "hr_attendance", "update");
  const employees = await db.employee.findMany({ where: { number: { in: rows.map((r) => r.number) }, deletedAt: null } });
  const errors: string[] = [];
  let imported = 0;
  for (const [i, r] of rows.entries()) {
    const e = employees.find((x) => x.number === r.number);
    if (!e) {
      errors.push(`سطر ${i + 1}: لا موظف بالرقم ${r.number}`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > today(session)) {
      errors.push(`سطر ${i + 1}: تاريخ غير صالح`);
      continue;
    }
    const shift = await shiftOf(db, e.shiftId);
    const t = computeTimes(shift, r.checkIn, r.checkOut, hrSettings(session).overtimeMinMinutes);
    const status: StaffAttendanceStatus = r.checkIn ? (t.late ? "LATE" : "PRESENT") : "ABSENT";
    const data = { status, checkIn: r.checkIn ? atLocal(r.date, r.checkIn, session.tenant.timezone) : null, checkOut: r.checkOut ? atLocal(r.date, r.checkOut, session.tenant.timezone) : null, lateMinutes: t.late, earlyLeaveMinutes: t.early, overtimeMinutes: t.overtime, source: "DEVICE", updatedById: session.user.id };
    const existing = await db.employeeAttendance.findFirst({ where: { employeeId: e.id, date: dateOnly(r.date) } });
    if (existing?.source === "LEAVE") {
      errors.push(`سطر ${i + 1}: ${e.fullName} في إجازة معتمدة`);
      continue;
    }
    await db.employeeAttendance.upsert({ where: { employeeId_date: { employeeId: e.id, date: dateOnly(r.date) } }, create: { tenantId: session.tenant.id, employeeId: e.id, date: dateOnly(r.date), ...data }, update: data });
    imported += 1;
  }
  return { imported, errors };
}

/** ملخص شهر لكل موظف (يغذي المسير): الغياب والتأخر والإضافي والإجازات غير المدفوعة */
export async function monthSummary(db: TenantDb, month: string, employeeIds?: string[]) {
  const start = dateOnly(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [records, leaves, types] = await Promise.all([
    db.employeeAttendance.findMany({ where: { date: { gte: start, lte: end }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) } }),
    db.staffLeaveRequest.findMany({ where: { status: "APPROVED", deletedAt: null, startDate: { lte: end }, endDate: { gte: start }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) } }),
    db.leaveType.findMany(),
  ]);
  const employees = await db.employee.findMany({ where: { id: { in: [...new Set([...records.map((r) => r.employeeId), ...leaves.map((l) => l.employeeId), ...(employeeIds ?? [])])] } }, select: { id: true, shiftId: true } });
  const shifts = await db.workShift.findMany();
  const def = shifts.find((s) => s.isDefault);
  const out = new Map<string, { absentDays: number; lateMinutes: number; overtimeMinutes: number; unpaidLeaveDays: number; leaveDays: number; presentDays: number }>();
  for (const e of employees) {
    const rs = records.filter((r) => r.employeeId === e.id);
    const wd = (shifts.find((s) => s.id === e.shiftId) ?? def)?.workDays ?? DEFAULT_WORK_DAYS;
    let unpaid = 0;
    let leaveDays = 0;
    for (const l of leaves.filter((x) => x.employeeId === e.id)) {
      const from = isoOf(l.startDate! < start ? start : l.startDate)!;
      const to = isoOf(l.endDate > end ? end : l.endDate)!;
      const days = workingDays(from, to, wd).length;
      leaveDays += days;
      if (types.find((t) => t.id === l.leaveTypeId)?.paid === false) unpaid += days;
    }
    out.set(e.id, { absentDays: rs.filter((r) => r.status === "ABSENT").length, lateMinutes: rs.reduce((s, r) => s + r.lateMinutes, 0), overtimeMinutes: rs.reduce((s, r) => s + r.overtimeMinutes, 0), unpaidLeaveDays: unpaid, leaveDays, presentDays: rs.filter((r) => r.status === "PRESENT" || r.status === "LATE").length });
  }
  return out;
}

export async function monthGrid(db: TenantDb, session: SessionData, input: { month: string }) {
  requireHr(session, "hr_attendance", "view");
  const start = dateOnly(`${input.month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [employees, records] = await Promise.all([
    db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" }, ...hrBranchWhere(session, "hr_attendance", "view") }, select: { id: true, number: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.employeeAttendance.findMany({ where: { date: { gte: start, lte: end } }, select: { employeeId: true, date: true, status: true, lateMinutes: true } }),
  ]);
  const summary = await monthSummary(db, input.month, employees.map((e) => e.id));
  return {
    days: end.getUTCDate(),
    rows: employees.map((e) => ({ employee: e, cells: Object.fromEntries(records.filter((r) => r.employeeId === e.id).map((r) => [r.date.getUTCDate(), r.status])), summary: summary.get(e.id) ?? { absentDays: 0, lateMinutes: 0, overtimeMinutes: 0, unpaidLeaveDays: 0, leaveDays: 0, presentDays: 0 } })),
  };
}

// ---------------------------------------------------------------------
// أنواع الإجازات والأرصدة
// ---------------------------------------------------------------------

export const DEFAULT_LEAVE_TYPES = [
  { code: "ANNUAL", name: "إجازة سنوية", paid: true, annualDays: 21, color: "teal", carryOverDays: 10 },
  { code: "SICK", name: "إجازة مرضية", paid: true, annualDays: 30, color: "orange", requiresAttachment: true },
  { code: "EMERGENCY", name: "إجازة اضطرارية", paid: true, annualDays: 5, color: "gold" },
  { code: "MARRIAGE", name: "إجازة زواج", paid: true, annualDays: 5, color: "purple", maxPerRequest: 5 },
  { code: "BEREAVEMENT", name: "إجازة وفاة", paid: true, annualDays: 5, color: "slate", maxPerRequest: 5 },
  { code: "MATERNITY", name: "إجازة وضع", paid: true, annualDays: 84, color: "navy", gender: "FEMALE", requiresAttachment: true },
  { code: "HAJJ", name: "إجازة حج", paid: true, annualDays: 15, color: "green", maxPerRequest: 15 },
  { code: "UNPAID", name: "إجازة بدون راتب", paid: false, annualDays: null, color: "red" },
] as const;

export async function ensureLeaveTypes(db: TenantDb, tenantId: string) {
  if (await db.leaveType.count()) return;
  for (const t of DEFAULT_LEAVE_TYPES) await db.leaveType.create({ data: { tenantId, ...t, annualDays: t.annualDays } });
}

export async function listLeaveTypes(db: TenantDb, session: SessionData) {
  await ensureLeaveTypes(db, session.tenant.id);
  return db.leaveType.findMany({ orderBy: { createdAt: "asc" } });
}

export async function saveLeaveType(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; name: string; paid: boolean; annualDays: number | null; requiresAttachment: boolean; maxPerRequest: number | null; carryOverDays: number; gender: string | null; color: string; isActive: boolean }) {
  requireHr(session, "hr_attendance", "update");
  const data = { ...input, id: undefined, code: input.code.trim().toUpperCase(), name: input.name.trim() };
  return input.id ? db.leaveType.update({ where: { id: input.id }, data }) : db.leaveType.create({ data: { tenantId: session.tenant.id, ...data } });
}

async function seniorLeaveRule(db: TenantDb, tenantId: string) {
  const t = await db.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
  const hs = readModuleSettings(t?.settings, "hr");
  return { days: hs.seniorLeaveDays, afterYears: hs.seniorLeaveAfterYears };
}

/** الاستحقاق السنوي: الإجازة السنوية من نوعها أو العقد، وتزيد بالأقدمية حسب إعدادات الرواتب (الافتراضي ٣٠ يوماً بعد خمس سنوات)، والباقي من نوع الإجازة */
async function ensureBalance(db: TenantDb, tenantId: string, employee: { id: string; hireDate: Date }, type: { id: string; code: string; annualDays: number | null; carryOverDays: number }, year: number, seniorRule?: { days: number; afterYears: number }) {
  const found = await db.leaveBalance.findFirst({ where: { employeeId: employee.id, leaveTypeId: type.id, year } });
  if (found) return found;
  let entitled = type.annualDays ?? 0;
  let carried = 0;
  if (type.code === "ANNUAL") {
    const contract = await db.employmentContract.findFirst({ where: { employeeId: employee.id, status: "ACTIVE" } });
    const years = serviceDays(isoOf(employee.hireDate)!, `${year}-01-01`) / 365;
    const base = type.annualDays ?? 0;
    const senior = seniorRule ?? (await seniorLeaveRule(db, tenantId));
    entitled = Math.max(contract?.annualLeaveDays ?? base, senior.days > 0 && senior.afterYears > 0 && years >= senior.afterYears ? senior.days : base);
    const prev = await db.leaveBalance.findFirst({ where: { employeeId: employee.id, leaveTypeId: type.id, year: year - 1 } });
    if (prev) carried = Math.min(type.carryOverDays, Math.max(0, prev.entitledDays + prev.carriedDays + prev.adjustedDays - prev.usedDays));
  }
  return db.leaveBalance.create({ data: { tenantId, employeeId: employee.id, leaveTypeId: type.id, year, entitledDays: entitled, carriedDays: carried } });
}

export async function balancesFor(db: TenantDb, session: SessionData, employeeId: string, year: number) {
  const e = await db.employee.findFirst({ where: { id: employeeId } });
  if (!e) throw notFound("الموظف غير موجود");
  const types = await listLeaveTypes(db, session);
  const out = [];
  for (const t of types.filter((x) => x.isActive && x.annualDays !== null && (!x.gender || x.gender === e.gender))) {
    const hs = hrSettings(session);
    const b = await ensureBalance(db, session.tenant.id, e, t, year, { days: hs.seniorLeaveDays, afterYears: hs.seniorLeaveAfterYears });
    out.push({ type: t, entitled: b.entitledDays + b.carriedDays + b.adjustedDays, used: b.usedDays, remaining: b.entitledDays + b.carriedDays + b.adjustedDays - b.usedDays, balanceId: b.id });
  }
  return out;
}

export async function adjustBalance(db: TenantDb, session: SessionData, input: { balanceId: string; adjustedDays: number; reason: string }) {
  requireHr(session, "hr_attendance", "approve", "تعديل الأرصدة لمدير الموارد البشرية");
  const b = await db.leaveBalance.findFirst({ where: { id: input.balanceId } });
  if (!b) throw notFound("الرصيد غير موجود");
  return db.leaveBalance.update({ where: { id: b.id }, data: { adjustedDays: input.adjustedDays } });
}

// ---------------------------------------------------------------------
// طلبات الإجازة
// ---------------------------------------------------------------------

export async function requestLeave(db: TenantDb, session: SessionData, input: { employeeId?: string | null; leaveTypeId: string; startDate: string; endDate: string; reason?: string | null; attachments?: Array<{ id: string; name: string; url: string }> }) {
  const self = await myEmployee(db, session);
  const employeeId = input.employeeId ?? self?.id;
  if (!employeeId) throw badRequest("حسابك غير مرتبط بملف موظف");
  if (employeeId !== self?.id) requireHr(session, "hr_attendance", "create", "تسجيل إجازة لموظف آخر للموارد البشرية");
  const e = await db.employee.findFirst({ where: { id: employeeId, deletedAt: null, status: { not: "TERMINATED" } }, include: { manager: { select: { userId: true } } } });
  if (!e) throw notFound("الموظف غير موجود");
  const type = await db.leaveType.findFirst({ where: { id: input.leaveTypeId, isActive: true } });
  if (!type) throw notFound("نوع الإجازة غير موجود");
  if (type.gender && type.gender !== e.gender) throw badRequest("نوع الإجازة لا ينطبق على الموظف");
  if (input.endDate < input.startDate) throw badRequest("نهاية الإجازة قبل بدايتها");
  if (type.requiresAttachment && !input.attachments?.length) throw badRequest("أرفق المستند المؤيد (تقرير طبي…)");
  const shift = await shiftOf(db, e.shiftId);
  const days = workingDays(input.startDate, input.endDate, shift?.workDays ?? DEFAULT_WORK_DAYS).length;
  if (!days) throw badRequest("الفترة لا تتضمن أيام عمل");
  if (type.maxPerRequest && days > type.maxPerRequest) throw badRequest(`الحد الأقصى لهذا النوع ${type.maxPerRequest} أيام في الطلب`);
  const overlap = await db.staffLeaveRequest.findFirst({ where: { employeeId: e.id, status: { in: ["PENDING", "APPROVED"] }, deletedAt: null, startDate: { lte: dateOnly(input.endDate) }, endDate: { gte: dateOnly(input.startDate) } } });
  if (overlap) throw badRequest("يوجد طلب إجازة متداخل مع هذه الفترة");
  if (type.annualDays !== null) {
    const bal = await ensureBalance(db, session.tenant.id, e, type, Number(input.startDate.slice(0, 4)));
    const pending = await db.staffLeaveRequest.aggregate({ where: { employeeId: e.id, leaveTypeId: type.id, status: "PENDING", deletedAt: null }, _sum: { days: true } });
    const remaining = bal.entitledDays + bal.carriedDays + bal.adjustedDays - bal.usedDays - (pending._sum.days ?? 0);
    if (days > remaining) throw badRequest(`الرصيد المتاح ${remaining} يوماً والطلب ${days}`);
  }
  const req = await db.staffLeaveRequest.create({
    data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "staff-leave"), employeeId: e.id, leaveTypeId: type.id, startDate: dateOnly(input.startDate), endDate: dateOnly(input.endDate), days, reason: input.reason ?? null, attachments: (input.attachments ?? []) as Prisma.InputJsonValue, createdById: session.user.id, updatedById: session.user.id },
  });
  const steps = [];
  if (e.manager?.userId && e.manager.userId !== session.user.id) steps.push({ name: "موافقة المدير المباشر", approverUserId: e.manager.userId });
  steps.push({ name: "اعتماد الموارد البشرية", approverRoleKey: "HR_MANAGER" });
  const approval = await createApprovalRequest(db, session, { type: "staff_leave", title: `${type.name} — ${e.fullName}: ${days} أيام من ${input.startDate}`, description: input.reason ?? undefined, entityType: "StaffLeaveRequest", entityId: req.id, link: "/hr/attendance/leaves", managerUserId: e.manager?.userId ?? null, steps });
  return db.staffLeaveRequest.update({ where: { id: req.id }, data: { approvalRequestId: approval.id } });
}

/** اعتماد الإجازة: خصم الرصيد وتسجيل أيامها «في إجازة» في الحضور */
export async function onStaffLeaveApproval(db: TenantDb, session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  const req = await db.staffLeaveRequest.findFirst({ where: { id: request.entityId, status: "PENDING" }, include: { employee: true } });
  if (!req) return;
  if (event.decision === "REJECTED") {
    await db.staffLeaveRequest.update({ where: { id: req.id }, data: { status: "REJECTED", decidedAt: new Date() } });
  } else {
    const type = await db.leaveType.findFirst({ where: { id: req.leaveTypeId } });
    const shift = await shiftOf(db, req.employee.shiftId);
    const days = workingDays(isoOf(req.startDate)!, isoOf(req.endDate)!, shift?.workDays ?? DEFAULT_WORK_DAYS);
    await db.$transaction(async (tx) => {
      await tx.staffLeaveRequest.update({ where: { id: req.id }, data: { status: "APPROVED", decidedAt: new Date() } });
      if (type?.annualDays !== null && type) {
        const bal = await ensureBalance(db, req.tenantId, req.employee, type, req.startDate.getUTCFullYear());
        await tx.leaveBalance.update({ where: { id: bal.id }, data: { usedDays: { increment: req.days } } });
      }
      for (const d of days) {
        await tx.employeeAttendance.upsert({ where: { employeeId_date: { employeeId: req.employeeId, date: dateOnly(d) } }, create: { tenantId: req.tenantId, employeeId: req.employeeId, date: dateOnly(d), status: "ON_LEAVE", source: "LEAVE", note: type?.name ?? null }, update: { status: "ON_LEAVE", source: "LEAVE", checkIn: null, checkOut: null, lateMinutes: 0, overtimeMinutes: 0, note: type?.name ?? null } });
      }
    });
  }
  if (req.employee.userId) await notify(db, { tenantId: req.tenantId, userIds: [req.employee.userId], type: "SYSTEM", title: event.decision === "APPROVED" ? "اعتُمدت إجازتك" : "رُفض طلب إجازتك", body: `${isoOf(req.startDate)} ← ${isoOf(req.endDate)}`, link: "/hr/me", actorId: session.user.id, entityType: "StaffLeaveRequest", entityId: req.id });
}

/** إلغاء طلب: المعلّق بصاحبه أو الموارد البشرية، والمعتمد (قبل بدايته) بالموارد البشرية مع إعادة الرصيد */
export async function cancelLeave(db: TenantDb, session: SessionData, id: string) {
  const req = await db.staffLeaveRequest.findFirst({ where: { id, deletedAt: null }, include: { employee: true } });
  if (!req) throw notFound("الطلب غير موجود");
  const self = await myEmployee(db, session);
  const hr = isHrStaff(session, "hr_attendance", "update");
  if (req.status === "PENDING" && !(hr || self?.id === req.employeeId)) throw forbidden();
  if (req.status === "APPROVED" && !hr) throw forbidden("إلغاء الإجازة المعتمدة للموارد البشرية");
  if (req.status === "APPROVED" && isoOf(req.startDate)! <= today(session)) throw badRequest("بدأت الإجازة؛ لا تُلغى");
  if (req.status !== "PENDING" && req.status !== "APPROVED") throw badRequest("الطلب مغلق");
  await db.$transaction(async (tx) => {
    if (req.status === "APPROVED") {
      await tx.leaveBalance.updateMany({ where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: req.startDate.getUTCFullYear() }, data: { usedDays: { decrement: req.days } } });
      await tx.employeeAttendance.deleteMany({ where: { employeeId: req.employeeId, source: "LEAVE", date: { gte: req.startDate, lte: req.endDate } } });
    }
    await tx.staffLeaveRequest.update({ where: { id }, data: { status: "CANCELLED", updatedById: session.user.id } });
    if (req.approvalRequestId) await tx.approvalRequest.updateMany({ where: { id: req.approvalRequestId, status: "PENDING" }, data: { status: "CANCELLED" } });
  });
  return { ok: true };
}

export async function listLeaveRequests(db: TenantDb, session: SessionData, input: { status?: string | null; mine?: boolean }) {
  const self = await myEmployee(db, session);
  const hr = isHrStaff(session, "hr_attendance", "view");
  if (!hr && !self) throw forbidden();
  const rows = await db.staffLeaveRequest.findMany({
    where: { deletedAt: null, ...(input.status ? { status: input.status } : {}), ...(!hr || input.mine ? { employeeId: self?.id ?? "-" } : { employee: hrBranchWhere(session, "hr_attendance", "view") }) },
    include: { employee: { select: { id: true, fullName: true, number: true } } },
    orderBy: [{ startDate: "desc" }],
    take: 300,
  });
  const types = await db.leaveType.findMany();
  return rows.map((r) => ({ ...r, type: types.find((t) => t.id === r.leaveTypeId) ?? null }));
}

// ---------------------------------------------------------------------
// الخدمة الذاتية
// ---------------------------------------------------------------------

export async function selfService(db: TenantDb, session: SessionData) {
  const e = await myEmployee(db, session);
  if (!e) return { employee: null };
  const t = today(session);
  const [todayRec, shift, balances, requests, month, lines, types] = await Promise.all([
    db.employeeAttendance.findFirst({ where: { employeeId: e.id, date: dateOnly(t) } }),
    shiftOf(db, e.shiftId),
    balancesFor(db, session, e.id, Number(t.slice(0, 4))),
    db.staffLeaveRequest.findMany({ where: { employeeId: e.id, deletedAt: null }, orderBy: { startDate: "desc" }, take: 10 }),
    monthSummary(db, t.slice(0, 7), [e.id]),
    db.payrollLine.findMany({ where: { employeeId: e.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: { select: { id: true, month: true, status: true } } }, orderBy: { run: { month: "desc" } }, take: 12 }),
    db.leaveType.findMany({ where: { isActive: true } }),
  ]);
  return {
    employee: { id: e.id, fullName: e.fullName, number: e.number, gender: e.gender },
    today: t,
    shift,
    record: todayRec ? { status: todayRec.status, checkIn: todayRec.checkIn ? localHHMM(todayRec.checkIn, session.tenant.timezone) : null, checkOut: todayRec.checkOut ? localHHMM(todayRec.checkOut, session.tenant.timezone) : null, lateMinutes: todayRec.lateMinutes } : null,
    balances: balances.map((b) => ({ type: { id: b.type.id, name: b.type.name, color: b.type.color }, entitled: b.entitled, used: b.used, remaining: b.remaining })),
    leaveTypes: types.filter((x) => !x.gender || x.gender === e.gender).map((x) => ({ id: x.id, name: x.name, requiresAttachment: x.requiresAttachment, annualDays: x.annualDays })),
    requests: requests.map((r) => ({ ...r, type: types.find((x) => x.id === r.leaveTypeId)?.name ?? "" })),
    month: month.get(e.id) ?? null,
    payslips: lines.map((l) => ({ id: l.id, runId: l.run.id, month: l.run.month, status: l.run.status, netMinor: l.netMinor })),
  };
}
