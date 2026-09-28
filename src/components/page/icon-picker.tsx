"use client";
/**
 * منتقي الأيقونات: تبويبات «أيقونات» و«رموز» و«صورة مرفوعة».
 */
import { Search, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { pickFile, uploadFile } from "@/lib/upload";
import { cn, matchesSearch } from "@/lib/utils";
import { ICONS } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";

const EMOJI_GROUPS: Array<[string, string[]]> = [
  ["التعليم", ["📚", "📖", "✏️", "📝", "🎓", "🏫", "🧪", "🔬", "🧮", "📐", "📏", "🗂️", "📋", "📌", "🧠", "💡"]],
  ["العمل", ["📊", "📈", "📉", "🗓️", "⏰", "✅", "☑️", "📎", "📁", "🗃️", "💼", "🏢", "🧾", "💰", "🏦", "🔒"]],
  ["التواصل", ["💬", "📣", "📢", "✉️", "📞", "🤝", "👥", "👤", "🙋", "👏", "🌟", "⭐", "🏆", "🎯", "🚀", "🎉"]],
  ["الطبيعة", ["🌱", "🌿", "🌳", "🌸", "☀️", "🌙", "⛅", "🌍", "🕌", "🏠", "🚌", "⚽", "🎨", "🎵", "🩺", "🍎"]],
];

export function IconPicker({ value, onChange, children, align = "start" }: { value: string | null; onChange: (icon: string | null) => void; children: ReactNode; align?: "start" | "end" | "center" }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"icons" | "emoji" | "upload">("icons");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const pick = (icon: string | null) => {
    onChange(icon);
    setOpen(false);
  };
  const icons = ICONS.filter((i) => matchesSearch(`${i.name} ${i.keywords}`, query));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[360px] p-3">
        <div className="flex items-center justify-between gap-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "icons", label: "أيقونات" },
              { value: "emoji", label: "رموز" },
              { value: "upload", label: "صورة" },
            ]}
          />
          {value ? (
            <button className="h-7 rounded-md px-2 text-[13px] text-fg-3 hover:bg-hover hover:text-fg" onClick={() => pick(null)}>
              إزالة
            </button>
          ) : null}
        </div>
        {tab === "icons" ? (
          <>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute start-2 top-2 size-4 text-fg-3" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث: مدرسة، مالية، تقويم…" className="h-8 w-full rounded-md bg-hover ps-8 pe-2 text-[13px] outline-none" />
            </div>
            <div className="thin-scroll mt-2 grid max-h-[240px] grid-cols-9 gap-0.5 overflow-y-auto">
              {icons.map(({ name, icon: Icon, keywords }) => (
                <button
                  key={name}
                  title={keywords}
                  onClick={() => pick(`lucide:${name}`)}
                  className={cn("grid size-9 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover hover:text-fg", value === `lucide:${name}` && "bg-active text-fg")}
                >
                  <Icon className="size-[18px]" strokeWidth={1.7} />
                </button>
              ))}
              {icons.length === 0 ? <p className="col-span-9 py-6 text-center text-[13px] text-fg-3">لا توجد أيقونات مطابقة</p> : null}
            </div>
          </>
        ) : tab === "emoji" ? (
          <div className="thin-scroll mt-3 max-h-[280px] overflow-y-auto">
            {EMOJI_GROUPS.map(([group, list]) => (
              <div key={group} className="mb-2">
                <p className="mb-1 text-[12px] font-medium text-fg-3">{group}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {list.map((e) => (
                    <button key={e} onClick={() => pick(e)} className="grid size-9 place-items-center rounded-md text-[20px] hover:bg-hover">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
            <Upload className="size-6 text-fg-3" strokeWidth={1.5} />
            <p className="text-[13px] text-fg-3">صورة مربعة PNG أو JPG (حتى ٢٠ ميجابايت)</p>
            <button
              disabled={uploading}
              className="h-8 rounded-md bg-card px-3 text-[13px] font-medium shadow-[0_0_0_1px_var(--border)] hover:bg-hover disabled:opacity-50"
              onClick={async () => {
                const file = await pickFile("image/png,image/jpeg,image/webp");
                if (!file) return;
                setUploading(true);
                try {
                  const u = await uploadFile(file);
                  pick(`img:${u.url}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "تعذر الرفع");
                } finally {
                  setUploading(false);
                }
              }}
            >
              {uploading ? "جارٍ الرفع…" : "رفع صورة"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
