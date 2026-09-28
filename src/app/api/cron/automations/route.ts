/**
 * تشغيل الأتمتة المجدولة (عند بلوغ تاريخ) لكل المدارس.
 * يُستدعى من مجدول خارجي (cron) مرة كل ساعة مثلاً، بترويسة: Authorization: Bearer <CRON_SECRET>
 * التشغيل متكرر بأمان: كل سجل يُنفَّذ مرة واحدة لكل تاريخ.
 */
import { timingSafeEqual } from "node:crypto";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { runScheduledAutomations } from "@/server/services/automation.service";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "غير مصرح" }, { status: 401 });
  const tenants = await rootDb.tenant.findMany({ select: { id: true, timezone: true } });
  const results: Array<{ tenantId: string; runs: number; error?: string }> = [];
  for (const t of tenants) {
    const db = createTenantDb({ tenantId: t.id, actor: null, ip: null, userAgent: "cron" });
    try {
      results.push({ tenantId: t.id, runs: await runScheduledAutomations(db, t.id, t.timezone) });
    } catch (e) {
      results.push({ tenantId: t.id, runs: 0, error: e instanceof Error ? e.message : "خطأ" });
    }
  }
  return Response.json({ ok: true, results });
}
