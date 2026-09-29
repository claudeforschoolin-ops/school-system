/**
 * ملفات الموظفين: البيانات الشخصية (الهوية مشفّرة ببصمة بحث)، المؤهلات والخبرات، البنك والآيبان،
 * العقود وهيكل الراتب، الهيكل التنظيمي (أقسام ومسميات ومدير مباشر)، وتنبيهات انتهاء الوثائق.
 */
import type { Prisma } from "@/generated/prisma/client";
import { validIban } from "@/lib/hr/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { maskId, protectId, revealId } from "@/server/pii";
import { notify } from "@/server/services/notifications.service";
import { nextNumber } from "@/server/services/sequence.service";
import { dateOnly, hrBranchWhere, hrSettings, isHrStaff, isoOf, monthlyWage, myEmployee, otherTotal, requireHr, today } from "./common";

export const EMPLOYEE_CATEGORY: Record<string, string> = { ACADEMIC: "هيئة تعليمية", ADMIN: "إداري", SERVICES: "خدمات" };

export async function listEmployees(db: TenantDb, session: SessionData, input: { q?: string | null; status?: string | null; departmentId?: string | null; category?: string | null }) {
  const scope = hrBranchWhere(session, "employees", "view");
  const q = input.q?.trim();
  const rows = await db.employee.findMany({
    where: {
      deletedAt: null,
      ...scope,
      ...(input.status ? { status: input.status as "ACTIVE" } : { status: { not: "TERMINATED" } }),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] } : {}),
    },
    include: { department: { select: { id: true, name: true } }, positionRef: { select: { title: true } }, manager: { select: { id: true, fullName: true } }, contracts: { where: { status: "ACTIVE" }, take: 1, orderBy: { startDate: "desc" } } },
    orderBy: [{ number: "asc" }],
  });
  const alertDays = hrSettings(session).expiryAlertDays;
  const limit = dateOnly(today(session)).getTime() + alertDays * 86_400_000;
  const branches = await db.branch.findMany({ select: { id: true, name: true } });
  const canSalary = isHrStaff(session, "payroll", "view");
  return rows.map((e) => {
    const c = e.contracts[0];
    const soon = [e.idExpiry && e.idExpiry.getTime() <= limit ? "الهوية/الإقامة" : null, e.passportExpiry && e.passportExpiry.getTime() <= limit ? "الجواز" : null, c?.endDate && c.endDate.getTime() <= limit ? "العقد" : null].filter(Boolean) as string[];
    return {
      id: e.id,
      number: e.number,
      fullName: e.fullName,
      gender: e.gender,
      nationality: e.nationality,
      category: e.category,
      status: e.status,
      phone: e.phone,
      email: e.email,
      hireDate: e.hireDate,
      department: e.department,
      position: e.positionRef?.title ?? null,
      manager: e.manager,
      branch: branches.find((b) => b.id === e.branchId)?.name ?? null,
      userId: e.userId,
      photoUrl: e.photoUrl,
      wageMinor: canSalary && c ? monthlyWage(c) : null,
      expiring: soon,
    };
  });
}

