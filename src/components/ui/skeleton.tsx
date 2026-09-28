import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

export function SkeletonLines({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy aria-label="جارٍ التحميل">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[850px] px-6 pt-24" aria-busy aria-label="جارٍ التحميل">
      <Skeleton className="size-[72px] rounded-full" />
      <Skeleton className="mt-6 h-9 w-2/3" />
      <SkeletonLines lines={6} className="mt-8" />
    </div>
  );
}
