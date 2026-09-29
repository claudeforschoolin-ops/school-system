/**
 * المهام اليومية للموارد البشرية لكل المدارس: تنبيه انتهاء الهويات والإقامات والجوازات والعقود.
 * يُستدعى من مجدول خارجي مرة يومياً بترويسة: Authorization: Bearer <CRON_SECRET>
 * التنبيه يُرسل في أيام محددة قبل الانتهاء (٦٠، ٣٠، ١٤، ٧، ١، يوم الانتهاء) وللمنتهية.
 */
import { timingSafeEqual } from "node:crypto";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { notifyExpiries } from "@/server/services/hr/employees.service";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "غير مصرح" }, { status: 401 });
  const tenants = await rootDb.tenant.findMany();
  const results: Array<{ tenantId: string; notified: number; error?: string }> = [];
  for (const t of tenants) {
    const db = createTenantDb({ tenantId: t.id, actor: null, ip: null, userAgent: "cron" });
    try {
      const r = await notifyExpiries(db, { tenant: { id: t.id, slug: t.slug, name: t.name, platformName: t.platformName, logoUrl: t.logoUrl, accentColor: t.accentColor, currency: t.currency, timezone: t.timezone, settings: (t.settings ?? {}) as Record<string, unknown>, isDemo: t.isDemo } });
      results.push({ tenantId: t.id, notified: r.notified });
    } catch (e) {
      results.push({ tenantId: t.id, notified: 0, error: e instanceof Error ? e.message : "خطأ" });
    }
  }
  return Response.json({ ok: true, results });
}
