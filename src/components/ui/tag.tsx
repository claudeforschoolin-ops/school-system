import { cn } from "@/lib/utils";
import type { OptionColor } from "@/lib/database/types";

/**
 * الشارة: خلفية باهتة + نص داكن + نقطة ٦px + حواف دائرية كاملة + ارتفاع ٢٠px.
 */
export function Tag({
  color = "gray",
  children,
  dot = true,
  className,
  size = "md",
}: {
  color?: OptionColor | string;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none",
        size === "md" ? "h-5 px-2 text-[12px]" : "h-[18px] px-1.5 text-[11px]",
        className,
      )}
      style={{ background: `var(--tag-${color}-bg)`, color: `var(--tag-${color}-fg)` }}
    >
      {dot ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--tag-${color}-dot)` }} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** عدّاد خافت بجانب الشارة */
export function Counter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("tabular text-[12px] font-medium text-fg-3", className)}>{children}</span>;
}
