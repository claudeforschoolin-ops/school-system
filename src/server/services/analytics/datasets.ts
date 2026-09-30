/**
 * مجموعات البيانات لمنشئ التقارير وقواعد الأتمتة.
 * ---------------------------------------------------------------------
 * كل مجموعة تعرّف حقولها (بأنواعها) ووحدة الصلاحية التي تحكمها، وتحمّل الصفوف ضمن نطاق المستخدم
 * (كل المدرسة / فروعه / مراحله) — ولا تُتاح لنطاقات الأسرة أو «سجلاتي فقط»: التقارير أداة موظفين.
 * الحقول الحساسة مالياً داخل مجموعة غير مالية (رصيد الطالب مثلاً) تتطلب صلاحية وحدتها أيضاً.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { FieldDef, Row } from "@/lib/analytics/query";
import { L } from "@/lib/analytics/labels";
import { resolveScope } from "@/lib/rbac/access";
import { nationalityName } from "@/lib/region";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden } from "@/server/errors";
import { computeTerm } from "@/server/services/assessment/results.service";
import { displayStatus, todayIso } from "@/server/services/finance/common";

const MAX = 50_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** نطاق موظف على الوحدة: null = لا صلاحية موظف */
export function staffScope(session: SessionData, module: string): { all: true } | { branchIds: string[]; stageIds: string[] } | null {
  const s = resolveScope(session.access, module, "view");
  if (!s) return null;
  if (s.kind === "all") return { all: true };
  if (!s.branchIds.length && !s.stageIds.length) return null;
  return { branchIds: s.branchIds, stageIds: s.stageIds };
}

function branchCond(scope: NonNullable<ReturnType<typeof staffScope>>): { branchId?: { in: string[] } } {
  return "all" in scope ? {} : { branchId: { in: scope.branchIds } };
}

function studentCond(scope: NonNullable<ReturnType<typeof staffScope>>): Prisma.StudentWhereInput {
  if ("all" in scope) return {};
  const or: Prisma.StudentWhereInput[] = [];
  if (scope.branchIds.length) or.push({ branchId: { in: scope.branchIds } });
  if (scope.stageIds.length) or.push({ grade: { stageId: { in: scope.stageIds } } });
  return { OR: or };
}

export interface LoadCtx {
  today: string;
  /** الحقول المطلوبة فعلاً (لتجنب الحسابات الثقيلة غير اللازمة) */
  need: (key: string) => boolean;
  scope: NonNullable<ReturnType<typeof staffScope>>;
  /** يملك المستخدم صلاحية الوحدة لحقل مقيّد */
  can: (module: string) => boolean;
}

export interface Dataset {
  key: string;
  label: string;
  description: string;
  icon: string;
  group: "الطلاب" | "الأكاديمي" | "المالية" | "الموارد البشرية" | "العمليات";
  module: string;
  fields: FieldDef[];
  /** معرّف الصف (لعدم تكرار إجراءات الأتمتة) */
  idField: string;
  /** حقل معرّف الطالب (لإشعار أولياء الأمور من الأتمتة) */
  studentField?: string;
  /** حقل معرّف مستخدم مسؤول (لإشعار المسند إليه) */
  userField?: string;
  /** رابط السجل في النظام */
  link?: (row: Row) => string | null;
  /** عنوان مختصر للسجل (في الإشعارات) */
  title: (row: Row) => string;
  load: (db: TenantDb, session: SessionData, ctx: LoadCtx) => Promise<Row[]>;
}

// ---------------------------------------------------------------------

