/**
 * المهام الدورية للمنصة لكل المدارس (تُستدعى كل ساعة):
 * تصعيد الموافقات المتجاوزة لمهلها وتذكير المعتمدين، قواعد الأتمتة المستحقة، التقارير المجدولة،
 * ولقطة مؤشرات الشهر المنقضي (مرة واحدة لكل شهر)، والنسخة الاحتياطية اليومية في ساعتها،
 * ومدد الاحتفاظ المفعّلة (مرة يومياً مع النسخة).
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
import { runScheduledBackup } from "@/server/services/backup.service";
import { runEnabledRetention } from "@/server/services/compliance.service";

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
    await step("backup", async () => {
      const b = await runScheduledBackup(t.id);
      // الاحتفاظ يُنفَّذ مرة يومياً مع النسخة التلقائية (بعدها، لتبقى النسخة شاملة)
      if ("number" in b) return { ...b, retention: await runEnabledRetention(t.id) };
      return b;
    });
    results.push(r);
  }
  return Response.json({ ok: true, results });
}
