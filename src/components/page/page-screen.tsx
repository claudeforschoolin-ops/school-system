"use client";
/**
 * شاشة الصفحة: شريط علوي (مسار + مشاركة + تعليقات + مفضلة + ⋯) ثم رأس الصفحة،
 * ثم المحرر (صفحة نصية) أو قاعدة البيانات (صفحة قاعدة بيانات).
 */
import { CopyPlus, Expand, History, Link2, Lock, LockOpen, MessageSquare, MoreHorizontal, Printer, Shrink, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { atLeast, type AccessLevelName } from "@/lib/access-levels";
import { formatRelative } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { BlockEditor } from "@/components/editor/block-editor";
import { CommentsSidePanel, CommentsThreadList } from "@/components/collab/comments-panel";
import { SharePopover } from "@/components/collab/share-popover";
import { VersionsDialog } from "@/components/collab/versions-dialog";
import { DatabaseView } from "@/components/database/database-view";
import { SaveStatus, useAutosave } from "@/components/database/row-view";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar, TopbarIconButton, type Crumb } from "@/components/shell/page-topbar";
import { PresenceStickers } from "@/components/shell/presence";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { usePageActions } from "@/components/shell/use-page-actions";
import { PageHeader } from "./page-header";

export function PageScreen({ pageId }: { pageId: string }) {
  const query = trpc.page.get.useQuery({ pageId }, { retry: false });
  useTabMeta(query.data?.page.title, query.data?.page.icon ?? (query.data?.page.kind === "DATABASE" ? "lucide:database" : null));
  if (query.isLoading) return <PageSkeleton />;
  if (!query.data) {
    return (
      <div className="pt-24">
        <EmptyState
          illustration="lock"
          title="الصفحة غير متاحة"
          description={query.error?.message ?? "ربما حُذفت أو لا تملك صلاحية الوصول إليها."}
          action={
            <Link href="/home" className="inline-flex h-8 items-center rounded-md bg-navy-700 px-3 text-[14px] font-medium text-white">
              العودة إلى الرئيسية
            </Link>
          }
        />
      </div>
    );
  }
  return <PageBody data={query.data} />;
}

type PageData = RouterOutputs["page"]["get"];

