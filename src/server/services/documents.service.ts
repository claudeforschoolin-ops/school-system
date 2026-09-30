/**
 * التوثيق الإلكتروني: مستندات (عقود، إقرارات، سياسات، نماذج) تُرسل للتوقيع، وتوقيع بالرسم أو بالاسم،
 * وأرشفة وبحث نصي، وصفحة تحقق عامة برمز.
 * ---------------------------------------------------------------------
 * - عند الإرسال تُحسب بصمة SHA-256 للنص (والملف المرفق)، ويقفل مشغّل قاعدة البيانات المحتوى بعدها.
 * - بصمة كل توقيع = SHA-256(بصمة المستند | الموقّع | المستخدم | الوقت | الطريقة): أي تغيير لاحق يُكتشف.
 * - الترتيب «بالتسلسل» لا يسمح للموقّع التالي قبل سابقه.
 */
import { createHash, randomBytes } from "node:crypto";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { messageGuardians } from "./guardian-messages";
import { notify } from "./notifications.service";
import { nextNumber } from "./sequence.service";

export const DOC_KIND = { CONTRACT: "عقد", ACKNOWLEDGMENT: "إقرار", POLICY: "سياسة/لائحة", FORM: "نموذج", OTHER: "أخرى" } as const;
export const DOC_STATUS = { DRAFT: "مسودة", SENT: "بانتظار التوقيع", COMPLETED: "مكتمل التوقيع", DECLINED: "مرفوض", CANCELLED: "ملغى" } as const;

