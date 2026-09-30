/**
 * الدعم الفني والتدريب: تذاكر دعم داخلية (مع ملاحظات داخلية وتقييم)، قاعدة معرفة بمقالات قابلة للبحث،
 * وحالة الجولات الإرشادية لكل مستخدم.
 * ---------------------------------------------------------------------
 * - أي مستخدم يفتح تذكرة ويرى تذاكره؛ فريق الدعم (صلاحية الدعم على كل المدرسة) يرى الكل ويُسند ويرد.
 * - الملاحظات الداخلية لا تظهر لمقدّم التذكرة.
 */
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { normalizeArabic } from "./documents.service";
import { notify } from "./notifications.service";
import { nextNumber } from "./sequence.service";

export const TICKET_CATEGORY = { TECHNICAL: "مشكلة تقنية", ACCOUNT: "الحساب والدخول", DATA: "تصحيح بيانات", TRAINING: "استفسار/تدريب", FEATURE: "اقتراح تحسين", OTHER: "أخرى" } as const;
export const TICKET_STATUS = { OPEN: "مفتوحة", IN_PROGRESS: "قيد المعالجة", WAITING: "بانتظار ردك", RESOLVED: "محلولة", CLOSED: "مغلقة" } as const;

function isAgent(session: SessionData) {
  return resolveScope(session.access, "support", "update")?.kind === "all";
}
function requireSupport(session: SessionData) {
  if (!resolveScope(session.access, "support", "view")) throw forbidden("ليست لديك صلاحية الدعم الفني");
}

async function agents(tenantId: string) {
  const roles = await rootDb.role.findMany({ where: { tenantId, permissions: { some: { module: "support", action: "update", scope: "ALL" } } }, select: { id: true, key: true } });
  const users = await rootDb.userRole.findMany({ where: { tenantId, roleId: { in: roles.filter((r) => r.key !== "OWNER" && r.key !== "PRINCIPAL").map((r) => r.id) }, user: { status: "ACTIVE", deletedAt: null } }, select: { userId: true } });
  return [...new Set(users.map((u) => u.userId))];
}

export async function listTickets(db: TenantDb, session: SessionData, input: { status?: string | null; mine?: boolean }) {
  requireSupport(session);
  const agent = isAgent(session);
  const where = { ...(agent && !input.mine ? {} : { requesterId: session.user.id }), ...(input.status === "ACTIVE" ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } } : input.status ? { status: input.status } : {}) };
  const rows = await db.supportTicket.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 300, include: { _count: { select: { replies: true } } } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.requesterId, r.assigneeId ?? ""]))] } }, select: { id: true, name: true, avatarColor: true } });
  const all = agent ? await db.supportTicket.groupBy({ by: ["status"], _count: true }) : [];
  const resolved = agent ? await db.supportTicket.findMany({ where: { resolvedAt: { not: null }, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, select: { createdAt: true, resolvedAt: true, firstResponseAt: true, satisfaction: true } }) : [];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    agent,
    rows: rows.map((r) => ({ ...r, requester: users.find((u) => u.id === r.requesterId) ?? null, assignee: users.find((u) => u.id === r.assigneeId) ?? null, replies: r._count.replies })),
    stats: agent
      ? {
          byStatus: Object.fromEntries(all.map((s) => [s.status, s._count])) as Record<string, number>,
          avgResolveHours: avg(resolved.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000)),
          avgFirstResponseHours: avg(resolved.filter((r) => r.firstResponseAt).map((r) => (r.firstResponseAt!.getTime() - r.createdAt.getTime()) / 3_600_000)),
          satisfaction: avg(resolved.filter((r) => r.satisfaction).map((r) => r.satisfaction!)),
        }
      : null,
  };
}

