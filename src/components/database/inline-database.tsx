"use client";
/** قاعدة بيانات مضمّنة داخل صفحة (كتلة في المحرر) */
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatabaseView } from "./database-view";

export function InlineDatabase({ databaseId }: { databaseId: string }) {
  if (!databaseId) return <p className="text-[13px] text-fg-3">قاعدة بيانات غير موجودة</p>;
  return (
    <div className="not-prose my-2" onKeyDown={(e) => e.stopPropagation()}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <DatabaseView databaseId={databaseId} mode="inline" />
      </Suspense>
    </div>
  );
}
