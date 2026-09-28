"use client";
/**
 * إعدادات الخاصية: الاسم، النوع، الخيارات وألوانها، تنسيق الأرقام، العملة، العلاقة، التجميع، المعادلة.
 */
import { ArrowDownWideNarrow, ArrowUpNarrowWide, EyeOff, Filter, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import { evaluateFormula } from "@/lib/database/formula";
import {
  OPTION_COLORS,
  OPTION_COLOR_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  ROLLUP_LABELS,
  TITLE_KEY,
  type OptionColor,
  type PropertyConfig,
  type PropertyDef,
  type PropertyType,
  type RollupFn,
  type SelectOption,
} from "@/lib/database/types";
import { shortId } from "@/lib/database/defaults";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { PropertyTypeIcon } from "./property-display";
import type { DatabaseApi } from "./use-database";

const CURRENCIES = ["SAR", "AED", "KWD", "BHD", "QAR", "OMR", "EGP", "JOD", "USD", "EUR"];

export function PropertyMenu({
  api,
  prop,
  onSort,
  onFilter,
  onHide,
  onClose,
}: {
  api: DatabaseApi;
  prop: PropertyDef;
  onSort?: (direction: "asc" | "desc") => void;
  onFilter?: () => void;
  onHide?: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.database.updateProperty.useMutation({ onSuccess: () => Promise.all([api.refreshBundle(), api.refetchRows()]) });
  const remove = trpc.database.deleteProperty.useMutation({
    onSuccess: async () => {
      await api.refreshBundle();
      onClose();
    },
  });
  const [name, setName] = useSyncedState(prop.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isTitle = prop.id === TITLE_KEY;
  const canEdit = api.canEdit && !isTitle;

  const saveConfig = (patch: Partial<PropertyConfig>) => {
    // تحديث تفاؤلي للحزمة
    utils.database.bundle.setData({ databaseId: api.databaseId }, (old) =>
      old ? { ...old, properties: old.properties.map((p) => (p.id === prop.id ? { ...p, config: { ...p.config, ...patch } } : p)) } : old,
    );
    update.mutate({ propertyId: prop.id, config: { ...prop.config, ...patch } as Record<string, unknown> });
  };

  return (
    <div className="w-[300px]">
      <div className="border-b border-line p-2">
        <div className="flex items-center gap-2 rounded-md bg-hover px-2">
          <PropertyTypeIcon type={isTitle ? "TITLE" : prop.type} />
          <input
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== prop.name && update.mutate({ propertyId: prop.id, name })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-8 min-w-0 flex-1 bg-transparent text-[14px] outline-none disabled:opacity-80"
            aria-label="اسم الخاصية"
          />
        </div>
      </div>

      {canEdit ? (
        <div className="space-y-3 border-b border-line p-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-3">النوع</span>
            <Select
              size="sm"
              value={prop.type}
              onChange={(t) => update.mutate({ propertyId: prop.id, type: t as PropertyType })}
              options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))}
            />
          </label>
          <TypeConfig api={api} prop={prop} onSave={saveConfig} />
        </div>
      ) : null}

      <div className="p-1">
        {onSort ? (
          <>
            <MenuButton icon={<ArrowUpNarrowWide className="size-4" />} onClick={() => onSort("asc")}>
              فرز تصاعدي
            </MenuButton>
            <MenuButton icon={<ArrowDownWideNarrow className="size-4" />} onClick={() => onSort("desc")}>
              فرز تنازلي
            </MenuButton>
          </>
        ) : null}
        {onFilter ? (
          <MenuButton icon={<Filter className="size-4" />} onClick={onFilter}>
            تصفية بهذه الخاصية
          </MenuButton>
        ) : null}
        {onHide && !isTitle ? (
          <MenuButton icon={<EyeOff className="size-4" />} onClick={onHide}>
            إخفاء في هذا العرض
          </MenuButton>
        ) : null}
        {canEdit ? (
          <MenuButton danger icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
            حذف الخاصية
          </MenuButton>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`حذف الخاصية «${prop.name}»؟`}
        description="ستُحذف قيم هذه الخاصية من كل السجلات. يُسجَّل الحذف في سجل التدقيق."
        confirmLabel="حذف"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate({ propertyId: prop.id })}
      />
    </div>
  );
}

