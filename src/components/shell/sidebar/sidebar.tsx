"use client";
/**
 * الشريط الجانبي (يمين الشاشة): عرض ٢٦٠px قابل للتحجيم (٢٢٠–٣٨٠) والطي.
 */
import { motion } from "motion/react";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronsRight,
  Database,
  FileText,
  House,
  Inbox,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useStoredValue } from "@/lib/hooks/use-stored-value";
import { AGENTS } from "@/lib/agents";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/ui/icon";
import { Kbd, modKey } from "@/components/ui/kbd";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "../app-context";
import { openCommandPalette } from "../command-palette";
import { usePageActions } from "../use-page-actions";
import { PageTreeList, PageTreeProvider, RootDropZone, type SidebarData } from "./page-tree";
import { HoverAction, SidebarGroup } from "./sidebar-group";
import { UpcomingEvents } from "./upcoming";
import { WorkspaceMenu } from "./workspace-menu";

const MIN_WIDTH = 220;
const MAX_WIDTH = 380;

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const { prefs, setPrefs } = useApp();
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? prefs.sidebarWidth;
  const collapsed = prefs.sidebarCollapsed;
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, w: width };
    const onMove = (ev: PointerEvent) => {
      if (!startRef.current) return;
      // في RTL: السحب نحو اليسار يزيد العرض
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.w + (startRef.current.x - ev.clientX)));
      setDragWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (startRef.current) {
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.w + (startRef.current.x - ev.clientX)));
        setPrefs({ sidebarWidth: Math.round(next) });
      }
      startRef.current = null;
      setDragWidth(null);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      {/* خلفية الجوال */}
      {mobileOpen ? <div className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={onMobileClose} aria-hidden /> : null}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 0 : width }}
        transition={dragWidth !== null ? { duration: 0 } : { duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group/sidebar relative z-50 h-dvh shrink-0 overflow-hidden bg-sidebar",
          "max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:w-[280px]! max-md:transition-transform max-md:duration-[240ms]",
          mobileOpen ? "max-md:translate-x-0" : "max-md:translate-x-full",
        )}
        aria-label="الشريط الجانبي"
      >
        <div className="flex h-full flex-col" style={{ width: dragWidth ?? prefs.sidebarWidth, minWidth: MIN_WIDTH }}>
          <SidebarContent onNavigate={onMobileClose} />
        </div>
        {/* مقبض التحجيم على الحافة الداخلية */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="تغيير عرض الشريط الجانبي"
          onPointerDown={onResizeStart}
          onDoubleClick={() => setPrefs({ sidebarWidth: 260 })}
          className="absolute inset-y-0 end-0 z-10 w-1.5 cursor-col-resize transition-colors duration-[120ms] hover:bg-line-strong max-md:hidden"
        />
      </motion.aside>
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { setPrefs, can } = useApp();
  const { data, isLoading } = trpc.workspace.sidebar.useQuery(undefined, { staleTime: 30_000 });

  return (
    <>
      <div className="flex items-center gap-1 px-2 pt-2">
        <WorkspaceMenu />
        <Tooltip content="طي الشريط الجانبي" shortcut={`${modKey()} \\`}>
          <button
            onClick={() => setPrefs({ sidebarCollapsed: true })}
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 opacity-0 transition-[opacity,background-color] duration-[120ms] hover:bg-hover hover:text-fg group-hover/sidebar:opacity-100 max-md:hidden"
            aria-label="طي الشريط الجانبي"
          >
            <ChevronsRight className="size-4" />
          </button>
        </Tooltip>
      </div>

      <IconRow />

      <nav className="thin-scroll mt-1 flex-1 overflow-y-auto px-2 pb-4" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate()}>
        {can("events", "view") ? (
          <SidebarGroup
            id="upcoming"
            title="الأحداث القادمة"
            actions={
              <Link href="/calendar" className="grid size-5 place-items-center rounded-[4px] text-fg-3 hover:bg-active hover:text-fg" aria-label="فتح التقويم">
                <CalendarDays className="size-3.5" />
              </Link>
            }
          >
            <UpcomingEvents />
          </SidebarGroup>
        ) : null}

        <AgentsGroup />

        {isLoading || !data ? (
          <div className="mt-4 space-y-2 px-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${85 - i * 7}%` }} />
            ))}
          </div>
        ) : (
          <PageTreeProvider data={data}>
            {data.favorites.length ? <FavoritesGroup data={data} /> : null}
            <TeamspacesGroup data={data} />
            <PrivateGroup data={data} />
          </PageTreeProvider>
        )}

        <div className="mt-4 space-y-px">
          <NavLink href="/trash" icon={<Trash2 className="size-[18px]" strokeWidth={1.7} />}>
            المهملات
          </NavLink>
          <NavLink href="/settings" icon={<Settings className="size-[18px]" strokeWidth={1.7} />}>
            الإعدادات {can("users", "view") ? "والأعضاء" : ""}
          </NavLink>
        </div>
      </nav>

      <SidebarFooter />
    </>
  );
}

