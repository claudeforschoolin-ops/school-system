"use client";
/** مفتاح تبديل: انزلاق الدائرة + تغير لون الخلفية (١٦٠ms) */
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  const w = size === "sm" ? 26 : 32;
  const h = size === "sm" ? 16 : 18;
  const knob = h - 4;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-[160ms] ease-out disabled:opacity-50",
        checked ? "bg-teal-700" : "bg-line-strong",
      )}
      style={{ width: w, height: h }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-[160ms] ease-out"
        style={{ width: knob, height: knob, insetInlineStart: checked ? w - knob - 2 : 2 }}
      />
    </button>
  );
}
