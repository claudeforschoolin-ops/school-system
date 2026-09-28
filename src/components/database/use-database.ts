"use client";
/**
 * بيانات قاعدة البيانات في الواجهة: الحزمة (خصائص/عروض/قوالب) + السجلات + سياق المحرك،
 * مع تحديثات تفاؤلية فورية (تعديل خلية، سحب بطاقة، إنشاء وحذف سجلات).
 */
import { useCallback, useMemo, useState } from "react";
import type { EngineContext } from "@/lib/database/engine";
import type { PropertyDef, RowRecord, ViewConfig } from "@/lib/database/types";
import { positionBetween } from "@/lib/position";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";

export type Bundle = RouterOutputs["database"]["bundle"];
export type ViewRecord = Bundle["views"][number];
export type Row = RouterOutputs["database"]["rows"]["rows"][number];

export function useDatabase(databaseId: string) {
  const { user, tenant } = useApp();
  const utils = trpc.useUtils();
  const bundle = trpc.database.bundle.useQuery({ databaseId });
  const rowsQuery = trpc.database.rows.useQuery({ databaseId });
  const directory = trpc.workspace.directory.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [justCreated, setJustCreated] = useState<string | null>(null);
  /** طلب إنشاء في مجموعة نظامية: يفتح نموذج الوحدة بقيم مسبقة (عمود اللوحة، يوم التقويم…) */
  const [createRequest, setCreateRequest] = useState<{ values: Record<string, unknown> } | null>(null);
  const system = bundle.data?.system ?? null;

  const properties: PropertyDef[] = useMemo(() => bundle.data?.properties ?? [], [bundle.data]);
  const rows: Row[] = useMemo(() => rowsQuery.data?.rows ?? [], [rowsQuery.data]);
  const canEdit = bundle.data?.level === "EDIT" || bundle.data?.level === "FULL";

  const ctx: EngineContext = useMemo(
    () => ({
      properties,
      currentUserId: user.id,
      users: new Map((directory.data ?? []).map((u) => [u.id, { id: u.id, name: u.name }])),
      relatedRows: new Map((rowsQuery.data?.relatedRows ?? []).map((r) => [r.id, r as RowRecord & { databaseId: string }])),
      relatedDatabases: new Map((rowsQuery.data?.relatedDatabases ?? []).map((d) => [d.id, d])),
      timeZone: tenant.timezone,
      defaultCurrency: tenant.currency,
    }),
    [properties, user.id, directory.data, rowsQuery.data, tenant.timezone, tenant.currency],
  );

  const patchRowsCache = useCallback(
    (fn: (rows: Row[]) => Row[]) => {
      utils.database.rows.setData({ databaseId }, (old) => (old ? { ...old, rows: fn(old.rows) } : old));
    },
    [databaseId, utils],
  );

  const updateRowMutation = trpc.database.updateRow.useMutation();
  const createRowMutation = trpc.database.createRow.useMutation();
  const moveRowMutation = trpc.database.moveRow.useMutation();
  const trashMutation = trpc.database.trashRows.useMutation();
  const restoreMutation = trpc.database.restoreRows.useMutation();
  const duplicateMutation = trpc.database.duplicateRow.useMutation();

  const refetchRows = useCallback(() => utils.database.rows.invalidate({ databaseId }), [utils, databaseId]);

  /** تعديل قيم سجل (تفاؤلي) */
  const updateRow = useCallback(
    async (rowId: string, patch: { title?: string; values?: Record<string, unknown>; icon?: string | null; cover?: string | null }) => {
      const snapshot = utils.database.rows.getData({ databaseId });
      patchRowsCache((list) =>
        list.map((r) => {
          if (r.id !== rowId) return r;
          const values = { ...r.values, ...(patch.values ?? {}) };
          for (const [k, v] of Object.entries(patch.values ?? {})) if (v === null) delete values[k];
          return { ...r, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.icon !== undefined ? { icon: patch.icon } : {}), ...(patch.cover !== undefined ? { cover: patch.cover } : {}), values, updatedAt: new Date() };
        }),
      );
      try {
        const fresh = await updateRowMutation.mutateAsync({ rowId, databaseId, ...patch });
        patchRowsCache((list) => list.map((r) => (r.id === rowId ? { ...r, ...fresh, values: fresh.values } : r)));
        void utils.database.row.invalidate({ rowId });
      } catch {
        utils.database.rows.setData({ databaseId }, snapshot);
      }
    },
    [databaseId, patchRowsCache, updateRowMutation, utils],
  );

  const createRow = useCallback(
    async (input: { title?: string; values?: Record<string, unknown>; templateId?: string | null; afterRowId?: string | null; beforeRowId?: string | null }): Promise<Row | null> => {
      if (system) {
        setCreateRequest({ values: input.values ?? {} });
        return null;
      }
      const row = await createRowMutation.mutateAsync({ databaseId, ...input });
      patchRowsCache((list) => [...list, { ...row, values: row.values } as Row]);
      setJustCreated(row.id);
      void refetchRows();
      return row;
    },
    [createRowMutation, databaseId, patchRowsCache, refetchRows, system],
  );

  /** نقل سجل بين المجموعات/المواضع (تفاؤلي) */
  const moveRow = useCallback(
    async (rowId: string, input: { beforeRowId: string | null; afterRowId: string | null; values?: Record<string, unknown> }) => {
      const snapshot = utils.database.rows.getData({ databaseId });
      const list = snapshot?.rows ?? [];
      const pos = (id: string | null) => (id ? (list.find((r) => r.id === id)?.position ?? null) : null);
      const position = positionBetween(pos(input.beforeRowId), pos(input.afterRowId));
      patchRowsCache((rs) => rs.map((r) => (r.id === rowId ? { ...r, position, values: { ...r.values, ...(input.values ?? {}) } } : r)));
      try {
        const fresh = await moveRowMutation.mutateAsync({ rowId, databaseId, ...input });
        patchRowsCache((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...fresh, values: fresh.values } : r)));
      } catch {
        utils.database.rows.setData({ databaseId }, snapshot);
      }
    },
    [databaseId, moveRowMutation, patchRowsCache, utils],
  );

  const trashRows = useCallback(
    async (rowIds: string[]) => {
      const snapshot = utils.database.rows.getData({ databaseId });
      patchRowsCache((list) => list.filter((r) => !rowIds.includes(r.id)));
      try {
        await trashMutation.mutateAsync({ rowIds, databaseId });
        toast.undo(rowIds.length > 1 ? `حُذف ${rowIds.length} سجلات` : "حُذف السجل", async () => {
          await restoreMutation.mutateAsync({ rowIds, databaseId });
          await refetchRows();
        });
      } catch {
        utils.database.rows.setData({ databaseId }, snapshot);
      }
    },
    [databaseId, patchRowsCache, refetchRows, restoreMutation, trashMutation, utils],
  );

  const duplicateRow = useCallback(
    async (rowId: string) => {
      await duplicateMutation.mutateAsync({ rowId });
      await refetchRows();
    },
    [duplicateMutation, refetchRows],
  );

  const refreshBundle = useCallback(() => utils.database.bundle.invalidate({ databaseId }), [utils, databaseId]);

  return {
    databaseId,
    bundle: bundle.data,
    bundleQuery: bundle,
    rowsQuery,
    rows,
    properties,
    ctx,
    canEdit,
    /** مجموعة نظامية: رابط التفاصيل ونموذج الإنشاء الخاص بالوحدة */
    system,
    /** تعديل العنوان من الخلايا (معطّل لبعض المجموعات النظامية) */
    canEditTitle: canEdit && (!system || system.titleEditable),
    /** نسخ السجلات (غير متاح للمجموعات النظامية) */
    canDuplicate: canEdit && !system,
    createRequest,
    clearCreateRequest: () => setCreateRequest(null),
    /** رابط صفحة السجل (تفاصيل الوحدة للمجموعات النظامية) */
    rowHref: (id: string) => (system ? system.href.replace("{id}", id) : `/r/${id}`),
    users: directory.data ?? [],
    commentCounts: rowsQuery.data?.commentCounts ?? {},
    truncated: rowsQuery.data?.truncated ?? false,
    justCreated,
    clearJustCreated: () => setJustCreated(null),
    updateRow,
    createRow,
    moveRow,
    trashRows,
    duplicateRow,
    refetchRows,
    refreshBundle,
  };
}

export type DatabaseApi = ReturnType<typeof useDatabase>;

/** إعدادات العرض مع التحديث التفاؤلي */
export function useViewConfig(databaseId: string, view: ViewRecord | undefined) {
  const utils = trpc.useUtils();
  const update = trpc.database.updateView.useMutation();
  const setConfig = useCallback(
    (patch: Partial<ViewConfig>) => {
      if (!view) return;
      const next = { ...(view.config ?? {}), ...patch };
      utils.database.bundle.setData({ databaseId }, (old) =>
        old ? { ...old, views: old.views.map((v) => (v.id === view.id ? { ...v, config: next } : v)) } : old,
      );
      update.mutate({ viewId: view.id, config: next as Record<string, unknown> }, { onError: () => void utils.database.bundle.invalidate({ databaseId }) });
    },
    [databaseId, update, utils, view],
  );
  return setConfig;
}
