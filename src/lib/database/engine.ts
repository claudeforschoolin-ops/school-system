/**
 * محرك قواعد البيانات: حساب القيم المحسوبة، التصفية، الفرز، التجميع، والحسابات.
 * يعمل في الواجهة (استجابة فورية) وفي الخادم (التصدير) بنفس النتائج.
 */
import { toISODate, DEFAULT_TIMEZONE } from "../dates";
import { minorToDecimalString } from "../money";
import { evaluateFormula, isEmptyValue, toText, type FormulaValue } from "./formula";
import {
  TITLE_KEY,
  type CalculationFn,
  type DateValue,
  type FileValue,
  type FilterGroup,
  type FilterRule,
  type PropertyDef,
  type RowRecord,
  type SelectOption,
  type SortRule,
} from "./types";

export interface EngineUser {
  id: string;
  name: string;
}

export interface RelatedDatabase {
  id: string;
  title: string;
  properties: PropertyDef[];
}

export interface EngineContext {
  properties: readonly PropertyDef[];
  currentUserId?: string | null;
  users?: ReadonlyMap<string, EngineUser>;
  /** سجلات قواعد البيانات المرتبطة (للعلاقات والتجميعات) */
  relatedRows?: ReadonlyMap<string, RowRecord & { databaseId: string }>;
  relatedDatabases?: ReadonlyMap<string, RelatedDatabase>;
  now?: Date;
  timeZone?: string;
  defaultCurrency?: string;
}

export const EMPTY_GROUP = "__empty__";

// ---------------------------------------------------------------------
// قراءة القيم
// ---------------------------------------------------------------------

function propMap(ctx: EngineContext): Map<string, PropertyDef> {
  return new Map(ctx.properties.map((p) => [p.id, p]));
}

export function optionsOf(prop: PropertyDef | undefined): SelectOption[] {
  return prop?.config.options ?? [];
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value) return [value];
  return [];
}

export function asDateValue(value: unknown): DateValue | null {
  if (!value) return null;
  if (typeof value === "string") return { start: value };
  if (typeof value === "object" && typeof (value as DateValue).start === "string") return value as DateValue;
  return null;
}

export function asFiles(value: unknown): FileValue[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as FileValue[]) : [];
}

/** القيمة الخام للخاصية (مع الخصائص الزمنية والمنشئ) */
export function rawValue(row: RowRecord, prop: PropertyDef): unknown {
  switch (prop.type) {
    case "CREATED_TIME":
      return row.createdAt;
    case "UPDATED_TIME":
      return row.updatedAt;
    case "CREATED_BY":
      return row.createdById;
    default:
      return row.values[prop.id];
  }
}

/** حساب قيمة التجميع (Rollup) */
export function computeRollup(row: RowRecord, prop: PropertyDef, ctx: EngineContext): FormulaValue {
  const { relationPropertyId, targetPropertyId, rollupFn = "count" } = prop.config;
  if (!relationPropertyId) return null;
  const relatedIds = asStringArray(row.values[relationPropertyId]);
  const related = relatedIds.map((id) => ctx.relatedRows?.get(id)).filter((r): r is RowRecord & { databaseId: string } => Boolean(r));
  if (rollupFn === "count") return related.length;
  const targetDb = related[0] ? ctx.relatedDatabases?.get(related[0].databaseId) : undefined;
  const targetProp =
    targetPropertyId === TITLE_KEY
      ? ({ id: TITLE_KEY, name: "العنوان", type: "TEXT", config: {}, position: 0 } as PropertyDef)
      : targetDb?.properties.find((p) => p.id === targetPropertyId);
  if (!targetProp) return rollupFn === "count_values" ? 0 : null;
  const subCtx: EngineContext = { ...ctx, properties: targetDb?.properties ?? [] };
  const values = related.map((r) => formulaValueOf(r, targetProp, subCtx, new Set()));
  const nonEmpty = values.filter((v) => !isEmptyValue(v));
  switch (rollupFn) {
    case "count_values":
      return nonEmpty.length;
    case "count_unique":
      return new Set(nonEmpty.map(toText)).size;
    case "sum":
    case "average":
    case "min":
    case "max": {
      const nums = nonEmpty.map((v) => (typeof v === "number" ? v : Number(toText(v)))).filter((n) => !Number.isNaN(n));
      if (nums.length === 0) return null;
      if (rollupFn === "sum") return nums.reduce((a, b) => a + b, 0);
      if (rollupFn === "average") return nums.reduce((a, b) => a + b, 0) / nums.length;
      return rollupFn === "min" ? Math.min(...nums) : Math.max(...nums);
    }
    case "percent_checked":
      return values.length ? values.filter((v) => v === true).length / values.length : 0;
    case "show_original":
    default:
      return nonEmpty;
  }
}

