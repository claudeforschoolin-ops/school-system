/**
 * المؤشرات الشهرية: حساب حيّ من البيانات التشغيلية، ولقطات محفوظة للأشهر المقفلة
 * (أو مستوردة من النظام السابق قبل بدء التشغيل)، ثم الاتجاهات والمقارنة بين الأعوام والتوقعات.
 */
import { z } from "zod";
import { addMonths, collectionForecast, enrollmentForecast, forecastSeries, METRIC_MAP, METRICS, monthRange, schoolYearMonths, schoolYearOf, summarize, changeBp, type MetricDef } from "@/lib/analytics/metrics";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, forbidden } from "@/server/errors";
import { todayIso } from "@/server/services/finance/common";

const monthStart = (p: string) => new Date(`${p}-01T00:00:00Z`);
const monthEnd = (p: string) => new Date(monthStart(addMonths(p, 1)).getTime() - 1);
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** بداية العام الدراسي (شهر) من إعدادات التحليلات */
export function yearStartMonth(session: Pick<SessionData, "tenant">) {
  const s = (session.tenant.settings as Record<string, unknown>)?.analytics as { yearStartMonth?: number } | undefined;
  return s?.yearStartMonth && s.yearStartMonth >= 1 && s.yearStartMonth <= 12 ? s.yearStartMonth : 9;
}

export function canMetric(session: SessionData, m: MetricDef) {
  const s = resolveScope(session.access, m.module, "view");
  return Boolean(s && (s.kind === "all" || s.branchIds.length || s.stageIds.length));
}

/** حساب حيّ لمؤشر في شهر (حتى «حتى» إن كان الشهر الحالي) */
export async function computeMetric(db: TenantDb, key: string, period: string, until?: Date): Promise<number> {
  const from = monthStart(period);
  const to = until && until < monthEnd(period) ? until : monthEnd(period);
  switch (key) {
    case "students_active":
      return db.student.count({ where: { deletedAt: null, status: "ACTIVE", enrollmentDate: { lte: to } } });
    case "students_new":
      return db.student.count({ where: { deletedAt: null, enrollmentDate: { gte: from, lte: to } } });
    case "applications":
      return db.admission.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to } } });
    case "attendance_rate": {
      const rows = await db.attendance.groupBy({ by: ["status"], where: { period: 0, date: { gte: from, lte: to } }, _count: true });
      const total = rows.reduce((s, r) => s + r._count, 0);
      const present = rows.filter((r) => r.status === "PRESENT" || r.status === "LATE" || r.status === "PERMISSION").reduce((s, r) => s + r._count, 0);
      return total ? Math.round((present / total) * 10000) : 0;
    }
    case "behavior_negative":
      return db.behaviorRecord.count({ where: { deletedAt: null, kind: "NEGATIVE", occurredAt: { gte: from, lte: to } } });
    case "billed":
      return (await db.invoice.aggregate({ where: { deletedAt: null, status: { in: ["ISSUED", "PARTIAL", "PAID"] }, issueDate: { gte: from, lte: to } }, _sum: { totalMinor: true } }))._sum.totalMinor ?? 0;
    case "collected":
      return (await db.receipt.aggregate({ where: { status: "POSTED", NOT: { chequeStatus: "BOUNCED" }, date: { gte: from, lte: to } }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0;
    case "revenue":
    case "expenses":
    case "net_income": {
      const lines = await db.journalLine.groupBy({ by: ["accountId"], where: { entry: { date: { gte: from, lte: to }, source: { not: "CLOSING" } } }, _sum: { debitMinor: true, creditMinor: true } });
      const accounts = await db.account.findMany({ where: { id: { in: lines.map((l) => l.accountId) } }, select: { id: true, type: true } });
      let rev = 0;
      let exp = 0;
      for (const l of lines) {
        const t = accounts.find((a) => a.id === l.accountId)?.type;
        if (t === "REVENUE") rev += n(l._sum.creditMinor) - n(l._sum.debitMinor);
        if (t === "EXPENSE") exp += n(l._sum.debitMinor) - n(l._sum.creditMinor);
      }
      return key === "revenue" ? rev : key === "expenses" ? exp : rev - exp;
    }
    case "employees_active":
      return db.employee.count({ where: { deletedAt: null, hireDate: { lte: to }, OR: [{ status: { in: ["ACTIVE", "ON_LEAVE"] } }, { terminationDate: { gt: to } }] } });
    case "staff_attendance_rate": {
      const rows = await db.employeeAttendance.groupBy({ by: ["status"], where: { date: { gte: from, lte: to }, status: { in: ["PRESENT", "LATE", "ABSENT"] } }, _count: true });
      const total = rows.reduce((s, r) => s + r._count, 0);
      const present = rows.filter((r) => r.status !== "ABSENT").reduce((s, r) => s + r._count, 0);
      return total ? Math.round((present / total) * 10000) : 0;
    }
    case "payroll_cost":
      return (await db.payrollRun.aggregate({ where: { month: period, status: { in: ["APPROVED", "PAID"] } }, _sum: { grossMinor: true, employerGosiMinor: true } }))._sum.grossMinor ?? 0;
    case "maintenance_opened":
      return db.maintenanceRequest.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to } } });
    default:
      throw badRequest("مؤشر غير معروف");
  }
}

