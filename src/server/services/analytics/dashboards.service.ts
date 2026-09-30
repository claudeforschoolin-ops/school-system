/**
 * لوحات التحكم: مدير المدرسة، المالية، الأكاديمية، الموارد البشرية، العمليات.
 * ---------------------------------------------------------------------
 * كل مؤشر يُقارن بفترة سابقة مسمّاة: «حتى اليوم من الشهر» مقابل الأيام نفسها من الشهر الماضي،
 * والقيم اللحظية مقابل نهاية الشهر الماضي، وحضور اليوم مقابل متوسط الأيام الدراسية السبعة السابقة.
 * تظهر لكل مستخدم أقسام الوحدات التي يملك صلاحيتها فقط، ومحدّد الفرع يقيّد ما يقبل التقييد بالفرع.
 */
import { addMonths } from "@/lib/analytics/metrics";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden } from "@/server/errors";
import { computeTerm } from "@/server/services/assessment/results.service";
import { assessmentSettings } from "@/server/services/assessment/common";
import { displayStatus, todayIso } from "@/server/services/finance/common";
import { computeMetric, series } from "./metrics.service";

type Unit = "count" | "money" | "bp" | "minutes";
export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  compareLabel: string | null;
  unit: Unit;
  higherIsBetter: boolean;
  href?: string;
  hint?: string;
  /** سلسلة صغيرة (١٢ نقطة) لخط الاتجاه */
  spark?: Array<number | null>;
}

const DAY = 86_400_000;
const d0 = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

function hasBroad(session: SessionData, module: string) {
  const s = resolveScope(session.access, module, "view");
  return Boolean(s && (s.kind === "all" || s.branchIds.length || s.stageIds.length));
}

/** الفروع المسموحة للوحات: null = كل المدرسة؛ ومع اختيار فرع يُقيَّد به ضمن المسموح */
function branchFilter(session: SessionData, branchId?: string | null): string[] | null {
  const s = resolveScope(session.access, "dashboards", "view");
  if (!s) throw forbidden("ليست لديك صلاحية لوحات التحكم");
  const allowed = s.kind === "all" ? null : s.branchIds;
  if (branchId) {
    if (allowed && !allowed.includes(branchId)) throw forbidden("الفرع خارج نطاقك");
    return [branchId];
  }
  return allowed;
}

const inBranch = (ids: string[] | null) => (ids ? { branchId: { in: ids } } : {});

/** نطاقات المقارنة: من أول الشهر حتى اليوم، والأيام نفسها من الشهر الماضي */
function mtd(today: string) {
  const from = d0(`${today.slice(0, 7)}-01`);
  const to = new Date(d0(today).getTime() + DAY - 1);
  const prevMonth = addMonths(today.slice(0, 7), -1);
  const prevFrom = d0(`${prevMonth}-01`);
  const dayOfMonth = Number(today.slice(8, 10));
  const prevLastDay = new Date(Date.UTC(Number(prevMonth.slice(0, 4)), Number(prevMonth.slice(5, 7)), 0)).getUTCDate();
  const prevTo = new Date(d0(`${prevMonth}-${String(Math.min(dayOfMonth, prevLastDay)).padStart(2, "0")}`).getTime() + DAY - 1);
  return { from, to, prevFrom, prevTo, label: "الفترة نفسها من الشهر الماضي" };
}

async function sparkOf(db: TenantDb, session: SessionData, key: string) {
  const current = todayIso(session).slice(0, 7);
  return (await series(db, session, key, Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11)))).map((s) => s.value);
}

// ---------------------------------------------------------------------
// لبنات مشتركة
// ---------------------------------------------------------------------

async function attendanceDays(db: TenantDb, branchIds: string[] | null, from: Date, to: Date) {
  const rows = await db.attendance.groupBy({ by: ["date", "status"], where: { period: 0, date: { gte: from, lte: to }, ...inBranch(branchIds) }, _count: true });
  const byDay = new Map<string, { total: number; present: number; absent: number; late: number }>();
  for (const r of rows) {
    const k = iso(r.date);
    const e = byDay.get(k) ?? { total: 0, present: 0, absent: 0, late: 0 };
    e.total += r._count;
    if (r.status === "PRESENT" || r.status === "LATE" || r.status === "PERMISSION") e.present += r._count;
    if (r.status === "ABSENT" || r.status === "EXCUSED") e.absent += r._count;
    if (r.status === "LATE") e.late += r._count;
    byDay.set(k, e);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({ date, ...e, rateBp: e.total ? Math.round((e.present / e.total) * 10000) : 0 }));
}

