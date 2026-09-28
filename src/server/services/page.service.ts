/**
 * خدمة الصفحات: الشجرة الهرمية، الإنشاء والتعديل والنقل، سلة المهملات،
 * النسخ والإصدارات، المشاركة، المفضلة والصفحات الأخيرة.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { AccessLevel } from "@/generated/prisma/enums";
import { atLeast, type AccessLevelName } from "@/lib/access-levels";
import { docToPlainText, extractDocMentions } from "@/lib/mentions";
import { positionBetween } from "@/lib/position";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, forbidden, notFound } from "@/server/errors";
import { assertPageAccess, assertTargetAccess, resolvePageAccess, teamspaceLevel, visibleTeamspaces } from "./access.service";
import { createDatabaseRecords } from "./database.service";
import { notify } from "./notifications.service";

const json = (v: unknown) => v as Prisma.InputJsonValue;

const TREE_SELECT = {
  id: true,
  title: true,
  icon: true,
  kind: true,
  parentId: true,
  teamspaceId: true,
  ownerId: true,
  position: true,
  systemKey: true,
} as const;

export async function sidebarTree(db: TenantDb, session: SessionData) {
  const teamspaces = await visibleTeamspaces(db, session);
  const teamspaceIds = teamspaces.map((t) => t.id);
  const [pages, shares, favorites] = await Promise.all([
    db.page.findMany({
      where: {
        deletedAt: null,
        OR: [{ teamspaceId: { in: teamspaceIds } }, { teamspaceId: null, ownerId: session.user.id }],
      },
      select: TREE_SELECT,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.pageShare.findMany({ where: { userId: session.user.id }, select: { pageId: true, level: true } }),
    listFavorites(db, session),
  ]);

  const knownIds = new Set(pages.map((p) => p.id));
  const sharedRootIds = shares.map((s) => s.pageId).filter((id) => !knownIds.has(id));
  const shared = sharedRootIds.length
    ? await db.page.findMany({ where: { id: { in: sharedRootIds }, deletedAt: null }, select: TREE_SELECT })
    : [];

  return {
    teamspaces: teamspaces.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      icon: t.icon,
      description: t.description,
      level: t.level,
      isMember: t.isMember,
    })),
    pages,
    shared: shared.map((p) => ({ ...p, parentId: null })),
    favorites,
  };
}

// ---------------------------------------------------------------------
// الإصدارات والإشارات
// ---------------------------------------------------------------------

const VERSION_WINDOW_MS = 10 * 60 * 1000;
const MAX_VERSIONS = 100;

/** يحفظ نسخة من المحتوى (تُدمج التعديلات المتتالية للمستخدم نفسه خلال ١٠ دقائق) */
export async function recordVersion(
  db: TenantDb,
  session: SessionData,
  targetType: "PAGE" | "ROW",
  targetId: string,
  title: string,
  content: unknown,
) {
  const latest = await db.pageVersion.findFirst({ where: { targetType, targetId }, orderBy: { createdAt: "desc" } });
  if (latest && latest.createdById === session.user.id && Date.now() - latest.createdAt.getTime() < VERSION_WINDOW_MS) {
    await db.pageVersion.update({ where: { id: latest.id }, data: { title, content: json(content) } });
    return;
  }
  await db.pageVersion.create({
    data: { tenantId: session.tenant.id, targetType, targetId, title, content: json(content), createdById: session.user.id },
  });
  const count = await db.pageVersion.count({ where: { targetType, targetId } });
  if (count > MAX_VERSIONS) {
    const old = await db.pageVersion.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: "asc" },
      take: count - MAX_VERSIONS,
      select: { id: true },
    });
    await db.pageVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

