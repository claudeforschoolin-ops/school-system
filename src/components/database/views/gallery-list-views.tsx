"use client";
/**
 * عرض المعرض (بطاقات بغلاف) وعرض القائمة (صفوف مبسطة).
 */
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import type { PropertyDef, ViewConfig } from "@/lib/database/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { coverStyle } from "@/components/page/page-header";
import { ValueDisplay } from "../property-display";
import type { DatabaseApi, Row } from "../use-database";

const CARD_W = { small: 200, medium: 250, large: 320 } as const;

export function GalleryView({ api, rows, config, visibleProps, onOpen }: { api: DatabaseApi; rows: Row[]; config: ViewConfig; visibleProps: PropertyDef[]; onOpen: (id: string) => void }) {
  const size = config.cardSize ?? "medium";
  const showCover = (config.cardPreview ?? "cover") === "cover";
  if (!rows.length && !api.canEdit) return <EmptyState illustration="table" title="لا توجد سجلات" />;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W[size]}px, 1fr))` }}>
      {rows.map((row, i) => (
        <motion.button
          key={row.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.18 }}
          onClick={() => onOpen(row.id)}
          className="overflow-hidden rounded-lg bg-card text-start shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover"
        >
          {showCover ? (
            <div className={cn("grid place-items-center", size === "small" ? "h-24" : size === "large" ? "h-44" : "h-32")} style={coverStyle(row.cover ?? "color:gray")}>
              {!row.cover && row.icon ? <PageIcon icon={row.icon} size={32} className="text-fg-3" /> : null}
            </div>
          ) : null}
          <div className="space-y-1.5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[14px] font-medium">
              {row.icon ? <PageIcon icon={row.icon} size={15} /> : null}
              <span className="truncate">{row.title || <span className="text-fg-3">بدون عنوان</span>}</span>
            </p>
            {visibleProps.map((p) => (
              <div key={p.id} className="flex min-h-5 items-center text-[13px] text-fg-2 empty:hidden">
                <ValueDisplay row={row} prop={p} ctx={api.ctx} users={api.users} compact />
              </div>
            ))}
          </div>
        </motion.button>
      ))}
      {api.canEdit ? (
        <button
          onClick={() => void api.createRow({})}
          className="flex min-h-[120px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[13px] text-fg-3 transition-colors hover:bg-hover hover:text-fg-2"
        >
          <Plus className="size-4" /> جديد
        </button>
      ) : null}
    </div>
  );
}

export function ListView({ api, rows, visibleProps, onOpen }: { api: DatabaseApi; rows: Row[]; config: ViewConfig; visibleProps: PropertyDef[]; onOpen: (id: string) => void }) {
  if (!rows.length && !api.canEdit) return <EmptyState illustration="table" title="لا توجد سجلات" />;
  return (
    <div>
      <ul className="divide-y divide-line/70">
        {rows.map((row) => (
          <li key={row.id}>
            <button onClick={() => onOpen(row.id)} className="flex min-h-10 w-full items-center gap-3 rounded-md px-2 text-start transition-colors hover:bg-hover">
              <PageIcon icon={row.icon} size={16} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{row.title || <span className="text-fg-3">بدون عنوان</span>}</span>
              <span className="flex shrink-0 items-center gap-3 text-[13px] text-fg-2">
                {visibleProps.slice(0, 4).map((p) => (
                  <span key={p.id} className="flex max-w-[180px] items-center empty:hidden">
                    <ValueDisplay row={row} prop={p} ctx={api.ctx} users={api.users} compact />
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {api.canEdit ? (
        <button onClick={() => void api.createRow({})} className="mt-1 flex h-9 items-center gap-1.5 px-2 text-[14px] text-fg-3 hover:text-fg-2">
          <Plus className="size-4" /> جديد
        </button>
      ) : null}
    </div>
  );
}
