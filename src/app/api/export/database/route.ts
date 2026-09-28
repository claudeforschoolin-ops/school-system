/**
 * تصدير عرض قاعدة بيانات إلى Excel بترويسة المدرسة وتنسيق عربي (ورقة RTL).
 * يطبق نفس التصفية والفرز للعرض، ويُسجَّل التصدير في سجل التدقيق.
 */
import ExcelJS from "exceljs";
import { getCurrentSession } from "@/server/auth/current";
import { createTenantDb, writeAudit } from "@/server/db/tenant";
import { getDatabaseBundle, listRows } from "@/server/services/database.service";
import { applyView, displayText, orderedProperties, type EngineContext } from "@/lib/database/engine";
import { minorToDecimalString } from "@/lib/money";
import type { RowRecord } from "@/lib/database/types";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  const url = new URL(req.url);
  const databaseId = url.searchParams.get("databaseId") ?? "";
  const viewId = url.searchParams.get("viewId");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const db = createTenantDb({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name }, ip, userAgent: req.headers.get("user-agent") });

  try {
    const bundle = await getDatabaseBundle(db, session, databaseId);
    const data = await listRows(db, session, databaseId);
    const view = bundle.views.find((v) => v.id === viewId) ?? bundle.views[0];
    const users = await db.user.findMany({ select: { id: true, name: true } });
    const ctx: EngineContext = {
      properties: bundle.properties,
      currentUserId: session.user.id,
      users: new Map(users.map((u) => [u.id, u])),
      relatedRows: new Map(data.relatedRows.map((r) => [r.id, r as RowRecord & { databaseId: string }])),
      relatedDatabases: new Map(data.relatedDatabases.map((d) => [d.id, d])),
      timeZone: session.tenant.timezone,
      defaultCurrency: session.tenant.currency,
    };
    const config = view?.config ?? {};
    const rows = applyView(data.rows as RowRecord[], config, "", ctx);
    const hidden = new Set(config.hiddenProperties ?? []);
    const props = orderedProperties(bundle.properties, config.propertyOrder).filter((p) => !hidden.has(p.id));

    const wb = new ExcelJS.Workbook();
    wb.creator = session.tenant.platformName;
    const ws = wb.addWorksheet((bundle.page.title || "بيانات").slice(0, 28), { views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }] });
    const columnCount = props.length + 1;
    ws.mergeCells(1, 1, 1, columnCount);
    ws.getCell(1, 1).value = session.tenant.name;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1B3A6B" } };
    ws.mergeCells(2, 1, 2, columnCount);
    ws.getCell(2, 1).value = `${bundle.page.title} — ${view?.name ?? ""} — تاريخ التصدير: ${new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long", timeZone: session.tenant.timezone }).format(new Date())}`;
    ws.getCell(2, 1).font = { size: 11, color: { argb: "FF4B5563" } };

    const header = ws.getRow(4);
    header.values = [bundle.database.titleLabel, ...props.map((p) => p.name)];
    header.font = { bold: true, color: { argb: "FF111827" } };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5FB" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });

    for (const row of rows) {
      const values: Array<string | number | boolean | null> = [row.title];
      for (const p of props) {
        const raw = row.values[p.id];
        if (p.type === "NUMBER" && typeof raw === "number") values.push(raw);
        else if (p.type === "MONEY" && typeof raw === "number") values.push(Number(minorToDecimalString(raw, p.config.currency ?? session.tenant.currency)));
        else if (p.type === "CHECKBOX") values.push(raw === true ? "نعم" : "لا");
        else values.push(displayText(row, p, ctx));
      }
      const added = ws.addRow(values);
      added.alignment = { horizontal: "right", vertical: "top", wrapText: true };
      props.forEach((p, i) => {
        if (p.type === "MONEY") added.getCell(i + 2).numFmt = "#,##0.00";
      });
    }
    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 40 : 22;
    });

    const buffer = await wb.xlsx.writeBuffer();
    await writeAudit(
      { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name }, ip },
      { action: "EXPORT", entityType: "Database", entityId: databaseId, summary: `${bundle.page.title} (${rows.length} سجل، Excel)` },
    );
    const filename = `${bundle.page.title || "export"}.xlsx`;
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر التصدير";
    return new Response(message, { status: 403 });
  }
}
