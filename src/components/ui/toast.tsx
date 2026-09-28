"use client";
/**
 * الإشعارات المنبثقة: انزلاق من أسفل المنتصف مع تلاشي، تختفي بعد ٤ ثوانٍ.
 * شريط «تراجع» عند الحذف يبقى ٦ ثوانٍ.
 */
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { EASE_OUT } from "@/lib/motion";

type ToastKind = "success" | "error" | "info" | "undo";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(item: Omit<ToastItem, "id">) {
  const id = ++counter;
  items = [...items.slice(-3), { ...item, id }];
  emit();
  setTimeout(() => dismiss(id), item.duration);
  return id;
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push({ kind: "success", message, duration: 4000 }),
  error: (message: string) => push({ kind: "error", message, duration: 5000 }),
  info: (message: string) => push({ kind: "info", message, duration: 4000 }),
  /** إشعار مع زر تراجع (٦ ثوانٍ) */
  undo: (message: string, onUndo: () => void) => push({ kind: "undo", message, duration: 6000, action: { label: "تراجع", onClick: onUndo } }),
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            className="pointer-events-auto flex min-h-10 max-w-[520px] items-center gap-3 rounded-lg bg-inverse px-3.5 py-2 text-[14px] text-white shadow-popover"
            role="status"
          >
            {t.kind === "success" ? <CircleCheck className="size-4 shrink-0 text-inverse-success" /> : null}
            {t.kind === "error" ? <CircleAlert className="size-4 shrink-0 text-inverse-danger" /> : null}
            {t.kind === "info" ? <Info className="size-4 shrink-0 text-white/70" /> : null}
            <span className="leading-6">{t.message}</span>
            {t.action ? (
              <button
                className="ms-2 rounded-md px-2 py-0.5 text-[13px] font-medium text-inverse-accent hover:bg-white/10"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button className="grid size-5 place-items-center rounded text-white/50 hover:text-white" onClick={() => dismiss(t.id)} aria-label="إغلاق">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
