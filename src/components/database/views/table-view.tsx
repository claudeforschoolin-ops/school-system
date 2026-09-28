"use client";
/**
 * عرض الجدول: TanStack Table + تمرير افتراضي للجداول الكبيرة.
 * تحرير مباشر للخلايا، تغيير عرض الأعمدة (RTL)، إعادة ترتيبها بالسحب، التجميع،
 * الحسابات في التذييل، والتحديد المتعدد مع إجراءات جماعية.
 */
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState, type Header } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Copy, ExternalLink, Link2, Maximize2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EMPTY_GROUP, GROUPABLE_TYPES, calculate, groupRows } from "@/lib/database/engine";
import { TITLE_KEY, type CalculationFn, type PropertyDef, type ViewConfig } from "@/lib/database/types";
import { formatMoney } from "@/lib/money";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { PageIcon } from "@/components/ui/icon";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Counter, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { EditableValue } from "../editable-value";
import { PropertyTypeIcon } from "../property-display";
import { NewPropertyMenu, PropertyMenu } from "../property-menu";
import type { DatabaseApi, Row } from "../use-database";

const ROW_HEIGHTS = { compact: 32, default: 36, tall: 48 } as const;
const GUTTER = 32;

function defaultWidth(p: PropertyDef): number {
  switch (p.type) {
    case "CHECKBOX":
      return 110;
    case "NUMBER":
    case "MONEY":
    case "DATE":
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return 150;
    case "TEXT":
    case "RELATION":
    case "FORMULA":
      return 220;
    default:
      return 180;
  }
}

interface TableProps {
  api: DatabaseApi;
  rows: Row[];
  config: ViewConfig;
  visibleProps: PropertyDef[];
  onConfig: (patch: Partial<ViewConfig>) => void;
  onOpen: (rowId: string) => void;
  onSort: (propertyId: string, direction: "asc" | "desc") => void;
  onFilterBy: (propertyId: string) => void;
  canConfigure: boolean;
  sorted: boolean;
}