/** بداية التشغيل الفعلي: أقدم شهر فيه بيانات تشغيلية (قبله يُعتمد على اللقطات المستوردة) */
async function goLiveMonth(db: TenantDb): Promise<string> {
  const [att, rec, inv] = await Promise.all([
    db.attendance.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    db.receipt.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    db.invoice.findFirst({ where: { issueDate: { not: null } }, orderBy: { issueDate: "asc" }, select: { issueDate: true } }),
  ]);
  const dates = [att?.date, rec?.date, inv?.issueDate].filter(Boolean) as Date[];
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 7) : "9999-12";
}

/** سلسلة شهرية: لقطة محفوظة إن وُجدت، وإلا حساب حيّ للأشهر منذ بدء التشغيل؛ الشهر الحالي حيّ دائماً */
export async function series(db: TenantDb, session: SessionData, key: string, months: string[]) {
  const today = todayIso(session);
  const current = today.slice(0, 7);
  const snaps = await db.metricSnapshot.findMany({ where: { metric: key, branchKey: "ALL", period: { in: months } } });
  const live = await goLiveMonth(db);
  const out: Array<{ period: string; value: number | null; source: "SNAPSHOT" | "IMPORTED" | "LIVE" | "NONE" }> = [];
  for (const p of months) {
    const snap = snaps.find((s) => s.period === p);
    if (p > current) out.push({ period: p, value: null, source: "NONE" });
    else if (snap && p !== current) out.push({ period: p, value: Number(snap.value), source: snap.source === "IMPORTED" ? "IMPORTED" : "SNAPSHOT" });
    else if (p >= live) out.push({ period: p, value: await computeMetric(db, key, p, p === current ? new Date(`${today}T23:59:59Z`) : undefined), source: "LIVE" });
    else out.push({ period: p, value: null, source: "NONE" });
  }
  return out;
}

// ---------------------------------------------------------------------
// اللقطات الشهرية
// ---------------------------------------------------------------------

/** إقفال شهر: يحفظ قيم كل المؤشرات (من المهمة الدورية أول كل شهر، أو يدوياً) */
export async function snapshotMonth(db: TenantDb, tenantId: string, period: string) {
  let saved = 0;
  for (const m of METRICS) {
    const value = await computeMetric(db, m.key, period);
    await rootDb.metricSnapshot.upsert({
      where: { tenantId_metric_period_branchKey: { tenantId, metric: m.key, period, branchKey: "ALL" } },
      create: { tenantId, metric: m.key, period, value: BigInt(value), source: "COMPUTED" },
      update: { value: BigInt(value), source: "COMPUTED" },
    });
    saved++;
  }
  return saved;
}

/** المهمة الدورية: لقطة الشهر المنقضي إن لم تُحفظ */
export async function snapshotPreviousMonth(db: TenantDb, tenantId: string, today: string) {
  const prev = addMonths(today.slice(0, 7), -1);
  const exists = await rootDb.metricSnapshot.count({ where: { tenantId, period: prev, source: "COMPUTED" } });
  if (exists >= METRICS.length) return { period: prev, saved: 0 };
  return { period: prev, saved: await snapshotMonth(db, tenantId, prev) };
}