function IconRow() {
  const pathname = usePathname();
  const { data: badges } = trpc.workspace.badges.useQuery(undefined, { refetchInterval: 30_000 });
  const item = (href: string, label: string, icon: React.ReactNode, badge?: number, danger?: boolean) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Tooltip content={label}>
        <Link
          href={href}
          aria-label={label}
          className={cn(
            "relative grid size-8 place-items-center rounded-full text-fg-2 transition-[background-color,color,box-shadow] duration-[120ms] hover:bg-hover hover:text-fg",
            active && "bg-card text-fg shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,23,42,.06)] hover:bg-card",
          )}
        >
          {icon}
          {badge ? (
            <span
              className={cn(
                "absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-sidebar",
                danger ? "bg-danger-700" : "bg-navy-700 dark:text-on-primary",
              )}
            >
              <NumberTicker value={Math.min(badge, 99)} className="h-3 leading-3" />
            </span>
          ) : null}
        </Link>
      </Tooltip>
    );
  };
  return (
    <div className="flex items-center gap-1 px-2 pb-1 pt-2">
      {item("/home", "الرئيسية", <House className="size-[18px]" strokeWidth={1.7} />)}
      {item("/chat", "المحادثات", <MessageCircle className="size-[18px]" strokeWidth={1.7} />, badges?.unreadChats)}
      {item("/calendar", "التقويم", <CalendarDays className="size-[18px]" strokeWidth={1.7} />)}
      {item("/inbox", "صندوق الوارد", <Inbox className="size-[18px]" strokeWidth={1.7} />, badges?.unreadNotifications, true)}
      <Tooltip content="بحث" shortcut={`${modKey()} K`}>
        <button
          onClick={() => openCommandPalette()}
          aria-label="بحث"
          className="grid size-8 place-items-center rounded-full text-fg-2 transition-colors duration-[120ms] hover:bg-hover hover:text-fg"
        >
          <Search className="size-[18px]" strokeWidth={1.7} />
        </button>
      </Tooltip>
    </div>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-fg-2 transition-colors duration-[120ms] hover:bg-hover",
        active && "bg-active text-fg",
      )}
    >
      <span className="text-fg-3">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function AgentsGroup() {
  const { can } = useApp();
  const pathname = usePathname();
  const agents = AGENTS.filter((a) => can(a.module, "view"));
  if (!agents.length) return null;
  return (
    <SidebarGroup id="agents" title="المساعدون الأذكياء" defaultOpen={false}>
      {agents.map((a) => {
        const href = `/agents/${a.key}`;
        return (
          <Link
            key={a.key}
            href={href}
            className={cn(
              "flex h-7 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-fg-2 transition-colors duration-[120ms] hover:bg-hover",
              pathname === href && "bg-active text-fg",
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: `var(--tag-${a.color}-bg)`, color: `var(--tag-${a.color}-dot)` }}>
              <PageIcon icon={a.icon} size={12} strokeWidth={2} />
            </span>
            <span className="truncate">{a.name}</span>
          </Link>
        );
      })}
    </SidebarGroup>
  );
}

