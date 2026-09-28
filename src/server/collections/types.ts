/**
 * «المجموعات النظامية»: كيانات مخصصة (طلاب، قبول، سلوك…) تُعرض عبر محرك قواعد البيانات
 * بنفس العروض الستة والتصفية والفرز والتصدير، بينما تبقى البيانات في جداولها بقيودها وقواعدها.
 */
import type { PropertyConfig, PropertyType, SelectOption, ViewConfig, ViewType } from "@/lib/database/types";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";

export interface SystemPropertySeed {
  /** مفتاح الحقل في المصدر (يُخزَّن في DatabaseProperty.systemKey) */
  key: string;
  name: string;
  type: PropertyType;
  config?: PropertyConfig;
  /** لا يُعدَّل من خلايا العرض (يُعدَّل من صفحة التفاصيل أو يُحسب) */
  readOnly?: boolean;
  /** خيارات تُولَّد من البيانات (الصفوف، الفصول…) */
  dynamicOptions?: boolean;
}

export interface SystemViewSeed {
  name: string;
  type: ViewType;
  /** مراجع الخصائص بمفاتيحها */
  config?: ViewConfig;
}

export interface SystemRow {
  id: string;
  number: number;
  title: string;
  icon?: string | null;
  cover?: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  updatedById: string | null;
  /** القيم بمفاتيح الحقول النظامية */
  values: Record<string, unknown>;
  /** قيم الخصائص المضافة من المستخدم (بمعرّف الخاصية) */
  custom: Record<string, unknown>;
}

export interface CollectionCtx {
  db: TenantDb;
  session: SessionData;
}

export interface SystemUpdate {
  values: Record<string, unknown>;
  custom?: Record<string, unknown>;
  title?: string;
  position?: number;
}

export interface SystemCollection {
  source: string;
  /** وحدة الصلاحيات */
  module: string;
  /** مساحة الفريق التي تظهر فيها الصفحة */
  teamspace: string;
  page: { title: string; icon: string; description: string };
  titleLabel: string;
  /** هل يُعدَّل العنوان من الخلايا */
  titleEditable: boolean;
  /** رابط صفحة التفاصيل */
  href: (id: string) => string;
  /** نص زر الإنشاء (يفتح نافذة مخصصة في الواجهة) */
  createLabel: string;
  properties: SystemPropertySeed[];
  views: SystemViewSeed[];
  options?: (c: CollectionCtx) => Promise<Record<string, SelectOption[]>>;
  list: (c: CollectionCtx) => Promise<SystemRow[]>;
  get: (c: CollectionCtx, id: string) => Promise<SystemRow | null>;
  update: (c: CollectionCtx, id: string, patch: SystemUpdate) => Promise<void>;
  trash?: (c: CollectionCtx, id: string) => Promise<void>;
  restore?: (c: CollectionCtx, id: string) => Promise<void>;
}

/** أدوات تحويل مشتركة */
export const isoDate = (d: Date | null | undefined) => (d ? { start: d.toISOString().slice(0, 10) } : null);
export const isoDateTime = (d: Date | null | undefined) => (d ? { start: d.toISOString() } : null);
export const personValue = (id: string | null | undefined) => (id ? [id] : []);
export const customOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** قراءة قيمة تاريخ من الخلية ({start} أو نص) */
export function dateFromValue(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const start = typeof v === "string" ? v : (v as { start?: string }).start;
  if (!start) return null;
  const d = new Date(start.length === 10 ? `${start}T00:00:00Z` : start);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function firstPerson(v: unknown): string | null {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return typeof v === "string" ? v : null;
}
