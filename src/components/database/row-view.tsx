"use client";
/**
 * صفحة السجل: الأيقونة والعنوان، الخصائص القابلة للتحرير، التعليقات، سجل النشاط، والمحتوى.
 * تُستخدم في المعاينة الجانبية وفي الصفحة الكاملة /r/[id].
 */
import { History, MessageSquare, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "@/lib/hooks/use-latest";
import type { JSONContent } from "@tiptap/react";
import type { PropertyDef } from "@/lib/database/types";
import { formatDate, formatRelative } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { BlockEditor } from "@/components/editor/block-editor";
import { CommentsThreadList } from "@/components/collab/comments-panel";
import { PageHeader } from "@/components/page/page-header";
import { usePrefs } from "@/components/shell/app-context";
import { EditableValue } from "./editable-value";
import { PropertyTypeIcon } from "./property-display";
import { NewPropertyMenu, PropertyMenu } from "./property-menu";
import { useDatabase, type DatabaseApi } from "./use-database";

export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 700) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const saveRef = useLatest(save);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setStatus("saving");
    try {
      await saveRef.current(value);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [saveRef]);
  const schedule = useCallback(
    (value: T) => {
      pending.current = value;
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );
  useEffect(() => {
    const onUnload = () => void flush();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void flush();
    };
  }, [flush]);
  return { schedule, flush, status };
}

export function SaveStatus({ status }: { status: ReturnType<typeof useAutosave>["status"] }) {
  if (status === "idle") return null;
  return (
    <span className={cn("text-[12px]", status === "error" ? "text-danger-700" : "text-fg-3")}>
      {status === "pending" || status === "saving" ? "جارٍ الحفظ…" : status === "saved" ? "تم الحفظ" : "تعذر الحفظ"}
    </span>
  );
}

export function RowView({ rowId, compact }: { rowId: string; compact?: boolean }) {
  const row = trpc.database.row.useQuery({ rowId });
  if (row.isLoading) {
    return (
      <div className="px-8 pt-10">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="mt-5 h-8 w-2/3" />
        <SkeletonLines lines={5} className="mt-6" />
      </div>
    );
  }
  if (!row.data) return <p className="p-8 text-[14px] text-fg-3">السجل غير موجود أو لا تملك صلاحية الوصول إليه.</p>;
  return <RowContent rowId={rowId} databaseId={row.data.databaseId} initialContent={row.data.row.content} compact={compact} />;
}

