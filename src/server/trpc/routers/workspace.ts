import { z } from "zod";
import { can } from "@/lib/rbac/access";
import * as pages from "@/server/services/page.service";
import { globalSearch } from "@/server/services/search.service";
import { myTasks } from "@/server/services/tasks.service";
import { heartbeat, leave } from "@/server/services/presence.service";
import { upcomingEvents } from "@/server/services/calendar.service";
import { unreadConversations } from "@/server/services/chat.service";
import { authedProcedure, router } from "../init";

const target = z.object({ targetType: z.enum(["PAGE", "ROW"]), targetId: z.string().min(1).max(64) });

export const workspaceRouter = router({
  sidebar: authedProcedure.query(({ ctx }) => pages.sidebarTree(ctx.db, ctx.session)),

  /** شارات الشريط الجانبي: غير المقروء في الوارد والمحادثات */
  badges: authedProcedure.query(async ({ ctx }) => {
    const [unreadNotifications, chats] = await Promise.all([
      ctx.db.notification.count({ where: { userId: ctx.session.user.id, readAt: null, archivedAt: null } }),
      unreadConversations(ctx.db, ctx.session),
    ]);
    return { unreadNotifications, unreadChats: chats };
  }),

  upcoming: authedProcedure.query(({ ctx }) => upcomingEvents(ctx.db, ctx.session, 5)),

  myTasks: authedProcedure.query(({ ctx }) => myTasks(ctx.db, ctx.session)),

  recents: authedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(({ ctx, input }) => pages.listRecents(ctx.db, ctx.session, input?.limit ?? 12)),

  favorites: authedProcedure.query(({ ctx }) => pages.listFavorites(ctx.db, ctx.session)),

  toggleFavorite: authedProcedure.input(target).mutation(({ ctx, input }) => pages.toggleFavorite(ctx.db, ctx.session, input)),

  recordVisit: authedProcedure.input(target).mutation(async ({ ctx, input }) => {
    await pages.recordVisit(ctx.db, ctx.session, input);
    return { ok: true };
  }),

  search: authedProcedure
    .input(z.object({ query: z.string().max(200) }))
    .query(({ ctx, input }) => globalSearch(ctx.db, ctx.session, input.query)),

  /** دليل المستخدمين (لاختيار الأشخاص والإشارات) — بيانات أساسية فقط */
  directory: authedProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "INVITED"] } },
      select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true, avatarUrl: true, status: true },
      orderBy: { name: "asc" },
    }),
  ),

  presence: authedProcedure
    .input(z.object({ target: z.string().min(1).max(100), leaving: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      if (input.leaving) {
        leave(ctx.session.tenant.id, input.target, ctx.session.user.id);
        return [];
      }
      return heartbeat(ctx.session.tenant.id, input.target, {
        userId: ctx.session.user.id,
        name: ctx.session.user.name,
        avatarColor: ctx.session.user.avatarColor,
      });
    }),

  /** ملخص الصفحة الرئيسية حسب الدور */
  home: authedProcedure.query(async ({ ctx }) => {
    const { db, session } = ctx;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [unread, pendingApprovals, tasks] = await Promise.all([
      db.notification.count({ where: { userId: session.user.id, readAt: null, archivedAt: null } }),
      db.approvalStep.count({
        where: {
          status: "PENDING",
          request: { status: "PENDING" },
          OR: [
            { approverUserId: session.user.id },
            { approverRoleId: { in: (await db.userRole.findMany({ where: { userId: session.user.id } })).map((r) => r.roleId) } },
          ],
        },
      }),
      myTasks(db, session),
    ]);
    const openTasks = tasks.filter((t) => t.status?.group !== "complete");
    const admin = can(session.access, "users", "view")
      ? await Promise.all([
          db.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
          db.session.count({ where: { revokedAt: null, lastActiveAt: { gte: startOfDay } } }),
          db.auditLog.count({ where: { createdAt: { gte: startOfDay } } }),
          db.user.count({ where: { deletedAt: null, status: "INVITED" } }),
        ]).then(([activeUsers, sessionsToday, auditToday, pendingInvites]) => ({ activeUsers, sessionsToday, auditToday, pendingInvites }))
      : null;
    return {
      unread,
      pendingApprovals,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((t) => t.due && t.due.slice(0, 10) < new Date().toISOString().slice(0, 10)).length,
      admin,
    };
  }),
});
