"use client";
/**
 * النوافذ المنبثقة: خلفية معتمة تتلاشى + النافذة تكبر من ٠.٩٨ إلى ١ (١٦٠ms).
 */
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  children,
  className,
  title,
  description,
  hideClose,
  width = 520,
  onOpenAutoFocus,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  hideClose?: boolean;
  width?: number;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  return (
    <D.Portal>
      <D.Overlay className="anim-overlay fixed inset-0 z-50 bg-overlay" />
      <D.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "anim-pop fixed left-1/2 top-[14vh] z-50 max-h-[76vh] w-[calc(100vw-24px)] -translate-x-1/2 overflow-y-auto rounded-xl bg-elevated shadow-popover outline-none thin-scroll",
          className,
        )}
        style={{ maxWidth: width }}
      >
        {title ? (
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
            <div>
              <D.Title className="text-[18px] font-medium leading-snug text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[14px] leading-6 text-fg-3">{description}</D.Description> : null}
            </div>
            {!hideClose ? (
              <D.Close className="grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg" aria-label="إغلاق">
                <X className="size-4" />
              </D.Close>
            ) : null}
          </div>
        ) : (
          <D.Title className="sr-only">نافذة</D.Title>
        )}
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-line px-5 py-3", className)}>{children}</div>;
}

/** نافذة تأكيد بسيطة */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد",
  danger,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} width={420}>
        <DialogFooter className="mt-3">
          <D.Close asChild>
            <button className="h-8 rounded-md px-3 text-[14px] text-fg-2 hover:bg-hover">إلغاء</button>
          </D.Close>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-8 rounded-md px-3 text-[14px] font-medium text-white disabled:opacity-50",
              danger ? "bg-danger-700 hover:opacity-90" : "bg-navy-700 hover:bg-navy-600",
            )}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