export const importSchema = z.array(z.object({ metric: z.string(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), value: z.number().int() })).max(5000);

/** استيراد قيم تاريخية (من النظام السابق) — لا يطغى على لقطة محسوبة من بيانات النظام */
export async function importSnapshots(db: TenantDb, session: SessionData, rows: z.infer<typeof importSchema>) {
  if (!resolveScope(session.access, "analytics", "export") && !resolveScope(session.access, "settings", "update")) throw forbidden("الاستيراد لمسؤول التحليلات");
  const current = todayIso(session).slice(0, 7);
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!METRIC_MAP.has(r.metric) || r.period >= current) {
      skipped++;
      continue;
    }
    const existing = await rootDb.metricSnapshot.findUnique({ where: { tenantId_metric_period_branchKey: { tenantId: session.tenant.id, metric: r.metric, period: r.period, branchKey: "ALL" } } });
    if (existing?.source === "COMPUTED") {
      skipped++;
      continue;
    }
    await rootDb.metricSnapshot.upsert({
      where: { tenantId_metric_period_branchKey: { tenantId: session.tenant.id, metric: r.metric, period: r.period, branchKey: "ALL" } },
      create: { tenantId: session.tenant.id, metric: r.metric, period: r.period, value: BigInt(r.value), source: "IMPORTED" },
      update: { value: BigInt(r.value), source: "IMPORTED" },
    });
    imported++;
  }
  await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "IMPORT", entityType: "MetricSnapshot", summary: `استيراد ${imported} قيمة تاريخية للمؤشرات (تُجوهل ${skipped})` });
  return { imported, skipped };
}

// ---------------------------------------------------------------------
// تحليل البيانات
// ---------------------------------------------------------------------

function requireAnalytics(session: SessionData) {
  if (!resolveScope(session.access, "analytics", "view")) throw forbidden("ليست لديك صلاحية تحليل البيانات");
}

export async function analyticsOverview(db: TenantDb, session: SessionData) {
  requireAnalytics(session);
  const start = yearStartMonth(session);
  const current = todayIso(session).slice(0, 7);
  const thisYear = schoolYearOf(current, start);
  const years = [schoolYearOf(addMonths(current, -24), start), schoolYearOf(addMonths(current, -12), start), thisYear];
  const metrics = METRICS.filter((m) => canMetric(session, m));
  const rows = [];
  for (const m of metrics) {
    const perYear: Array<{ year: string; value: number | null; months: number }> = [];
    for (const y of years) {
      const months = schoolYearMonths(y, start).filter((p) => p <= current);
      const s = await series(db, session, m.key, months);
      // للمقارنة العادلة مع العام الجاري: الأعوام السابقة حتى الشهر نفسه (من بداية العام)
      const elapsed = schoolYearMonths(thisYear, start).filter((p) => p <= current).length;
      const comparable = y === thisYear ? s : s.slice(0, elapsed);
      perYear.push({ year: y, value: summarize(comparable.map((x) => x.value), m.additive), months: comparable.filter((x) => x.value !== null).length });
    }
    const [a, b, c] = perYear;
    rows.push({ key: m.key, label: m.label, unit: m.unit, group: m.group, higherIsBetter: m.higherIsBetter, additive: m.additive, years: perYear, change: changeBp(c?.value ?? 0, b?.value), previousChange: changeBp(b?.value ?? 0, a?.value) });
  }
  return { years, currentYear: thisYear, throughMonth: current, metrics: rows, yearStartMonth: start };
}

