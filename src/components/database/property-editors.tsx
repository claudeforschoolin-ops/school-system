"use client";
/**
 * محررات قيم الخصائص (داخل نافذة منبثقة مرتبطة بالخلية أو بصف الخاصية).
 */
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Paperclip, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asDateValue, asFiles, asStringArray } from "@/lib/database/engine";
import type { DateValue, FileValue, PropertyDef, RowRecord, SelectOption } from "@/lib/database/types";
import { hijriDayNumber, monthTitle, toISODate, weekdayNames } from "@/lib/dates";
import { MoneyError, minorToDecimalString, parseMoney } from "@/lib/money";
import { toLatinDigits } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { formatBytes, pickFile, uploadFile } from "@/lib/upload";
import { cn, matchesSearch } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { PageIcon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";

export interface EditorProps {
  prop: PropertyDef;
  row: RowRecord;
  value: unknown;
  onChange: (value: unknown) => void;
  onClose: () => void;
  users: Array<{ id: string; name: string; avatarColor: string; jobTitle?: string | null; status?: string }>;
  defaultCurrency: string;
}

export function ValueEditor(props: EditorProps) {
  switch (props.prop.type) {
    case "TEXT":
      return <TextEditor {...props} multiline />;
    case "URL":
    case "EMAIL":
    case "PHONE":
      return <TextEditor {...props} ltr />;
    case "NUMBER":
      return <NumberEditor {...props} />;
    case "MONEY":
      return <MoneyEditor {...props} />;
    case "DATE":
      return <DateEditor {...props} />;
    case "SELECT":
    case "STATUS":
    case "MULTI_SELECT":
      return <OptionsEditor {...props} />;
    case "PERSON":
      return <PersonEditor {...props} />;
    case "RELATION":
      return <RelationEditor {...props} />;
    case "FILES":
      return <FilesEditor {...props} />;
    default:
      return <p className="p-3 text-[13px] text-fg-3">هذه الخاصية محسوبة تلقائياً ولا يمكن تعديلها.</p>;
  }
}

// ---------------------------------------------------------------- نصوص
function TextEditor({ value, onChange, onClose, multiline, ltr, prop }: EditorProps & { multiline?: boolean; ltr?: boolean }) {
  const [draft, setDraft] = useState(typeof value === "string" ? value : "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const v = draft.trim();
    if (v !== (value ?? "")) onChange(v || null);
  };
  return (
    <textarea
      ref={ref}
      dir={ltr ? "ltr" : undefined}
      value={draft}
      rows={multiline ? 3 : 1}
      placeholder={prop.type === "URL" ? "https://" : prop.type === "EMAIL" ? "name@school.sa" : prop.type === "PHONE" ? "+9665…" : "اكتب…"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
          onClose();
        }
        if (e.key === "Escape") onClose();
      }}
      className={cn("block min-h-9 w-[320px] resize-none bg-transparent px-3 py-2 text-[14px] leading-6 outline-none [field-sizing:content]", ltr && "text-start")}
    />
  );
}

function NumberEditor({ value, onChange, onClose, prop }: EditorProps) {
  const [draft, setDraft] = useState(typeof value === "number" ? String(value) : "");
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const clean = toLatinDigits(draft).replace(/[٬,\s%]/g, "").replace("٫", ".");
    if (!clean) return onChange(null);
    const n = Number(clean);
    if (!Number.isFinite(n)) return setError("أدخل رقماً صحيحاً");
    if (n !== value) onChange(prop.config.numberFormat === "integer" ? Math.trunc(n) : n);
  };
  return (
    <div className="w-[240px] p-2">
      <input
        autoFocus
        inputMode="decimal"
        dir="ltr"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            onClose();
          }
          if (e.key === "Escape") onClose();
        }}
        className="tabular h-8 w-full rounded-md bg-hover px-2 text-start text-[14px] outline-none"
        placeholder={prop.config.numberFormat === "percent" ? "٠–١٠٠" : "0"}
      />
      {error ? <p className="mt-1 text-[12px] text-danger-700">{error}</p> : null}
    </div>
  );
}

