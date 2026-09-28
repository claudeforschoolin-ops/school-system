/**
 * عرض سجل التدقيق مع البحث والتصفية — قراءة فقط (لا تعديل ولا حذف).
 */
import type { TenantDb } from "@/server/db/tenant";

export interface AuditQuery {
  userId?: string | null;
  entityType?: string | null;
  action?: string | null;
  from?: Date | null;
  to?: Date | null;
  search?: string | null;
  entityId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export function auditWhere(q: AuditQuery) {
  return {
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.search?.trim()
      ? {
          OR: [
            { summary: { contains: q.search.trim(), mode: "insensitive" as const } },
            { userName: { contains: q.search.trim(), mode: "insensitive" as const } },
            { ip: { contains: q.search.trim() } },
          ],
        }
      : {}),
  };
}

export async function listAudit(db: TenantDb, q: AuditQuery) {
  const limit = Math.min(q.limit ?? 50, 200);
  const items = await db.auditLog.findMany({
    where: auditWhere(q),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export async function auditFacets(db: TenantDb) {
  const [entityTypes, actions, users] = await Promise.all([
    db.auditLog.groupBy({ by: ["entityType"], _count: { _all: true }, orderBy: { entityType: "asc" } }),
    db.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
    db.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    entityTypes: entityTypes.map((e) => ({ value: e.entityType, count: e._count._all })),
    actions: actions.map((a) => ({ value: a.action, count: a._count._all })),
    users,
  };
}

/** سجل نشاط عنصر محدد (للخط الزمني في صفحة السجل) */
export async function entityActivity(db: TenantDb, entityType: string, entityId: string, limit = 50) {
  return db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, action: true, userName: true, userId: true, createdAt: true, oldValue: true, newValue: true, summary: true },
  });
}
