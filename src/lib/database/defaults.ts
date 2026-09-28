/**
 * الإعدادات الافتراضية لقواعد البيانات الجديدة والخصائص والعروض.
 */
import type { PropertyConfig, PropertyType, SelectOption, StatusGroup, ViewConfig, ViewType } from "./types";

export function shortId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

/** حالات افتراضية مطابقة لألوان أعمدة اللوحة في نظام التصميم */
export function defaultStatusConfig(): PropertyConfig {
  const options: SelectOption[] = [
    { id: "not_started", name: "جديد", color: "navy" },
    { id: "in_progress", name: "قيد التنفيذ", color: "orange" },
    { id: "in_review", name: "قيد المراجعة", color: "slate" },
    { id: "done", name: "مكتمل", color: "green" },
    { id: "blocked", name: "متأخر", color: "red" },
  ];
  const groups: StatusGroup[] = [
    { key: "todo", name: "للتنفيذ", optionIds: ["not_started"] },
    { key: "in_progress", name: "قيد العمل", optionIds: ["in_progress", "in_review", "blocked"] },
    { key: "complete", name: "مكتمل", optionIds: ["done"] },
  ];
  return { options, groups };
}

export function defaultConfigFor(type: PropertyType): PropertyConfig {
  switch (type) {
    case "STATUS":
      return defaultStatusConfig();
    case "SELECT":
    case "MULTI_SELECT":
      return { options: [] };
    case "NUMBER":
      return { numberFormat: "number" };
    case "MONEY":
      return { currency: "SAR" };
    case "DATE":
      return { includeTime: false };
    case "PERSON":
      return { multiple: true };
    case "RELATION":
      return { multiple: true };
    case "ROLLUP":
      return { rollupFn: "count" };
    case "FORMULA":
      return { expression: "" };
    default:
      return {};
  }
}

export interface PropertySeed {
  key: string;
  name: string;
  type: PropertyType;
  config?: PropertyConfig;
}

export interface ViewSeed {
  name: string;
  type: ViewType;
  /** يمكن الإشارة إلى الخصائص بمفتاحها (key) وستُستبدل بالمعرّف عند الإنشاء */
  config?: ViewConfig;
}

export interface DatabaseTemplateSeed {
  properties: PropertySeed[];
  views: ViewSeed[];
}

export const BLANK_DATABASE: DatabaseTemplateSeed = {
  properties: [
    { key: "status", name: "الحالة", type: "STATUS" },
    { key: "assignee", name: "المسؤول", type: "PERSON" },
    { key: "due", name: "الموعد", type: "DATE" },
    { key: "tags", name: "الوسوم", type: "MULTI_SELECT" },
  ],
  views: [
    { name: "جدول", type: "TABLE" },
    { name: "لوحة", type: "BOARD", config: { groupBy: "status" } },
  ],
};

/** يستبدل مفاتيح الخصائص بمعرّفاتها داخل إعدادات العرض */
export function resolveViewConfig(config: ViewConfig | undefined, keyToId: Record<string, string>): ViewConfig {
  if (!config) return {};
  const map = (k: string | null | undefined) => (k ? (keyToId[k] ?? k) : k);
  return {
    ...config,
    groupBy: map(config.groupBy) ?? null,
    dateProperty: map(config.dateProperty) ?? null,
    endDateProperty: map(config.endDateProperty) ?? null,
    hiddenProperties: config.hiddenProperties?.map((k) => map(k)!) ?? undefined,
    propertyOrder: config.propertyOrder?.map((k) => map(k)!) ?? undefined,
    sorts: config.sorts?.map((s) => ({ ...s, propertyId: map(s.propertyId)! })),
    filter: config.filter
      ? { ...config.filter, rules: config.filter.rules.map((r) => ({ ...r, propertyId: map(r.propertyId)! })) }
      : undefined,
  };
}

/** إعدادات افتراضية عند إنشاء عرض جديد من نوع معين */
export function defaultViewConfig(
  type: ViewType,
  properties: ReadonlyArray<{ id: string; type: PropertyType }>,
): ViewConfig {
  const firstOf = (...types: PropertyType[]) => properties.find((p) => types.includes(p.type))?.id ?? null;
  switch (type) {
    case "BOARD":
      return { groupBy: firstOf("STATUS", "SELECT", "PERSON", "MULTI_SELECT", "CHECKBOX"), cardSize: "medium" };
    case "CALENDAR":
      return { dateProperty: firstOf("DATE", "CREATED_TIME") };
    case "TIMELINE": {
      const dates = properties.filter((p) => p.type === "DATE").map((p) => p.id);
      return { dateProperty: dates[0] ?? null, endDateProperty: dates[1] ?? null, timelineScale: "week" };
    }
    case "GALLERY":
      return { cardPreview: "cover", cardSize: "medium" };
    default:
      return {};
  }
}

export const VIEW_ICONS: Record<ViewType, string> = {
  TABLE: "table",
  BOARD: "kanban",
  CALENDAR: "calendar",
  TIMELINE: "gantt",
  GALLERY: "gallery",
  LIST: "list",
};
