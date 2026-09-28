"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatTimeRange } from "@/lib/dates";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrefs } from "../app-context";

export const EVENT_COLORS: Record<string, string> = {
  ACADEMIC: "navy",
  ADMINISTRATIVE: "slate",
  EXAM: "red",
  MEETING: "teal",
  HOLIDAY: "green",
  ACTIVITY: "gold",
};

function dayLabel(date: Date): string {
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((d1 - d0) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "غداً";
  if (diff < 7 && diff > 1) return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "short" }).format(date);
}

export function UpcomingEvents() {
  const { data, isLoading } = trpc.workspace.upcoming.useQuery(undefined, { staleTime: 60_000 });
  const prefs = usePrefs();
  if (isLoading) {
    return (
      <div className="space-y-2 px-2 py-1">
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }
  if (!data?.length) return <p className="px-2 py-1 text-[13px] text-fg-3">لا توجد أحداث قادمة</p>;
  return (
    <ul>
      {data.map((e) => {
        const start = new Date(e.startAt);
        const end = new Date(e.endAt);
        const sameDay = start.toDateString() === end.toDateString();
        return (
          <li key={e.id}>
            <Link
              href={`/calendar?date=${start.toISOString().slice(0, 10)}`}
              className="flex h-7 items-center gap-2 rounded-md px-2 text-[14px] text-fg-2 transition-colors duration-[120ms] hover:bg-hover"
            >
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--tag-${EVENT_COLORS[e.category] ?? "slate"}-dot)` }} />
              <span className="flex-1 truncate font-medium text-fg">{e.title}</span>
              <span className="shrink-0 text-[12px] text-fg-3 tabular">
                {e.allDay || !sameDay ? dayLabel(start) : `${dayLabel(start) === "اليوم" ? "" : dayLabel(start) + " "}${formatTimeRange(start, end, prefs.digits)}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