/** يشعر المستخدمين المشار إليهم حديثاً في محتوى الصفحة */
export async function notifyDocMentions(
  db: TenantDb,
  session: SessionData,
  oldContent: unknown,
  newContent: unknown,
  target: { link: string; title: string; entityType: string; entityId: string },
) {
  const before = new Set(extractDocMentions(oldContent).filter((m) => m.kind === "user").map((m) => m.id));
  const added = [...new Set(extractDocMentions(newContent).filter((m) => m.kind === "user" && !before.has(m.id)).map((m) => m.id))];
  if (added.length === 0) return;
  await db.mention.createMany({
    data: added.map((userId) => ({
      tenantId: session.tenant.id,
      mentionedUserId: userId,
      mentionedById: session.user.id,
      sourceType: target.entityType === "Page" ? "PAGE" : "ROW",
      sourceId: target.entityId,
      targetType: target.entityType === "Page" ? "PAGE" : "ROW",
      targetId: target.entityId,
    })),
  });
  await notify(db, {
    tenantId: session.tenant.id,
    userIds: added,
    type: "MENTION",
    title: `أشار إليك ${session.user.name} في «${target.title || "بدون عنوان"}»`,
    link: target.link,
    actorId: session.user.id,
    entityType: target.entityType,
    entityId: target.entityId,
  });
}

// ---------------------------------------------------------------------
// القراءة
// ---------------------------------------------------------------------

export async function getPage(db: TenantDb, session: SessionData, pageId: string) {
  const { page, level, ancestors } = await resolvePageAccess(db, session, pageId);
  if (level === "NONE") throw notFound("الصفحة غير موجودة أو لا تملك صلاحية الوصول إليها");
  const [children, database, teamspace, favorite, people] = await Promise.all([
    db.page.findMany({
      where: { parentId: page.id, deletedAt: null },
      select: { id: true, title: true, icon: true, kind: true },
      orderBy: { position: "asc" },
    }),
    page.kind === "DATABASE" ? db.database.findFirst({ where: { pageId: page.id }, select: { id: true } }) : null,
    page.teamspaceId ? db.teamspace.findFirst({ where: { id: page.teamspaceId }, select: { id: true, name: true, icon: true } }) : null,
    db.favorite.findFirst({ where: { userId: session.user.id, targetType: "PAGE", targetId: page.id } }),
    db.user.findMany({
      where: { id: { in: [page.createdById, page.updatedById].filter((x): x is string => Boolean(x)) } },
      select: { id: true, name: true },
    }),
  ]);
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  return {
    page: {
      id: page.id,
      kind: page.kind,
      title: page.title,
      icon: page.icon,
      cover: page.cover,
      description: page.description,
      content: page.content,
      fullWidth: page.fullWidth,
      isLocked: page.isLocked,
      teamspaceId: page.teamspaceId,
      ownerId: page.ownerId,
      parentId: page.parentId,
      systemKey: page.systemKey,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      createdByName: nameOf(page.createdById),
      updatedByName: nameOf(page.updatedById),
    },
    level,
    ancestors,
    teamspace,
    children,
    databaseId: database?.id ?? null,
    isFavorite: Boolean(favorite),
  };
}

// ---------------------------------------------------------------------
// الإنشاء والتعديل
// ---------------------------------------------------------------------

async function resolveDestination(db: TenantDb, session: SessionData, input: { teamspaceId?: string | null; parentId?: string | null }) {
  if (input.parentId) {
    const { page: parent } = await assertPageAccess(db, session, input.parentId, "EDIT");
    if (parent.kind !== "PAGE") throw badRequest("لا يمكن إنشاء صفحة فرعية داخل قاعدة بيانات؛ أضف سجلاً بدلاً من ذلك");
    return { teamspaceId: parent.teamspaceId, ownerId: parent.ownerId, parentId: parent.id };
  }
  if (input.teamspaceId) {
    const level = await teamspaceLevel(db, session, input.teamspaceId);
    if (!atLeast(level, "EDIT")) throw forbidden("لا تملك صلاحية إضافة صفحات إلى هذه المساحة");
    return { teamspaceId: input.teamspaceId, ownerId: null, parentId: null };
  }
  return { teamspaceId: null, ownerId: session.user.id, parentId: null };
}

