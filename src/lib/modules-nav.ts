/**
 * روابط الوحدات المبنية في الشريط الجانبي ولوحة الأوامر (تظهر حسب الصلاحية).
 */
export interface ModuleNavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  /** وحدة الصلاحيات */
  module: string;
  description: string;
  group: "students" | "academic";
}

export const MODULE_NAV: readonly ModuleNavItem[] = [
  { key: "admissions", label: "القبول والتسجيل", href: "/admissions", icon: "lucide:user-plus", module: "admissions", description: "طلبات الالتحاق ومراحلها حتى التسجيل", group: "students" },
  { key: "students", label: "ملفات الطلاب", href: "/students", icon: "lucide:contact", module: "students", description: "بيانات الطلاب وأولياء أمورهم وصحتهم ومستنداتهم", group: "students" },
];

export const MODULE_GROUP_LABELS = { students: "شؤون الطلاب", academic: "الشؤون الأكاديمية" } as const;