async function sumReceipts(db: TenantDb, branchIds: string[] | null, from: Date, to: Date) {
  return (await db.receipt.aggregate({ where: { status: "POSTED", NOT: { chequeStatus: "BOUNCED" }, date: { gte: from, lte: to }, ...inBranch(branchIds) }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;
}

async function glTotals(db: TenantDb, from: Date, to: Date) {
  const lines = await db.journalLine.groupBy({ by: ["accountId"], where: { entry: { date: { gte: from, lte: to }, source: { not: "CLOSING" } } }, _sum: { debitMinor: true, creditMinor: true } });
  const accounts = await db.account.findMany({ where: { id: { in: lines.map((l) => l.accountId) } }, select: { id: true, type: true, cashFlowGroup: true } });
  let revenue = 0;
  let expenses = 0;
  for (const l of lines) {
    const t = accounts.find((a) => a.id === l.accountId)?.type;
    if (t === "REVENUE") revenue += n(l._sum.creditMinor) - n(l._sum.debitMinor);
    if (t === "EXPENSE") expenses += n(l._sum.debitMinor) - n(l._sum.creditMinor);
  }
  return { revenue, expenses };
}

/** طلاب غابوا ٣ أيام أو أكثر من آخر ٥ أيام دراسية */
async function repeatedAbsence(db: TenantDb, branchIds: string[] | null, today: string) {
  const days = await db.attendance.findMany({ where: { period: 0, date: { lte: d0(today), gte: new Date(d0(today).getTime() - 21 * DAY) }, ...inBranch(branchIds) }, distinct: ["date"], select: { date: true }, orderBy: { date: "desc" }, take: 5 });
  if (!days.length) return [];
  const rows = await db.attendance.groupBy({ by: ["studentId"], where: { period: 0, status: "ABSENT", date: { in: days.map((d) => d.date) }, ...inBranch(branchIds) }, _count: true, having: { studentId: { _count: { gte: 3 } } } });
  const students = await db.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, grade: { select: { name: true } }, section: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.studentId, name: students.find((s) => s.id === r.studentId)?.fullName ?? "", grade: `${students.find((s) => s.id === r.studentId)?.grade.name ?? ""} ${students.find((s) => s.id === r.studentId)?.section?.name ?? ""}`.trim(), days: r._count })).sort((a, b) => b.days - a.days);
}

// ---------------------------------------------------------------------
// لوحة مدير المدرسة
// ---------------------------------------------------------------------

