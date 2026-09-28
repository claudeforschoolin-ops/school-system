/**
 * خدمة قواعد البيانات: السجلات والخصائص والعروض والقوالب.
 * كل عملية تتحقق من صلاحية الصفحة المضيفة، وكل تعديل يُسجَّل تلقائياً في التدقيق.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PropertyType as DbPropertyType, ViewType as DbViewType } from "@/generated/prisma/enums";
import { BLANK_DATABASE, defaultConfigFor, defaultViewConfig, resolveViewConfig, shortId, type DatabaseTemplateSeed } from "@/lib/database/defaults";
import {
  COMPUTED_TYPES,
  OPTION_COLORS,
  TITLE_KEY,
  type OptionColor,
  type DateValue,
  type FileValue,
  type PropertyConfig,
  type PropertyDef,
  type PropertyType,
  type ViewConfig,
  type ViewType,
} from "@/lib/database/types";
import { positionBetween } from "@/lib/position";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, notFound } from "@/server/errors";
import { assertDatabaseAccess, assertPageAccess, assertRowAccess, teamspaceLevel } from "./access.service";
import { runRowAutomations } from "./automation.service";
import { notify } from "./notifications.service";
import { atLeast } from "@/lib/access-levels";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function toPropertyDef(p: { id: string; name: string; type: string; config: unknown; position: number; description?: string | null; systemKey?: string | null }): PropertyDef {
  return {
    id: p.id,
    name: p.name,
    type: p.type as PropertyType,
    config: (p.config ?? {}) as PropertyConfig,
    position: p.position,
    description: p.description ?? null,
    systemKey: p.systemKey ?? null,
  };
}

// ---------------------------------------------------------------------
// إنشاء قاعدة بيانات
// ---------------------------------------------------------------------

export interface CreateDatabaseInput {
  teamspaceId?: string | null;
  parentId?: string | null;
  title: string;
  icon?: string | null;
  description?: string | null;
  position?: number;
  template?: DatabaseTemplateSeed;
  systemKey?: string | null;
}

/** ينشئ صفحة قاعدة بيانات بخصائصها وعروضها الافتراضية (داخل معاملة) */
export async function createDatabaseRecords(
  db: TenantDb,
  params: CreateDatabaseInput & { tenantId: string; userId: string; ownerId: string | null },
) {
  const template = params.template ?? BLANK_DATABASE;
  return db.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        tenantId: params.tenantId,
        kind: "DATABASE",
        teamspaceId: params.teamspaceId ?? null,
        ownerId: params.teamspaceId ? null : params.ownerId,
        parentId: params.parentId ?? null,
        title: params.title,
        icon: params.icon ?? "lucide:database",
        description: params.description ?? null,
        position: params.position ?? 0,
        fullWidth: true,
        systemKey: params.systemKey ?? null,
        createdById: params.userId,
        updatedById: params.userId,
      },
    });
    const database = await tx.database.create({
      data: { tenantId: params.tenantId, pageId: page.id, createdById: params.userId, updatedById: params.userId },
    });
    const keyToId: Record<string, string> = {};
    let pos = 0;
    for (const prop of template.properties) {
      pos += 1024;
      const created = await tx.databaseProperty.create({
        data: {
          tenantId: params.tenantId,
          databaseId: database.id,
          name: prop.name,
          type: prop.type as DbPropertyType,
          config: json(prop.config ?? defaultConfigFor(prop.type)),
          position: pos,
          createdById: params.userId,
        },
      });
      keyToId[prop.key] = created.id;
    }
    let vpos = 0;
    for (const view of template.views) {
      vpos += 1024;
      await tx.databaseView.create({
        data: {
          tenantId: params.tenantId,
          databaseId: database.id,
          name: view.name,
          type: view.type as DbViewType,
          config: json(resolveViewConfig(view.config, keyToId)),
          position: vpos,
          createdById: params.userId,
        },
      });
    }
    return { page, database, keyToId };
  });
}

// ---------------------------------------------------------------------
// القراءة
// ---------------------------------------------------------------------

/** مصدر قاعدة البيانات إن كانت مجموعة نظامية */
export async function systemSourceOf(db: TenantDb, databaseId: string | null | undefined): Promise<string | null> {
  if (!databaseId) return null;
  const d = await db.database.findFirst({ where: { id: databaseId }, select: { source: true } });
  return d?.source ?? null;
}

export async function getDatabaseBundle(db: TenantDb, session: SessionData, databaseId: string) {
  const { database, level, page } = await assertDatabaseAccess(db, session, databaseId, "VIEW");
  const sys = database.source ? await import("./system-db.service") : null;
  const [properties, views, templates, automations] = await Promise.all([
    db.databaseProperty.findMany({ where: { databaseId }, orderBy: { position: "asc" } }),
    db.databaseView.findMany({
      where: { databaseId, OR: [{ isPersonal: false }, { ownerId: session.user.id }] },
      orderBy: { position: "asc" },
    }),
    database.source ? Promise.resolve([]) : db.databaseTemplate.findMany({ where: { databaseId }, orderBy: { position: "asc" } }),
    database.source ? Promise.resolve([]) : db.automation.findMany({ where: { databaseId }, orderBy: { createdAt: "asc" } }),
  ]);
  const defs = properties.map(toPropertyDef);
  return {
    database: { id: database.id, pageId: database.pageId, titleLabel: database.titleLabel, rowCounter: database.rowCounter, source: database.source },
    /** بيانات المجموعة النظامية (رابط التفاصيل، زر الإنشاء…) أو null لقواعد البيانات العادية */
    system: sys && database.source ? sys.bundleSystemMeta(session, database.source) : null,
    page: { id: page.id, title: page.title, icon: page.icon },
    level,
    properties: sys && database.source ? await sys.withDynamicOptions({ db, session }, database.source, defs) : defs,
    views: views.map((v) => ({ ...v, config: (v.config ?? {}) as ViewConfig, type: v.type as ViewType })),
    templates,
    automations,
  };
}

