/**
 * صلاحيات مساحات العمل والصفحات:
 *  - مساحة الفريق: عضوية صريحة أو صلاحية «واسعة» على إحدى وحداتها.
 *  - الصفحة الخاصة: مالكها، أو من شاركها معه.
 *  - الصفحة داخل مساحة: مستوى المساحة مع أي مشاركة إضافية على الصفحة أو أسلافها.
 *  - الصفحة المقفلة: التعديل يقتصر على أصحاب الوصول الكامل.
 */
import { can, hasBroadScope, resolveScope } from "@/lib/rbac/access";
import { atLeast, maxLevel, type AccessLevelName } from "@/lib/access-levels";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { forbidden, notFound } from "@/server/errors";

export interface TeamspaceLike {
  id: string;
  moduleKeys: string[];
}

export function isOwner(session: SessionData): boolean {
  return session.roleKeys.includes("OWNER");
}

/** المستوى الممنوح على مساحة فريق من الأدوار (دون العضوية) */
export function teamspaceLevelFromRoles(session: SessionData, teamspace: TeamspaceLike): AccessLevelName {
  const access = session.access;
  if (!can(access, "workspace", "view")) return "NONE";
  if (isOwner(session)) return "FULL";
  let level: AccessLevelName = "NONE";
  for (const moduleKey of teamspace.moduleKeys) {
    if (hasBroadScope(access, moduleKey, "view")) level = maxLevel(level, "VIEW");
    if (hasBroadScope(access, moduleKey, "update")) level = maxLevel(level, "EDIT");
    const del = resolveScope(access, moduleKey, "delete");
    if (del?.kind === "all") level = maxLevel(level, "FULL");
  }
  return level;
}

/** يطبّق سقف صلاحية «الصفحات وقواعد البيانات» على المستوى */
function capByWorkspacePermission(session: SessionData, level: AccessLevelName): AccessLevelName {
  if (!can(session.access, "workspace", "view")) return "NONE";
  if (level === "NONE") return level;
  if (!can(session.access, "workspace", "update") && atLeast(level, "EDIT")) return "COMMENT";
  return level;
}

export async function visibleTeamspaces(db: TenantDb, session: SessionData) {
  const [teamspaces, memberships] = await Promise.all([
    db.teamspace.findMany({ where: { deletedAt: null }, orderBy: { position: "asc" } }),
    db.teamspaceMember.findMany({ where: { userId: session.user.id } }),
  ]);
  const memberLevel = new Map(memberships.map((m) => [m.teamspaceId, m.level as AccessLevelName]));
  return teamspaces
    .map((ts) => ({
      ...ts,
      level: capByWorkspacePermission(session, maxLevel(teamspaceLevelFromRoles(session, ts), memberLevel.get(ts.id) ?? "NONE")),
      isMember: memberLevel.has(ts.id),
    }))
    .filter((ts) => ts.level !== "NONE");
}

export async function teamspaceLevel(db: TenantDb, session: SessionData, teamspaceId: string): Promise<AccessLevelName> {
  const ts = await db.teamspace.findFirst({ where: { id: teamspaceId, deletedAt: null } });
  if (!ts) return "NONE";
  const member = await db.teamspaceMember.findFirst({ where: { teamspaceId, userId: session.user.id } });
  return capByWorkspacePermission(session, maxLevel(teamspaceLevelFromRoles(session, ts), (member?.level as AccessLevelName) ?? "NONE"));
}

export interface PageAccessResult {
  level: AccessLevelName;
  page: NonNullable<Awaited<ReturnType<TenantDb["page"]["findFirst"]>>>;
  /** سلسلة الأسلاف من الجذر حتى الأب المباشر */
  ancestors: Array<{ id: string; title: string; icon: string | null; kind: string }>;
}

