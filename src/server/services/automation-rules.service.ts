/**
 * قواعد الأتمتة على بيانات النظام: شرط (تصفية على مجموعة بيانات) ← إجراءات، بتكرار يومي/أسبوعي/كل ساعة.
 * ---------------------------------------------------------------------
 * - القاعدة تُقيَّم بصلاحيات منشئها (لا ترى صفوفاً خارج نطاقه).
 * - «لكل سجل»: إجراء لكل سجل مطابق، مع فترة تهدئة لا يتكرر خلالها على السجل نفسه.
 * - «ملخص»: إشعار واحد إذا بلغ عدد المطابقين الحد.
 * - الإجراءات: إشعار دور، إشعار مستخدمين، إشعار المسؤول عن السجل، رسالة لأولياء أمور الطالب، بريد ملخص.
 */
import { z } from "zod";
import { applyFilters, type Filter, type Row } from "@/lib/analytics/query";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { sessionForUser } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import { createTenantDb, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { todayIso } from "@/server/services/finance/common";
import { DATASET_MAP, loadDataset, staffScope } from "./analytics/datasets";
import { messageGuardians } from "./guardian-messages";
import { notify } from "./notifications.service";
import { deliver } from "./outbox";

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NOTIFY_ROLE"), roleKey: z.string().max(40), title: z.string().max(160) }),
  z.object({ type: z.literal("NOTIFY_USERS"), userIds: z.array(z.string()).min(1).max(20), title: z.string().max(160) }),
  z.object({ type: z.literal("NOTIFY_ASSIGNEE"), title: z.string().max(160) }),
  z.object({ type: z.literal("NOTIFY_GUARDIANS"), message: z.string().max(400) }),
  z.object({ type: z.literal("EMAIL"), emails: z.array(z.string().email()).min(1).max(10), subject: z.string().max(160) }),
]);
export type RuleAction = z.infer<typeof actionSchema>;

export const ACTION_LABEL: Record<RuleAction["type"], string> = {
  NOTIFY_ROLE: "إشعار دور",
  NOTIFY_USERS: "إشعار مستخدمين",
  NOTIFY_ASSIGNEE: "إشعار المسؤول عن السجل",
  NOTIFY_GUARDIANS: "رسالة لأولياء أمور الطالب",
  EMAIL: "بريد ملخص",
};

const FREQ_MS: Record<string, number> = { HOURLY: 3_600_000, DAILY: 86_400_000, WEEKLY: 7 * 86_400_000 };

function requireRules(session: SessionData, action: "view" | "update") {
  if (!resolveScope(session.access, "workflows", action)) throw forbidden("قواعد الأتمتة لمسؤول سير العمل");
}

/** نص بقيم السجل: {title} عنوان السجل، {count} عدد المطابقين، و{مفتاح_الحقل} لأي حقل */
function fill(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === null || vars[k] === undefined ? "" : String(vars[k])));
}

export async function listRules(db: TenantDb, session: SessionData) {
  requireRules(session, "view");
  const rules = await db.automationRule.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
  const creators = await db.user.findMany({ where: { id: { in: rules.map((r) => r.createdById ?? "") } }, select: { id: true, name: true } });
  return rules.map((r) => ({ ...r, datasetLabel: DATASET_MAP.get(r.dataset)?.label ?? r.dataset, creator: creators.find((c) => c.id === r.createdById)?.name ?? null, actions: r.actions as unknown as RuleAction[], filters: r.filters as unknown as Filter[] }));
}

export async function getRule(db: TenantDb, session: SessionData, id: string) {
  requireRules(session, "view");
  const r = await db.automationRule.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("القاعدة غير موجودة");
  const runs = await db.automationRuleRun.findMany({ where: { ruleId: id }, orderBy: { createdAt: "desc" }, take: 30 });
  return { rule: { ...r, actions: r.actions as unknown as RuleAction[], filters: r.filters as unknown as Filter[] }, runs };
}

export interface RuleInput {
  id?: string | null;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  dataset: string;
  filters: Filter[];
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  mode: "EACH_ROW" | "SUMMARY";
  threshold: number;
  cooldownDays: number;
  actions: RuleAction[];
}

