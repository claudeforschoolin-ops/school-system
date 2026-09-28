"use client";
import Link from "next/link";
import { segmentBody } from "@/lib/mentions";

/** عرض نص التعليق/الرسالة مع تحويل رموز الإشارة إلى شارات */
export function RichBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={className ?? "whitespace-pre-wrap text-[14px] leading-6 text-fg"}>
      {segmentBody(body).map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.text}</span>
        ) : seg.mention.kind === "user" ? (
          <span key={i} className="rounded px-0.5 font-medium text-teal-700">
            @{seg.mention.label}
          </span>
        ) : (
          <Link key={i} href={seg.mention.kind === "page" ? `/p/${seg.mention.id}` : `/r/${seg.mention.id}`} className="rounded px-0.5 font-medium underline decoration-line-strong underline-offset-2">
            {seg.mention.label}
          </Link>
        ),
      )}
    </p>
  );
}