export async function getEmployee(db: TenantDb, session: SessionData, id: string) {
  const self = await myEmployee(db, session);
  const staff = isHrStaff(session, "employees", "view");
  if (!staff && self?.id !== id) throw notFound("الموظف غير موجود أو خارج نطاقك");
  const e = await db.employee.findFirst({
    where: { id, deletedAt: null, ...(staff ? hrBranchWhere(session, "employees", "view") : {}) },
    include: { department: true, positionRef: true, manager: { select: { id: true, fullName: true } }, reports: { where: { deletedAt: null, status: { not: "TERMINATED" } }, select: { id: true, fullName: true } }, contracts: { orderBy: { startDate: "desc" } }, loans: { orderBy: { createdAt: "desc" } } },
  });
  if (!e) throw notFound("الموظف غير موجود أو خارج نطاقك");
  const year = Number(today(session).slice(0, 4));
  const monthStart = dateOnly(`${today(session).slice(0, 7)}-01`);
  const [user, balances, types, requests, attendance, reviews, eos, shift, branch, lines] = await Promise.all([
    e.userId ? db.user.findFirst({ where: { id: e.userId }, select: { id: true, name: true, email: true, status: true } }) : null,
    db.leaveBalance.findMany({ where: { employeeId: id, year } }),
    db.leaveType.findMany({ where: { isActive: true } }),
    db.staffLeaveRequest.findMany({ where: { employeeId: id, deletedAt: null }, orderBy: { startDate: "desc" }, take: 10 }),
    db.employeeAttendance.groupBy({ by: ["status"], where: { employeeId: id, date: { gte: monthStart } }, _count: { _all: true }, _sum: { lateMinutes: true, overtimeMinutes: true } }),
    db.performanceReview.findMany({ where: { employeeId: id }, include: { cycle: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.endOfService.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } }),
    e.shiftId ? db.workShift.findFirst({ where: { id: e.shiftId } }) : db.workShift.findFirst({ where: { isDefault: true } }),
    e.branchId ? db.branch.findFirst({ where: { id: e.branchId }, select: { name: true } }) : null,
    isHrStaff(session, "payroll", "view") || self?.id === id ? db.payrollLine.findMany({ where: { employeeId: id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: { select: { id: true, month: true, status: true } } }, orderBy: { run: { month: "desc" } }, take: 12 }) : [],
  ]);
  const canSeeId = isHrStaff(session, "employees", "update") || self?.id === id;
  const canSalary = isHrStaff(session, "payroll", "view") || self?.id === id;
  return {
    employee: {
      ...e,
      nationalIdEnc: undefined,
      nationalIdHash: undefined,
      nationalId: canSeeId ? revealId(e.nationalIdEnc) : maskId(e.nationalIdLast4),
      iban: canSalary ? e.iban : e.iban ? `••••${e.iban.slice(-4)}` : null,
      contracts: canSalary ? e.contracts.map((c) => ({ ...c, otherTotalMinor: otherTotal(c.otherAllowances), wageMinor: monthlyWage(c) })) : [],
      loans: canSalary ? e.loans : [],
    },
    branch: branch?.name ?? null,
    user,
    shift,
    balances: types.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id);
      const entitled = (b?.entitledDays ?? 0) + (b?.carriedDays ?? 0) + (b?.adjustedDays ?? 0);
      return { type: { id: t.id, name: t.name, color: t.color, annualDays: t.annualDays }, entitled, used: b?.usedDays ?? 0, remaining: t.annualDays === null ? null : entitled - (b?.usedDays ?? 0) };
    }),
    leaveRequests: requests.map((r) => ({ ...r, type: types.find((t) => t.id === r.leaveTypeId)?.name ?? "" })),
    monthAttendance: attendance.map((a) => ({ status: a.status, days: a._count._all, lateMinutes: a._sum.lateMinutes ?? 0, overtimeMinutes: a._sum.overtimeMinutes ?? 0 })),
    reviews: reviews.map((r) => ({ id: r.id, cycle: r.cycle.name, status: r.status, finalBp: r.finalBp, rating: r.rating })),
    endOfService: eos,
    payslips: lines.map((l) => ({ id: l.id, runId: l.run.id, month: l.run.month, status: l.run.status, grossMinor: l.grossMinor, netMinor: l.netMinor })),
    permissions: { edit: isHrStaff(session, "employees", "update"), salary: isHrStaff(session, "payroll", "update"), eos: isHrStaff(session, "end_of_service", "create"), self: self?.id === id },
  };
}

export interface EmployeeInput {
  fullName: string;
  gender: "MALE" | "FEMALE";
  birthDate?: string | null;
  nationality: string;
  maritalStatus?: string | null;
  idType: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId?: string | null;
  idExpiry?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  category: "ACADEMIC" | "ADMIN" | "SERVICES";
  hireDate: string;
  bankName?: string | null;
  iban?: string | null;
  sponsor?: string | null;
  shiftId?: string | null;
  gosiRegistered: boolean;
  qualifications?: Array<{ degree: string; major: string; institution: string; year: string }>;
  experiences?: Array<{ employer: string; title: string; from: string; to: string }>;
  notes?: string | null;
}

