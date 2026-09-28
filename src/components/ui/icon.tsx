"use client";
/**
 * عرض أيقونة الصفحة أو السجل: "lucide:<name>" أو رمز تعبيري أو "img:<url>".
 */
import { FileText, type LucideIcon } from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";
import { ICON_MAP } from "./icons";

export type IconColor = "default" | "navy" | "teal" | "slate" | "gold" | "muted";

export function resolveLucide(value: string | null | undefined): LucideIcon | null {
  if (!value?.startsWith("lucide:")) return null;
  return ICON_MAP.get(value.slice(7)) ?? null;
}

export function PageIcon({
  icon,
  fallback = FileText,
  className,
  size = 18,
  strokeWidth = 1.7,
}: {
  icon: string | null | undefined;
  fallback?: LucideIcon | null;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  if (icon?.startsWith("img:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon.slice(4)} alt="" width={size} height={size} className={cn("rounded-[4px] object-cover", className)} style={{ width: size, height: size }} />;
  }
  // المكوّنات من سجل ثابت على مستوى الوحدة (مراجع مستقرة)، فلا يُعاد تركيبها بين العرضات
  const lucide = resolveLucide(icon);
  if (lucide) return createElement(lucide, { size, strokeWidth, className: cn("shrink-0", className), "aria-hidden": true });
  if (icon && !icon.startsWith("lucide:")) {
    return (
      <span className={cn("inline-grid shrink-0 place-items-center leading-none", className)} style={{ fontSize: size * 0.95, width: size, height: size }} aria-hidden>
        {icon}
      </span>
    );
  }
  if (!fallback) return null;
  return createElement(fallback, { size, strokeWidth, className: cn("shrink-0 text-fg-3", className), "aria-hidden": true });
}
