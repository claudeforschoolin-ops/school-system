/**
 * أنواع محرك قواعد البيانات (على طراز Notion) — مشتركة بين الخادم والواجهة.
 */

export const PROPERTY_TYPES = [
  "TEXT",
  "NUMBER",
  "MONEY",
  "DATE",
  "SELECT",
  "MULTI_SELECT",
  "STATUS",
  "PERSON",
  "FILES",
  "CHECKBOX",
  "URL",
  "PHONE",
  "EMAIL",
  "RELATION",
  "ROLLUP",
  "FORMULA",
  "CREATED_TIME",
  "UPDATED_TIME",
  "CREATED_BY",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  TEXT: "نص",
  NUMBER: "رقم",
  MONEY: "مبلغ مالي",
  DATE: "تاريخ",
  SELECT: "اختيار واحد",
  MULTI_SELECT: "اختيار متعدد",
  STATUS: "الحالة",
  PERSON: "شخص",
  FILES: "ملفات ووسائط",
  CHECKBOX: "مربع اختيار",
  URL: "رابط",
  PHONE: "هاتف",
  EMAIL: "بريد إلكتروني",
  RELATION: "علاقة",
  ROLLUP: "تجميع",
  FORMULA: "معادلة",
  CREATED_TIME: "تاريخ الإنشاء",
  UPDATED_TIME: "آخر تعديل",
  CREATED_BY: "منشئ السجل",
};

/** خصائص محسوبة لا يحرّرها المستخدم */
export const COMPUTED_TYPES: ReadonlySet<PropertyType> = new Set([
  "ROLLUP",
  "FORMULA",
  "CREATED_TIME",
  "UPDATED_TIME",
  "CREATED_BY",
]);

/** ألوان الخيارات — درجات هادئة من اللوحة الرسمية فقط */
export const OPTION_COLORS = ["gray", "navy", "teal", "slate", "gold", "green", "orange", "red", "brown", "purple"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export const OPTION_COLOR_LABELS: Record<OptionColor, string> = {
  gray: "رمادي",
  navy: "كحلي",
  teal: "أزرق مخضر",
  slate: "أزرق رمادي",
  gold: "ذهبي",
  green: "أخضر",
  orange: "برتقالي",
  red: "أحمر",
  brown: "بني",
  purple: "بنفسجي رمادي",
};

export interface SelectOption {
  id: string;
  name: string;
  color: OptionColor;
}

export type StatusGroupKey = "todo" | "in_progress" | "complete";

export interface StatusGroup {
  key: StatusGroupKey;
  name: string;
  optionIds: string[];
}

export interface PropertyConfig {
  options?: SelectOption[];
  /** خاصية نظامية للقراءة فقط (تُعدَّل من صفحة التفاصيل) */
  systemReadOnly?: boolean;
  /** خيارات تُولَّد من البيانات ولا تُحرَّر يدوياً */
  dynamicOptions?: boolean;
  groups?: StatusGroup[];
  /** NUMBER */
  numberFormat?: "number" | "integer" | "percent";
  decimals?: number;
  /** MONEY */
  currency?: string;
  /** DATE */
  includeTime?: boolean;
  calendar?: "gregory" | "hijri" | "both";
  /** PERSON / RELATION */
  multiple?: boolean;
  /** RELATION */
  targetDatabaseId?: string;
  /** ROLLUP */
  relationPropertyId?: string;
  targetPropertyId?: string;
  rollupFn?: RollupFn;
  /** FORMULA */
  expression?: string;
}

export type RollupFn =
  | "count"
  | "count_values"
  | "count_unique"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "percent_checked"
  | "show_original";

export const ROLLUP_LABELS: Record<RollupFn, string> = {
  count: "عدد السجلات",
  count_values: "عدد القيم",
  count_unique: "عدد القيم الفريدة",
  sum: "المجموع",
  average: "المتوسط",
  min: "الأدنى",
  max: "الأعلى",
  percent_checked: "نسبة المحدَّد",
  show_original: "عرض القيم",
};

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
  position: number;
  description?: string | null;
  /** مفتاح الحقل في المجموعات النظامية (لا يُحذف ولا يتغير نوعه) */
  systemKey?: string | null;
}

export interface DateValue {
  start: string;
  end?: string | null;
}

export interface FileValue {
  id: string;
  name: string;
  url: string;
  size?: number;
  mime?: string;
}

/** سجل كما يصل للواجهة */
export interface RowRecord {
  id: string;
  number: number;
  title: string;
  icon: string | null;
  cover: string | null;
  values: Record<string, unknown>;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  createdById: string | null;
  updatedById: string | null;
}

/** مفتاح خاص لخاصية العنوان في الفرز والتصفية والأعمدة */
export const TITLE_KEY = "title";

// ---------------------------------------------------------------------
// العروض
// ---------------------------------------------------------------------

export const VIEW_TYPES = ["TABLE", "BOARD", "CALENDAR", "TIMELINE", "GALLERY", "LIST"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  TABLE: "جدول",
  BOARD: "لوحة",
  CALENDAR: "تقويم",
  TIMELINE: "خط زمني",
  GALLERY: "معرض",
  LIST: "قائمة",
};

export type FilterOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "today"
  | "past_week"
  | "next_week"
  | "this_month"
  | "is_me"
  | "is_checked"
  | "is_not_checked"
  | "group_is";

export interface FilterRule {
  id: string;
  propertyId: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  conjunction: "and" | "or";
  rules: FilterRule[];
}

export interface SortRule {
  propertyId: string;
  direction: "asc" | "desc";
}

export type CalculationFn =
  | "none"
  | "count_all"
  | "count_values"
  | "count_empty"
  | "percent_empty"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "checked"
  | "percent_checked";

export interface ViewConfig {
  filter?: FilterGroup;
  sorts?: SortRule[];
  /** ترتيب الأعمدة/الخصائص (معرّفات) */
  propertyOrder?: string[];
  /** الخصائص المخفية في هذا العرض */
  hiddenProperties?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string | null;
  hiddenGroups?: string[];
  groupOrder?: string[];
  collapsedGroups?: string[];
  rowHeight?: "compact" | "default" | "tall";
  wrapCells?: boolean;
  /** التقويم والخط الزمني */
  dateProperty?: string | null;
  endDateProperty?: string | null;
  timelineScale?: "day" | "week" | "month";
  /** اللوحة والمعرض */
  cardPreview?: "none" | "cover";
  cardSize?: "small" | "medium" | "large";
  calculations?: Record<string, CalculationFn>;
  /** فتح السجلات: معاينة جانبية أو صفحة كاملة */
  openIn?: "peek" | "page";
}