export async function principalDashboard(db: TenantDb, session: SessionData, input: { branchId?: string | null }) {
  const branchIds = branchFilter(session, input.branchId);
  const today = todayIso(session);
  const p = mtd(today);
  const kpis: Kpi[] = [];
  const out: {
    byGrade?: Array<{ key: string; label: string; value: number }>;
    attendanceDays?: Awaited<ReturnType<typeof attendanceDays>>;
    repeatedAbsence?: Awaited<ReturnType<typeof repeatedAbsence>>;
    academic?: Awaited<ReturnType<typeof academicSummary>>;
    alerts?: Awaited<ReturnType<typeof alerts>>;
  } = {};

  if (hasBroad(session, "students")) {
    const active = await db.student.count({ where: { deletedAt: null, status: "ACTIVE", ...inBranch(branchIds) } });
    const prevEnd = new Date(p.from.getTime() - 1);
    const prev = await db.student.count({ where: { deletedAt: null, status: "ACTIVE", enrollmentDate: { lte: prevEnd }, ...inBranch(branchIds) } });
    kpis.push({ key: "students", label: "الطلاب المنتظمون", value: active, previous: prev, compareLabel: "نهاية الشهر الماضي", unit: "count", higherIsBetter: true, href: "/students", spark: branchIds ? undefined : await sparkOf(db, session, "students_active") });
    const byGrade = await db.student.groupBy({ by: ["gradeId"], where: { deletedAt: null, status: "ACTIVE", ...inBranch(branchIds) }, _count: true });
    const grades = await db.grade.findMany({ where: { id: { in: byGrade.map((g) => g.gradeId) } }, select: { id: true, name: true, order: true, stage: { select: { order: true } } }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });
    out.byGrade = grades.map((g) => ({ key: g.id, label: g.name, value: byGrade.find((x) => x.gradeId === g.id)?._count ?? 0 }));
  }
  if (hasBroad(session, "attendance")) {
    const days = await attendanceDays(db, branchIds, new Date(d0(today).getTime() - 30 * DAY), d0(today));
    const todayRow = days.find((d) => d.date === today) ?? null;
    const before = days.filter((d) => d.date < today).slice(-7);
    const avg = before.length ? Math.round(before.reduce((s, d) => s + d.rateBp, 0) / before.length) : null;
    kpis.push({ key: "attendance", label: "حضور اليوم", value: todayRow?.rateBp ?? null, previous: avg, compareLabel: "متوسط الأيام الدراسية السبعة السابقة", unit: "bp", higherIsBetter: true, href: "/attendance", hint: todayRow ? `${todayRow.absent} غائب · ${todayRow.late} متأخر` : "لم يُرصد حضور اليوم بعد" });
    out.attendanceDays = days.slice(-14);
    out.repeatedAbsence = (await repeatedAbsence(db, branchIds, today)).slice(0, 8);
  }
  if (hasBroad(session, "finance_reports")) {
    const [cur, prev] = await Promise.all([sumReceipts(db, branchIds, p.from, p.to), sumReceipts(db, branchIds, p.prevFrom, p.prevTo)]);
    kpis.push({ key: "collected", label: "تحصيل الشهر", value: cur, previous: prev, compareLabel: p.label, unit: "money", higherIsBetter: true, href: "/finance", spark: branchIds ? undefined : await sparkOf(db, session, "collected") });
    const [gl, glPrev] = await Promise.all([glTotals(db, p.from, p.to), glTotals(db, p.prevFrom, p.prevTo)]);
    kpis.push({ key: "expenses", label: "مصروفات الشهر", value: gl.expenses, previous: glPrev.expenses, compareLabel: p.label, unit: "money", higherIsBetter: false, href: "/finance/reports", hint: "على مستوى المدرسة", spark: await sparkOf(db, session, "expenses") });
  }
  if (hasBroad(session, "admissions")) {
    const [cur, prev] = await Promise.all([db.admission.count({ where: { deletedAt: null, createdAt: { gte: p.from, lte: p.to }, ...inBranch(branchIds) } }), db.admission.count({ where: { deletedAt: null, createdAt: { gte: p.prevFrom, lte: p.prevTo }, ...inBranch(branchIds) } })]);
    kpis.push({ key: "applications", label: "طلبات قبول جديدة", value: cur, previous: prev, compareLabel: p.label, unit: "count", higherIsBetter: true, href: "/admissions" });
  }
  if (hasBroad(session, "gpa")) out.academic = await academicSummary(db, session, branchIds);
  if (out.academic) {
    const a = out.academic;
    kpis.push({ key: "average", label: "متوسط التحصيل", value: a?.averageBp ?? null, previous: null, compareLabel: null, unit: "bp", higherIsBetter: true, href: "/assessment/stats", hint: a ? `${a.term} · ${a.atRisk} طالباً دون الحد` : "لا درجات معتمدة بعد" });
  }
  const myRoles = (await db.userRole.findMany({ where: { userId: session.user.id }, select: { roleId: true } })).map((r) => r.roleId);
  const pending = await db.approvalStep.count({ where: { status: "PENDING", request: { status: "PENDING" }, OR: [{ approverUserId: session.user.id }, { approverRoleId: { in: myRoles } }] } });
  kpis.push({ key: "approvals", label: "موافقات بانتظاري", value: pending, previous: null, compareLabel: null, unit: "count", higherIsBetter: false, href: "/inbox?tab=approvals" });

  out.alerts = await alerts(db, session, branchIds, today);
  return { kpis, ...out, today };
}

async function academicSummary(db: TenantDb, session: SessionData, branchIds: string[] | null) {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return null;
  const today = todayIso(session);
  const terms = await db.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" } });
  const term = terms.filter((t) => iso(t.startDate) <= today).pop() ?? terms[0];
  if (!term) return null;
  const r = await computeTerm(db, session.tenant.id, term.id, { approvedOnly: true, where: branchIds ? { branchId: { in: branchIds } } : undefined });
  const settings = assessmentSettings(session);
  const rows = r.rows.filter((x) => x.term.averageBp !== null);
  const avg = rows.length ? Math.round(rows.reduce((s, x) => s + (x.term.averageBp ?? 0), 0) / rows.length) : null;
  const byGrade = new Map<string, number[]>();
  for (const x of rows) byGrade.set(x.student.grade, [...(byGrade.get(x.student.grade) ?? []), x.term.averageBp!]);
  const subjects = r.subjects.map((s) => {
    const vals = r.rows.map((x) => x.subjects[s.id]?.bp).filter((v): v is number => v !== null && v !== undefined);
    return { key: s.id, label: s.name, value: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, n: vals.length };
  }).filter((s): s is { key: string; label: string; value: number; n: number } => s.value !== null && s.n >= 5);
  const results = { PASS: 0, SECOND_ROUND: 0, FAIL: 0, INCOMPLETE: 0 } as Record<string, number>;
  for (const x of r.rows) results[x.term.result] = (results[x.term.result] ?? 0) + 1;
  return {
    term: term.name,
    averageBp: avg,
    students: r.rows.length,
    graded: rows.length,
    atRisk: rows.filter((x) => (x.term.averageBp ?? 0) < settings.atRiskBp).length,
    atRiskBp: settings.atRiskBp,
    passRateBp: rows.length ? Math.round(((results.PASS ?? 0) / rows.length) * 10000) : null,
    byGrade: [...byGrade.entries()].map(([label, v]) => ({ key: label, label, value: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })),
    subjects: subjects.sort((a, b) => a.value - b.value),
    results,
  };
}

