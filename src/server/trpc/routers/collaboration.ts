import { z } from "zod";
import * as comments from "@/server/services/comment.service";
import * as approvals from "@/server/services/approval.service";
import * as calendar from "@/server/services/calendar.service";
import * as chat from "@/server/services/chat.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const targetType = z.enum(["PAGE", "ROW"]);

export const commentRouter = router({
  list: authedProcedure.input(z.object({ targetType, targetId: id })).query(({ ctx, input }) => comments.listComments(ctx.db, ctx.session, input)),
  create: authedProcedure
    .input(z.object({ targetType, targetId: id, body: z.string().max(5000), parentId: id.nullish(), propertyId: id.nullish() }))
    .mutation(({ ctx, input }) => comments.createComment(ctx.db, ctx.session, input)),
  update: authedProcedure.input(z.object({ commentId: id, body: z.string().max(5000) })).mutation(({ ctx, input }) => comments.updateComment(ctx.db, ctx.session, input)),
  delete: authedProcedure.input(z.object({ commentId: id })).mutation(({ ctx, input }) => comments.deleteComment(ctx.db, ctx.session, input.commentId)),
  resolve: authedProcedure.input(z.object({ commentId: id, resolved: z.boolean() })).mutation(({ ctx, input }) => comments.resolveComment(ctx.db, ctx.session, input)),
});

const TABS = ["all", "unread", "mentions", "approvals", "archived"] as const;

export const notificationRouter = router({
  list: authedProcedure
    .input(z.object({ tab: z.enum(TABS), cursor: id.nullish() }))
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.session.user.id,
        ...(input.tab === "archived" ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(input.tab === "unread" ? { readAt: null } : {}),
        ...(input.tab === "mentions" ? { type: "MENTION" as const } : {}),
        ...(input.tab === "approvals" ? { type: "APPROVAL" as const } : {}),
      };
      const items = await ctx.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 41,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const actorIds = [...new Set(items.map((n) => n.actorId).filter((x): x is string => Boolean(x)))];
      const actors = await ctx.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, avatarColor: true } });
      const page = items.slice(0, 40);
      return {
        items: page.map((n) => ({ ...n, actor: actors.find((a) => a.id === n.actorId) ?? null })),
        nextCursor: items.length > 40 ? (page[page.length - 1]?.id ?? null) : null,
      };
    }),
  counts: authedProcedure.query(async ({ ctx }) => {
    const base = { userId: ctx.session.user.id, archivedAt: null, readAt: null };
    const [unread, mentions, approvals] = await Promise.all([
      ctx.db.notification.count({ where: base }),
      ctx.db.notification.count({ where: { ...base, type: "MENTION" } }),
      ctx.db.notification.count({ where: { ...base, type: "APPROVAL" } }),
    ]);
    return { unread, mentions, approvals };
  }),
  markRead: authedProcedure.input(z.object({ ids: z.array(id).min(1).max(200), read: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    await ctx.db.notification.updateMany({ where: { id: { in: input.ids }, userId: ctx.session.user.id }, data: { readAt: input.read ? new Date() : null } });
    return { ok: true };
  }),
  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({ where: { userId: ctx.session.user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }),
  archive: authedProcedure.input(z.object({ ids: z.array(id).min(1).max(200), archived: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    await ctx.db.notification.updateMany({
      where: { id: { in: input.ids }, userId: ctx.session.user.id },
      data: input.archived ? { archivedAt: new Date(), readAt: new Date() } : { archivedAt: null },
    });
    return { ok: true };
  }),
});

export const approvalRouter = router({
  list: authedProcedure.query(({ ctx }) => approvals.listApprovals(ctx.db, ctx.session)),
  decide: authedProcedure
    .input(z.object({ requestId: id, decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().max(1000).optional() }))
    .mutation(({ ctx, input }) => approvals.decideApproval(ctx.db, ctx.session, input)),
  cancel: authedProcedure.input(z.object({ requestId: id })).mutation(({ ctx, input }) => approvals.cancelApproval(ctx.db, ctx.session, input.requestId)),
});

const eventInput = z.object({
  title: z.string().max(200),
  description: z.string().max(2000).nullish(),
  category: z.enum(["ACADEMIC", "ADMINISTRATIVE", "EXAM", "MEETING", "HOLIDAY", "ACTIVITY"]),
  location: z.string().max(200).nullish(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  allDay: z.boolean().optional(),
  branchId: id.nullish(),
});

export const calendarRouter = router({
  list: authedProcedure.input(z.object({ from: z.coerce.date(), to: z.coerce.date() })).query(({ ctx, input }) => calendar.listEvents(ctx.db, ctx.session, input)),
  create: authedProcedure.input(eventInput).mutation(({ ctx, input }) => calendar.createEvent(ctx.db, ctx.session, input)),
  update: authedProcedure.input(eventInput.extend({ id })).mutation(({ ctx, input }) => {
    const { id: eventId, ...rest } = input;
    return calendar.updateEvent(ctx.db, ctx.session, eventId, rest);
  }),
  delete: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => calendar.deleteEvent(ctx.db, ctx.session, input.id)),
});

export const chatRouter = router({
  conversations: authedProcedure.query(({ ctx }) => chat.listConversations(ctx.db, ctx.session)),
  start: authedProcedure
    .input(z.object({ userIds: z.array(id).min(1).max(50), title: z.string().max(120).optional() }))
    .mutation(({ ctx, input }) => chat.startConversation(ctx.db, ctx.session, input)),
  messages: authedProcedure
    .input(z.object({ conversationId: id, before: z.coerce.date().optional() }))
    .query(({ ctx, input }) => chat.listMessages(ctx.db, ctx.session, input)),
  send: authedProcedure.input(z.object({ conversationId: id, body: z.string().max(5000) })).mutation(({ ctx, input }) => chat.sendMessage(ctx.db, ctx.session, input)),
  markRead: authedProcedure.input(z.object({ conversationId: id })).mutation(({ ctx, input }) => chat.markConversationRead(ctx.db, ctx.session, input.conversationId)),
});
