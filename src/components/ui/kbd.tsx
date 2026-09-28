import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-card px-1 font-sans text-[11px] font-medium text-fg-3",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** اختصار حسب النظام: ⌘ على ماك و Ctrl على غيره */
export function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}
