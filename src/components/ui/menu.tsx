"use client";
/**
 * القوائم المنسدلة وقوائم النقر الأيمن (Radix) بتلاشي + انزلاق ٤px.
 */
import { ContextMenu as CM, DropdownMenu as DM } from "radix-ui";
import { Check, ChevronLeft } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const contentClass =
  "anim-menu z-50 min-w-[200px] overflow-hidden rounded-[10px] bg-elevated p-1 text-[14px] text-fg shadow-popover outline-none";
const itemClass =
  "relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 outline-none transition-colors duration-[120ms] data-[disabled]:pointer-events-none data-[highlighted]:bg-hover data-[disabled]:opacity-40";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;
export const MenuSub = DM.Sub;
export const MenuRadioGroup = DM.RadioGroup;

export const MenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DM.Content>>(function MenuContent(
  { className, sideOffset = 6, align = "start", ...props },
  ref,
) {
  return (
    <DM.Portal>
      <DM.Content ref={ref} sideOffset={sideOffset} align={align} className={cn(contentClass, className)} {...props} />
    </DM.Portal>
  );
});

interface ItemProps extends ComponentPropsWithoutRef<typeof DM.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  danger?: boolean;
}

export const MenuItem = forwardRef<HTMLDivElement, ItemProps>(function MenuItem({ className, icon, shortcut, danger, children, ...props }, ref) {
  return (
    <DM.Item ref={ref} className={cn(itemClass, danger && "text-danger-700", className)} {...props}>
      {icon ? <span className={cn("grid size-4 place-items-center text-fg-2", danger && "text-danger-700")}>{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="text-[12px] text-fg-3">{shortcut}</span> : null}
    </DM.Item>
  );
});

export function MenuCheckItem({ checked, onCheckedChange, children, icon }: { checked: boolean; onCheckedChange: (v: boolean) => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <DM.CheckboxItem checked={checked} onCheckedChange={onCheckedChange} className={itemClass} onSelect={(e) => e.preventDefault()}>
      {icon ? <span className="grid size-4 place-items-center text-fg-2">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      <DM.ItemIndicator>
        <Check className="size-4 text-fg-2" />
      </DM.ItemIndicator>
    </DM.CheckboxItem>
  );
}

export function MenuRadioItem({ value, children, icon }: { value: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <DM.RadioItem value={value} className={itemClass}>
      {icon ? <span className="grid size-4 place-items-center text-fg-2">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      <DM.ItemIndicator>
        <Check className="size-4 text-fg-2" />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function MenuSeparator() {
  return <DM.Separator className="-mx-1 my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pb-1 pt-1.5 text-[12px] font-medium text-fg-3">{children}</DM.Label>;
}

export function MenuSubTrigger({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <DM.SubTrigger className={cn(itemClass, "data-[state=open]:bg-hover")}>
      {icon ? <span className="grid size-4 place-items-center text-fg-2">{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      <ChevronLeft className="size-3.5 text-fg-3" />
    </DM.SubTrigger>
  );
}

export function MenuSubContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DM.Portal>
      <DM.SubContent sideOffset={4} className={cn(contentClass, className)}>
        {children}
      </DM.SubContent>
    </DM.Portal>
  );
}

// ---------------------------------------------------------------- النقر الأيمن
export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <CM.Portal>
      <CM.Content className={cn(contentClass, className)}>{children}</CM.Content>
    </CM.Portal>
  );
}

export function ContextMenuItem({ children, icon, danger, onSelect, shortcut }: { children: ReactNode; icon?: ReactNode; danger?: boolean; onSelect?: () => void; shortcut?: ReactNode }) {
  return (
    <CM.Item className={cn(itemClass, danger && "text-danger-700")} onSelect={onSelect}>
      {icon ? <span className={cn("grid size-4 place-items-center text-fg-2", danger && "text-danger-700")}>{icon}</span> : null}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="text-[12px] text-fg-3">{shortcut}</span> : null}
    </CM.Item>
  );
}

export function ContextMenuSeparator() {
  return <CM.Separator className="-mx-1 my-1 h-px bg-line" />;
}
