/**
 * منشئ التقارير: الحفظ والمشاركة والتشغيل والتصدير والجدولة.
 * ---------------------------------------------------------------------
 * - التقرير يُشغَّل دائماً بصلاحيات من يشغّله: المشارَك معه يرى صفوف نطاقه هو لا نطاق المالك،
 *   والتقرير المجدول يُشغَّل بصلاحيات مالكه ولا يُرسل إلا لمستخدمين يملكون صلاحية المجموعة نفسها.
 * - ملفات التشغيل المجدول تُحفظ خارج جدول الملفات العام وتُنزَّل عبر مسار يتحقق من الصلاحية.
 */
import { z } from "zod";
import { runQuery, type ReportConfig } from "@/lib/analytics/query";
import { nextRunAt, describeSchedule, type ReportSchedule } from "@/lib/analytics/schedule";
import { can } from "@/lib/rbac/access";
import { rootDb } from "@/server/db/client";
import type { SessionData } from "@/server/auth/session";
import { sessionForUser } from "@/server/auth/session";
import { createTenantDb, writeAudit, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { deliver } from "@/server/services/outbox";
import { notify } from "@/server/services/notifications.service";
import { DATASET_MAP, loadDataset, staffScope } from "./datasets";
import { buildCsv, buildXlsx, MIME, type ExportMeta } from "./export";

// ---------------------------------------------------------------------
// المخططات
// ---------------------------------------------------------------------

const filterSchema = z.object({
  field: z.string().max(60),
  op: z.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "between", "in", "empty", "notEmpty", "relative", "isTrue", "isFalse"]),
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.union([z.string().max(100), z.number()])).max(50), z.null()]).optional(),
  value2: z.union([z.string().max(100), z.number(), z.null()]).optional(),
});

export const configSchema = z.object({
  columns: z.array(z.string().max(60)).max(40),
  filters: z.array(filterSchema).max(20),
  groupBy: z.object({ field: z.string().max(60), bucket: z.enum(["day", "month", "year"]).optional() }).nullable().optional(),
  aggregates: z.array(z.object({ fn: z.enum(["count", "sum", "avg", "min", "max"]), field: z.string().max(60).optional() })).max(6).optional(),
  sort: z.object({ key: z.string().max(80), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
  limit: z.number().int().min(1).max(50_000).nullable().optional(),
  chart: z.object({ type: z.enum(["bar", "column", "line"]) }).nullable().optional(),
});

export const scheduleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  monthDay: z.number().int().min(1).max(28).nullable().optional(),
  format: z.enum(["XLSX", "CSV"]),
  userIds: z.array(z.string()).max(50),
  emails: z.array(z.string().email()).max(20),
});

// ---------------------------------------------------------------------
// الصلاحيات
// ---------------------------------------------------------------------

function requireReports(session: SessionData, action: "view" | "create" | "update" | "delete" | "export" = "view") {
  if (!can(session.access, "custom_reports", action)) throw forbidden("ليست لديك صلاحية على التقارير المخصصة");
}

async function visibleWhere(db: TenantDb, session: SessionData) {
  const roleIds = (await db.userRole.findMany({ where: { userId: session.user.id }, select: { roleId: true } })).map((r) => r.roleId);
  return { deletedAt: null, OR: [{ ownerId: session.user.id }, { visibility: "ALL" }, { visibility: "ROLES", sharedRoleIds: { hasSome: roleIds.length ? roleIds : ["-"] } }] };
}

async function loadVisible(db: TenantDb, session: SessionData, id: string) {
  const r = await db.savedReport.findFirst({ where: { id, ...(await visibleWhere(db, session)) } });
  if (!r) throw notFound("التقرير غير موجود أو غير مشارك معك");
  return r;
}

function canEdit(session: SessionData, r: { ownerId: string }) {
  return r.ownerId === session.user.id || can(session.access, "custom_reports", "update");
}

// ---------------------------------------------------------------------
// القوائم والحفظ
// ---------------------------------------------------------------------