const studentsDs: Dataset = {
  key: "students",
  label: "الطلاب",
  description: "ملفات الطلاب مع الصف والفصل وولي الأمر والغياب والرصيد",
  icon: "lucide:contact",
  group: "الطلاب",
  module: "students",
  idField: "id",
  studentField: "id",
  link: (r) => `/students/${r.id}`,
  title: (r) => String(r.fullName),
  fields: [
    { key: "fullName", label: "اسم الطالب", type: "string" },
    { key: "academicNumber", label: "الرقم الأكاديمي", type: "string" },
    { key: "gender", label: "الجنس", type: "enum", options: L.gender },
    { key: "nationality", label: "الجنسية", type: "string" },
    { key: "status", label: "الحالة", type: "enum", options: L.studentStatus },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "stage", label: "المرحلة", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "section", label: "الفصل", type: "string" },
    { key: "enrollmentDate", label: "تاريخ الالتحاق", type: "date" },
    { key: "birthDate", label: "تاريخ الميلاد", type: "date" },
    { key: "age", label: "العمر", type: "number" },
    { key: "criticalHealth", label: "حالة صحية حرجة", type: "boolean" },
    { key: "guardianName", label: "ولي الأمر", type: "string" },
    { key: "guardianPhone", label: "جوال ولي الأمر", type: "string" },
    { key: "absences", label: "أيام الغياب (هذا العام)", type: "number", module: "attendance" },
    { key: "absencesLast14", label: "أيام الغياب (آخر ١٤ يوماً)", type: "number", module: "attendance" },
    { key: "lateCount", label: "مرات التأخر (هذا العام)", type: "number", module: "attendance" },
    { key: "balanceMinor", label: "الرصيد المستحق", type: "money", module: "invoices" },
    { key: "overdueMinor", label: "المتأخر سداده", type: "money", module: "invoices" },
  ],
  async load(db, _session, ctx) {
    const students = await db.student.findMany({
      where: { deletedAt: null, ...studentCond(ctx.scope) },
      select: {
        id: true, fullName: true, academicNumber: true, gender: true, nationality: true, status: true, enrollmentDate: true, birthDate: true, criticalHealth: true,
        branch: { select: { name: true } }, grade: { select: { name: true, stage: { select: { name: true } } } }, section: { select: { name: true } },
        guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { name: true, phone: true } } } },
      },
      orderBy: { fullName: "asc" },
      take: MAX,
    });
    const ids = students.map((s) => s.id);
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
    const absent = new Map<string, number>();
    const absent14 = new Map<string, number>();
    const late = new Map<string, number>();
    if (year && (ctx.need("absences") || ctx.need("lateCount") || ctx.need("absencesLast14")) && ctx.can("attendance")) {
      const since14 = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 13 * 86_400_000);
      const rows = await db.attendance.findMany({ where: { studentId: { in: ids }, period: 0, date: { gte: year.startDate }, status: { in: ["ABSENT", "LATE"] } }, select: { studentId: true, status: true, date: true } });
      for (const r of rows) {
        const m = r.status === "ABSENT" ? absent : late;
        m.set(r.studentId, (m.get(r.studentId) ?? 0) + 1);
        if (r.status === "ABSENT" && r.date >= since14) absent14.set(r.studentId, (absent14.get(r.studentId) ?? 0) + 1);
      }
    }
    const balance = new Map<string, number>();
    const overdue = new Map<string, number>();
    if ((ctx.need("balanceMinor") || ctx.need("overdueMinor")) && ctx.can("invoices")) {
      const today = new Date(`${ctx.today}T00:00:00Z`);
      const invs = await db.invoice.findMany({ where: { studentId: { in: ids }, status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null }, select: { studentId: true, totalMinor: true, paidMinor: true, creditedMinor: true, dueDate: true, installments: { select: { dueDate: true, amountMinor: true, paidMinor: true } } } });
      for (const i of invs) {
        const bal = i.totalMinor - i.paidMinor - i.creditedMinor;
        balance.set(i.studentId, (balance.get(i.studentId) ?? 0) + bal);
        const od = i.installments.length ? i.installments.filter((x) => x.dueDate < today).reduce((s, x) => s + x.amountMinor - x.paidMinor, 0) : i.dueDate < today ? bal : 0;
        if (od > 0) overdue.set(i.studentId, (overdue.get(i.studentId) ?? 0) + Math.min(od, bal));
      }
    }
    return students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      academicNumber: s.academicNumber,
      gender: s.gender,
      nationality: nationalityName(s.nationality),
      status: s.status,
      branch: s.branch.name,
      stage: s.grade.stage.name,
      grade: s.grade.name,
      section: s.section?.name ?? null,
      enrollmentDate: iso(s.enrollmentDate),
      birthDate: iso(s.birthDate),
      age: Math.floor(days(iso(s.birthDate)!, ctx.today) / 365.25),
      criticalHealth: s.criticalHealth,
      guardianName: s.guardians[0]?.guardian.name ?? null,
      guardianPhone: s.guardians[0]?.guardian.phone ?? null,
      absences: absent.get(s.id) ?? 0,
      absencesLast14: absent14.get(s.id) ?? 0,
      lateCount: late.get(s.id) ?? 0,
      balanceMinor: balance.get(s.id) ?? 0,
      overdueMinor: overdue.get(s.id) ?? 0,
    }));
  },
};

