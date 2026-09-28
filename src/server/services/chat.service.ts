/**
 * المحادثات الداخلية: فردية وجماعية، مع تتبع غير المقروء.
 */
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";

export async function listConversations(db: TenantDb, session: SessionData) {
  const memberships = await db.conversationMember.findMany({ where: { userId: session.user.id } });
  if (memberships.length === 0) return [];
  const conversations = await db.conversation.findMany({
    where: { id: { in: memberships.map((m) => m.conversationId) } },
    include: {
      members: { select: { userId: true } },
      messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  const userIds = [...new Set(conversations.flatMap((c) => c.members.map((m) => m.userId)))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarColor: true, jobTitle: true } });
  const out = [];
  for (const c of conversations) {
    const membership = memberships.find((m) => m.conversationId === c.id)!;
    const unread = await db.message.count({
      where: {
        conversationId: c.id,
        deletedAt: null,
        authorId: { not: session.user.id },
        ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
      },
    });
    const others = c.members.filter((m) => m.userId !== session.user.id).map((m) => users.find((u) => u.id === m.userId)).filter(Boolean);
    out.push({
      id: c.id,
      kind: c.kind,
      agentKey: c.agentKey,
      title: c.title || others.map((o) => o!.name).join("، ") || "محادثة",
      members: c.members.map((m) => users.find((u) => u.id === m.userId)).filter(Boolean),
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt,
      unread,
    });
  }
  return out;
}

export async function unreadConversations(db: TenantDb, session: SessionData) {
  const list = await listConversations(db, session);
  return list.filter((c) => c.unread > 0).length;
}

export async function startConversation(db: TenantDb, session: SessionData, input: { userIds: string[]; title?: string }) {
  const others = [...new Set(input.userIds.filter((id) => id !== session.user.id))];
  if (others.length === 0) throw badRequest("اختر مستخدماً واحداً على الأقل");
  const valid = await db.user.findMany({ where: { id: { in: others }, deletedAt: null, status: "ACTIVE" }, select: { id: true } });
  if (valid.length !== others.length) throw badRequest("بعض المستخدمين غير موجودين");

  if (others.length === 1 && !input.title) {
    // محادثة فردية: إعادة استخدام المحادثة الموجودة
    const mine = await db.conversationMember.findMany({ where: { userId: session.user.id }, select: { conversationId: true } });
    const existing = await db.conversation.findFirst({
      where: {
        id: { in: mine.map((m) => m.conversationId) },
        kind: "DIRECT",
        members: { some: { userId: others[0] } },
      },
    });
    if (existing) return existing;
  }
  const conversation = await db.conversation.create({
    data: {
      tenantId: session.tenant.id,
      kind: others.length === 1 ? "DIRECT" : "GROUP",
      title: input.title?.trim() || null,
      createdById: session.user.id,
    },
  });
  await db.conversationMember.createMany({
    data: [session.user.id, ...others].map((userId) => ({
      tenantId: session.tenant.id,
      conversationId: conversation.id,
      userId,
      lastReadAt: userId === session.user.id ? new Date() : null,
    })),
  });
  return conversation;
}

async function assertMember(db: TenantDb, session: SessionData, conversationId: string) {
  const member = await db.conversationMember.findFirst({ where: { conversationId, userId: session.user.id } });
  if (!member) throw notFound("المحادثة غير موجودة");
  return member;
}

export async function listMessages(db: TenantDb, session: SessionData, input: { conversationId: string; before?: Date }) {
  await assertMember(db, session, input.conversationId);
  const messages = await db.message.findMany({
    where: { conversationId: input.conversationId, deletedAt: null, ...(input.before ? { createdAt: { lt: input.before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return messages.reverse();
}

export async function sendMessage(db: TenantDb, session: SessionData, input: { conversationId: string; body: string }) {
  await assertMember(db, session, input.conversationId);
  const body = input.body.trim();
  if (!body) throw badRequest("لا يمكن إرسال رسالة فارغة");
  const message = await db.message.create({
    data: { tenantId: session.tenant.id, conversationId: input.conversationId, authorId: session.user.id, body: body.slice(0, 5000) },
  });
  await db.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: message.createdAt } });
  await db.conversationMember.updateMany({
    where: { conversationId: input.conversationId, userId: session.user.id },
    data: { lastReadAt: message.createdAt },
  });
  return message;
}

export async function markConversationRead(db: TenantDb, session: SessionData, conversationId: string) {
  await assertMember(db, session, conversationId);
  await db.conversationMember.updateMany({ where: { conversationId, userId: session.user.id }, data: { lastReadAt: new Date() } });
  return { ok: true };
}
