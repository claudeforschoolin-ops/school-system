"use client";
/**
 * الرئيسية: لوحة حسب الدور — تحية وتاريخ مزدوج، مؤشرات، صفحات زرتها مؤخراً، مهامي، أحداث قادمة.
 */
import { motion } from "motion/react";
import { AlarmClock, Bell, CalendarDays, CheckSquare, ClipboardCheck, Database, FileText, KeyRound, ShieldCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatRelative, formatTimeRange, greetingForHour, hourIn } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useApp } from "@/components/shell/app-context";
import { EVENT_COLORS } from "@/components/shell/sidebar/upcoming";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export function HomeView() {
  const { user, prefs, tenant } = useApp();
  useTabMeta("الرئيسية", "lucide:house");
  const home = trpc.workspace.home.useQuery();
  const recents = trpc.workspace.recents.useQuery({ limit: 8 });
  const tasks = trpc.workspace.myTasks.useQuery();
  const upcoming = trpc.workspace.upcoming.useQuery();
  const firstName = user.name.replace(/^(أ|م|د)\.\s*/, "").split(" ")[0];
  const now = new Date();

  return (
    <>
      <PageTopbar crumbs={[{ title: "الرئيسية", icon: "lucide:house" }]} />
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-24 pt-8 md:px-12">
        <p className="text-[13px] text-fg-3">{formatDate(now, { calendar: prefs.calendar, digits: prefs.digits, style: "full" })}</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight text-fg md:text-[36px]">
          {greetingForHour(hourIn(tenant.timezone))}، {firstName}
        </h1>
        <p className="mt-1 text-[15px] text-fg-3">{tenant.name}</p>

        {/* المؤشرات */}
        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="مهامي المفتوحة" value={home.data?.openTasks} icon={<CheckSquare className="size-4" />} href="/tasks" />
          <Kpi label="مهام متأخرة" value={home.data?.overdueTasks} icon={<AlarmClock className="size-4" />} tone={home.data?.overdueTasks ? "danger" : undefined} href="/tasks" />
          <Kpi label="إشعارات غير مقروءة" value={home.data?.unread} icon={<Bell className="size-4" />} href="/inbox?tab=unread" />
          <Kpi label="موافقات بانتظاري" value={home.data?.pendingApprovals} icon={<ClipboardCheck className="size-4" />} tone={home.data?.pendingApprovals ? "warning" : undefined} href="/inbox?tab=approvals" />
          {home.data?.admin ? (
            <>
              <Kpi label="مستخدمون نشطون" value={home.data.admin.activeUsers} icon={<Users className="size-4" />} href="/settings/users" />
              <Kpi label="جلسات اليوم" value={home.data.admin.sessionsToday} icon={<KeyRound className="size-4" />} href="/settings/users" />
              <Kpi label="عمليات مسجلة اليوم" value={home.data.admin.auditToday} icon={<ShieldCheck className="size-4" />} href="/settings/audit" />
              <Kpi label="دعوات معلّقة" value={home.data.admin.pendingInvites} icon={<UserPlus className="size-4" />} href="/settings/users?status=INVITED" />
            </>
          ) : null}
        </section>

        {/* زرتها مؤخراً */}
        <Section title="زرتها مؤخراً" icon={<FileText className="size-4" />}>
          {recents.isLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[112px] w-[150px] rounded-lg" />
              ))}
            </div>
          ) : recents.data?.length ? (
            <div className="thin-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
              {recents.data.map((r, i) => (
                <motion.div key={r.targetId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.18 }}>
                  <Link
                    href={r.href}
                    className="flex h-[112px] w-[150px] shrink-0 flex-col justify-between overflow-hidden rounded-lg bg-card p-3 shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover"
                  >
                    <PageIcon icon={r.icon} size={22} fallback={r.kind === "DATABASE" ? Database : FileText} className="text-fg-2" />
                    <div>
                      <p className="line-clamp-2 text-[14px] font-medium leading-5 text-fg">{r.title || "بدون عنوان"}</p>
                      <p className="mt-1 truncate text-[12px] text-fg-3">{formatRelative(r.visitedAt, new Date(), prefs.digits)}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-fg-3">لم تزر أي صفحة بعد. ابدأ من الشريط الجانبي.</p>
          )}
        </Section>

        <div className="mt-2 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Section title="مهامي" icon={<CheckSquare className="size-4" />} action={<Link href="/tasks" className="text-[13px] text-fg-3 hover:text-fg">عرض الكل</Link>}>
            {tasks.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : tasks.data?.length ? (
              <ul className="divide-y divide-line rounded-lg shadow-card">
                {tasks.data.slice(0, 7).map((t) => (
                  <li key={t.id}>
                    <Link href={`/r/${t.id}`} className="flex h-11 items-center gap-3 px-3 transition-colors hover:bg-hover">
                      <PageIcon icon={t.icon ?? t.database.icon} size={16} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{t.title || "بدون عنوان"}</span>
                      {t.status ? <Tag color={t.status.color}>{t.status.name}</Tag> : null}
                      {t.due ? (
                        <span className={cn("hidden shrink-0 text-[12px] tabular sm:inline", t.due.slice(0, 10) < new Date().toISOString().slice(0, 10) && t.status?.group !== "complete" ? "text-danger-700" : "text-fg-3")}>
                          {formatDate(t.due, { digits: prefs.digits })}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact illustration="table" title="لا توجد مهام مسندة إليك" description="عندما يُسند إليك زميل مهمة ستظهر هنا." />
            )}
          </Section>

          <Section title="الأحداث القادمة" icon={<CalendarDays className="size-4" />} action={<Link href="/calendar" className="text-[13px] text-fg-3 hover:text-fg">التقويم</Link>}>
            {upcoming.data?.length ? (
              <ul className="space-y-1.5">
                {upcoming.data.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-hover">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--tag-${EVENT_COLORS[e.category] ?? "slate"}-dot)` }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-fg">{e.title}</p>
                      <p className="text-[12px] text-fg-3 tabular">
                        {formatDate(e.startAt, { digits: prefs.digits, calendar: prefs.calendar === "both" ? "gregory" : prefs.calendar })}
                        {e.allDay ? "" : ` · ${formatTimeRange(new Date(e.startAt), new Date(e.endAt), prefs.digits)}`}
                        {e.location ? ` · ${e.location}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact illustration="calendar" title="لا توجد أحداث قادمة" />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-fg-3">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, icon, tone, href }: { label: string; value: number | undefined; icon: ReactNode; tone?: "danger" | "warning"; href: string }) {
  const { prefs } = useApp();
  return (
    <Link href={href} className="group rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between text-fg-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className={cn("grid size-7 place-items-center rounded-md bg-hover", tone === "danger" && "bg-danger-50 text-danger-700", tone === "warning" && "bg-warning-50 text-warning-700")}>{icon}</span>
      </div>
      <div className={cn("mt-3 text-[28px] font-bold leading-none text-fg", tone === "danger" && value ? "text-danger-700" : "")}>
        {value === undefined ? <Skeleton className="h-7 w-10" /> : <CountUp value={value} digits={prefs.digits} />}
      </div>
    </Link>
  );
}