async function alerts(db: TenantDb, session: SessionData, branchIds: string[] | null, today: string) {
  const out: Array<{ key: string; tone: "danger" | "warning" | "info"; title: string; detail: string; href: string }> = [];
  if (hasBroad(session, "invoices")) {
    const t = d0(today);
    const open = await db.invoice.findMany({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIAL"] }, ...inBranch(branchIds) }, select: { status: true, dueDate: true, totalMinor: true, paidMinor: true, creditedMinor: true, installments: { select: { dueDate: true, amountMinor: true, paidMinor: true } } } });
    const late30 = open.filter((i) => displayStatus(i, new Date(t.getTime() - 30 * DAY)) === "OVERDUE");
    if (late30.length) out.push({ key: "overdue30", tone: "danger", title: `${late30.length} فاتورة متأخرة أكثر من ٣٠ يوماً`, detail: "راجع التذكيرات وخطط التقسيط مع الأسر", href: "/finance/invoices?status=OVERDUE" });
  }
  if (hasBroad(session, "employees")) {
    const soon = new Date(d0(today).getTime() + 30 * DAY);
    const docs = await db.employee.count({ where: { deletedAt: null, status: { not: "TERMINATED" }, OR: [{ idExpiry: { lte: soon } }, { passportExpiry: { lte: soon } }], ...inBranch(branchIds) } });
    if (docs) out.push({ key: "docs", tone: "warning", title: `${docs} موظفاً تنتهي وثائقهم خلال ٣٠ يوماً`, detail: "الهوية/الإقامة أو الجواز", href: "/hr/employees/alerts" });
  }
  if (hasBroad(session, "inventory")) {
    const items = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true, minQty: { gt: 0 } }, select: { onHandQty: true, minQty: true } });
    const low = items.filter((i) => i.onHandQty <= i.minQty).length;
    if (low) out.push({ key: "stock", tone: "warning", title: `${low} صنفاً تحت الحد الأدنى`, detail: "أنشئ طلب شراء قبل النفاد", href: "/inventory" });
  }
  const overdueSteps = await db.approvalStep.count({ where: { status: "PENDING", request: { status: "PENDING" }, dueHours: { not: null }, escalatedAt: { not: null } } });
  if (overdueSteps && resolveScope(session.access, "workflows", "view")) out.push({ key: "sla", tone: "danger", title: `${overdueSteps} موافقة تجاوزت مهلتها وصُعّدت`, detail: "من مراقبة مسارات الموافقة", href: "/workflows/monitor" });
  if (hasBroad(session, "maintenance")) {
    const urgent = await db.maintenanceRequest.count({ where: { deletedAt: null, priority: "URGENT", status: { in: ["NEW", "IN_PROGRESS", "WAITING_PARTS"] } } });
    if (urgent) out.push({ key: "maint", tone: "danger", title: `${urgent} بلاغ صيانة عاجل مفتوح`, detail: "لوحة البلاغات", href: "/maintenance" });
  }
  return out;
}

// ---------------------------------------------------------------------
// اللوحة المالية
// ---------------------------------------------------------------------

