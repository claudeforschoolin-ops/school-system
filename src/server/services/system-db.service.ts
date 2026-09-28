/**
 * طبقة المجموعات النظامية فوق محرك قواعد البيانات:
 * - تنشئ صفحة قاعدة البيانات وخصائصها وعروضها الافتراضية لكل مجموعة (مرة واحدة لكل مدرسة)
 * - تحوّل الكيانات المخصصة إلى سجلات يعرضها المحرك، وتوجّه التعديلات إلى منطق الوحدة وقواعدها
 * - الصلاحية هنا من وحدة الصلاحيات (RBAC) لا من مساحة الفريق، ونطاق السجلات يطبّقه كل مصدر.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { PropertyType as DbPropertyType, ViewType as DbViewType } from "@/generated/prisma/enums";
import type { AccessLevelName } from "@/lib/access-levels";
import { resolveViewConfig } from "@/lib/database/defaults";
import { TITLE_KEY, type PropertyDef, type SelectOption } from "@/lib/database/types";
import { positionBetween } from "@/lib/position";
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { COLLECTIONS } from "@/server/collections/registry";
import type { CollectionCtx, SystemCollection, SystemRow } from "@/server/collections/types";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function collectionFor(source: string): SystemCollection {
  const c = COLLECTIONS[source];
  if (!c) throw notFound("مصدر البيانات غير معروف");
  return c;
}

export function systemAccessLevel(session: SessionData, source: string): AccessLevelName {
  const c = collectionFor(source);
  if (!can(session.access, c.module, "view")) return "NONE";
  if (can(session.access, c.module, "delete")) return "FULL";
  if (can(session.access, c.module, "update")) return "EDIT";
  return "VIEW";
}

/** ينشئ قاعدة البيانات النظامية إن لم توجد، ويضيف أي خصائص نظامية جديدة */
export async function ensureSystemDatabase(db: TenantDb, tenantId: string, source: string, actorId: string | null = null) {
  const c = collectionFor(source);
  const existing = await db.database.findFirst({ where: { source }, include: { properties: true } });
  if (existing) {
    const known = new Set(existing.properties.map((p) => p.systemKey).filter(Boolean));
    let pos = Math.max(0, ...existing.properties.map((p) => p.position));
    for (const seed of c.properties) {
      if (known.has(seed.key)) continue;
      pos += 1024;
      await db.databaseProperty.create({
        data: { tenantId, databaseId: existing.id, name: seed.name, type: seed.type as DbPropertyType, config: json(seedConfig(seed)), systemKey: seed.key, position: pos, createdById: actorId },
      });
    }
    return { databaseId: existing.id, pageId: existing.pageId };
  }

  const teamspace = await db.teamspace.findFirst({ where: { key: c.teamspace, deletedAt: null } });
  const last = teamspace ? await db.page.findFirst({ where: { teamspaceId: teamspace.id, parentId: null }, orderBy: { position: "desc" } }) : null;
  return db.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        tenantId,
        kind: "DATABASE",
        teamspaceId: teamspace?.id ?? null,
        ownerId: teamspace ? null : actorId,
        title: c.page.title,
        icon: c.page.icon,
        description: c.page.description,
        fullWidth: true,
        systemKey: `collection:${source}`,
        position: positionBetween(last?.position ?? null, null),
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const database = await tx.database.create({ data: { tenantId, pageId: page.id, source, titleLabel: c.titleLabel, createdById: actorId, updatedById: actorId } });
    const keyToId: Record<string, string> = { [TITLE_KEY]: TITLE_KEY };
    let pos = 0;
    for (const seed of c.properties) {
      pos += 1024;
      const prop = await tx.databaseProperty.create({
        data: { tenantId, databaseId: database.id, name: seed.name, type: seed.type as DbPropertyType, config: json(seedConfig(seed)), systemKey: seed.key, position: pos, createdById: actorId },
      });
      keyToId[seed.key] = prop.id;
    }
    let vpos = 0;
    for (const view of c.views) {
      vpos += 1024;
      await tx.databaseView.create({
        data: { tenantId, databaseId: database.id, name: view.name, type: view.type as DbViewType, config: json(resolveViewConfig({ openIn: "page", ...view.config }, keyToId)), position: vpos, createdById: actorId },
      });
    }
    return { databaseId: database.id, pageId: page.id };
  });
}

function seedConfig(seed: SystemCollection["properties"][number]) {
  return { ...(seed.config ?? {}), ...(seed.readOnly ? { systemReadOnly: true } : {}), ...(seed.dynamicOptions ? { dynamicOptions: true } : {}) };
}

/** معرّف قاعدة البيانات النظامية لمصدر (مع إنشائها عند الحاجة) */
export async function systemDatabaseId(db: TenantDb, session: SessionData, source: string): Promise<string> {
  const found = await db.database.findFirst({ where: { source }, select: { id: true } });
  if (found) return found.id;
  return (await ensureSystemDatabase(db, session.tenant.id, source, session.user.id)).databaseId;
}

