"use client";
/** سلة المهملات: استعادة الصفحات المحذوفة أو حذفها نهائياً (للصفحات غير المالية فقط) */
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatRelative } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export function TrashView() {
  useTabMeta("المهملات", "lucide:archive");
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const list = trpc.page.trashList.useQuery();
  const refresh = () => Promise.all([utils.page.trashList.invalidate(), utils.workspace.sidebar.invalidate()]);
  const restore = trpc.page.restore.useMutation({ onSuccess: () => refresh().then(() => toast.success("تمت الاستعادة")) });
  const purge = trpc.page.purge.useMutation({ onSuccess: () => refresh().then(() => toast.success("حُذفت نهائياً")) });
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <>
      <PageTopbar crumbs={[{ title: "المهملات", icon: "lucide:archive" }]} />
      <div className="mx-auto w-full max-w-[820px] px-6 pb-24 pt-10 md:px-12">
        <h1 className="text-[32px] font-bold">المهملات</h1>
        <p className="mt-1 text-[14px] text-fg-3">الصفحات المحذوفة من المساحات التي تملك صلاحية تعديلها ومن صفحاتك الخاصة. السجلات المالية لا تُحذف نهائياً أبداً.</p>
        <div className="mt-6">
          {list.isLoading ? <SkeletonLines lines={5} /> : null}
          {list.data?.length === 0 ? <EmptyState illustration="blank" title="المهملات فارغة" /> : null}
          <ul className="space-y-1">
            {list.data?.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-hover">
                <PageIcon icon={p.icon} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{p.title || "بدون عنوان"}</span>
                  <span className="text-[12px] text-fg-3">حُذفت {p.deletedAt ? formatRelative(p.deletedAt, new Date(), prefs.digits) : ""}</span>
                </span>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => restore.mutate({ pageId: p.id })}>
                  استعادة
                </Button>
                <Button size="sm" variant="ghost" className="text-danger-700" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm(p.id)}>
                  حذف نهائي
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="حذف الصفحة نهائياً؟"
        description="ستُحذف الصفحة وصفحاتها الفرعية ومحتواها وتعليقاتها. يبقى أثر العملية في سجل التدقيق."
        confirmLabel="حذف نهائي"
        danger
        loading={purge.isPending}
        onConfirm={() => confirm && purge.mutate({ pageId: confirm }, { onSettled: () => setConfirm(null) })}
      />
    </>
  );
}
