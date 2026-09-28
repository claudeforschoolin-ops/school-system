"use client";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-8 w-full rounded-md bg-card px-2.5 text-[14px] text-fg shadow-[0_0_0_1px_var(--border)] outline-none transition-shadow duration-[120ms] placeholder:text-fg-3 hover:shadow-[0_0_0_1px_var(--border-strong)] focus:shadow-[0_0_0_1px_var(--navy-600),0_0_0_3px_color-mix(in_srgb,var(--navy-600)_18%,transparent)] disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputClass, "h-auto min-h-[80px] py-2 leading-6", className)} {...props} />;
});

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-danger-700">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-fg-3">{hint}</span> : null}
    </label>
  );
}
