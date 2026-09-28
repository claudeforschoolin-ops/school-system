"use client";
/**
 * قيمة قابلة للتحرير: تعرض القيمة، وعند النقر تفتح محررها في نافذة منبثقة.
 */
import { useState, type ReactNode } from "react";
import { COMPUTED_TYPES, type PropertyDef, type RowRecord } from "@/lib/database/types";
import { rawValue } from "@/lib/database/engine";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ValueDisplay } from "./property-display";
import { ValueEditor } from "./property-editors";
import type { DatabaseApi } from "./use-database";

export function EditableValue({
  api,
  row,
  prop,
  className,
  wrap,
  placeholder,
  compact,
}: {
  api: DatabaseApi;
  row: RowRecord;
  prop: PropertyDef;
  className?: string;
  wrap?: boolean;
  placeholder?: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const readOnly = !api.canEdit || COMPUTED_TYPES.has(prop.type) || Boolean(prop.config.systemReadOnly);
  const display = <ValueDisplay row={row} prop={prop} ctx={api.ctx} users={api.users} wrap={wrap} compact={compact} />;
  const commit = (value: unknown) => void api.updateRow(row.id, { values: { [prop.id]: value } });

  if (prop.type === "CHECKBOX") {
    return (
      <div className={cn("flex items-center", className)}>
        <Checkbox checked={rawValue(row, prop) === true} disabled={readOnly} onChange={(v) => commit(v)} label={prop.name} />
      </div>
    );
  }
  if (readOnly) return <div className={cn("flex min-w-0 items-center", className)}>{display}</div>;

  const empty = rawValue(row, prop) === undefined || rawValue(row, prop) === null || (Array.isArray(rawValue(row, prop)) && (rawValue(row, prop) as unknown[]).length === 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn("flex min-w-0 cursor-pointer items-center outline-none", className)}
        >
          {empty && placeholder ? <span className="text-fg-4">{placeholder}</span> : display}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={2} className="p-0" onClick={(e) => e.stopPropagation()}>
        <ValueEditor
          prop={prop}
          row={row}
          value={rawValue(row, prop)}
          users={api.users}
          defaultCurrency={api.ctx.defaultCurrency ?? "SAR"}
          onChange={commit}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
