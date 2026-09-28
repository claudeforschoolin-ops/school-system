"use client";
/**
 * عدّاد بانزلاق رقمي: الرقم القديم يخرج للأعلى والجديد يدخل من الأسفل (٢٠٠ms).
 */
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatNumber, type DigitsPreference } from "@/lib/numbers";
import { cn } from "@/lib/utils";

export function NumberTicker({ value, digits = "arab", className }: { value: number; digits?: DigitsPreference; className?: string }) {
  // اتجاه الحركة مشتق من القيمة السابقة (نمط «تعديل الحالة أثناء العرض» الموصى به في React)
  const [last, setLast] = useState({ value, direction: 1 });
  if (last.value !== value) setLast({ value, direction: value >= last.value ? 1 : -1 });
  const direction = last.value !== value ? (value >= last.value ? 1 : -1) : last.direction;
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
