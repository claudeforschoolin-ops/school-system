/**
 * «مهامي»: كل السجلات المسندة للمستخدم عبر خصائص «شخص» في قواعد البيانات التي يصل إليها.
 */
import type { PropertyConfig } from "@/lib/database/types";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { rootDb } from "@/server/db/client";
import { atLeast } from "@/lib/access-levels";
import { teamspaceLevel } from "./access.service";

export async function myTasks(db: TenantDb, session: SessionData) {
  // استعلام خام مقيّد يدوياً بالمستأجر (لا يمر عبر الحقن التلقائي)
  const matches = await rootDb.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM "DatabaseRow" r
    WHERE r."tenantId" = ${session.tenant.id}
      AND r."deletedAt" IS NULL
      AND jsonb_path_exists(r."values", '$.*[*] ? (@ == $u)', jsonb_build_object('u', ${session.user.id}::text))
    ORDER BY r."updatedAt" DESC
    LIMIT 300`;
  if (matches.length === 0) return [];
  const rows = await db.databaseRow.findMany({
    where: { id: { in: matches.map((m) => m.id) }, deletedAt: null },
    include: {
      database: {
        include: {
          page: { select: { id: true, title: true, icon: true, teamspaceId: true, ownerId: true, deletedAt: true } },
          properties: { where: { type: { in: ["PERSON", "STATUS", "DATE"] } }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  const levelCache = new Map<string, boolean>();
  const out = [];
  for (const row of rows) {
    const page = row.database.page;
    if (page.deletedAt) continue;
    let ok: boolean;
    if (page.teamspaceId) {
      if (!levelCache.has(page.teamspaceId)) levelCache.set(page.teamspaceId, atLeast(await teamspaceLevel(db, session, page.teamspaceId), "VIEW"));
      ok = levelCache.get(page.teamspaceId)!;
    } else ok = page.ownerId === session.user.id;
    if (!ok) continue;
    const values = (row.values ?? {}) as Record<string, unknown>;
    const personProps = row.database.properties.filter((p) => p.type === "PERSON");
    const assigned = personProps.some((p) => Array.isArray(values[p.id]) && (values[p.id] as string[]).includes(session.user.id));
    if (!assigned) continue;
    const statusProp = row.database.properties.find((p) => p.type === "STATUS");
    const dateProp = row.database.properties.find((p) => p.type === "DATE");
    const statusOption = statusProp
      ? ((statusProp.config ?? {}) as PropertyConfig).options?.find((o) => o.id === values[statusProp.id])
      : undefined;
    const statusGroup = statusProp
      ? ((statusProp.config ?? {}) as PropertyConfig).groups?.find((g) => g.optionIds.includes(String(values[statusProp.id])))?.key
      : undefined;
    out.push({
      id: row.id,
      title: row.title,
      icon: row.icon,
      database: { id: row.databaseId, pageId: page.id, title: page.title, icon: page.icon },
      status: statusOption ? { name: statusOption.name, color: statusOption.color, group: statusGroup ?? null } : null,
      due: dateProp ? ((values[dateProp.id] as { start?: string } | undefined)?.start ?? null) : null,
      updatedAt: row.updatedAt,
    });
  }
  return out;
}
