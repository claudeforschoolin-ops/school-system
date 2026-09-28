/**
 * تنزيل/عرض ملف: متاح لمستخدمي المستأجر نفسه فقط.
 */
import { getCurrentSession } from "@/server/auth/current";
import { rootDb } from "@/server/db/client";
import { storage } from "@/server/storage";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return new Response("غير مصرح", { status: 401 });
  const { id } = await ctx.params;
  const file = await rootDb.fileObject.findFirst({ where: { id, tenantId: session.tenant.id } });
  if (!file) return new Response("غير موجود", { status: 404 });
  const data = await storage().get(file.storageKey).catch(() => null);
  if (!data) return new Response("غير موجود", { status: 404 });
  const disposition = INLINE.has(file.mime) ? "inline" : "attachment";
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": file.mime,
      "content-length": String(data.length),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
