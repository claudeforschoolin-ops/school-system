"use client";
/**
 * إطار صفحة الوحدة: مسار التنقل، الأيقونة والعنوان والوصف، وتبويبات (الرئيسية/التقارير/الإعدادات…).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MODULE_GROUP_ICONS, MODULE_GROUP_LABELS, type ModuleNavItem } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/components/shell/app-context";
import { PageIcon } from "@/components/ui/icon";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export interface ModuleTab {
  href: string;
  label: string;
  /** يطابق المسار كاملاً فقط */
  exact?: boolean;
}

export function ModuleShell({
  nav,
  tabs,
  actions,
  children,
  wide,
  title,
  crumbs,
}: {
  nav: ModuleNavItem;
  tabs?: ModuleTab[];
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  title?: string;
  crumbs?: Array<{ title: string; href?: string; icon?: string | null }>;
}) {
  const pathname = usePathname();
  useTabMeta(title ?? nav.label, nav.icon);
  return (
    <>
      <PageTopbar
        crumbs={[{ title: MODULE_GROUP_LABELS[nav.group], icon: MODULE_GROUP_ICONS[nav.group] }, { title: nav.label, icon: nav.icon, href: nav.href }, ...(crumbs ?? [])]}
        actions={actions}
      />
      <div className={cn("mx-auto w-full px-6 pb-24 pt-8 md:px-12", wide ? "max-w-[1400px]" : "max-w-[1120px]")}>
        {title === undefined ? (
          <header className="mb-5">
            <span className="grid size-14 place-items-center rounded-full bg-hover text-fg-2">
              <PageIcon icon={nav.icon} size={28} strokeWidth={1.6} />
            </span>
            <h1 className="mt-4 text-[32px] font-bold leading-tight">{nav.label}</h1>
            <p className="mt-1 text-[15px] text-fg-3">{nav.description}</p>
          </header>
        ) : null}
        {tabs?.length ? (
          <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="أقسام الوحدة">
            {tabs.map((t) => {
              const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn("relative -mb-px shrink-0 border-b-2 px-2.5 pb-2 pt-1 text-[14px] transition-colors", active ? "border-fg font-medium text-fg" : "border-transparent text-fg-3 hover:text-fg-2")}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        {children}
      </div>
    </>
  );
}

export function StatCard({ label, value, icon, tone, href, hint, format, compact }: { label: string; value: number | null | undefined; icon: ReactNode; tone?: "danger" | "warning" | "success"; href?: string; hint?: string; format?: (n: number) => string; compact?: boolean }) {
  const prefs = usePrefs();
  const body = (
    <>
      <div className="flex items-center justify-between text-fg-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className={cn("grid size-7 place-items-center rounded-md bg-hover", tone === "danger" && "bg-danger-50 text-danger-700", tone === "warning" && "bg-warning-50 text-warning-700", tone === "success" && "bg-success-50 text-success-800")}>{icon}</span>
      </div>
      <div className={cn("mt-3 font-bold leading-none tabular text-fg", compact ? "truncate text-[22px]" : "text-[28px]", tone === "danger" && value ? "text-danger-700" : "")}>
        {value === undefined ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-hover" /> : value === null ? "—" : format ? format(value) : formatNumber(value, prefs.digits)}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] text-fg-3">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] duration-[140ms]";
  return href ? (
    <Link href={href} className={cn(cls, "hover:-translate-y-px hover:shadow-card-hover")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
