"use client";
/**
 * الصفحة الرئيسية للقبول: مؤشرات + لوحة مراحل القبول (سحب الطلب بين المراحل يطبّق قواعد القبول).
 */
import { CalendarClock, Copy, Globe, Hourglass, Inbox, Percent, UserCheck } from "lucide-react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";

export const ADMISSION_TABS = [
  { href: "/admissions", label: "الطلبات", exact: true },
  { href: "/admissions/reports", label: "التقارير" },
  { href: "/admissions/settings", label: "الإعدادات" },
];

export function publicApplyUrl(slug: string) {
  return typeof window === "undefined" ? `/apply/${slug}` : `${window.location.origin}/apply/${slug}`;
}

export function AdmissionsHome() {
  const prefs = usePrefs();
  const nav = MODULE_NAV.find((m) => m.key === "admissions")!;
  const o = trpc.admissions.overview.useQuery().data;
  const dbId = trpc.admissions.databaseId.useQuery();
  return (
    <ModuleShell
      nav={nav}
      tabs={ADMISSION_TABS}
      wide
      actions={
        o ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(publicApplyUrl(o.tenantSlug));
              toast.success("نُسخ رابط التقديم العام");
            }}
          >
            رابط التقديم العام
          </Button>
        ) : null
      }
    >
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="طلبات قيد الإجراء" value={o?.open} icon={<Inbox className="size-4" />} />
        <StatCard label="من النموذج العام (جديدة)" value={o?.newFromPublicForm} icon={<Globe className="size-4" />} tone={o?.newFromPublicForm ? "warning" : undefined} />
        <StatCard label="مقابلات هذا الأسبوع" value={o?.interviewsThisWeek} icon={<CalendarClock className="size-4" />} />
        <StatCard label="مقبولون ومسجّلون" value={o?.accepted} icon={<UserCheck className="size-4" />} tone="success" />
        <StatCard label="نسبة القبول" value={o ? (o.acceptanceRate ?? null) : undefined} icon={o?.waitlist ? <Hourglass className="size-4" /> : <Percent className="size-4" />} format={(n) => formatPercent(n, prefs.digits)} hint={o?.waitlist ? `قائمة الانتظار: ${formatNumber(o.waitlist, prefs.digits)}` : undefined} />
      </section>
      {dbId.data ? <DatabaseView databaseId={dbId.data} mode="page" /> : <Skeleton className="h-64 w-full" />}
    </ModuleShell>
  );
}
