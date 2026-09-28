"use client";
import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { Kbd } from "./kbd";

export function Tooltip({ content, children, side = "bottom", shortcut }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="anim-menu z-[60] flex items-center gap-2 rounded-md bg-[#1f1f1f] px-2 py-1 text-[12px] font-medium leading-5 text-white shadow-popover dark:bg-[#3a3a3a]"
        >
          {content}
          {shortcut ? <Kbd className="border-white/20 bg-white/10 text-white/80">{shortcut}</Kbd> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
