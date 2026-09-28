"use client";
/** عدّ رقمي تصاعدي لبطاقات المؤشرات عند أول ظهور */
import { animate, useInView, useMotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatNumber, type DigitsPreference } from "@/lib/numbers";

export function CountUp({ value, digits = "arab", format }: { value: number; digits?: DigitsPreference; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useMotionValueEvent(mv, "change", (v) => setDisplay(Math.round(v)));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [inView, value, mv]);
  return (
    <span ref={ref} className="tabular">
      {format ? format(display) : formatNumber(display, digits)}
    </span>
  );
}
