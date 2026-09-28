"use client";
/**
 * المشاركة: من يملك الوصول (المساحة/المالك/أشخاص محددون) + إضافة أشخاص + نسخ الرابط.
 */
import { Globe2, Link2, Lock, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { LEVEL_LABELS } from "@/lib/access-levels";
import { trpc } from "@/lib/trpc/client";
import { matchesSearch } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageIcon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

const LEVEL_OPTIONS = (Object.keys(LEVEL_LABELS) as Array<keyof typeof LEVEL_LABELS>).map((k) => ({ value: k, label: LEVEL_LABELS[k] }));

export function SharePopover({ pageId, href }: { pageId: string; href: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<keyof typeof LEVEL_LABELS>("VIEW");
  const utils = trpc.useUtils();
  const shares = trpc.page.shares.useQuery({ pageId }, { enabled: open });
  const directory = trpc.workspace.directory.useQuery(undefined, { enabled: open, staleTime: 5 * 60_000 });
  const setShare = trpc.page.setShare.useMutation({ onSuccess: () => utils.page.shares.invalidate({ pageId }) });
  const removeShare = trpc.page.removeShare.useMutation({ onSuccess: () => utils.page.shares.invalidate({ pageId }) });
  const data = shares.data;
  const sharedIds = new Set(data?.shares.map((s) => s.userId));
  const candidates = query
    ? (directory.data ?? []).filter((u) => u.status === "ACTIVE" && !sharedIds.has(u.id) && u.id !== data?.owner?.id && matchesSearch(`${u.name} ${u.email}`, query)).slice(0, 5)
    : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-7 rounded-md px-2.5 text-[14px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg">مشاركة</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        {!data ? (
          <SkeletonLines lines={4} className="p-4" />
        ) : (
          <>
            {data.canManage ? (
              <div className="border-b border-line p-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute start-2 top-2 size-4 text-fg-3" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="أضف أشخاصاً بالاسم أو البريد" className="h-8 w-full rounded-md bg-hover ps-8 pe-2 text-[13px] outline-none" />
                  </div>
                  <Select size="sm" className="w-[130px]" value={level} onChange={(v) => setLevel(v as typeof level)} options={LEVEL_OPTIONS} />
                </div>
                {candidates.length ? (
                  <ul className="mt-2">
                    {candidates.map((u) => (
                      <li key={u.id}>
                        <button
                          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-hover"
                          onClick={() => {
                            setShare.mutate({ pageId, userId: u.id, level });
                            setQuery("");
                          }}
                        >
                          <Avatar name={u.name} color={u.avatarColor} size={22} />
                          <span className="flex-1 truncate">{u.name}</span>
                          <span className="text-[12px] text-fg-3">{u.jobTitle}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="max-h-[300px] overflow-y-auto p-2">
              <p className="px-2 pb-1 pt-1 text-[12px] font-medium text-fg-3">لديهم وصول</p>
              {data.teamspace ? (
                <div className="flex h-10 items-center gap-2.5 px-2">
                  <span className="grid size-6 place-items-center rounded-md bg-hover">
                    <PageIcon icon={data.teamspace.icon} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">كل أعضاء «{data.teamspace.name}»</p>
                    <p className="text-[12px] text-fg-3">
                      <Users className="me-1 inline size-3" />
                      {data.teamspace.memberCount} عضو + من تمنحه أدوارهم الوصول
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-10 items-center gap-2.5 px-2">
                  <span className="grid size-6 place-items-center rounded-md bg-hover">
                    <Lock className="size-3.5 text-fg-3" />
                  </span>
                  <p className="flex-1 text-[13px]">صفحة خاصة{data.owner ? ` — المالك: ${data.owner.name}` : ""}</p>
                </div>
              )}
              {data.shares.map((s) => (
                <div key={s.id} className="flex h-10 items-center gap-2.5 px-2">
                  <Avatar name={s.user?.name ?? "؟"} color={s.user?.avatarColor} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{s.user?.name}</p>
                    <p className="truncate text-[12px] text-fg-3">{s.user?.jobTitle}</p>
                  </div>
                  {data.canManage ? (
                    <>
                      <Select size="sm" className="w-[120px]" value={s.level} onChange={(v) => setShare.mutate({ pageId, userId: s.userId, level: v as typeof level })} options={LEVEL_OPTIONS} />
                      <button onClick={() => removeShare.mutate({ pageId, userId: s.userId })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="إزالة">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-[12px] text-fg-3">{LEVEL_LABELS[s.level as keyof typeof LEVEL_LABELS]}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line p-3">
              <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <Globe2 className="size-3.5" /> الرابط يعمل فقط لمن يملك الوصول
              </span>
              <Button
                size="sm"
                icon={<Link2 className="size-3.5" />}
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}${href}`);
                  toast.success("نُسخ الرابط");
                }}
              >
                نسخ الرابط
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
