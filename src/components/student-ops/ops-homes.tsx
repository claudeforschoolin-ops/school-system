"use client";
/**
 * الصفحات الرئيسية: التحويلات، الإجازات والاستئذان، السلوك، الحالات الإرشادية.
 */
import { ArrowLeftRight, BadgeCheck, CalendarClock, CalendarX, Hourglass, Scale, ShieldAlert, ThumbsDown, ThumbsUp, Wallet } from "lucide-react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrefs } from "@/components/shell/app-context";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";

export const TRANSFER_TABS = [
  { href: "/transfers", label: "التحويلات" },
  { href: "/leaves", label: "الإجازات والاستئذان" },
];
export const BEHAVIOR_TABS = [
  { href: "/behavior", label: "السلوك" },
  { href: "/counseling", label: "الحالات الإرشادية" },
];
const nav = (key: string) => MODULE_NAV.find((m) => m.key === key)!;

function DbSection({ id }: { id: string | undefined }) {
  return id ? <DatabaseView databaseId={id} mode="page" /> : <Skeleton className="h-64 w-full" />;
}

export function TransfersHome() {
  const o = trpc.transfers.overview.useQuery().data;
  const db = trpc.transfers.databaseId.useQuery();
  return (
    <ModuleShell nav={nav("transfers")} tabs={TRANSFER_TABS} wide>
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="بانتظار الموافقات" value={o?.pending} icon={<Hourglass className="size-4" />} tone={o?.pending ? "warning" : undefined} />
        <StatCard label="بانتظار خلو الطرف" value={o?.awaitingClearance} icon={<Wallet className="size-4" />} />
        <StatCard label="معتمدة للتنفيذ" value={o?.approved} icon={<BadgeCheck className="size-4" />} tone={o?.approved ? "success" : undefined} />
        <StatCard label="منفّذة هذا العام" value={o?.completed} icon={<ArrowLeftRight className="size-4" />} />
      </section>
      <DbSection id={db.data} />
    </ModuleShell>
  );
}

export function LeavesHome() {
  const o = trpc.transfers.overview.useQuery().data;
  const db = trpc.leaves.databaseId.useQuery();
  return (
    <ModuleShell nav={nav("transfers")} tabs={TRANSFER_TABS} wide>
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="طلبات بانتظار الاعتماد" value={o?.leavesPending} icon={<Hourglass className="size-4" />} tone={o?.leavesPending ? "warning" : undefined} />
        <StatCard label="في إجازة اليوم" value={o?.leavesToday} icon={<CalendarX className="size-4" />} />
      </section>
      <DbSection id={db.data} />
    </ModuleShell>
  );
}

export function BehaviorHome() {
  const prefs = usePrefs();
  const o = trpc.behavior.overview.useQuery().data;
  const db = trpc.behavior.databaseId.useQuery();
  return (
    <ModuleShell nav={nav("behavior")} tabs={BEHAVIOR_TABS} wide>
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="سلوك إيجابي هذا الشهر" value={o?.positive} icon={<ThumbsUp className="size-4" />} tone="success" />
        <StatCard label="سلوك سلبي هذا الشهر" value={o?.negative} icon={<ThumbsDown className="size-4" />} />
        <StatCard label="حالات عالية الخطورة" value={o?.severe} icon={<ShieldAlert className="size-4" />} tone={o?.severe ? "danger" : undefined} />
        <StatCard label="صافي النقاط" value={o?.points} icon={<Scale className="size-4" />} format={(n) => `${n > 0 ? "+" : ""}${formatNumber(n, prefs.digits)}`} />
      </section>
      <DbSection id={db.data} />
    </ModuleShell>
  );
}

export function CounselingHome() {
  const o = trpc.behavior.overview.useQuery().data;
  const db = trpc.behavior.casesDatabaseId.useQuery();
  return (
    <ModuleShell nav={nav("behavior")} tabs={BEHAVIOR_TABS} wide>
      <p className="mb-5 rounded-lg bg-navy-50 px-3.5 py-2.5 text-[13px] text-navy-700 dark:bg-hover dark:text-fg-2">سجل سرّي: تظهر لك الحالات المسندة إليك فقط، والإدارة ترى حالات نطاقها.</p>
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="حالات مفتوحة" value={o ? o.openCases : undefined} icon={<Hourglass className="size-4" />} />
        <StatCard label="جلسات هذا الأسبوع" value={o ? o.sessionsThisWeek : undefined} icon={<CalendarClock className="size-4" />} />
      </section>
      <DbSection id={db.data} />
    </ModuleShell>
  );
}