/** اتجاه مؤشر: ٢٤ شهراً مع مقارنة الشهر نفسه من العام السابق، وتوقع ٣ أشهر */
export async function metricTrend(db: TenantDb, session: SessionData, key: string) {
  requireAnalytics(session);
  const def = METRIC_MAP.get(key);
  if (!def || !canMetric(session, def)) throw forbidden("المؤشر غير متاح لك");
  const start = yearStartMonth(session);
  const current = todayIso(session).slice(0, 7);
  const thisYear = schoolYearOf(current, start);
  const months = schoolYearMonths(thisYear, start);
  const lastMonths = months.map((p) => addMonths(p, -12));
  const [cur, prev] = await Promise.all([series(db, session, key, months), series(db, session, key, lastMonths)]);
  const history = await series(db, session, key, monthRange(addMonths(current, -23), current));
  // الشهر الجاري ناقص؛ التوقع مبني على الأشهر المكتملة
  const complete = history.slice(0, -1).map((h) => h.value);
  const lastYearSameMonths = monthRange(addMonths(current, -11), addMonths(current, -9)).map((p) => history.find((h) => h.period === p)?.value ?? null);
  const knownLast = history.slice(-13, -1).map((h) => h.value).filter((v): v is number => v !== null);
  const lastAvg = knownLast.length ? knownLast.reduce((s, v) => s + v, 0) / knownLast.length : 0;
  const seasonal = def.additive && lastAvg ? lastYearSameMonths.map((v) => (v === null ? null : v / lastAvg)) : undefined;
  const forecast = forecastSeries(complete, 3, seasonal).map((value, i) => ({ period: addMonths(current, i + (history.at(-1)?.period === current ? 1 : 0)), value }));
  return {
    metric: { key: def.key, label: def.label, unit: def.unit, higherIsBetter: def.higherIsBetter, additive: def.additive },
    months,
    thisYear: { label: thisYear, values: cur },
    lastYear: { label: schoolYearOf(lastMonths[0]!, start), values: prev },
    history,
    forecast,
    method: seasonal ? "اتجاه خطي على آخر ٢٤ شهراً مكتملاً × موسمية الأشهر نفسها من العام الماضي" : "اتجاه خطي على الأشهر المكتملة المتاحة",
  };
}

