/**
 * المهام اليومية للعمليات لكل المدارس: توليد الصيانة الوقائية المستحقة، إنهاء حجوزات المكتبة وتذكير المتأخرين،
 * تنبيهات وثائق الحافلات، وترحيل إهلاك الشهر المنصرم (إن فُعّل في إعدادات المالية).
 * يُستدعى مرة يومياً بترويسة: Authorization: Bearer <CRON_SECRET>
 */
import { timingSafeEqual } from "node:crypto";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { systemSessionFor } from "@/server/auth/session";
import { autoDepreciate } from "@/server/services/finance/assets.service";
import { libraryDaily } from "@/server/services/ops/library.service";
import { runSchedules } from "@/server/services/ops/maintenance.service";
import { readModuleSettings } from "@/server/services/module-settings.service";
import { notifyBusExpiries } from "@/server/services/ops/transport.service";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "غير مصرح" }, { status: 401 });
  const tenants = await rootDb.tenant.findMany({ select: { id: true, settings: true } });
  const results: Array<Record<string, unknown>> = [];
  for (const t of tenants) {
    const session = await systemSessionFor(t.id);
    if (!session) {
      results.push({ tenantId: t.id, skipped: "لا مالك نشط" });
      continue;
    }
    const db = createTenantDb({ tenantId: t.id, actor: { id: session.user.id, name: session.user.name }, ip: null, userAgent: "cron" });
    const r: Record<string, unknown> = { tenantId: t.id };
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        r[name] = await fn();
      } catch (e) {
        r[name] = { error: e instanceof Error ? e.message : "خطأ" };
      }
    };
    await step("maintenance", () => runSchedules(db, session));
    await step("library", () => libraryDaily(db, session));
    await step("buses", () => notifyBusExpiries(db, session));
    if (readModuleSettings(t.settings, "finance").autoDepreciation) await step("depreciation", () => autoDepreciate(db, session));
    results.push(r);
  }
  return Response.json({ ok: true, results });
}