export async function financeBoard(db: TenantDb, session: SessionData, input: { branchId?: string | null }) {
  const branchIds = branchFilter(session, input.branchId);
  if (!hasBroad(session, "finance_reports")) throw forbidden("اللوحة المالية لمن يملك صلاحية التقارير المالية");
  const today = todayIso(session);
  const p = mtd(today);
  const t = d0(today);
  const [cur, prev] = await Promise.all([sumReceipts(db, branchIds, p.from, p.to), sumReceipts(db, branchIds, p.prevFrom, p.prevTo)]);
  const [billed, billedPrev] = await Promise.all(
    [[p.from, p.to], [p.prevFrom, p.prevTo]].map(async ([f, to]) => (await db.invoice.aggregate({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIAL", "PAID"] }, issueDate: { gte: f, lte: to }, ...inBranch(branchIds) }, _sum: { totalMinor: true } }))._sum.totalMinor ?? 0),
  );
  const open = await db.invoice.findMany({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIAL"] }, ...inBranch(branchIds) }, select: { status: true, dueDate: true, totalMinor: true, paidMinor: true, creditedMinor: true, installments: { select: { dueDate: true, amountMinor: true, paidMinor: true } } } });
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  let receivable = 0;
  for (const i of open) {
    const bal = i.totalMinor - i.paidMinor - i.creditedMinor;
    receivable += bal;
    const parts = i.installments.length ? i.installments.map((x) => ({ due: x.dueDate, amt: x.amountMinor - x.paidMinor })) : [{ due: i.dueDate, amt: bal }];
    for (const x of parts) {
      if (x.amt <= 0) continue;
      const late = Math.floor((t.getTime() - x.due.getTime()) / DAY);
      if (late <= 0) aging.current += x.amt;
      else if (late <= 30) aging.d30 += x.amt;
      else if (late <= 60) aging.d60 += x.amt;
      else if (late <= 90) aging.d90 += x.amt;
      else aging.d90p += x.amt;
    }
  }
  const [gl, glPrev] = await Promise.all([glTotals(db, p.from, p.to), glTotals(db, p.prevFrom, p.prevTo)]);
  const methods = await db.receipt.groupBy({ by: ["method"], where: { status: "POSTED", date: { gte: p.from, lte: p.to }, ...inBranch(branchIds) }, _sum: { amountMinor: true } });
  const current = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11));
  const [rev, exp] = await Promise.all([series(db, session, "revenue", months), series(db, session, "expenses", months)]);
  const overdue = aging.d30 + aging.d60 + aging.d90 + aging.d90p;
  const kpis: Kpi[] = [
    { key: "collected", label: "تحصيل الشهر", value: cur, previous: prev, compareLabel: p.label, unit: "money", higherIsBetter: true, href: "/finance/collect", spark: branchIds ? undefined : await sparkOf(db, session, "collected") },
    { key: "billed", label: "فوترة الشهر", value: billed ?? 0, previous: billedPrev ?? 0, compareLabel: p.label, unit: "money", higherIsBetter: true, href: "/finance/invoices" },
    { key: "receivable", label: "الذمم المفتوحة", value: receivable, previous: null, compareLabel: null, unit: "money", higherIsBetter: false, href: "/finance/invoices", hint: `${open.length} فاتورة` },
    { key: "overdue", label: "المتأخر سداده", value: overdue, previous: null, compareLabel: null, unit: "money", higherIsBetter: false, href: "/finance/invoices?status=OVERDUE", hint: receivable ? `${Math.round((overdue / receivable) * 100)}٪ من الذمم` : undefined },
    { key: "revenue", label: "إيرادات الشهر", value: gl.revenue, previous: glPrev.revenue, compareLabel: p.label, unit: "money", higherIsBetter: true, hint: "من دفتر اليومية", spark: await sparkOf(db, session, "revenue") },
    { key: "expenses", label: "مصروفات الشهر", value: gl.expenses, previous: glPrev.expenses, compareLabel: p.label, unit: "money", higherIsBetter: false, spark: await sparkOf(db, session, "expenses") },
  ];
  return {
    kpis,
    aging: [
      { key: "current", label: "غير مستحق بعد", value: aging.current },
      { key: "d30", label: "١–٣٠ يوماً", value: aging.d30 },
      { key: "d60", label: "٣١–٦٠ يوماً", value: aging.d60 },
      { key: "d90", label: "٦١–٩٠ يوماً", value: aging.d90 },
      { key: "d90p", label: "أكثر من ٩٠ يوماً", value: aging.d90p },
    ],
    methods: methods.map((m) => ({ key: m.method, value: m._sum.amountMinor ?? 0 })).sort((a, b) => b.value - a.value),
    trend: { months, revenue: rev.map((r) => r.value), expenses: exp.map((r) => r.value), sources: rev.map((r) => r.source) },
    today,
  };
}

// ---------------------------------------------------------------------
// اللوحة الأكاديمية
// ---------------------------------------------------------------------

export async function academicBoard(db: TenantDb, session: SessionData, input: { branchId?: string | null }) {
  const branchIds = branchFilter(session, input.branchId);
  const today = todayIso(session);
  const p = mtd(today);
  const kpis: Kpi[] = [];
  const summary = hasBroad(session, "gpa") ? await academicSummary(db, session, branchIds) : null;
  if (summary) {
    kpis.push({ key: "average", label: "متوسط التحصيل", value: summary.averageBp, previous: null, compareLabel: null, unit: "bp", higherIsBetter: true, href: "/assessment/results", hint: `${summary.term} · ${summary.graded} طالباً برصد معتمد` });
    kpis.push({ key: "pass", label: "نسبة النجاح", value: summary.passRateBp, previous: null, compareLabel: null, unit: "bp", higherIsBetter: true, href: "/assessment/stats" });
    kpis.push({ key: "atRisk", label: "طلاب دون الحد", value: summary.atRisk, previous: null, compareLabel: null, unit: "count", higherIsBetter: false, href: "/assessment/stats", hint: `المعدل أقل من ${Math.round(summary.atRiskBp / 100)}٪` });
  }
  let attendanceByGrade: Array<{ key: string; label: string; value: number }> = [];
  if (hasBroad(session, "attendance")) {
    const [cur, prev] = await Promise.all([attendanceDays(db, branchIds, p.from, p.to), attendanceDays(db, branchIds, p.prevFrom, p.prevTo)]);
    const rate = (d: typeof cur) => {
      const t = d.reduce((s, x) => s + x.total, 0);
      return t ? Math.round((d.reduce((s, x) => s + x.present, 0) / t) * 10000) : null;
    };
    kpis.push({ key: "attendance", label: "نسبة الحضور هذا الشهر", value: rate(cur), previous: rate(prev), compareLabel: p.label, unit: "bp", higherIsBetter: true, href: "/attendance" });
    const rows = await db.attendance.findMany({ where: { period: 0, date: { gte: p.from, lte: p.to }, ...inBranch(branchIds) }, select: { status: true, student: { select: { grade: { select: { name: true, order: true, stage: { select: { order: true } } } } } } } });
    const g = new Map<string, { t: number; p: number; o: number }>();
    for (const r of rows) {
      const k = r.student.grade.name;
      const e = g.get(k) ?? { t: 0, p: 0, o: r.student.grade.stage.order * 100 + r.student.grade.order };
      e.t++;
      if (r.status === "PRESENT" || r.status === "LATE" || r.status === "PERMISSION") e.p++;
      g.set(k, e);
    }
    attendanceByGrade = [...g.entries()].sort((a, b) => a[1].o - b[1].o).map(([label, e]) => ({ key: label, label, value: Math.round((e.p / e.t) * 10000) }));
  }
  let behavior: { positive: number; negative: number; prevNegative: number } | null = null;
  if (hasBroad(session, "counseling")) {
    const where = (f: Date, to: Date, kind: "POSITIVE" | "NEGATIVE") => db.behaviorRecord.count({ where: { deletedAt: null, kind, occurredAt: { gte: f, lte: to }, ...inBranch(branchIds) } });
    const [pos, neg, prevNeg] = await Promise.all([where(p.from, p.to, "POSITIVE"), where(p.from, p.to, "NEGATIVE"), where(p.prevFrom, p.prevTo, "NEGATIVE")]);
    behavior = { positive: pos, negative: neg, prevNegative: prevNeg };
    kpis.push({ key: "behavior", label: "ملاحظات سلوكية سلبية", value: neg, previous: prevNeg, compareLabel: p.label, unit: "count", higherIsBetter: false, href: "/behavior", hint: `${pos} ملاحظة إيجابية` });
  }
  return { kpis, summary, attendanceByGrade, behavior, today };
}

// ---------------------------------------------------------------------
// لوحة الموارد البشرية
// ---------------------------------------------------------------------

export async function hrBoard(db: TenantDb, session: SessionData, input: { branchId?: string | null }) {
  const branchIds = branchFilter(session, input.branchId);
  if (!hasBroad(session, "employees")) throw forbidden("لوحة الموارد البشرية لمن يملك صلاحية الموظفين");
  const today = todayIso(session);
  const p = mtd(today);
  const t = d0(today);
  const empWhere = { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] as Array<"ACTIVE" | "ON_LEAVE"> }, ...inBranch(branchIds) };
  const [headcount, prevHead, byDept, byCat, terminatedYtd] = await Promise.all([
    db.employee.count({ where: empWhere }),
    db.employee.count({ where: { deletedAt: null, hireDate: { lt: p.from }, OR: [{ status: { in: ["ACTIVE", "ON_LEAVE"] } }, { terminationDate: { gte: p.from } }], ...inBranch(branchIds) } }),
    db.employee.groupBy({ by: ["departmentId"], where: empWhere, _count: true }),
    db.employee.groupBy({ by: ["category"], where: empWhere, _count: true }),
    db.employee.count({ where: { deletedAt: null, terminationDate: { gte: d0(`${today.slice(0, 4)}-01-01`), lte: t }, ...inBranch(branchIds) } }),
  ]);
  const deps = await db.department.findMany({ select: { id: true, name: true } });
  const kpis: Kpi[] = [{ key: "headcount", label: "الموظفون على رأس العمل", value: headcount, previous: prevHead, compareLabel: "بداية الشهر", unit: "count", higherIsBetter: true, href: "/hr/employees", hint: `${terminatedYtd} انتهت خدمتهم هذه السنة` }];
  let attendance14: Array<{ date: string; rateBp: number }> = [];
  if (hasBroad(session, "hr_attendance")) {
    const agg = async (f: Date, to: Date) => db.employeeAttendance.groupBy({ by: ["status"], where: { date: { gte: f, lte: to }, employee: inBranch(branchIds) }, _count: true, _sum: { lateMinutes: true } });
    const [todayRows, cur, prev] = await Promise.all([agg(t, t), agg(p.from, p.to), agg(p.prevFrom, p.prevTo)]);
    const rate = (rows: typeof cur) => {
      const worked = rows.filter((r) => ["PRESENT", "LATE", "ABSENT"].includes(r.status));
      const tot = worked.reduce((s, r) => s + r._count, 0);
      return tot ? Math.round((worked.filter((r) => r.status !== "ABSENT").reduce((s, r) => s + r._count, 0) / tot) * 10000) : null;
    };
    const late = (rows: typeof cur) => rows.reduce((s, r) => s + (r._sum.lateMinutes ?? 0), 0);
    const pendingLeaves = await db.staffLeaveRequest.count({ where: { deletedAt: null, status: "PENDING", employee: inBranch(branchIds) } });
    kpis.push({ key: "attendanceToday", label: "حضور الموظفين اليوم", value: rate(todayRows), previous: rate(cur), compareLabel: "متوسط الشهر", unit: "bp", higherIsBetter: true, href: "/hr/attendance" });
    kpis.push({ key: "late", label: "دقائق التأخر هذا الشهر", value: late(cur), previous: late(prev), compareLabel: p.label, unit: "minutes", higherIsBetter: false, href: "/hr/attendance/month" });
    kpis.push({ key: "leaves", label: "إجازات بانتظار الموافقة", value: pendingLeaves, previous: null, compareLabel: null, unit: "count", higherIsBetter: false, href: "/hr/attendance/leaves" });
    const days = await db.employeeAttendance.groupBy({ by: ["date", "status"], where: { date: { gte: new Date(t.getTime() - 30 * DAY), lte: t }, status: { in: ["PRESENT", "LATE", "ABSENT"] }, employee: inBranch(branchIds) }, _count: true });
    const m = new Map<string, { t: number; p: number }>();
    for (const r of days) {
      const k = iso(r.date);
      const e = m.get(k) ?? { t: 0, p: 0 };
      e.t += r._count;
      if (r.status !== "ABSENT") e.p += r._count;
      m.set(k, e);
    }
    attendance14 = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, e]) => ({ date, rateBp: Math.round((e.p / e.t) * 10000) }));
  }
  const soon = new Date(t.getTime() + 60 * DAY);
  const expiring = await db.employee.count({ where: { ...empWhere, OR: [{ idExpiry: { lte: soon } }, { passportExpiry: { lte: soon } }] } });
  kpis.push({ key: "docs", label: "وثائق تنتهي خلال ٦٠ يوماً", value: expiring, previous: null, compareLabel: null, unit: "count", higherIsBetter: false, href: "/hr/employees/alerts" });
  let payroll: Array<{ month: string; grossMinor: number }> = [];
  if (hasBroad(session, "payroll")) {
    const runs = await db.payrollRun.findMany({ where: { status: { in: ["APPROVED", "PAID"] } }, orderBy: { month: "desc" }, take: 2 });
    const [last, before] = runs;
    kpis.push({ key: "payroll", label: "تكلفة آخر مسير", value: last?.grossMinor ?? null, previous: before?.grossMinor ?? null, compareLabel: "المسير السابق", unit: "money", higherIsBetter: false, href: "/hr/payroll", hint: last ? `مسير ${last.month} · ${last.employees} موظفاً` : "لا مسير معتمد", spark: await sparkOf(db, session, "payroll_cost") });
    payroll = runs.map((r) => ({ month: r.month, grossMinor: r.grossMinor }));
  }
  return {
    kpis,
    byDepartment: byDept.map((d) => ({ key: d.departmentId ?? "none", label: deps.find((x) => x.id === d.departmentId)?.name ?? "بلا قسم", value: d._count })).sort((a, b) => b.value - a.value),
    byCategory: byCat.map((c) => ({ key: c.category, value: c._count })),
    attendance14,
    payroll,
    today,
  };
}