/** تحويل قيمة خاصية إلى قيمة تفهمها لغة المعادلات */
export function formulaValueOf(row: RowRecord, prop: PropertyDef, ctx: EngineContext, visiting: Set<string>): FormulaValue {
  if (prop.id === TITLE_KEY) return row.title;
  const raw = rawValue(row, prop);
  switch (prop.type) {
    case "TEXT":
    case "URL":
    case "PHONE":
    case "EMAIL":
      return typeof raw === "string" ? raw : "";
    case "NUMBER":
      return typeof raw === "number" ? raw : null;
    case "MONEY":
      // للعرض والحساب في المعادلات فقط (لا تُخزَّن)
      return typeof raw === "number" ? Number(minorToDecimalString(raw, prop.config.currency ?? ctx.defaultCurrency ?? "SAR")) : null;
    case "CHECKBOX":
      return raw === true;
    case "DATE": {
      const d = asDateValue(raw);
      return d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d.start) ? `${d.start}T00:00:00Z` : d.start) : null;
    }
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return raw ? new Date(raw as string) : null;
    case "SELECT":
    case "STATUS": {
      const opt = optionsOf(prop).find((o) => o.id === raw);
      return opt?.name ?? "";
    }
    case "MULTI_SELECT": {
      const ids = asStringArray(raw);
      return optionsOf(prop).filter((o) => ids.includes(o.id)).map((o) => o.name);
    }
    case "PERSON":
    case "CREATED_BY": {
      const ids = asStringArray(raw);
      return ids.map((id) => ctx.users?.get(id)?.name ?? "");
    }
    case "RELATION":
      return asStringArray(raw).map((id) => ctx.relatedRows?.get(id)?.title ?? "");
    case "FILES":
      return asFiles(raw).map((f) => f.name);
    case "ROLLUP":
      return computeRollup(row, prop, ctx);
    case "FORMULA": {
      if (visiting.has(prop.id)) return null; // منع الاعتماد الدائري
      const next = new Set(visiting).add(prop.id);
      const byName = new Map(ctx.properties.map((p) => [p.name, p]));
      const result = evaluateFormula(prop.config.expression ?? "", {
        now: ctx.now,
        getProp: (name) => {
          if (name === "العنوان" || name === "Name" || name === "title") return row.title;
          const target = byName.get(name);
          if (!target) throw new Error(`خاصية غير موجودة: ${name}`);
          return formulaValueOf(row, target, ctx, next);
        },
      });
      return result.error ? null : result.value;
    }
    default:
      return null;
  }
}

export function formulaResult(row: RowRecord, prop: PropertyDef, ctx: EngineContext): { value: FormulaValue; error: string | null } {
  const byName = new Map(ctx.properties.map((p) => [p.name, p]));
  return evaluateFormula(prop.config.expression ?? "", {
    now: ctx.now,
    getProp: (name) => {
      if (name === "العنوان" || name === "Name" || name === "title") return row.title;
      const target = byName.get(name);
      if (!target) throw new Error(`خاصية غير موجودة: ${name}`);
      return formulaValueOf(row, target, ctx, new Set([prop.id]));
    },
  });
}

// ---------------------------------------------------------------------
// النص المعروض (للبحث والتصدير)
// ---------------------------------------------------------------------