export async function saveRule(db: TenantDb, session: SessionData, input: RuleInput) {
  requireRules(session, "update");
  const ds = DATASET_MAP.get(input.dataset);
  if (!ds || !staffScope(session, ds.module)) throw forbidden("لا تملك صلاحية مجموعة البيانات");
  if (input.name.trim().length < 3) throw badRequest("اسم القاعدة مطلوب");
  if (!input.actions.length) throw badRequest("أضف إجراءً واحداً على الأقل");
  if (input.actions.some((a) => a.type === "NOTIFY_GUARDIANS") && !ds.studentField) throw badRequest("رسائل أولياء الأمور تتطلب مجموعة بيانات مرتبطة بالطلاب");
  if (input.actions.some((a) => a.type === "NOTIFY_ASSIGNEE") && !ds.userField) throw badRequest("هذه المجموعة لا مسؤول لسجلاتها");
  if (input.mode === "SUMMARY" && input.actions.some((a) => a.type === "NOTIFY_GUARDIANS" || a.type === "NOTIFY_ASSIGNEE")) throw badRequest("إجراءات السجل الواحد لا تصلح لوضع الملخص");
  const data = {
    name: input.name.trim(), description: input.description?.trim() || null, isEnabled: input.isEnabled, dataset: input.dataset, filters: input.filters as never, frequency: input.frequency, mode: input.mode,
    threshold: Math.max(1, input.threshold), cooldownDays: Math.max(0, input.cooldownDays), actions: input.actions as never,
    nextRunAt: input.isEnabled ? new Date(Date.now() + 60_000) : null,
  };
  if (input.id) {
    const r = await db.automationRule.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!r) throw notFound("القاعدة غير موجودة");
    return db.automationRule.update({ where: { id: r.id }, data });
  }
  return db.automationRule.create({ data: { tenantId: session.tenant.id, createdById: session.user.id, ...data } });
}

export async function deleteRule(db: TenantDb, session: SessionData, id: string) {
  requireRules(session, "update");
  await db.automationRule.update({ where: { id }, data: { deletedAt: new Date(), isEnabled: false, nextRunAt: null } });
  return { ok: true };
}

/** معاينة دون تنفيذ: من سيطابق الآن وما الذي سيُرسل (بصلاحيات المستخدم الحالي) */
export async function previewRule(db: TenantDb, session: SessionData, input: Pick<RuleInput, "dataset" | "filters" | "cooldownDays"> & { id?: string | null }) {
  requireRules(session, "view");
  const { ds, fields, rows } = await loadDataset(db, session, input.dataset);
  const matched = applyFilters(rows, input.filters, fields, todayIso(session));
  let cooling = 0;
  if (input.id && input.cooldownDays) {
    const since = new Date(Date.now() - input.cooldownDays * 86_400_000);
    const hits = await db.automationRuleHit.findMany({ where: { ruleId: input.id, lastHitAt: { gte: since } }, select: { rowKey: true } });
    const set = new Set(hits.map((h) => h.rowKey));
    cooling = matched.filter((r) => set.has(String(r[ds.idField]))).length;
  }
  return { total: rows.length, matched: matched.length, cooling, sample: matched.slice(0, 20).map((r) => ({ key: String(r[ds.idField]), title: ds.title(r), link: ds.link?.(r) ?? null })) };
}