/** يحسب مستوى وصول المستخدم لصفحة (مع سلسلة الأسلاف لمسار التنقل) */
export async function resolvePageAccess(
  db: TenantDb,
  session: SessionData,
  pageId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<PageAccessResult> {
  const page = await db.page.findFirst({ where: { id: pageId, ...(options.includeDeleted ? {} : { deletedAt: null }) } });
  if (!page) throw notFound("الصفحة غير موجودة أو نُقلت إلى المهملات");

  // صفحات المجموعات النظامية: الوصول من صلاحيات الوحدة (RBAC) لا من مساحة الفريق
  if (page.systemKey?.startsWith("collection:")) {
    const { systemAccessLevel } = await import("./system-db.service");
    return { level: systemAccessLevel(session, page.systemKey.slice("collection:".length)), page, ancestors: [] };
  }

  // سلسلة الأسلاف (العمق محدود عملياً)
  const ancestors: PageAccessResult["ancestors"] = [];
  const chainIds = [page.id];
  let parentId = page.parentId;
  for (let depth = 0; parentId && depth < 32; depth++) {
    const parent = await db.page.findFirst({
      where: { id: parentId },
      select: { id: true, title: true, icon: true, kind: true, parentId: true },
    });
    if (!parent) break;
    ancestors.unshift({ id: parent.id, title: parent.title, icon: parent.icon, kind: parent.kind });
    chainIds.push(parent.id);
    parentId = parent.parentId;
  }

  const shares = await db.pageShare.findMany({ where: { pageId: { in: chainIds }, userId: session.user.id } });
  const shareLevel = maxLevel(...shares.map((s) => s.level as AccessLevelName));

  let level: AccessLevelName;
  if (page.teamspaceId) {
    level = maxLevel(await teamspaceLevel(db, session, page.teamspaceId), capByWorkspacePermission(session, shareLevel));
  } else {
    // الصفحات الخاصة خاصة فعلاً: لا يراها حتى مالك النظام ما لم تُشارك معه
    level = page.ownerId === session.user.id ? "FULL" : capByWorkspacePermission(session, shareLevel);
  }

  if (page.isLocked && level === "EDIT") level = "COMMENT";
  return { level, page, ancestors };
}

export async function assertPageAccess(db: TenantDb, session: SessionData, pageId: string, required: AccessLevelName, options?: { includeDeleted?: boolean }) {
  const result = await resolvePageAccess(db, session, pageId, options);
  if (result.level === "NONE") throw notFound("الصفحة غير موجودة أو لا تملك صلاحية الوصول إليها");
  if (!atLeast(result.level, required)) throw forbidden(required === "COMMENT" ? "لا تملك صلاحية التعليق على هذه الصفحة" : "لا تملك صلاحية تعديل هذه الصفحة");
  return result;
}

/** صلاحية قاعدة بيانات = صلاحية صفحتها المضيفة */
export async function assertDatabaseAccess(db: TenantDb, session: SessionData, databaseId: string, required: AccessLevelName) {
  const database = await db.database.findFirst({ where: { id: databaseId } });
  if (!database) throw notFound("قاعدة البيانات غير موجودة");
  const access = await assertPageAccess(db, session, database.pageId, required);
  return { database, ...access };
}

export async function assertRowAccess(db: TenantDb, session: SessionData, rowId: string, required: AccessLevelName, options: { includeDeleted?: boolean } = {}) {
  const row = await db.databaseRow.findFirst({ where: { id: rowId, ...(options.includeDeleted ? {} : { deletedAt: null }) } });
  if (!row) throw notFound("السجل غير موجود أو تم حذفه");
  const access = await assertDatabaseAccess(db, session, row.databaseId, required);
  return { row, ...access };
}

/** الوصول إلى هدف عام (صفحة أو سجل) — للتعليقات والمفضلة والنسخ */
export async function assertTargetAccess(
  db: TenantDb,
  session: SessionData,
  targetType: "PAGE" | "ROW",
  targetId: string,
  required: AccessLevelName,
) {
  if (targetType === "PAGE") return assertPageAccess(db, session, targetId, required);
  return assertRowAccess(db, session, targetId, required);
}
