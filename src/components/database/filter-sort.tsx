"use client";
/**
 * منشئ التصفية (قواعد و/أو) والفرز متعدد المستويات.
 */
import { ArrowDownUp, ListFilter, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { shortId } from "@/lib/database/defaults";
import { optionsOf } from "@/lib/database/engine";
import { TITLE_KEY, type FilterGroup, type FilterOperator, type FilterRule, type PropertyDef, type PropertyType, type SortRule } from "@/lib/database/types";
import { MoneyError, minorToDecimalString, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { PropertyTypeIcon } from "./property-display";

type OpDef = [FilterOperator, string];

const TEXT_OPS: OpDef[] = [
  ["contains", "يحتوي"],
  ["not_contains", "لا يحتوي"],
  ["equals", "يساوي"],
  ["not_equals", "لا يساوي"],
  ["starts_with", "يبدأ بـ"],
  ["ends_with", "ينتهي بـ"],
  ["is_empty", "فارغ"],
  ["is_not_empty", "غير فارغ"],
];
const NUM_OPS: OpDef[] = [
  ["gt", "أكبر من"],
  ["gte", "أكبر من أو يساوي"],
  ["lt", "أصغر من"],
  ["lte", "أصغر من أو يساوي"],
  ["equals", "يساوي"],
  ["is_empty", "فارغ"],
  ["is_not_empty", "غير فارغ"],
];
const DATE_OPS: OpDef[] = [
  ["equals", "هو"],
  ["before", "قبل"],
  ["after", "بعد"],
  ["on_or_before", "في أو قبل"],
  ["on_or_after", "في أو بعد"],
  ["today", "اليوم"],
  ["past_week", "خلال الأسبوع الماضي"],
  ["next_week", "خلال الأسبوع القادم"],
  ["this_month", "هذا الشهر"],
  ["is_empty", "فارغ"],
  ["is_not_empty", "غير فارغ"],
];
const SELECT_OPS: OpDef[] = [
  ["equals", "هو"],
  ["not_equals", "ليس"],
  ["is_empty", "فارغ"],
  ["is_not_empty", "غير فارغ"],
];
const MULTI_OPS: OpDef[] = [
  ["contains", "يتضمن"],
  ["not_contains", "لا يتضمن"],
  ["is_empty", "فارغ"],
  ["is_not_empty", "غير فارغ"],
];

export function operatorsFor(type: PropertyType | "TITLE"): OpDef[] {
  switch (type) {
    case "NUMBER":
    case "MONEY":
      return NUM_OPS;
    case "DATE":
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return DATE_OPS;
    case "SELECT":
      return SELECT_OPS;
    case "STATUS":
      return [...SELECT_OPS, ["group_is", "المجموعة"]];
    case "MULTI_SELECT":
    case "RELATION":
      return MULTI_OPS;
    case "PERSON":
    case "CREATED_BY":
      return [["is_me", "أنا"], ...MULTI_OPS];
    case "CHECKBOX":
      return [
        ["is_checked", "محدَّد"],
        ["is_not_checked", "غير محدَّد"],
      ];
    case "FILES":
      return [
        ["is_not_empty", "يحتوي ملفات"],
        ["is_empty", "بلا ملفات"],
      ];
    case "FORMULA":
    case "ROLLUP":
      return [...TEXT_OPS.slice(0, 3), ["gt", "أكبر من"], ["lt", "أصغر من"], ["is_empty", "فارغ"], ["is_not_empty", "غير فارغ"]];
    default:
      return TEXT_OPS;
  }
}

const NO_VALUE: FilterOperator[] = ["is_empty", "is_not_empty", "today", "past_week", "next_week", "this_month", "is_me", "is_checked", "is_not_checked"];

const TITLE_PROP: PropertyDef = { id: TITLE_KEY, name: "العنوان", type: "TEXT", config: {}, position: -1 };

export function FilterButton({
  properties,
  filter,
  onChange,
  users,
  currency,
}: {
  properties: PropertyDef[];
  filter: FilterGroup | undefined;
  onChange: (filter: FilterGroup) => void;
  users: Array<{ id: string; name: string }>;
  currency: string;
}) {
  const rules = filter?.rules ?? [];
  const all = [TITLE_PROP, ...properties];
  const conj = filter?.conjunction ?? "and";
  const set = (next: FilterRule[], conjunction = conj) => onChange({ conjunction, rules: next });
  const active = rules.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors", active ? "bg-teal-50 text-teal-700" : "text-fg-2 hover:bg-hover")}>
          <ListFilter className="size-4" />
          <span className="max-md:hidden">تصفية</span>
          {active ? <span className="tabular">{new Intl.NumberFormat("ar-SA").format(rules.length)}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(560px,94vw)] p-3">
        {rules.length === 0 ? <p className="mb-2 text-[13px] text-fg-3">لا توجد قواعد تصفية في هذا العرض.</p> : null}
        <div className="space-y-2">
          {rules.map((rule, i) => {
            const prop = all.find((p) => p.id === rule.propertyId) ?? TITLE_PROP;
            const ops = operatorsFor(prop.id === TITLE_KEY ? "TITLE" : prop.type);
            return (
              <div key={rule.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 shrink-0 text-[12px] text-fg-3">
                  {i === 0 ? (
                    "حيث"
                  ) : i === 1 ? (
                    <select value={conj} onChange={(e) => set(rules, e.target.value as "and" | "or")} className="h-7 rounded-md bg-hover px-1 text-[12px] outline-none">
                      <option value="and">و</option>
                      <option value="or">أو</option>
                    </select>
                  ) : conj === "and" ? (
                    "و"
                  ) : (
                    "أو"
                  )}
                </span>
                <Select
                  size="sm"
                  className="w-[140px]"
                  value={rule.propertyId}
                  onChange={(pid) => {
                    const p = all.find((x) => x.id === pid) ?? TITLE_PROP;
                    const first = operatorsFor(p.id === TITLE_KEY ? "TITLE" : p.type)[0]![0];
                    set(rules.map((r) => (r.id === rule.id ? { ...r, propertyId: pid, operator: first, value: undefined } : r)));
                  }}
                  options={all.map((p) => ({ value: p.id, label: p.name }))}
                />
                <Select
                  size="sm"
                  className="w-[150px]"
                  value={rule.operator}
                  onChange={(op) => set(rules.map((r) => (r.id === rule.id ? { ...r, operator: op as FilterOperator } : r)))}
                  options={ops.map(([v, l]) => ({ value: v, label: l }))}
                />
                {!NO_VALUE.includes(rule.operator) ? (
                  <FilterValueInput prop={prop} rule={rule} users={users} currency={currency} onChange={(value) => set(rules.map((r) => (r.id === rule.id ? { ...r, value } : r)))} />
                ) : (
                  <span className="flex-1" />
                )}
                <button onClick={() => set(rules.filter((r) => r.id !== rule.id))} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="حذف القاعدة">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => set([...rules, { id: shortId(), propertyId: TITLE_KEY, operator: "contains", value: "" }])}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover"
          >
            <Plus className="size-3.5" /> إضافة قاعدة
          </button>
          {rules.length ? (
            <button onClick={() => set([])} className="h-7 rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover hover:text-danger-700">
              مسح الكل
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterValueInput({ prop, rule, onChange, users, currency }: { prop: PropertyDef; rule: FilterRule; onChange: (v: unknown) => void; users: Array<{ id: string; name: string }>; currency: string }) {
  const cls = "h-7 min-w-[120px] flex-1 rounded-md bg-hover px-2 text-[13px] outline-none";
  const [moneyError, setMoneyError] = useState(false);
  switch (prop.type) {
    case "DATE":
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return <input type="date" className={cls} value={typeof rule.value === "string" ? rule.value : ""} onChange={(e) => onChange(e.target.value)} />;
    case "NUMBER":
      return <input inputMode="decimal" dir="ltr" className={cls} value={rule.value === undefined ? "" : String(rule.value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
    case "MONEY":
      return (
        <input
          inputMode="decimal"
          dir="ltr"
          className={cn(cls, moneyError && "shadow-[0_0_0_1px_var(--danger-700)]")}
          defaultValue={typeof rule.value === "number" ? minorToDecimalString(rule.value, prop.config.currency ?? currency) : ""}
          onBlur={(e) => {
            try {
              setMoneyError(false);
              onChange(e.target.value ? parseMoney(e.target.value, prop.config.currency ?? currency) : undefined);
            } catch (err) {
              if (err instanceof MoneyError) setMoneyError(true);
            }
          }}
          placeholder={prop.config.currency ?? currency}
        />
      );
    case "SELECT":
    case "STATUS":
    case "MULTI_SELECT": {
      if (rule.operator === "group_is") {
        return (
          <Select size="sm" className="flex-1" value={String(rule.value ?? "")} onChange={onChange} options={(prop.config.groups ?? []).map((g) => ({ value: g.key, label: g.name }))} />
        );
      }
      const selected = Array.isArray(rule.value) ? (rule.value as string[]) : [];
      return (
        <div className="flex min-w-[140px] flex-1 flex-wrap gap-1">
          {optionsOf(prop).map((o) => (
            <button key={o.id} onClick={() => onChange(selected.includes(o.id) ? selected.filter((s) => s !== o.id) : [...selected, o.id])} className={cn("rounded-full", selected.includes(o.id) ? "ring-2 ring-navy-600/40" : "opacity-60 hover:opacity-100")}>
              <Tag color={o.color} size="sm">
                {o.name}
              </Tag>
            </button>
          ))}
        </div>
      );
    }
    case "PERSON":
    case "CREATED_BY": {
      const selected = Array.isArray(rule.value) ? (rule.value as string[]) : [];
      return (
        <Select size="sm" className="flex-1" value={selected[0]} onChange={(v) => onChange([v])} options={[{ value: "__me__", label: "أنا" }, ...users.map((u) => ({ value: u.id, label: u.name }))]} placeholder="اختر شخصاً" />
      );
    }
    default:
      return <input className={cls} value={typeof rule.value === "string" ? rule.value : ""} onChange={(e) => onChange(e.target.value)} placeholder="القيمة…" />;
  }
}

export function SortButton({ properties, sorts, onChange }: { properties: PropertyDef[]; sorts: SortRule[] | undefined; onChange: (sorts: SortRule[]) => void }) {
  const list = sorts ?? [];
  const all = [TITLE_PROP, ...properties.filter((p) => p.type !== "FILES")];
  const active = list.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors", active ? "bg-teal-50 text-teal-700" : "text-fg-2 hover:bg-hover")}>
          <ArrowDownUp className="size-4" />
          <span className="max-md:hidden">فرز</span>
          {active ? <span className="tabular">{new Intl.NumberFormat("ar-SA").format(list.length)}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-3">
        {list.length === 0 ? <p className="mb-2 text-[13px] text-fg-3">السجلات مرتبة يدوياً. أضف فرزاً لترتيبها تلقائياً.</p> : null}
        <div className="space-y-2">
          {list.map((s, i) => (
            <div key={`${s.propertyId}-${i}`} className="flex items-center gap-1.5">
              <Select size="sm" className="flex-1" value={s.propertyId} onChange={(pid) => onChange(list.map((x, j) => (j === i ? { ...x, propertyId: pid } : x)))} options={all.map((p) => ({ value: p.id, label: p.name }))} />
              <Select
                size="sm"
                className="w-[110px]"
                value={s.direction}
                onChange={(d) => onChange(list.map((x, j) => (j === i ? { ...x, direction: d as "asc" | "desc" } : x)))}
                options={[
                  { value: "asc", label: "تصاعدي" },
                  { value: "desc", label: "تنازلي" },
                ]}
              />
              <button onClick={() => onChange(list.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="إزالة">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => {
              const unused = all.find((p) => !list.some((s) => s.propertyId === p.id));
              if (unused) onChange([...list, { propertyId: unused.id, direction: "asc" }]);
            }}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover"
          >
            <Plus className="size-3.5" /> إضافة فرز
          </button>
          {list.length ? (
            <button onClick={() => onChange([])} className="h-7 rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover hover:text-danger-700">
              إزالة الفرز
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PropertyOption({ prop }: { prop: PropertyDef }) {
  return (
    <span className="flex items-center gap-2">
      <PropertyTypeIcon type={prop.id === TITLE_KEY ? "TITLE" : prop.type} />
      {prop.name}
    </span>
  );
}
