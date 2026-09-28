/**
 * محرك الأتمتة: ينفذ قواعد «عندما … فإن …» على سجلات قواعد البيانات.
 * - أحداث فورية: إنشاء سجل، تغيّر خاصية.
 * - أحداث زمنية: حلول تاريخ (± أيام) عبر نقطة /api/cron/automations التي يستدعيها مجدول خارجي.
 * يُمنع التسلسل اللانهائي بحد أقصى لعمق التنفيذ.
 */
import type { Prisma } from "@/generated/prisma/client";
import { SPECIAL_VALUES, type AutomationAction, type AutomationTrigger } from "@/lib/database/automation-types";
import { toISODate } from "@/lib/dates";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { notify } from "./notifications.service";

const MAX_DEPTH = 3;

export interface RowEvent {
  databaseId: string;
  rowId: string;
  event: "created" | "updated";
  changed: string[];
  before?: Record<string, unknown>;
}

function valueMatches(actual: unknown, expected: unknown): boolean {
  if (expected === undefined || expected === null || expected === "") return true;
  if (Array.isArray(actual)) return actual.includes(expected as string);
  if (typeof actual === "object" && actual && "start" in actual) return (actual as { start: string }).start === expected;
  return actual === expected;
}

export function triggerMatches(trigger: AutomationTrigger, event: RowEvent, values: Record<string, unknown>): boolean {
  if (trigger.type === "ROW_CREATED") return event.event === "created";
  if (trigger.type === "PROPERTY_CHANGED") {
    if (!event.changed.includes(trigger.propertyId)) return false;
    return valueMatches(values[trigger.propertyId], trigger.toValue);
  }
  return false;
}

interface ActorInfo {
  tenantId: string;
  userId: string;
  userName: string;
}

async function executeActions(
  db: TenantDb,
  actor: ActorInfo,
  automation: { id: string; name: string; actions: unknown },
  row: { id: string; title: string; values: Record<string, unknown>; createdById: string | null; databaseId: string },
): Promise<{ changed: string[]; notified: number }> {
  const actions = (automation.actions ?? []) as AutomationAction[];
  const { sanitizeValue, toPropertyDef } = await import("./database.service");
  const properties = (await db.databaseProperty.findMany({ where: { databaseId: row.databaseId } })).map(toPropertyDef);
  const byId = new Map(properties.map((p) => [p.id, p]));
  const values = { ...row.values };
  const changed: string[] = [];
  let notified = 0;

  for (const action of actions) {
    if (action.type === "SET_PROPERTY") {
      const prop = byId.get(action.propertyId);
      if (!prop) continue;
      let value = action.value;
      if (value === SPECIAL_VALUES.TODAY) value = { start: toISODate(new Date()) };
      if (value === SPECIAL_VALUES.ACTOR) value = [actor.userId];
      const clean = await sanitizeValue(db, prop, value);
      if (JSON.stringify(values[prop.id] ?? null) !== JSON.stringify(clean ?? null)) {
        values[prop.id] = clean;
        changed.push(prop.id);
      }
    } else if (action.type === "NOTIFY") {
      let userIds: string[] = [];
      if (action.recipients === "CREATOR" && row.createdById) userIds = [row.createdById];
      if (action.recipients === "USERS") userIds = action.userIds ?? [];
      if (action.recipients === "PERSON_PROPERTY" && action.propertyId) {
        const v = values[action.propertyId];
        userIds = Array.isArray(v) ? (v as string[]) : [];
      }
      const message = (action.message || "تنبيه آلي").replaceAll("{العنوان}", row.title || "بدون عنوان");
      notified += await notify(db, {
        tenantId: actor.tenantId,
        userIds,
        type: "AUTOMATION",
        title: message,
        body: `أتمتة: ${automation.name}`,
        link: `/r/${row.id}`,
        actorId: null,
        entityType: "DatabaseRow",
        entityId: row.id,
      });
    }
  }

  if (changed.length) {
    await db.databaseRow.update({ where: { id: row.id }, data: { values: values as Prisma.InputJsonValue } });
  }
  return { changed, notified };
}

