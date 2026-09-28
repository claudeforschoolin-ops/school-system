"use client";
/**
 * عرض قيم الخصائص (قراءة فقط) وأيقونات أنواع الخصائص.
 */
import {
  AlignRight,
  ArrowUpRight,
  AtSign,
  Banknote,
  Calendar,
  CircleDot,
  Clock,
  FileText,
  Hash,
  Link2,
  List,
  Paperclip,
  Phone,
  Search,
  Sigma,
  SquareCheck,
  Tags,
  UserRound,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { asDateValue, asFiles, asStringArray, computeRollup, formulaResult, optionsOf, rawValue, type EngineContext } from "@/lib/database/engine";
import { isEmptyValue, toText, type FormulaValue } from "@/lib/database/formula";
import { TITLE_KEY, type PropertyDef, type PropertyType, type RowRecord } from "@/lib/database/types";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/ui/tag";
import { usePrefs } from "@/components/shell/app-context";

export const PROPERTY_ICONS: Record<PropertyType | "TITLE", LucideIcon> = {
  TITLE: AlignRight,
  TEXT: FileText,
  NUMBER: Hash,
  MONEY: Banknote,
  DATE: Calendar,
  SELECT: CircleDot,
  MULTI_SELECT: Tags,
  STATUS: Search,
  PERSON: UserRound,
  FILES: Paperclip,
  CHECKBOX: SquareCheck,
  URL: Link2,
  PHONE: Phone,
  EMAIL: AtSign,
  RELATION: ArrowUpRight,
  ROLLUP: List,
  FORMULA: Sigma,
  CREATED_TIME: Clock,
  UPDATED_TIME: Clock,
  CREATED_BY: UserRoundPen,
};

export function PropertyTypeIcon({ type, className }: { type: PropertyType | "TITLE"; className?: string }) {
  const Icon = type === "STATUS" ? CircleDotStatus : PROPERTY_ICONS[type];
  return <Icon className={cn("size-4 shrink-0 text-fg-3", className)} strokeWidth={1.8} />;
}

/** أيقونة الحالة: دائرة نصف ممتلئة */
function CircleDotStatus({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 1.8} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function formatNumberValue(value: number, prop: PropertyDef, digits: "arab" | "latn") {
  if (prop.config.numberFormat === "percent") return formatPercent(value / 100, digits, 1);
  if (prop.config.numberFormat === "integer") return formatNumber(Math.trunc(value), digits);
  return formatNumber(value, digits, { maximumFractionDigits: prop.config.decimals ?? 2 });
}

function FormulaDisplay({ value, error }: { value: FormulaValue; error?: string | null }) {
  const prefs = usePrefs();
  if (error) return <span className="text-[12px] text-danger-700" title={error}>خطأ في المعادلة</span>;
  if (isEmptyValue(value)) return null;
  if (typeof value === "number") return <span className="tabular">{formatNumber(Math.round(value * 100) / 100, prefs.digits)}</span>;
  if (typeof value === "boolean") return <Checkbox checked={value} disabled />;
  if (value instanceof Date) return <span>{formatDate(value, { digits: prefs.digits })}</span>;
  if (Array.isArray(value)) return <span className="truncate">{value.map(toText).join("، ")}</span>;
  return <span className="truncate">{toText(value)}</span>;
}

export interface ValueDisplayProps {
  row: RowRecord;
  prop: PropertyDef;
  ctx: EngineContext;
  users: Array<{ id: string; name: string; avatarColor: string; avatarUrl?: string | null }>;
  wrap?: boolean;
  compact?: boolean;
}

/** عرض قيمة خاصية لسجل */
export function ValueDisplay({ row, prop, ctx, users, wrap, compact }: ValueDisplayProps) {
  const prefs = usePrefs();
  if (prop.id === TITLE_KEY) return <span className="truncate font-medium">{row.title}</span>;
  const raw = rawValue(row, prop);
  const truncate = wrap ? "whitespace-normal break-words" : "truncate";
  switch (prop.type) {
    case "TEXT":
      return raw ? <span className={truncate}>{String(raw)}</span> : null;
    case "NUMBER":
      return typeof raw === "number" ? <span className="tabular">{formatNumberValue(raw, prop, prefs.digits)}</span> : null;
    case "MONEY":
      return typeof raw === "number" ? <span className="tabular">{formatMoney(raw, { currency: prop.config.currency ?? ctx.defaultCurrency ?? "SAR", digits: prefs.digits })}</span> : null;
    case "DATE": {
      const d = asDateValue(raw);
      if (!d) return null;
      const opts = { digits: prefs.digits, calendar: prefs.calendar === "both" ? ("gregory" as const) : prefs.calendar, withTime: prop.config.includeTime && d.start.length > 10 };
      return (
        <span className={cn("tabular", truncate)} title={formatDate(d.start, { digits: prefs.digits, calendar: "both" })}>
          <span>{formatDate(d.start, opts)}</span>
          {d.end ? ` ← ${formatDate(d.end, opts)}` : null}
        </span>
      );
    }
    case "CREATED_TIME":
    case "UPDATED_TIME":
      return raw ? <span className="tabular text-fg-2">{formatRelative(raw as string, new Date(), prefs.digits)}</span> : null;
    case "SELECT":
    case "STATUS": {
      const opt = optionsOf(prop).find((o) => o.id === raw);
      return opt ? <Tag color={opt.color}>{opt.name}</Tag> : null;
    }
    case "MULTI_SELECT": {
      const ids = asStringArray(raw);
      const opts = optionsOf(prop).filter((o) => ids.includes(o.id));
      if (!opts.length) return null;
      return (
        <span className={cn("flex gap-1", wrap ? "flex-wrap" : "overflow-hidden")}>
          {opts.map((o) => (
            <Tag key={o.id} color={o.color} dot={false}>
              {o.name}
            </Tag>
          ))}
        </span>
      );
    }
    case "PERSON":
    case "CREATED_BY": {
      const ids = asStringArray(raw);
      const people = ids.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
      if (!people.length) return null;
      if (compact || people.length > 2) {
        return (
          <span className="flex items-center">
            {people.slice(0, 4).map((p, i) => (
              <Avatar key={p.id} name={p.name} color={p.avatarColor} src={p.avatarUrl} size={20} ring className={i ? "-ms-1.5" : undefined} />
            ))}
            {people.length === 1 && !compact ? <span className="ms-1.5 truncate">{people[0]!.name}</span> : null}
          </span>
        );
      }
      return (
        <span className={cn("flex gap-2", wrap ? "flex-wrap" : "overflow-hidden")}>
          {people.map((p) => (
            <span key={p.id} className="flex min-w-0 items-center gap-1.5">
              <Avatar name={p.name} color={p.avatarColor} src={p.avatarUrl} size={20} />
              <span className="truncate">{p.name.replace(/^(أ|م|د)\.\s*/, "")}</span>
            </span>
          ))}
        </span>
      );
    }
    case "CHECKBOX":
      return <Checkbox checked={raw === true} disabled />;
    case "URL":
      return raw ? (
        <a href={String(raw)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} dir="ltr" className={cn("text-fg underline decoration-line-strong underline-offset-2", truncate)}>
          {String(raw).replace(/^https?:\/\//, "")}
        </a>
      ) : null;
    case "EMAIL":
      return raw ? (
        <a href={`mailto:${String(raw)}`} onClick={(e) => e.stopPropagation()} dir="ltr" className={cn("underline decoration-line-strong underline-offset-2", truncate)}>
          {String(raw)}
        </a>
      ) : null;
    case "PHONE":
      return raw ? (
        <a href={`tel:${String(raw)}`} onClick={(e) => e.stopPropagation()} dir="ltr" className={cn("tabular", truncate)}>
          {String(raw)}
        </a>
      ) : null;
    case "FILES": {
      const files = asFiles(raw);
      if (!files.length) return null;
      return (
        <span className={cn("flex gap-1", wrap ? "flex-wrap" : "overflow-hidden")}>
          {files.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex h-5 max-w-[160px] items-center gap-1 rounded bg-hover px-1.5 text-[12px] hover:bg-active">
              <Paperclip className="size-3 shrink-0 text-fg-3" />
              <span className="truncate">{f.name}</span>
            </a>
          ))}
        </span>
      );
    }
    case "RELATION": {
      const ids = asStringArray(raw);
      const related = ids.map((id) => ctx.relatedRows?.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
      if (!related.length) return null;
      return (
        <span className={cn("flex gap-1.5", wrap ? "flex-wrap" : "overflow-hidden")}>
          {related.map((r) => (
            <Link key={r.id} href={`/r/${r.id}`} onClick={(e) => e.stopPropagation()} className="flex h-5 max-w-[200px] items-center gap-1 rounded px-1 text-[13px] underline decoration-line-strong underline-offset-2 hover:bg-hover">
              <ArrowUpRight className="size-3 shrink-0 text-fg-3" />
              <span className="truncate">{r.title || "بدون عنوان"}</span>
            </Link>
          ))}
        </span>
      );
    }
    case "ROLLUP": {
      const value = computeRollup(row, prop, ctx);
      if (prop.config.rollupFn === "percent_checked" && typeof value === "number") return <span className="tabular">{formatPercent(value, prefs.digits)}</span>;
      return <FormulaDisplay value={value} />;
    }
    case "FORMULA": {
      const { value, error } = formulaResult(row, prop, ctx);
      return <FormulaDisplay value={value} error={error} />;
    }
    default:
      return null;
  }
}
