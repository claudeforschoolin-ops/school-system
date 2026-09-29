/**
 * المهام المالية اليومية لكل المدارس: تذكيرات السداد لأولياء الأمور.
 * يُستدعى من مجدول خارجي (cron) مرة يومياً صباحاً، بترويسة: Authorization: Bearer <CRON_SECRET>
 * التشغيل متكرر بأمان: كل مرحلة تذكير تُرسل مرة واحدة لكل قسط.
 */
import { timingSafeEqual } from "node:crypto";
import { toISODate } from "@/lib/dates";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { runPaymentReminders } from "@/server/services/finance/reminders.service";

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
  const results: Array<{ tenantId: string; families: number; error?: string }> = [];
  for (const t of tenants) {
    const db = createTenantDb({ tenantId: t.id, actor: null, ip: null, userAgent: "cron" });
    try {
      const tenant = {
        id: t.id,
        slug: t.slug,
        name: t.name,
        platformName: t.platformName,
        logoUrl: t.logoUrl,
        accentColor: t.accentColor,
        currency: t.currency,
        timezone: t.timezone,
        settings: (t.settings ?? {}) as Record<string, unknown>,
        isDemo: t.isDemo,
      };
      const r = await runPaymentReminders(db, tenant, null, toISODate(new Date(), t.timezone));
      results.push({ tenantId: t.id, families: r.families });
    } catch (e) {
      results.push({ tenantId: t.id, families: 0, error: e instanceof Error ? e.message : "خطأ" });
    }
  }
  return Response.json({ ok: true, results });
}