export function TableView({ api, rows, config, visibleProps, onConfig, onOpen, onSort, onFilterBy, canConfigure }: TableProps) {
  const titleProp: PropertyDef = { id: TITLE_KEY, name: api.bundle?.database.titleLabel ?? "الاسم", type: "TEXT", config: {}, position: -1 };
  const [sizing, setSizing] = useState<ColumnSizingState>(config.columnWidths ?? {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rowHeight = ROW_HEIGHTS[config.rowHeight ?? "default"];
  const wrap = Boolean(config.wrapCells);

  useEffect(() => setSizing(config.columnWidths ?? {}), [config.columnWidths]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: TITLE_KEY, size: 300, minSize: 160, maxSize: 640 },
      ...visibleProps.map((p) => ({ id: p.id, size: defaultWidth(p), minSize: 90, maxSize: 640 })),
    ],
    [visibleProps],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    columnResizeDirection: "rtl",
    state: { columnSizing: sizing },
    onColumnSizingChange: setSizing,
  });

  // حفظ العرض عند انتهاء التحجيم
  const resizing = table.getState().columnSizingInfo.isResizingColumn;
  const wasResizing = useRef(false);
  useEffect(() => {
    if (wasResizing.current && !resizing && canConfigure) onConfig({ columnWidths: sizing });
    wasResizing.current = Boolean(resizing);
  }, [resizing, sizing, onConfig, canConfigure]);

  const headers = table.getHeaderGroups()[0]!.headers;
  const widths = Object.fromEntries(headers.map((h) => [h.column.id, h.getSize()]));
  const totalWidth = GUTTER + headers.reduce((sum, h) => sum + h.getSize(), 0) + 44;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onColumnDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = visibleProps.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    const hidden = api.properties.filter((p) => !ids.includes(p.id)).map((p) => p.id);
    onConfig({ propertyOrder: [...next, ...hidden] });
  };

  const groupProp = config.groupBy ? api.properties.find((p) => p.id === config.groupBy && GROUPABLE_TYPES.has(p.type)) : undefined;
  const groups = groupProp ? groupRows(rows, groupProp, api.ctx, { groupOrder: config.groupOrder }).filter((g) => g.rows.length > 0 || g.key !== EMPTY_GROUP) : null;
  const collapsed = new Set(config.collapsedGroups ?? []);

  const toggleSelect = (id: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="relative">
      <div className="thin-scroll overflow-x-auto pb-2">
        <div role="table" aria-rowcount={rows.length} style={{ minWidth: totalWidth }} className="text-[14px]">
          {/* الرأس */}
          <div role="row" className="sticky top-11 z-[3] flex h-9 border-b border-line bg-app">
            <div className="sticky start-0 z-[4] flex items-center justify-center bg-app" style={{ width: GUTTER }}>
              {api.canEdit ? (
                <Checkbox
                  size={14}
                  label="تحديد الكل"
                  checked={allSelected}
                  onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                  className={cn(!selected.size && "opacity-0 hover:opacity-100")}
                />
              ) : null}
            </div>
            <HeaderCell header={headers[0]!} prop={titleProp} api={api} sticky onSort={onSort} onFilterBy={onFilterBy} onHide={() => undefined} />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onColumnDrag}>
              <SortableContext items={visibleProps.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                {headers.slice(1).map((h) => {
                  const prop = visibleProps.find((p) => p.id === h.column.id)!;
                  return (
                    <HeaderCell
                      key={h.id}
                      header={h}
                      prop={prop}
                      api={api}
                      draggable={canConfigure}
                      onSort={onSort}
                      onFilterBy={onFilterBy}
                      onHide={() => onConfig({ hiddenProperties: [...(config.hiddenProperties ?? []), prop.id] })}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            {api.canEdit ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="grid w-11 shrink-0 place-items-center text-fg-3 transition-colors hover:bg-hover hover:text-fg" aria-label="إضافة خاصية" title="إضافة خاصية">
                    <Plus className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0">
                  <NewPropertyMenu api={api} />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          {/* الجسم */}
          {groups ? (
            groups.map((g) => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="mt-4 first:mt-2">
                  <button
                    onClick={() => onConfig({ collapsedGroups: isCollapsed ? [...collapsed].filter((k) => k !== g.key) : [...collapsed, g.key] })}
                    className="sticky start-0 flex h-9 items-center gap-2 px-1"
                  >
                    <ChevronLeft className={cn("size-4 text-fg-3 transition-transform duration-200", !isCollapsed && "-rotate-90")} />
                    <Tag color={g.key === EMPTY_GROUP ? "gray" : g.color}>{g.label}</Tag>
                    <Counter>{new Intl.NumberFormat("ar-SA").format(g.rows.length)}</Counter>
                  </button>
                  <AnimatePresence initial={false}>
                    {!isCollapsed ? (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-line">
                        <PlainRows api={api} rows={g.rows} visibleProps={visibleProps} widths={widths} rowHeight={rowHeight} wrap={wrap} onOpen={onOpen} selected={selected} onSelect={toggleSelect} />
                        <NewRowButton api={api} values={g.key === EMPTY_GROUP || !groupProp ? {} : groupValue(groupProp, g.key)} />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })
          ) : rows.length > 80 ? (
            <VirtualRows api={api} rows={rows} visibleProps={visibleProps} widths={widths} rowHeight={rowHeight} wrap={wrap} onOpen={onOpen} selected={selected} onSelect={toggleSelect} />
          ) : (
            <PlainRows api={api} rows={rows} visibleProps={visibleProps} widths={widths} rowHeight={rowHeight} wrap={wrap} onOpen={onOpen} selected={selected} onSelect={toggleSelect} />
          )}

          {!groups ? <NewRowButton api={api} values={{}} /> : null}

          {/* الحسابات */}
          <div role="row" className="flex h-9 border-t border-line text-[12px] text-fg-3">
            <div className="sticky start-0 z-[2] bg-app" style={{ width: GUTTER }} />
            <CalcCell api={api} rows={rows} prop={titleProp} width={widths[TITLE_KEY]!} fn={config.calculations?.[TITLE_KEY] ?? "count_all"} onChange={(fn) => onConfig({ calculations: { ...(config.calculations ?? {}), [TITLE_KEY]: fn } })} sticky />
            {visibleProps.map((p) => (
              <CalcCell key={p.id} api={api} rows={rows} prop={p} width={widths[p.id]!} fn={config.calculations?.[p.id] ?? "none"} onChange={(fn) => onConfig({ calculations: { ...(config.calculations ?? {}), [p.id]: fn } })} />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected.size ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-elevated p-1 shadow-popover"
          >
            <span className="px-2 text-[13px] font-medium">
              <NumberTicker value={selected.size} /> محدد
            </span>
            <button
              onClick={() => {
                void api.trashRows([...selected]);
                setSelected(new Set());
              }}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-danger-700 hover:bg-hover"
            >
              <Trash2 className="size-3.5" /> حذف
            </button>
            <button onClick={() => setSelected(new Set())} className="h-7 rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover">
              إلغاء التحديد
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function groupValue(prop: PropertyDef, key: string): Record<string, unknown> {
  if (prop.type === "SELECT" || prop.type === "STATUS") return { [prop.id]: key };
  if (prop.type === "CHECKBOX") return { [prop.id]: key === "true" };
  if (prop.type === "MULTI_SELECT" || prop.type === "PERSON") return { [prop.id]: [key] };
  return {};
}

function HeaderCell({
  header,
  prop,
  api,
  sticky,
  draggable,
  onSort,
  onFilterBy,
  onHide,
}: {
  header: Header<Row, unknown>;
  prop: PropertyDef;
  api: DatabaseApi;
  sticky?: boolean;
  draggable?: boolean;
  onSort: (propertyId: string, direction: "asc" | "desc") => void;
  onFilterBy: (propertyId: string) => void;
  onHide: () => void;
}) {
  const sortable = useSortable({ id: prop.id, disabled: !draggable || sticky });
  const [open, setOpen] = useState(false);
  return (
    <div
      ref={sticky ? undefined : sortable.setNodeRef}
      {...(sticky ? {} : sortable.attributes)}
      {...(sticky ? {} : sortable.listeners)}
      role="columnheader"
      style={{
        width: header.getSize(),
        transform: sticky ? undefined : CSS.Translate.toString(sortable.transform),
        transition: sticky ? undefined : sortable.transition,
      }}
      className={cn(
        "group/h relative flex shrink-0 items-center border-e border-line/70 bg-app",
        sticky && "sticky z-[4]",
        sortable.isDragging && "z-10 opacity-80 shadow-drag",
      )}
    >
      {sticky ? <span className="absolute inset-y-0 -start-8 w-8 bg-app" aria-hidden /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-[13px] font-medium text-fg-3 transition-colors hover:bg-hover hover:text-fg-2">
            <PropertyTypeIcon type={prop.id === TITLE_KEY ? "TITLE" : prop.type} />
            <span className="truncate">{prop.name}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0">
          <PropertyMenu
            api={api}
            prop={prop}
            onClose={() => setOpen(false)}
            onSort={(d) => {
              onSort(prop.id, d);
              setOpen(false);
            }}
            onFilter={() => {
              onFilterBy(prop.id);
              setOpen(false);
            }}
            onHide={() => {
              onHide();
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          header.getResizeHandler()(e);
        }}
        onDoubleClick={() => header.column.resetSize()}
        className={cn("absolute inset-y-0 -end-[3px] z-[5] w-[5px] cursor-col-resize rounded-full transition-colors hover:bg-teal-500/60", header.column.getIsResizing() && "bg-teal-500")}
        aria-hidden
      />
    </div>
  );
}

interface RowsProps {
  api: DatabaseApi;
  rows: Row[];
  visibleProps: PropertyDef[];
  widths: Record<string, number>;
  rowHeight: number;
  wrap: boolean;
  onOpen: (rowId: string) => void;
  selected: Set<string>;
  onSelect: (id: string, v: boolean) => void;
}

function PlainRows(props: RowsProps) {
  return (
    <div role="rowgroup">
      <AnimatePresence initial={false}>
        {props.rows.map((row) => (
          <motion.div
            key={row.id}
            initial={props.api.justCreated === row.id ? { opacity: 0, height: 0 } : false}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <TableRow {...props} row={row} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function VirtualRows(props: RowsProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const scrollEl = typeof document !== "undefined" ? document.getElementById("main-scroll") : null;
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const sc = document.getElementById("main-scroll");
    if (el && sc) setMargin(el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop);
  }, []);
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => props.rowHeight,
    overscan: 12,
    scrollMargin: margin,
  });
  return (
    <div ref={bodyRef} role="rowgroup" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = props.rows[item.index]!;
        return (
          <div key={row.id} style={{ position: "absolute", top: 0, insetInlineStart: 0, width: "100%", transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}>
            <TableRow {...props} row={row} />
          </div>
        );
      })}
    </div>
  );
}

const TableRow = memo(function TableRow({ api, row, visibleProps, widths, rowHeight, wrap, onOpen, selected, onSelect }: RowsProps & { row: Row }) {
  const router = useRouter();
  const isSelected = selected.has(row.id);
  const comments = api.commentCounts[row.id] ?? 0;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="row" className={cn("group/row flex border-b border-line/70 transition-colors duration-[120ms] hover:bg-hover/50", isSelected && "bg-navy-50 hover:bg-navy-50")} style={{ minHeight: rowHeight }}>
          <div className="sticky start-0 z-[2] flex items-center justify-center bg-app group-hover/row:bg-inherit" style={{ width: GUTTER }}>
            {api.canEdit ? <Checkbox size={14} checked={isSelected} onChange={(v) => onSelect(row.id, v)} label="تحديد" className={cn(!isSelected && "opacity-0 group-hover/row:opacity-100")} /> : null}
          </div>
          <div role="cell" className="sticky start-8 z-[2] flex shrink-0 items-center gap-1.5 border-e border-line/70 bg-app px-2 group-hover/row:bg-[color-mix(in_srgb,var(--bg-hover)_50%,var(--bg-app))]" style={{ width: widths[TITLE_KEY] }}>
            {row.icon ? <PageIcon icon={row.icon} size={16} /> : null}
            <TitleCell api={api} row={row} wrap={wrap} />
            {comments ? (
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-fg-3">
                <MessageSquare className="size-3" />
                {new Intl.NumberFormat("ar-SA").format(comments)}
              </span>
            ) : null}
            <button
              onClick={() => onOpen(row.id)}
              className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-card px-1.5 text-[12px] font-medium text-fg-2 opacity-0 shadow-[0_0_0_1px_var(--border)] transition-opacity hover:bg-hover group-hover/row:opacity-100"
            >
              <Maximize2 className="size-3" /> فتح
            </button>
          </div>
          {visibleProps.map((p) => (
            <div key={p.id} role="cell" className="flex shrink-0 items-stretch border-e border-line/70" style={{ width: widths[p.id] }}>
              <EditableValue api={api} row={row} prop={p} wrap={wrap} className={cn("w-full px-2 py-1 text-[14px] text-fg", !wrap && "overflow-hidden")} />
            </div>
          ))}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<Maximize2 className="size-4" />} onSelect={() => onOpen(row.id)}>
          فتح في معاينة جانبية
        </ContextMenuItem>
        <ContextMenuItem icon={<ExternalLink className="size-4" />} onSelect={() => router.push(`/r/${row.id}`)}>
          فتح كصفحة كاملة
        </ContextMenuItem>
        <ContextMenuItem
          icon={<Link2 className="size-4" />}
          onSelect={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/r/${row.id}`);
            toast.success("نُسخ الرابط");
          }}
        >
          نسخ الرابط
        </ContextMenuItem>
        {api.canEdit ? (
          <>
            <ContextMenuItem icon={<Copy className="size-4" />} onSelect={() => void api.duplicateRow(row.id)}>
              تكرار
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => void api.trashRows([row.id])}>
              حذف
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});

function TitleCell({ api, row, wrap }: { api: DatabaseApi; row: Row; wrap: boolean }) {
  const [editing, setEditing] = useState(api.justCreated === row.id);
  const ref = useRef<HTMLInputElement>(null);
  // السجل المُنشأ للتو يفتح عنوانه للتحرير مباشرة
  const [seenCreated, setSeenCreated] = useState(api.justCreated);
  if (api.justCreated !== seenCreated) {
    setSeenCreated(api.justCreated);
    if (api.justCreated === row.id) setEditing(true);
  }
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  const commit = (value: string) => {
    setEditing(false);
    if (api.justCreated === row.id) api.clearJustCreated();
    if (value.trim() !== row.title) void api.updateRow(row.id, { title: value.trim() });
  };
  if (editing && api.canEdit) {
    return (
      <input
        ref={ref}
        defaultValue={row.title}
        placeholder="بدون عنوان"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 min-w-0 flex-1 rounded bg-card px-1 text-[14px] font-medium shadow-[0_0_0_1px_var(--navy-600)] outline-none"
      />
    );
  }
  return (
    <span
      onClick={() => api.canEdit && setEditing(true)}
      className={cn("min-w-0 flex-1 cursor-text py-1 font-medium", wrap ? "whitespace-normal break-words" : "truncate", !row.title && "text-fg-4")}
    >
      {row.title || "بدون عنوان"}
    </span>
  );
}

function NewRowButton({ api, values }: { api: DatabaseApi; values: Record<string, unknown> }) {
  if (!api.canEdit) return null;
  return (
    <button onClick={() => void api.createRow({ values })} className="sticky start-0 flex h-9 items-center gap-1.5 px-2 text-[14px] text-fg-3 transition-colors hover:text-fg-2">
      <Plus className="size-4" /> جديد
    </button>
  );
}

const CALC_LABELS: Record<CalculationFn, string> = {
  none: "بدون",
  count_all: "العدد",
  count_values: "عدد القيم",
  count_empty: "الفارغ",
  percent_empty: "نسبة الفارغ",
  sum: "المجموع",
  average: "المتوسط",
  min: "الأدنى",
  max: "الأعلى",
  checked: "المحدَّد",
  percent_checked: "نسبة المحدَّد",
};

function calcOptions(prop: PropertyDef): CalculationFn[] {
  const base: CalculationFn[] = ["none", "count_all", "count_values", "count_empty", "percent_empty"];
  if (prop.type === "NUMBER" || prop.type === "MONEY" || prop.type === "FORMULA" || prop.type === "ROLLUP") return [...base, "sum", "average", "min", "max"];
  if (prop.type === "CHECKBOX") return ["none", "count_all", "checked", "percent_checked"];
  return base;
}

function CalcCell({ api, rows, prop, width, fn, onChange, sticky }: { api: DatabaseApi; rows: Row[]; prop: PropertyDef; width: number; fn: CalculationFn; onChange: (fn: CalculationFn) => void; sticky?: boolean }) {
  const prefs = usePrefs();
  const value = calculate(rows, prop.id === TITLE_KEY ? undefined : prop, fn, api.ctx);
  let text = "";
  if (value !== null) {
    if (fn.startsWith("percent")) text = formatPercent(value, prefs.digits, 1);
    else if (prop.type === "MONEY" && ["sum", "average", "min", "max"].includes(fn)) text = formatMoney(Math.round(value), { currency: prop.config.currency ?? api.ctx.defaultCurrency ?? "SAR", digits: prefs.digits });
    else text = formatNumber(Math.round(value * 100) / 100, prefs.digits);
  }
  return (
    <div className={cn("group/calc flex shrink-0 items-center justify-end", sticky && "sticky start-8 z-[2] bg-app")} style={{ width }}>
      <Menu>
        <MenuTrigger asChild>
          <button className={cn("flex h-full items-center gap-1.5 px-2 transition-colors hover:bg-hover", fn === "none" && "opacity-0 group-hover/calc:opacity-100")}>
            {fn === "none" ? "احسب" : <span className="text-fg-3">{CALC_LABELS[fn]}</span>}
            {text ? <span className="tabular font-medium text-fg-2">{text}</span> : null}
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          {calcOptions(prop).map((f) => (
            <MenuItem key={f} onSelect={() => onChange(f)}>
              {CALC_LABELS[f]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}
