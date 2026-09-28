"use client";
/**
 * مجموعة في الشريط الجانبي: عنوان رمادي ١٢px قابل للطي، تظهر أزرار الإجراء عند التمرير.
 */
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useStoredValue } from "@/lib/hooks/use-stored-value";
import { cn } from "@/lib/utils";

function storageKey(id: string) {
  return `manassa:sidebar-group:${id}`;
}

export function SidebarGroup({ id, title, actions, children, defaultOpen = true }: { id: string; title: string; actions?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [stored, setStored] = useStoredValue(storageKey(id));
  const open = stored === null ? defaultOpen : stored === "1";
  const toggle = () => setStored(open ? "0" : "1");
  return (
    <section className="mt-3 first:mt-1">
      <div className="group/header flex h-7 items-center justify-between rounded-md pe-1 ps-2 transition-colors duration-[120ms] hover:bg-hover">
        <button onClick={toggle} className="flex h-full flex-1 items-center text-[12px] font-medium text-fg-3" aria-expanded={open}>
          {title}
        </button>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/header:opacity-100 focus-within:opacity-100">{actions}</div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/** زر صغير يظهر عند التمرير على عنصر/مجموعة */
export function HoverAction({ label, onClick, children, className }: { label: string; onClick?: (e: React.MouseEvent) => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn("grid size-5 place-items-center rounded-[4px] text-fg-3 transition-colors hover:bg-active hover:text-fg", className)}
    >
      {children}
    </button>
  );
}
