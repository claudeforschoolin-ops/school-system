"use client";
import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: React.ReactNode; icon?: React.ReactNode }>;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("inline-flex h-8 items-center gap-0.5 rounded-lg bg-hover p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors", value === o.value ? "text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {value === o.value ? (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-md bg-card shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.04)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
          ) : null}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}
