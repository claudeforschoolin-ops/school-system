"use client";
/**
 * منتقي الطالب: بحث بالاسم أو الرقم الأكاديمي أو آخر ٤ أرقام من الهوية.
 */
import { Check, ChevronDown, HeartPulse, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

export interface PickedStudent {
  id: string;
  fullName: string;
  academicNumber: string;
  grade?: { name: string } | null;
  section?: { name: string } | null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function StudentPicker({ value, onChange, placeholder = "ابحث عن طالب…", disabled }: { value: PickedStudent | null; onChange: (s: PickedStudent | null) => void; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 200);
  const results = trpc.students.search.useQuery({ query: q, limit: 12 }, { enabled: open && q.trim().length > 0, placeholderData: (p) => p });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md bg-card px-2.5 text-start text-[14px] shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_var(--border-strong)] disabled:opacity-60"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={value.fullName} size={20} />
              <span className="truncate">{value.fullName}</span>
              <span className="shrink-0 text-[12px] text-fg-3 tabular">{value.academicNumber}</span>
            </span>
          ) : (
            <span className="text-fg-3">{placeholder}</span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-fg-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-1">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم، الرقم الأكاديمي، أو آخر ٤ أرقام من الهوية" className="h-8 w-full rounded-md bg-hover pe-8 ps-8 text-[13px] outline-none" />
          {results.isFetching ? <Spinner className="absolute end-2.5 top-2.5 size-3.5" /> : null}
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {!q.trim() ? <p className="px-2 py-3 text-center text-[12px] text-fg-3">اكتب للبحث</p> : null}
          {q.trim() && results.data?.length === 0 ? <p className="px-2 py-3 text-center text-[12px] text-fg-3">لا نتائج</p> : null}
          {results.data?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-hover", value?.id === s.id && "bg-active")}
            >
              <Avatar name={s.fullName} size={24} src={s.photoUrl} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-[13px] font-medium">
                  {s.fullName}
                  {s.criticalHealth ? <HeartPulse className="size-3.5 shrink-0 text-danger-700" aria-label="حالة صحية حرجة" /> : null}
                </span>
                <span className="block truncate text-[11px] text-fg-3">
                  {s.academicNumber} · {s.grade?.name}
                  {s.section ? ` / ${s.section.name}` : ""}
                </span>
              </span>
              {value?.id === s.id ? <Check className="size-4 text-fg-2" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
