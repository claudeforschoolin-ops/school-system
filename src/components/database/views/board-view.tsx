"use client";
/**
 * عرض اللوحة (Kanban) مطابق للصورة المرجعية:
 *  - أعمدة ٢٦٠–٢٨٠px بخلفيات باهتة، رأس بشارة الحالة + عدّاد بانزلاق رقمي.
 *  - بطاقات بيضاء، «+ صفحة جديدة» بحدود منقطة في أسفل كل عمود.
 *  - السحب: تكبير ١.٠٢ + دوران ٢° + ظل أعمق + شفافية ٠.٩، مؤشر إفلات بتحريك البطاقات المجاورة،
 *    استقرار بحركة Spring ثم وميض خفيف للخلفية. تغيير العمود يحدّث خاصية التجميع ويُسجَّل.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { Eye, EyeOff, MessageSquare, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_GROUP, GROUPABLE_TYPES, groupRows, valueForGroupMove, type RowGroup } from "@/lib/database/engine";
import type { PropertyDef, ViewConfig } from "@/lib/database/types";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Select } from "@/components/ui/select";
import { Counter, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { coverStyle } from "@/components/page/page-header";
import { ValueDisplay } from "../property-display";
import type { DatabaseApi, Row } from "../use-database";

interface BoardProps {
  api: DatabaseApi;
  rows: Row[];
  config: ViewConfig;
  visibleProps: PropertyDef[];
  onConfig: (patch: Partial<ViewConfig>) => void;
  onOpen: (rowId: string) => void;
  sorted: boolean;
}

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length) {
    // البطاقة تحت المؤشر أولى من العمود نفسه
    const card = within.find((c) => !String(c.id).startsWith("col:"));
    return card ? [card] : within;
  }
  return closestCorners(args);
};

export function BoardView({ api, rows, config, visibleProps, onConfig, onOpen, sorted }: BoardProps) {
  const groupProp = api.properties.find((p) => p.id === config.groupBy && GROUPABLE_TYPES.has(p.type)) ?? api.properties.find((p) => p.type === "STATUS" || p.type === "SELECT");
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const groups = useMemo(() => (groupProp ? groupRows(rows, groupProp, api.ctx, { groupOrder: config.groupOrder }) : []), [rows, groupProp, api.ctx, config.groupOrder]);
  const hidden = new Set(config.hiddenGroups ?? []);
  const visibleGroups = groups.filter((g) => !hidden.has(g.key) && (g.key !== EMPTY_GROUP || g.rows.length > 0));
  const hiddenGroups = groups.filter((g) => hidden.has(g.key));

  const fromGroups = () => Object.fromEntries(groups.map((g) => [g.key, g.rows.map((r) => r.id)]));
  const [items, setItems] = useState<Record<string, string[]>>(fromGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const dragOrigin = useRef<string | null>(null);

  // إعادة بناء الأعمدة من البيانات عند تغيّرها أو انتهاء السحب (تعديل الحالة أثناء العرض بدل التأثير)
  const [synced, setSynced] = useState({ groups, activeId });
  if (synced.groups !== groups || synced.activeId !== activeId) {
    setSynced({ groups, activeId });
    if (!activeId) setItems(fromGroups());
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!groupProp) {
    return (
      <EmptyState
        illustration="table"
        title="اختر خاصية لتجميع البطاقات"
        description="تحتاج اللوحة إلى خاصية من نوع الحالة أو اختيار أو شخص أو مربع اختيار."
        action={
          <Select
            className="w-[220px]"
            value={undefined}
            onChange={(v) => onConfig({ groupBy: v })}
            options={api.properties.filter((p) => GROUPABLE_TYPES.has(p.type)).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="التجميع حسب…"
          />
        }
      />
    );
  }

  const containerOf = (id: string) => (id.startsWith("col:") ? id.slice(4) : Object.keys(items).find((k) => items[k]!.includes(id)));

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    dragOrigin.current = containerOf(id) ?? null;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = containerOf(String(active.id));
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const source = prev[from]!.filter((x) => x !== active.id);
      const target = [...(prev[to] ?? [])];
      const overIndex = String(over.id).startsWith("col:") ? target.length : target.indexOf(String(over.id));
      target.splice(overIndex < 0 ? target.length : overIndex, 0, String(active.id));
      return { ...prev, [from]: source, [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const origin = dragOrigin.current;
    setActiveId(null);
    if (!over || !origin) return;
    const container = containerOf(id);
    if (!container) return;
    let list = items[container]!;
    if (!String(over.id).startsWith("col:") && over.id !== active.id) {
      const oldIndex = list.indexOf(id);
      const newIndex = list.indexOf(String(over.id));
      if (oldIndex >= 0 && newIndex >= 0) list = arrayMove(list, oldIndex, newIndex);
    }
    setItems((prev) => ({ ...prev, [container]: list }));
    const row = rowsById.get(id);
    if (!row) return;
    const changedGroup = container !== origin;
    if (!changedGroup && sorted) {
      toast.info("الترتيب اليدوي غير متاح أثناء تفعيل الفرز");
      return;
    }
    const idx = list.indexOf(id);
    const beforeRowId = list[idx - 1] ?? null;
    const afterRowId = list[idx + 1] ?? null;
    const values = changedGroup ? { [groupProp.id]: valueForGroupMove(row, groupProp, origin, container) } : undefined;
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    void api.moveRow(id, { beforeRowId, afterRowId, values });
  };

  const addInGroup = async (group: RowGroup<Row>, afterRowId?: string | null) => {
    const values = group.key === EMPTY_GROUP ? {} : { [groupProp.id]: valueForGroupMove({ ...rows[0]!, values: {} } as Row, groupProp, "", group.key) };
    await api.createRow({ values, afterRowId: afterRowId ?? group.rows[group.rows.length - 1]?.id ?? null });
  };

  const activeRow = activeId ? rowsById.get(activeId) : null;
  const cardProps = visibleProps.filter((p) => p.id !== groupProp.id);

  return (
    <div className="thin-scroll overflow-x-auto pb-4">
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex min-w-max items-start gap-4">
          {visibleGroups.map((group) => (
            <Column
              key={group.key}
              group={group}
              ids={items[group.key] ?? []}
              rowsById={rowsById}
              api={api}
              cardProps={cardProps}
              config={config}
              onOpen={onOpen}
              onAdd={() => void addInGroup(group)}
              onHide={() => onConfig({ hiddenGroups: [...hidden, group.key] })}
              flash={flash}
              activeId={activeId}
            />
          ))}
          {hiddenGroups.length ? (
            <div className="w-[220px] shrink-0 pt-1">
              <p className="mb-2 px-2 text-[12px] font-medium text-fg-3">مجموعات مخفية</p>
              {hiddenGroups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => onConfig({ hiddenGroups: [...hidden].filter((k) => k !== g.key) })}
                  className="group flex h-8 w-full items-center gap-2 rounded-md px-2 hover:bg-hover"
                >
                  <Tag color={g.color}>{g.label}</Tag>
                  <Counter>{new Intl.NumberFormat("ar-SA").format(g.rows.length)}</Counter>
                  <Eye className="ms-auto size-3.5 text-fg-3 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : null}
          {api.canEdit && (groupProp.type === "SELECT" || groupProp.type === "MULTI_SELECT") ? <AddGroup api={api} prop={groupProp} /> : null}
        </div>
        <DragOverlay dropAnimation={{ duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" }}>
          {activeRow ? (
            <motion.div initial={{ scale: 1, rotate: 0 }} animate={{ scale: 1.02, rotate: 2 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="w-[264px] opacity-90">
              <Card row={activeRow} api={api} cardProps={cardProps} config={config} overlay />
            </motion.div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  group,
  ids,
  rowsById,
  api,
  cardProps,
  config,
  onOpen,
  onAdd,
  onHide,
  flash,
  activeId,
}: {
  group: RowGroup<Row>;
  ids: string[];
  rowsById: Map<string, Row>;
  api: DatabaseApi;
  cardProps: PropertyDef[];
  config: ViewConfig;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onHide: () => void;
  flash: { id: string; n: number } | null;
  activeId: string | null;
}) {
  const prefs = usePrefs();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${group.key}` });
  const color = group.key === EMPTY_GROUP ? "gray" : group.color;
  return (
    <section
      ref={setNodeRef}
      className={cn("group/col flex max-h-[calc(100dvh-260px)] min-h-[120px] w-[272px] shrink-0 flex-col rounded-lg p-2 transition-shadow duration-150", isOver && activeId && "shadow-[inset_0_0_0_1px_var(--border-strong)]")}
      style={{ background: `var(--tag-${color}-col)` }}
      aria-label={group.label}
    >
      <header className="mb-2 flex h-7 items-center gap-2 px-1">
        <Tag color={color}>{group.label}</Tag>
        <Counter>
          <NumberTicker value={ids.length} digits={prefs.digits} />
        </Counter>
        <div className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/col:opacity-100 has-[[data-state=open]]:opacity-100">
          <Menu>
            <MenuTrigger asChild>
              <button className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="خيارات المجموعة">
                <MoreHorizontal className="size-4" />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<EyeOff className="size-4" />} onSelect={onHide}>
                إخفاء المجموعة
              </MenuItem>
            </MenuContent>
          </Menu>
          {api.canEdit ? (
            <button onClick={onAdd} className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" aria-label="بطاقة جديدة">
              <Plus className="size-4" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="thin-scroll -mx-1 flex-1 overflow-y-auto px-1 pb-1">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {ids.map((id) => {
              const row = rowsById.get(id);
              if (!row) return null;
              return <SortableCard key={id} row={row} api={api} cardProps={cardProps} config={config} onOpen={onOpen} flashKey={flash?.id === id ? flash.n : 0} />;
            })}
          </div>
        </SortableContext>
        {api.canEdit ? (
          <button
            onClick={onAdd}
            className="mt-2 flex h-8 w-full items-center gap-1.5 rounded-lg border border-dashed border-line-strong/70 px-2.5 text-[13px] text-fg-3 transition-colors duration-[120ms] hover:border-line-strong hover:bg-card/60 hover:text-fg-2"
          >
            <Plus className="size-3.5" /> صفحة جديدة
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SortableCard({ row, api, cardProps, config, onOpen, flashKey }: { row: Row; api: DatabaseApi; cardProps: PropertyDef[]; config: ViewConfig; onOpen: (id: string) => void; flashKey: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !api.canEdit });
  return (
    <motion.div
      ref={setNodeRef}
      layout={false}
      initial={api.justCreated === row.id ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: isDragging ? 0.35 : 1, height: "auto" }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ transform: CSS.Translate.toString(transform), transition: transition ?? "transform 160ms cubic-bezier(.2,.8,.2,1)" }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(row.id)}
      className={cn("outline-none", isDragging && "[&>*]:border-dashed")}
    >
      <Card row={row} api={api} cardProps={cardProps} config={config} flashKey={flashKey} placeholder={isDragging} />
    </motion.div>
  );
}

function Card({ row, api, cardProps, config, overlay, flashKey = 0, placeholder }: { row: Row; api: DatabaseApi; cardProps: PropertyDef[]; config: ViewConfig; overlay?: boolean; flashKey?: number; placeholder?: boolean }) {
  const comments = api.commentCounts[row.id] ?? 0;
  const editingTitle = api.justCreated === row.id && !overlay;
  const size = config.cardSize ?? "medium";
  return (
    <motion.article
      key={flashKey}
      initial={flashKey ? { backgroundColor: "var(--teal-100)" } : false}
      animate={{ backgroundColor: "var(--bg-card)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cn(
        "cursor-pointer select-none overflow-hidden rounded-lg border border-transparent bg-card transition-[transform,box-shadow] duration-[140ms] ease-out",
        overlay ? "shadow-drag" : "shadow-card hover:-translate-y-px hover:shadow-card-hover",
        placeholder && "border-line-strong shadow-none",
      )}
    >
      {config.cardPreview === "cover" && row.cover ? <div className="h-24 w-full" style={coverStyle(row.cover)} /> : null}
      <div className={cn("space-y-1.5", size === "small" ? "px-2.5 py-2" : "px-3 py-2.5", size === "large" && "py-3")}>
        {editingTitle ? (
          <TitleInput row={row} api={api} />
        ) : (
          <p className="flex items-start gap-1.5 text-[14px] font-medium leading-[1.45] text-fg">
            {row.icon ? <PageIcon icon={row.icon} size={16} className="mt-0.5" /> : null}
            <span className="break-words">{row.title || <span className="text-fg-3">بدون عنوان</span>}</span>
          </p>
        )}
        {cardProps.map((p) => {
          const display = <ValueDisplay row={row} prop={p} ctx={api.ctx} users={api.users} compact />;
          return (
            <div key={p.id} className="flex min-h-5 items-center text-[13px] text-fg-2 empty:hidden [&:has(>:empty)]:hidden">
              {display}
            </div>
          );
        })}
        {comments ? (
          <span className="flex items-center gap-1 text-[12px] text-fg-3">
            <MessageSquare className="size-3" /> {new Intl.NumberFormat("ar-SA").format(comments)}
          </span>
        ) : null}
      </div>
    </motion.article>
  );
}

function TitleInput({ row, api }: { row: Row; api: DatabaseApi }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const commit = (value: string) => {
    api.clearJustCreated();
    if (value.trim() !== row.title) void api.updateRow(row.id, { title: value.trim() });
  };
  return (
    <textarea
      ref={ref}
      defaultValue={row.title}
      rows={1}
      placeholder="اكتب عنواناً…"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
        }
        if (e.key === "Escape") api.clearJustCreated();
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      className="block w-full resize-none bg-transparent text-[14px] font-medium leading-[1.45] outline-none [field-sizing:content] placeholder:text-fg-4"
    />
  );
}

function AddGroup({ api, prop }: { api: DatabaseApi; prop: PropertyDef }) {
  const [adding, setAdding] = useState(false);
  const add = trpc.database.addOption.useMutation({ onSuccess: () => api.refreshBundle() });
  return adding ? (
    <input
      autoFocus
      placeholder="اسم المجموعة…"
      onBlur={(e) => {
        if (e.target.value.trim()) add.mutate({ propertyId: prop.id, name: e.target.value.trim() });
        setAdding(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setAdding(false);
      }}
      className="h-8 w-[200px] shrink-0 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--navy-600)] outline-none"
    />
  ) : (
    <button onClick={() => setAdding(true)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover hover:text-fg-2">
      <Plus className="size-3.5" /> مجموعة جديدة
    </button>
  );
}