export async function runRowAutomations(db: TenantDb, session: SessionData, event: RowEvent, depth = 0): Promise<void> {
  if (depth >= MAX_DEPTH) return;
  const automations = await db.automation.findMany({ where: { databaseId: event.databaseId, isEnabled: true } });
  if (automations.length === 0) return;
  const actor: ActorInfo = { tenantId: session.tenant.id, userId: session.user.id, userName: session.user.name };

  for (const automation of automations) {
    const row = await db.databaseRow.findFirst({ where: { id: event.rowId, deletedAt: null } });
    if (!row) return;
    const values = (row.values ?? {}) as Record<string, unknown>;
    if (!triggerMatches(automation.trigger as AutomationTrigger, event, values)) continue;
    try {
      const result = await executeActions(db, actor, automation, { ...row, values });
      await db.automationRun.create({
        data: {
          tenantId: actor.tenantId,
          automationId: automation.id,
          rowId: row.id,
          status: "SUCCESS",
          message: `عُدّلت ${result.changed.length} خاصية، وأُرسل ${result.notified} إشعار`,
        },
      });
      await db.automation.update({ where: { id: automation.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
      if (result.changed.length) {
        await runRowAutomations(db, session, { ...event, event: "updated", changed: result.changed }, depth + 1);
      }
    } catch (err) {
      await db.automationRun.create({
        data: {
          tenantId: actor.tenantId,
          automationId: automation.id,
          rowId: row.id,
          status: "FAILED",
          message: err instanceof Error ? err.message.slice(0, 500) : "فشل التنفيذ",
        },
      });
    }
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * تشغيل الأتمتة الزمنية لمستأجر (يستدعيها المجدول يومياً).
 * لكل قاعدة DATE_REACHED: السجلات التي يوافق تاريخها (+ الإزاحة) تاريخ اليوم، مرة واحدة لكل سجل وتاريخ.
 */
export async function runScheduledAutomations(db: TenantDb, tenantId: string, timeZone: string, now = new Date()): Promise<number> {
  const today = toISODate(now, timeZone);
  const automations = await db.automation.findMany({ where: { isEnabled: true } });
  let runs = 0;
  for (const automation of automations) {
    const trigger = automation.trigger as AutomationTrigger;
    if (trigger.type !== "DATE_REACHED") continue;
    // التاريخ المستهدف: تاريخ الخاصية = اليوم - الإزاحة
    const targetDate = addDays(today, -trigger.offsetDays);
    const rows = await db.databaseRow.findMany({ where: { databaseId: automation.databaseId, deletedAt: null } });
    for (const row of rows) {
      const values = (row.values ?? {}) as Record<string, unknown>;
      const dateValue = values[trigger.propertyId] as { start?: string } | undefined;
      if (!dateValue?.start || dateValue.start.slice(0, 10) !== targetDate) continue;
      const marker = `DATE:${targetDate}`;
      const already = await db.automationRun.findFirst({ where: { automationId: automation.id, rowId: row.id, message: { startsWith: marker } } });
      if (already) continue;
      const actor: ActorInfo = { tenantId, userId: automation.createdById ?? row.createdById ?? "", userName: "الأتمتة" };
      try {
        const result = await executeActions(db, actor, automation, { ...row, values });
        await db.automationRun.create({
          data: { tenantId, automationId: automation.id, rowId: row.id, status: "SUCCESS", message: `${marker} — أُرسل ${result.notified} إشعار` },
        });
        runs++;
      } catch (err) {
        await db.automationRun.create({
          data: { tenantId, automationId: automation.id, rowId: row.id, status: "FAILED", message: `${marker} — ${err instanceof Error ? err.message : "فشل"}` },
        });
      }
    }
    await db.automation.update({ where: { id: automation.id }, data: { lastRunAt: new Date() } });
  }
  return runs;
}