const ROW_LIMIT = 5000;

export async function listRows(db: TenantDb, session: SessionData, databaseId: string) {
  const { database } = await assertDatabaseAccess(db, session, databaseId, "VIEW");
  if (database.source) {
    const { listSystemRows } = await import("./system-db.service");
    const rows = await listSystemRows(db, session, databaseId, database.source);
    return { rows, truncated: rows.length >= ROW_LIMIT, relatedRows: [] as typeof rows, relatedDatabases: [] as Array<{ id: string; title: string; properties: PropertyDef[] }> };
  }
  const [rows, properties] = await Promise.all([
    db.databaseRow.findMany({
      where: { databaseId, deletedAt: null },
      orderBy: [{ position: "asc" }, { number: "asc" }],
      take: ROW_LIMIT,
      select: {
        id: true,
        number: true,
        title: true,
        icon: true,
        cover: true,
        values: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        updatedById: true,
      },
    }),
    db.databaseProperty.findMany({ where: { databaseId, type: "RELATION" } }),
  ]);

  // السجلات المرتبطة للعلاقات والتجميعات (من قواعد البيانات الهدف)
  const relatedIds = new Set<string>();
  const targetDbIds = new Set<string>();
  for (const prop of properties) {
    const cfg = (prop.config ?? {}) as PropertyConfig;
    if (cfg.targetDatabaseId) targetDbIds.add(cfg.targetDatabaseId);
    for (const row of rows) {
      const v = (row.values as Record<string, unknown>)[prop.id];
      if (Array.isArray(v)) v.forEach((id) => typeof id === "string" && relatedIds.add(id));
    }
  }
  const [relatedRows, relatedDatabases] = await Promise.all([
    relatedIds.size
      ? db.databaseRow.findMany({
          where: { id: { in: [...relatedIds] }, deletedAt: null },
          select: {
            id: true,
            databaseId: true,
            number: true,
            title: true,
            icon: true,
            cover: true,
            values: true,
            position: true,
            createdAt: true,
            updatedAt: true,
            createdById: true,
            updatedById: true,
          },
        })
      : Promise.resolve([]),
    targetDbIds.size
      ? db.database.findMany({
          where: { id: { in: [...targetDbIds] } },
          include: { page: { select: { title: true } }, properties: { orderBy: { position: "asc" } } },
        })
      : Promise.resolve([]),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, values: (r.values ?? {}) as Record<string, unknown> })),
    truncated: rows.length >= ROW_LIMIT,
    relatedRows: relatedRows.map((r) => ({ ...r, values: (r.values ?? {}) as Record<string, unknown> })),
    relatedDatabases: relatedDatabases.map((d) => ({ id: d.id, title: d.page.title, properties: d.properties.map(toPropertyDef) })),
  };
}

export async function getRow(db: TenantDb, session: SessionData, rowId: string) {
  const { row, level, database, page, ancestors } = await assertRowAccess(db, session, rowId, "VIEW");
  return {
    row: { ...row, values: (row.values ?? {}) as Record<string, unknown> },
    level,
    databaseId: database.id,
    databasePage: { id: page.id, title: page.title, icon: page.icon },
    ancestors: [...ancestors, { id: page.id, title: page.title, icon: page.icon, kind: page.kind }],
  };
}

