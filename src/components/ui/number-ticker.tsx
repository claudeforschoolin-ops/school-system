"use client";
/**
 * عدّاد بانزلاق رقمي: الرقم القديم يخرج للأعلى والجديد يدخل من الأسفل (٢٠٠ms).
 */
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { formatNumber, type DigitsPreference } from "@/lib/numbers";
import { cn } from "@/lib/utils";

export function NumberTicker({ value, digits = "arab", className }: { value: number; digits?: DigitsPreference; className?: string }) {
  const prev = useRef(value);
  const direction = value >= prev.current ? 1 : -1;
  prev.current = value;
  return (
    <span className={cn("relative inline-flex h-[1.2em] overflow-hidden tabular", className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          initial={{ y: direction > 0 ? "100%" : "-100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: direction > 0 ? "-100%" : "100%", opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="inline-block leading-[1.2em]"
        >
          {formatNumber(value, digits)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
