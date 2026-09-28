"use client";
/**
 * المعاينة الجانبية: تنزلق من الجهة اليسرى (عكس الشريط الجانبي) بعرض ٤٨٠px (٢٤٠ms)،
 * مع التنقل بين السجلات وزر «فتح كصفحة كاملة».
 */
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, ChevronsLeft, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { RowView } from "./row-view";

export function SidePeek({ rowId, onClose, onNavigate, order }: { rowId: string | null; onClose: () => void; onNavigate: (id: string) => void; order: string[] }) {
  const router = useRouter();
  const index = rowId ? order.indexOf(rowId) : -1;
  useEffect(() => {
    if (!rowId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" && order[index + 1]) onNavigate(order[index + 1]!);
      if (e.key === "ArrowUp" && index > 0) onNavigate(order[index - 1]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowId, index, order, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {rowId ? (
        <motion.aside
          key="peek"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          className="no-print fixed bottom-0 end-0 top-10 z-40 flex w-[480px] max-w-[100vw] flex-col border-s border-line bg-app shadow-[0_0_32px_rgba(15,23,42,.10)]"
          aria-label="معاينة السجل"
        >
          <div className="flex h-11 shrink-0 items-center gap-1 px-3">
            <Tooltip content="إغلاق">
              <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="إغلاق المعاينة">
                <ChevronsLeft className="size-4 rotate-180" />
              </button>
            </Tooltip>
            <Tooltip content="فتح كصفحة كاملة">
              <button onClick={() => router.push(`/r/${rowId}`)} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="فتح كصفحة كاملة">
                <Maximize2 className="size-4" />
              </button>
            </Tooltip>
            <span className="mx-1 h-4 w-px bg-line" />
            <button disabled={index <= 0} onClick={() => onNavigate(order[index - 1]!)} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover disabled:opacity-30" aria-label="السجل السابق">
              <ChevronUp className="size-4" />
            </button>
            <button disabled={index < 0 || index >= order.length - 1} onClick={() => onNavigate(order[index + 1]!)} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover disabled:opacity-30" aria-label="السجل التالي">
              <ChevronDown className="size-4" />
            </button>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            <RowView key={rowId} rowId={rowId} compact />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
