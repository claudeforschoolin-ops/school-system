"use client";
/**
 * المحادثات الداخلية: قائمة المحادثات + الرسائل + محادثة جديدة (فردية أو جماعية).
 */
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, MessageCirclePlus, Search, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatRelative, formatTime } from "@/lib/dates";
import { plainTextFromBody } from "@/lib/mentions";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn, matchesSearch } from "@/lib/utils";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { CommentComposer } from "@/components/collab/comment-composer";
import { RichBody } from "@/components/collab/rich-body";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export function ChatView() {
  useTabMeta("المحادثات", "lucide:message-circle");
  const { user } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const utils = trpc.useUtils();
  const conversations = trpc.chat.conversations.useQuery(undefined, { refetchInterval: 10_000 });
  const [selectedId, setActiveId] = useState<string | null>(params.get("c"));
  // بلا اختيار صريح: أحدث محادثة
  const activeId = selectedId ?? conversations.data?.[0]?.id ?? null;
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const start = trpc.chat.start.useMutation({
    onSuccess: async (c) => {
      await utils.chat.conversations.invalidate();
      setActiveId(c.id);
      setNewOpen(false);
    },
  });

  const withUser = params.get("with");
  const startMutate = start.mutate;
  useEffect(() => {
    if (withUser && withUser !== user.id) startMutate({ userIds: [withUser] });
  }, [withUser, user.id, startMutate]);
  // فتح نافذة «محادثة جديدة» كلما وصل الرابط ?new=1 (تعديل الحالة أثناء العرض بدل التأثير)
  const newParam = params.get("new") === "1";
  const [seenNewParam, setSeenNewParam] = useState(newParam);
  if (newParam !== seenNewParam) {
    setSeenNewParam(newParam);
    if (newParam) setNewOpen(true);
  }

  const active = conversations.data?.find((c) => c.id === activeId);

  return (
    <>
      <PageTopbar crumbs={[{ title: "المحادثات", icon: "lucide:message-circle" }]} />
      <div className="flex h-[calc(100dvh-84px)] border-t border-line">
        <aside className="flex w-[300px] shrink-0 flex-col border-e border-line max-md:w-full max-md:[&:has(+section[data-active=true])]:hidden">
          <div className="flex items-center justify-between p-3">
            <h1 className="text-[18px] font-bold">المحادثات</h1>
            <Button size="sm" icon={<MessageCirclePlus className="size-4" />} onClick={() => setNewOpen(true)}>
              جديدة
            </Button>
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-3">
            {conversations.isLoading ? <SkeletonLines lines={5} className="p-2" /> : null}
            {conversations.data?.length === 0 ? <EmptyState compact illustration="inbox" title="لا توجد محادثات" description="ابدأ محادثة مع زميل." /> : null}
            {conversations.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  router.replace(`${pathname}?c=${c.id}`, { scroll: false });
                }}
                className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-start transition-colors hover:bg-hover", c.id === activeId && "bg-active")}
              >
                {c.kind === "GROUP" ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hover text-fg-2">
                    <Users className="size-4" />
                  </span>
                ) : (
                  <Avatar name={c.title} color={c.members.find((m) => m && m.id !== user.id)?.avatarColor} size={36} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-[14px]", c.unread ? "font-bold" : "font-medium")}>{c.title}</span>
                    <span className="shrink-0 text-[11px] text-fg-3">{formatRelative(c.lastMessageAt, new Date())}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-fg-3">{c.lastMessage ? plainTextFromBody(c.lastMessage.body) : "لا توجد رسائل"}</span>
                    {c.unread ? <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-navy-700 px-1 text-[10px] font-bold text-white dark:text-on-primary">{c.unread}</span> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        {/* على الجوال: القائمة أولاً، والمحادثة تظهر فقط عند اختيارها صراحة (مع زر رجوع) */}
        <section data-active={Boolean(active && selectedId)} className="flex min-w-0 flex-1 flex-col max-md:data-[active=false]:hidden">
          {active ? <Conversation key={active.id} conversation={active} onBack={() => setActiveId(null)} /> : <EmptyState illustration="inbox" title="اختر محادثة" description="أو ابدأ محادثة جديدة مع زملائك." />}
        </section>
      </div>
      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} pending={start.isPending} onStart={(userIds, title) => start.mutate({ userIds, title })} />
    </>
  );
}