/** تطبيع عربي للبحث: إزالة التشكيل وتوحيد الهمزات والتاء المربوطة والألف المقصورة */
export function normalizeArabic(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

function canManage(session: SessionData) {
  const s = resolveScope(session.access, "e_documents", "create");
  return Boolean(s && (s.kind === "all" || s.branchIds.length));
}
function canSeeAll(session: SessionData) {
  return resolveScope(session.access, "e_documents", "view")?.kind === "all";
}

export async function listDocuments(db: TenantDb, session: SessionData, input: { tab: "TO_SIGN" | "SENT" | "ALL" | "ARCHIVE"; q?: string | null }) {
  if (!resolveScope(session.access, "e_documents", "view")) throw forbidden("ليست لديك صلاحية المستندات");
  const q = input.q?.trim() ? normalizeArabic(input.q) : null;
  let ids: string[] | null = null;
  if (q) {
    // بحث نصي: الكلمات كلها (tsvector بالإعداد البسيط) أو تطابق جزئي
    const rows = await rootDb.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "EDocument"
      WHERE "tenantId" = ${session.tenant.id}
        AND (to_tsvector('simple', "searchText") @@ plainto_tsquery('simple', ${q}) OR "searchText" ILIKE ${`%${q}%`})
      LIMIT 500`;
    ids = rows.map((r) => r.id);
  }
  const base = ids ? { id: { in: ids } } : {};
  let where: object;
  if (input.tab === "TO_SIGN") where = { ...base, status: "SENT", signers: { some: { userId: session.user.id, status: "PENDING" } } };
  else if (input.tab === "SENT") where = { ...base, createdById: session.user.id, archivedAt: null };
  else if (input.tab === "ARCHIVE") where = { ...base, ...(canSeeAll(session) ? {} : { OR: [{ createdById: session.user.id }, { signers: { some: { userId: session.user.id } } }] }), OR: [{ archivedAt: { not: null } }, { status: "COMPLETED" }] };
  else where = { ...base, ...(canSeeAll(session) ? {} : { OR: [{ createdById: session.user.id }, { signers: { some: { userId: session.user.id } } }] }) };
  const docs = await db.eDocument.findMany({ where, include: { signers: { orderBy: { order: "asc" }, select: { name: true, status: true, userId: true, signedAt: true } } }, orderBy: { updatedAt: "desc" }, take: 200 });
  const creators = await db.user.findMany({ where: { id: { in: [...new Set(docs.map((d) => d.createdById))] } }, select: { id: true, name: true } });
  const counts = {
    toSign: await db.eDocument.count({ where: { status: "SENT", signers: { some: { userId: session.user.id, status: "PENDING" } } } }),
  };
  return {
    canCreate: canManage(session),
    counts,
    rows: docs.map((d) => ({ id: d.id, number: d.number, title: d.title, kind: d.kind, status: d.status, tags: d.tags, dueDate: d.dueDate, sentAt: d.sentAt, completedAt: d.completedAt, archivedAt: d.archivedAt, updatedAt: d.updatedAt, creator: creators.find((c) => c.id === d.createdById)?.name ?? "—", signed: d.signers.filter((s) => s.status === "SIGNED").length, total: d.signers.length, mine: d.signers.find((s) => s.userId === session.user.id)?.status ?? null })),
  };
}

async function loadVisible(db: TenantDb, session: SessionData, id: string) {
  const d = await db.eDocument.findFirst({ where: { id }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!d) throw notFound("المستند غير موجود");
  const involved = d.createdById === session.user.id || d.signers.some((s) => s.userId === session.user.id);
  if (!involved && !canSeeAll(session)) throw forbidden("المستند لأطرافه فقط");
  return d;
}

export async function getDocument(db: TenantDb, session: SessionData, id: string) {
  const d = await loadVisible(db, session, id);
  const me = d.signers.find((s) => s.userId === session.user.id && s.status === "PENDING") ?? null;
  const turn = me && (d.signingOrder === "PARALLEL" || d.signers.filter((s) => s.order < me.order).every((s) => s.status === "SIGNED"));
  const file = d.fileId ? await db.fileObject.findFirst({ where: { id: d.fileId }, select: { id: true, name: true, mime: true, size: true } }) : null;
  const creator = await db.user.findFirst({ where: { id: d.createdById }, select: { name: true } });
  const integrity = d.contentHash ? (await contentHashOf(session.tenant.id, d.body, d.fileId)) === d.contentHash : null;
  const manager = d.createdById === session.user.id || canSeeAll(session);
  return {
    // عنوان IP ووكيل المتصفح للموقّعين يراهما منشئ المستند ومن يملك الاطلاع الكامل فقط
    doc: { ...d, signers: d.signers.map((s) => ({ ...s, signatureData: s.status === "SIGNED" ? s.signatureData : null, ip: manager || s.userId === session.user.id ? s.ip : null, userAgent: manager || s.userId === session.user.id ? s.userAgent : null })) },
    file,
    creator: creator?.name ?? "—",
    canEdit: d.status === "DRAFT" && d.createdById === session.user.id,
    canManage: manager,
    mySigner: me ? { id: me.id, canSignNow: Boolean(turn) } : null,
    integrity,
  };
}

export interface SignerInput {
  userId: string;
  roleLabel?: string | null;
}

export async function saveDraft(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; kind: keyof typeof DOC_KIND; body: string; fileId?: string | null; tags: string[]; signingOrder: "PARALLEL" | "SEQUENTIAL"; dueDate?: string | null; signers: SignerInput[] }) {
  if (!canManage(session)) throw forbidden("إنشاء المستندات لمن يملك صلاحيتها");
  if (input.title.trim().length < 3) throw badRequest("عنوان المستند مطلوب");
  if (input.body.trim().length < 20 && !input.fileId) throw badRequest("اكتب نص المستند أو أرفق ملفاً");
  const users = await db.user.findMany({ where: { id: { in: input.signers.map((s) => s.userId) }, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true } });
  if (users.length !== new Set(input.signers.map((s) => s.userId)).size) throw badRequest("أحد الموقّعين غير نشط أو مكرر");
  if (input.fileId && !(await db.fileObject.findFirst({ where: { id: input.fileId } }))) throw badRequest("الملف المرفق غير موجود");
  const data = { title: input.title.trim(), kind: input.kind, body: input.body.trim(), fileId: input.fileId ?? null, tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10), signingOrder: input.signingOrder, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null, searchText: normalizeArabic(`${input.title} ${input.body} ${input.tags.join(" ")}`) };
  let docId = input.id ?? null;
  if (docId) {
    const d = await db.eDocument.findFirst({ where: { id: docId } });
    if (!d || d.createdById !== session.user.id) throw forbidden("يعدّل المسودة منشئها");
    if (d.status !== "DRAFT") throw badRequest("المستند المرسل مقفل");
    await db.eDocument.update({ where: { id: docId }, data });
    await db.eDocumentSigner.deleteMany({ where: { documentId: docId } });
  } else {
    const d = await db.eDocument.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "edoc"), verifyCode: randomBytes(9).toString("base64url"), createdById: session.user.id, ...data } });
    docId = d.id;
  }
  for (const [i, s] of input.signers.entries()) {
    await db.eDocumentSigner.create({ data: { tenantId: session.tenant.id, documentId: docId, order: i + 1, userId: s.userId, name: users.find((u) => u.id === s.userId)!.name, roleLabel: s.roleLabel?.trim() || null } });
  }
  return { id: docId };
}

async function contentHashOf(tenantId: string, body: string, fileId: string | null) {
  let fileHash = "";
  if (fileId) {
    const f = await rootDb.fileObject.findFirst({ where: { id: fileId, tenantId } });
    if (f) fileHash = sha(await storage().get(f.storageKey).catch(() => Buffer.from("")));
  }
  return sha(`${body}\u0000${fileHash}`);
}

async function notifySigners(db: TenantDb, session: SessionData, doc: { id: string; title: string; signingOrder: string }, signers: Array<{ userId: string | null; order: number; status: string }>) {
  const pending = signers.filter((s) => s.status === "PENDING");
  const next = doc.signingOrder === "SEQUENTIAL" ? pending.slice(0, 1) : pending;
  const ids = next.map((s) => s.userId).filter(Boolean) as string[];
  await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "APPROVAL", title: `مستند بانتظار توقيعك: ${doc.title}`, link: `/documents/${doc.id}`, actorId: session.user.id, entityType: "EDocument", entityId: doc.id });
  // أولياء الأمور: رسالة نصية أيضاً
  const guardians = await db.guardian.findMany({ where: { userId: { in: ids }, deletedAt: null }, select: { students: { take: 1, select: { studentId: true } } } });
  for (const g of guardians) if (g.students[0]) await messageGuardians(db, session, g.students[0].studentId, "document_to_sign", { document: doc.title }, { link: `/documents/${doc.id}`, title: `مستند بانتظار توقيعك: ${doc.title}` });
}

export async function sendDocument(db: TenantDb, session: SessionData, id: string) {
  const d = await db.eDocument.findFirst({ where: { id }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!d || d.createdById !== session.user.id) throw forbidden("يرسل المستند منشئه");
  if (d.status !== "DRAFT") throw badRequest("أُرسل المستند مسبقاً");
  if (!d.signers.length) throw badRequest("أضف موقّعاً واحداً على الأقل");
  const contentHash = await contentHashOf(session.tenant.id, d.body, d.fileId);
  const sent = await db.eDocument.update({ where: { id }, data: { status: "SENT", contentHash, sentAt: new Date() } });
  await notifySigners(db, session, d, d.signers);
  return sent;
}

export async function signDocument(db: TenantDb, session: SessionData, input: { id: string; method: "DRAW" | "TYPE"; signatureData?: string | null; typedName?: string | null; agree: boolean }, meta: { ip: string | null; userAgent: string | null }) {
  if (!input.agree) throw badRequest("أقرّ بأن هذا توقيعك الإلكتروني للمتابعة");
  const d = await db.eDocument.findFirst({ where: { id: input.id }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!d) throw notFound("المستند غير موجود");
  if (d.status !== "SENT") throw badRequest("المستند ليس بانتظار التوقيع");
  const me = d.signers.find((s) => s.userId === session.user.id && s.status === "PENDING");
  if (!me) throw forbidden("لست موقّعاً على هذا المستند أو وقّعت مسبقاً");
  if (d.signingOrder === "SEQUENTIAL" && d.signers.some((s) => s.order < me.order && s.status !== "SIGNED")) throw badRequest("التوقيع بالتسلسل: بانتظار توقيع من قبلك");
  // سلامة المحتوى قبل التوقيع
  if ((await contentHashOf(session.tenant.id, d.body, d.fileId)) !== d.contentHash) throw badRequest("تغيّر محتوى المستند بعد إرساله؛ لا يمكن توقيعه");
  if (input.method === "DRAW") {
    if (!input.signatureData?.startsWith("data:image/png;base64,") || input.signatureData.length > 200_000) throw badRequest("ارسم توقيعك أولاً");
  } else if (!input.typedName || input.typedName.trim().length < 3) throw badRequest("اكتب اسمك الكامل توقيعاً");
  const signedAt = new Date();
  const signatureHash = sha(`${d.contentHash}|${me.id}|${session.user.id}|${signedAt.toISOString()}|${input.method}`);
  await db.eDocumentSigner.update({ where: { id: me.id }, data: { status: "SIGNED", method: input.method, signatureData: input.method === "DRAW" ? input.signatureData! : null, typedName: input.method === "TYPE" ? input.typedName!.trim() : null, signedAt, signatureHash, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  const after = d.signers.map((s) => (s.id === me.id ? { ...s, status: "SIGNED" } : s));
  if (after.every((s) => s.status === "SIGNED")) {
    await db.eDocument.update({ where: { id: d.id }, data: { status: "COMPLETED", completedAt: signedAt } });
    await notify(db, { tenantId: session.tenant.id, userIds: [d.createdById], type: "APPROVAL", title: `اكتمل توقيع: ${d.title}`, link: `/documents/${d.id}`, actorId: session.user.id, entityType: "EDocument", entityId: d.id });
  } else if (d.signingOrder === "SEQUENTIAL") {
    await notifySigners(db, session, d, after);
  }
  return { ok: true, signatureHash };
}

export async function declineDocument(db: TenantDb, session: SessionData, input: { id: string; reason: string }) {
  if (input.reason.trim().length < 3) throw badRequest("اذكر سبب الرفض");
  const d = await db.eDocument.findFirst({ where: { id: input.id }, include: { signers: true } });
  if (!d || d.status !== "SENT") throw badRequest("المستند ليس بانتظار التوقيع");
  const me = d.signers.find((s) => s.userId === session.user.id && s.status === "PENDING");
  if (!me) throw forbidden("لست موقّعاً على هذا المستند");
  await db.eDocumentSigner.update({ where: { id: me.id }, data: { status: "DECLINED", declineReason: input.reason.trim(), signedAt: new Date() } });
  await db.eDocument.update({ where: { id: d.id }, data: { status: "DECLINED" } });
  await notify(db, { tenantId: session.tenant.id, userIds: [d.createdById], type: "APPROVAL", title: `رُفض توقيع: ${d.title}`, body: `${session.user.name}: ${input.reason.trim()}`, link: `/documents/${d.id}`, actorId: session.user.id });
  return { ok: true };
}

export async function cancelDocument(db: TenantDb, session: SessionData, id: string) {
  const d = await db.eDocument.findFirst({ where: { id } });
  if (!d || (d.createdById !== session.user.id && !canSeeAll(session))) throw forbidden();
  if (d.status === "COMPLETED") throw badRequest("المستند المكتمل يُؤرشف ولا يُلغى");
  if (d.status === "DRAFT") {
    await db.eDocumentSigner.deleteMany({ where: { documentId: id } });
    await db.eDocument.delete({ where: { id } });
    return { ok: true, deleted: true };
  }
  await db.eDocument.update({ where: { id }, data: { status: "CANCELLED" } });
  return { ok: true, deleted: false };
}

export async function archiveDocument(db: TenantDb, session: SessionData, input: { id: string; archived: boolean }) {
  const d = await db.eDocument.findFirst({ where: { id: input.id } });
  if (!d || (d.createdById !== session.user.id && !canSeeAll(session))) throw forbidden();
  return db.eDocument.update({ where: { id: input.id }, data: { archivedAt: input.archived ? new Date() : null } });
}

export async function remindSigners(db: TenantDb, session: SessionData, id: string) {
  const d = await db.eDocument.findFirst({ where: { id }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!d || d.createdById !== session.user.id) throw forbidden();
  if (d.status !== "SENT") throw badRequest("لا موقّعين بالانتظار");
  await notifySigners(db, session, d, d.signers);
  await db.eDocumentSigner.updateMany({ where: { documentId: id, status: "PENDING" }, data: { remindedAt: new Date() } });
  return { ok: true };
}

/** التحقق العام برمز المستند (بلا تسجيل دخول): لا يكشف النص، بل الحالة والموقّعين والبصمات */
export async function verifyDocument(code: string) {
  const d = await rootDb.eDocument.findFirst({ where: { verifyCode: code }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!d || d.status === "DRAFT") return null;
  const tenant = await rootDb.tenant.findUniqueOrThrow({ where: { id: d.tenantId }, select: { name: true, platformName: true } });
  return {
    school: tenant.name,
    platform: tenant.platformName,
    number: d.number,
    title: d.title,
    kind: d.kind,
    status: d.status,
    contentHash: d.contentHash,
    sentAt: d.sentAt,
    completedAt: d.completedAt,
    signers: d.signers.map((s) => ({ name: s.name, roleLabel: s.roleLabel, status: s.status, signedAt: s.signedAt, method: s.method, signatureHash: s.signatureHash })),
  };
}

/** المستخدمون المتاحون كموقّعين (موظفون وأولياء أمور) */
export async function signerOptions(db: TenantDb, session: SessionData, q: string) {
  if (!canManage(session)) throw forbidden();
  const term = q.trim();
  const users = await db.user.findMany({ where: { deletedAt: null, status: "ACTIVE", ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } : {}) }, select: { id: true, name: true, jobTitle: true, roles: { select: { role: { select: { key: true, name: true } } } } }, orderBy: { name: "asc" }, take: 30 });
  return users.map((u) => ({ id: u.id, name: u.name, label: u.jobTitle ?? u.roles.map((r) => r.role.name).join("، "), isGuardian: u.roles.some((r) => r.role.key === "PARENT") }));
}
