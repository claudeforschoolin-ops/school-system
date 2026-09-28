"use client";
/**
 * مربع اختيار برسم علامة الصح عبر stroke-dashoffset (١٤٠ms).
 */
import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  onChange,
  disabled,
  className,
  label,
  size = 16,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-[4px] border transition-[background-color,border-color] duration-[140ms] ease-out disabled:cursor-default",
        checked ? "border-navy-700 bg-navy-700" : "border-line-strong bg-transparent hover:bg-hover",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 16 16" className="size-[80%]" aria-hidden>
        <path
          d="M3.5 8.5 L6.5 11.2 L12.5 4.8"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 14,
            strokeDashoffset: checked ? 0 : 14,
            transition: "stroke-dashoffset 140ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </svg>
    </button>
  );
}