const attendanceDs: Dataset = {
  key: "attendance",
  label: "سجل الحضور اليومي",
  description: "حالة كل طالب في كل يوم دراسي (آخر ١٢ شهراً)",
  icon: "lucide:user-check",
  group: "الطلاب",
  module: "attendance",
  idField: "id",
  studentField: "studentId",
  title: (r) => `${r.student} — ${r.date}`,
  fields: [
    { key: "date", label: "التاريخ", type: "date" },
    { key: "student", label: "الطالب", type: "string" },
    { key: "academicNumber", label: "الرقم الأكاديمي", type: "string" },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "section", label: "الفصل", type: "string" },
    { key: "status", label: "الحالة", type: "enum", options: L.attendance },
    { key: "minutesLate", label: "دقائق التأخر", type: "number" },
    { key: "reason", label: "السبب", type: "string" },
  ],
  async load(db, _s, ctx) {
    const since = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 365 * 86_400_000);
    const rows = await db.attendance.findMany({
      where: { period: 0, date: { gte: since }, student: { deletedAt: null, ...studentCond(ctx.scope) } },
      select: { id: true, date: true, status: true, minutesLate: true, reason: true, studentId: true, student: { select: { fullName: true, academicNumber: true, branch: { select: { name: true } }, grade: { select: { name: true } }, section: { select: { name: true } } } } },
      orderBy: { date: "desc" },
      take: MAX,
    });
    return rows.map((a) => ({ id: a.id, studentId: a.studentId, date: iso(a.date), student: a.student.fullName, academicNumber: a.student.academicNumber, branch: a.student.branch.name, grade: a.student.grade.name, section: a.student.section?.name ?? null, status: a.status, minutesLate: a.minutesLate, reason: a.reason }));
  },
};
const invoicesDs: Dataset = {
  key: "invoices",
  label: "الفواتير",
  description: "فواتير الطلاب بأرصدتها وحالاتها وأيام التأخر",
  icon: "lucide:receipt-text",
  group: "المالية",
  module: "invoices",
  idField: "id",
  studentField: "studentId",
  link: (r) => `/finance/invoices/${r.id}`,
  title: (r) => `فاتورة ${r.number ?? ""} — ${r.student}`,
  fields: [
    { key: "number", label: "رقم الفاتورة", type: "number" },
    { key: "issueDate", label: "تاريخ الإصدار", type: "date" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
    { key: "student", label: "الطالب", type: "string" },
    { key: "guardian", label: "ولي الأمر", type: "string" },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "status", label: "الحالة", type: "enum", options: L.invoiceStatus },
    { key: "source", label: "المصدر", type: "string" },
    { key: "subtotalMinor", label: "قبل الخصم والضريبة", type: "money" },
    { key: "discountMinor", label: "الخصم", type: "money" },
    { key: "taxMinor", label: "الضريبة", type: "money" },
    { key: "totalMinor", label: "الإجمالي", type: "money" },
    { key: "paidMinor", label: "المسدد", type: "money" },
    { key: "balanceMinor", label: "الرصيد", type: "money" },
    { key: "overdueDays", label: "أيام التأخر", type: "number" },
  ],
  async load(db, _s, ctx) {
    const today = new Date(`${ctx.today}T00:00:00Z`);
    const rows = await db.invoice.findMany({
      where: { deletedAt: null, status: { not: "DRAFT" }, ...branchCond(ctx.scope) },
      select: { id: true, number: true, issueDate: true, dueDate: true, status: true, source: true, subtotalMinor: true, discountMinor: true, taxMinor: true, totalMinor: true, paidMinor: true, creditedMinor: true, studentId: true, branchId: true, student: { select: { fullName: true, grade: { select: { name: true } } } }, guardian: { select: { name: true } }, installments: { select: { dueDate: true, amountMinor: true, paidMinor: true } } },
      orderBy: { number: "desc" },
      take: MAX,
    });
    const branches = await db.branch.findMany({ select: { id: true, name: true } });
    return rows.map((i) => {
      const st = displayStatus(i, today);
      const firstUnpaid = i.installments.length ? i.installments.filter((x) => x.paidMinor < x.amountMinor).map((x) => x.dueDate).sort((a, b) => a.getTime() - b.getTime())[0] : i.dueDate;
      return {
        id: i.id, studentId: i.studentId, number: i.number, issueDate: iso(i.issueDate), dueDate: iso(i.dueDate), student: i.student.fullName, guardian: i.guardian?.name ?? null, branch: branches.find((b) => b.id === i.branchId)?.name ?? null, grade: i.student.grade.name, status: st, source: i.source,
        subtotalMinor: i.subtotalMinor, discountMinor: i.discountMinor, taxMinor: i.taxMinor, totalMinor: i.totalMinor, paidMinor: i.paidMinor, balanceMinor: i.status === "CANCELLED" ? 0 : i.totalMinor - i.paidMinor - i.creditedMinor,
        overdueDays: st === "OVERDUE" && firstUnpaid ? Math.max(0, days(iso(firstUnpaid)!, ctx.today)) : 0,
      };
    });
  },
};

const receiptsDs: Dataset = {
  key: "receipts",
  label: "سندات القبض",
  description: "المبالغ المحصلة بطرق الدفع والفروع والمحصّلين",
  icon: "lucide:banknote",
  group: "المالية",
  module: "collections",
  idField: "id",
  link: (r) => `/finance/receipts/${r.id}`,
  title: (r) => `سند ${r.number} — ${r.payer}`,
  fields: [
    { key: "number", label: "رقم السند", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "payer", label: "الدافع", type: "string" },
    { key: "method", label: "طريقة الدفع", type: "enum", options: L.paymentMethod },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "cashier", label: "المحصّل", type: "string" },
    { key: "status", label: "الحالة", type: "enum", options: { POSTED: "مرحّل", VOIDED: "ملغى" } },
    { key: "amountMinor", label: "المبلغ", type: "money" },
  ],
  async load(db, _s, ctx) {
    const rows = await db.receipt.findMany({ where: { ...("all" in ctx.scope ? {} : { branchId: { in: ctx.scope.branchIds } }) }, select: { id: true, number: true, date: true, payerName: true, method: true, status: true, amountMinor: true, branchId: true, createdById: true }, orderBy: { number: "desc" }, take: MAX });
    const [branches, users] = await Promise.all([db.branch.findMany({ select: { id: true, name: true } }), db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter(Boolean) as string[])] } }, select: { id: true, name: true } })]);
    return rows.map((r) => ({ id: r.id, number: r.number, date: iso(r.date), payer: r.payerName, method: r.method, branch: branches.find((b) => b.id === r.branchId)?.name ?? null, cashier: users.find((u) => u.id === r.createdById)?.name ?? null, status: r.status, amountMinor: r.status === "VOIDED" ? 0 : r.amountMinor }));
  },
};

const vouchersDs: Dataset = {
  key: "vouchers",
  label: "سندات الصرف",
  description: "المصروفات بالحساب والجهة والحالة",
  icon: "lucide:hand-coins",
  group: "المالية",
  module: "expenses",
  idField: "id",
  title: (r) => `سند صرف ${r.number} — ${r.payee}`,
  fields: [
    { key: "number", label: "رقم السند", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "payee", label: "المستفيد", type: "string" },
    { key: "account", label: "حساب المصروف", type: "string" },
    { key: "description", label: "البيان", type: "string" },
    { key: "method", label: "طريقة الدفع", type: "enum", options: L.paymentMethod },
    { key: "status", label: "الحالة", type: "enum", options: L.voucherStatus },
    { key: "amountMinor", label: "المبلغ", type: "money" },
    { key: "taxMinor", label: "الضريبة", type: "money" },
    { key: "totalMinor", label: "الإجمالي", type: "money" },
  ],
  async load(db) {
    const rows = await db.paymentVoucher.findMany({ where: { deletedAt: null }, select: { id: true, number: true, date: true, payee: true, description: true, method: true, status: true, amountMinor: true, taxMinor: true, totalMinor: true, expenseAccountId: true }, orderBy: { number: "desc" }, take: MAX });
    const accounts = await db.account.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.expenseAccountId))] } }, select: { id: true, code: true, name: true } });
    return rows.map((r) => {
      const a = accounts.find((x) => x.id === r.expenseAccountId);
      return { id: r.id, number: r.number, date: iso(r.date), payee: r.payee, account: a ? `${a.code} ${a.name}` : null, description: r.description, method: r.method, status: r.status, amountMinor: r.amountMinor, taxMinor: r.taxMinor, totalMinor: r.totalMinor };
    });
  },
};

