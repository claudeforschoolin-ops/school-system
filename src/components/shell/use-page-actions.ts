"use client";
/**
 * إجراءات الصفحات المشتركة بين الشريط الجانبي وشريط الصفحة ولوحة الأوامر.
 */
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/components/ui/toast";
import { tabsActions } from "./tabs-store";

export function usePageActions() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const create = trpc.page.create.useMutation();
  const update = trpc.page.update.useMutation();
  const duplicate = trpc.page.duplicate.useMutation();
  const trash = trpc.page.trash.useMutation();
  const restore = trpc.page.restore.useMutation();
  const move = trpc.page.move.useMutation();
  const favorite = trpc.workspace.toggleFavorite.useMutation();

  const refreshSidebar = useCallback(() => utils.workspace.sidebar.invalidate(), [utils]);

  const createPage = useCallback(
    async (input: { teamspaceId?: string | null; parentId?: string | null; kind?: "PAGE" | "DATABASE"; title?: string; icon?: string | null }, opts?: { navigate?: boolean; newTab?: boolean }) => {
      const result = await create.mutateAsync(input);
      await refreshSidebar();
      const href = `/p/${result.id}`;
      if (opts?.newTab) tabsActions.open(href, { title: input.title ?? "بدون عنوان", icon: input.icon ?? null });
      if (opts?.navigate !== false) router.push(href);
      return result;
    },
    [create, refreshSidebar, router],
  );

  const rename = useCallback(
    async (pageId: string, title: string) => {
      utils.workspace.sidebar.setData(undefined, (old) => (old ? { ...old, pages: old.pages.map((p) => (p.id === pageId ? { ...p, title } : p)) } : old));
      await update.mutateAsync({ pageId, title });
      await Promise.all([refreshSidebar(), utils.page.get.invalidate({ pageId })]);
    },
    [update, utils, refreshSidebar],
  );

  const setIcon = useCallback(
    async (pageId: string, icon: string | null) => {
      utils.workspace.sidebar.setData(undefined, (old) => (old ? { ...old, pages: old.pages.map((p) => (p.id === pageId ? { ...p, icon } : p)) } : old));
      await update.mutateAsync({ pageId, icon });
      await Promise.all([refreshSidebar(), utils.page.get.invalidate({ pageId })]);
    },
    [update, utils, refreshSidebar],
  );

  const duplicatePage = useCallback(
    async (pageId: string) => {
      const r = await duplicate.mutateAsync({ pageId });
      await refreshSidebar();
      toast.success("تم إنشاء نسخة من الصفحة");
      router.push(`/p/${r.id}`);
    },
    [duplicate, refreshSidebar, router],
  );

  const trashPage = useCallback(
    async (pageId: string, opts?: { redirect?: boolean }) => {
      utils.workspace.sidebar.setData(undefined, (old) => (old ? { ...old, pages: old.pages.filter((p) => p.id !== pageId) } : old));
      await trash.mutateAsync({ pageId });
      await refreshSidebar();
      if (opts?.redirect) router.push("/home");
      toast.undo("نُقلت الصفحة إلى المهملات", async () => {
        await restore.mutateAsync({ pageId });
        await refreshSidebar();
        toast.success("تمت استعادة الصفحة");
      });
    },
    [trash, restore, refreshSidebar, router, utils],
  );

  const toggleFavorite = useCallback(
    async (targetType: "PAGE" | "ROW", targetId: string) => {
      const r = await favorite.mutateAsync({ targetType, targetId });
      await Promise.all([refreshSidebar(), utils.workspace.favorites.invalidate(), utils.page.get.invalidate()]);
      toast.success(r.isFavorite ? "أُضيفت إلى المفضلة" : "أُزيلت من المفضلة");
      return r.isFavorite;
    },
    [favorite, refreshSidebar, utils],
  );

  const copyLink = useCallback((href: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}${href}`);
    toast.success("نُسخ الرابط");
  }, []);

  return { createPage, rename, setIcon, duplicatePage, trashPage, toggleFavorite, copyLink, move, refreshSidebar };
}
