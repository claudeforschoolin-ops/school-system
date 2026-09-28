"use client";
/**
 * إعدادات العرض: النوع، الخصائص المرئية وترتيبها، التجميع، التواريخ، البطاقات، ارتفاع الصفوف، التصدير.
 */
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, Eye, EyeOff, FileSpreadsheet, GripVertical, Printer, SlidersHorizontal } from "lucide-react";
import { GROUPABLE_TYPES, displayText, orderedProperties } from "@/lib/database/engine";
import { TITLE_KEY, VIEW_TYPES, VIEW_TYPE_LABELS, type PropertyDef, type RowRecord, type ViewConfig, type ViewType } from "@/lib/database/types";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { PropertyTypeIcon } from "./property-display";
import { ViewTypeIcon } from "./view-tabs";
import type { DatabaseApi, ViewRecord } from "./use-database";

export function ViewSettingsButton({
  api,
  view,
  config,
  onConfig,
  onType,
  canEditView,
  visibleRows,
  title,
}: {
  api: DatabaseApi;
  view: ViewRecord;
  config: ViewConfig;
  onConfig: (patch: Partial<ViewConfig>) => void;
  onType: (type: ViewType) => void;
  canEditView: boolean;
  visibleRows: RowRecord[];
  title: string;
}) {
  const props = orderedProperties(api.properties, config.propertyOrder);
  const hidden = new Set(config.hiddenProperties ?? []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const groupable = api.properties.filter((p) => GROUPABLE_TYPES.has(p.type));
  const dates = api.properties.filter((p) => p.type === "DATE" || p.type === "CREATED_TIME" || p.type === "UPDATED_TIME");

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = props.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    onConfig({ propertyOrder: next });
  };

  const exportCsv = () => {
    const visible = props.filter((p) => !hidden.has(p.id));
    const header = ["العنوان", ...visible.map((p) => p.name)];
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [header.map(escape).join(",")];
    for (const row of visibleRows) lines.push([row.title, ...visible.map((p) => displayText(row, p, api.ctx))].map(escape).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title || "قاعدة بيانات"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("تم تصدير CSV");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="grid size-7 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover hover:text-fg" aria-label="إعدادات العرض" title="إعدادات العرض">
          <SlidersHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="thin-scroll max-h-[70vh] w-[320px] overflow-y-auto p-0">
        <div className="border-b border-line p-3">
          <p className="mb-2 text-[12px] font-medium text-fg-3">التخطيط</p>
          <div className="grid grid-cols-3 gap-1.5">
            {VIEW_TYPES.map((t) => (
              <button
                key={t}
                disabled={!canEditView}
                onClick={() => onType(t)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-2 text-[12px] transition-colors disabled:opacity-50",
                  view.type === t ? "bg-teal-50 text-teal-700 shadow-[0_0_0_1px_var(--teal-500)]" : "text-fg-2 hover:bg-hover",
                )}
              >
                <ViewTypeIcon type={t} className="size-4" />
                {VIEW_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-b border-line p-3 text-[13px]">
          {view.type === "BOARD" || view.type === "TABLE" || view.type === "LIST" || view.type === "GALLERY" ? (
            <Row label={view.type === "BOARD" ? "التجميع حسب" : "التجميع"}>
              <Select
                size="sm"
                className="w-[150px]"
                value={config.groupBy ?? "__none__"}
                onChange={(v) => onConfig({ groupBy: v === "__none__" ? null : v })}
                options={[...(view.type === "BOARD" ? [] : [{ value: "__none__", label: "بدون تجميع" }]), ...groupable.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Row>
          ) : null}
          {view.type === "CALENDAR" || view.type === "TIMELINE" ? (
            <Row label={view.type === "TIMELINE" ? "تاريخ البداية" : "العرض حسب"}>
              <Select size="sm" className="w-[150px]" value={config.dateProperty ?? undefined} onChange={(v) => onConfig({ dateProperty: v })} options={dates.map((p) => ({ value: p.id, label: p.name }))} placeholder="اختر خاصية تاريخ" />
            </Row>
          ) : null}
          {view.type === "TIMELINE" ? (
            <Row label="تاريخ النهاية">
              <Select
                size="sm"
                className="w-[150px]"
                value={config.endDateProperty ?? "__same__"}
                onChange={(v) => onConfig({ endDateProperty: v === "__same__" ? null : v })}
                options={[{ value: "__same__", label: "نطاق خاصية البداية" }, ...dates.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Row>
          ) : null}
          {view.type === "TABLE" ? (
            <>
              <Row label="ارتفاع الصفوف">
                <Select
                  size="sm"
                  className="w-[150px]"
                  value={config.rowHeight ?? "default"}
                  onChange={(v) => onConfig({ rowHeight: v as ViewConfig["rowHeight"] })}
                  options={[
                    { value: "compact", label: "مضغوط" },
                    { value: "default", label: "افتراضي" },
                    { value: "tall", label: "مريح" },
                  ]}
                />
              </Row>
              <Row label="التفاف النص في الخلايا">
                <Switch size="sm" checked={Boolean(config.wrapCells)} onChange={(v) => onConfig({ wrapCells: v })} />
              </Row>
            </>
          ) : null}
          {view.type === "GALLERY" || view.type === "BOARD" ? (
            <>
              <Row label="معاينة البطاقة">
                <Select
                  size="sm"
                  className="w-[150px]"
                  value={config.cardPreview ?? (view.type === "GALLERY" ? "cover" : "none")}
                  onChange={(v) => onConfig({ cardPreview: v as ViewConfig["cardPreview"] })}
                  options={[
                    { value: "none", label: "بدون" },
                    { value: "cover", label: "صورة الغلاف" },
                  ]}
                />
              </Row>
              <Row label="حجم البطاقة">
                <Select
                  size="sm"
                  className="w-[150px]"
                  value={config.cardSize ?? "medium"}
                  onChange={(v) => onConfig({ cardSize: v as ViewConfig["cardSize"] })}
                  options={[
                    { value: "small", label: "صغير" },
                    { value: "medium", label: "متوسط" },
                    { value: "large", label: "كبير" },
                  ]}
                />
              </Row>
            </>
          ) : null}
          <Row label="فتح السجلات في">
            <Select
              size="sm"
              className="w-[150px]"
              value={config.openIn ?? "peek"}
              onChange={(v) => onConfig({ openIn: v as ViewConfig["openIn"] })}
              options={[
                { value: "peek", label: "معاينة جانبية" },
                { value: "page", label: "صفحة كاملة" },
              ]}
            />
          </Row>
        </div>

        <div className="border-b border-line p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[12px] font-medium text-fg-3">الخصائص</p>
            <div className="flex gap-2 text-[12px]">
              <button className="text-fg-3 hover:text-fg" onClick={() => onConfig({ hiddenProperties: [] })}>
                إظهار الكل
              </button>
              <button className="text-fg-3 hover:text-fg" onClick={() => onConfig({ hiddenProperties: api.properties.map((p) => p.id) })}>
                إخفاء الكل
              </button>
            </div>
          </div>
          <div className="flex h-8 items-center gap-2 px-1 text-[13px] text-fg-3">
            <PropertyTypeIcon type="TITLE" /> العنوان (ظاهر دائماً)
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={props.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {props.map((p) => (
                <SortableProp
                  key={p.id}
                  prop={p}
                  hidden={hidden.has(p.id)}
                  onToggle={() =>
                    onConfig({ hiddenProperties: hidden.has(p.id) ? [...hidden].filter((x) => x !== p.id) : [...hidden, p.id] })
                  }
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="p-1.5">
          <button onClick={exportCsv} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover">
            <Download className="size-4 text-fg-2" /> تصدير CSV (العرض الحالي)
          </button>
          <a href={`/api/export/database?databaseId=${api.databaseId}&viewId=${view.id}`} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover">
            <FileSpreadsheet className="size-4 text-fg-2" /> تصدير Excel بترويسة المدرسة
          </a>
          <button onClick={() => window.print()} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover">
            <Printer className="size-4 text-fg-2" /> طباعة / حفظ PDF
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-2">{label}</span>
      {children}
    </div>
  );
}

function SortableProp({ prop, hidden, onToggle }: { prop: PropertyDef; hidden: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prop.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex h-8 items-center gap-2 rounded-md px-1 text-[13px] hover:bg-hover", isDragging && "z-10 bg-elevated shadow-drag")}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-fg-4 hover:text-fg-3 active:cursor-grabbing" aria-label="إعادة الترتيب">
        <GripVertical className="size-3.5" />
      </button>
      <PropertyTypeIcon type={prop.id === TITLE_KEY ? "TITLE" : prop.type} />
      <span className={cn("flex-1 truncate", hidden && "text-fg-3")}>{prop.name}</span>
      <button onClick={onToggle} className="grid size-6 place-items-center rounded text-fg-3 hover:text-fg" aria-label={hidden ? "إظهار" : "إخفاء"}>
        {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}