const journalDs: Dataset = {
  key: "journal",
  label: "سطور قيود اليومية",
  description: "كل سطر قيد بحسابه ونوعه ومصدره (للتحليل المحاسبي)",
  icon: "lucide:book-open-check",
  group: "المالية",
  module: "accounting",
  idField: "id",
  title: (r) => `قيد ${r.entry} — ${r.account}`,
  fields: [
    { key: "date", label: "التاريخ", type: "date" },
    { key: "entry", label: "رقم القيد", type: "number" },
    { key: "description", label: "البيان", type: "string" },
    { key: "source", label: "المصدر", type: "enum", options: L.journalSource },
    { key: "accountCode", label: "رمز الحساب", type: "string" },
    { key: "account", label: "الحساب", type: "string" },
    { key: "accountType", label: "نوع الحساب", type: "enum", options: L.accountType },
    { key: "costCenter", label: "مركز التكلفة", type: "string" },
    { key: "debitMinor", label: "مدين", type: "money" },
    { key: "creditMinor", label: "دائن", type: "money" },
    { key: "netMinor", label: "الصافي (مدين − دائن)", type: "money" },
  ],
  async load(db) {
    const rows = await db.journalLine.findMany({ select: { id: true, debitMinor: true, creditMinor: true, costCenterId: true, account: { select: { code: true, name: true, type: true } }, entry: { select: { number: true, date: true, description: true, source: true } } }, orderBy: { entry: { date: "desc" } }, take: MAX });
    const centers = await db.costCenter.findMany({ select: { id: true, name: true } });
    return rows.map((l) => ({ id: l.id, date: iso(l.entry.date), entry: l.entry.number, description: l.entry.description, source: l.entry.source, accountCode: l.account.code, account: l.account.name, accountType: l.account.type, costCenter: centers.find((c) => c.id === l.costCenterId)?.name ?? null, debitMinor: n(l.debitMinor), creditMinor: n(l.creditMinor), netMinor: n(l.debitMinor) - n(l.creditMinor) }));
  },
};

const employeesDs: Dataset = {
  key: "employees",
  label: "الموظفون",
  description: "بيانات الموظفين وأقسامهم ومدد خدمتهم وانتهاء وثائقهم",
  icon: "lucide:id-card",
  group: "الموارد البشرية",
  module: "employees",
  idField: "id",
  userField: "userId",
  link: (r) => `/hr/employees/${r.id}`,
  title: (r) => String(r.fullName),
  fields: [
    { key: "number", label: "الرقم الوظيفي", type: "number" },
    { key: "fullName", label: "الاسم", type: "string" },
    { key: "gender", label: "الجنس", type: "enum", options: L.gender },
    { key: "nationality", label: "الجنسية", type: "string" },
    { key: "category", label: "الفئة", type: "enum", options: L.employeeCategory },
    { key: "department", label: "القسم", type: "string" },
    { key: "position", label: "المسمى", type: "string" },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "hireDate", label: "تاريخ المباشرة", type: "date" },
    { key: "yearsOfService", label: "سنوات الخدمة", type: "number" },
    { key: "status", label: "الحالة", type: "enum", options: L.employeeStatus },
    { key: "idExpiry", label: "انتهاء الهوية/الإقامة", type: "date" },
    { key: "passportExpiry", label: "انتهاء الجواز", type: "date" },
    { key: "contractEnd", label: "انتهاء العقد", type: "date" },
    { key: "basicMinor", label: "الراتب الأساسي", type: "money", module: "payroll" },
    { key: "grossMinor", label: "إجمالي الراتب الثابت", type: "money", module: "payroll" },
  ],
  async load(db, _s, ctx) {
    const rows = await db.employee.findMany({
      where: { deletedAt: null, ...("all" in ctx.scope ? {} : { branchId: { in: ctx.scope.branchIds } }) },
      select: { id: true, userId: true, number: true, fullName: true, gender: true, nationality: true, category: true, hireDate: true, status: true, idExpiry: true, passportExpiry: true, branchId: true, departmentId: true, positionId: true, contracts: { where: { status: "ACTIVE" }, take: 1, orderBy: { startDate: "desc" }, select: { endDate: true, basicMinor: true, housingMinor: true, transportMinor: true } } },
      orderBy: { number: "asc" },
      take: MAX,
    });
    const [deps, positions, branches] = await Promise.all([db.department.findMany({ select: { id: true, name: true } }), db.position.findMany({ select: { id: true, title: true } }), db.branch.findMany({ select: { id: true, name: true } })]);
    const pay = ctx.can("payroll");
    return rows.map((e) => {
      const c = e.contracts[0];
      return {
        id: e.id, userId: e.userId, number: e.number, fullName: e.fullName, gender: e.gender, nationality: nationalityName(e.nationality), category: e.category,
        department: deps.find((d) => d.id === e.departmentId)?.name ?? null, position: positions.find((p) => p.id === e.positionId)?.title ?? null, branch: branches.find((b) => b.id === e.branchId)?.name ?? null,
        hireDate: iso(e.hireDate), yearsOfService: Math.floor(days(iso(e.hireDate)!, ctx.today) / 365.25), status: e.status, idExpiry: iso(e.idExpiry), passportExpiry: iso(e.passportExpiry), contractEnd: iso(c?.endDate),
        basicMinor: pay ? (c?.basicMinor ?? null) : null, grossMinor: pay && c ? c.basicMinor + c.housingMinor + c.transportMinor : null,
      };
    });
  },
};

