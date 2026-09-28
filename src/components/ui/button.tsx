"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger" | "teal";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-700 text-white hover:bg-navy-600 dark:text-[#0f172a] shadow-[inset_0_-1px_0_rgba(0,0,0,.12)]",
  secondary: "bg-card text-fg shadow-[0_0_0_1px_var(--border)] hover:bg-hover",
  ghost: "bg-transparent text-fg-2 hover:bg-hover hover:text-fg",
  subtle: "bg-hover text-fg hover:bg-active",
  danger: "bg-danger-700 text-white hover:opacity-90",
  teal: "bg-teal-700 text-white hover:bg-teal-500",
};

const SIZES: Record<Size, string> = {
  xs: "h-6 px-2 text-[12px] gap-1 rounded-md",
  sm: "h-7 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-[14px] gap-2 rounded-md",
  lg: "h-10 px-4 text-[15px] gap-2 rounded-md",
  icon: "h-8 w-8 justify-center rounded-md",
  "icon-sm": "h-6 w-6 justify-center rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center whitespace-nowrap font-medium transition-[background-color,color,box-shadow,opacity] duration-[120ms] ease-out disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
});