// ---------------------------------------------------------------------
// التحقق من القيم وتطهيرها
// ---------------------------------------------------------------------

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/api\/files\/)/i;

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (SAFE_URL.test(v)) return v.slice(0, 2000);
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`.slice(0, 2000);
  throw badRequest("الرابط غير صالح. يجب أن يبدأ بـ https://");
}

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v);
}

export async function sanitizeValue(
  db: TenantDb,
  prop: PropertyDef,
  value: unknown,
): Promise<unknown> {
  if (COMPUTED_TYPES.has(prop.type)) throw badRequest(`الخاصية «${prop.name}» محسوبة ولا يمكن تعديلها`);
  if (value === null || value === undefined) return null;
  switch (prop.type) {
    case "TEXT":
      if (typeof value !== "string") throw badRequest(`قيمة «${prop.name}» يجب أن تكون نصاً`);
      return value.slice(0, 10_000);
    case "PHONE":
      if (typeof value !== "string") throw badRequest("رقم الهاتف غير صالح");
      if (value && !/^[+\d\s()\-٠-٩]{3,25}$/.test(value)) throw badRequest("رقم الهاتف غير صالح");
      return value.trim();
    case "EMAIL":
      if (typeof value !== "string") throw badRequest("البريد الإلكتروني غير صالح");
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw badRequest("البريد الإلكتروني غير صالح");
      return value.trim().toLowerCase();
    case "URL":
      return sanitizeUrl(value);
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) throw badRequest(`قيمة «${prop.name}» يجب أن تكون رقماً`);
      return prop.config.numberFormat === "integer" ? Math.trunc(value) : value;
    case "MONEY":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw badRequest(`قيمة «${prop.name}» يجب أن تكون مبلغاً صحيحاً بأصغر وحدة`);
      }
      return value;
    case "CHECKBOX":
      return value === true;
    case "DATE": {
      const d = (typeof value === "string" ? { start: value } : value) as DateValue;
      if (!d || !isIsoDate(d.start) || (d.end != null && !isIsoDate(d.end))) throw badRequest("صيغة التاريخ غير صالحة");
      if (d.end && d.end < d.start) throw badRequest("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return d.end ? { start: d.start, end: d.end } : { start: d.start };
    }
    case "SELECT":
    case "STATUS": {
      if (typeof value !== "string") throw badRequest("خيار غير صالح");
      if (!prop.config.options?.some((o) => o.id === value)) throw badRequest("الخيار غير موجود في الخاصية");
      return value;
    }
    case "MULTI_SELECT": {
      if (!Array.isArray(value)) throw badRequest("قيمة غير صالحة");
      const valid = new Set(prop.config.options?.map((o) => o.id));
      return [...new Set(value.filter((v): v is string => typeof v === "string" && valid.has(v)))];
    }
    case "PERSON": {
      const ids = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
      if (ids.length === 0) return [];
      const users = await db.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
      const found = new Set(users.map((u) => u.id));
      const clean = ids.filter((id) => found.has(id));
      return prop.config.multiple === false ? clean.slice(0, 1) : [...new Set(clean)];
    }
    case "RELATION": {
      const ids = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
      if (ids.length === 0) return [];
      if (!prop.config.targetDatabaseId) throw badRequest("لم تُحدد قاعدة البيانات المرتبطة");
      const rows = await db.databaseRow.findMany({
        where: { id: { in: ids }, databaseId: prop.config.targetDatabaseId, deletedAt: null },
        select: { id: true },
      });
      const found = new Set(rows.map((r) => r.id));
      const clean = ids.filter((id) => found.has(id));
      return prop.config.multiple === false ? clean.slice(0, 1) : [...new Set(clean)];
    }
    case "FILES": {
      if (!Array.isArray(value)) throw badRequest("قيمة الملفات غير صالحة");
      return value.slice(0, 50).map((f) => {
        const file = f as FileValue;
        const url = sanitizeUrl(file.url);
        if (!url) throw badRequest("رابط الملف غير صالح");
        return { id: String(file.id ?? shortId()), name: String(file.name ?? "ملف").slice(0, 255), url, size: Number(file.size) || undefined, mime: file.mime };
      });
    }
    default:
      return value;
  }
}

async function sanitizeValues(db: TenantDb, properties: PropertyDef[], patch: Record<string, unknown>) {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const out: Record<string, unknown> = {};
  for (const [propId, value] of Object.entries(patch)) {
    const prop = byId.get(propId);
    if (!prop) throw badRequest("خاصية غير موجودة في قاعدة البيانات");
    out[propId] = await sanitizeValue(db, prop, value);
  }
  return out;
}

// ---------------------------------------------------------------------
// السجلات
// ---------------------------------------------------------------------

export interface CreateRowInput {
  databaseId: string;
  title?: string;
  values?: Record<string, unknown>;
  templateId?: string | null;
  /** الإدراج بعد/قبل سجل (للوحة والجدول) */
  afterRowId?: string | null;
  beforeRowId?: string | null;
  position?: number;
}

export async function createRow(db: TenantDb, session: SessionData, input: CreateRowInput) {
  const { database } = await assertDatabaseAccess(db, session, input.databaseId, "EDIT");
  if (database.source) throw badRequest("أنشئ السجل من زر الإنشاء الخاص بالوحدة");
  const properties = (await db.databaseProperty.findMany({ where: { databaseId: database.id } })).map(toPropertyDef);

  let title = input.title ?? "";
  let values: Record<string, unknown> = {};
  let content: unknown = undefined;
  let icon: string | null = null;
  if (input.templateId) {
    const template = await db.databaseTemplate.findFirst({ where: { id: input.templateId, databaseId: database.id } });
    if (!template) throw notFound("القالب غير موجود");
    title = input.title ?? template.title;
    values = { ...((template.values ?? {}) as Record<string, unknown>) };
    content = template.content ?? undefined;
    icon = template.icon;
  }
  values = { ...values, ...(await sanitizeValues(db, properties, input.values ?? {})) };

  // حساب الموضع
  let position = input.position;
  if (position === undefined) {
    const neighbourId = input.afterRowId ?? input.beforeRowId;
    if (neighbourId) {
      const neighbour = await db.databaseRow.findFirst({ where: { id: neighbourId, databaseId: database.id } });
      if (neighbour) {
        const adjacent = await db.databaseRow.findFirst({
          where: {
            databaseId: database.id,
            deletedAt: null,
            position: input.afterRowId ? { gt: neighbour.position } : { lt: neighbour.position },
          },
          orderBy: { position: input.afterRowId ? "asc" : "desc" },
        });
        position = input.afterRowId
          ? positionBetween(neighbour.position, adjacent?.position)
          : positionBetween(adjacent?.position, neighbour.position);
      }
    }
    if (position === undefined) {
      const last = await db.databaseRow.findFirst({ where: { databaseId: database.id }, orderBy: { position: "desc" } });
      position = positionBetween(last?.position ?? null, null);
    }
  }

  const counter = await db.database.update({ where: { id: database.id }, data: { rowCounter: { increment: 1 } } });
  const row = await db.databaseRow.create({
    data: {
      tenantId: session.tenant.id,
      databaseId: database.id,
      number: counter.rowCounter,
      title: title.slice(0, 500),
      icon,
      values: json(values),
      content: content === undefined ? undefined : json(content),
      position,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await notifyAssignments(db, session, database.id, properties, {}, values, row.id, row.title);
  await runRowAutomations(db, session, { databaseId: database.id, rowId: row.id, event: "created", changed: Object.keys(values) });
  const fresh = await db.databaseRow.findFirstOrThrow({ where: { id: row.id } });
  return { ...fresh, values: (fresh.values ?? {}) as Record<string, unknown> };
}

async function notifyAssignments(
  db: TenantDb,
  session: SessionData,
  databaseId: string,
  properties: PropertyDef[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  rowId: string,
  title: string,
) {
  const newlyAssigned = new Set<string>();
  for (const prop of properties) {
    if (prop.type !== "PERSON" || !(prop.id in after)) continue;
    const prev = new Set(Array.isArray(before[prop.id]) ? (before[prop.id] as string[]) : []);
    for (const id of (after[prop.id] as string[] | null) ?? []) if (!prev.has(id)) newlyAssigned.add(id);
  }
  if (newlyAssigned.size === 0) return;
  await notify(db, {
    tenantId: session.tenant.id,
    userIds: [...newlyAssigned],
    type: "ASSIGNMENT",
    title: `أسند إليك ${session.user.name}: ${title || "بدون عنوان"}`,
    link: `/r/${rowId}`,
    actorId: session.user.id,
    entityType: "DatabaseRow",
    entityId: rowId,
  });
  void databaseId;
}

export interface UpdateRowInput {
  rowId: string;
  /** مطلوب لسجلات المجموعات النظامية */
  databaseId?: string | null;
  title?: string;
  icon?: string | null;
  cover?: string | null;
  values?: Record<string, unknown>;
  content?: unknown;
}

export async function updateRow(db: TenantDb, session: SessionData, input: UpdateRowInput) {
  const source = await systemSourceOf(db, input.databaseId);
  if (source && input.databaseId) {
    await assertDatabaseAccess(db, session, input.databaseId, "VIEW");
    const { updateSystemRow } = await import("./system-db.service");
    return updateSystemRow(db, session, input.databaseId, source, input.rowId, { title: input.title, values: input.values });
  }
  const { row, database } = await assertRowAccess(db, session, input.rowId, "EDIT");
  const properties = (await db.databaseProperty.findMany({ where: { databaseId: database.id } })).map(toPropertyDef);
  const before = (row.values ?? {}) as Record<string, unknown>;
  const patch = input.values ? await sanitizeValues(db, properties, input.values) : {};
  const merged = { ...before, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete merged[k];

  const updated = await db.databaseRow.update({
    where: { id: row.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.slice(0, 500) } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
      ...(input.values ? { values: json(merged) } : {}),
      ...(input.content !== undefined ? { content: json(input.content) } : {}),
      updatedById: session.user.id,
    },
  });

  if (input.content !== undefined) {
    const { recordVersion, notifyDocMentions } = await import("./page.service");
    await recordVersion(db, session, "ROW", row.id, updated.title, input.content);
    await notifyDocMentions(db, session, row.content, input.content, { link: `/r/${row.id}`, title: updated.title, entityType: "DatabaseRow", entityId: row.id });
  }

  const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(patch[k] ?? null));
  if (input.title !== undefined && input.title !== row.title) changed.push(TITLE_KEY);
  await notifyAssignments(db, session, database.id, properties, before, patch, row.id, updated.title);
  if (changed.length) {
    await runRowAutomations(db, session, { databaseId: database.id, rowId: row.id, event: "updated", changed, before });
  }
  const fresh = await db.databaseRow.findFirstOrThrow({ where: { id: row.id } });
  return { ...fresh, values: (fresh.values ?? {}) as Record<string, unknown> };
}

/** نقل سجل (سحب في اللوحة/الجدول): موضع جديد + قيمة المجموعة الجديدة */
export async function moveRow(
  db: TenantDb,
  session: SessionData,
  input: { rowId: string; databaseId?: string | null; beforeRowId?: string | null; afterRowId?: string | null; values?: Record<string, unknown> },
) {
  const source = await systemSourceOf(db, input.databaseId);
  if (source && input.databaseId) {
    await assertDatabaseAccess(db, session, input.databaseId, "VIEW");
    const { updateSystemRow } = await import("./system-db.service");
    return updateSystemRow(db, session, input.databaseId, source, input.rowId, { values: input.values, beforeRowId: input.beforeRowId, afterRowId: input.afterRowId, move: true });
  }
  const { row } = await assertRowAccess(db, session, input.rowId, "EDIT");
  const [before, after] = await Promise.all([
    input.beforeRowId ? db.databaseRow.findFirst({ where: { id: input.beforeRowId, databaseId: row.databaseId } }) : null,
    input.afterRowId ? db.databaseRow.findFirst({ where: { id: input.afterRowId, databaseId: row.databaseId } }) : null,
  ]);
  // before = السجل الذي يسبق الموضع الجديد، after = السجل الذي يليه
  const position = positionBetween(before?.position ?? null, after?.position ?? null);
  await db.databaseRow.update({ where: { id: row.id }, data: { position, updatedById: session.user.id } });
  if (input.values && Object.keys(input.values).length) {
    return updateRow(db, session, { rowId: row.id, values: input.values });
  }
  const fresh = await db.databaseRow.findFirstOrThrow({ where: { id: row.id } });
  return { ...fresh, values: (fresh.values ?? {}) as Record<string, unknown> };
}

export async function trashRows(db: TenantDb, session: SessionData, rowIds: string[], databaseId?: string | null) {
  const source = await systemSourceOf(db, databaseId);
  if (source) {
    const { trashSystemRows } = await import("./system-db.service");
    return trashSystemRows(db, session, source, rowIds);
  }
  const now = new Date();
  for (const id of rowIds) {
    const { row } = await assertRowAccess(db, session, id, "EDIT");
    await db.databaseRow.update({ where: { id: row.id }, data: { deletedAt: now, updatedById: session.user.id } });
  }
  return { count: rowIds.length };
}

export async function restoreRows(db: TenantDb, session: SessionData, rowIds: string[], databaseId?: string | null) {
  const source = await systemSourceOf(db, databaseId);
  if (source) {
    const { trashSystemRows } = await import("./system-db.service");
    return trashSystemRows(db, session, source, rowIds, true);
  }
  for (const id of rowIds) {
    const { row } = await assertRowAccess(db, session, id, "EDIT", { includeDeleted: true });
    await db.databaseRow.update({ where: { id: row.id }, data: { deletedAt: null, updatedById: session.user.id } });
  }
  return { count: rowIds.length };
}

export async function duplicateRow(db: TenantDb, session: SessionData, rowId: string) {
  const { row } = await assertRowAccess(db, session, rowId, "EDIT");
  const next = await db.databaseRow.findFirst({
    where: { databaseId: row.databaseId, deletedAt: null, position: { gt: row.position } },
    orderBy: { position: "asc" },
  });
  const counter = await db.database.update({ where: { id: row.databaseId }, data: { rowCounter: { increment: 1 } } });
  const copy = await db.databaseRow.create({
    data: {
      tenantId: session.tenant.id,
      databaseId: row.databaseId,
      number: counter.rowCounter,
      title: row.title ? `${row.title} (نسخة)` : "",
      icon: row.icon,
      cover: row.cover,
      values: json(row.values),
      content: row.content === null ? undefined : json(row.content),
      position: positionBetween(row.position, next?.position ?? null),
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  return { ...copy, values: (copy.values ?? {}) as Record<string, unknown> };
}

// ---------------------------------------------------------------------
// الخصائص
// ---------------------------------------------------------------------

function sanitizeConfig(type: PropertyType, config: PropertyConfig | undefined): PropertyConfig {
  const base = { ...defaultConfigFor(type), ...(config ?? {}) };
  if (base.options) {
    base.options = base.options
      .filter((o) => o && typeof o.name === "string" && o.name.trim())
      .map((o) => ({
        id: o.id || shortId(),
        name: o.name.trim().slice(0, 100),
        color: (OPTION_COLORS as readonly string[]).includes(o.color) ? o.color : "gray",
      }));
  }
  if (type === "STATUS" && base.groups) {
    const ids = new Set(base.options?.map((o) => o.id));
    base.groups = base.groups.map((g) => ({ ...g, optionIds: g.optionIds.filter((id) => ids.has(id)) }));
    // الخيارات غير المصنفة تذهب إلى «للتنفيذ»
    const assigned = new Set(base.groups.flatMap((g) => g.optionIds));
    const todo = base.groups.find((g) => g.key === "todo");
    for (const id of ids) if (!assigned.has(id) && todo) todo.optionIds.push(id);
  }
  if (type === "FORMULA" && typeof base.expression === "string") base.expression = base.expression.slice(0, 2000);
  return base;
}

export async function createProperty(
  db: TenantDb,
  session: SessionData,
  input: { databaseId: string; name: string; type: PropertyType; config?: PropertyConfig; afterPropertyId?: string | null },
) {
  const { database } = await assertDatabaseAccess(db, session, input.databaseId, "EDIT");
  const config = sanitizeConfig(input.type, input.config);
  if (database.source && (input.type === "RELATION" || input.type === "ROLLUP")) throw badRequest("العلاقات غير متاحة في قواعد بيانات النظام");
  if (input.type === "RELATION") {
    if (!config.targetDatabaseId) throw badRequest("اختر قاعدة البيانات المرتبطة");
    await assertDatabaseAccess(db, session, config.targetDatabaseId, "VIEW");
  }
  const last = await db.databaseProperty.findFirst({ where: { databaseId: input.databaseId }, orderBy: { position: "desc" } });
  return toPropertyDef(
    await db.databaseProperty.create({
      data: {
        tenantId: session.tenant.id,
        databaseId: input.databaseId,
        name: input.name.trim().slice(0, 100) || "خاصية",
        type: input.type as DbPropertyType,
        config: json(config),
        position: positionBetween(last?.position ?? null, null),
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    }),
  );
}

/** تحويل القيم عند تغيير نوع الخاصية (أفضل جهد، دون فقد صامت للبيانات النصية) */
function coerceValue(value: unknown, from: PropertyType, to: PropertyType, config: PropertyConfig): unknown {
  if (value === null || value === undefined) return undefined;
  const asText = Array.isArray(value) ? value.join("، ") : typeof value === "object" ? ((value as DateValue).start ?? "") : String(value);
  switch (to) {
    case "TEXT":
    case "URL":
    case "EMAIL":
    case "PHONE":
      return asText;
    case "NUMBER": {
      const n = Number(asText);
      return Number.isFinite(n) ? n : undefined;
    }
    case "CHECKBOX":
      return value === true || asText === "true" || asText === "نعم";
    case "SELECT":
    case "STATUS": {
      const first = Array.isArray(value) ? value[0] : value;
      return config.options?.some((o) => o.id === first) ? first : config.options?.find((o) => o.name === asText)?.id;
    }
    case "MULTI_SELECT": {
      const list = Array.isArray(value) ? value : [value];
      return list.filter((v) => config.options?.some((o) => o.id === v));
    }
    default:
      return from === to ? value : undefined;
  }
}

export async function updateProperty(
  db: TenantDb,
  session: SessionData,
  input: { propertyId: string; name?: string; type?: PropertyType; config?: PropertyConfig; description?: string | null },
) {
  const prop = await db.databaseProperty.findFirst({ where: { id: input.propertyId } });
  if (!prop) throw notFound("الخاصية غير موجودة");
  await assertDatabaseAccess(db, session, prop.databaseId, "EDIT");
  if (prop.systemKey) {
    // الخاصية النظامية: يُسمح بتغيير الاسم والوصف وألوان الخيارات فقط
    if (input.type && input.type !== prop.type) throw badRequest("لا يمكن تغيير نوع خاصية نظامية");
    const current = (prop.config ?? {}) as PropertyConfig;
    const colors = new Map((input.config?.options ?? []).map((o) => [o.id, o.color]));
    const options = current.options?.map((o) => ({ ...o, color: (colors.get(o.id) as OptionColor | undefined) ?? o.color }));
    const dynamicColors = current.dynamicOptions ? input.config?.options?.map((o) => ({ id: o.id, name: o.name, color: o.color })) : undefined;
    const updated = await db.databaseProperty.update({
      where: { id: prop.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim().slice(0, 100) || prop.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        config: json({ ...current, ...(options ? { options } : {}), ...(dynamicColors ? { options: dynamicColors } : {}) }),
        updatedById: session.user.id,
      },
    });
    return toPropertyDef(updated);
  }
  const newType = input.type ?? (prop.type as PropertyType);
  const mergedConfig = sanitizeConfig(newType, {
    ...(input.type && input.type !== prop.type ? {} : ((prop.config ?? {}) as PropertyConfig)),
    ...(input.config ?? {}),
  });

  if (newType === "RELATION" && mergedConfig.targetDatabaseId) {
    await assertDatabaseAccess(db, session, mergedConfig.targetDatabaseId, "VIEW");
  }

  const updated = await db.databaseProperty.update({
    where: { id: prop.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 100) || prop.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      type: newType as DbPropertyType,
      config: json(mergedConfig),
      updatedById: session.user.id,
    },
  });

  // تحويل القيم عند تغيير النوع
  if (input.type && input.type !== prop.type && !COMPUTED_TYPES.has(newType)) {
    const rows = await db.databaseRow.findMany({ where: { databaseId: prop.databaseId }, select: { id: true, values: true } });
    for (const row of rows) {
      const values = { ...((row.values ?? {}) as Record<string, unknown>) };
      if (!(prop.id in values)) continue;
      const coerced = coerceValue(values[prop.id], prop.type as PropertyType, newType, mergedConfig);
      if (coerced === undefined) delete values[prop.id];
      else values[prop.id] = coerced;
      await db.databaseRow.update({ where: { id: row.id }, data: { values: json(values) } });
    }
  }
  return toPropertyDef(updated);
}

export async function addSelectOption(
  db: TenantDb,
  session: SessionData,
  input: { propertyId: string; name: string; color?: string },
) {
  const prop = await db.databaseProperty.findFirst({ where: { id: input.propertyId } });
  if (!prop) throw notFound("الخاصية غير موجودة");
  await assertDatabaseAccess(db, session, prop.databaseId, "EDIT");
  if (prop.systemKey) throw badRequest("خيارات هذه الخاصية يحددها النظام");
  const config = (prop.config ?? {}) as PropertyConfig;
  const existing = config.options?.find((o) => o.name === input.name.trim());
  if (existing) return existing;
  const palette = OPTION_COLORS.filter((c) => c !== "gray");
  const option = {
    id: shortId(),
    name: input.name.trim().slice(0, 100),
    color: ((OPTION_COLORS as readonly string[]).includes(input.color ?? "")
      ? input.color
      : palette[(config.options?.length ?? 0) % palette.length]) as OptionColor,
  };
  const next = sanitizeConfig(prop.type as PropertyType, { ...config, options: [...(config.options ?? []), option] });
  await db.databaseProperty.update({ where: { id: prop.id }, data: { config: json(next) } });
  return option;
}

export async function deleteProperty(db: TenantDb, session: SessionData, propertyId: string) {
  const prop = await db.databaseProperty.findFirst({ where: { id: propertyId } });
  if (!prop) throw notFound("الخاصية غير موجودة");
  await assertDatabaseAccess(db, session, prop.databaseId, "EDIT");
  if (prop.systemKey) throw badRequest("لا يمكن حذف خاصية نظامية؛ يمكنك إخفاؤها من العرض");
  const dependents = await db.databaseProperty.findMany({ where: { databaseId: prop.databaseId, type: "ROLLUP" } });
  if (dependents.some((d) => ((d.config ?? {}) as PropertyConfig).relationPropertyId === prop.id)) {
    throw new AppError("CONFLICT", "لا يمكن حذف العلاقة لوجود خاصية تجميع تعتمد عليها");
  }
  await db.databaseProperty.delete({ where: { id: prop.id } });
  return { id: prop.id };
}

export async function reorderProperty(
  db: TenantDb,
  session: SessionData,
  input: { propertyId: string; beforeId?: string | null; afterId?: string | null },
) {
  const prop = await db.databaseProperty.findFirst({ where: { id: input.propertyId } });
  if (!prop) throw notFound("الخاصية غير موجودة");
  await assertDatabaseAccess(db, session, prop.databaseId, "EDIT");
  const [before, after] = await Promise.all([
    input.beforeId ? db.databaseProperty.findFirst({ where: { id: input.beforeId } }) : null,
    input.afterId ? db.databaseProperty.findFirst({ where: { id: input.afterId } }) : null,
  ]);
  await db.databaseProperty.update({
    where: { id: prop.id },
    data: { position: positionBetween(before?.position ?? null, after?.position ?? null) },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------
// العروض
// ---------------------------------------------------------------------

export async function createView(
  db: TenantDb,
  session: SessionData,
  input: { databaseId: string; name?: string; type: ViewType; isPersonal?: boolean; config?: ViewConfig },
) {
  await assertDatabaseAccess(db, session, input.databaseId, input.isPersonal ? "VIEW" : "EDIT");
  const properties = await db.databaseProperty.findMany({ where: { databaseId: input.databaseId } });
  const last = await db.databaseView.findFirst({ where: { databaseId: input.databaseId }, orderBy: { position: "desc" } });
  const { VIEW_TYPE_LABELS } = await import("@/lib/database/types");
  const view = await db.databaseView.create({
    data: {
      tenantId: session.tenant.id,
      databaseId: input.databaseId,
      name: input.name?.trim() || VIEW_TYPE_LABELS[input.type],
      type: input.type as DbViewType,
      config: json({ ...defaultViewConfig(input.type, properties.map((p) => ({ id: p.id, type: p.type as PropertyType }))), ...(input.config ?? {}) }),
      isPersonal: input.isPersonal ?? false,
      ownerId: input.isPersonal ? session.user.id : null,
      position: positionBetween(last?.position ?? null, null),
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  return { ...view, config: view.config as ViewConfig, type: view.type as ViewType };
}

async function assertViewEditable(db: TenantDb, session: SessionData, viewId: string) {
  const view = await db.databaseView.findFirst({ where: { id: viewId } });
  if (!view) throw notFound("العرض غير موجود");
  if (view.isPersonal) {
    if (view.ownerId !== session.user.id) throw notFound("العرض غير موجود");
    await assertDatabaseAccess(db, session, view.databaseId, "VIEW");
  } else {
    await assertDatabaseAccess(db, session, view.databaseId, "EDIT");
  }
  return view;
}

export async function updateView(
  db: TenantDb,
  session: SessionData,
  input: { viewId: string; name?: string; type?: ViewType; config?: ViewConfig; isPersonal?: boolean },
) {
  const view = await assertViewEditable(db, session, input.viewId);
  if (input.isPersonal === false && view.isPersonal) await assertDatabaseAccess(db, session, view.databaseId, "EDIT");
  let config = input.config ?? (view.config as ViewConfig);
  if (input.type && input.type !== view.type) {
    const properties = await db.databaseProperty.findMany({ where: { databaseId: view.databaseId } });
    config = { ...defaultViewConfig(input.type, properties.map((p) => ({ id: p.id, type: p.type as PropertyType }))), ...config };
  }
  const updated = await db.databaseView.update({
    where: { id: view.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 100) || view.name } : {}),
      ...(input.type ? { type: input.type as DbViewType } : {}),
      ...(input.isPersonal !== undefined ? { isPersonal: input.isPersonal, ownerId: input.isPersonal ? session.user.id : null } : {}),
      config: json(config),
      updatedById: session.user.id,
    },
  });
  return { ...updated, config: updated.config as ViewConfig, type: updated.type as ViewType };
}

export async function deleteView(db: TenantDb, session: SessionData, viewId: string) {
  const view = await assertViewEditable(db, session, viewId);
  const count = await db.databaseView.count({ where: { databaseId: view.databaseId, isPersonal: false } });
  if (!view.isPersonal && count <= 1) throw new AppError("CONFLICT", "لا يمكن حذف العرض الوحيد لقاعدة البيانات");
  await db.databaseView.delete({ where: { id: view.id } });
  return { id: view.id };
}

export async function duplicateView(db: TenantDb, session: SessionData, viewId: string) {
  const view = await assertViewEditable(db, session, viewId);
  const next = await db.databaseView.findFirst({
    where: { databaseId: view.databaseId, position: { gt: view.position } },
    orderBy: { position: "asc" },
  });
  const copy = await db.databaseView.create({
    data: {
      tenantId: session.tenant.id,
      databaseId: view.databaseId,
      name: `${view.name} (نسخة)`,
      type: view.type,
      config: json(view.config),
      isPersonal: view.isPersonal,
      ownerId: view.ownerId,
      position: positionBetween(view.position, next?.position ?? null),
      createdById: session.user.id,
    },
  });
  return { ...copy, config: copy.config as ViewConfig, type: copy.type as ViewType };
}

export async function reorderView(db: TenantDb, session: SessionData, input: { viewId: string; beforeId?: string | null; afterId?: string | null }) {
  const view = await assertViewEditable(db, session, input.viewId);
  const [before, after] = await Promise.all([
    input.beforeId ? db.databaseView.findFirst({ where: { id: input.beforeId, databaseId: view.databaseId } }) : null,
    input.afterId ? db.databaseView.findFirst({ where: { id: input.afterId, databaseId: view.databaseId } }) : null,
  ]);
  await db.databaseView.update({ where: { id: view.id }, data: { position: positionBetween(before?.position ?? null, after?.position ?? null) } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// القوالب
// ---------------------------------------------------------------------

export async function upsertTemplate(
  db: TenantDb,
  session: SessionData,
  input: { databaseId: string; templateId?: string | null; name: string; icon?: string | null; title?: string; values?: Record<string, unknown>; content?: unknown; isDefault?: boolean },
) {
  await assertDatabaseAccess(db, session, input.databaseId, "EDIT");
  const properties = (await db.databaseProperty.findMany({ where: { databaseId: input.databaseId } })).map(toPropertyDef);
  const values = await sanitizeValues(db, properties, input.values ?? {});
  if (input.isDefault) {
    await db.databaseTemplate.updateMany({ where: { databaseId: input.databaseId, isDefault: true }, data: { isDefault: false } });
  }
  const data = {
    name: input.name.trim().slice(0, 100) || "قالب",
    icon: input.icon ?? null,
    title: input.title ?? "",
    values: json(values),
    content: input.content === undefined ? undefined : json(input.content),
    isDefault: input.isDefault ?? false,
    updatedById: session.user.id,
  };
  if (input.templateId) {
    const existing = await db.databaseTemplate.findFirst({ where: { id: input.templateId, databaseId: input.databaseId } });
    if (!existing) throw notFound("القالب غير موجود");
    return db.databaseTemplate.update({ where: { id: existing.id }, data });
  }
  const last = await db.databaseTemplate.findFirst({ where: { databaseId: input.databaseId }, orderBy: { position: "desc" } });
  return db.databaseTemplate.create({
    data: { ...data, tenantId: session.tenant.id, databaseId: input.databaseId, position: positionBetween(last?.position ?? null, null), createdById: session.user.id },
  });
}

export async function deleteTemplate(db: TenantDb, session: SessionData, templateId: string) {
  const template = await db.databaseTemplate.findFirst({ where: { id: templateId } });
  if (!template) throw notFound("القالب غير موجود");
  await assertDatabaseAccess(db, session, template.databaseId, "EDIT");
  await db.databaseTemplate.delete({ where: { id: template.id } });
  return { id: template.id };
}

/** قواعد البيانات المتاحة للمستخدم (لاختيار هدف خاصية العلاقة) */
export async function listAccessibleDatabases(db: TenantDb, session: SessionData) {
  const pages = await db.page.findMany({
    where: { kind: "DATABASE", deletedAt: null, database: { source: null } },
    select: { id: true, title: true, icon: true, teamspaceId: true, ownerId: true, database: { select: { id: true } } },
    orderBy: { title: "asc" },
  });
  const out: Array<{ id: string; pageId: string; title: string; icon: string | null }> = [];
  const tsLevels = new Map<string, boolean>();
  for (const p of pages) {
    if (!p.database) continue;
    let ok = false;
    if (p.teamspaceId) {
      if (!tsLevels.has(p.teamspaceId)) tsLevels.set(p.teamspaceId, atLeast(await teamspaceLevel(db, session, p.teamspaceId), "VIEW"));
      ok = tsLevels.get(p.teamspaceId)!;
    } else ok = p.ownerId === session.user.id;
    if (ok) out.push({ id: p.database.id, pageId: p.id, title: p.title || "بدون عنوان", icon: p.icon });
  }
  return out;
}

export { assertPageAccess };
