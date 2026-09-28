"use client";
/** زر المساعدة العائم (٤٨px) في الطرف المقابل للشريط الجانبي */
import { BookOpen, CircleHelp, Keyboard, LifeBuoy, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd, modKey } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SHORTCUTS: Array<[string, string[]]> = [
  ["لوحة الأوامر والبحث", ["mod", "K"]],
  ["محادثة جديدة", ["mod", "O"]],
  ["طي/إظهار الشريط الجانبي", ["mod", "\\"]],
  ["قائمة الكتل في المحرر", ["/"]],
  ["الإشارة إلى زميل أو صفحة", ["@"]],
  ["عنوان رئيسي في المحرر", ["#", "مسافة"]],
  ["قائمة نقطية", ["-", "مسافة"]],
  ["مهام قابلة للتحديد", ["[]", "مسافة"]],
  ["غامق / مائل", ["mod", "B / I"]],
  ["تراجع / إعادة", ["mod", "Z / Y"]],
  ["اختصارات لوحة المفاتيح", ["?"]],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const mod = modKey();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="اختصارات لوحة المفاتيح" width={460}>
        <ul className="px-5 pb-5">
          {SHORTCUTS.map(([label, keys]) => (
            <li key={label} className="flex h-9 items-center justify-between border-b border-line/60 text-[14px] last:border-0">
              <span className="text-fg-2">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k === "mod" ? mod : k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function FloatingHelp({ onShortcuts }: { onShortcuts: () => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] text-fg hover:bg-hover";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="المساعدة"
          className="no-print fixed bottom-5 end-5 z-30 grid size-12 place-items-center rounded-full bg-card text-fg-2 shadow-[0_0_0_1px_var(--border),0_4px_14px_rgba(15,23,42,.10)] transition-[transform,box-shadow,color] duration-[140ms] hover:-translate-y-px hover:text-fg hover:shadow-[0_0_0_1px_var(--border-strong),0_6px_18px_rgba(15,23,42,.14)] max-md:hidden"
        >
          {open ? <X className="size-5" /> : <CircleHelp className="size-5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-60 p-1.5">
        <Link href="/help" className={item} onClick={() => setOpen(false)}>
          <BookOpen className="size-4 text-fg-3" />
          دليل استخدام المنصة
        </Link>
        <button
          className={`${item} w-full`}
          onClick={() => {
            setOpen(false);
            onShortcuts();
          }}
        >
          <Keyboard className="size-4 text-fg-3" />
          اختصارات لوحة المفاتيح
        </button>
        <Link href="/help#support" className={item} onClick={() => setOpen(false)}>
          <LifeBuoy className="size-4 text-fg-3" />
          الدعم الفني
        </Link>
      </PopoverContent>
    </Popover>
  );
}
