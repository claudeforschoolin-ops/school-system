"use client";
/** السجل كصفحة كاملة: /r/[rowId] */
import { Link2, MessageSquare, Star } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { RowView } from "@/components/database/row-view";
import { PageTopbar, TopbarIconButton } from "@/components/shell/page-topbar";
import { PresenceStickers } from "@/components/shell/presence";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { usePageActions } from "@/components/shell/use-page-actions";
import { PrintHeader } from "./page-screen";

export function RowScreen({ rowId }: { rowId: string }) {
  const row = trpc.database.row.useQuery({ rowId }, { retry: false });
  const favorites = trpc.workspace.favorites.useQuery();
  const actions = usePageActions();
  useTabMeta(row.data?.row.title, row.data?.row.icon ?? row.data?.databasePage.icon);
  if (row.isLoading) return <PageSkeleton />;
  if (!row.data) {
    return (
      <div className="pt-24">
        <EmptyState
          illustration="lock"
          title="السجل غير متاح"
          description={row.error?.message ?? "ربما حُذف أو لا تملك صلاحية الوصول إليه."}
          action={
            <Link href="/home" className="inline-flex h-8 items-center rounded-md bg-navy-700 px-3 text-[14px] font-medium text-white">
              العودة إلى الرئيسية
            </Link>
          }
        />
      </div>
    );
  }
  const isFavorite = favorites.data?.some((f) => f.targetType === "ROW" && f.targetId === rowId);
  return (
    <div className="relative">
      <PageTopbar
        crumbs={[...row.data.ancestors.map((a) => ({ title: a.title, icon: a.icon, href: `/p/${a.id}` })), { title: row.data.row.title, icon: row.data.row.icon }]}
        actions={
          <>
            <TopbarIconButton label="نسخ الرابط" onClick={() => actions.copyLink(`/r/${rowId}`)}>
              <Link2 className="size-4" />
            </TopbarIconButton>
            <TopbarIconButton label="التعليقات" onClick={() => document.getElementById("row-comments")?.scrollIntoView({ behavior: "smooth" })}>
              <MessageSquare className="size-4" />
            </TopbarIconButton>
            <TopbarIconButton label={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => void actions.toggleFavorite("ROW", rowId)}>
              <Star className={cn("size-4", isFavorite && "fill-gold-700 text-gold-700")} />
            </TopbarIconButton>
          </>
        }
      />
      <PresenceStickers target={`row:${rowId}`} />
      <PrintHeader />
      <RowView rowId={rowId} />
    </div>
  );
}