const staffAttendanceDs: Dataset = {
  key: "staff_attendance",
  label: "حضور الموظفين",
  description: "الحضور اليومي للموظفين بالتأخر والإضافي (آخر ١٢ شهراً)",
  icon: "lucide:clock",
  group: "الموارد البشرية",
  module: "hr_attendance",
  idField: "id",
  title: (r) => `${r.employee} — ${r.date}`,
  fields: [
    { key: "date", label: "التاريخ", type: "date" },
    { key: "employee", label: "الموظف", type: "string" },
    { key: "department", label: "القسم", type: "string" },
    { key: "status", label: "الحالة", type: "enum", options: L.staffAttendance },
    { key: "lateMinutes", label: "دقائق التأخر", type: "number" },
    { key: "earlyLeaveMinutes", label: "دقائق الخروج المبكر", type: "number" },
    { key: "overtimeMinutes", label: "دقائق الإضافي", type: "number" },
  ],
  async load(db, _s, ctx) {
    const since = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 365 * 86_400_000);
    const rows = await db.employeeAttendance.findMany({ where: { date: { gte: since }, employee: { deletedAt: null, ...("all" in ctx.scope ? {} : { branchId: { in: ctx.scope.branchIds } }) } }, select: { id: true, date: true, status: true, lateMinutes: true, earlyLeaveMinutes: true, overtimeMinutes: true, employee: { select: { fullName: true, departmentId: true } } }, orderBy: { date: "desc" }, take: MAX });
    const deps = await db.department.findMany({ select: { id: true, name: true } });
    return rows.map((a) => ({ id: a.id, date: iso(a.date), employee: a.employee.fullName, department: deps.find((d) => d.id === a.employee.departmentId)?.name ?? null, status: a.status, lateMinutes: a.lateMinutes, earlyLeaveMinutes: a.earlyLeaveMinutes, overtimeMinutes: a.overtimeMinutes }));
  },
};

const staffLeavesDs: Dataset = {
  key: "staff_leaves",
  label: "إجازات الموظفين",
  description: "طلبات الإجازة بأنواعها ومددها وحالاتها",
  icon: "lucide:plane",
  group: "الموارد البشرية",
  module: "hr_attendance",
  idField: "id",
  title: (r) => `${r.type} — ${r.employee}`,
  fields: [
    { key: "number", label: "رقم الطلب", type: "number" },
    { key: "employee", label: "الموظف", type: "string" },
    { key: "type", label: "نوع الإجازة", type: "string" },
    { key: "startDate", label: "من", type: "date" },
    { key: "endDate", label: "إلى", type: "date" },
    { key: "days", label: "الأيام", type: "number" },
    { key: "status", label: "الحالة", type: "enum", options: L.requestStatus },
  ],
  async load(db, _s, ctx) {
    const rows = await db.staffLeaveRequest.findMany({ where: { deletedAt: null, employee: { ...("all" in ctx.scope ? {} : { branchId: { in: ctx.scope.branchIds } }) } }, select: { id: true, number: true, startDate: true, endDate: true, days: true, status: true, leaveTypeId: true, employee: { select: { fullName: true } } }, orderBy: { number: "desc" }, take: MAX });
    const types = await db.leaveType.findMany({ select: { id: true, name: true } });
    return rows.map((r) => ({ id: r.id, number: r.number, employee: r.employee.fullName, type: types.find((t) => t.id === r.leaveTypeId)?.name ?? null, startDate: iso(r.startDate), endDate: iso(r.endDate), days: r.days, status: r.status }));
  },
};

const resultsDs: Dataset = {
  key: "term_results",
  label: "نتائج الطلاب",
  description: "معدل الفصل الدراسي الحالي والنتيجة والترتيب (من الدرجات المعتمدة)",
  icon: "lucide:award",
  group: "الأكاديمي",
  module: "gpa",
  idField: "studentId",
  studentField: "studentId",
  title: (r) => `${r.student} — ${r.term}`,
  fields: [
    { key: "student", label: "الطالب", type: "string" },
    { key: "academicNumber", label: "الرقم الأكاديمي", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "section", label: "الفصل", type: "string" },
    { key: "term", label: "الفصل الدراسي", type: "string" },
    { key: "averageBp", label: "المعدل", type: "percent" },
    { key: "result", label: "النتيجة", type: "enum", options: L.termResult },
    { key: "failedSubjects", label: "مواد دون حد النجاح", type: "number" },
    { key: "rankSection", label: "الترتيب في الفصل", type: "number" },
    { key: "rankGrade", label: "الترتيب في الصف", type: "number" },
  ],
  async load(db, session, ctx) {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
    if (!year) return [];
    const terms = await db.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" } });
    const term = terms.filter((t) => iso(t.startDate)! <= ctx.today).pop() ?? terms[0];
    if (!term) return [];
    const r = await computeTerm(db, session.tenant.id, term.id, { approvedOnly: true, where: studentCond(ctx.scope) });
    return r.rows.map((x) => ({
      studentId: x.student.id, student: x.student.fullName, academicNumber: x.student.academicNumber, grade: x.student.grade, section: x.student.section, term: term.name,
      averageBp: x.term.averageBp, result: x.term.result, failedSubjects: Object.values(x.subjects).filter((s) => s.bp !== null && s.bp < (r.schemes.get(x.student.stageId)?.passBp ?? 5000)).length, rankSection: x.rank.section, rankGrade: x.rank.grade,
    }));
  },
};