export function displayText(row: RowRecord, prop: PropertyDef | undefined, ctx: EngineContext): string {
  if (!prop) return row.title;
  if (prop.id === TITLE_KEY) return row.title;
  const raw = rawValue(row, prop);
  switch (prop.type) {
    case "MONEY":
      return typeof raw === "number" ? minorToDecimalString(raw, prop.config.currency ?? ctx.defaultCurrency ?? "SAR") : "";
    case "NUMBER":
      if (typeof raw !== "number") return "";
      return prop.config.numberFormat === "percent" ? `${raw}%` : String(raw);
    case "DATE": {
      const d = asDateValue(raw);
      if (!d) return "";
      return d.end ? `${d.start} → ${d.end}` : d.start;
    }
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return raw ? new Date(raw as string).toISOString().replace("T", " ").slice(0, 16) : "";
    case "CHECKBOX":
      return raw === true ? "نعم" : "لا";
    default:
      return toText(formulaValueOf(row, prop, ctx, new Set()));
  }
}

// ---------------------------------------------------------------------
// البحث والتصفية
// ---------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

export function searchRows<T extends RowRecord>(rows: readonly T[], query: string, ctx: EngineContext): T[] {
  const q = normalize(query);
  if (!q) return [...rows];
  const searchable = ctx.properties.filter((p) =>
    ["TEXT", "SELECT", "STATUS", "MULTI_SELECT", "PERSON", "URL", "EMAIL", "PHONE", "NUMBER", "RELATION"].includes(p.type),
  );
  return rows.filter((row) => {
    if (normalize(row.title).includes(q)) return true;
    if (String(row.number).includes(q)) return true;
    return searchable.some((p) => normalize(displayText(row, p, ctx)).includes(q));
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateStartOf(row: RowRecord, prop: PropertyDef): string | null {
  const raw = rawValue(row, prop);
  if (prop.type === "CREATED_TIME" || prop.type === "UPDATED_TIME") return raw ? toISODate(raw as string) : null;
  if (prop.type === "FORMULA") {
    return null;
  }
  const d = asDateValue(raw);
  return d ? d.start.slice(0, 10) : null;
}

export function matchRule(row: RowRecord, rule: FilterRule, ctx: EngineContext, props = propMap(ctx)): boolean {
  const prop = rule.propertyId === TITLE_KEY ? undefined : props.get(rule.propertyId);
  if (rule.propertyId !== TITLE_KEY && !prop) return true; // خاصية محذوفة: تجاهل القاعدة
  const op = rule.operator;
  const today = toISODate(ctx.now ?? new Date(), ctx.timeZone ?? DEFAULT_TIMEZONE);

  // النصوص (والعنوان)
  if (!prop || ["TEXT", "URL", "EMAIL", "PHONE"].includes(prop.type)) {
    const text = normalize(prop ? String(rawValue(row, prop) ?? "") : row.title);
    const v = normalize(String(rule.value ?? ""));
    switch (op) {
      case "contains":
        return text.includes(v);
      case "not_contains":
        return !text.includes(v);
      case "equals":
        return text === v;
      case "not_equals":
        return text !== v;
      case "starts_with":
        return text.startsWith(v);
      case "ends_with":
        return text.endsWith(v);
      case "is_empty":
        return text === "";
      case "is_not_empty":
        return text !== "";
      default:
        return true;
    }
  }

  switch (prop.type) {
    case "NUMBER":
    case "MONEY":
    case "ROLLUP":
    case "FORMULA": {
      const valueRaw = prop.type === "ROLLUP" || prop.type === "FORMULA" ? formulaValueOf(row, prop, ctx, new Set()) : rawValue(row, prop);
      if (op === "is_empty") return isEmptyValue(valueRaw as FormulaValue);
      if (op === "is_not_empty") return !isEmptyValue(valueRaw as FormulaValue);
      if (op === "contains" || op === "not_contains" || op === "equals" || op === "not_equals") {
        const text = normalize(toText(valueRaw as FormulaValue));
        const v = normalize(String(rule.value ?? ""));
        if (op === "contains") return text.includes(v);
        if (op === "not_contains") return !text.includes(v);
        if (op === "equals") return text === v;
        return text !== v;
      }
      if (op === "is_checked") return valueRaw === true;
      if (op === "is_not_checked") return valueRaw !== true;
      const n = typeof valueRaw === "number" ? valueRaw : Number(valueRaw);
      const target = Number(rule.value);
      if (Number.isNaN(n) || Number.isNaN(target) || valueRaw === null || valueRaw === undefined) return false;
      switch (op) {
        case "gt":
          return n > target;
        case "gte":
          return n >= target;
        case "lt":
          return n < target;
        case "lte":
          return n <= target;
        default:
          return true;
      }
    }
    case "CHECKBOX": {
      const checked = rawValue(row, prop) === true;
      if (op === "is_checked" || (op === "equals" && rule.value === true)) return checked;
      if (op === "is_not_checked" || (op === "equals" && rule.value === false)) return !checked;
      return true;
    }
    case "DATE":
    case "CREATED_TIME":
    case "UPDATED_TIME": {
      const start = dateStartOf(row, prop);
      if (op === "is_empty") return !start;
      if (op === "is_not_empty") return Boolean(start);
      if (!start) return false;
      const v = typeof rule.value === "string" ? rule.value.slice(0, 10) : today;
      switch (op) {
        case "equals":
          return start === v;
        case "before":
          return start < v;
        case "after":
          return start > v;
        case "on_or_before":
          return start <= v;
        case "on_or_after":
          return start >= v;
        case "today":
          return start === today;
        case "past_week":
          return start >= addDays(today, -7) && start <= today;
        case "next_week":
          return start >= today && start <= addDays(today, 7);
        case "this_month":
          return start.slice(0, 7) === today.slice(0, 7);
        default:
          return true;
      }
    }
    case "SELECT":
    case "STATUS": {
      const value = rawValue(row, prop) as string | undefined;
      if (op === "is_empty") return !value;
      if (op === "is_not_empty") return Boolean(value);
      if (op === "group_is" && prop.type === "STATUS") {
        const group = prop.config.groups?.find((g) => g.key === rule.value);
        return Boolean(value && group?.optionIds.includes(value));
      }
      const targets = asStringArray(rule.value);
      if (op === "equals" || op === "contains") return Boolean(value && targets.includes(value));
      if (op === "not_equals" || op === "not_contains") return !value || !targets.includes(value);
      return true;
    }
    case "MULTI_SELECT":
    case "PERSON":
    case "CREATED_BY":
    case "RELATION": {
      const values = asStringArray(rawValue(row, prop));
      if (op === "is_empty") return values.length === 0;
      if (op === "is_not_empty") return values.length > 0;
      if (op === "is_me") return Boolean(ctx.currentUserId && values.includes(ctx.currentUserId));
      const targets = asStringArray(rule.value).map((t) => (t === "__me__" ? (ctx.currentUserId ?? "") : t));
      if (op === "contains" || op === "equals") return targets.some((t) => values.includes(t));
      if (op === "not_contains" || op === "not_equals") return !targets.some((t) => values.includes(t));
      return true;
    }
    case "FILES": {
      const files = asFiles(rawValue(row, prop));
      if (op === "is_empty") return files.length === 0;
      if (op === "is_not_empty") return files.length > 0;
      return true;
    }
    default:
      return true;
  }
}

export function filterRows<T extends RowRecord>(rows: readonly T[], filter: FilterGroup | undefined, ctx: EngineContext): T[] {
  if (!filter || filter.rules.length === 0) return [...rows];
  const props = propMap(ctx);
  return rows.filter((row) =>
    filter.conjunction === "or"
      ? filter.rules.some((r) => matchRule(row, r, ctx, props))
      : filter.rules.every((r) => matchRule(row, r, ctx, props)),
  );
}

// ---------------------------------------------------------------------
// الفرز
// ---------------------------------------------------------------------

type SortKey = { empty: boolean; value: number | string };

function sortKey(row: RowRecord, prop: PropertyDef | undefined, ctx: EngineContext): SortKey {
  if (!prop) return { empty: !row.title, value: row.title };
  const raw = rawValue(row, prop);
  switch (prop.type) {
    case "NUMBER":
    case "MONEY":
      return typeof raw === "number" ? { empty: false, value: raw } : { empty: true, value: 0 };
    case "CHECKBOX":
      return { empty: false, value: raw === true ? 1 : 0 };
    case "DATE": {
      const d = asDateValue(raw);
      return d ? { empty: false, value: d.start } : { empty: true, value: "" };
    }
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return { empty: !raw, value: raw ? new Date(raw as string).getTime() : 0 };
    case "SELECT":
    case "STATUS": {
      const idx = optionsOf(prop).findIndex((o) => o.id === raw);
      return idx === -1 ? { empty: true, value: 0 } : { empty: false, value: idx };
    }
    case "MULTI_SELECT": {
      const ids = asStringArray(raw);
      const idx = optionsOf(prop).findIndex((o) => ids.includes(o.id));
      return idx === -1 ? { empty: true, value: 0 } : { empty: false, value: idx };
    }
    case "ROLLUP":
    case "FORMULA": {
      const v = formulaValueOf(row, prop, ctx, new Set());
      if (isEmptyValue(v)) return { empty: true, value: "" };
      if (typeof v === "number") return { empty: false, value: v };
      if (v instanceof Date) return { empty: false, value: v.getTime() };
      if (typeof v === "boolean") return { empty: false, value: v ? 1 : 0 };
      return { empty: false, value: toText(v) };
    }
    default: {
      const text = displayText(row, prop, ctx);
      return { empty: text === "", value: text };
    }
  }
}

export function sortRows<T extends RowRecord>(rows: readonly T[], sorts: readonly SortRule[] | undefined, ctx: EngineContext): T[] {
  const list = [...rows];
  if (!sorts || sorts.length === 0) return list.sort((a, b) => a.position - b.position || a.number - b.number);
  const props = propMap(ctx);
  const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
  const keyed = list.map((row) => ({
    row,
    keys: sorts.map((s) => sortKey(row, s.propertyId === TITLE_KEY ? undefined : props.get(s.propertyId), ctx)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < sorts.length; i++) {
      const ka = a.keys[i]!;
      const kb = b.keys[i]!;
      if (ka.empty !== kb.empty) return ka.empty ? 1 : -1; // الفارغ دائماً في الأخير
      if (ka.empty) continue;
      const dir = sorts[i]!.direction === "desc" ? -1 : 1;
      const cmp =
        typeof ka.value === "number" && typeof kb.value === "number"
          ? ka.value - kb.value
          : collator.compare(String(ka.value), String(kb.value));
      if (cmp !== 0) return cmp * dir;
    }
    return a.row.position - b.row.position;
  });
  return keyed.map((k) => k.row);
}

// ---------------------------------------------------------------------
// التجميع
// ---------------------------------------------------------------------

export const GROUPABLE_TYPES = new Set(["SELECT", "STATUS", "MULTI_SELECT", "PERSON", "CHECKBOX", "CREATED_BY"]);

export interface RowGroup<T> {
  key: string;
  label: string;
  color: string;
  rows: T[];
}

export function groupKeysFor(row: RowRecord, prop: PropertyDef): string[] {
  const raw = rawValue(row, prop);
  switch (prop.type) {
    case "SELECT":
    case "STATUS":
      return typeof raw === "string" && optionsOf(prop).some((o) => o.id === raw) ? [raw] : [EMPTY_GROUP];
    case "MULTI_SELECT": {
      const ids = asStringArray(raw).filter((id) => optionsOf(prop).some((o) => o.id === id));
      return ids.length ? ids : [EMPTY_GROUP];
    }
    case "PERSON":
    case "CREATED_BY": {
      const ids = asStringArray(raw);
      return ids.length ? ids : [EMPTY_GROUP];
    }
    case "CHECKBOX":
      return [raw === true ? "true" : "false"];
    default:
      return [EMPTY_GROUP];
  }
}

export function groupRows<T extends RowRecord>(
  rows: readonly T[],
  prop: PropertyDef,
  ctx: EngineContext,
  options: { groupOrder?: string[]; hideEmpty?: boolean } = {},
): RowGroup<T>[] {
  const groups = new Map<string, RowGroup<T>>();
  const ensure = (key: string, label: string, color: string) => {
    if (!groups.has(key)) groups.set(key, { key, label, color, rows: [] });
    return groups.get(key)!;
  };

  if (prop.type === "SELECT" || prop.type === "STATUS" || prop.type === "MULTI_SELECT") {
    ensure(EMPTY_GROUP, `بلا ${prop.name}`, "gray");
    for (const opt of optionsOf(prop)) ensure(opt.id, opt.name, opt.color);
  } else if (prop.type === "CHECKBOX") {
    ensure("true", "محدَّد", "green");
    ensure("false", "غير محدَّد", "gray");
  } else {
    ensure(EMPTY_GROUP, `بلا ${prop.name}`, "gray");
  }

  for (const row of rows) {
    for (const key of groupKeysFor(row, prop)) {
      if (!groups.has(key)) {
        const user = ctx.users?.get(key);
        ensure(key, user?.name ?? "غير معروف", "slate");
      }
      groups.get(key)!.rows.push(row);
    }
  }

  let result = [...groups.values()];
  if (options.groupOrder?.length) {
    const order = new Map(options.groupOrder.map((k, i) => [k, i]));
    result.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  } else if (prop.type === "PERSON" || prop.type === "CREATED_BY") {
    result.sort((a, b) => (a.key === EMPTY_GROUP ? -1 : b.key === EMPTY_GROUP ? 1 : a.label.localeCompare(b.label, "ar")));
  }
  if (options.hideEmpty) result = result.filter((g) => g.key !== EMPTY_GROUP || g.rows.length > 0);
  return result;
}

/** القيم الجديدة عند نقل سجل من مجموعة إلى أخرى (سحب في اللوحة) */
export function valueForGroupMove(row: RowRecord, prop: PropertyDef, fromKey: string, toKey: string): unknown {
  const target = toKey === EMPTY_GROUP ? null : toKey;
  switch (prop.type) {
    case "SELECT":
    case "STATUS":
      return target;
    case "CHECKBOX":
      return toKey === "true";
    case "MULTI_SELECT":
    case "PERSON": {
      const current = asStringArray(row.values[prop.id]).filter((v) => v !== fromKey);
      if (target && !current.includes(target)) current.push(target);
      return prop.type === "PERSON" && prop.config.multiple === false ? (target ? [target] : []) : current;
    }
    default:
      return row.values[prop.id];
  }
}

// ---------------------------------------------------------------------
// الحسابات (تذييل الجدول)
// ---------------------------------------------------------------------

export function calculate(rows: readonly RowRecord[], prop: PropertyDef | undefined, fn: CalculationFn, ctx: EngineContext): number | null {
  if (fn === "none") return null;
  if (fn === "count_all") return rows.length;
  const values = rows.map((r) => (prop ? rawValue(r, prop) : r.title));
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  switch (fn) {
    case "count_values":
      return values.filter((v) => !isEmpty(v)).length;
    case "count_empty":
      return values.filter(isEmpty).length;
    case "percent_empty":
      return rows.length ? values.filter(isEmpty).length / rows.length : 0;
    case "checked":
      return values.filter((v) => v === true).length;
    case "percent_checked":
      return rows.length ? values.filter((v) => v === true).length / rows.length : 0;
    case "sum":
    case "average":
    case "min":
    case "max": {
      const nums = (prop?.type === "FORMULA" || prop?.type === "ROLLUP"
        ? rows.map((r) => formulaValueOf(r, prop, ctx, new Set()))
        : values
      ).filter((v): v is number => typeof v === "number");
      if (nums.length === 0) return null;
      if (fn === "sum") return nums.reduce((a, b) => a + b, 0);
      if (fn === "average") return nums.reduce((a, b) => a + b, 0) / nums.length;
      return fn === "min" ? Math.min(...nums) : Math.max(...nums);
    }
    default:
      return null;
  }
}

/** ترتيب الخصائص المرئية في عرض معين */
export function orderedProperties(properties: readonly PropertyDef[], order: readonly string[] | undefined): PropertyDef[] {
  const byPosition = [...properties].sort((a, b) => a.position - b.position);
  if (!order?.length) return byPosition;
  const index = new Map(order.map((id, i) => [id, i]));
  return byPosition.sort((a, b) => (index.get(a.id) ?? 1e6 + a.position) - (index.get(b.id) ?? 1e6 + b.position));
}

/** تطبيق التصفية ثم البحث ثم الفرز */
export function applyView<T extends RowRecord>(
  rows: readonly T[],
  config: { filter?: FilterGroup; sorts?: SortRule[] },
  search: string,
  ctx: EngineContext,
): T[] {
  return sortRows(searchRows(filterRows(rows, config.filter, ctx), search, ctx), config.sorts, ctx);
}