function PageBody({ data }: { data: PageData }) {
  const { prefs } = useApp();
  const router = useRouter();
  const utils = trpc.useUtils();
  const actions = usePageActions();
  const { page, level } = data;
  const editable = atLeast(level as AccessLevelName, "EDIT");
  const canComment = atLeast(level as AccessLevelName, "COMMENT");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const update = trpc.page.update.useMutation();
  const createChild = trpc.page.create.useMutation();
  const autosave = useAutosave<JSONContent>((content) => update.mutateAsync({ pageId: page.id, content }));

  const patch = async (input: Parameters<typeof update.mutateAsync>[0]) => {
    utils.page.get.setData({ pageId: page.id }, (old) => (old ? { ...old, page: { ...old.page, ...input } as PageData["page"] } : old));
    await update.mutateAsync(input);
    if (input.title !== undefined || input.icon !== undefined) await utils.workspace.sidebar.invalidate();
  };

  const crumbs: Crumb[] = [
    ...(data.teamspace ? [{ title: data.teamspace.name, icon: data.teamspace.icon }] : [{ title: "خاص", icon: "lucide:lock" }]),
    ...data.ancestors.map((a) => ({ title: a.title, icon: a.icon, href: `/p/${a.id}` })),
    { title: page.title, icon: page.icon },
  ];
  const isDatabase = page.kind === "DATABASE";
  const wide = isDatabase || page.fullWidth;

  return (
    <div className="relative">
      <PageTopbar
        crumbs={crumbs}
        meta={
          <span className="flex items-center gap-2">
            {page.isLocked ? (
              <span className="flex items-center gap-1 text-fg-3">
                <Lock className="size-3" /> مقفلة
              </span>
            ) : null}
            {autosave.status !== "idle" ? <SaveStatus status={autosave.status} /> : page.updatedByName ? `عدّلها ${page.updatedByName} ${formatRelative(page.updatedAt, new Date(), prefs.digits)}` : null}
          </span>
        }
        actions={
          <>
            <SharePopover pageId={page.id} href={`/p/${page.id}`} />
            <TopbarIconButton label="التعليقات" active={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)}>
              <MessageSquare className="size-4" />
            </TopbarIconButton>
            <TopbarIconButton label={data.isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => void actions.toggleFavorite("PAGE", page.id)}>
              <Star className={cn("size-4", data.isFavorite && "fill-gold-700 text-gold-700")} />
            </TopbarIconButton>
            <Menu>
              <MenuTrigger asChild>
                <button className="grid size-7 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg" aria-label="المزيد">
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent align="end" className="w-[240px]">
                {editable && !isDatabase ? (
                  <MenuItem icon={page.fullWidth ? <Shrink className="size-4" /> : <Expand className="size-4" />} onSelect={() => void patch({ pageId: page.id, fullWidth: !page.fullWidth })}>
                    {page.fullWidth ? "عرض عادي" : "عرض كامل"}
                  </MenuItem>
                ) : null}
                {level === "FULL" ? (
                  <MenuItem icon={page.isLocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onSelect={() => void patch({ pageId: page.id, isLocked: !page.isLocked })}>
                    {page.isLocked ? "إلغاء قفل الصفحة" : "قفل الصفحة"}
                  </MenuItem>
                ) : null}
                {!isDatabase ? (
                  <MenuItem icon={<History className="size-4" />} onSelect={() => setVersionsOpen(true)}>
                    سجل النسخ
                  </MenuItem>
                ) : null}
                <MenuItem icon={<Link2 className="size-4" />} onSelect={() => actions.copyLink(`/p/${page.id}`)}>
                  نسخ الرابط
                </MenuItem>
                <MenuItem icon={<CopyPlus className="size-4" />} onSelect={() => void actions.duplicatePage(page.id)}>
                  نسخ الصفحة
                </MenuItem>
                <MenuItem icon={<Printer className="size-4" />} onSelect={() => window.print()}>
                  طباعة / تصدير PDF
                </MenuItem>
                {editable && !page.systemKey ? (
                  <>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => void actions.trashPage(page.id, { redirect: true })}>
                      نقل إلى المهملات
                    </MenuItem>
                  </>
                ) : null}
              </MenuContent>
            </Menu>
          </>
        }
      />

      <PresenceStickers target={`page:${page.id}`} />

      <PrintHeader />

      <PageHeader
        title={page.title}
        icon={page.icon}
        cover={page.cover}
        description={page.description}
        editable={editable}
        wide={wide}
        autoFocusTitle={!page.title && editable}
        onTitle={(title) => void patch({ pageId: page.id, title })}
        onIcon={(icon) => void patch({ pageId: page.id, icon })}
        onCover={(cover) => void patch({ pageId: page.id, cover })}
        onDescription={(description) => void patch({ pageId: page.id, description })}
      />

      {isDatabase && data.databaseId ? (
        <div className="px-6 pb-24 pt-4 md:px-24">
          <Suspense>
            <DatabaseView databaseId={data.databaseId} mode="page" title={page.title} />
          </Suspense>
        </div>
      ) : (
        <div className={cn("pb-16 pt-4", wide ? "px-6 md:px-24" : "mx-auto max-w-[850px] px-6 md:px-14")}>
          <BlockEditor
            content={page.content}
            editable={editable}
            onChange={(doc) => autosave.schedule(doc)}
            host={
              editable
                ? {
                    createChildPage: async () => {
                      const r = await createChild.mutateAsync({ parentId: page.id, title: "صفحة جديدة" });
                      await utils.workspace.sidebar.invalidate();
                      return { id: r.id, title: "صفحة جديدة" };
                    },
                    createInlineDatabase: async () => {
                      const r = await createChild.mutateAsync({ parentId: page.id, kind: "DATABASE", title: "قاعدة بيانات" });
                      await utils.workspace.sidebar.invalidate();
                      return { databaseId: r.databaseId! };
                    },
                  }
                : undefined
            }
          />
          {data.children.length ? (
            <div className="mt-2 space-y-0.5">
              {data.children.map((c) => (
                <Link key={c.id} href={`/p/${c.id}`} className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[15px] underline decoration-line-strong underline-offset-4 hover:bg-hover">
                  <PageIcon icon={c.icon} size={18} />
                  {c.title || "بدون عنوان"}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <CommentsSidePanel open={commentsOpen} onClose={() => setCommentsOpen(false)}>
        <CommentsThreadList targetType="PAGE" targetId={page.id} canComment={canComment} />
      </CommentsSidePanel>
      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        targetType="PAGE"
        targetId={page.id}
        canRestore={editable}
        onRestored={() => {
          void utils.page.get.invalidate({ pageId: page.id });
          router.refresh();
        }}
      />
    </div>
  );
}

/** ترويسة المدرسة عند الطباعة فقط */
export function PrintHeader() {
  const { tenant } = useApp();
  return (
    <div className="hidden border-b border-line px-6 pb-3 pt-2 print:flex print:items-center print:justify-between">
      <span className="text-[16px] font-bold">{tenant.name}</span>
      <span className="text-[12px] text-fg-3">{new Intl.DateTimeFormat("ar-SA-u-nu-arab", { dateStyle: "long" }).format(new Date())}</span>
    </div>
  );
}
