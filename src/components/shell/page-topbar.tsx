"use client";
/**
 * شريط الصفحة العلوي: مسار التنقل + (مشاركة، تعليقات، مفضلة، ⋯).
 */
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { PageIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface Crumb {
  href?: string;
  title: string;
  icon?: string | null;
}

export function PageTopbar({ crumbs, actions, meta, className }: { crumbs: Crumb[]; actions?: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <header className={cn("no-print sticky top-0 z-20 flex h-11 items-center gap-2 bg-app/95 px-3 backdrop-blur-[2px]", className)}>
      <nav aria-label="مسار التنقل" className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const content = (
            <>
              {c.icon !== undefined ? <PageIcon icon={c.icon} size={15} /> : null}
              <span className="truncate">{c.title || "بدون عنوان"}</span>
            </>
          );
          return (
            <Fragment key={`${c.title}-${i}`}>
              {i > 0 ? <span className="px-0.5 text-fg-4">/</span> : null}
              {c.href && !last ? (
                <Link href={c.href} className="flex min-w-0 max-w-[180px] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-fg-2 transition-colors hover:bg-hover hover:text-fg">
                  {content}
                </Link>
              ) : (
                <span className={cn("flex min-w-0 items-center gap-1.5 px-1.5 py-0.5", last ? "text-fg" : "text-fg-2")}>{content}</span>
              )}
            </Fragment>
          );
        })}
      </nav>
      {meta ? <span className="hidden shrink-0 text-[12px] text-fg-3 lg:inline">{meta}</span> : null}
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}

export function TopbarIconButton({ label, onClick, children, active }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("grid size-7 place-items-center rounded-md text-fg-2 transition-colors duration-[120ms] hover:bg-hover hover:text-fg", active && "bg-hover text-fg")}
    >
      {children}
    </button>
  );
}
