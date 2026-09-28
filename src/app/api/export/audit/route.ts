/**
 * تصدير سجل التدقيق إلى CSV (UTF-8 مع BOM ليفتح بالعربية في Excel) بنفس مرشحات الشاشة.
 * يتطلب صلاحية audit:export، والتصدير نفسه يُسجَّل في السجل.
 */
import { getCurrentSession } from "@/server/auth/current";
import { createTenantDb, writeAudit } from "@/server/db/tenant";
import { auditWhere } from "@/server/services/admin/audit.service";
import { ACTION_LABELS, ENTITY_LABELS } from "@/server/db/audit-utils";
import { can } from "@/lib/rbac/access";

const MAX_ROWS = 20_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  // منع حقن الصيغ في برامج الجداول
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  if (!can(session.access, "audit", "export")) return new Response("لا تملك صلاحية تصدير سجل التدقيق", { status: 403 });

  const url = new URL(req.url);
  const p = url.searchParams;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ctx = { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name }, ip, userAgent: req.headers.get("user-agent") };
  const db = createTenantDb(ctx);
  const query = {
    userId: p.get("userId"),
    entityType: p.get("entityType"),
    action: p.get("action"),
    from: parseDate(p.get("from")),
    to: parseDate(p.get("to")),
    search: p.get("search")?.slice(0, 100) ?? null,
  };

  const items = await db.auditLog.findMany({ where: auditWhere(query), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_ROWS });
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: session.tenant.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const header = ["التاريخ والوقت", "المستخدم", "الإجراء", "نوع الكيان", "معرّف الكيان", "الوصف", "القيم السابقة", "القيم الجديدة", "عنوان IP", "المتصفح"];
  const lines = [header.map(csvCell).join(",")];
  for (const a of items) {
    lines.push(
      [
        fmt.format(a.createdAt).replace(",", ""),
        a.userName ?? "النظام",
        ACTION_LABELS[a.action] ?? a.action,
        ENTITY_LABELS[a.entityType] ?? a.entityType,
        a.entityId,
        a.summary,
        a.oldValue,
        a.newValue,
        a.ip,
        a.userAgent,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  await writeAudit(ctx, { action: "EXPORT", entityType: "AuditLog", summary: `تصدير سجل التدقيق (${items.length} قيد)`, newValue: { filters: Object.fromEntries(p.entries()) } });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`سجل-التدقيق-${stamp}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
