"use client";
/**
 * رأس الصفحة: الغلاف (١٨٠px اختياري) + الأيقونة الكبيرة (دائرة ٩٦px) + العنوان ٤٠px قابل للتحرير + الوصف.
 */
import { motion, useScroll, useTransform } from "motion/react";
import { ImagePlus, MessageSquareText, Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSyncedState } from "@/lib/hooks/use-synced-state";
import { pickFile, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { IconPicker } from "./icon-picker";

const COVER_COLORS = ["navy", "teal", "slate", "gold", "green", "brown", "purple", "gray"] as const;

export function coverStyle(cover: string | null | undefined): React.CSSProperties | undefined {
  if (!cover) return undefined;
  if (cover.startsWith("color:")) {
    const c = cover.slice(6);
    return { background: `linear-gradient(0deg, var(--tag-${c}-col), var(--tag-${c}-bg))` };
  }
  return { backgroundImage: `url("${cover.replace(/"/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" };
}

export interface PageHeaderProps {
  title: string;
  icon: string | null;
  cover: string | null;
  description?: string | null;
  editable: boolean;
  onTitle: (title: string) => void;
  onIcon: (icon: string | null) => void;
  onCover: (cover: string | null) => void;
  onDescription?: (description: string | null) => void;
  wide?: boolean;
  autoFocusTitle?: boolean;
  onEnterTitle?: () => void;
  compact?: boolean;
}

export function PageHeader(props: PageHeaderProps) {
  const { title, icon, cover, description, editable, wide, compact } = props;
  const [draft, setDraft] = useSyncedState(title);
  const [descOpen, setDescOpen] = useSyncedState(Boolean(description));
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainer = useRef<HTMLElement | null>(null);
  useEffect(() => {
    scrollContainer.current = document.getElementById("main-scroll");
  }, []);
  const { scrollY } = useScroll({ container: scrollContainer });
  const iconY = useTransform(scrollY, [0, 120], [0, -8]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  useEffect(() => {
    if (props.autoFocusTitle && editable) titleRef.current?.focus();
  }, [props.autoFocusTitle, editable]);

  const commitTitle = () => {
    const value = draft.replace(/\s+/g, " ").trim();
    if (value !== title) props.onTitle(value);
  };

  const width = wide ? "px-6 md:px-24" : "mx-auto max-w-[850px] px-6 md:px-14";

  return (
    <div className="group/header relative">
      {cover ? (
        <div className={cn("group/cover relative w-full", compact ? "h-[120px]" : "h-[180px]")} style={coverStyle(cover)}>
          {editable ? (
            <div className="absolute bottom-3 end-4 flex gap-1 opacity-0 transition-opacity duration-[120ms] group-hover/cover:opacity-100">
              <CoverMenu onCover={props.onCover}>
                <button className="h-7 rounded-md bg-card/90 px-2.5 text-[12px] font-medium text-fg-2 shadow-card backdrop-blur hover:bg-card">تغيير الغلاف</button>
              </CoverMenu>
              <button onClick={() => props.onCover(null)} className="h-7 rounded-md bg-card/90 px-2.5 text-[12px] font-medium text-fg-2 shadow-card backdrop-blur hover:bg-card">
                إزالة
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn(width, cover ? (icon ? "-mt-12" : "mt-6") : compact ? "pt-8" : "pt-16")}>
        {icon ? (
          <motion.div style={{ y: iconY }} className="relative z-[1] mb-3 inline-block">
            <IconPicker value={icon} onChange={props.onIcon}>
              <button
                disabled={!editable}
                className={cn(
                  "grid place-items-center rounded-full bg-hover text-fg-2 ring-4 ring-app transition-colors disabled:cursor-default",
                  compact ? "size-16" : "size-24",
                  editable && "hover:bg-active",
                )}
                aria-label="تغيير الأيقونة"
              >
                <PageIcon icon={icon} size={compact ? 32 : 46} strokeWidth={1.4} />
              </button>
            </IconPicker>
          </motion.div>
        ) : null}

        {editable ? (
          <div className="flex h-7 items-center gap-1 text-[13px] text-fg-3 opacity-0 transition-opacity duration-[120ms] group-hover/header:opacity-100 focus-within:opacity-100">
            {!icon ? (
              <IconPicker value={icon} onChange={props.onIcon}>
                <button className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-hover hover:text-fg-2">
                  <Smile className="size-4" /> إضافة أيقونة
                </button>
              </IconPicker>
            ) : null}
            {!cover ? (
              <button className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-hover hover:text-fg-2" onClick={() => props.onCover(`color:${COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)]}`)}>
                <ImagePlus className="size-4" /> إضافة غلاف
              </button>
            ) : null}
            {props.onDescription && !descOpen ? (
              <button className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-hover hover:text-fg-2" onClick={() => setDescOpen(true)}>
                <MessageSquareText className="size-4" /> إضافة وصف
              </button>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={titleRef}
          value={draft}
          rows={1}
          readOnly={!editable}
          placeholder="بدون عنوان"
          aria-label="عنوان الصفحة"
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
              props.onEnterTitle?.();
            }
          }}
          className={cn(
            "block w-full resize-none overflow-hidden bg-transparent font-bold leading-[1.2] text-fg outline-none placeholder:text-fg-4",
            compact ? "text-[30px]" : "text-[40px]",
          )}
        />
        {props.onDescription && descOpen ? (
          <DescriptionField value={description ?? ""} editable={editable} onSave={(v) => props.onDescription?.(v || null)} />
        ) : null}
      </div>
    </div>
  );
}

function DescriptionField({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useSyncedState(value);
  return (
    <textarea
      value={draft}
      rows={1}
      readOnly={!editable}
      placeholder="أضف وصفاً مختصراً…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft.trim())}
      className="mt-2 block w-full resize-none bg-transparent text-[15px] leading-7 text-fg-3 outline-none [field-sizing:content] placeholder:text-fg-4"
    />
  );
}

function CoverMenu({ onCover, children }: { onCover: (c: string | null) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-3">
        <p className="mb-2 text-[12px] font-medium text-fg-3">ألوان هادئة</p>
        <div className="grid grid-cols-4 gap-2">
          {COVER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                onCover(`color:${c}`);
                setOpen(false);
              }}
              className="h-10 rounded-md shadow-[inset_0_0_0_1px_var(--border)] transition-transform hover:scale-[1.03]"
              style={coverStyle(`color:${c}`)}
              aria-label={c}
            />
          ))}
        </div>
        <button
          className="mt-3 h-8 w-full rounded-md bg-hover text-[13px] font-medium text-fg-2 hover:bg-active"
          onClick={async () => {
            const file = await pickFile("image/png,image/jpeg,image/webp");
            if (!file) return;
            try {
              const u = await uploadFile(file);
              onCover(u.url);
              setOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "تعذر الرفع");
            }
          }}
        >
          رفع صورة غلاف
        </button>
      </PopoverContent>
    </Popover>
  );
}
