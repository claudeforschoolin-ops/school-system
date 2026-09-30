"use client";
/**
 * شريط التبويبات العلوي: تبويبات الصفحات المفتوحة مثل المتصفح + رجوع/تقدّم + «+».
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronsLeft, Menu as MenuIcon, Plus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/ui/icon";
import { modKey } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "./app-context";
import { initTabs, tabsActions, useTabs } from "./tabs-store";

export function TabsBar({ onOpenMobileSidebar }: { onOpenMobileSidebar: () => void }) {
  const { tabs, activeId } = useTabs();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user, tenant, prefs, setPrefs } = useApp();
  const initialized = useRef(false);
  const href = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;

  useEffect(() => {
    if (!initialized.current) {
      initTabs(user.id, href);
      initialized.current = true;
    } else {
      tabsActions.navigateActive(href);
    }
  }, [href, user.id]);

  const activate = (id: string, target: string) => {
    tabsActions.activate(id);
    router.push(target);
  };
  const close = (id: string) => {
    const next = tabsActions.close(id);
    if (next) router.push(next);
  };

  return (
    <div className="no-print flex h-10 shrink-0 items-end gap-1 border-b border-line bg-sidebar pe-2 ps-1.5" data-tour="tabs">
      <div className="flex h-10 items-center gap-0.5">
        <button onClick={onOpenMobileSidebar} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg md:hidden" aria-label="القائمة">
          <MenuIcon className="size-4" />
        </button>
        {prefs.sidebarCollapsed ? (
          <Tooltip content="إظهار الشريط الجانبي" shortcut={`${modKey()} \\`}>
            <button onClick={() => setPrefs({ sidebarCollapsed: false })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg max-md:hidden" aria-label="إظهار الشريط الجانبي">
              <ChevronsLeft className="size-4" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content="رجوع">
          <button onClick={() => router.back()} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="رجوع">
            <ArrowRight className="size-4" />
          </button>
        </Tooltip>
        <Tooltip content="تقدّم">
          <button onClick={() => router.forward()} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="تقدّم">
            <ArrowLeft className="size-4" />
          </button>
        </Tooltip>
      </div>

      <div className="thin-scroll flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto" role="tablist" aria-label="الصفحات المفتوحة">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <motion.div
                key={tab.id}
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="shrink-0 overflow-hidden"
              >
                <div
                  role="tab"
                  aria-selected={active}
                  tabIndex={0}
                  onClick={() => activate(tab.id, tab.href)}
                  onAuxClick={(e) => e.button === 1 && close(tab.id)}
                  onKeyDown={(e) => e.key === "Enter" && activate(tab.id, tab.href)}
                  className={cn(
                    "group/tab relative flex h-8 min-w-[120px] max-w-[220px] cursor-pointer items-center gap-2 rounded-t-lg pe-1.5 ps-2.5 text-[13px] font-medium transition-colors duration-[120ms]",
                    active ? "bg-app text-fg shadow-[0_0_0_1px_var(--border)] [clip-path:inset(-1px_-1px_0_-1px)]" : "text-fg-3 hover:bg-hover hover:text-fg-2",
                  )}
                >
                  <PageIcon icon={tab.icon} size={14} />
                  <span className="min-w-0 flex-1 truncate">{tab.title || "بدون عنوان"}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      close(tab.id);
                    }}
                    className={cn("grid size-5 shrink-0 place-items-center rounded-[4px] text-fg-3 hover:bg-active hover:text-fg", !active && "opacity-0 group-hover/tab:opacity-100")}
                    aria-label="إغلاق التبويب"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <Tooltip content="تبويب جديد">
          <button
            onClick={() => {
              tabsActions.open("/home", { title: "الرئيسية", icon: "lucide:house" });
              router.push("/home");
            }}
            className="mb-1 grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
            aria-label="تبويب جديد"
          >
            <Plus className="size-4" />
          </button>
        </Tooltip>
      </div>

      {tenant.isDemo ? (
        <span className="mb-2 inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-gold-50 px-2 text-[11px] font-medium text-gold-700" title="هذه بيانات تجريبية لأغراض العرض">
          <span className="size-1.5 rounded-full bg-gold-700" />
          {/* على الجوال كلمة واحدة لتوفير المساحة، ويبقى الشريط ظاهراً دائماً */}
          <span className="sm:hidden">تجريبي</span>
          <span className="hidden sm:inline">بيانات تجريبية</span>
        </span>
      ) : null}
    </div>
  );
}

/** تحديث عنوان وأيقونة التبويب النشط من الصفحة الحالية */
export function useTabMeta(title: string | undefined, icon: string | null | undefined) {
  const pathname = usePathname();
  const search = useSearchParams();
  const href = `${pathname}${search.toString() ? `?${search.toString()}` : ""}`;
  useEffect(() => {
    if (title === undefined) return;
    tabsActions.setActiveMeta(href, { title: title || "بدون عنوان", icon: icon ?? null });
    document.title = `${title || "بدون عنوان"} — منصة`;
  }, [href, title, icon]);
}