async function validateEmployee(db: TenantDb, session: SessionData, input: EmployeeInput, id: string | null) {
  if (input.fullName.trim().split(/\s+/).length < 3) throw badRequest("الاسم الرباعي أو الثلاثي على الأقل");
  if (input.iban && !validIban(input.iban)) throw badRequest("رقم الآيبان غير صحيح (SA و٢٢ رقماً مع رقم تحقق صالح)");
  if (input.nationalId) {
    const digits = input.nationalId.replace(/\D/g, "");
    if ((input.idType === "NATIONAL_ID" && !/^1\d{9}$/.test(digits)) || (input.idType === "IQAMA" && !/^2\d{9}$/.test(digits))) throw badRequest(input.idType === "IQAMA" ? "رقم الإقامة ١٠ أرقام يبدأ بـ٢" : "رقم الهوية الوطنية ١٠ أرقام يبدأ بـ١");
    const p = protectId(session.tenant.id, input.nationalId);
    const dup = await db.employee.findFirst({ where: { nationalIdHash: p.nationalIdHash, deletedAt: null, ...(id ? { id: { not: id } } : {}) } });
    if (dup) throw badRequest(`رقم الهوية مسجل للموظف ${dup.fullName}`);
  }
  if (input.managerId && input.managerId === id) throw badRequest("لا يكون الموظف مديراً لنفسه");
  if (input.managerId && id) {
    // منع الحلقات في الهيكل
    let cur: string | null = input.managerId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === id) throw badRequest("هذا التعيين يُنشئ حلقة في الهيكل التنظيمي");
      cur = (await db.employee.findFirst({ where: { id: cur }, select: { managerId: true } }))?.managerId ?? null;
    }
  }
}

function employeeData(session: SessionData, input: EmployeeInput) {
  const pii = input.nationalId ? protectId(session.tenant.id, input.nationalId) : null;
  const d = (s: string | null | undefined) => (s ? dateOnly(s) : null);
  return {
    fullName: input.fullName.trim().replace(/\s+/g, " "),
    gender: input.gender,
    birthDate: d(input.birthDate),
    nationality: input.nationality,
    maritalStatus: input.maritalStatus ?? null,
    idType: input.idType,
    ...(pii ? { nationalIdHash: pii.nationalIdHash, nationalIdEnc: pii.nationalIdEnc, nationalIdLast4: pii.nationalIdLast4 } : {}),
    idExpiry: d(input.idExpiry),
    passportNumber: input.passportNumber ?? null,
    passportExpiry: d(input.passportExpiry),
    phone: input.phone ?? null,
    email: input.email?.toLowerCase() ?? null,
    address: input.address ?? null,
    branchId: input.branchId ?? null,
    departmentId: input.departmentId ?? null,
    positionId: input.positionId ?? null,
    managerId: input.managerId ?? null,
    category: input.category,
    hireDate: dateOnly(input.hireDate),
    bankName: input.bankName ?? null,
    iban: input.iban ? input.iban.replace(/\s/g, "").toUpperCase() : null,
    sponsor: input.sponsor ?? null,
    shiftId: input.shiftId ?? null,
    gosiRegistered: input.gosiRegistered,
    qualifications: (input.qualifications ?? []) as Prisma.InputJsonValue,
    experiences: (input.experiences ?? []) as Prisma.InputJsonValue,
    notes: input.notes ?? null,
    updatedById: session.user.id,
  };
}

export async function createEmployee(db: TenantDb, session: SessionData, input: EmployeeInput) {
  requireHr(session, "employees", "create");
  await validateEmployee(db, session, input, null);
  return db.employee.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "employee"), ...employeeData(session, input), createdById: session.user.id } });
}

export async function updateEmployee(db: TenantDb, session: SessionData, id: string, input: EmployeeInput) {
  requireHr(session, "employees", "update");
  const e = await db.employee.findFirst({ where: { id, deletedAt: null, ...hrBranchWhere(session, "employees", "update") } });
  if (!e) throw notFound("الموظف غير موجود");
  await validateEmployee(db, session, input, id);
  return db.employee.update({ where: { id }, data: employeeData(session, input) });
}

/** ربط ملف الموظف بحساب دخول (أو فكّه) */
export async function linkUser(db: TenantDb, session: SessionData, input: { employeeId: string; userId: string | null }) {
  requireHr(session, "employees", "update");
  if (input.userId) {
    const taken = await db.employee.findFirst({ where: { userId: input.userId, id: { not: input.employeeId } } });
    if (taken) throw badRequest(`الحساب مرتبط بالموظف ${taken.fullName}`);
  }
  return db.employee.update({ where: { id: input.employeeId }, data: { userId: input.userId } });
}

// ---------------------------------------------------------------------
// العقود
// ---------------------------------------------------------------------

export interface ContractInput {
  employeeId: string;
  type: "FIXED" | "UNLIMITED" | "PART_TIME";
  startDate: string;
  endDate?: string | null;
  probationEnd?: string | null;
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowances: Array<{ name: string; amountMinor: number }>;
  hoursPerDay: number;
  annualLeaveDays: number;
}