export async function getTicket(db: TenantDb, session: SessionData, id: string) {
  requireSupport(session);
  const t = await db.supportTicket.findFirst({ where: { id }, include: { replies: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("التذكرة غير موجودة");
  const agent = isAgent(session);
  if (!agent && t.requesterId !== session.user.id) throw forbidden("التذكرة لمقدّمها وفريق الدعم");
  const users = await db.user.findMany({ where: { id: { in: [...new Set([t.requesterId, t.assigneeId ?? "", ...t.replies.map((r) => r.authorId)])] } }, select: { id: true, name: true, avatarColor: true, jobTitle: true } });
  const team = agent ? await db.user.findMany({ where: { id: { in: await agents(session.tenant.id) } }, select: { id: true, name: true } }) : [];
  return {
    ticket: t,
    replies: t.replies.filter((r) => agent || !r.isInternal).map((r) => ({ ...r, author: users.find((u) => u.id === r.authorId) ?? null, fromAgent: r.authorId !== t.requesterId })),
    requester: users.find((u) => u.id === t.requesterId) ?? null,
    assignee: users.find((u) => u.id === t.assigneeId) ?? null,
    agent,
    team,
  };
}

export async function createTicket(db: TenantDb, session: SessionData, input: { title: string; description: string; category: keyof typeof TICKET_CATEGORY; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; pageUrl?: string | null }) {
  if (!resolveScope(session.access, "support", "create")) throw forbidden("فتح التذاكر غير متاح لدورك");
  if (input.title.trim().length < 5 || input.description.trim().length < 10) throw badRequest("اكتب عنواناً ووصفاً واضحين للمشكلة");
  const t = await db.supportTicket.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "ticket"), title: input.title.trim(), description: input.description.trim(), category: input.category, priority: input.priority, pageUrl: input.pageUrl?.slice(0, 300) ?? null, requesterId: session.user.id } });
  await notify(db, { tenantId: session.tenant.id, userIds: await agents(session.tenant.id), type: "SYSTEM", title: `تذكرة دعم #${t.number}: ${t.title}`, body: `${TICKET_CATEGORY[input.category]} — ${session.user.name}`, link: `/support/${t.id}`, actorId: session.user.id, entityType: "SupportTicket", entityId: t.id });
  return t;
}

export async function replyTicket(db: TenantDb, session: SessionData, input: { id: string; body: string; isInternal?: boolean; status?: "IN_PROGRESS" | "WAITING" | "RESOLVED" | null }) {
  const t = await db.supportTicket.findFirst({ where: { id: input.id } });
  if (!t) throw notFound("التذكرة غير موجودة");
  const agent = isAgent(session);
  if (!agent && t.requesterId !== session.user.id) throw forbidden();
  if (t.status === "CLOSED") throw badRequest("التذكرة مغلقة؛ افتح تذكرة جديدة");
  if (input.body.trim().length < 2) throw badRequest("اكتب الرد");
  const internal = agent && Boolean(input.isInternal);
  await db.supportTicketReply.create({ data: { tenantId: session.tenant.id, ticketId: t.id, authorId: session.user.id, body: input.body.trim(), isInternal: internal } });
  const now = new Date();
  const status = agent ? (input.status ?? (t.status === "OPEN" ? "IN_PROGRESS" : t.status)) : t.status === "WAITING" || t.status === "RESOLVED" ? "OPEN" : t.status;
  await db.supportTicket.update({
    where: { id: t.id },
    data: { status, ...(agent && !internal && !t.firstResponseAt ? { firstResponseAt: now } : {}), ...(status === "RESOLVED" ? { resolvedAt: now } : {}), ...(agent && !t.assigneeId ? { assigneeId: session.user.id } : {}) },
  });
  if (!internal) {
    const to = agent ? [t.requesterId] : t.assigneeId ? [t.assigneeId] : await agents(session.tenant.id);
    await notify(db, { tenantId: session.tenant.id, userIds: to, type: "MESSAGE", title: `رد على تذكرة #${t.number}: ${t.title}`, body: input.body.trim().slice(0, 140), link: `/support/${t.id}`, actorId: session.user.id, entityType: "SupportTicket", entityId: t.id });
  }
  return { ok: true };
}

export async function updateTicket(db: TenantDb, session: SessionData, input: { id: string; status?: keyof typeof TICKET_STATUS; assigneeId?: string | null; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; resolution?: string | null }) {
  if (!isAgent(session)) throw forbidden("لفريق الدعم");
  const t = await db.supportTicket.findFirst({ where: { id: input.id } });
  if (!t) throw notFound("التذكرة غير موجودة");
  return db.supportTicket.update({ where: { id: t.id }, data: { ...(input.status ? { status: input.status } : {}), ...(input.status === "RESOLVED" && !t.resolvedAt ? { resolvedAt: new Date() } : {}), ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}), ...(input.priority ? { priority: input.priority } : {}), ...(input.resolution !== undefined ? { resolution: input.resolution } : {}) } });
}

/** مقدّم التذكرة يغلقها ويقيّم الخدمة */
export async function closeTicket(db: TenantDb, session: SessionData, input: { id: string; satisfaction: number }) {
  const t = await db.supportTicket.findFirst({ where: { id: input.id } });
  if (!t || t.requesterId !== session.user.id) throw forbidden("يغلق التذكرة مقدّمها");
  if (input.satisfaction < 1 || input.satisfaction > 5) throw badRequest("التقييم من ١ إلى ٥");
  return db.supportTicket.update({ where: { id: t.id }, data: { status: "CLOSED", satisfaction: input.satisfaction, resolvedAt: t.resolvedAt ?? new Date() } });
}