const admissionsDs: Dataset = {
  key: "admissions",
  label: "طلبات القبول",
  description: "طلبات الالتحاق بمراحلها ومصادرها ونتائج اختباراتها",
  icon: "lucide:user-plus",
  group: "الطلاب",
  module: "admissions",
  idField: "id",
  userField: "ownerId",
  link: (r) => `/admissions/${r.id}`,
  title: (r) => `طلب ${r.number} — ${r.fullName}`,
  fields: [
    { key: "number", label: "رقم الطلب", type: "number" },
    { key: "createdAt", label: "تاريخ التقديم", type: "date" },
    { key: "fullName", label: "اسم المتقدم", type: "string" },
    { key: "gender", label: "الجنس", type: "enum", options: L.gender },
    { key: "grade", label: "الصف المطلوب", type: "string" },
    { key: "branch", label: "الفرع", type: "string" },
    { key: "stage", label: "المرحلة", type: "enum", options: L.admissionStage },
    { key: "source", label: "المصدر", type: "string" },
    { key: "assessmentScore", label: "درجة الاختبار", type: "number" },
    { key: "daysOpen", label: "أيام منذ التقديم", type: "number" },
  ],
  async load(db, _s, ctx) {
    const rows = await db.admission.findMany({ where: { deletedAt: null, ...branchCond(ctx.scope) }, select: { id: true, number: true, createdAt: true, fullName: true, gender: true, stage: true, source: true, assessmentScore: true, ownerId: true, branch: { select: { name: true } }, requestedGrade: { select: { name: true } } }, orderBy: { number: "desc" }, take: MAX });
    return rows.map((a) => ({ id: a.id, ownerId: a.ownerId, number: a.number, createdAt: iso(a.createdAt), fullName: a.fullName, gender: a.gender, grade: a.requestedGrade?.name ?? null, branch: a.branch.name, stage: a.stage, source: a.source, assessmentScore: a.assessmentScore, daysOpen: days(iso(a.createdAt)!, ctx.today) }));
  },
};

const behaviorDs: Dataset = {
  key: "behavior",
  label: "السلوك",
  description: "الملاحظات السلوكية الإيجابية والسلبية بدرجاتها",
  icon: "lucide:heart-handshake",
  group: "الطلاب",
  module: "counseling",
  idField: "id",
  studentField: "studentId",
  title: (r) => `${r.category} — ${r.student}`,
  fields: [
    { key: "number", label: "الرقم", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "student", label: "الطالب", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "kind", label: "النوع", type: "enum", options: L.behaviorKind },
    { key: "category", label: "التصنيف", type: "string" },
    { key: "severity", label: "الشدة", type: "enum", options: L.severity },
    { key: "points", label: "النقاط", type: "number" },
    { key: "guardianNotified", label: "أُبلغ ولي الأمر", type: "boolean" },
  ],
  async load(db, _s, ctx) {
    const rows = await db.behaviorRecord.findMany({ where: { deletedAt: null, student: { ...studentCond(ctx.scope) } }, select: { id: true, number: true, occurredAt: true, kind: true, category: true, severity: true, points: true, guardianNotified: true, studentId: true, student: { select: { fullName: true, grade: { select: { name: true } } } } }, orderBy: { occurredAt: "desc" }, take: MAX });
    return rows.map((b) => ({ id: b.id, studentId: b.studentId, number: b.number, date: iso(b.occurredAt), student: b.student.fullName, grade: b.student.grade.name, kind: b.kind, category: b.category, severity: b.severity, points: b.points, guardianNotified: b.guardianNotified }));
  },
};

const libraryDs: Dataset = {
  key: "library_loans",
  label: "إعارات المكتبة",
  description: "الإعارات والإرجاع والتأخير والغرامات",
  icon: "lucide:library",
  group: "العمليات",
  module: "library",
  idField: "id",
  studentField: "studentId",
  title: (r) => `${r.book} — ${r.borrower}`,
  fields: [
    { key: "book", label: "الكتاب", type: "string" },
    { key: "barcode", label: "باركود النسخة", type: "string" },
    { key: "borrower", label: "المستعير", type: "string" },
    { key: "loanedAt", label: "تاريخ الإعارة", type: "date" },
    { key: "dueDate", label: "موعد الإرجاع", type: "date" },
    { key: "returnedAt", label: "تاريخ الإرجاع", type: "date" },
    { key: "open", label: "لم تُرجع بعد", type: "boolean" },
    { key: "overdueDays", label: "أيام التأخير", type: "number" },
    { key: "fineMinor", label: "الغرامة", type: "money" },
    { key: "fineStatus", label: "حالة الغرامة", type: "enum", options: L.fineStatus },
  ],
  async load(db) {
    const rows = await db.libraryLoan.findMany({ select: { id: true, studentId: true, borrowerName: true, loanedAt: true, dueDate: true, returnedAt: true, fineMinor: true, fineStatus: true, copy: { select: { barcode: true, book: { select: { title: true } } } } }, orderBy: { loanedAt: "desc" }, take: MAX });
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((l) => {
      const end = iso(l.returnedAt) ?? today;
      return { id: l.id, studentId: l.studentId, book: l.copy.book.title, barcode: l.copy.barcode, borrower: l.borrowerName, loanedAt: iso(l.loanedAt), dueDate: iso(l.dueDate), returnedAt: iso(l.returnedAt), open: !l.returnedAt, overdueDays: Math.max(0, days(iso(l.dueDate)!, end)), fineMinor: l.fineMinor, fineStatus: l.fineStatus };
    });
  },
};