/** عقد جديد: يُنهي العقد الساري السابق في اليوم السابق لبدايته */
export async function saveContract(db: TenantDb, session: SessionData, input: ContractInput & { id?: string | null }) {
  requireHr(session, "payroll", "update", "هيكل الرواتب لمدير الموارد البشرية");
  const e = await db.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!e) throw notFound("الموظف غير موجود");
  if (input.type === "FIXED" && !input.endDate) throw badRequest("العقد محدد المدة يحتاج تاريخ نهاية");
  if (input.endDate && input.endDate <= input.startDate) throw badRequest("نهاية العقد بعد بدايته");
  if (input.basicMinor <= 0) throw badRequest("الراتب الأساسي مطلوب");
  if (input.annualLeaveDays < 21) throw badRequest("الإجازة السنوية لا تقل عن ٢١ يوماً (المادة ١٠٩)");
  const data = { type: input.type, startDate: dateOnly(input.startDate), endDate: input.endDate ? dateOnly(input.endDate) : null, probationEnd: input.probationEnd ? dateOnly(input.probationEnd) : null, basicMinor: input.basicMinor, housingMinor: input.housingMinor, transportMinor: input.transportMinor, otherAllowances: input.otherAllowances as Prisma.InputJsonValue, hoursPerDay: input.hoursPerDay, annualLeaveDays: input.annualLeaveDays, updatedById: session.user.id };
  if (input.id) return db.employmentContract.update({ where: { id: input.id }, data });
  return db.$transaction(async (tx) => {
    const prev = await tx.employmentContract.findMany({ where: { employeeId: e.id, status: "ACTIVE" } });
    for (const p of prev) {
      if (p.startDate >= dateOnly(input.startDate)) throw badRequest("يوجد عقد ساري يبدأ بعد هذا التاريخ");
      await tx.employmentContract.update({ where: { id: p.id }, data: { status: "ENDED", endDate: new Date(dateOnly(input.startDate).getTime() - 86_400_000) } });
    }
    return tx.employmentContract.create({ data: { tenantId: session.tenant.id, employeeId: e.id, number: await nextNumber(db, session.tenant.id, "contract"), ...data, createdById: session.user.id } });
  });
}

// ---------------------------------------------------------------------
// الهيكل التنظيمي
// ---------------------------------------------------------------------

export async function orgStructure(db: TenantDb, session: SessionData) {
  requireHr(session, "employees", "view");
  const [departments, positions, employees, costCenters] = await Promise.all([
    db.department.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }, { code: "asc" }] }),
    db.position.findMany({ where: { isActive: true }, orderBy: { title: "asc" } }),
    db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" } }, select: { id: true, fullName: true, departmentId: true, positionId: true, managerId: true, category: true, photoUrl: true, positionRef: { select: { title: true } } } }),
    db.costCenter.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
  ]);
  return {
    departments: departments.map((d) => ({ ...d, head: employees.find((e) => e.id === d.headEmployeeId)?.fullName ?? null, employees: employees.filter((e) => e.departmentId === d.id).length })),
    positions: positions.map((p) => ({ ...p, filled: employees.filter((e) => e.positionId === p.id).length, department: departments.find((d) => d.id === p.departmentId)?.name ?? "" })),
    employees: employees.map((e) => ({ id: e.id, fullName: e.fullName, departmentId: e.departmentId, managerId: e.managerId, position: e.positionRef?.title ?? null, category: e.category, photoUrl: e.photoUrl })),
    costCenters,
  };
}

