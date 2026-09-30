/**
 * تصدير نتائج التقارير: Excel بترويسة المدرسة واتجاه من اليمين، وCSV بترميز UTF-8 مع BOM.
 * المبالغ تُكتب أرقاماً بالوحدة الكبرى بتنسيق محاسبي (قابلة للجمع في Excel)، والنسب نسباً مئوية.
 */
import ExcelJS from "exceljs";
import { plainValue, type QueryResult } from "@/lib/analytics/query";
import { formatMoney, minorToDecimalString } from "@/lib/money";

export interface ExportMeta {
  schoolName: string;
  platformName: string;
  title: string;
  subtitle?: string | null;
  currency: string;
  timezone: string;
  generatedBy?: string | null;
}

function stamp(meta: ExportMeta) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "long", timeStyle: "short", timeZone: meta.timezone }).format(new Date());
}

export async function buildXlsx(result: QueryResult, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.platformName;
  wb.created = new Date();
  const headerRow = 5;
  const ws = wb.addWorksheet(meta.title.replace(/[\\/*?:[\]]/g, " ").slice(0, 28) || "تقرير", { views: [{ rightToLeft: true, state: "frozen", ySplit: headerRow }] });
  const cols = Math.max(result.columns.length, 1);
  ws.mergeCells(1, 1, 1, cols);
  ws.getCell(1, 1).value = meta.schoolName;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1B3A6B" } };
  ws.mergeCells(2, 1, 2, cols);
  ws.getCell(2, 1).value = meta.title;
  ws.getCell(2, 1).font = { bold: true, size: 12, color: { argb: "FF111827" } };
  ws.mergeCells(3, 1, 3, cols);
  ws.getCell(3, 1).value = [meta.subtitle, `تاريخ الإصدار: ${stamp(meta)}`, meta.generatedBy ? `بواسطة: ${meta.generatedBy}` : null, `${result.total} سجل`].filter(Boolean).join(" — ");
  ws.getCell(3, 1).font = { size: 10, color: { argb: "FF4B5563" } };
  for (const r of [1, 2, 3]) ws.getCell(r, 1).alignment = { horizontal: "right" };

  const header = ws.getRow(headerRow);
  header.values = result.columns.map((c) => c.label);
  header.font = { bold: true, color: { argb: "FF111827" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5FB" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  });

  const cellValue = (v: unknown, type: string, options?: Record<string, string>): string | number | Date | null => {
    if (v === null || v === undefined || v === "") return null;
    if (type === "money" && typeof v === "number") return Number(minorToDecimalString(v, meta.currency));
    if (type === "percent" && typeof v === "number") return v / 10000;
    if (type === "number" && typeof v === "number") return v;
    if (type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
    if (type === "boolean") return v ? "نعم" : "لا";
    if (options && typeof v === "string") return options[v] ?? v;
    return String(v);
  };
  for (const row of result.rows) {
    const added = ws.addRow(result.columns.map((c) => cellValue(row[c.key], c.type, c.options)));
    added.alignment = { horizontal: "right", vertical: "top", wrapText: true };
  }
  if (Object.keys(result.totals).length) {
    const t = ws.addRow(result.columns.map((c, i) => (i === 0 ? "الإجمالي" : c.key in result.totals ? cellValue(result.totals[c.key], c.type) : null)));
    t.font = { bold: true };
    t.eachCell((cell) => (cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } }));
  }
  result.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === "string" ? 28 : c.type === "date" ? 14 : 16;
    if (c.type === "money") col.numFmt = "#,##0.00";
    if (c.type === "percent") col.numFmt = "0.0%";
    if (c.type === "date") col.numFmt = "yyyy-mm-dd";
    if (c.type === "number") col.numFmt = "#,##0";
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCsv(result: QueryResult, meta: ExportMeta): Buffer {
  const fmt = (minor: number) => formatMoney(minor, { currency: meta.currency, digits: "latn", symbol: false });
  const lines = [result.columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of result.rows) lines.push(result.columns.map((c) => csvCell(plainValue(r[c.key] ?? null, c, fmt))).join(","));
  return Buffer.from(`﻿${lines.join("\r\n")}`, "utf8");
}

export const MIME = {
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv; charset=utf-8",
} as const;