async function siblingPosition(db: TenantDb, dest: { teamspaceId: string | null; ownerId: string | null; parentId: string | null }, afterPageId?: string | null) {
  const siblingsWhere = {
    parentId: dest.parentId,
    teamspaceId: dest.teamspaceId,
    ...(dest.teamspaceId ? {} : { ownerId: dest.ownerId }),
    deletedAt: null,
  };
  if (afterPageId) {
    const after = await db.page.findFirst({ where: { id: afterPageId, ...siblingsWhere } });
    if (after) {
      const next = await db.page.findFirst({ where: { ...siblingsWhere, position: { gt: after.position } }, orderBy: { position: "asc" } });
      return positionBetween(after.position, next?.position ?? null);
    }
  }
  const last = await db.page.findFirst({ where: siblingsWhere, orderBy: { position: "desc" } });
  return positionBetween(last?.position ?? null, null);
}

export interface CreatePageInput {
  teamspaceId?: string | null;
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  kind?: "PAGE" | "DATABASE";
  afterPageId?: string | null;
  content?: unknown;
}

export async function createPage(db: TenantDb, session: SessionData, input: CreatePageInput) {
  const dest = await resolveDestination(db, session, input);
  const position = await siblingPosition(db, dest, input.afterPageId);
  if (input.kind === "DATABASE") {
    const { page, database } = await createDatabaseRecords(db, {
      tenantId: session.tenant.id,
      userId: session.user.id,
      ownerId: dest.ownerId,
      teamspaceId: dest.teamspaceId,
      parentId: dest.parentId,
      title: input.title ?? "قاعدة بيانات جديدة",
      icon: input.icon ?? "lucide:database",
      position,
    });
    return { id: page.id, kind: page.kind, databaseId: database.id };
  }
  const page = await db.page.create({
    data: {
      tenantId: session.tenant.id,
      kind: "PAGE",
      teamspaceId: dest.teamspaceId,
      ownerId: dest.ownerId,
      parentId: dest.parentId,
      title: (input.title ?? "").slice(0, 500),
      icon: input.icon ?? null,
      content: input.content === undefined ? undefined : json(input.content),
      position,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  return { id: page.id, kind: page.kind, databaseId: null };
}

export interface UpdatePageInput {
  pageId: string;
  title?: string;
  icon?: string | null;
  cover?: string | null;
  description?: string | null;
  content?: unknown;
  fullWidth?: boolean;
  isLocked?: boolean;
}

export async function updatePage(db: TenantDb, session: SessionData, input: UpdatePageInput) {
  const required: AccessLevelName = input.isLocked !== undefined ? "FULL" : "EDIT";
  const { page } = await assertPageAccess(db, session, input.pageId, required);
  const updated = await db.page.update({
    where: { id: page.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.slice(0, 500) } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
      ...(input.description !== undefined ? { description: input.description?.slice(0, 2000) ?? null } : {}),
      ...(input.content !== undefined ? { content: json(input.content) } : {}),
      ...(input.fullWidth !== undefined ? { fullWidth: input.fullWidth } : {}),
      ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
      updatedById: session.user.id,
    },
  });
  if (input.content !== undefined) {
    await recordVersion(db, session, "PAGE", page.id, updated.title, input.content);
    await notifyDocMentions(db, session, page.content, input.content, {
      link: `/p/${page.id}`,
      title: updated.title,
      entityType: "Page",
      entityId: page.id,
    });
  }
  return { id: updated.id, updatedAt: updated.updatedAt, title: updated.title };
}

async function descendantIds(db: TenantDb, rootId: string, includeDeleted = false): Promise<string[]> {
  const out: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 64; depth++) {
    const children = await db.page.findMany({
      where: { parentId: { in: frontier }, ...(includeDeleted ? {} : { deletedAt: null }) },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    out.push(...frontier);
  }
  return out;
}

export async function movePage(
  db: TenantDb,
  session: SessionData,
  input: { pageId: string; parentId?: string | null; teamspaceId?: string | null; beforeId?: string | null; afterId?: string | null },
) {
  const { page } = await assertPageAccess(db, session, input.pageId, "EDIT");
  let dest: { teamspaceId: string | null; ownerId: string | null; parentId: string | null };
  if (input.parentId === undefined && input.teamspaceId === undefined) {
    dest = { teamspaceId: page.teamspaceId, ownerId: page.ownerId, parentId: page.parentId };
  } else {
    dest = await resolveDestination(db, session, { parentId: input.parentId ?? null, teamspaceId: input.teamspaceId ?? null });
  }
  if (dest.parentId) {
    const descendants = await descendantIds(db, page.id);
    if (dest.parentId === page.id || descendants.includes(dest.parentId)) {
      throw badRequest("لا يمكن نقل الصفحة داخل نفسها أو داخل إحدى صفحاتها الفرعية");
    }
  }
  const [before, after] = await Promise.all([
    input.beforeId ? db.page.findFirst({ where: { id: input.beforeId } }) : null,
    input.afterId ? db.page.findFirst({ where: { id: input.afterId } }) : null,
  ]);
  const position =
    before || after ? positionBetween(before?.position ?? null, after?.position ?? null) : await siblingPosition(db, dest);

  await db.page.update({
    where: { id: page.id },
    data: { parentId: dest.parentId, teamspaceId: dest.teamspaceId, ownerId: dest.ownerId, position, updatedById: session.user.id },
  });
  // نقل الشجرة الفرعية إلى المساحة/المالك الجديد
  if (dest.teamspaceId !== page.teamspaceId || dest.ownerId !== page.ownerId) {
    const ids = await descendantIds(db, page.id, true);
    if (ids.length) {
      await db.page.updateMany({ where: { id: { in: ids } }, data: { teamspaceId: dest.teamspaceId, ownerId: dest.ownerId } });
    }
  }
  return { ok: true };
}

export async function trashPage(db: TenantDb, session: SessionData, pageId: string) {
  const { page } = await assertPageAccess(db, session, pageId, "EDIT");
  if (page.systemKey) throw new AppError("FORBIDDEN", "هذه صفحة نظامية ولا يمكن حذفها");
  const now = new Date();
  const ids = await descendantIds(db, page.id);
  await db.page.update({ where: { id: page.id }, data: { deletedAt: now, updatedById: session.user.id } });
  if (ids.length) await db.page.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
  return { id: page.id, deletedAt: now };
}

export async function restorePage(db: TenantDb, session: SessionData, pageId: string) {
  const { page } = await assertPageAccess(db, session, pageId, "EDIT", { includeDeleted: true });
  if (!page.deletedAt) return { id: page.id };
  let parentId = page.parentId;
  if (parentId) {
    const parent = await db.page.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent) parentId = null; // الأب محذوف: تُستعاد في الجذر
  }
  await db.page.update({ where: { id: page.id }, data: { deletedAt: null, parentId, updatedById: session.user.id } });
  const ids = await descendantIds(db, page.id, true);
  if (ids.length) await db.page.updateMany({ where: { id: { in: ids }, deletedAt: page.deletedAt }, data: { deletedAt: null } });
  return { id: page.id };
}

export async function listTrash(db: TenantDb, session: SessionData) {
  const teamspaces = await visibleTeamspaces(db, session);
  const editable = teamspaces.filter((t) => atLeast(t.level as AccessLevelName, "EDIT")).map((t) => t.id);
  const pages = await db.page.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ teamspaceId: { in: editable } }, { teamspaceId: null, ownerId: session.user.id }],
    },
    select: { id: true, title: true, icon: true, kind: true, parentId: true, deletedAt: true, teamspaceId: true },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });
  // إظهار الجذور المحذوفة فقط (لا الأبناء المحذوفين معها)
  const byId = new Map(pages.map((p) => [p.id, p]));
  return pages.filter((p) => !(p.parentId && byId.get(p.parentId)?.deletedAt?.getTime() === p.deletedAt?.getTime()));
}