function FavoritesGroup({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  return (
    <SidebarGroup id="favorites" title="المفضلة">
      {data.favorites.map((f) => (
        <Link
          key={f.id}
          href={f.href}
          className={cn(
            "flex h-7 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-fg-2 transition-colors duration-[120ms] hover:bg-hover",
            pathname === f.href && "bg-active text-fg",
          )}
        >
          <PageIcon icon={f.icon} size={16} fallback={f.kind === "DATABASE" ? Database : FileText} />
          <span className="truncate">{f.title || "بدون عنوان"}</span>
        </Link>
      ))}
    </SidebarGroup>
  );
}

function TeamspacesGroup({ data }: { data: SidebarData }) {
  if (!data.teamspaces.length) return null;
  return (
    <SidebarGroup id="teamspaces" title="مساحات الفرق">
      {data.teamspaces.map((ts) => (
        <TeamspaceNode key={ts.id} teamspace={ts} />
      ))}
    </SidebarGroup>
  );
}

function TeamspaceNode({ teamspace }: { teamspace: SidebarData["teamspaces"][number] }) {
  const actions = usePageActions();
  const storageKey = `manassa:ts-open:${teamspace.id}`;
  const [stored, setStored] = useStoredValue(storageKey);
  const open = stored !== "0";
  const toggle = useCallback((value?: boolean) => setStored((value ?? !open) ? "1" : "0"), [open, setStored]);
  const canEdit = teamspace.level === "EDIT" || teamspace.level === "FULL";

  return (
    <div className="mb-px">
      <RootDropZone id={`ts:${teamspace.id}`}>
        <div className="group/ts flex h-7 items-center gap-1 rounded-md pe-1 ps-2 transition-colors duration-[120ms] hover:bg-hover">
          <button onClick={() => toggle()} className="flex h-full min-w-0 flex-1 items-center gap-2 text-[14px] font-medium text-fg-2" aria-expanded={open}>
            <span className="relative grid size-5 shrink-0 place-items-center">
              <span className="grid size-5 place-items-center rounded-[5px] bg-card text-fg-2 shadow-[0_0_0_1px_var(--border)] transition-opacity group-hover/ts:opacity-0">
                <PageIcon icon={teamspace.icon} size={13} strokeWidth={2} />
              </span>
              <ChevronLeft className={cn("absolute size-3.5 text-fg-3 opacity-0 transition-[opacity,transform] duration-200 group-hover/ts:opacity-100", open && "-rotate-90")} />
            </span>
            <span className="truncate">{teamspace.name}</span>
          </button>
          {canEdit ? (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/ts:opacity-100 has-[[data-state=open]]:opacity-100">
              <Menu>
                <MenuTrigger asChild>
                  <button className="grid size-5 place-items-center rounded-[4px] text-fg-3 hover:bg-active hover:text-fg" aria-label="خيارات المساحة">
                    <MoreHorizontal className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<FileText className="size-4" />} onSelect={() => void actions.createPage({ teamspaceId: teamspace.id }).then(() => toggle(true))}>
                    صفحة جديدة
                  </MenuItem>
                  <MenuItem icon={<Database className="size-4" />} onSelect={() => void actions.createPage({ teamspaceId: teamspace.id, kind: "DATABASE" }).then(() => toggle(true))}>
                    قاعدة بيانات جديدة
                  </MenuItem>
                  <MenuItem icon={<Users className="size-4" />} onSelect={() => undefined} disabled>
                    {teamspace.isMember ? "أنت عضو في هذه المساحة" : "وصول عبر صلاحيات دورك"}
                  </MenuItem>
                </MenuContent>
              </Menu>
              <HoverAction label="إضافة صفحة" onClick={() => void actions.createPage({ teamspaceId: teamspace.id }).then(() => toggle(true))}>
                <Plus className="size-4" />
              </HoverAction>
            </div>
          ) : null}
        </div>
      </RootDropZone>
      {open ? <PageTreeList parentKey={`ts:${teamspace.id}`} depth={1} /> : null}
    </div>
  );
}

function PrivateGroup({ data }: { data: SidebarData }) {
  const actions = usePageActions();
  const pathname = usePathname();
  return (
    <SidebarGroup
      id="private"
      title="خاص"
      actions={
        <HoverAction label="صفحة خاصة جديدة" onClick={() => void actions.createPage({ teamspaceId: null })}>
          <Plus className="size-4" />
        </HoverAction>
      }
    >
      <RootDropZone id="private">
        <Link
          href="/tasks"
          className={cn(
            "flex h-7 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-fg-2 transition-colors duration-[120ms] hover:bg-hover",
            pathname === "/tasks" && "bg-active text-fg",
          )}
        >
          <CheckSquare className="size-4 text-fg-3" strokeWidth={1.8} />
          <span className="truncate">مهامي</span>
        </Link>
      </RootDropZone>
      <PageTreeList parentKey="private" depth={0} />
      {data.shared.length ? (
        <>
          <p className="mt-2 flex h-6 items-center gap-1.5 px-2 text-[12px] text-fg-3">
            <Lock className="size-3" />
            مشتركة معي
          </p>
          {data.shared.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className={cn(
                "flex h-7 items-center gap-2 rounded-md px-2 text-[14px] font-medium text-fg-2 transition-colors duration-[120ms] hover:bg-hover",
                pathname === `/p/${p.id}` && "bg-active text-fg",
              )}
            >
              <PageIcon icon={p.icon} size={16} fallback={p.kind === "DATABASE" ? Database : FileText} />
              <span className="truncate">{p.title || "بدون عنوان"}</span>
            </Link>
          ))}
        </>
      ) : null}
    </SidebarGroup>
  );
}

function SidebarFooter() {
  const router = useRouter();
  const actions = usePageActions();
  const quickNote = async () => {
    const date = new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "long" }).format(new Date());
    await actions.createPage({ teamspaceId: null, title: `ملاحظة سريعة — ${date}`, icon: "lucide:notebook-pen" });
  };
  return (
    <div className="flex items-center gap-2 border-t border-line/60 px-2 py-2">
      <button
        onClick={() => router.push("/chat?new=1")}
        className="flex h-9 flex-1 items-center gap-2 rounded-full bg-card px-3 text-[14px] font-medium text-fg shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(15,23,42,.04)] transition-shadow duration-[140ms] hover:shadow-[0_0_0_1px_var(--border-strong),0_2px_6px_rgba(15,23,42,.08)]"
      >
        <MessageCircle className="size-4 text-fg-2" />
        <span className="flex-1 text-start">محادثة جديدة</span>
        <Kbd>{modKey()} O</Kbd>
      </button>
      <Tooltip content="ملاحظة سريعة">
        <button
          onClick={() => void quickNote()}
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-card text-fg-2 shadow-[0_0_0_1px_var(--border)] transition-[box-shadow,color] duration-[140ms] hover:text-fg hover:shadow-[0_0_0_1px_var(--border-strong)]"
          aria-label="ملاحظة سريعة"
        >
          <SquarePen className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
