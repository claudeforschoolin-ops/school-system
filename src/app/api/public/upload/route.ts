/**
 * رفع مرفقات نموذج القبول العام دون تسجيل دخول: PDF وصور فقط، ٥ م.ب كحد أقصى،
 * مع حدّ للمحاولات لكل عنوان IP. الملفات لا تُعرض إلا لموظفي المدرسة المسجلين.
 */
import { randomUUID } from "node:crypto";
import { rootDb } from "@/server/db/client";
import { rateLimit } from "@/server/auth/rate-limit";
import { ALLOWED_MIME, sniffMatches, storage } from "@/server/storage";

const PUBLIC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`public-upload:${ip}`, 15, 60 * 60 * 1000).allowed) return json({ error: "عدد كبير من الملفات. حاول لاحقاً" }, 429);
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const tenant = await rootDb.tenant.findUnique({ where: { slug } });
  const settings = (tenant?.settings ?? {}) as { admissions?: { publicFormEnabled?: boolean } };
  if (!tenant || settings.admissions?.publicFormEnabled === false) return json({ error: "نموذج التقديم غير متاح" }, 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "لم يُرفق ملف" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "الحد الأقصى ٥ ميجابايت" }, 413);
  if (!PUBLIC_TYPES.has(file.type)) return json({ error: "المسموح: PDF أو صورة" }, 415);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffMatches(file.type, buf)) return json({ error: "محتوى الملف لا يطابق نوعه" }, 415);
  const key = `${tenant.id}/public/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ALLOWED_MIME[file.type]}`;
  await storage().put(key, buf, file.type);
  const record = await rootDb.fileObject.create({ data: { tenantId: tenant.id, storageKey: key, name: file.name.slice(0, 255) || "مرفق", mime: file.type, size: file.size, uploadedById: null } });
  return json({ id: record.id, name: record.name, url: `/api/files/${record.id}`, size: record.size, mime: record.mime });
}
