/**
 * تصدير تقرير (محفوظ أو من المنشئ مباشرة) إلى Excel أو CSV بترويسة المدرسة.
 * يُشغَّل بصلاحيات المستخدم الحالي، ويُسجَّل في التدقيق.
 */
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current";
import { createTenantDb } from "@/server/db/tenant";
import { configSchema, exportReport } from "@/server/services/analytics/reports.service";

const body = z.object({ id: z.string().max(64).nullish(), dataset: z.string().max(60).optional(), config: configSchema.optional(), name: z.string().max(120).optional(), format: z.enum(["XLSX", "CSV"]) });

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("طلب غير صالح", { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const db = createTenantDb({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name }, ip, userAgent: req.headers.get("user-agent") });
  try {
    const file = await exportReport(db, session, parsed.data);
    return new Response(new Uint8Array(file.buffer), { headers: { "content-type": file.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "تعذر التصدير", { status: 403 });
  }
}
