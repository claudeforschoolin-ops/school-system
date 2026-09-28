"use client";
/** «مهامي»: كل ما أُسند إليّ في قواعد البيانات، مجمّعاً حسب مجموعة الحالة */
import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Counter, Tag } from "@/components/ui/tag";
import { usePrefs } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

const GROUPS = [
  { key: "todo", label: "للتنفيذ" },
  { key: "in_progress", label: "قيد العمل" },
  { key: "none", label: "بلا حالة" },
  { key: "complete", label: "مكتمل" },
] as const;

export function MyTasksView() {
  useTabMeta("مهامي", "lucide:list-todo");
  const prefs = usePrefs();
  const tasks = trpc.workspace.myTasks.useQuery();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const today = new Date().toISOString().slice(0, 10);
  const list = (tasks.data ?? []).filter((t) => filter === "all" || t.status?.group !== "complete");
  return (
    <>
      <PageTopbar crumbs={[{ title: "خاص", icon: "lucide:lock" }, { title: "مهامي", icon: "lucide:list-todo" }]} />
      <div className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-10 md:px-12">
        <h1 className="text-[36px] font-bold">مهامي</h1>
        <p className="mt-1 text-[15px] text-fg-3">كل السجلات المسندة إليك عبر خصائص «شخص» في قواعد البيانات التي تصل إليها.</p>
        <Segmented
          className="mt-6"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "المفتوحة" },
            { value: "all", label: "الكل" },
          ]}
        />
        {tasks.isLoading ? <SkeletonLines lines={8} className="mt-6" /> : null}
        {tasks.data && list.length === 0 ? <EmptyState illustration="table" title="لا توجد مهام مسندة إليك" description="أحسنت! لا شيء بانتظارك الآن." /> : null}
        {GROUPS.map((g) => {
          const items = list.filter((t) => (t.status?.group ?? "none") === g.key);
          if (!items.length) return null;
          return (
            <section key={g.key} className="mt-8">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg-3">
                {g.label} <Counter>{new Intl.NumberFormat("ar-SA").format(items.length)}</Counter>
              </h2>
              <ul className="divide-y divide-line rounded-lg shadow-card">
                {items.map((t) => {
                  const overdue = t.due && t.due.slice(0, 10) < today && t.status?.group !== "complete";
                  return (
                    <li key={t.id}>
                      <Link href={`/r/${t.id}`} className="flex min-h-11 flex-wrap items-center gap-3 px-3 py-2 transition-colors hover:bg-hover">
                        <PageIcon icon={t.icon ?? t.database.icon} size={16} />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{t.title || "بدون عنوان"}</span>
                        <span className="flex items-center gap-1 text-[12px] text-fg-3">
                          <PageIcon icon={t.database.icon} size={12} /> {t.database.title}
                        </span>
                        {t.status ? <Tag color={t.status.color}>{t.status.name}</Tag> : null}
                        {t.due ? <span className={cn("w-24 text-end text-[12px] tabular", overdue ? "font-medium text-danger-700" : "text-fg-3")}>{formatDate(t.due, { digits: prefs.digits })}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