type ConversationItem = RouterOutputs["chat"]["conversations"][number];

function Conversation({ conversation, onBack }: { conversation: ConversationItem; onBack: () => void }) {
  const { user, prefs } = useApp();
  const utils = trpc.useUtils();
  const messages = trpc.chat.messages.useQuery({ conversationId: conversation.id }, { refetchInterval: 5000 });
  const send = trpc.chat.send.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.chat.messages.invalidate({ conversationId: conversation.id }), utils.chat.conversations.invalidate()]);
    },
  });
  const markRead = trpc.chat.markRead.useMutation({ onSuccess: () => Promise.all([utils.chat.conversations.invalidate(), utils.workspace.badges.invalidate()]) });
  const bottom = useRef<HTMLDivElement>(null);
  const count = messages.data?.length ?? 0;
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (conversation.unread) markReadMutate({ conversationId: conversation.id });
  }, [count, conversation.id, conversation.unread, markReadMutate]);
  const members = conversation.members.filter((m): m is NonNullable<typeof m> => Boolean(m));
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <button onClick={onBack} className="grid size-8 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-hover md:hidden" aria-label="رجوع إلى المحادثات">
          <ChevronRight className="size-5" />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{conversation.title}</span>
          <span className="block truncate text-[12px] text-fg-3">{members.map((m) => m.name).join("، ")}</span>
        </span>
        <AvatarStack people={members} size={24} max={4} />
      </header>
      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-4">
        {messages.isLoading ? <SkeletonLines lines={4} /> : null}
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {messages.data?.map((m) => {
              const mine = m.authorId === user.id;
              const author = members.find((x) => x.id === m.authorId);
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                  {!mine ? <Avatar name={author?.name ?? "؟"} color={author?.avatarColor} size={26} /> : null}
                  <div className={cn("max-w-[70%] rounded-2xl px-3.5 py-2", mine ? "rounded-ee-md bg-navy-700 text-white dark:text-on-primary" : "rounded-es-md bg-hover text-fg")}>
                    {!mine && conversation.kind === "GROUP" ? <p className="mb-0.5 text-[12px] font-medium opacity-70">{author?.name}</p> : null}
                    <RichBody body={m.body} className="whitespace-pre-wrap text-[14px] leading-6" />
                    <p className={cn("mt-0.5 text-[11px]", mine ? "text-white/70 dark:text-black/60" : "text-fg-3")}>{formatTime(m.createdAt, prefs.digits)}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div ref={bottom} />
      </div>
      <div className="border-t border-line p-3">
        <CommentComposer placeholder="اكتب رسالة… (Enter للإرسال، Shift+Enter لسطر جديد)" pending={send.isPending} onSubmit={(body) => send.mutateAsync({ conversationId: conversation.id, body })} autoFocus />
      </div>
    </>
  );
}

function NewConversationDialog({ open, onOpenChange, onStart, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (ids: string[], title?: string) => void; pending: boolean }) {
  const { user } = useApp();
  const directory = trpc.workspace.directory.useQuery(undefined, { enabled: open });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const people = useMemo(() => (directory.data ?? []).filter((u) => u.id !== user.id && u.status === "ACTIVE" && matchesSearch(`${u.name} ${u.jobTitle ?? ""}`, query)), [directory.data, query, user.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="محادثة جديدة" description="اختر زميلاً لمحادثة فردية، أو عدة زملاء لمحادثة جماعية." width={460}>
        <div className="px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الوظيفة" className="h-8 w-full rounded-md bg-hover ps-8 pe-2 text-[14px] outline-none" autoFocus />
          </div>
          {selected.length > 1 ? <Input className="mt-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم المجموعة (اختياري)" /> : null}
          <div className="thin-scroll mt-2 max-h-[300px] overflow-y-auto">
            {people.map((u) => (
              <label key={u.id} className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                <Checkbox checked={selected.includes(u.id)} onChange={(v) => setSelected((s) => (v ? [...s, u.id] : s.filter((x) => x !== u.id)))} />
                <Avatar name={u.name} color={u.avatarColor} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{u.name}</span>
                  <span className="block truncate text-[12px] text-fg-3">{u.jobTitle}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter className="mt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!selected.length} loading={pending} onClick={() => onStart(selected, selected.length > 1 ? title || undefined : undefined)}>
            بدء المحادثة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
