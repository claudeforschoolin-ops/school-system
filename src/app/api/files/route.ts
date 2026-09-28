/**
 * رفع ملف: يتطلب جلسة، يتحقق من النوع والحجم والتوقيع، ويُسجَّل في التدقيق.
 */
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/server/auth/current";
import { createTenantDb } from "@/server/db/tenant";
import { rateLimit } from "@/server/auth/rate-limit";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, sniffMatches, storage } from "@/server/storage";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return json({ error: "يجب تسجيل الدخول أولاً" }, 401);
  if (!rateLimit(`upload:${session.user.id}`, 60, 10 * 60 * 1000).allowed) return json({ error: "رفع كثير خلال وقت قصير" }, 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "لم يُرفق ملف" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "حجم الملف يتجاوز ٢٠ ميجابايت" }, 413);
  const ext = ALLOWED_MIME[file.type];
  if (!ext) return json({ error: "نوع الملف غير مسموح" }, 415);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffMatches(file.type, buf)) return json({ error: "محتوى الملف لا يطابق نوعه" }, 415);

  const key = `${session.tenant.id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await storage().put(key, buf, file.type);
  const db = createTenantDb({
    tenantId: session.tenant.id,
    actor: { id: session.user.id, name: session.user.name },
    ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
    userAgent: req.headers.get("user-agent"),
  });
  const record = await db.fileObject.create({
    data: {
      tenantId: session.tenant.id,
      storageKey: key,
      name: file.name.slice(0, 255) || `ملف.${ext}`,
      mime: file.type,
      size: file.size,
      uploadedById: session.user.id,
    },
  });
  return json({ id: record.id, name: record.name, url: `/api/files/${record.id}`, size: record.size, mime: record.mime });
}