export async function saveDepartment(db: TenantDb, session: SessionData, input: { id?: string | null; code: string; name: string; parentId: string | null; headEmployeeId: string | null; category: "ACADEMIC" | "ADMIN" | "SERVICES"; costCenterId: string | null }) {
  requireHr(session, "employees", "update");
  if (input.id && input.parentId === input.id) throw badRequest("لا يتبع القسم نفسه");
  if (input.id && input.parentId) {
    let cur: string | null = input.parentId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === input.id) throw badRequest("حلقة في شجرة الأقسام");
      cur = (await db.department.findFirst({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
  }
  const dup = await db.department.findFirst({ where: { code: input.code.trim(), deletedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (dup) throw badRequest("رمز القسم مستخدم");
  const data = { code: input.code.trim(), name: input.name.trim(), parentId: input.parentId, headEmployeeId: input.headEmployeeId, category: input.category, costCenterId: input.costCenterId, updatedById: session.user.id };
  return input.id ? db.department.update({ where: { id: input.id }, data }) : db.department.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
}

export async function deleteDepartment(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "employees", "update");
  if (await db.employee.count({ where: { departmentId: id, deletedAt: null, status: { not: "TERMINATED" } } })) throw badRequest("انقل موظفي القسم أولاً");
  if (await db.department.count({ where: { parentId: id, deletedAt: null } })) throw badRequest("للقسم أقسام فرعية");
  await db.position.updateMany({ where: { departmentId: id }, data: { isActive: false } });
  await db.department.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}

export async function savePosition(db: TenantDb, session: SessionData, input: { id?: string | null; departmentId: string; title: string; headcount: number }) {
  requireHr(session, "employees", "update");
  const data = { departmentId: input.departmentId, title: input.title.trim(), headcount: input.headcount };
  return input.id ? db.position.update({ where: { id: input.id }, data }) : db.position.create({ data: { tenantId: session.tenant.id, ...data } });
}

export async function deletePosition(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "employees", "update");
  if (await db.employee.count({ where: { positionId: id, deletedAt: null, status: { not: "TERMINATED" } } })) throw badRequest("المسمى مشغول بموظفين");
  await db.position.update({ where: { id }, data: { isActive: false } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// التنبيهات
// ---------------------------------------------------------------------

export function requireHrView(session: SessionData) {
  requireHr(session, "employees", "view");
}

/** وثائق وعقود تنتهي خلال المهلة أو انتهت */
export async function expiryAlerts(db: TenantDb, session: Pick<SessionData, "tenant">) {
  const days = hrSettings(session).expiryAlertDays;
  const t0 = dateOnly(today(session));
  const limit = new Date(t0.getTime() + days * 86_400_000);
  const [emps, contracts] = await Promise.all([
    db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" }, OR: [{ idExpiry: { lte: limit } }, { passportExpiry: { lte: limit } }] }, select: { id: true, fullName: true, idType: true, idExpiry: true, passportExpiry: true } }),
    db.employmentContract.findMany({ where: { status: "ACTIVE", endDate: { lte: limit }, employee: { deletedAt: null, status: { not: "TERMINATED" } } }, include: { employee: { select: { id: true, fullName: true } } } }),
  ]);
  const out: Array<{ employeeId: string; name: string; kind: string; date: string; daysLeft: number }> = [];
  const push = (id: string, name: string, kind: string, d: Date | null) => {
    if (d && d <= limit) out.push({ employeeId: id, name, kind, date: isoOf(d)!, daysLeft: Math.round((d.getTime() - t0.getTime()) / 86_400_000) });
  };
  for (const e of emps) {
    push(e.id, e.fullName, e.idType === "IQAMA" ? "الإقامة" : "الهوية الوطنية", e.idExpiry);
    push(e.id, e.fullName, "جواز السفر", e.passportExpiry);
  }
  for (const c of contracts) push(c.employee.id, c.employee.fullName, "عقد العمل", c.endDate);
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** إشعار الموارد البشرية بالوثائق المنتهية أو القريبة (للمجدول اليومي؛ يُرسل في أيام محددة لتجنب الإزعاج) */
export async function notifyExpiries(db: TenantDb, session: Pick<SessionData, "tenant">) {
  const alerts = await expiryAlerts(db, session);
  const due = alerts.filter((a) => [60, 30, 14, 7, 1, 0].includes(a.daysLeft) || a.daysLeft < 0);
  if (!due.length) return { notified: 0 };
  const hr = await db.userRole.findMany({ where: { role: { key: { in: ["HR_MANAGER", "HR_OFFICER"] } } }, select: { userId: true } });
  const users = [...new Set(hr.map((h) => h.userId))];
  if (users.length) await notify(db, { tenantId: session.tenant.id, userIds: users, type: "SYSTEM", title: `${due.length} وثيقة/عقد ينتهي قريباً أو انتهى`, body: due.slice(0, 5).map((a) => `${a.name}: ${a.kind} ${a.daysLeft < 0 ? "منتهية" : `بعد ${a.daysLeft} يوماً`}`).join("\n"), link: "/hr/employees?tab=alerts", actorId: null, entityType: "Employee", entityId: null });
  return { notified: due.length };
}

export async function hrOptions(db: TenantDb) {
  const [departments, positions, managers, branches, shifts, users] = await Promise.all([
    db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, category: true }, orderBy: { code: "asc" } }),
    db.position.findMany({ where: { isActive: true }, select: { id: true, title: true, departmentId: true } }),
    db.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.workShift.findMany({ select: { id: true, name: true, startTime: true, endTime: true, isDefault: true } }),
    db.user.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  return { departments, positions, managers, branches, shifts, users };
}
