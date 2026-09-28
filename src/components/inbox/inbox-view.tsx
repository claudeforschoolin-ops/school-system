"use client";
/**
 * صندوق الوارد: تبويبات «الكل / غير المقروء / الإشارات / الموافقات / المؤرشف»،
 * تعليم كمقروء بالمسح (سحب أفقي) أو بزر، وأرشفة، ولوحة الموافقات متعددة المراحل.
 */
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Archive, ArchiveRestore, AtSign, Bell, CheckCheck, CircleCheck, ClipboardCheck, MessageSquare, UserPlus, Zap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { formatRelative } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonLines } from "@/components/ui/skeleton";
import { usePrefs } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { ApprovalsPanel } from "./approvals-panel";

type Tab = "all" | "unread" | "mentions" | "approvals" | "archived";
type Item = RouterOutputs["notification"]["list"]["items"][number];

const TYPE_ICON: Record<string, React.ReactNode> = {
  MENTION: <AtSign className="size-3" />,
  COMMENT: <MessageSquare className="size-3" />,
  ASSIGNMENT: <UserPlus className="size-3" />,
  APPROVAL: <ClipboardCheck className="size-3" />,
  AUTOMATION: <Zap className="size-3" />,
  SYSTEM: <Bell className="size-3" />,
  MESSAGE: <MessageSquare className="size-3" />,
};

export function InboxView() {
  useTabMeta("صندوق الوارد", "lucide:inbox");
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (search.get("tab") as Tab) ?? "all";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const utils = trpc.useUtils();
  const counts = trpc.notification.counts.useQuery();
  const list = trpc.notification.list.useQuery({ tab: tab === "approvals" ? "approvals" : tab });
  const refresh = () => Promise.all([utils.notification.invalidate(), utils.workspace.badges.invalidate(), utils.workspace.home.invalidate()]);
  const markAll = trpc.notification.markAllRead.useMutation({ onSuccess: refresh });

  return (
    <>
      <PageTopbar crumbs={[{ title: "صندوق الوارد", icon: "lucide:inbox" }]} />
      <div className="mx-auto w-full max-w-[780px] px-4 pb-24 pt-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold">صندوق الوارد</h1>
          <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            تعليم الكل كمقروء
          </Button>
        </div>
        <Segmented
          className="mt-5 max-w-full overflow-x-auto"
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "الكل" },
            { value: "unread", label: <Label text="غير المقروء" count={counts.data?.unread} /> },
            { value: "mentions", label: <Label text="الإشارات" count={counts.data?.mentions} /> },
            { value: "approvals", label: <Label text="الموافقات" count={counts.data?.approvals} /> },
            { value: "archived", label: "المؤرشف" },
          ]}
        />
        {tab === "approvals" ? <ApprovalsPanel /> : null}
        <div className="mt-5">
          {list.isLoading ? (
            <SkeletonLines lines={6} />
          ) : !list.data?.items.length ? (
            tab === "approvals" ? null : (
              <EmptyState illustration="inbox" title={tab === "unread" ? "لا توجد إشعارات غير مقروءة" : "صندوق الوارد فارغ"} description="ستظهر هنا الإشارات والتعليقات والإسنادات وطلبات الموافقة." />
            )
          ) : (
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {list.data.items.map((n) => (
                  <NotificationRow key={n.id} item={n} archived={tab === "archived"} onChanged={refresh} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Label({ text, count }: { text: string; count?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      {count ? (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-danger-700 px-1 text-[10px] font-bold text-white">
          <NumberTicker value={count} className="h-3 leading-3" />
        </span>
      ) : null}
    </span>
  );
}

function NotificationRow({ item, archived, onChanged }: { item: Item; archived: boolean; onChanged: () => void }) {
  const prefs = usePrefs();
  const router = useRouter();
  const markRead = trpc.notification.markRead.useMutation({ onSuccess: onChanged });
  const archive = trpc.notification.archive.useMutation({ onSuccess: onChanged });
  const dragged = useRef(false);
  const unread = !item.readAt;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // المسح أفقياً لأكثر من ٩٠px يعلّم الإشعار كمقروء
    if (Math.abs(info.offset.x) > 90 && unread) markRead.mutate({ ids: [item.id], read: true });
    setTimeout(() => (dragged.current = false), 50);
  };

  return (
    <motion.li layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 flex items-center justify-between bg-teal-50 px-5 text-teal-700" aria-hidden>
        <CircleCheck className="size-5" />
        <CircleCheck className="size-5" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (dragged.current) return;
          if (unread) markRead.mutate({ ids: [item.id], read: true });
          if (item.link) router.push(item.link);
        }}
        className={cn("group relative flex cursor-pointer items-start gap-3 bg-app px-3 py-3 transition-colors hover:bg-hover", unread && "bg-navy-50/40")}
      >
        <span className="relative">
          <Avatar name={item.actor?.name ?? "النظام"} color={item.actor?.avatarColor ?? "slate"} size={32} />
          <span className="absolute -bottom-0.5 -end-0.5 grid size-4 place-items-center rounded-full bg-card text-fg-2 shadow-[0_0_0_1px_var(--border)]">{TYPE_ICON[item.type]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[14px] leading-6", unread ? "font-medium text-fg" : "text-fg-2")}>{item.title}</p>
          {item.body ? <p className="line-clamp-2 text-[13px] leading-5 text-fg-3">{item.body}</p> : null}
          <p className="mt-0.5 text-[12px] text-fg-3">{formatRelative(item.createdAt, new Date(), prefs.digits)}</p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => markRead.mutate({ ids: [item.id], read: unread })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-active hover:text-fg" title={unread ? "تعليم كمقروء" : "تعليم كغير مقروء"}>
            <CheckCheck className="size-4" />
          </button>
          <button onClick={() => archive.mutate({ ids: [item.id], archived: !archived })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-active hover:text-fg" title={archived ? "إلغاء الأرشفة" : "أرشفة"}>
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </button>
        </div>
        {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-danger-700" aria-label="غير مقروء" /> : null}
      </motion.div>
    </motion.li>
  );
}
