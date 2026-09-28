/**
 * التعليقات: على مستوى الصفحة/السجل أو على خاصية محددة، مع الردود والإشارات والحل.
 */
import { extractMentions, plainTextFromBody } from "@/lib/mentions";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { assertTargetAccess } from "./access.service";
import { notify } from "./notifications.service";

type TargetType = "PAGE" | "ROW";

export async function listComments(db: TenantDb, session: SessionData, input: { targetType: TargetType; targetId: string }) {
  await assertTargetAccess(db, session, input.targetType, input.targetId, "VIEW");
  const comments = await db.comment.findMany({
    where: { targetType: input.targetType, targetId: input.targetId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const authorIds = [...new Set(comments.flatMap((c) => [c.authorId, c.resolvedById]).filter((x): x is string => Boolean(x)))];
  const authors = await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, avatarColor: true, avatarUrl: true } });
  const byId = new Map(authors.map((a) => [a.id, a]));
  return comments.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    propertyId: c.propertyId,
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    resolvedAt: c.resolvedAt,
    resolvedBy: c.resolvedById ? (byId.get(c.resolvedById) ?? null) : null,
    author: byId.get(c.authorId) ?? { id: c.authorId, name: "مستخدم محذوف", avatarColor: "slate", avatarUrl: null },
    isMine: c.authorId === session.user.id,
  }));
}

async function targetInfo(db: TenantDb, targetType: TargetType, targetId: string) {
  if (targetType === "PAGE") {
    const page = await db.page.findFirst({ where: { id: targetId }, select: { title: true, createdById: true } });
    return { title: page?.title ?? "", link: `/p/${targetId}`, ownerId: page?.createdById ?? null };
  }
  const row = await db.databaseRow.findFirst({ where: { id: targetId }, select: { title: true, createdById: true } });
  return { title: row?.title ?? "", link: `/r/${targetId}`, ownerId: row?.createdById ?? null };
}

export async function createComment(
  db: TenantDb,
  session: SessionData,
  input: { targetType: TargetType; targetId: string; body: string; parentId?: string | null; propertyId?: string | null },
) {
  const body = input.body.trim();
  if (!body) throw badRequest("لا يمكن إضافة تعليق فارغ");
  if (body.length > 5000) throw badRequest("التعليق طويل جداً");
  await assertTargetAccess(db, session, input.targetType, input.targetId, "COMMENT");
  let parent = null;
  if (input.parentId) {
    parent = await db.comment.findFirst({ where: { id: input.parentId, targetType: input.targetType, targetId: input.targetId } });
    if (!parent) throw notFound("التعليق الأصلي غير موجود");
  }
  const comment = await db.comment.create({
    data: {
      tenantId: session.tenant.id,
      targetType: input.targetType,
      targetId: input.targetId,
      parentId: parent?.parentId ?? parent?.id ?? null,
      propertyId: input.propertyId ?? parent?.propertyId ?? null,
      authorId: session.user.id,
      body,
    },
  });

  const info = await targetInfo(db, input.targetType, input.targetId);
  const mentionedUsers = [...new Set(extractMentions(body).filter((m) => m.kind === "user").map((m) => m.id))];
  if (mentionedUsers.length) {
    await db.mention.createMany({
      data: mentionedUsers.map((userId) => ({
        tenantId: session.tenant.id,
        mentionedUserId: userId,
        mentionedById: session.user.id,
        sourceType: "COMMENT",
        sourceId: comment.id,
        targetType: input.targetType,
        targetId: input.targetId,
      })),
    });
    await notify(db, {
      tenantId: session.tenant.id,
      userIds: mentionedUsers,
      type: "MENTION",
      title: `أشار إليك ${session.user.name} في تعليق على «${info.title || "بدون عنوان"}»`,
      body: plainTextFromBody(body).slice(0, 280),
      link: info.link,
      actorId: session.user.id,
      entityType: "Comment",
      entityId: comment.id,
    });
  }

  // إشعار المشاركين في النقاش وصاحب الصفحة (دون تكرار المشار إليهم)
  const threadRootId = comment.parentId;
  const participants = threadRootId
    ? await db.comment.findMany({ where: { OR: [{ id: threadRootId }, { parentId: threadRootId }] }, select: { authorId: true } })
    : [];
  const recipients = new Set([...participants.map((p) => p.authorId), ...(info.ownerId ? [info.ownerId] : [])]);
  for (const id of mentionedUsers) recipients.delete(id);
  await notify(db, {
    tenantId: session.tenant.id,
    userIds: [...recipients],
    type: "COMMENT",
    title: `${session.user.name} علّق على «${info.title || "بدون عنوان"}»`,
    body: plainTextFromBody(body).slice(0, 280),
    link: info.link,
    actorId: session.user.id,
    entityType: "Comment",
    entityId: comment.id,
  });
  return comment;
}

export async function updateComment(db: TenantDb, session: SessionData, input: { commentId: string; body: string }) {
  const comment = await db.comment.findFirst({ where: { id: input.commentId, deletedAt: null } });
  if (!comment) throw notFound("التعليق غير موجود");
  if (comment.authorId !== session.user.id) throw forbidden("يمكنك تعديل تعليقاتك فقط");
  if (!input.body.trim()) throw badRequest("لا يمكن حفظ تعليق فارغ");
  return db.comment.update({ where: { id: comment.id }, data: { body: input.body.trim().slice(0, 5000) } });
}

export async function deleteComment(db: TenantDb, session: SessionData, commentId: string) {
  const comment = await db.comment.findFirst({ where: { id: commentId, deletedAt: null } });
  if (!comment) throw notFound("التعليق غير موجود");
  if (comment.authorId !== session.user.id) {
    await assertTargetAccess(db, session, comment.targetType as TargetType, comment.targetId, "FULL");
  }
  await db.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });
  return { id: comment.id };
}

export async function resolveComment(db: TenantDb, session: SessionData, input: { commentId: string; resolved: boolean }) {
  const comment = await db.comment.findFirst({ where: { id: input.commentId, deletedAt: null } });
  if (!comment) throw notFound("التعليق غير موجود");
  await assertTargetAccess(db, session, comment.targetType as TargetType, comment.targetId, "COMMENT");
  return db.comment.update({
    where: { id: comment.id },
    data: input.resolved ? { resolvedAt: new Date(), resolvedById: session.user.id } : { resolvedAt: null, resolvedById: null },
  });
}

export async function commentCounts(db: TenantDb, targetType: TargetType, targetIds: string[]) {
  if (targetIds.length === 0) return {};
  const groups = await db.comment.groupBy({
    by: ["targetId"],
    where: { targetType, targetId: { in: targetIds }, deletedAt: null, resolvedAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((g) => [g.targetId, g._count._all]));
}