/** حذف نهائي من سلة المهملات (للصفحات غير المالية فقط، بصلاحية كاملة) */
export async function purgePage(db: TenantDb, session: SessionData, pageId: string) {
  const { page } = await assertPageAccess(db, session, pageId, "FULL", { includeDeleted: true });
  if (!page.deletedAt) throw badRequest("انقل الصفحة إلى المهملات أولاً");
  const ids = [page.id, ...(await descendantIds(db, page.id, true))];
  for (const id of ids.reverse()) {
    await db.favorite.deleteMany({ where: { targetType: "PAGE", targetId: id } });
    await db.comment.deleteMany({ where: { targetType: "PAGE", targetId: id } });
    await db.pageVersion.deleteMany({ where: { targetType: "PAGE", targetId: id } });
    await db.page.delete({ where: { id } });
  }
  return { count: ids.length };
}

export async function duplicatePage(db: TenantDb, session: SessionData, pageId: string) {
  const { page } = await assertPageAccess(db, session, pageId, "VIEW");
  const dest = await resolveDestination(db, session, page.parentId ? { parentId: page.parentId } : { teamspaceId: page.teamspaceId });
  const next = await db.page.findFirst({
    where: { parentId: dest.parentId, teamspaceId: dest.teamspaceId, deletedAt: null, position: { gt: page.position } },
    orderBy: { position: "asc" },
  });
  const position = positionBetween(page.position, next?.position ?? null);

  if (page.kind === "DATABASE") {
    const source = await db.database.findFirstOrThrow({
      where: { pageId: page.id },
      include: { properties: { orderBy: { position: "asc" } }, views: { where: { isPersonal: false }, orderBy: { position: "asc" } } },
    });
    const created = await createDatabaseRecords(db, {
      tenantId: session.tenant.id,
      userId: session.user.id,
      ownerId: dest.ownerId,
      teamspaceId: dest.teamspaceId,
      parentId: dest.parentId,
      title: `${page.title} (نسخة)`,
      icon: page.icon,
      description: page.description,
      position,
      template: {
        properties: source.properties.map((p) => ({ key: p.id, name: p.name, type: p.type, config: p.config as never })),
        views: source.views.map((v) => ({ name: v.name, type: v.type, config: v.config as never })),
      },
    });
    // نسخ السجلات مع تحويل معرّفات الخصائص
    const rows = await db.databaseRow.findMany({ where: { databaseId: source.id, deletedAt: null }, orderBy: { position: "asc" } });
    let counter = 0;
    for (const row of rows) {
      counter++;
      const values = Object.fromEntries(
        Object.entries((row.values ?? {}) as Record<string, unknown>).map(([k, v]) => [created.keyToId[k] ?? k, v]),
      );
      await db.databaseRow.create({
        data: {
          tenantId: session.tenant.id,
          databaseId: created.database.id,
          number: counter,
          title: row.title,
          icon: row.icon,
          cover: row.cover,
          values: json(values),
          content: row.content === null ? undefined : json(row.content),
          position: row.position,
          createdById: session.user.id,
          updatedById: session.user.id,
        },
      });
    }
    await db.database.update({ where: { id: created.database.id }, data: { rowCounter: counter } });
    return { id: created.page.id };
  }

  const copy = await db.page.create({
    data: {
      tenantId: session.tenant.id,
      kind: "PAGE",
      teamspaceId: dest.teamspaceId,
      ownerId: dest.ownerId,
      parentId: dest.parentId,
      title: `${page.title} (نسخة)`,
      icon: page.icon,
      cover: page.cover,
      description: page.description,
      content: page.content === null ? undefined : json(page.content),
      fullWidth: page.fullWidth,
      position,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  return { id: copy.id };
}

// ---------------------------------------------------------------------
// الإصدارات
// ---------------------------------------------------------------------

export async function listVersions(db: TenantDb, session: SessionData, targetType: "PAGE" | "ROW", targetId: string) {
  await assertTargetAccess(db, session, targetType, targetId, "VIEW");
  const versions = await db.pageVersion.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const authorIds = [...new Set(versions.map((v) => v.createdById).filter((x): x is string => Boolean(x)))];
  const authors = await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, avatarColor: true } });
  return versions.map((v) => ({
    id: v.id,
    title: v.title,
    createdAt: v.createdAt,
    author: authors.find((a) => a.id === v.createdById) ?? null,
    preview: docToPlainText(v.content, 280),
    content: v.content,
  }));
}

