"use client";
/**
 * عناصر مشتركة للتحليلات: تنسيق الخلايا حسب نوع الحقل، ومحرر شروط التصفية
 * (يستخدمه منشئ التقارير وقواعد الأتمتة بالصيغة نفسها).
 */
import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { OP_LABEL, opsFor, RELATIVE_LABEL, type FieldDef, type Filter, type FilterOp, type QueryColumn, type RelativeRange } from "@/lib/analytics/query";
import { formatNumber } from "@/lib/numbers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { usePrefs } from "@/components/shell/app-context";
import { MoneyInput, useFmtDate, useMoney } from "@/components/finance/common";

export function useCellFormat() {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  return (v: unknown, col: Pick<QueryColumn, "type" | "options">): ReactNode => {
    if (v === null || v === undefined || v === "") return <span className="text-fg-4">—</span>;
    switch (col.type) {
      case "money":
        return typeof v === "number" ? money.fmt(v, false) : String(v);
      case "percent":
        return typeof v === "number" ? `${formatNumber(Math.round(v / 10) / 10, prefs.digits)}٪` : String(v);
      case "number":
        return typeof v === "number" ? formatNumber(v, prefs.digits) : String(v);
      case "date":
        return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDate(String(v)) : String(v);
      case "boolean":
        return v ? "نعم" : "لا";
      default:
        return col.options?.[String(v)] ?? String(v);
    }
  };
}

export const NUMERIC_TYPES = ["number", "money", "percent"] as const;
export const isNumeric = (t: string) => (NUMERIC_TYPES as readonly string[]).includes(t);

const NO_VALUE: FilterOp[] = ["empty", "notEmpty", "isTrue", "isFalse"];

function defaultValue(field: FieldDef, op: FilterOp): Filter["value"] {
  if (NO_VALUE.includes(op)) return null;
  if (op === "relative") return "this_month";
  if (field.type === "enum") return Object.keys(field.options ?? {})[0] ?? "";
  return null;
}

/** محرر شروط التصفية: الحقل ← المعامل ← القيمة، بعناصر إدخال تناسب نوع الحقل */
export function FilterEditor({ fields, filters, onChange, max = 12 }: { fields: FieldDef[]; filters: Filter[]; onChange: (f: Filter[]) => void; max?: number }) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const set = (i: number, patch: Partial<Filter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-2">
      {filters.map((f, i) => {
        const field = byKey.get(f.field);
        if (!field) return null;
        const ops = opsFor(field.type);
        return (
          <div key={i} className="rounded-md bg-hover/60 p-2">
            <div className="flex items-center gap-1">
              <Select size="sm" className="min-w-0 flex-1" value={f.field} onChange={(k) => { const nf = byKey.get(k)!; const op = opsFor(nf.type)[0]!; set(i, { field: k, op, value: defaultValue(nf, op), value2: null }); }} options={fields.map((x) => ({ value: x.key, label: x.label }))} />
              <Button size="icon-sm" variant="ghost" aria-label="حذف الشرط" onClick={() => onChange(filters.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Select size="sm" className="w-36" value={f.op} onChange={(op) => set(i, { op: op as FilterOp, value: defaultValue(field, op as FilterOp), value2: null })} options={ops.map((o) => ({ value: o, label: OP_LABEL[o] }))} />
              <FilterValue field={field} filter={f} onChange={(patch) => set(i, patch)} />
            </div>
          </div>
        );
      })}
      {filters.length < max && fields.length ? (
        <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => { const fd = fields[0]!; const op = opsFor(fd.type)[0]!; onChange([...filters, { field: fd.key, op, value: defaultValue(fd, op) }]); }}>
          شرط تصفية
        </Button>
      ) : null}
    </div>
  );
}

function FilterValue({ field, filter, onChange }: { field: FieldDef; filter: Filter; onChange: (p: Partial<Filter>) => void }) {
  if (NO_VALUE.includes(filter.op)) return null;
  if (filter.op === "relative") {
    return <Select size="sm" className="min-w-0 flex-1" value={String(filter.value ?? "this_month")} onChange={(v) => onChange({ value: v })} options={(Object.keys(RELATIVE_LABEL) as RelativeRange[]).map((k) => ({ value: k, label: RELATIVE_LABEL[k] }))} />;
  }
  if (field.type === "enum" && (filter.op === "eq" || filter.op === "neq")) {
    return <Select size="sm" className="min-w-0 flex-1" value={String(filter.value ?? "")} onChange={(v) => onChange({ value: v })} options={Object.entries(field.options ?? {}).map(([value, label]) => ({ value, label }))} />;
  }
  if (field.type === "enum" && filter.op === "in") {
    const selected = Array.isArray(filter.value) ? filter.value.map(String) : [];
    return (
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {Object.entries(field.options ?? {}).map(([value, label]) => {
          const on = selected.includes(value);
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => onChange({ value: on ? selected.filter((x) => x !== value) : [...selected, value] })} className={on ? "rounded-full bg-navy-700 px-2 py-0.5 text-[12px] text-on-primary" : "rounded-full bg-card px-2 py-0.5 text-[12px] text-fg-2"}>
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  const one = (key: "value" | "value2") => {
    const v = filter[key];
    if (field.type === "money") return <MoneyInput className="h-7 min-w-0 flex-1" value={typeof v === "number" ? v : null} onChange={(m) => onChange({ [key]: m })} aria-label="المبلغ" />;
    if (field.type === "date") return <Input type="date" className="h-7 min-w-0 flex-1" value={typeof v === "string" ? v : ""} onChange={(e) => onChange({ [key]: e.target.value || null })} aria-label="التاريخ" />;
    if (field.type === "percent")
      return <Input type="number" className="h-7 w-20" value={typeof v === "number" ? v / 100 : ""} onChange={(e) => onChange({ [key]: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} aria-label="النسبة ٪" placeholder="٪" />;
    if (field.type === "number") return <Input type="number" className="h-7 w-24" value={typeof v === "number" ? v : ""} onChange={(e) => onChange({ [key]: e.target.value === "" ? null : Number(e.target.value) })} aria-label="الرقم" />;
    return <Input className="h-7 min-w-0 flex-1" value={typeof v === "string" ? v : ""} onChange={(e) => onChange({ [key]: e.target.value })} aria-label="القيمة" />;
  };
  return filter.op === "between" ? (
    <>
      {one("value")}
      <span className="text-[12px] text-fg-3">و</span>
      {one("value2")}
    </>
  ) : (
    one("value")
  );
}