export async function listReports(db: TenantDb, session: SessionData) {
  requireReports(session);
  const rows = await db.savedReport.findMany({ where: await visibleWhere(db, session), orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }] });
  const owners = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ownerId))] } }, select: { id: true, name: true, avatarColor: true } });
  return rows.map((r) => {
    const ds = DATASET_MAP.get(r.dataset);
    const schedule = r.schedule as ReportSchedule | null;
    return {
      id: r.id, name: r.name, description: r.description, dataset: r.dataset, datasetLabel: ds?.label ?? r.dataset, icon: ds?.icon ?? "lucide:table", visibility: r.visibility, isPinned: r.isPinned,
      owner: owners.find((o) => o.id === r.ownerId) ?? null, mine: r.ownerId === session.user.id, accessible: Boolean(ds && staffScope(session, ds.module)), canEdit: canEdit(session, r),
      scheduleEnabled: r.scheduleEnabled, scheduleText: r.scheduleEnabled && schedule ? describeSchedule(schedule) : null, nextRunAt: r.nextRunAt, lastRunAt: r.lastRunAt, updatedAt: r.updatedAt,
    };
  });
}

export async function getReport(db: TenantDb, session: SessionData, id: string) {
  requireReports(session);
  const r = await loadVisible(db, session, id);
  const runs = await db.reportRun.findMany({ where: { reportId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  return { report: { ...r, config: r.config as unknown as ReportConfig, schedule: r.schedule as ReportSchedule | null }, canEdit: canEdit(session, r), runs };
}

export async function saveReport(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; description?: string | null; dataset: string; config: ReportConfig; visibility: "PRIVATE" | "ROLES" | "ALL"; sharedRoleIds: string[]; isPinned?: boolean }) {
  const ds = DATASET_MAP.get(input.dataset);
  if (!ds || !staffScope(session, ds.module)) throw forbidden("لا تملك صلاحية مجموعة البيانات");
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("اسم التقرير مطلوب");
  if (input.visibility === "ALL" && !can(session.access, "custom_reports", "update")) throw forbidden("مشاركة التقرير مع الجميع لمن يملك صلاحية تعديل التقارير");
  const data = { name, description: input.description?.trim() || null, dataset: input.dataset, config: input.config as never, visibility: input.visibility, sharedRoleIds: input.visibility === "ROLES" ? input.sharedRoleIds : [], isPinned: input.isPinned ?? false };
  if (input.id) {
    const r = await loadVisible(db, session, input.id);
    if (!canEdit(session, r)) throw forbidden("يعدّل التقرير مالكه أو من يملك صلاحية التعديل");
    return db.savedReport.update({ where: { id: r.id }, data });
  }
  requireReports(session, "create");
  return db.savedReport.create({ data: { tenantId: session.tenant.id, ownerId: session.user.id, ...data } });
}

export async function deleteReport(db: TenantDb, session: SessionData, id: string) {
  const r = await loadVisible(db, session, id);
  if (r.ownerId !== session.user.id && !can(session.access, "custom_reports", "delete")) throw forbidden("يحذف التقرير مالكه");
  await db.savedReport.update({ where: { id }, data: { deletedAt: new Date(), scheduleEnabled: false, nextRunAt: null } });
  return { ok: true };
}

/** الأدوار والمستخدمون للمشاركة وقائمة مستلمي الجدولة (موظفون نشطون) */
export async function shareTargets(db: TenantDb, session: SessionData) {
  requireReports(session);
  const [roles, users] = await Promise.all([
    db.role.findMany({ where: { key: { notIn: ["PARENT", "STUDENT"] } }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { deletedAt: null, status: "ACTIVE", roles: { some: { role: { key: { notIn: ["PARENT", "STUDENT"] } } } } }, select: { id: true, name: true, jobTitle: true }, orderBy: { name: "asc" } }),
  ]);
  return { roles, users };
}

// ---------------------------------------------------------------------
// التشغيل
// ---------------------------------------------------------------------

function neededKeys(config: ReportConfig) {
  return [...config.columns, ...config.filters.map((f) => f.field), ...(config.groupBy ? [config.groupBy.field] : []), ...(config.aggregates ?? []).map((a) => a.field ?? "")].filter(Boolean);
}

export async function runAdhoc(db: TenantDb, session: SessionData, input: { dataset: string; config: ReportConfig; maxRows?: number }) {
  requireReports(session);
  const { fields, rows } = await loadDataset(db, session, input.dataset, neededKeys(input.config));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.tenant.timezone }).format(new Date());
  return runQuery(rows, input.config, fields, { today, maxRows: input.maxRows ?? 2000 });
}

