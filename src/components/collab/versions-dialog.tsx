"use client";
/** سجل النسخ: معاينة أي نسخة سابقة واسترجاعها */
import { useState } from "react";
import { formatDate, formatRelative } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { BlockEditor } from "@/components/editor/block-editor";
import { useApp } from "@/components/shell/app-context";

export function VersionsDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  canRestore,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targetType: "PAGE" | "ROW";
  targetId: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const { prefs } = useApp();
  const versions = trpc.page.versions.useQuery({ targetType, targetId }, { enabled: open });
  const [selected, setSelected] = useState<string | null>(null);
  const restore = trpc.page.restoreVersion.useMutation({
    onSuccess: () => {
      toast.success("تمت استعادة النسخة");
      onOpenChange(false);
      onRestored();
    },
  });
  const current = versions.data?.find((v) => v.id === selected) ?? versions.data?.[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="سجل النسخ" description="تُحفظ نسخة تلقائياً عند التعديل (تُدمج تعديلاتك المتتالية خلال ١٠ دقائق)." width={920}>
        <div className="grid h-[60vh] grid-cols-[260px_1fr] border-t border-line">
          <div className="thin-scroll overflow-y-auto border-e border-line p-2">
            {versions.isLoading ? <SkeletonLines lines={6} className="p-2" /> : null}
            {versions.data?.length === 0 ? <EmptyState compact title="لا توجد نسخ محفوظة بعد" /> : null}
            {versions.data?.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.id)}
                className={cn("flex w-full items-start gap-2 rounded-md p-2 text-start transition-colors hover:bg-hover", current?.id === v.id && "bg-active")}
              >
                <Avatar name={v.author?.name ?? "؟"} color={v.author?.avatarColor} size={22} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{i === 0 ? "النسخة الحالية" : formatRelative(v.createdAt, new Date(), prefs.digits)}</span>
                  <span className="block truncate text-[12px] text-fg-3">
                    {v.author?.name} · {formatDate(v.createdAt, { digits: prefs.digits, withTime: true })}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="thin-scroll flex-1 overflow-y-auto px-8 py-6">
              {current ? (
                <>
                  <h2 className="mb-4 text-[26px] font-bold">{current.title || "بدون عنوان"}</h2>
                  <BlockEditor key={current.id} content={current.content} editable={false} />
                </>
              ) : null}
            </div>
            {canRestore && current && current.id !== versions.data?.[0]?.id ? (
              <div className="flex justify-end border-t border-line p-3">
                <Button variant="primary" loading={restore.isPending} onClick={() => restore.mutate({ versionId: current.id })}>
                  استعادة هذه النسخة
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
