"use client";
/**
 * شريط عروض قاعدة البيانات: تبويبات بأيقونة + اسم، والتبويب النشط بخلفية رمادية مستديرة،
 * وزر «+» لإضافة عرض، وقائمة لكل عرض (إعادة تسمية، نسخ، حذف، شخصي/مشترك).
 */
import { CalendarDays, ChartGantt, ChevronDown, Copy, LayoutGrid, List, Lock, Pencil, Plus, SquareKanban, Table2, Trash2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { VIEW_TYPES, VIEW_TYPE_LABELS, type ViewType } from "@/lib/database/types";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { DatabaseApi, ViewRecord } from "./use-database";

const ICONS: Record<ViewType, typeof Table2> = {
  TABLE: Table2,
  BOARD: SquareKanban,
  CALENDAR: CalendarDays,
  TIMELINE: ChartGantt,
  GALLERY: LayoutGrid,
  LIST: List,
};

export function ViewTypeIcon({ type, className }: { type: ViewType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={cn("size-4 shrink-0", className)} strokeWidth={1.8} />;
}

export function ViewTabs({
  api,
  views,
  activeId,
  onSelect,
  layoutKey,
}: {
  api: DatabaseApi;
  views: ViewRecord[];
  activeId: string;
  onSelect: (id: string) => void;
  layoutKey: string;
}) {
  const utils = trpc.useUtils();
  const create = trpc.database.createView.useMutation({
    onSuccess: async (v) => {
      await api.refreshBundle();
      onSelect(v.id);
    },
  });
  const update = trpc.database.updateView.useMutation({ onSuccess: () => api.refreshBundle() });
  const duplicate = trpc.database.duplicateView.useMutation({
    onSuccess: async (v) => {
      await api.refreshBundle();
      onSelect(v.id);
    },
  });
  const remove = trpc.database.deleteView.useMutation({
    onSuccess: async () => {
      await api.refreshBundle();
      const next = views.find((v) => v.id !== activeId);
      if (next) onSelect(next.id);
    },
  });
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="thin-scroll flex min-w-0 items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="عروض قاعدة البيانات">
      {views.map((view) => {
        const active = view.id === activeId;
        return (
          <div key={view.id} className="relative shrink-0">
            {active ? <motion.span layoutId={`view-tab-${layoutKey}`} className="absolute inset-0 rounded-md bg-active" transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }} /> : null}
            {renaming === view.id ? (
              <input
                autoFocus
                defaultValue={view.name}
                onBlur={(e) => {
                  setRenaming(null);
                  if (e.target.value.trim() && e.target.value !== view.name) {
                    utils.database.bundle.setData({ databaseId: api.databaseId }, (old) => (old ? { ...old, views: old.views.map((v) => (v.id === view.id ? { ...v, name: e.target.value } : v)) } : old));
                    update.mutate({ viewId: view.id, name: e.target.value.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="relative h-7 w-32 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--navy-600)] outline-none"
              />
            ) : (
              <Menu>
                <div className="relative flex items-center">
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSelect(view.id)}
                    onDoubleClick={() => api.canEdit && setRenaming(view.id)}
                    className={cn("relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[14px] font-medium transition-colors", active ? "text-fg" : "text-fg-3 hover:bg-hover hover:text-fg-2")}
                  >
                    <ViewTypeIcon type={view.type} />
                    <span className="max-w-[160px] truncate">{view.name}</span>
                    {view.isPersonal ? <Lock className="size-3 text-fg-3" /> : null}
                  </button>
                  {active ? (
                    <MenuTrigger asChild>
                      <button className="relative -ms-1 grid size-5 place-items-center rounded text-fg-3 hover:text-fg" aria-label="خيارات العرض">
                        <ChevronDown className="size-3.5" />
                      </button>
                    </MenuTrigger>
                  ) : null}
                </div>
                <MenuContent>
                  <MenuItem icon={<Pencil className="size-4" />} disabled={!api.canEdit && !view.isPersonal} onSelect={() => setRenaming(view.id)}>
                    إعادة تسمية
                  </MenuItem>
                  <MenuItem icon={<Copy className="size-4" />} disabled={!api.canEdit} onSelect={() => duplicate.mutate({ viewId: view.id })}>
                    نسخ العرض
                  </MenuItem>
                  {api.canEdit ? (
                    <MenuItem icon={view.isPersonal ? <Users className="size-4" /> : <Lock className="size-4" />} onSelect={() => update.mutate({ viewId: view.id, isPersonal: !view.isPersonal })}>
                      {view.isPersonal ? "جعله مشتركاً للجميع" : "جعله عرضاً شخصياً"}
                    </MenuItem>
                  ) : null}
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 className="size-4" />} disabled={(!api.canEdit && !view.isPersonal) || views.length <= 1} onSelect={() => remove.mutate({ viewId: view.id })}>
                    حذف العرض
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </div>
        );
      })}
      <Menu>
        <MenuTrigger asChild>
          <button className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg" aria-label="إضافة عرض" title="إضافة عرض">
            <Plus className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>{api.canEdit ? "عرض جديد" : "عرض شخصي جديد"}</MenuLabel>
          {VIEW_TYPES.map((t) => (
            <MenuItem key={t} icon={<ViewTypeIcon type={t} />} onSelect={() => create.mutate({ databaseId: api.databaseId, type: t, isPersonal: !api.canEdit })}>
              {VIEW_TYPE_LABELS[t]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}
