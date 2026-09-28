"use client";
/** إطار الإعدادات: تنقل جانبي حسب الصلاحيات + محتوى القسم */
import { Building2, FileClock, GitBranch, KeyRound, Mail, Network, Palette, ShieldCheck, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export function SettingsShell({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  const { can } = useApp();
  const pathname = usePathname();
  useTabMeta(`الإعدادات — ${title}`, "lucide:settings");
  const personal = [
    { href: "/settings/profile", label: "الملف الشخصي", icon: UserRound },
    { href: "/settings/appearance", label: "المظهر والتفضيلات", icon: Palette },
    { href: "/settings/security", label: "الأمان والجلسات", icon: KeyRound },
  ];
  const admin = [
    can("settings", "view") && { href: "/settings/school", label: "المدرسة", icon: Building2 },
    can("settings", "view") && { href: "/settings/branches", label: "الفروع", icon: GitBranch },
    can("settings", "view") && { href: "/settings/structure", label: "المراحل والأعوام", icon: Network },
    can("users", "view") && { href: "/settings/users", label: "المستخدمون", icon: Users },
    can("roles", "view") && { href: "/settings/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck },
    can("audit", "view") && { href: "/settings/audit", label: "سجل التدقيق", icon: FileClock },
    can("settings", "view") && { href: "/settings/outbox", label: "صندوق الإرسال", icon: Mail },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Users }>;

  const link = (item: { href: string; label: string; icon: typeof Users }) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-[14px] text-fg-2 transition-colors hover:bg-hover", pathname === item.href && "bg-active font-medium text-fg")}
    >
      <item.icon className="size-4 text-fg-3" />
      {item.label}
    </Link>
  );

  return (
    <>
      <PageTopbar crumbs={[{ title: "الإعدادات", icon: "lucide:settings", href: "/settings" }, { title }]} />
      <div className="mx-auto flex w-full max-w-[1180px] gap-8 px-4 pb-24 pt-8 md:px-10">
        <nav className="hidden w-[210px] shrink-0 md:block" aria-label="أقسام الإعدادات">
          <p className="mb-1 px-2 text-[12px] font-medium text-fg-3">حسابي</p>
          <div className="space-y-px">{personal.map(link)}</div>
          {admin.length ? (
            <>
              <p className="mb-1 mt-5 px-2 text-[12px] font-medium text-fg-3">إدارة المدرسة</p>
              <div className="space-y-px">{admin.map(link)}</div>
            </>
          ) : null}
        </nav>
        <main className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
              {description ? <p className="mt-1 text-[14px] text-fg-3">{description}</p> : null}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </>
  );
}

export function SettingsCard({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg shadow-card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-fg-3">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
    </section>
  );
}