const maintenanceDs: Dataset = {
  key: "maintenance",
  label: "بلاغات الصيانة",
  description: "البلاغات بتصنيفها وأولويتها ومدة إنجازها وتكلفتها",
  icon: "lucide:wrench",
  group: "العمليات",
  module: "maintenance",
  idField: "id",
  userField: "assigneeId",
  link: (r) => `/maintenance/${r.id}`,
  title: (r) => `بلاغ ${r.number} — ${r.title}`,
  fields: [
    { key: "number", label: "الرقم", type: "number" },
    { key: "title", label: "العنوان", type: "string" },
    { key: "category", label: "التصنيف", type: "enum", options: L.maintCategory },
    { key: "priority", label: "الأولوية", type: "enum", options: L.priority },
    { key: "status", label: "الحالة", type: "enum", options: L.maintStatus },
    { key: "createdAt", label: "تاريخ البلاغ", type: "date" },
    { key: "dueDate", label: "موعد الإنجاز", type: "date" },
    { key: "completedAt", label: "تاريخ الإنجاز", type: "date" },
    { key: "assignee", label: "الفني", type: "string" },
    { key: "hoursToComplete", label: "ساعات الإنجاز", type: "number" },
    { key: "costMinor", label: "التكلفة", type: "money" },
  ],
  async load(db, _s, ctx) {
    const rows = await db.maintenanceRequest.findMany({ where: { deletedAt: null, ...("all" in ctx.scope ? {} : { OR: [{ branchId: { in: ctx.scope.branchIds } }, { branchId: null }] }) }, select: { id: true, number: true, title: true, category: true, priority: true, status: true, createdAt: true, dueDate: true, completedAt: true, assigneeId: true, partsCostMinor: true, externalCostMinor: true }, orderBy: { number: "desc" }, take: MAX });
    const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.assigneeId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
    return rows.map((m) => ({ id: m.id, assigneeId: m.assigneeId, number: m.number, title: m.title, category: m.category, priority: m.priority, status: m.status, createdAt: iso(m.createdAt), dueDate: iso(m.dueDate), completedAt: iso(m.completedAt), assignee: users.find((u) => u.id === m.assigneeId)?.name ?? null, hoursToComplete: m.completedAt ? Math.round((m.completedAt.getTime() - m.createdAt.getTime()) / 3_600_000) : null, costMinor: m.partsCostMinor + m.externalCostMinor }));
  },
};

const inventoryDs: Dataset = {
  key: "inventory_items",
  label: "أصناف المخزون",
  description: "الأرصدة والقيم والحد الأدنى لكل صنف",
  icon: "lucide:package",
  group: "العمليات",
  module: "inventory",
  idField: "id",
  link: (r) => `/inventory/items/${r.id}`,
  title: (r) => `${r.name} (${r.sku})`,
  fields: [
    { key: "sku", label: "الرمز", type: "string" },
    { key: "name", label: "الصنف", type: "string" },
    { key: "category", label: "الفئة", type: "enum", options: L.itemCategory },
    { key: "unit", label: "الوحدة", type: "string" },
    { key: "onHandQty", label: "الرصيد", type: "number" },
    { key: "minQty", label: "الحد الأدنى", type: "number" },
    { key: "belowMin", label: "تحت الحد الأدنى", type: "boolean" },
    { key: "stockValueMinor", label: "قيمة المخزون", type: "money" },
    { key: "avgCostMinor", label: "متوسط التكلفة", type: "money" },
    { key: "salePriceMinor", label: "سعر البيع", type: "money" },
  ],
  async load(db) {
    const rows = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, sku: true, name: true, category: true, unit: true, onHandQty: true, minQty: true, stockValueMinor: true, salePriceMinor: true }, orderBy: { sku: "asc" }, take: MAX });
    return rows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, category: i.category, unit: i.unit, onHandQty: i.onHandQty, minQty: i.minQty, belowMin: i.minQty > 0 && i.onHandQty <= i.minQty, stockValueMinor: i.stockValueMinor, avgCostMinor: i.onHandQty ? Math.round(i.stockValueMinor / i.onHandQty) : 0, salePriceMinor: i.salePriceMinor }));
  },
};

const salesDs: Dataset = {
  key: "sales",
  label: "مبيعات المتجر والمقصف",
  description: "عمليات البيع بطرق الدفع والتكلفة والهامش",
  icon: "lucide:shopping-cart",
  group: "العمليات",
  module: "canteen",
  idField: "id",
  title: (r) => `بيع ${r.number}`,
  fields: [
    { key: "number", label: "الرقم", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "kind", label: "النقطة", type: "enum", options: L.saleKind },
    { key: "customer", label: "العميل", type: "string" },
    { key: "paymentMethod", label: "طريقة الدفع", type: "enum", options: L.salePay },
    { key: "status", label: "الحالة", type: "enum", options: L.saleStatus },
    { key: "totalMinor", label: "الإجمالي", type: "money" },
    { key: "taxMinor", label: "الضريبة", type: "money" },
    { key: "costMinor", label: "التكلفة", type: "money" },
    { key: "marginMinor", label: "مجمل الربح", type: "money" },
  ],
  async load(db) {
    const rows = await db.sale.findMany({ select: { id: true, number: true, date: true, kind: true, customerName: true, paymentMethod: true, status: true, totalMinor: true, taxMinor: true, costMinor: true }, orderBy: { number: "desc" }, take: MAX });
    return rows.map((s) => {
      const on = s.status === "COMPLETED";
      return { id: s.id, number: s.number, date: iso(s.date), kind: s.kind, customer: s.customerName, paymentMethod: s.paymentMethod, status: s.status, totalMinor: on ? s.totalMinor : 0, taxMinor: on ? s.taxMinor : 0, costMinor: on ? s.costMinor : 0, marginMinor: on ? s.totalMinor - s.taxMinor - s.costMinor : 0 };
    });
  },
};