export async function restoreVersion(db: TenantDb, session: SessionData, versionId: string) {
  const version = await db.pageVersion.findFirst({ where: { id: versionId } });
  if (!version) throw notFound("النسخة غير موجودة");
  if (version.targetType === "PAGE") {
    await updatePage(db, session, { pageId: version.targetId, content: version.content ?? { type: "doc", content: [] } });
  } else {
    const { updateRow } = await import("./database.service");
    await updateRow(db, session, { rowId: version.targetId, content: version.content ?? { type: "doc", content: [] } });
  }
  return { targetType: version.targetType, targetId: version.targetId };
}

// ---------------------------------------------------------------------
// المشاركة
// ---------------------------------------------------------------------

export async function listShares(db: TenantDb, session: SessionData, pageId: string) {
  const { page, level } = await assertPageAccess(db, session, pageId, "VIEW");
  const shares = await db.pageShare.findMany({ where: { pageId: page.id }, orderBy: { createdAt: "asc" } });
  const users = await db.user.findMany({
    where: { id: { in: [...shares.map((s) => s.userId), page.ownerId ?? ""] } },
    select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true },
  });
  let teamspace: { id: string; name: string; icon: string | null; memberCount: number } | null = null;
  if (page.teamspaceId) {
    const ts = await db.teamspace.findFirst({ where: { id: page.teamspaceId } });
    const memberCount = await db.teamspaceMember.count({ where: { teamspaceId: page.teamspaceId } });
    if (ts) teamspace = { id: ts.id, name: ts.name, icon: ts.icon, memberCount };
  }
  return {
    level,
    canManage: level === "FULL",
    owner: page.ownerId ? (users.find((u) => u.id === page.ownerId) ?? null) : null,
    teamspace,
    shares: shares.map((s) => ({ ...s, user: users.find((u) => u.id === s.userId) ?? null })),
  };
}