function RowContent({ rowId, databaseId, initialContent, compact }: { rowId: string; databaseId: string; initialContent: unknown; compact?: boolean }) {
  const api = useDatabase(databaseId);
  const utils = trpc.useUtils();
  const updateContent = trpc.database.updateRow.useMutation();
  const autosave = useAutosave<JSONContent>((content) => updateContent.mutateAsync({ rowId, content }));
  const row = api.rows.find((r) => r.id === rowId);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const createChild = trpc.page.create.useMutation();

  if (!api.bundle || !row) {
    return (
      <div className="px-8 pt-10">
        <SkeletonLines lines={6} />
      </div>
    );
  }
  const editable = api.canEdit;
  const canComment = api.bundle.level !== "VIEW";
  const propertyNames = Object.fromEntries(api.properties.map((p) => [p.id, p.name]));

  return (
    <div className="pb-24">
      <PageHeader
        title={row.title}
        icon={row.icon}
        cover={row.cover}
        editable={editable}
        compact={compact}
        autoFocusTitle={!row.title && editable}
        onTitle={(title) => void api.updateRow(row.id, { title })}
        onIcon={(icon) => void api.updateRow(row.id, { icon })}
        onCover={(cover) => void api.updateRow(row.id, { cover })}
      />
      <div className={cn(compact ? "px-6 md:px-10" : "mx-auto max-w-[850px] px-6 md:px-14")}>
        <PropertyList api={api} rowId={row.id} />

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "comments", label: "التعليقات", icon: <MessageSquare className="size-3.5" /> },
                { value: "activity", label: "سجل النشاط", icon: <History className="size-3.5" /> },
              ]}
            />
            <SaveStatus status={autosave.status} />
          </div>
          {tab === "comments" ? (
            <CommentsThreadList targetType="ROW" targetId={row.id} canComment={canComment} propertyNames={propertyNames} compact />
          ) : (
            <ActivityList api={api} rowId={row.id} />
          )}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <BlockEditor
            content={initialContent}
            editable={editable}
            placeholder="اكتب ملاحظات أو تفاصيل السجل، أو اضغط «/»…"
            onChange={(doc) => autosave.schedule(doc)}
            host={
              editable
                ? {
                    createChildPage: async () => {
                      const r = await createChild.mutateAsync({ teamspaceId: null, title: `${row.title || "صفحة"} — ملاحظات` });
                      await utils.workspace.sidebar.invalidate();
                      return { id: r.id, title: `${row.title || "صفحة"} — ملاحظات` };
                    },
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

function PropertyList({ api, rowId }: { api: DatabaseApi; rowId: string }) {
  const row = api.rows.find((r) => r.id === rowId)!;
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(true);
  const props = api.properties;
  const isEmpty = (p: PropertyDef) => {
    const v = row.values[p.id];
    return p.type !== "CHECKBOX" && !["CREATED_TIME", "UPDATED_TIME", "CREATED_BY", "FORMULA", "ROLLUP"].includes(p.type) && (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
  };
  const visible = showEmpty ? props : props.filter((p) => !isEmpty(p));
  const hiddenCount = props.length - visible.length;
  return (
    <div className="mt-4 space-y-0.5">
      {visible.map((p) => (
        <div key={p.id} className="group/prop flex min-h-[34px] items-start gap-2">
          <Popover open={menuFor === p.id} onOpenChange={(o) => setMenuFor(o ? p.id : null)}>
            <PopoverTrigger asChild>
              <button className="flex h-[34px] w-[150px] shrink-0 items-center gap-2 rounded-md px-1.5 text-[14px] text-fg-3 transition-colors hover:bg-hover">
                <PropertyTypeIcon type={p.type} />
                <span className="truncate">{p.name}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0">
              <PropertyMenu api={api} prop={p} onClose={() => setMenuFor(null)} />
            </PopoverContent>
          </Popover>
          <EditableValue api={api} row={row} prop={p} wrap placeholder="فارغ" className="min-h-[34px] flex-1 rounded-md px-1.5 py-1.5 text-[14px] transition-colors hover:bg-hover" />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        {api.canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-fg-3 hover:bg-hover hover:text-fg-2">
                <Plus className="size-4" /> إضافة خاصية
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0">
              <NewPropertyMenu api={api} />
            </PopoverContent>
          </Popover>
        ) : null}
        {hiddenCount || !showEmpty ? (
          <button className="h-8 rounded-md px-1.5 text-[13px] text-fg-3 hover:bg-hover" onClick={() => setShowEmpty(!showEmpty)}>
            {showEmpty ? "إخفاء الخصائص الفارغة" : `إظهار ${new Intl.NumberFormat("ar-SA").format(hiddenCount)} خاصية فارغة`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActivityList({ api, rowId }: { api: DatabaseApi; rowId: string }) {
  const prefs = usePrefs();
  const activity = trpc.database.rowActivity.useQuery({ rowId });
  if (activity.isLoading) return <SkeletonLines lines={4} />;
  const describe = (entry: NonNullable<typeof activity.data>[number]) => {
    if (entry.action === "CREATE") return "أنشأ السجل";
    if (entry.action === "SOFT_DELETE") return "حذف السجل";
    if (entry.action === "RESTORE") return "استعاد السجل";
    const oldV = (entry.oldValue ?? {}) as Record<string, unknown>;
    const newV = (entry.newValue ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if ("title" in newV) parts.push(`غيّر العنوان إلى «${String(newV.title)}»`);
    if ("content" in newV) parts.push("عدّل المحتوى");
    if ("values" in newV) {
      const before = (oldV.values ?? {}) as Record<string, unknown>;
      const after = (newV.values ?? {}) as Record<string, unknown>;
      const changed = new Set([...Object.keys(before), ...Object.keys(after)].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])));
      for (const k of changed) {
        const prop = api.properties.find((p) => p.id === k);
        if (!prop) continue;
        const fmt = (v: unknown) => {
          if (v === undefined || v === null) return "فارغ";
          if (prop.type === "SELECT" || prop.type === "STATUS") return prop.config.options?.find((o) => o.id === v)?.name ?? "—";
          if (prop.type === "PERSON" && Array.isArray(v)) return v.map((id) => api.users.find((u) => u.id === id)?.name ?? "؟").join("، ");
          if (prop.type === "DATE" && typeof v === "object") return formatDate((v as { start: string }).start, { digits: prefs.digits });
          if (prop.type === "CHECKBOX") return v ? "محدَّد" : "غير محدَّد";
          if (Array.isArray(v)) return `${v.length} عنصر`;
          return String(v).slice(0, 40);
        };
        parts.push(`غيّر «${prop.name}» من ${fmt(before[k])} إلى ${fmt(after[k])}`);
      }
    }
    if ("icon" in newV) parts.push("غيّر الأيقونة");
    if ("cover" in newV) parts.push("غيّر الغلاف");
    return parts.join("، ") || "عدّل السجل";
  };
  if (!activity.data?.length) return <p className="text-[13px] text-fg-3">لا يوجد نشاط مسجل.</p>;
  return (
    <ol className="relative space-y-3 border-s border-line ps-4">
      {activity.data.map((a) => {
        const user = api.users.find((u) => u.id === a.userId);
        return (
          <li key={a.id} className="relative">
            <span className="absolute -start-[21px] top-1 size-2.5 rounded-full border-2 border-app bg-line-strong" />
            <div className="flex items-start gap-2">
              <Avatar name={a.userName ?? "النظام"} color={user?.avatarColor ?? "slate"} size={20} />
              <p className="text-[13px] leading-5 text-fg-2">
                <span className="font-medium text-fg">{a.userName ?? "النظام"}</span> {describe(a)}
                <span className="ms-1.5 text-[12px] text-fg-3">{formatRelative(a.createdAt, new Date(), prefs.digits)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