// ---------------------------------------------------------------------
// لوحة العمليات
// ---------------------------------------------------------------------

export async function operationsBoard(db: TenantDb, session: SessionData, input: { branchId?: string | null }) {
  branchFilter(session, input.branchId);
  const today = todayIso(session);
  const p = mtd(today);
  const kpis: Kpi[] = [];
  if (hasBroad(session, "maintenance")) {
    const [open, urgent, doneMonth, donePrev] = await Promise.all([
      db.maintenanceRequest.count({ where: { deletedAt: null, status: { in: ["NEW", "IN_PROGRESS", "WAITING_PARTS"] } } }),
      db.maintenanceRequest.count({ where: { deletedAt: null, priority: "URGENT", status: { in: ["NEW", "IN_PROGRESS", "WAITING_PARTS"] } } }),
      db.maintenanceRequest.count({ where: { deletedAt: null, completedAt: { gte: p.from, lte: p.to } } }),
      db.maintenanceRequest.count({ where: { deletedAt: null, completedAt: { gte: p.prevFrom, lte: p.prevTo } } }),
    ]);
    kpis.push({ key: "maintOpen", label: "بلاغات صيانة مفتوحة", value: open, previous: null, compareLabel: null, unit: "count", higherIsBetter: false, href: "/maintenance", hint: `${urgent} عاجل` });
    kpis.push({ key: "maintDone", label: "بلاغات أُنجزت هذا الشهر", value: doneMonth, previous: donePrev, compareLabel: p.label, unit: "count", higherIsBetter: true, href: "/maintenance" });
  }
  if (hasBroad(session, "inventory")) {
    const items = await db.inventoryItem.findMany({ where: { deletedAt: null, isActive: true }, select: { onHandQty: true, minQty: true, stockValueMinor: true } });
    kpis.push({ key: "stockValue", label: "قيمة المخزون", value: items.reduce((s, i) => s + i.stockValueMinor, 0), previous: null, compareLabel: null, unit: "money", higherIsBetter: true, href: "/inventory", hint: `${items.filter((i) => i.minQty > 0 && i.onHandQty <= i.minQty).length} صنف تحت الحد` });
  }
  if (hasBroad(session, "canteen")) {
    const sum = async (f: Date, to: Date) => (await db.sale.aggregate({ where: { status: "COMPLETED", date: { gte: f, lte: to } }, _sum: { totalMinor: true } }))._sum.totalMinor ?? 0;
    const [cur, prev] = await Promise.all([sum(p.from, p.to), sum(p.prevFrom, p.prevTo)]);
    kpis.push({ key: "sales", label: "مبيعات المتجر والمقصف", value: cur, previous: prev, compareLabel: p.label, unit: "money", higherIsBetter: true, href: "/canteen/sales" });
  }
  if (hasBroad(session, "library")) {
    const overdue = await db.libraryLoan.count({ where: { returnedAt: null, dueDate: { lt: d0(today) } } });
    const loans = await db.libraryLoan.count({ where: { loanedAt: { gte: p.from, lte: p.to } } });
    const loansPrev = await db.libraryLoan.count({ where: { loanedAt: { gte: p.prevFrom, lte: p.prevTo } } });
    kpis.push({ key: "loans", label: "إعارات هذا الشهر", value: loans, previous: loansPrev, compareLabel: p.label, unit: "count", higherIsBetter: true, href: "/library", hint: `${overdue} إعارة متأخرة` });
  }
  if (hasBroad(session, "transport")) {
    const riders = await db.transportAssignment.count({ where: { status: "ACTIVE" } });
    kpis.push({ key: "riders", label: "طلاب المواصلات", value: riders, previous: null, compareLabel: null, unit: "count", higherIsBetter: true, href: "/transport" });
  }
  if (hasBroad(session, "safety")) {
    const [inc, incPrev] = await Promise.all([db.safetyIncident.count({ where: { occurredAt: { gte: p.from, lte: p.to } } }), db.safetyIncident.count({ where: { occurredAt: { gte: p.prevFrom, lte: p.prevTo } } })]);
    kpis.push({ key: "incidents", label: "حوادث السلامة", value: inc, previous: incPrev, compareLabel: p.label, unit: "count", higherIsBetter: false, href: "/safety/incidents" });
  }
  const maintByCat = hasBroad(session, "maintenance") ? await db.maintenanceRequest.groupBy({ by: ["category"], where: { deletedAt: null, createdAt: { gte: new Date(d0(today).getTime() - 90 * DAY) } }, _count: true }) : [];
  return { kpis, maintenanceByCategory: maintByCat.map((m) => ({ key: m.category, value: m._count })).sort((a, b) => b.value - a.value), today };
}

/** الأقسام المتاحة للمستخدم في لوحات التحكم */
export async function dashboardTabs(db: TenantDb, session: SessionData) {
  const scope = resolveScope(session.access, "dashboards", "view");
  if (!scope) return { tabs: [], branches: [], allBranches: false };
  const branches = await db.branch.findMany({ where: { deletedAt: null, ...(scope.kind === "all" ? {} : { id: { in: scope.branchIds } }) }, select: { id: true, name: true }, orderBy: { code: "asc" } });
  const tabs = [
    { key: "principal", label: "مدير المدرسة", show: true },
    { key: "finance", label: "المالية", show: hasBroad(session, "finance_reports") },
    { key: "academic", label: "الأكاديمية", show: hasBroad(session, "gpa") || hasBroad(session, "attendance") },
    { key: "hr", label: "الموارد البشرية", show: hasBroad(session, "employees") },
    { key: "operations", label: "العمليات", show: ["maintenance", "inventory", "canteen", "library", "transport", "safety"].some((m) => hasBroad(session, m)) },
  ].filter((t) => t.show);
  return { tabs, branches, allBranches: scope.kind === "all" };
}

export { computeMetric };