export async function setShare(db: TenantDb, session: SessionData, input: { pageId: string; userId: string; level: AccessLevel }) {
  const { page } = await assertPageAccess(db, session, input.pageId, "FULL");
  const user = await db.user.findFirst({ where: { id: input.userId, deletedAt: null, status: "ACTIVE" } });
  if (!user) throw notFound("المستخدم غير موجود");
  if (user.id === page.ownerId) throw badRequest("هذا المستخدم هو مالك الصفحة");
  const existing = await db.pageShare.findFirst({ where: { pageId: page.id, userId: user.id } });
  if (existing) {
    await db.pageShare.update({ where: { id: existing.id }, data: { level: input.level } });
  } else {
    await db.pageShare.create({ data: { tenantId: session.tenant.id, pageId: page.id, userId: user.id, level: input.level } });
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: [user.id],
      type: "SYSTEM",
      title: `شارك ${session.user.name} معك «${page.title || "بدون عنوان"}»`,
      link: `/p/${page.id}`,
      actorId: session.user.id,
      entityType: "Page",
      entityId: page.id,
    });
  }
  return { ok: true };
}

export async function removeShare(db: TenantDb, session: SessionData, input: { pageId: string; userId: string }) {
  const { page } = await assertPageAccess(db, session, input.pageId, "FULL");
  await db.pageShare.deleteMany({ where: { pageId: page.id, userId: input.userId } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// المفضلة والأخيرة
// ---------------------------------------------------------------------

async function resolveTargets(db: TenantDb, items: Array<{ targetType: string; targetId: string }>) {
  const pageIds = items.filter((i) => i.targetType === "PAGE").map((i) => i.targetId);
  const rowIds = items.filter((i) => i.targetType === "ROW").map((i) => i.targetId);
  const [pages, rows] = await Promise.all([
    pageIds.length
      ? db.page.findMany({ where: { id: { in: pageIds }, deletedAt: null }, select: { id: true, title: true, icon: true, kind: true } })
      : [],
    rowIds.length
      ? db.databaseRow.findMany({
          where: { id: { in: rowIds }, deletedAt: null },
          select: { id: true, title: true, icon: true, database: { select: { page: { select: { title: true } } } } },
        })
      : [],
  ]);
  return { pages: new Map(pages.map((p) => [p.id, p])), rows: new Map(rows.map((r) => [r.id, r])) };
}

export async function listFavorites(db: TenantDb, session: SessionData) {
  const favorites = await db.favorite.findMany({ where: { userId: session.user.id }, orderBy: { position: "asc" } });
  const { pages, rows } = await resolveTargets(db, favorites);
  return favorites
    .map((f) => {
      if (f.targetType === "PAGE") {
        const p = pages.get(f.targetId);
        return p ? { id: f.id, targetType: "PAGE" as const, targetId: p.id, title: p.title, icon: p.icon, kind: p.kind, href: `/p/${p.id}` } : null;
      }
      const r = rows.get(f.targetId);
      return r
        ? { id: f.id, targetType: "ROW" as const, targetId: r.id, title: r.title, icon: r.icon, kind: "ROW", href: `/r/${r.id}`, context: r.database.page.title }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export async function toggleFavorite(db: TenantDb, session: SessionData, input: { targetType: "PAGE" | "ROW"; targetId: string }) {
  await assertTargetAccess(db, session, input.targetType, input.targetId, "VIEW");
  const existing = await db.favorite.findFirst({ where: { userId: session.user.id, ...input } });
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    return { isFavorite: false };
  }
  const last = await db.favorite.findFirst({ where: { userId: session.user.id }, orderBy: { position: "desc" } });
  await db.favorite.create({
    data: { tenantId: session.tenant.id, userId: session.user.id, ...input, position: positionBetween(last?.position ?? null, null) },
  });
  return { isFavorite: true };
}

export async function recordVisit(db: TenantDb, session: SessionData, input: { targetType: "PAGE" | "ROW"; targetId: string }) {
  await db.recentVisit.upsert({
    where: { userId_targetType_targetId: { userId: session.user.id, ...input } },
    create: { tenantId: session.tenant.id, userId: session.user.id, ...input },
    update: { visitedAt: new Date() },
  });
}

export async function listRecents(db: TenantDb, session: SessionData, limit = 12) {
  const visits = await db.recentVisit.findMany({ where: { userId: session.user.id }, orderBy: { visitedAt: "desc" }, take: limit * 2 });
  const { pages, rows } = await resolveTargets(db, visits);
  const out = [];
  for (const v of visits) {
    if (out.length >= limit) break;
    if (v.targetType === "PAGE") {
      const p = pages.get(v.targetId);
      if (p) out.push({ targetType: "PAGE" as const, targetId: p.id, title: p.title, icon: p.icon, kind: p.kind, href: `/p/${p.id}`, visitedAt: v.visitedAt, context: null as string | null });
    } else {
      const r = rows.get(v.targetId);
      if (r) out.push({ targetType: "ROW" as const, targetId: r.id, title: r.title, icon: r.icon, kind: "ROW", href: `/r/${r.id}`, visitedAt: v.visitedAt, context: r.database.page.title });
    }
  }
  return out;
}