/** يدمج الخيارات المولَّدة من البيانات في خصائص المجموعة */
export async function withDynamicOptions(ctx: CollectionCtx, source: string, properties: PropertyDef[]): Promise<PropertyDef[]> {
  const c = collectionFor(source);
  if (!c.options) return properties;
  const options = await c.options(ctx);
  return properties.map((p) => {
    if (!p.systemKey || !options[p.systemKey]) return p;
    return { ...p, config: { ...p.config, options: mergeOptions(p.config.options ?? [], options[p.systemKey]!) } };
  });
}

/** الخيارات من البيانات مع الإبقاء على ألوان/أسماء عدّلها المستخدم */
function mergeOptions(saved: SelectOption[], live: SelectOption[]): SelectOption[] {
  const byId = new Map(saved.map((o) => [o.id, o]));
  return live.map((o) => ({ ...o, color: byId.get(o.id)?.color ?? o.color }));
}

export function bundleSystemMeta(session: SessionData, source: string) {
  const c = collectionFor(source);
  return { source, module: c.module, href: c.href("{id}"), createLabel: c.createLabel, titleEditable: c.titleEditable, canCreate: can(session.access, c.module, "create") };
}

function toClientRow(r: SystemRow, keyToId: Map<string, string>, customIds: Set<string>) {
  const values: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(r.values)) {
    const id = keyToId.get(key);
    if (id && v !== null && v !== undefined) values[id] = v;
  }
  for (const [id, v] of Object.entries(r.custom)) if (customIds.has(id) && v !== null && v !== undefined) values[id] = v;
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    icon: r.icon ?? null,
    cover: r.cover ?? null,
    values,
    position: r.position,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdById: r.createdById,
    updatedById: r.updatedById,
  };
}

async function propertyMaps(db: TenantDb, databaseId: string) {
  const props = await db.databaseProperty.findMany({ where: { databaseId } });
  const keyToId = new Map(props.filter((p) => p.systemKey).map((p) => [p.systemKey!, p.id]));
  const customIds = new Set(props.filter((p) => !p.systemKey).map((p) => p.id));
  return { props, keyToId, customIds };
}

export async function listSystemRows(db: TenantDb, session: SessionData, databaseId: string, source: string) {
  const c = collectionFor(source);
  const { keyToId, customIds } = await propertyMaps(db, databaseId);
  const rows = await c.list({ db, session });
  return rows.map((r) => toClientRow(r, keyToId, customIds));
}

export interface SystemRowInput {
  title?: string;
  values?: Record<string, unknown>;
  beforeRowId?: string | null;
  afterRowId?: string | null;
  move?: boolean;
}

export async function updateSystemRow(db: TenantDb, session: SessionData, databaseId: string, source: string, rowId: string, input: SystemRowInput) {
  const c = collectionFor(source);
  const ctx = { db, session };
  if (!can(session.access, c.module, "update")) throw forbidden();
  const { toPropertyDef, sanitizeValue } = await import("./database.service");
  const raw = await db.databaseProperty.findMany({ where: { databaseId } });
  const properties = await withDynamicOptions(ctx, source, raw.map(toPropertyDef));
  const byId = new Map(properties.map((p) => [p.id, p]));

  const values: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const [propId, value] of Object.entries(input.values ?? {})) {
    const prop = byId.get(propId);
    if (!prop) throw badRequest("خاصية غير موجودة في قاعدة البيانات");
    if (prop.config.systemReadOnly) throw badRequest(`«${prop.name}» يُعدَّل من صفحة التفاصيل`);
    const clean = await sanitizeValue(db, prop, value);
    if (prop.systemKey) values[prop.systemKey] = clean;
    else custom[prop.id] = clean;
  }
  if (input.title !== undefined && !c.titleEditable) throw badRequest(`«${c.titleLabel}» يُعدَّل من صفحة التفاصيل`);

  let position: number | undefined;
  if (input.move) {
    const [before, after] = await Promise.all([
      input.beforeRowId ? c.get(ctx, input.beforeRowId) : null,
      input.afterRowId ? c.get(ctx, input.afterRowId) : null,
    ]);
    position = positionBetween(before?.position ?? null, after?.position ?? null);
  }

  const current = await c.get(ctx, rowId);
  if (!current) throw notFound("السجل غير موجود أو خارج نطاق صلاحيتك");
  await c.update(ctx, rowId, { values, custom: Object.keys(custom).length ? custom : undefined, title: input.title, position });
  const fresh = await c.get(ctx, rowId);
  if (!fresh) throw notFound();
  const { keyToId, customIds } = await propertyMaps(db, databaseId);
  return toClientRow(fresh, keyToId, customIds);
}

export async function trashSystemRows(db: TenantDb, session: SessionData, source: string, rowIds: string[], restore = false) {
  const c = collectionFor(source);
  const fn = restore ? c.restore : c.trash;
  if (!fn || !can(session.access, c.module, "delete")) throw forbidden(restore ? "لا يمكن استرجاع هذه السجلات" : "لا يمكن حذف هذه السجلات من هنا");
  for (const id of rowIds) await fn({ db, session }, id);
  return { count: rowIds.length };
}
