/**
 * المهام الدورية للمنصة لكل المدارس (تُستدعى كل ساعة):
 * تصعيد الموافقات المتجاوزة لمهلها وتذكير المعتمدين، قواعد الأتمتة المستحقة، التقارير المجدولة،
 * ولقطة مؤشرات الشهر المنقضي (مرة واحدة لكل شهر).
 * الترويسة: Authorization: Bearer <CRON_SECRET>
 */
import { timingSafeEqual } from "node:crypto";
import { toISODate } from "@/lib/dates";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { runDueReports } from "@/server/services/analytics/reports.service";
import { snapshotPreviousMonth } from "@/server/services/analytics/metrics.service";
import { runDueRules } from "@/server/services/automation-rules.service";
import { runEscalations } from "@/server/services/workflows.service";

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
  const results: Array<Record<string, unknown>> = [];
  for (const t of tenants) {
    const r: Record<string, unknown> = { tenantId: t.id };
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        r[name] = await fn();
      } catch (e) {
        r[name] = { error: e instanceof Error ? e.message : "خطأ" };
      }
    };
    const db = createTenantDb({ tenantId: t.id, actor: null, ip: null, userAgent: "cron" });
    await step("escalations", () => runEscalations(t.id));
    await step("automations", () => runDueRules(t.id));
    await step("reports", () => runDueReports(t.id));
    await step("snapshots", () => snapshotPreviousMonth(db, t.id, toISODate(new Date(), t.timezone)));
    results.push(r);
  }
  return Response.json({ ok: true, results });
}
