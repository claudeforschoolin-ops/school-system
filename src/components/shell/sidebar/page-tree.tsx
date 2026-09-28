"use client";
/**
 * شجرة الصفحات في الشريط الجانبي مع السحب والإفلات على طراز Notion:
 *  - الإفلات في الثلث العلوي/السفلي: قبل/بعد العنصر (خط مؤشر).
 *  - الإفلات في المنتصف: داخل العنصر (صفحة فرعية).
 *  - الإفلات على عنوان مساحة/«خاص»: في جذر تلك المساحة.
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, CopyPlus, ExternalLink, FolderInput, Link2, MoreHorizontal, PenLine, Plus, Star, StarOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { positionBetween } from "@/lib/position";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/ui/icon";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { tabsActions } from "../tabs-store";
import { usePageActions } from "../use-page-actions";
import { HoverAction } from "./sidebar-group";
import { MoveToDialog } from "./move-to-dialog";

export type SidebarData = RouterOutputs["workspace"]["sidebar"];
export type TreePage = SidebarData["pages"][number];

type DropPosition = "before" | "after" | "inside";
interface DropIndicator {
  targetId: string;
  position: DropPosition;
}

interface TreeContextValue {
  pages: TreePage[];
  childrenOf: (parentId: string) => TreePage[];
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
  indicator: DropIndicator | null;
  activeDragId: string | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  favoriteIds: Set<string>;
  onMoveRequest: (page: TreePage) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);
const useTree = () => useContext(TreeContext)!;

const EXPANDED_KEY = "manassa:sidebar-expanded";

/** مزوّد السحب والإفلات لكل أشجار الشريط الجانبي */
export function PageTreeProvider({ data, children }: { data: SidebarData; children: ReactNode }) {
  const utils = trpc.useUtils();
  const move = trpc.page.move.useMutation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<TreePage | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* تجاهل */
    }
  }, []);

  const pages = data.pages;
  const byParent = useMemo(() => {
    const map = new Map<string, TreePage[]>();
    for (const p of pages) {
      const key = p.parentId ? `page:${p.parentId}` : p.teamspaceId ? `ts:${p.teamspaceId}` : "private";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [pages]);
  const childrenOf = useCallback((key: string) => byParent.get(key) ?? [], [byParent]);

  const toggle = useCallback((id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(id);
      if (shouldOpen) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        /* تجاهل */
      }
      return next;
    });
  }, []);

  // فتح أسلاف الصفحة الحالية تلقائياً
  useEffect(() => {
    const match = pathname.match(/^\/p\/([^/]+)/);
    if (!match) return;
    const byId = new Map(pages.map((p) => [p.id, p]));
    let current = byId.get(match[1]!);
    while (current?.parentId) {
      if (!expanded.has(current.parentId)) toggle(current.parentId, true);
      current = byId.get(current.parentId);
    }
  }, [pathname, pages, expanded, toggle]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const pointerY = useRef(0);

  const isDescendant = useCallback(
    (candidateId: string, ancestorId: string) => {
      const byId = new Map(pages.map((p) => [p.id, p]));
      let cur = byId.get(candidateId);
      while (cur?.parentId) {
        if (cur.parentId === ancestorId) return true;
        cur = byId.get(cur.parentId);
      }
      return false;
    },
    [pages],
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    pointerY.current = (e.activatorEvent as PointerEvent).clientY;
  };

  const onDragMove = (e: DragMoveEvent) => {
    const y = (e.activatorEvent as PointerEvent).clientY + e.delta.y;
    pointerY.current = y;
    const over = e.over;
    if (!over) return setIndicator(null);
    const overId = String(over.id);
    if (overId.startsWith("ts:") || overId === "private") return setIndicator({ targetId: overId, position: "inside" });
    const targetId = overId.replace(/^drop:/, "");
    if (targetId === e.active.id || isDescendant(targetId, String(e.active.id))) return setIndicator(null);
    const target = pages.find((p) => p.id === targetId);
    const ratio = (y - over.rect.top) / over.rect.height;
    let position: DropPosition = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
    if (position === "inside" && target?.kind !== "PAGE") position = ratio < 0.5 ? "before" : "after";
    setIndicator({ targetId, position });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const ind = indicator;
    setActiveDragId(null);
    setIndicator(null);
    const dragged = pages.find((p) => p.id === e.active.id);
    if (!ind || !dragged) return;

    let parentId: string | null = null;
    let teamspaceId: string | null = null;
    let beforeId: string | null = null;
    let afterId: string | null = null;

    if (ind.targetId.startsWith("ts:") || ind.targetId === "private") {
      teamspaceId = ind.targetId === "private" ? null : ind.targetId.slice(3);
      const siblings = childrenOf(ind.targetId).filter((p) => p.id !== dragged.id);
      beforeId = siblings[siblings.length - 1]?.id ?? null;
    } else {
      const target = pages.find((p) => p.id === ind.targetId);
      if (!target) return;
      if (ind.position === "inside") {
        parentId = target.id;
        teamspaceId = target.teamspaceId;
        const siblings = childrenOf(`page:${target.id}`).filter((p) => p.id !== dragged.id);
        beforeId = siblings[siblings.length - 1]?.id ?? null;
        toggle(target.id, true);
      } else {
        parentId = target.parentId;
        teamspaceId = target.teamspaceId;
        const key = target.parentId ? `page:${target.parentId}` : target.teamspaceId ? `ts:${target.teamspaceId}` : "private";
        const siblings = childrenOf(key).filter((p) => p.id !== dragged.id);
        const idx = siblings.findIndex((s) => s.id === target.id);
        if (ind.position === "before") {
          beforeId = siblings[idx - 1]?.id ?? null;
          afterId = target.id;
        } else {
          beforeId = target.id;
          afterId = siblings[idx + 1]?.id ?? null;
        }
      }
    }

    const posOf = (id: string | null) => (id ? (pages.find((p) => p.id === id)?.position ?? null) : null);
    const newPosition = positionBetween(posOf(beforeId), posOf(afterId));
    const snapshot = utils.workspace.sidebar.getData();
    utils.workspace.sidebar.setData(undefined, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) =>
              p.id === dragged.id ? { ...p, parentId, teamspaceId, ownerId: teamspaceId ? null : p.ownerId, position: newPosition } : p,
            ),
          }
        : old,
    );
    try {
      await move.mutateAsync({ pageId: dragged.id, parentId, teamspaceId, beforeId, afterId });
    } catch {
      utils.workspace.sidebar.setData(undefined, snapshot);
    } finally {
      void utils.workspace.sidebar.invalidate();
    }
  };

  const favoriteIds = useMemo(() => new Set(data.favorites.filter((f) => f.targetType === "PAGE").map((f) => f.targetId)), [data.favorites]);
  const dragged = activeDragId ? pages.find((p) => p.id === activeDragId) : null;

  return (
    <TreeContext.Provider
      value={{ pages, childrenOf, expanded, toggle, indicator, activeDragId, editingId, setEditingId, favoriteIds, onMoveRequest: setMoveTarget }}
    >
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setActiveDragId(null); setIndicator(null); }}>
        {children}
        <DragOverlay dropAnimation={{ duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" }}>
          {dragged ? (
            <motion.div
              initial={{ scale: 1, rotate: 0 }}
              animate={{ scale: 1.02, rotate: 2 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="flex h-7 w-[220px] items-center gap-2 rounded-md bg-elevated px-2 text-[14px] font-medium opacity-90 shadow-drag"
            >
              <PageIcon icon={dragged.icon} size={16} />
              <span className="truncate">{dragged.title || "بدون عنوان"}</span>
            </motion.div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <MoveToDialog page={moveTarget} data={data} onClose={() => setMoveTarget(null)} />
    </TreeContext.Provider>
  );
}

/** منطقة إفلات لجذر مساحة أو «خاص» (العنوان) */
export function RootDropZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  const { indicator, activeDragId } = useTree();
  const active = activeDragId && indicator?.targetId === id;
  return (
    <div ref={setNodeRef} className={cn("rounded-md transition-colors duration-[120ms]", active && "bg-teal-50 shadow-[inset_0_0_0_1px_var(--teal-500)]")}>
      {children}
    </div>
  );
}

export function PageTreeList({ parentKey, depth }: { parentKey: string; depth: number }) {
  const { childrenOf } = useTree();
  const items = childrenOf(parentKey);
  return (
    <div role="group">
      {items.map((page) => (
        <TreeItem key={page.id} page={page} depth={depth} />
      ))}
    </div>
  );
}

function TreeItem({ page, depth }: { page: TreePage; depth: number }) {
  const tree = useTree();
  const pathname = usePathname();
  const actions = usePageActions();
  const href = `/p/${page.id}`;
  const active = pathname === href;
  const children = tree.childrenOf(`page:${page.id}`);
  const isOpen = tree.expanded.has(page.id);
  const isFavorite = tree.favoriteIds.has(page.id);
  const editing = tree.editingId === page.id;

  const drag = useDraggable({ id: page.id });
  const drop = useDroppable({ id: `drop:${page.id}` });
  const setRefs = (node: HTMLDivElement | null) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };
  const ind = tree.indicator?.targetId === page.id ? tree.indicator.position : null;
  const indent = 8 + depth * 14;

  const addChild = async () => {
    tree.toggle(page.id, true);
    await actions.createPage({ parentId: page.id });
  };

  const menuItems = (Item: typeof ContextMenuItem | typeof MenuItemAdapter, Separator: () => ReactNode) => (
    <>
      <Item icon={<ExternalLink className="size-4" />} onSelect={() => tabsActions.open(href, { title: page.title || "بدون عنوان", icon: page.icon })}>
        فتح في تبويب جديد
      </Item>
      <Item icon={isFavorite ? <StarOff className="size-4" /> : <Star className="size-4" />} onSelect={() => void actions.toggleFavorite("PAGE", page.id)}>
        {isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
      </Item>
      <Item icon={<Link2 className="size-4" />} onSelect={() => actions.copyLink(href)}>
        نسخ الرابط
      </Item>
      {Separator()}
      <Item icon={<PenLine className="size-4" />} onSelect={() => tree.setEditingId(page.id)}>
        إعادة تسمية
      </Item>
      <Item icon={<CopyPlus className="size-4" />} onSelect={() => void actions.duplicatePage(page.id)}>
        نسخ الصفحة
      </Item>
      <Item icon={<FolderInput className="size-4" />} onSelect={() => tree.onMoveRequest(page)}>
        نقل إلى…
      </Item>
      {Separator()}
      <Item danger icon={<Trash2 className="size-4" />} onSelect={() => void actions.trashPage(page.id, { redirect: active })}>
        حذف
      </Item>
    </>
  );

  return (
    <div className="relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setRefs}
            {...drag.attributes}
            {...drag.listeners}
            role="treeitem"
            aria-expanded={children.length ? isOpen : undefined}
            aria-selected={active}
            className={cn(
              "group/item relative flex h-7 items-center gap-1 rounded-md pe-1 text-[14px] font-medium outline-none transition-colors duration-[120ms]",
              active ? "text-fg" : "text-fg-2 hover:bg-hover",
              drag.isDragging && "opacity-40",
              ind === "inside" && "bg-teal-50 shadow-[inset_0_0_0_1px_var(--teal-500)]",
            )}
            style={{ paddingInlineStart: indent }}
          >
            {active ? (
              <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-md bg-active" transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }} />
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                tree.toggle(page.id);
              }}
              className="relative grid size-5 shrink-0 place-items-center rounded-[4px] text-fg-3 hover:bg-active"
              aria-label={isOpen ? "طي" : "توسيع"}
              tabIndex={-1}
            >
              <span className={cn("transition-opacity duration-[120ms]", page.kind === "PAGE" && "group-hover/item:opacity-0")}>
                <PageIcon icon={page.icon} size={16} fallback={undefined} />
              </span>
              {page.kind === "PAGE" ? (
                <ChevronLeft
                  className={cn("absolute size-3.5 opacity-0 transition-[opacity,transform] duration-200 group-hover/item:opacity-100", isOpen && "-rotate-90")}
                />
              ) : null}
            </button>
            {editing ? (
              <RenameInput
                initial={page.title}
                onDone={(value) => {
                  tree.setEditingId(null);
                  if (value !== null && value !== page.title) void actions.rename(page.id, value);
                }}
              />
            ) : (
              <Link href={href} className="relative flex-1 truncate py-1" draggable={false} title={page.title || "بدون عنوان"}>
                {page.title || <span className="text-fg-3">بدون عنوان</span>}
              </Link>
            )}
            <div className="relative flex items-center gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/item:opacity-100 has-[[data-state=open]]:opacity-100">
              <Menu>
                <MenuTrigger asChild>
                  <button className="grid size-5 place-items-center rounded-[4px] text-fg-3 hover:bg-active hover:text-fg" aria-label="المزيد" onPointerDown={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="size-4" />
                  </button>
                </MenuTrigger>
                <MenuContent align="start">{menuItems(MenuItemAdapter, () => <MenuSeparator />)}</MenuContent>
              </Menu>
              {page.kind === "PAGE" ? (
                <HoverAction label="إضافة صفحة فرعية" onClick={() => void addChild()}>
                  <Plus className="size-4" />
                </HoverAction>
              ) : null}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>{menuItems(ContextMenuItem, () => <ContextMenuSeparator />)}</ContextMenuContent>
      </ContextMenu>

      {ind === "before" || ind === "after" ? (
        <span
          className={cn("pointer-events-none absolute h-[2px] rounded-full bg-teal-500", ind === "before" ? "-top-px" : "-bottom-px")}
          style={{ insetInlineStart: indent, insetInlineEnd: 4 }}
        />
      ) : null}

      <AnimatePresence initial={false}>
        {isOpen && page.kind === "PAGE" ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {children.length ? (
              <PageTreeList parentKey={`page:${page.id}`} depth={depth + 1} />
            ) : (
              <p className="flex h-7 items-center text-[13px] text-fg-3" style={{ paddingInlineStart: indent + 26 }}>
                لا توجد صفحات فرعية
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** توحيد واجهة عنصر القائمة المنسدلة مع عنصر قائمة النقر الأيمن */
function MenuItemAdapter({ children, icon, danger, onSelect }: { children: ReactNode; icon?: ReactNode; danger?: boolean; onSelect?: () => void }) {
  return (
    <MenuItem icon={icon} danger={danger} onSelect={onSelect}>
      {children}
    </MenuItem>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      defaultValue={initial}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(e.currentTarget.value.trim());
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={(e) => onDone(e.currentTarget.value.trim())}
      className="relative h-6 flex-1 rounded-[4px] bg-card px-1.5 text-[14px] shadow-[0_0_0_1px_var(--navy-600)] outline-none"
    />
  );
}

