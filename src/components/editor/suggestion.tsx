"use client";
/**
 * نافذة الاقتراحات المشتركة لقائمة الشرطة المائلة «/» والإشارات «@».
 * مخزن صغير لكل محرر + عارض يُمرَّر لإضافة Suggestion في Tiptap.
 */
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface SuggestionItemBase {
  id: string;
  label: string;
  group?: string;
}

export interface SuggestionState<T extends SuggestionItemBase> {
  open: boolean;
  items: T[];
  index: number;
  rect: DOMRect | null;
  query: string;
  select: (item: T) => void;
}

export class SuggestionStore<T extends SuggestionItemBase> {
  private state: SuggestionState<T> = { open: false, items: [], index: 0, rect: null, query: "", select: () => undefined };
  private listeners = new Set<() => void>();
  get = () => this.state;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  set(patch: Partial<SuggestionState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}

/** عارض يربط أحداث Tiptap Suggestion بالمخزن */
export function suggestionRenderer<T extends SuggestionItemBase>(store: SuggestionStore<T>) {
  return () => ({
    onStart: (props: SuggestionProps<T>) => {
      store.set({
        open: true,
        items: props.items,
        index: 0,
        query: props.query,
        rect: props.clientRect?.() ?? null,
        select: (item: T) => props.command(item),
      });
    },
    onUpdate: (props: SuggestionProps<T>) => {
      store.set({
        items: props.items,
        index: 0,
        query: props.query,
        rect: props.clientRect?.() ?? null,
        select: (item: T) => props.command(item),
      });
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      const s = store.get();
      if (!s.open) return false;
      if (event.key === "ArrowDown") {
        store.set({ index: s.items.length ? (s.index + 1) % s.items.length : 0 });
        return true;
      }
      if (event.key === "ArrowUp") {
        store.set({ index: s.items.length ? (s.index - 1 + s.items.length) % s.items.length : 0 });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = s.items[s.index];
        if (item) s.select(item);
        return true;
      }
      if (event.key === "Escape") {
        store.set({ open: false });
        return true;
      }
      return false;
    },
    onExit: () => store.set({ open: false, items: [] }),
  });
}

export function SuggestionPopup<T extends SuggestionItemBase>({
  store,
  renderItem,
  empty,
  width = 300,
}: {
  store: SuggestionStore<T>;
  renderItem: (item: T, active: boolean) => ReactNode;
  empty: string;
  width?: number;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${state.index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [state.index]);

  if (typeof document === "undefined") return null;
  const rect = state.rect;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const top = rect ? (rect.bottom + 330 > viewportH ? Math.max(8, rect.top - 330) : rect.bottom + 6) : 0;
  // في RTL نحاذي الحافة اليمنى للنافذة مع المؤشر
  const right = rect ? Math.max(8, window.innerWidth - rect.right) : 0;

  let lastGroup: string | undefined;
  return createPortal(
    <AnimatePresence>
      {state.open && rect ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed z-[70] overflow-hidden rounded-[10px] bg-elevated shadow-popover"
          style={{ top, right, width }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div ref={listRef} className="thin-scroll max-h-[320px] overflow-y-auto p-1">
            {state.items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-fg-3">{empty}</p>
            ) : (
              state.items.map((item, i) => {
                const header = item.group && item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <div key={item.id}>
                    {header ? <p className="px-2 pb-1 pt-2 text-[12px] font-medium text-fg-3">{header}</p> : null}
                    <button
                      data-index={i}
                      onClick={() => state.select(item)}
                      onMouseEnter={() => store.set({ index: i })}
                      className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start", i === state.index && "bg-hover")}
                    >
                      {renderItem(item, i === state.index)}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