export async function runSaved(db: TenantDb, session: SessionData, id: string) {
  const r = await loadVisible(db, session, id);
  return { report: { id: r.id, name: r.name, dataset: r.dataset }, result: await runAdhoc(db, session, { dataset: r.dataset, config: r.config as unknown as ReportConfig }) };
}

function metaOf(session: SessionData, title: string, subtitle?: string | null): ExportMeta {
  return { schoolName: session.tenant.name, platformName: session.tenant.platformName, title, subtitle, currency: session.tenant.currency, timezone: session.tenant.timezone, generatedBy: session.user.name };
}

/** ملف تصدير (للمسار /api/reports/export) — يُسجَّل في التدقيق */
export async function exportReport(db: TenantDb, session: SessionData, input: { id?: string | null; dataset?: string; config?: ReportConfig; name?: string; format: "XLSX" | "CSV" }) {
  requireReports(session, "export");
  let dataset = input.dataset;
  let config = input.config;
  let title = input.name ?? "تقرير";
  let reportId: string | null = null;
  if (input.id) {
    const r = await loadVisible(db, session, input.id);
    dataset = r.dataset;
    config = r.config as unknown as ReportConfig;
    title = r.name;
    reportId = r.id;
  }
  if (!dataset || !config) throw badRequest("حدد التقرير");
  const result = await runAdhoc(db, session, { dataset, config, maxRows: 50_000 });
  const meta = metaOf(session, title, DATASET_MAP.get(dataset)?.label);
  const buffer = input.format === "CSV" ? buildCsv(result, meta) : await buildXlsx(result, meta);
  if (reportId) await db.reportRun.create({ data: { tenantId: session.tenant.id, reportId, trigger: "MANUAL", status: "SUCCESS", format: input.format, rowCount: result.rows.length, runById: session.user.id } });
  await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "EXPORT", entityType: "SavedReport", entityId: reportId, summary: `${title} (${result.rows.length} سجل، ${input.format})` });
  return { buffer, filename: `${title}.${input.format === "CSV" ? "csv" : "xlsx"}`, mime: MIME[input.format] };
}

// ---------------------------------------------------------------------
// الجدولة
// ---------------------------------------------------------------------

export async function setSchedule(db: TenantDb, session: SessionData, input: { id: string; enabled: boolean; schedule: ReportSchedule | null }) {
  const r = await loadVisible(db, session, input.id);
  if (!canEdit(session, r)) throw forbidden();
  requireReports(session, "export");
  if (input.enabled) {
    if (!input.schedule) throw badRequest("حدد موعد الإرسال");
    if (!input.schedule.userIds.length && !input.schedule.emails.length) throw badRequest("أضف مستلماً واحداً على الأقل");
    // المستلمون الداخليون يجب أن يملكوا صلاحية المجموعة، وإلا يُرسل لهم ما لا يحق لهم
    const ds = DATASET_MAP.get(r.dataset)!;
    for (const uid of input.schedule.userIds) {
      const s = await sessionForUser(session.tenant.id, uid);
      if (!s || !staffScope(s, ds.module)) throw badRequest(`المستلم ${s?.user.name ?? ""} لا يملك صلاحية «${ds.label}»`);
    }
  }
  const next = input.enabled && input.schedule ? nextRunAt(input.schedule, new Date(), session.tenant.timezone) : null;
  return db.savedReport.update({ where: { id: r.id }, data: { schedule: (input.schedule ?? undefined) as never, scheduleEnabled: input.enabled, nextRunAt: next } });
}

