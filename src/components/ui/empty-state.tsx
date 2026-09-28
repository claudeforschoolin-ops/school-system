import { cn } from "@/lib/utils";

/**
 * حالة فارغة: رسم خطي بسيط رمادي + جملة توجيهية + زر إجراء رئيسي.
 */
export function EmptyState({
  title,
  description,
  action,
  illustration = "blank",
  className,
  compact,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  illustration?: "blank" | "search" | "inbox" | "table" | "calendar" | "lock";
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16", className)}>
      <Illustration kind={illustration} />
      <p className="mt-4 text-[15px] font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[14px] leading-6 text-fg-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function Illustration({ kind }: { kind: string }) {
  const stroke = "var(--border-strong)";
  const common = { fill: "none", stroke, strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden>
      {kind === "search" ? (
        <>
          <circle cx="42" cy="32" r="18" {...common} />
          <path d="M55 45 L70 60" {...common} />
          <path d="M34 32 h16" {...common} />
        </>
      ) : kind === "inbox" ? (
        <>
          <path d="M16 38 L26 14 H70 L80 38 V60 H16 Z" {...common} />
          <path d="M16 38 H34 L38 46 H58 L62 38 H80" {...common} />
        </>
      ) : kind === "calendar" ? (
        <>
          <rect x="18" y="14" width="60" height="48" rx="6" {...common} />
          <path d="M18 28 H78 M34 8 V18 M62 8 V18" {...common} />
          <path d="M30 40 h8 M44 40 h8 M58 40 h8 M30 50 h8 M44 50 h8" {...common} />
        </>
      ) : kind === "table" ? (
        <>
          <rect x="14" y="14" width="68" height="46" rx="5" {...common} />
          <path d="M14 26 H82 M14 38 H82 M14 50 H82 M38 14 V60" {...common} />
        </>
      ) : kind === "lock" ? (
        <>
          <rect x="30" y="32" width="36" height="28" rx="5" {...common} />
          <path d="M38 32 V24 a10 10 0 0 1 20 0 V32" {...common} />
          <circle cx="48" cy="45" r="3" {...common} />
        </>
      ) : (
        <>
          <path d="M28 10 H58 L70 22 V62 H28 Z" {...common} />
          <path d="M58 10 V22 H70" {...common} />
          <path d="M36 34 H62 M36 42 H62 M36 50 H52" {...common} />
        </>
      )}
    </svg>
  );
}
