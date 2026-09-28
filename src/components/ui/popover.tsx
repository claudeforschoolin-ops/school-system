"use client";
import { Popover as P } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof P.Content>>(function PopoverContent(
  { className, sideOffset = 6, align = "start", ...props },
  ref,
) {
  return (
    <P.Portal>
      <P.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn("anim-menu z-50 rounded-[10px] bg-elevated text-[14px] text-fg shadow-popover outline-none", className)}
        {...props}
      />
    </P.Portal>
  );
});