/** تنفيذ قاعدة (مجدول أو «شغّل الآن») بصلاحيات منشئها */
export async function executeRule(tenantId: string, ruleId: string, trigger: "SCHEDULE" | "MANUAL") {
  const rule = await rootDb.automationRule.findFirst({ where: { id: ruleId, tenantId, deletedAt: null } });
  if (!rule) throw notFound("القاعدة غير موجودة");
  const db = createTenantDb({ tenantId, actor: null });
  const finish = async (status: string, matched: number, acted: number, message: string | null) => {
    await rootDb.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date(), runCount: { increment: 1 }, nextRunAt: rule.isEnabled ? new Date(Date.now() + (FREQ_MS[rule.frequency] ?? FREQ_MS.DAILY!)) : null } });
    return rootDb.automationRuleRun.create({ data: { tenantId, ruleId: rule.id, trigger, status, matched, acted, message } });
  };
  const owner = rule.createdById ? await sessionForUser(tenantId, rule.createdById) : null;
  if (!owner) return finish("FAILED", 0, 0, "منشئ القاعدة غير نشط؛ أعد حفظها باسم مستخدم نشط");
  try {
    const ownerDb = createTenantDb({ tenantId, actor: { id: owner.user.id, name: owner.user.name } });
    const { ds, fields, rows } = await loadDataset(ownerDb, owner, rule.dataset);
    const filters = rule.filters as unknown as Filter[];
    const actions = rule.actions as unknown as RuleAction[];
    const matched = applyFilters(rows, filters, fields, todayIso(owner));
    const link = `/workflows/automations/${rule.id}`;
    let acted = 0;
    if (rule.mode === "SUMMARY") {
      if (matched.length < rule.threshold) return finish("SUCCESS", matched.length, 0, `دون الحد (${rule.threshold})`);
      const vars = { count: matched.length, title: rule.name };
      for (const a of actions) acted += await summaryAction(db, tenantId, owner, a, vars, link, rule.name, matched.slice(0, 20).map((r) => ds.title(r)));
      return finish("SUCCESS", matched.length, acted, null);
    }
    const since = new Date(Date.now() - rule.cooldownDays * 86_400_000);
    const recent = new Set((await rootDb.automationRuleHit.findMany({ where: { ruleId: rule.id, lastHitAt: { gte: since } }, select: { rowKey: true } })).map((h) => h.rowKey));
    let skipped = 0;
    for (const row of matched) {
      const key = String(row[ds.idField]);
      if (rule.cooldownDays > 0 && recent.has(key)) {
        skipped++;
        continue;
      }
      const vars: Record<string, unknown> = { ...row, title: ds.title(row), count: matched.length };
      const rowLink = ds.link?.(row) ?? link;
      for (const a of actions) acted += await rowAction(db, tenantId, owner, a, row, vars, rowLink, ds.studentField, ds.userField);
      await rootDb.automationRuleHit.upsert({ where: { ruleId_rowKey: { ruleId: rule.id, rowKey: key } }, create: { tenantId, ruleId: rule.id, rowKey: key }, update: { lastHitAt: new Date(), hits: { increment: 1 } } });
    }
    return finish("SUCCESS", matched.length, acted, skipped ? `${skipped} سجل ضمن فترة التهدئة` : null);
  } catch (e) {
    return finish("FAILED", 0, 0, e instanceof Error ? e.message.slice(0, 400) : "خطأ غير معروف");
  }
}

async function roleUsers(tenantId: string, roleKey: string) {
  return (await rootDb.userRole.findMany({ where: { tenantId, role: { key: roleKey }, user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true } })).map((u) => u.userId);
}

async function rowAction(db: TenantDb, tenantId: string, owner: SessionData, a: RuleAction, row: Row, vars: Record<string, unknown>, link: string, studentField?: string, userField?: string) {
  switch (a.type) {
    case "NOTIFY_ROLE":
      return notify(db, { tenantId, userIds: await roleUsers(tenantId, a.roleKey), type: "AUTOMATION", title: fill(a.title, vars), link });
    case "NOTIFY_USERS":
      return notify(db, { tenantId, userIds: a.userIds, type: "AUTOMATION", title: fill(a.title, vars), link });
    case "NOTIFY_ASSIGNEE": {
      const uid = userField ? row[userField] : null;
      return typeof uid === "string" ? notify(db, { tenantId, userIds: [uid], type: "AUTOMATION", title: fill(a.title, vars), link }) : 0;
    }
    case "NOTIFY_GUARDIANS": {
      const sid = studentField ? row[studentField] : null;
      return typeof sid === "string" ? (await messageGuardians(db, owner, sid, "automation_notice", { message: fill(a.message, vars) }, { title: fill(a.message, vars).slice(0, 120) })) > 0 ? 1 : 0 : 0;
    }
    case "EMAIL":
      for (const to of a.emails) await deliver({ tenantId, channel: "email", to, subject: fill(a.subject, vars), body: `${fill(a.subject, vars)}\n${String(vars.title ?? "")}` });
      return a.emails.length;
  }
}

async function summaryAction(db: TenantDb, tenantId: string, owner: SessionData, a: RuleAction, vars: Record<string, unknown>, link: string, ruleName: string, titles: string[]) {
  const body = `${titles.join("، ")}${Number(vars.count) > titles.length ? " …" : ""}`;
  switch (a.type) {
    case "NOTIFY_ROLE":
      return notify(db, { tenantId, userIds: await roleUsers(tenantId, a.roleKey), type: "AUTOMATION", title: fill(a.title, vars), body, link });
    case "NOTIFY_USERS":
      return notify(db, { tenantId, userIds: a.userIds, type: "AUTOMATION", title: fill(a.title, vars), body, link });
    case "EMAIL":
      for (const to of a.emails) await deliver({ tenantId, channel: "email", to, subject: fill(a.subject, vars), body: `${ruleName}: ${vars.count} سجلاً مطابقاً\n${body}\n\n— ${owner.tenant.name}` });
      return a.emails.length;
    default:
      return 0;
  }
}

export async function runRuleNow(db: TenantDb, session: SessionData, id: string) {
  requireRules(session, "update");
  const r = await db.automationRule.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("القاعدة غير موجودة");
  return executeRule(session.tenant.id, id, "MANUAL");
}