/** توقع التحصيل لبقية العام الدراسي، وتوقع التسجيل للعام القادم */
export async function forecasts(db: TenantDb, session: SessionData) {
  requireAnalytics(session);
  const today = todayIso(session);
  const current = today.slice(0, 7);
  const start = yearStartMonth(session);
  const out: { collection: null | { months: ReturnType<typeof collectionForecast>; efficiencyBp: number | null; basis: string; totalExpectedMinor: number; totalDueMinor: number }; enrollment: null | (ReturnType<typeof enrollmentForecast> & { currentActive: number; finalGradeCount: number; retentionBp: number; openApplications: number; conversionBp: number; acceptedPending: number; basis: string; nextYear: string }) } = { collection: null, enrollment: null };

  if (resolveScope(session.access, "finance_reports", "view")) {
    const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
    if (year) {
      const inst = await db.invoiceInstallment.findMany({ where: { invoice: { academicYearId: year.id, deletedAt: null, status: { in: ["ISSUED", "PARTIAL", "PAID"] } } }, select: { dueDate: true, amountMinor: true, paidMinor: true } });
      // كفاءة التحصيل: لكل شهر منقضٍ، نسبة المسدد من المستحق فيه
      const effByMonth = new Map<string, { due: number; paid: number }>();
      const remaining = new Map<string, number>();
      for (const i of inst) {
        const p = i.dueDate.toISOString().slice(0, 7);
        if (p < current) {
          const e = effByMonth.get(p) ?? { due: 0, paid: 0 };
          e.due += i.amountMinor;
          e.paid += i.paidMinor;
          effByMonth.set(p, e);
        } else remaining.set(p, (remaining.get(p) ?? 0) + i.amountMinor - i.paidMinor);
      }
      const eff = [...effByMonth.values()].filter((e) => e.due > 0).map((e) => (e.paid / e.due) * 10000);
      // بدون تاريخ كافٍ في العام الجاري: متوسط نسبة التحصيل إلى الفوترة من اللقطات السابقة
      if (eff.length < 2) {
        const past = monthRange(addMonths(current, -12), addMonths(current, -1));
        const [billed, collected] = await Promise.all([series(db, session, "billed", past), series(db, session, "collected", past)]);
        const b = billed.reduce((s, x) => s + (x.value ?? 0), 0);
        const c = collected.reduce((s, x) => s + (x.value ?? 0), 0);
        if (b > 0) eff.push(Math.min(10000, (c / b) * 10000));
      }
      const months = collectionForecast([...remaining.entries()].sort().map(([period, dueMinor]) => ({ period, dueMinor })).filter((m) => m.dueMinor > 0), eff);
      out.collection = { months, efficiencyBp: eff.length ? Math.round(eff.reduce((s, e) => s + e, 0) / eff.length) : null, basis: eff.length >= 2 ? "نسبة ما سُدد من أقساط الأشهر المنقضية هذا العام" : "نسبة التحصيل إلى الفوترة في الأشهر الاثني عشر الماضية", totalExpectedMinor: months.reduce((s, m) => s + m.expectedMinor, 0), totalDueMinor: months.reduce((s, m) => s + m.dueMinor, 0) };
    }
  }

  if (resolveScope(session.access, "admissions", "view") && resolveScope(session.access, "students", "view")) {
    const grades = await db.grade.findMany({ where: { deletedAt: null }, orderBy: [{ stage: { order: "desc" } }, { order: "desc" }], take: 1 });
    const [currentActive, finalGradeCount, open, accepted, decided, enrolled] = await Promise.all([
      db.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      grades[0] ? db.student.count({ where: { deletedAt: null, status: "ACTIVE", gradeId: grades[0].id } }) : 0,
      db.admission.count({ where: { deletedAt: null, stage: { in: ["NEW", "REVIEW", "ASSESSMENT", "WAITLIST"] } } }),
      db.admission.count({ where: { deletedAt: null, stage: "ACCEPTED" } }),
      db.admission.count({ where: { deletedAt: null, stage: { in: ["ACCEPTED", "ENROLLED", "REJECTED"] } } }),
      db.admission.count({ where: { deletedAt: null, stage: "ENROLLED" } }),
    ]);
    // الاستبقاء من اللقطات: المنتظمون في بداية العام الجاري ÷ منتظمي نهاية العام السابق
    const thisStart = schoolYearMonths(schoolYearOf(current, start), start)[0]!;
    const [endPrev, startNow] = await Promise.all([series(db, session, "students_active", [addMonths(thisStart, -3)]), series(db, session, "students_active", [addMonths(thisStart, 1) <= current ? addMonths(thisStart, 1) : thisStart])]);
    const a = endPrev[0]?.value;
    const b = startNow[0]?.value;
    const newJoiners = (await series(db, session, "students_new", [thisStart]))[0]?.value ?? 0;
    const retentionBp = a && b ? Math.min(10000, Math.round(((b - newJoiners) / a) * 10000)) : 9200;
    const conversionBp = decided ? Math.round(((accepted + enrolled) / decided) * 10000) : 6000;
    const f = enrollmentForecast({ currentActive, finalGradeCount, retentionBp: Math.max(5000, retentionBp), openApplications: open, conversionBp, acceptedPending: accepted });
    const next = schoolYearOf(addMonths(current, 12), start);
    out.enrollment = { ...f, currentActive, finalGradeCount, retentionBp: Math.max(5000, retentionBp), openApplications: open, conversionBp, acceptedPending: accepted, basis: a && b ? "الاستبقاء من لقطات نهاية العام الماضي وبداية العام الجاري، والتحويل من قرارات القبول" : "استبقاء افتراضي ٩٢٪ لعدم توفر لقطات كافية", nextYear: next };
  }
  return out;
}

export async function metricsCatalog(session: SessionData) {
  return METRICS.filter((m) => canMetric(session, m)).map((m) => ({ key: m.key, label: m.label, unit: m.unit, group: m.group }));
}

export async function snapshotStatus(db: TenantDb, session: SessionData) {
  requireAnalytics(session);
  const rows = await db.metricSnapshot.groupBy({ by: ["source"], _count: true, _min: { period: true }, _max: { period: true } });
  return { rows: rows.map((r) => ({ source: r.source, count: r._count, from: r._min.period, to: r._max.period })), goLive: await goLiveMonth(db) };
}

export { monthRange };