function MoneyEditor({ value, onChange, onClose, prop, defaultCurrency }: EditorProps) {
  const currency = prop.config.currency ?? defaultCurrency;
  const [draft, setDraft] = useState(typeof value === "number" ? minorToDecimalString(value, currency) : "");
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (!draft.trim()) return onChange(null);
    try {
      const minor = parseMoney(draft, currency);
      if (minor !== value) onChange(minor);
      return true;
    } catch (e) {
      setError(e instanceof MoneyError ? e.message : "مبلغ غير صالح");
      return false;
    }
  };
  return (
    <div className="w-[260px] p-2">
      <div className="flex items-center gap-2 rounded-md bg-hover px-2">
        <input
          autoFocus
          inputMode="decimal"
          dir="ltr"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && commit()) onClose();
            if (e.key === "Escape") onClose();
          }}
          onBlur={() => commit()}
          className="tabular h-8 min-w-0 flex-1 bg-transparent text-start text-[14px] outline-none"
          placeholder="0.00"
        />
        <span className="text-[12px] text-fg-3">{currency}</span>
      </div>
      {error ? <p className="mt-1 text-[12px] text-danger-700">{error}</p> : <p className="mt-1 text-[11px] text-fg-3">يُحفظ بأصغر وحدة (هللة) دون كسور عشرية</p>}
    </div>
  );
}

