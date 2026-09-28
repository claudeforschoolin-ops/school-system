"use client";
/**
 * الصفحة الرئيسية لوحدة ملفات الطلاب: مؤشرات سريعة + قاعدة بيانات الطلاب بعروضها.
 */
import { FileWarning, HeartPulse, LayoutGrid, UserCheck, UserPlus } from "lucide-react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { usePrefs } from "@/components/shell/app-context";
import { Skeleton } from "@/components/ui/skeleton";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";

export const STUDENT_TABS = [
  { href: "/students", label: "الطلاب", exact: true },
  { href: "/students/reports", label: "التقارير" },
  { href: "/students/settings", label: "الإعدادات" },
];

export function StudentsHome() {
  const prefs = usePrefs();
  const nav = MODULE_NAV.find((m) => m.key === "students")!;
  const overview = trpc.students.overview.useQuery();
  const dbId = trpc.students.databaseId.useQuery();
  const o = overview.data;
  return (
    <ModuleShell nav={nav} tabs={STUDENT_TABS} wide>
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="طلاب منتظمون" value={o?.active} icon={<UserCheck className="size-4" />} hint={o ? `من ${formatNumber(o.total, prefs.digits)} ملفاً` : undefined} />
        <StatCard label="جدد هذا الشهر" value={o?.newThisMonth} icon={<UserPlus className="size-4" />} tone="success" />
        <StatCard label="حالات صحية حرجة" value={o?.criticalHealth} icon={<HeartPulse className="size-4" />} tone={o?.criticalHealth ? "danger" : undefined} />
        <StatCard label="مستندات ناقصة" value={o?.missingDocs} icon={<FileWarning className="size-4" />} tone={o?.missingDocs ? "warning" : undefined} />
        <StatCard label="بدون تسكين في فصل" value={o?.unplaced} icon={<LayoutGrid className="size-4" />} tone={o?.unplaced ? "warning" : undefined} href="/academic/classes" />
      </section>
      {dbId.data ? <DatabaseView databaseId={dbId.data} mode="page" /> : <Skeleton className="h-64 w-full" />}
    </ModuleShell>
  );
}
