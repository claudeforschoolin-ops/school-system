"use client";
/**
 * عناصر مشتركة للوحدات الأكاديمية: مؤشر الإشغال، منتقي الفرع، وتبويبات الوحدات.
 */
import type { ReactNode } from "react";
import { MODULE_NAV, type ModuleNavItem } from "@/lib/modules-nav";
import { applyDigits, formatNumber } from "@/lib/numbers";
import type { DigitsPreference } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { usePrefs } from "@/components/shell/app-context";

export const academicNav = (key: string): ModuleNavItem => MODULE_NAV.find((m) => m.key === key)!;

export const CLASSES_TABS = [
  { href: "/academic/classes", label: "الفصول", exact: true },
  { href: "/academic/classes/rooms", label: "القاعات" },
];
export const CLASSES_TABS_ADMIN = [...CLASSES_TABS, { href: "/academic/classes/year-end", label: "إنهاء العام الدراسي" }];
export const CURRICULUM_TABS = [
  { href: "/academic/curriculum", label: "الخطة الدراسية", exact: true },
  { href: "/academic/curriculum/subjects", label: "المواد" },
];
export const TIMETABLE_TABS = [
  { href: "/academic/timetable", label: "الجدول", exact: true },
  { href: "/academic/timetable/substitutions", label: "حصص الانتظار" },
  { href: "/academic/timetable/settings", label: "التوقيت والقيود" },
];

/** شريط نسبة (إشغال/عبء): أزرق مرجعي، تحذير عند الاقتراب، خطر عند التجاوز */
export function Meter({ value, max, className, label, warnAt = 0.95 }: { value: number; max: number; className?: string; label?: ReactNode; warnAt?: number }) {
  const prefs = usePrefs();
  const ratio = max > 0 ? value / max : 0;
  const tone = ratio > 1 ? "bg-danger-700" : ratio >= warnAt ? "bg-warning-700" : "bg-chart-1";
  return (
    <div className={cn("min-w-0", className)}>
      {label !== undefined ? (
        <div className="mb-1 flex items-center justify-between text-[12px] text-fg-3">
          <span className="truncate">{label}</span>
          <span className={cn("tabular", ratio > 1 && "font-medium text-danger-700")}>
            {formatNumber(value, prefs.digits)} / {formatNumber(max, prefs.digits)}
          </span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
      </div>
    </div>
  );
}

export function BranchSwitch({ branches, value, onChange }: { branches: Array<{ id: string; name: string }>; value: string | null | undefined; onChange: (id: string) => void }) {
  if (branches.length < 2) return null;
  return <Segmented value={value ?? branches[0]!.id} onChange={onChange} options={branches.map((b) => ({ value: b.id, label: b.name }))} />;
}

/** لون الوسم كمتغيرات (لخلايا الجدول) */
export function tagStyle(color: string) {
  return { background: `var(--tag-${color}-bg)`, color: `var(--tag-${color}-fg)` };
}

/** رمز (قاعة/فصل): الأرقام الخالصة تتبع تفضيل الأرقام، والرموز اللاتينية تبقى كما هي باتجاه يساري */
export function Code({ value, digits }: { value: string; digits: DigitsPreference }) {
  if (/^[0-9]+$/.test(value)) return <span className="tabular">{applyDigits(value, digits)}</span>;
  return (
    <bdi dir="ltr" className="tabular">
      {value}
    </bdi>
  );
}
