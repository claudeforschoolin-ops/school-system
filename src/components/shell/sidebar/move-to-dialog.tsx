"use client";
/** نقل صفحة إلى مساحة أو صفحة أخرى أو إلى «خاص» */
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { matchesSearch } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageIcon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { SidebarData, TreePage } from "./page-tree";

export function MoveToDialog({ page, data, onClose }: { page: TreePage | null; data: SidebarData; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const move = trpc.page.move.useMutation({
    onSuccess: async () => {
      await utils.workspace.sidebar.invalidate();
      toast.success("نُقلت الصفحة");
      onClose();
    },
  });

  const descendants = useMemo(() => {
    const set = new Set<string>();
    if (!page) return set;
    let frontier = [page.id];
    while (frontier.length) {
      const next = data.pages.filter((p) => p.parentId && frontier.includes(p.parentId)).map((p) => p.id);
      next.forEach((id) => set.add(id));
      frontier = next;
    }
    return set;
  }, [page, data.pages]);

  const editableTeamspaces = data.teamspaces.filter((t) => t.level === "EDIT" || t.level === "FULL");
  const tsName = new Map(data.teamspaces.map((t) => [t.id, t.name]));
  const candidates = data.pages.filter(
    (p) => p.kind === "PAGE" && p.id !== page?.id && !descendants.has(p.id) && matchesSearch(p.title, query) && (!p.teamspaceId || editableTeamspaces.some((t) => t.id === p.teamspaceId)),
  );

  const item = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[14px] hover:bg-hover disabled:opacity-50";
  return (
    <Dialog open={Boolean(page)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`نقل «${page?.title || "بدون عنوان"}» إلى…`} width={460}>
        <div className="px-5 pb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن صفحة أو مساحة…"
              className="h-8 w-full rounded-md bg-hover ps-8 pe-2 text-[14px] outline-none"
            />
          </div>
          <div className="mt-3 max-h-[46vh] overflow-y-auto thin-scroll">
            <p className="px-2 pb-1 text-[12px] font-medium text-fg-3">المساحات</p>
            {editableTeamspaces
              .filter((t) => matchesSearch(t.name, query))
              .map((t) => (
                <button key={t.id} className={item} disabled={move.isPending} onClick={() => page && move.mutate({ pageId: page.id, parentId: null, teamspaceId: t.id })}>
                  <PageIcon icon={t.icon} size={16} />
                  {t.name}
                </button>
              ))}
            <button className={item} disabled={move.isPending} onClick={() => page && move.mutate({ pageId: page.id, parentId: null, teamspaceId: null })}>
              <Lock className="size-4 text-fg-3" />
              خاص
            </button>
            {candidates.length ? <p className="mt-2 px-2 pb-1 text-[12px] font-medium text-fg-3">الصفحات</p> : null}
            {candidates.slice(0, 40).map((p) => (
              <button key={p.id} className={item} disabled={move.isPending} onClick={() => page && move.mutate({ pageId: page.id, parentId: p.id })}>
                <PageIcon icon={p.icon} size={16} />
                <span className="flex-1 truncate">{p.title || "بدون عنوان"}</span>
                <span className="text-[12px] text-fg-3">{p.teamspaceId ? tsName.get(p.teamspaceId) : "خاص"}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