/** تشغيل تقرير مجدول وإرساله (من المهمة الدورية أو زر «أرسل الآن») */
export async function deliverScheduled(tenantId: string, reportId: string, trigger: "SCHEDULE" | "MANUAL", actorId?: string) {
  const r = await rootDb.savedReport.findFirst({ where: { id: reportId, tenantId, deletedAt: null } });
  if (!r) throw notFound("التقرير غير موجود");
  const schedule = r.schedule as ReportSchedule | null;
  if (!schedule) throw badRequest("التقرير غير مجدول");
  const owner = await sessionForUser(tenantId, r.ownerId);
  const db = createTenantDb({ tenantId, actor: owner ? { id: owner.user.id, name: owner.user.name } : null });
  const finish = async (data: { status: string; rowCount?: number; fileId?: string | null; recipients?: number; error?: string | null }) => {
    const run = await db.reportRun.create({ data: { tenantId, reportId: r.id, trigger, format: schedule.format, status: data.status, rowCount: data.rowCount ?? 0, fileId: data.fileId ?? null, recipients: data.recipients ?? 0, error: data.error ?? null, runById: actorId ?? null } });
    const tz = owner?.tenant.timezone ?? "Asia/Riyadh";
    await db.savedReport.update({ where: { id: r.id }, data: { lastRunAt: new Date(), ...(trigger === "SCHEDULE" && r.scheduleEnabled ? { nextRunAt: nextRunAt(schedule, new Date(), tz) } : {}) } });
    return run;
  };
  if (!owner) return finish({ status: "FAILED", error: "حساب مالك التقرير غير نشط" });
  try {
    const result = await runAdhoc(db, owner, { dataset: r.dataset, config: r.config as unknown as ReportConfig, maxRows: 50_000 });
    const meta = metaOf(owner, r.name, `${DATASET_MAP.get(r.dataset)?.label ?? ""} — ${describeSchedule(schedule)}`);
    const buffer = schedule.format === "CSV" ? buildCsv(result, meta) : await buildXlsx(result, meta);
    const key = `${tenantId}/reports/${r.id}/${Date.now()}.${schedule.format === "CSV" ? "csv" : "xlsx"}`;
    await storage().put(key, buffer, MIME[schedule.format]);
    const run = await finish({ status: "SUCCESS", rowCount: result.rows.length, fileId: key, recipients: schedule.userIds.length + schedule.emails.length });
    const link = `/api/reports/runs/${run.id}`;
    await notify(db, { tenantId, userIds: schedule.userIds, type: "SYSTEM", title: `تقرير: ${r.name}`, body: `${result.rows.length} سجل — ${describeSchedule(schedule)}`, link, entityType: "SavedReport", entityId: r.id });
    const appUrl = process.env.APP_URL ?? "";
    for (const email of schedule.emails) {
      await deliver({ tenantId, channel: "email", to: email, subject: `${owner.tenant.name} — ${r.name}`, body: `مرفق تقرير «${r.name}» (${result.rows.length} سجل).\nللتنزيل بعد تسجيل الدخول: ${appUrl}${link}\n\nأُرسل آلياً من ${owner.tenant.platformName}.` });
    }
    return run;
  } catch (e) {
    return finish({ status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "خطأ غير معروف" });
  }
}

export async function sendNow(db: TenantDb, session: SessionData, id: string) {
  const r = await loadVisible(db, session, id);
  if (!canEdit(session, r)) throw forbidden();
  return deliverScheduled(session.tenant.id, r.id, "MANUAL", session.user.id);
}

/** المهمة الدورية: تقارير حان موعدها */
export async function runDueReports(tenantId: string, now = new Date()) {
  const due = await rootDb.savedReport.findMany({ where: { tenantId, deletedAt: null, scheduleEnabled: true, nextRunAt: { lte: now } }, select: { id: true } });
  let sent = 0;
  for (const r of due) if ((await deliverScheduled(tenantId, r.id, "SCHEDULE")).status === "SUCCESS") sent++;
  return { due: due.length, sent };
}

/** ملف تشغيل سابق — للمالك أو المستلمين أو من يملك صلاحية المجموعة */
export async function runFile(session: SessionData, runId: string) {
  const run = await rootDb.reportRun.findFirst({ where: { id: runId, tenantId: session.tenant.id }, include: { report: true } });
  if (!run || !run.fileId) throw notFound("الملف غير متاح");
  const schedule = run.report.schedule as ReportSchedule | null;
  const ds = DATASET_MAP.get(run.report.dataset);
  const allowed = run.report.ownerId === session.user.id || schedule?.userIds.includes(session.user.id) || (ds && staffScope(session, ds.module) && can(session.access, "custom_reports", "view"));
  if (!allowed) throw forbidden("الملف لمستلمي التقرير فقط");
  const buffer = await storage().get(run.fileId);
  const ext = run.format === "CSV" ? "csv" : "xlsx";
  return { buffer, filename: `${run.report.name}-${run.createdAt.toISOString().slice(0, 10)}.${ext}`, mime: MIME[run.format as "XLSX" | "CSV"] };
}
