"use client";
/**
 * لوحة التعليقات: على مستوى الصفحة/السجل أو خاصية محددة، مع الردود والحل والإشارات.
 */
import { AnimatePresence, motion } from "motion/react";
import { Check, CornerDownLeft, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatRelative } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { SkeletonLines } from "@/components/ui/skeleton";
import { useApp } from "@/components/shell/app-context";
import { CommentComposer } from "./comment-composer";
import { RichBody } from "./rich-body";

type CommentItem = RouterOutputs["comment"]["list"][number];

export function CommentsThreadList({
  targetType,
  targetId,
  canComment,
  propertyNames,
  compact,
}: {
  targetType: "PAGE" | "ROW";
  targetId: string;
  canComment: boolean;
  propertyNames?: Record<string, string>;
  compact?: boolean;
}) {
  const utils = trpc.useUtils();
  const list = trpc.comment.list.useQuery({ targetType, targetId });
  const invalidate = () => Promise.all([utils.comment.list.invalidate({ targetType, targetId }), utils.database.rows.invalidate()]);
  const create = trpc.comment.create.useMutation({ onSuccess: invalidate });
  const [showResolved, setShowResolved] = useState(false);

  const { open, resolved } = useMemo(() => {
    const roots = (list.data ?? []).filter((c) => !c.parentId);
    return { open: roots.filter((c) => !c.resolvedAt), resolved: roots.filter((c) => c.resolvedAt) };
  }, [list.data]);
  const repliesOf = (id: string) => (list.data ?? []).filter((c) => c.parentId === id);

  if (list.isLoading) return <SkeletonLines lines={4} className="p-4" />;

  return (
    <div className="space-y-3">
      {canComment ? <CommentComposer pending={create.isPending} onSubmit={(body) => create.mutateAsync({ targetType, targetId, body })} autoFocus={!compact && open.length === 0} /> : null}
      {open.length === 0 && resolved.length === 0 ? (
        compact ? null : <EmptyState compact illustration="inbox" title="لا توجد تعليقات بعد" description="ابدأ نقاشاً مع زملائك، واستخدم @ لإشعار شخص محدد." />
      ) : null}
      <AnimatePresence initial={false}>
        {open.map((c) => (
          <Thread key={c.id} root={c} replies={repliesOf(c.id)} canComment={canComment} targetType={targetType} targetId={targetId} propertyName={c.propertyId ? propertyNames?.[c.propertyId] : undefined} />
        ))}
      </AnimatePresence>
      {resolved.length ? (
        <div>
          <button className="text-[13px] text-fg-3 hover:text-fg" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? "إخفاء" : "عرض"} التعليقات المحلولة ({resolved.length})
          </button>
          {showResolved ? (
            <div className="mt-2 space-y-3 opacity-80">
              {resolved.map((c) => (
                <Thread key={c.id} root={c} replies={repliesOf(c.id)} canComment={canComment} targetType={targetType} targetId={targetId} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Thread({
  root,
  replies,
  canComment,
  targetType,
  targetId,
  propertyName,
}: {
  root: CommentItem;
  replies: CommentItem[];
  canComment: boolean;
  targetType: "PAGE" | "ROW";
  targetId: string;
  propertyName?: string;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => Promise.all([utils.comment.list.invalidate({ targetType, targetId }), utils.database.rows.invalidate()]);
  const create = trpc.comment.create.useMutation({ onSuccess: invalidate });
  const resolve = trpc.comment.resolve.useMutation({ onSuccess: invalidate });
  const [replying, setReplying] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden rounded-lg shadow-card"
    >
      <div className="group/thread p-3">
        {propertyName ? <p className="mb-2 text-[12px] text-fg-3">على خاصية «{propertyName}»</p> : null}
        <CommentRow comment={root} targetType={targetType} targetId={targetId} />
        {replies.map((r) => (
          <div key={r.id} className="mt-3">
            <CommentRow comment={r} targetType={targetType} targetId={targetId} />
          </div>
        ))}
        <div className="mt-2 flex items-center gap-1">
          {canComment && !root.resolvedAt ? (
            <button onClick={() => setReplying(!replying)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-3 hover:bg-hover hover:text-fg">
              <CornerDownLeft className="size-3" /> رد
            </button>
          ) : null}
          {canComment ? (
            <button
              onClick={() => resolve.mutate({ commentId: root.id, resolved: !root.resolvedAt })}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-3 hover:bg-hover hover:text-fg"
            >
              {root.resolvedAt ? <RotateCcw className="size-3" /> : <Check className="size-3" />}
              {root.resolvedAt ? "إعادة فتح" : "حل"}
            </button>
          ) : null}
          {root.resolvedAt && root.resolvedBy ? <span className="text-[12px] text-fg-3">حلّه {root.resolvedBy.name}</span> : null}
        </div>
        {replying ? (
          <div className="mt-2">
            <CommentComposer
              compact
              autoFocus
              placeholder="اكتب رداً…"
              pending={create.isPending}
              onSubmit={(body) => create.mutateAsync({ targetType, targetId, body, parentId: root.id }).then(() => setReplying(false))}
            />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function CommentRow({ comment, targetType, targetId }: { comment: CommentItem; targetType: "PAGE" | "ROW"; targetId: string }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const remove = trpc.comment.delete.useMutation({ onSuccess: () => utils.comment.list.invalidate({ targetType, targetId }) });
  return (
    <div className="group/comment flex gap-2.5">
      <Avatar name={comment.author.name} color={comment.author.avatarColor} size={24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg">{comment.author.name}</span>
          <span className="shrink-0 text-[12px] text-fg-3">{formatRelative(comment.createdAt, new Date(), prefs.digits)}</span>
          {comment.isMine ? (
            <Menu>
              <MenuTrigger asChild>
                <button className="ms-auto grid size-5 place-items-center rounded text-fg-3 opacity-0 hover:bg-hover group-hover/comment:opacity-100" aria-label="خيارات">
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => remove.mutate({ commentId: comment.id })}>
                  حذف التعليق
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
        </div>
        <RichBody body={comment.body} className={cn("mt-0.5 whitespace-pre-wrap text-[14px] leading-6", comment.resolvedAt ? "text-fg-2" : "text-fg")} />
      </div>
    </div>
  );
}

/** لوحة جانبية للتعليقات (تنزلق من الجهة المقابلة للشريط الجانبي) */
export function CommentsSidePanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ x: "-100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "-100%", opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          className="no-print fixed bottom-0 end-0 top-10 z-40 flex w-[380px] max-w-[92vw] flex-col border-s border-line bg-app shadow-[0_0_24px_rgba(15,23,42,.08)]"
          aria-label="التعليقات"
        >
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
            <h2 className="text-[14px] font-medium">التعليقات</h2>
            <button onClick={onClose} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="إغلاق">
              <X className="size-4" />
            </button>
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto p-4">{children}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
