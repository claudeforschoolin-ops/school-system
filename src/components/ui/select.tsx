"use client";
import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "اختر…",
  className,
  disabled,
  size = "md",
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <S.Root value={value} onValueChange={onChange} disabled={disabled}>
      <S.Trigger
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-md bg-card px-2.5 text-start text-[14px] text-fg shadow-[0_0_0_1px_var(--border)] outline-none transition-shadow hover:shadow-[0_0_0_1px_var(--border-strong)] focus:shadow-[0_0_0_1px_var(--navy-600)] disabled:opacity-60 data-[placeholder]:text-fg-3",
          size === "sm" ? "h-7 text-[13px]" : "h-8",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="size-3.5 text-fg-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="anim-menu z-[60] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] bg-elevated p-1 shadow-popover">
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-[14px] outline-none data-[highlighted]:bg-hover"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="ms-auto">
                  <Check className="size-4 text-fg-2" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
