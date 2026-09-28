/**
 * البحث الشامل (لوحة الأوامر): الصفحات، سجلات قواعد البيانات، المستخدمون، الأحداث.
 * النتائج مقيدة بصلاحيات المستخدم.
 */
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { visibleTeamspaces } from "./access.service";

export async function globalSearch(db: TenantDb, session: SessionData, query: string) {
  const q = query.trim();
  if (q.length < 1) return { pages: [], rows: [], users: [], events: [] };
  const teamspaces = await visibleTeamspaces(db, session);
  const teamspaceIds = teamspaces.map((t) => t.id);
  const pageAccess = {
    deletedAt: null,
    OR: [
      { teamspaceId: { in: teamspaceIds } },
      { teamspaceId: null, ownerId: session.user.id },
      { shares: { some: { userId: session.user.id } } },
    ],
  };
  const contains = { contains: q, mode: "insensitive" as const };
  const [pages, rows, users, events] = await Promise.all([
    db.page.findMany({
      where: { ...pageAccess, title: contains },
      select: { id: true, title: true, icon: true, kind: true, teamspaceId: true, parent: { select: { title: true } } },
      take: 12,
      orderBy: { updatedAt: "desc" },
    }),
    db.databaseRow.findMany({
      where: { deletedAt: null, title: contains, database: { page: pageAccess } },
      select: { id: true, title: true, icon: true, number: true, database: { select: { page: { select: { id: true, title: true, icon: true } } } } },
      take: 12,
      orderBy: { updatedAt: "desc" },
    }),
    can(session.access, "workspace", "view")
      ? db.user.findMany({
          where: { deletedAt: null, status: { not: "SUSPENDED" }, OR: [{ name: contains }, { email: contains }, { jobTitle: contains }] },
          select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true },
          take: 8,
        })
      : Promise.resolve([]),
    can(session.access, "events", "view")
      ? db.calendarEvent.findMany({
          where: { deletedAt: null, title: contains },
          select: { id: true, title: true, startAt: true, category: true },
          take: 6,
          orderBy: { startAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const tsName = new Map(teamspaces.map((t) => [t.id, t.name]));
  return {
    pages: pages.map((p) => ({ ...p, context: p.parent?.title ?? (p.teamspaceId ? tsName.get(p.teamspaceId) : "خاص") ?? null })),
    rows,
    users,
    events,
  };
}