// ---------------------------------------------------------------- التاريخ
export function MonthGrid({
  selected,
  rangeEnd,
  onPick,
}: {
  selected: string | null;
  rangeEnd?: string | null;
  onPick: (iso: string) => void;
}) {
  const prefs = usePrefs();
  const initial = selected ? new Date(`${selected.slice(0, 10)}T12:00:00Z`) : new Date();
  const [cursor, setCursor] = useState({ y: initial.getUTCFullYear(), m: initial.getUTCMonth() });
  const first = new Date(Date.UTC(cursor.y, cursor.m, 1, 12));
  const startOffset = first.getUTCDay();
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const today = toISODate(new Date());
  const cells = Array.from({ length: Math.ceil((startOffset + days) / 7) * 7 }, (_, i) => {
    const day = i - startOffset + 1;
    if (day < 1 || day > days) return null;
    return new Date(Date.UTC(cursor.y, cursor.m, day, 12)).toISOString().slice(0, 10);
  });
  const shift = (d: number) => setCursor((c) => ({ y: c.m + d < 0 ? c.y - 1 : c.m + d > 11 ? c.y + 1 : c.y, m: (c.m + d + 12) % 12 }));
  return (
    <div className="w-[268px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium">{monthTitle(cursor.y, cursor.m, "gregory", prefs.digits)}</span>
        <div className="flex">
          <button onClick={() => shift(-1)} className="grid size-6 place-items-center rounded text-fg-3 hover:bg-hover" aria-label="الشهر السابق">
            <ChevronRight className="size-4" />
          </button>
          <button onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })} className="h-6 rounded px-1.5 text-[12px] text-fg-3 hover:bg-hover">
            اليوم
          </button>
          <button onClick={() => shift(1)} className="grid size-6 place-items-center rounded text-fg-3 hover:bg-hover" aria-label="الشهر التالي">
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </div>
      <p className="-mt-1 mb-2 text-[11px] text-fg-3">{monthTitle(cursor.y, cursor.m, "hijri", prefs.digits)}</p>
      <div className="grid grid-cols-7 text-center text-[11px] text-fg-3">
        {weekdayNames("narrow").map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((iso, i) =>
          iso ? (
            <button
              key={iso}
              onClick={() => onPick(iso)}
              className={cn(
                "relative flex h-9 flex-col items-center justify-center rounded-md text-[13px] tabular transition-colors hover:bg-hover",
                iso === today && "font-bold text-danger-700",
                (iso === selected?.slice(0, 10) || iso === rangeEnd?.slice(0, 10)) && "bg-navy-700 text-on-primary hover:bg-navy-600",
                selected && rangeEnd && iso > selected.slice(0, 10) && iso < rangeEnd.slice(0, 10) && "bg-navy-50",
              )}
            >
              <span className="leading-4">{new Intl.NumberFormat(`ar-SA-u-nu-${prefs.digits}`).format(Number(iso.slice(8)))}</span>
              <span className="text-[9px] leading-3 opacity-60">{hijriDayNumber(iso, prefs.digits)}</span>
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function DateEditor({ value, onChange, prop }: EditorProps) {
  const current = asDateValue(value);
  const [hasEnd, setHasEnd] = useState(Boolean(current?.end));
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [time, setTime] = useState(current?.start && current.start.length > 10 ? current.start.slice(11, 16) : "08:00");
  const withTime = prop.config.includeTime;
  const build = (start: string, end?: string | null): DateValue => {
    const s = withTime ? `${start.slice(0, 10)}T${time}:00` : start.slice(0, 10);
    return end ? { start: s, end: end.slice(0, 10) } : { start: s };
  };
  return (
    <div className="p-3">
      <div className="mb-2 flex gap-1 text-[12px]">
        <button className={cn("h-7 flex-1 rounded-md bg-hover px-2 text-start tabular", picking === "start" && "shadow-[0_0_0_1px_var(--navy-600)]")} onClick={() => setPicking("start")}>
          {current?.start ? current.start.slice(0, 10) : "البداية"}
        </button>
        {hasEnd ? (
          <button className={cn("h-7 flex-1 rounded-md bg-hover px-2 text-start tabular", picking === "end" && "shadow-[0_0_0_1px_var(--navy-600)]")} onClick={() => setPicking("end")}>
            {current?.end ?? "النهاية"}
          </button>
        ) : null}
      </div>
      <MonthGrid
        selected={current?.start ?? null}
        rangeEnd={hasEnd ? (current?.end ?? null) : null}
        onPick={(iso) => {
          if (picking === "end" && current?.start) {
            onChange(build(current.start, iso < current.start.slice(0, 10) ? current.start : iso));
          } else {
            onChange(build(iso, hasEnd ? (current?.end && current.end >= iso ? current.end : iso) : null));
            if (hasEnd) setPicking("end");
          }
        }}
      />
      <div className="mt-3 space-y-2 border-t border-line pt-3 text-[13px]">
        <label className="flex items-center justify-between">
          <span className="text-fg-2">تاريخ النهاية</span>
          <Switch
            size="sm"
            checked={hasEnd}
            onChange={(v) => {
              setHasEnd(v);
              if (current?.start) onChange(build(current.start, v ? current.start : null));
              setPicking(v ? "end" : "start");
            }}
          />
        </label>
        {withTime ? (
          <label className="flex items-center justify-between">
            <span className="text-fg-2">الوقت</span>
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (current?.start) onChange({ ...current, start: `${current.start.slice(0, 10)}T${e.target.value}:00` });
              }}
              className="h-7 rounded-md bg-hover px-2 text-[13px] outline-none"
            />
          </label>
        ) : null}
        {current ? (
          <button className="flex h-7 items-center gap-1.5 text-fg-3 hover:text-danger-700" onClick={() => onChange(null)}>
            <Trash2 className="size-3.5" /> مسح التاريخ
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- الخيارات
function OptionsEditor({ prop, value, onChange }: EditorProps) {
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const addOption = trpc.database.addOption.useMutation();
  const multiple = prop.type === "MULTI_SELECT";
  const selected = multiple ? asStringArray(value) : typeof value === "string" ? [value] : [];
  const options = prop.config.options ?? [];
  const filtered = options.filter((o) => matchesSearch(o.name, query));
  const exact = options.some((o) => o.name === query.trim());

  const toggle = (opt: SelectOption) => {
    if (multiple) onChange(selected.includes(opt.id) ? selected.filter((s) => s !== opt.id) : [...selected, opt.id]);
    else onChange(selected[0] === opt.id ? null : opt.id);
  };
  const create = async () => {
    const name = query.trim();
    if (!name) return;
    const opt = await addOption.mutateAsync({ propertyId: prop.id, name });
    await utils.database.bundle.invalidate();
    setQuery("");
    if (multiple) onChange([...selected, opt.id]);
    else onChange(opt.id);
  };

  const groups =
    prop.type === "STATUS" && prop.config.groups
      ? prop.config.groups.map((g) => ({ name: g.name, options: filtered.filter((o) => g.optionIds.includes(o.id)) }))
      : [{ name: null as string | null, options: filtered }];

  return (
    <div className="w-[280px]">
      <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
        {selected.map((id) => {
          const o = options.find((x) => x.id === id);
          return o ? (
            <span key={id} className="flex items-center">
              <Tag color={o.color} dot={prop.type !== "MULTI_SELECT"}>
                {o.name}
              </Tag>
              <button onClick={() => toggle(o)} className="-ms-1 grid size-4 place-items-center rounded-full text-fg-3 hover:text-fg" aria-label="إزالة">
                <X className="size-3" />
              </button>
            </span>
          ) : null;
        })}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = filtered[0];
              if (first && (exact || prop.type === "STATUS")) toggle(first);
              else if (query.trim() && prop.type !== "STATUS") void create();
            }
          }}
          placeholder={prop.type === "STATUS" ? "ابحث عن حالة…" : "ابحث أو أنشئ خياراً…"}
          className="h-6 min-w-[80px] flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>
      <div className="thin-scroll max-h-[280px] overflow-y-auto p-1">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.name ? <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-fg-3">{g.name}</p> : null}
            {g.options.map((o) => (
              <button key={o.id} onClick={() => toggle(o)} className="flex h-8 w-full items-center justify-between rounded-md px-2 hover:bg-hover">
                <Tag color={o.color} dot={prop.type !== "MULTI_SELECT"}>
                  {o.name}
                </Tag>
                {selected.includes(o.id) ? <Check className="size-4 text-fg-2" /> : null}
              </button>
            ))}
          </div>
        ))}
        {query.trim() && !exact && prop.type !== "STATUS" ? (
          <button onClick={() => void create()} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover">
            <Plus className="size-3.5 text-fg-3" /> إنشاء <Tag color="gray">{query.trim()}</Tag>
          </button>
        ) : null}
        {!filtered.length && !query ? <p className="px-2 py-3 text-[13px] text-fg-3">لا توجد خيارات بعد. اكتب لإنشاء خيار.</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- الأشخاص
function PersonEditor({ prop, value, onChange, users }: EditorProps) {
  const [query, setQuery] = useState("");
  const selected = asStringArray(value);
  const multiple = prop.config.multiple !== false;
  const list = users.filter((u) => u.status !== "SUSPENDED" && matchesSearch(`${u.name} ${u.jobTitle ?? ""}`, query)).slice(0, 50);
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange(multiple ? [...selected, id] : [id]);
  };
  return (
    <div className="w-[300px]">
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1.5 size-3.5 text-fg-3" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن شخص…" className="h-7 w-full rounded-md bg-hover ps-7 pe-2 text-[13px] outline-none" />
        </div>
      </div>
      <div className="thin-scroll max-h-[300px] overflow-y-auto p-1">
        {list.map((u) => (
          <button key={u.id} onClick={() => toggle(u.id)} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-hover">
            <Avatar name={u.name} color={u.avatarColor} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{u.name}</span>
              {u.jobTitle ? <span className="block truncate text-[11px] text-fg-3">{u.jobTitle}</span> : null}
            </span>
            {selected.includes(u.id) ? <Check className="size-4 text-fg-2" /> : null}
          </button>
        ))}
        {!list.length ? <p className="px-2 py-3 text-[13px] text-fg-3">لا يوجد أشخاص مطابقون</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- العلاقات
function RelationEditor({ prop, value, onChange }: EditorProps) {
  const [query, setQuery] = useState("");
  const target = prop.config.targetDatabaseId;
  const rows = trpc.database.rows.useQuery({ databaseId: target ?? "" }, { enabled: Boolean(target) });
  const bundle = trpc.database.bundle.useQuery({ databaseId: target ?? "" }, { enabled: Boolean(target) });
  const selected = asStringArray(value);
  const list = useMemo(() => (rows.data?.rows ?? []).filter((r) => matchesSearch(r.title, query)).slice(0, 60), [rows.data, query]);
  if (!target) return <p className="p-3 text-[13px] text-fg-3">لم تُحدد قاعدة البيانات المرتبطة. عدّل الخاصية أولاً.</p>;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange(prop.config.multiple === false ? [id] : [...selected, id]);
  };
  return (
    <div className="w-[320px]">
      <div className="border-b border-line p-2">
        <p className="mb-1.5 flex items-center gap-1 text-[12px] text-fg-3">
          <PageIcon icon={bundle.data?.page.icon ?? null} size={12} /> مرتبطة بـ «{bundle.data?.page.title ?? "…"}»
        </p>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن سجل…" className="h-7 w-full rounded-md bg-hover px-2 text-[13px] outline-none" />
      </div>
      <div className="thin-scroll max-h-[300px] overflow-y-auto p-1">
        {list.map((r) => (
          <button key={r.id} onClick={() => toggle(r.id)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-hover">
            <ArrowUpRight className="size-3.5 text-fg-3" />
            <span className="flex-1 truncate">{r.title || "بدون عنوان"}</span>
            {selected.includes(r.id) ? <Check className="size-4 text-fg-2" /> : null}
          </button>
        ))}
        {rows.isLoading ? <p className="px-2 py-3 text-[13px] text-fg-3">جارٍ التحميل…</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- الملفات
function FilesEditor({ value, onChange }: EditorProps) {
  const files = asFiles(value);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="w-[300px] p-2">
      {files.map((f: FileValue) => (
        <div key={f.id} className="group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
          <Paperclip className="size-3.5 text-fg-3" />
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:underline">
            {f.name}
          </a>
          {f.size ? <span className="text-[11px] text-fg-3">{formatBytes(f.size)}</span> : null}
          <button onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="grid size-5 place-items-center rounded text-fg-3 opacity-0 hover:text-danger-700 group-hover:opacity-100" aria-label="إزالة">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        disabled={uploading}
        onClick={async () => {
          const file = await pickFile("*/*");
          if (!file) return;
          setUploading(true);
          try {
            const u = await uploadFile(file);
            onChange([...files, { id: u.id, name: u.name, url: u.url, size: u.size, mime: u.mime }]);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذر الرفع");
          } finally {
            setUploading(false);
          }
        }}
        className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-[13px] text-fg-2 hover:bg-hover disabled:opacity-50"
      >
        <Upload className="size-3.5" /> {uploading ? "جارٍ الرفع…" : "رفع ملف"}
      </button>
    </div>
  );
}