/** المهمة الدورية: القواعد المفعّلة التي حان موعدها */
export async function runDueRules(tenantId: string, now = new Date()) {
  const due = await rootDb.automationRule.findMany({ where: { tenantId, deletedAt: null, isEnabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] }, select: { id: true } });
  let acted = 0;
  for (const r of due) acted += (await executeRule(tenantId, r.id, "SCHEDULE")).acted;
  return { rules: due.length, acted };
}

/** قوالب قواعد جاهزة */
export const RULE_TEMPLATES: Array<Omit<RuleInput, "id" | "isEnabled"> & { key: string }> = [
  { key: "repeat-absence", name: "غياب متكرر ← المرشد وولي الأمر", description: "طالب غاب ٣ أيام فأكثر خلال أسبوعين", dataset: "students", filters: [{ field: "absencesLast14", op: "gte", value: 3 }, { field: "status", op: "eq", value: "ACTIVE" }], frequency: "DAILY", mode: "EACH_ROW", threshold: 1, cooldownDays: 7, actions: [{ type: "NOTIFY_ROLE", roleKey: "COUNSELOR", title: "غياب متكرر: {title} ({absencesLast14} أيام خلال أسبوعين)" }, { type: "NOTIFY_GUARDIANS", message: "نفيدكم بتكرر غياب {fullName} ({absencesLast14} أيام خلال أسبوعين). نأمل التواصل مع المرشد الطلابي" }] },
  { key: "overdue-30", name: "متأخرات أكثر من ٣٠ يوماً ← المحاسب", description: "ملخص أسبوعي بالفواتير المتأخرة", dataset: "invoices", filters: [{ field: "overdueDays", op: "gt", value: 30 }], frequency: "WEEKLY", mode: "SUMMARY", threshold: 1, cooldownDays: 0, actions: [{ type: "NOTIFY_ROLE", roleKey: "ACCOUNTANT", title: "{count} فاتورة متأخرة أكثر من ٣٠ يوماً" }] },
  { key: "docs-expiring", name: "وثائق موظف تنتهي ← الموارد البشرية", description: "الهوية أو الإقامة تنتهي خلال ٣٠ يوماً", dataset: "employees", filters: [{ field: "idExpiry", op: "relative", value: "next_30" }, { field: "status", op: "neq", value: "TERMINATED" }], frequency: "DAILY", mode: "EACH_ROW", threshold: 1, cooldownDays: 14, actions: [{ type: "NOTIFY_ROLE", roleKey: "HR_MANAGER", title: "تنتهي هوية/إقامة {title} في {idExpiry}" }, { type: "NOTIFY_ASSIGNEE", title: "تنتهي هويتك/إقامتك في {idExpiry}؛ نأمل التجديد" }] },
  { key: "low-stock", name: "نقص مخزون ← المشتريات", description: "صنف وصل الحد الأدنى", dataset: "inventory_items", filters: [{ field: "belowMin", op: "isTrue" }], frequency: "DAILY", mode: "EACH_ROW", threshold: 1, cooldownDays: 7, actions: [{ type: "NOTIFY_ROLE", roleKey: "PROCUREMENT", title: "نقص مخزون: {title} — الرصيد {onHandQty} والحد {minQty}" }] },
  { key: "stale-urgent", name: "بلاغ عاجل مفتوح ← المرافق", description: "بلاغ عاجل لم يُنجز", dataset: "maintenance", filters: [{ field: "priority", op: "eq", value: "URGENT" }, { field: "status", op: "in", value: ["NEW", "IN_PROGRESS", "WAITING_PARTS"] }], frequency: "HOURLY", mode: "EACH_ROW", threshold: 1, cooldownDays: 1, actions: [{ type: "NOTIFY_ROLE", roleKey: "FACILITIES", title: "بلاغ عاجل ما زال مفتوحاً: {title}" }, { type: "NOTIFY_ASSIGNEE", title: "بلاغ عاجل مسند إليك: {title}" }] },
  { key: "at-risk", name: "تحصيل منخفض ← وكيل الشؤون الأكاديمية", description: "طلاب معدلهم دون ٦٠٪", dataset: "term_results", filters: [{ field: "averageBp", op: "lt", value: 6000 }], frequency: "WEEKLY", mode: "SUMMARY", threshold: 1, cooldownDays: 0, actions: [{ type: "NOTIFY_ROLE", roleKey: "VP_ACADEMIC", title: "{count} طالباً معدلهم دون ٦٠٪ هذا الفصل" }] },
];