function MenuButton({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-[14px] hover:bg-hover", danger && "text-danger-700")}>
      <span className={cn("text-fg-2", danger && "text-danger-700")}>{icon}</span>
      {children}
    </button>
  );
}

function TypeConfig({ api, prop, onSave }: { api: DatabaseApi; prop: PropertyDef; onSave: (patch: Partial<PropertyConfig>) => void }) {
  const cfg = prop.config;
  switch (prop.type) {
    case "SELECT":
    case "MULTI_SELECT":
    case "STATUS":
      return <OptionsConfig prop={prop} onSave={onSave} />;
    case "NUMBER":
      return (
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">تنسيق الرقم</span>
          <Select
            size="sm"
            value={cfg.numberFormat ?? "number"}
            onChange={(v) => onSave({ numberFormat: v as PropertyConfig["numberFormat"] })}
            options={[
              { value: "number", label: "رقم" },
              { value: "integer", label: "عدد صحيح" },
              { value: "percent", label: "نسبة مئوية" },
            ]}
          />
        </label>
      );
    case "MONEY":
      return (
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">العملة</span>
          <Select size="sm" value={cfg.currency ?? "SAR"} onChange={(v) => onSave({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </label>
      );
    case "DATE":
      return (
        <label className="flex items-center justify-between text-[13px]">
          <span className="text-fg-2">تضمين الوقت</span>
          <Switch size="sm" checked={Boolean(cfg.includeTime)} onChange={(v) => onSave({ includeTime: v })} />
        </label>
      );
    case "PERSON":
      return (
        <label className="flex items-center justify-between text-[13px]">
          <span className="text-fg-2">السماح بأكثر من شخص</span>
          <Switch size="sm" checked={cfg.multiple !== false} onChange={(v) => onSave({ multiple: v })} />
        </label>
      );
    case "RELATION":
      return <RelationConfig prop={prop} onSave={onSave} />;
    case "ROLLUP":
      return <RollupConfig api={api} prop={prop} onSave={onSave} />;
    case "FORMULA":
      return <FormulaConfig api={api} prop={prop} onSave={onSave} />;
    default:
      return null;
  }
}

const NO_OPTIONS: SelectOption[] = [];

function OptionsConfig({ prop, onSave }: { prop: PropertyDef; onSave: (patch: Partial<PropertyConfig>) => void }) {
  const [options, setOptions] = useSyncedState<SelectOption[]>(prop.config.options ?? NO_OPTIONS);
  const [newName, setNewName] = useState("");
  const save = (next: SelectOption[]) => {
    setOptions(next);
    const patch: Partial<PropertyConfig> = { options: next };
    if (prop.type === "STATUS" && prop.config.groups) {
      const ids = new Set(next.map((o) => o.id));
      patch.groups = prop.config.groups.map((g) => ({ ...g, optionIds: g.optionIds.filter((id) => ids.has(id)) }));
    }
    onSave(patch);
  };
  const groupOf = (id: string) => prop.config.groups?.find((g) => g.optionIds.includes(id))?.key ?? "todo";
  return (
    <div>
      <span className="mb-1 block text-[12px] text-fg-3">الخيارات</span>
      <ul className="thin-scroll max-h-[220px] space-y-0.5 overflow-y-auto">
        {options.map((o) => (
          <li key={o.id} className="group flex items-center gap-1.5">
            <GripVertical className="size-3.5 text-fg-4" />
            <input
              defaultValue={o.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && save(options.map((x) => (x.id === o.id ? { ...x, name: e.target.value.trim() } : x)))}
              className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] outline-none hover:bg-hover focus:bg-hover"
            />
            <select
              value={o.color}
              onChange={(e) => save(options.map((x) => (x.id === o.id ? { ...x, color: e.target.value as OptionColor } : x)))}
              className="h-7 w-[76px] rounded-md bg-transparent text-[12px] outline-none hover:bg-hover"
              aria-label="اللون"
              style={{ color: `var(--tag-${o.color}-fg)` }}
            >
              {OPTION_COLORS.map((c) => (
                <option key={c} value={c}>
                  {OPTION_COLOR_LABELS[c]}
                </option>
              ))}
            </select>
            {prop.type === "STATUS" ? (
              <select
                value={groupOf(o.id)}
                onChange={(e) => {
                  const groups = (prop.config.groups ?? []).map((g) => ({
                    ...g,
                    optionIds: g.key === e.target.value ? [...g.optionIds.filter((id) => id !== o.id), o.id] : g.optionIds.filter((id) => id !== o.id),
                  }));
                  onSave({ groups });
                }}
                className="h-7 w-[70px] rounded-md bg-transparent text-[12px] text-fg-3 outline-none hover:bg-hover"
                aria-label="المجموعة"
              >
                {(prop.config.groups ?? []).map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button onClick={() => save(options.filter((x) => x.id !== o.id))} className="grid size-6 place-items-center rounded text-fg-3 opacity-0 hover:text-danger-700 group-hover:opacity-100" aria-label="حذف الخيار">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const color = OPTION_COLORS[(options.length + 1) % OPTION_COLORS.length]!;
          save([...options, { id: shortId(), name: newName.trim(), color }]);
          setNewName("");
        }}
      >
        <Plus className="size-3.5 text-fg-3" />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="خيار جديد…" className="h-7 flex-1 rounded-md bg-transparent px-1.5 text-[13px] outline-none hover:bg-hover focus:bg-hover" />
      </form>
      {options.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {options.slice(0, 6).map((o) => (
            <Tag key={o.id} color={o.color} size="sm">
              {o.name}
            </Tag>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RelationConfig({ prop, onSave }: { prop: PropertyDef; onSave: (patch: Partial<PropertyConfig>) => void }) {
  const dbs = trpc.database.accessibleDatabases.useQuery();
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[12px] text-fg-3">مرتبطة بقاعدة البيانات</span>
        <Select size="sm" value={prop.config.targetDatabaseId} onChange={(v) => onSave({ targetDatabaseId: v })} options={(dbs.data ?? []).map((d) => ({ value: d.id, label: d.title }))} placeholder="اختر قاعدة بيانات" />
      </label>
      <label className="flex items-center justify-between text-[13px]">
        <span className="text-fg-2">السماح بعدة سجلات</span>
        <Switch size="sm" checked={prop.config.multiple !== false} onChange={(v) => onSave({ multiple: v })} />
      </label>
    </div>
  );
}

function RollupConfig({ api, prop, onSave }: { api: DatabaseApi; prop: PropertyDef; onSave: (patch: Partial<PropertyConfig>) => void }) {
  const relations = api.properties.filter((p) => p.type === "RELATION");
  const relation = relations.find((p) => p.id === prop.config.relationPropertyId);
  const target = trpc.database.bundle.useQuery({ databaseId: relation?.config.targetDatabaseId ?? "" }, { enabled: Boolean(relation?.config.targetDatabaseId) });
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[12px] text-fg-3">العلاقة</span>
        <Select size="sm" value={prop.config.relationPropertyId} onChange={(v) => onSave({ relationPropertyId: v })} options={relations.map((r) => ({ value: r.id, label: r.name }))} placeholder="اختر خاصية علاقة" />
      </label>
      {relation ? (
        <label className="block">
          <span className="mb-1 block text-[12px] text-fg-3">الخاصية المجمّعة</span>
          <Select
            size="sm"
            value={prop.config.targetPropertyId}
            onChange={(v) => onSave({ targetPropertyId: v })}
            options={[{ value: TITLE_KEY, label: "العنوان" }, ...(target.data?.properties ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[12px] text-fg-3">الحساب</span>
        <Select size="sm" value={prop.config.rollupFn ?? "count"} onChange={(v) => onSave({ rollupFn: v as RollupFn })} options={(Object.keys(ROLLUP_LABELS) as RollupFn[]).map((k) => ({ value: k, label: ROLLUP_LABELS[k] }))} />
      </label>
    </div>
  );
}

function FormulaConfig({ api, prop, onSave }: { api: DatabaseApi; prop: PropertyDef; onSave: (patch: Partial<PropertyConfig>) => void }) {
  const [expr, setExpr] = useState(prop.config.expression ?? "");
  const sample = api.rows[0];
  const preview = useMemo(() => {
    if (!expr.trim()) return null;
    const byName = new Map(api.properties.map((p) => [p.name, p]));
    return evaluateFormula(expr, {
      getProp: (name) => {
        if (!byName.has(name) && name !== "العنوان") throw new Error(`خاصية غير موجودة: ${name}`);
        return sample ? (sample.values[byName.get(name)?.id ?? ""] as never) ?? null : null;
      },
    });
  }, [expr, api.properties, sample]);
  return (
    <div>
      <span className="mb-1 block text-[12px] text-fg-3">المعادلة</span>
      <textarea
        dir="ltr"
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onBlur={() => expr !== prop.config.expression && onSave({ expression: expr })}
        rows={3}
        placeholder='if(prop("الإنجاز") >= 100, "منجز", "قيد العمل")'
        className="w-full resize-none rounded-md bg-hover p-2 font-mono text-[12px] leading-5 outline-none"
      />
      {preview?.error ? <p className="mt-1 text-[12px] text-danger-700">{preview.error}</p> : expr ? <p className="mt-1 text-[12px] text-success-800">صيغة صحيحة</p> : null}
      <p className="mt-1 text-[11px] leading-5 text-fg-3">
        الخصائص المتاحة: {api.properties.filter((p) => p.id !== prop.id).map((p) => `«${p.name}»`).join("، ")}. الدوال: if، concat، round، sum، dateBetween، today…
      </p>
    </div>
  );
}

/** نافذة إضافة خاصية جديدة: اختيار النوع ثم الاسم (والعلاقة تتطلب اختيار قاعدة البيانات الهدف) */
export function NewPropertyMenu({ api, onCreated }: { api: DatabaseApi; onCreated?: (id: string) => void }) {
  const create = trpc.database.createProperty.useMutation({
    onSuccess: async (p) => {
      await api.refreshBundle();
      onCreated?.(p.id);
    },
  });
  const [query, setQuery] = useState("");
  const [pickRelation, setPickRelation] = useState(false);
  const dbs = trpc.database.accessibleDatabases.useQuery(undefined, { enabled: pickRelation });
  const types = PROPERTY_TYPES.filter((t) => PROPERTY_TYPE_LABELS[t].includes(query.trim()));
  if (pickRelation) {
    return (
      <div className="w-[260px] p-1">
        <p className="px-2 pb-1 pt-1.5 text-[12px] font-medium text-fg-3">اربط بقاعدة البيانات:</p>
        <div className="thin-scroll max-h-[320px] overflow-y-auto">
          {(dbs.data ?? []).map((d) => (
            <button
              key={d.id}
              disabled={create.isPending}
              onClick={() => create.mutate({ databaseId: api.databaseId, name: d.title, type: "RELATION", config: { targetDatabaseId: d.id, multiple: true } })}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[14px] hover:bg-hover disabled:opacity-50"
            >
              <PropertyTypeIcon type="RELATION" />
              <span className="truncate">{d.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="w-[260px] p-1">
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن نوع الخاصية…" className="mb-1 h-8 w-full rounded-md bg-hover px-2 text-[13px] outline-none" />
      <div className="thin-scroll max-h-[320px] overflow-y-auto">
        {types.map((t) => (
          <button
            key={t}
            disabled={create.isPending}
            onClick={() => (t === "RELATION" ? setPickRelation(true) : create.mutate({ databaseId: api.databaseId, name: PROPERTY_TYPE_LABELS[t], type: t }))}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[14px] hover:bg-hover disabled:opacity-50"
          >
            <PropertyTypeIcon type={t} />
            {PROPERTY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
