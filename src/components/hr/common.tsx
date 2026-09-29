"use client";
/**
 * عناصر مشتركة للموارد البشرية: روابط الوحدات وتبويباتها، ووسوم الحالات.
 */
import { monthTitle } from "@/lib/dates";
import { MODULE_NAV, type ModuleNavItem } from "@/lib/modules-nav";
import { usePrefs } from "@/components/shell/app-context";

export const hrNav = (key: string): ModuleNavItem => MODULE_NAV.find((m) => m.key === key)!;

export const EMPLOYEE_TABS = [
  { href: "/hr/employees", label: "الموظفون", exact: true },
  { href: "/hr/employees/org", label: "الهيكل التنظيمي" },
  { href: "/hr/employees/alerts", label: "تنبيهات الوثائق" },
];
export const ATTENDANCE_TABS = [
  { href: "/hr/attendance", label: "حضور اليوم", exact: true },
  { href: "/hr/attendance/month", label: "السجل الشهري" },
  { href: "/hr/attendance/leaves", label: "طلبات الإجازة" },
  { href: "/hr/attendance/settings", label: "الورديات وأنواع الإجازات" },
];
export const PAYROLL_TABS = [
  { href: "/hr/payroll", label: "المسيرات", exact: true },
  { href: "/hr/payroll/adjustments", label: "البنود المتغيرة" },
  { href: "/hr/payroll/loans", label: "السلف" },
  { href: "/hr/payroll/settings", label: "إعدادات الرواتب" },
];

export const EMPLOYEE_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "على رأس العمل", color: "green" },
  ON_LEAVE: { label: "في إجازة", color: "teal" },
  SUSPENDED: { label: "موقوف", color: "orange" },
  TERMINATED: { label: "منتهية خدمته", color: "gray" },
};
export const CATEGORY: Record<string, { label: string; color: string }> = {
  ACADEMIC: { label: "هيئة تعليمية", color: "navy" },
  ADMIN: { label: "إداري", color: "slate" },
  SERVICES: { label: "خدمات", color: "brown" },
};
export const LEAVE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "بانتظار الموافقة", color: "gold" },
  APPROVED: { label: "معتمدة", color: "green" },
  REJECTED: { label: "مرفوضة", color: "red" },
  CANCELLED: { label: "ملغاة", color: "gray" },
};
export const ATT_STATUS: Record<string, { label: string; color: string; short: string }> = {
  PRESENT: { label: "حاضر", color: "green", short: "ح" },
  LATE: { label: "متأخر", color: "gold", short: "ت" },
  ABSENT: { label: "غائب", color: "red", short: "غ" },
  ON_LEAVE: { label: "في إجازة", color: "teal", short: "إ" },
  HOLIDAY: { label: "عطلة", color: "gray", short: "ع" },
  EXCUSED: { label: "غياب بعذر", color: "slate", short: "عذ" },
};
export const RUN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "مسودة", color: "gray" },
  REVIEW: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمد — بانتظار الصرف", color: "navy" },
  PAID: { label: "مصروف", color: "green" },
  CANCELLED: { label: "ملغى", color: "red" },
};
export const LOAN_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  ACTIVE: { label: "قائمة", color: "navy" },
  SETTLED: { label: "مسددة", color: "green" },
  REJECTED: { label: "مرفوضة", color: "red" },
};
export const ADJ_KIND: Record<string, { label: string; color: string }> = {
  BONUS: { label: "مكافأة", color: "green" },
  ALLOWANCE: { label: "بدل متغير", color: "teal" },
  OVERTIME: { label: "عمل إضافي", color: "navy" },
  PENALTY: { label: "جزاء", color: "red" },
  DEDUCTION: { label: "استقطاع", color: "orange" },
};
export const NATIONALITIES = [
  { value: "SA", label: "سعودي" },
  { value: "EG", label: "مصري" },
  { value: "JO", label: "أردني" },
  { value: "SD", label: "سوداني" },
  { value: "PK", label: "باكستاني" },
  { value: "IN", label: "هندي" },
  { value: "PH", label: "فلبيني" },
  { value: "SY", label: "سوري" },
  { value: "YE", label: "يمني" },
  { value: "TN", label: "تونسي" },
];
export const nationalityLabel = (c: string) => NATIONALITIES.find((n) => n.value === c)?.label ?? c;
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** شهر YYYY-MM بالعربية وبتفضيل الأرقام */
export function useMonthLabel() {
  const prefs = usePrefs();
  return (month: string) => {
    const [y = 2000, m = 1] = month.split("-").map(Number);
    return monthTitle(y, m - 1, "gregory", prefs.digits);
  };
}