// ---------------------------------------------------------------------
// قاعدة المعرفة
// ---------------------------------------------------------------------

export async function listArticles(db: TenantDb, session: SessionData, input: { q?: string | null; category?: string | null }) {
  const canEdit = isAgent(session) || Boolean(resolveScope(session.access, "settings", "update"));
  const q = input.q?.trim() ? normalizeArabic(input.q) : null;
  let ids: string[] | null = null;
  if (q) {
    const rows = await rootDb.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "KnowledgeArticle"
      WHERE "tenantId" = ${session.tenant.id}
        AND (to_tsvector('simple', "searchText") @@ plainto_tsquery('simple', ${q}) OR "searchText" ILIKE ${`%${q}%`})
      LIMIT 100`;
    ids = rows.map((r) => r.id);
  }
  const rows = await db.knowledgeArticle.findMany({ where: { ...(canEdit ? {} : { isPublished: true }), ...(ids ? { id: { in: ids } } : {}), ...(input.category ? { category: input.category } : {}) }, select: { id: true, slug: true, title: true, category: true, summary: true, isPublished: true, views: true, helpfulYes: true, helpfulNo: true, updatedAt: true }, orderBy: [{ category: "asc" }, { title: "asc" }] });
  const categories = [...new Set((await db.knowledgeArticle.findMany({ where: canEdit ? {} : { isPublished: true }, select: { category: true } })).map((r) => r.category))];
  return { rows, categories, canEdit };
}

export async function getArticle(db: TenantDb, session: SessionData, slug: string) {
  const a = await db.knowledgeArticle.findFirst({ where: { slug } });
  const canEdit = isAgent(session) || Boolean(resolveScope(session.access, "settings", "update"));
  if (!a || (!a.isPublished && !canEdit)) throw notFound("المقال غير موجود");
  await rootDb.knowledgeArticle.update({ where: { id: a.id }, data: { views: { increment: 1 } } });
  const related = await db.knowledgeArticle.findMany({ where: { category: a.category, isPublished: true, id: { not: a.id } }, select: { slug: true, title: true }, take: 5 });
  return { article: a, related, canEdit };
}

export async function saveArticle(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; category: string; summary?: string | null; body: string; isPublished: boolean }) {
  if (!isAgent(session) && !resolveScope(session.access, "settings", "update")) throw forbidden("تحرير قاعدة المعرفة لفريق الدعم");
  if (input.title.trim().length < 3 || input.body.trim().length < 20) throw badRequest("العنوان والمحتوى مطلوبان");
  const data = { title: input.title.trim(), category: input.category.trim() || "عام", summary: input.summary?.trim() || null, body: input.body.trim(), isPublished: input.isPublished, searchText: normalizeArabic(`${input.title} ${input.summary ?? ""} ${input.body} ${input.category}`), updatedById: session.user.id };
  if (input.id) return db.knowledgeArticle.update({ where: { id: input.id }, data });
  const base = normalizeArabic(input.title).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "article";
  let slug = base;
  for (let i = 2; await db.knowledgeArticle.findFirst({ where: { slug } }); i++) slug = `${base}-${i}`;
  return db.knowledgeArticle.create({ data: { tenantId: session.tenant.id, slug, ...data } });
}

export async function rateArticle(db: TenantDb, _session: SessionData, input: { id: string; helpful: boolean }) {
  const a = await db.knowledgeArticle.findFirst({ where: { id: input.id } });
  if (!a) throw notFound("المقال غير موجود");
  await rootDb.knowledgeArticle.update({ where: { id: a.id }, data: input.helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// الجولات الإرشادية
// ---------------------------------------------------------------------

export async function completeTour(db: TenantDb, session: SessionData, input: { key: string; reset?: boolean }) {
  const u = await db.user.findFirstOrThrow({ where: { id: session.user.id }, select: { preferences: true } });
  const prefs = (u.preferences ?? {}) as Record<string, unknown>;
  const done = new Set(Array.isArray(prefs.toursDone) ? (prefs.toursDone as string[]) : []);
  if (input.reset) done.delete(input.key);
  else done.add(input.key);
  await rootDb.user.update({ where: { id: session.user.id }, data: { preferences: { ...prefs, toursDone: [...done] } } });
  return { toursDone: [...done] };
}