const transportDs: Dataset = {
  key: "transport",
  label: "تسكين المواصلات",
  description: "الطلاب المسكنون على الخطوط والمحطات",
  icon: "lucide:bus",
  group: "العمليات",
  module: "transport",
  idField: "id",
  studentField: "studentId",
  title: (r) => `${r.student} — ${r.route}`,
  fields: [
    { key: "student", label: "الطالب", type: "string" },
    { key: "grade", label: "الصف", type: "string" },
    { key: "route", label: "الخط", type: "string" },
    { key: "stop", label: "المحطة", type: "string" },
    { key: "direction", label: "الاتجاه", type: "enum", options: L.direction },
    { key: "startDate", label: "من", type: "date" },
    { key: "endDate", label: "إلى", type: "date" },
    { key: "status", label: "الحالة", type: "enum", options: L.assignmentStatus },
  ],
  async load(db) {
    const rows = await db.transportAssignment.findMany({ select: { id: true, studentId: true, direction: true, startDate: true, endDate: true, status: true, stopId: true, route: { select: { name: true } } }, take: MAX });
    const [students, stops] = await Promise.all([db.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, grade: { select: { name: true } } } }), db.transportStop.findMany({ select: { id: true, name: true } })]);
    return rows.map((a) => {
      const s = students.find((x) => x.id === a.studentId);
      return { id: a.id, studentId: a.studentId, student: s?.fullName ?? null, grade: s?.grade.name ?? null, route: a.route.name, stop: stops.find((x) => x.id === a.stopId)?.name ?? null, direction: a.direction, startDate: iso(a.startDate), endDate: iso(a.endDate), status: a.status };
    });
  },
};

const visitorsDs: Dataset = {
  key: "visitors",
  label: "سجل الزوار",
  description: "الزوار بأغراض زياراتهم وأوقات الدخول والخروج",
  icon: "lucide:door-open",
  group: "العمليات",
  module: "safety",
  idField: "id",
  title: (r) => `زائر: ${r.name}`,
  fields: [
    { key: "number", label: "الرقم", type: "number" },
    { key: "name", label: "الزائر", type: "string" },
    { key: "company", label: "الجهة", type: "string" },
    { key: "purpose", label: "الغرض", type: "string" },
    { key: "host", label: "المضيف", type: "string" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "minutesInside", label: "مدة الزيارة (دقيقة)", type: "number" },
    { key: "status", label: "الحالة", type: "enum", options: L.visitorStatus },
  ],
  async load(db, _s, ctx) {
    const rows = await db.visitor.findMany({ where: { ...("all" in ctx.scope ? {} : { OR: [{ branchId: { in: ctx.scope.branchIds } }, { branchId: null }] }) }, select: { id: true, number: true, fullName: true, company: true, purpose: true, hostName: true, expectedAt: true, checkInAt: true, checkOutAt: true, createdAt: true }, orderBy: { number: "desc" }, take: MAX });
    return rows.map((v) => ({ id: v.id, number: v.number, name: v.fullName, company: v.company, purpose: v.purpose, host: v.hostName, date: iso(v.checkInAt ?? v.expectedAt ?? v.createdAt), minutesInside: v.checkInAt && v.checkOutAt ? Math.round((v.checkOutAt.getTime() - v.checkInAt.getTime()) / 60000) : null, status: v.checkOutAt ? "LEFT" : v.checkInAt ? "INSIDE" : "EXPECTED" }));
  },
};

export const DATASETS: Dataset[] = [studentsDs, attendanceDs, admissionsDs, behaviorDs, resultsDs, invoicesDs, receiptsDs, vouchersDs, journalDs, employeesDs, staffAttendanceDs, staffLeavesDs, maintenanceDs, inventoryDs, salesDs, libraryDs, transportDs, visitorsDs];
export const DATASET_MAP = new Map(DATASETS.map((d) => [d.key, d]));

/** الحقول المرئية للمستخدم في المجموعة (بعد استبعاد الحقول التي تتطلب صلاحية لا يملكها) */
export function visibleFields(ds: Dataset, session: SessionData): FieldDef[] {
  return ds.fields.filter((f) => !f.module || Boolean(resolveScope(session.access, f.module, "view")));
}

/** المجموعات المتاحة للمستخدم */
export function availableDatasets(session: SessionData) {
  return DATASETS.filter((d) => staffScope(session, d.module)).map((d) => ({ key: d.key, label: d.label, description: d.description, icon: d.icon, group: d.group, fields: visibleFields(d, session), hasStudent: Boolean(d.studentField), hasUser: Boolean(d.userField) }));
}

/** تحميل صفوف مجموعة ضمن نطاق المستخدم */
export async function loadDataset(db: TenantDb, session: SessionData, key: string, needKeys?: string[]) {
  const ds = DATASET_MAP.get(key);
  if (!ds) throw forbidden("مجموعة البيانات غير معروفة");
  const scope = staffScope(session, ds.module);
  if (!scope) throw forbidden(`لا تملك صلاحية الاطلاع على «${ds.label}»`);
  const fields = visibleFields(ds, session);
  const need = needKeys ? new Set(needKeys) : null;
  const rows = await ds.load(db, session, {
    today: todayIso(session),
    scope,
    need: (k) => !need || need.has(k),
    can: (m) => Boolean(resolveScope(session.access, m, "view")),
  });
  // إسقاط الحقول المقيّدة بصلاحية لا يملكها المستخدم من الصفوف نفسها
  const hidden = ds.fields.filter((f) => !fields.includes(f)).map((f) => f.key);
  if (hidden.length) for (const r of rows) for (const k of hidden) delete r[k];
  return { ds, fields, rows };
}
