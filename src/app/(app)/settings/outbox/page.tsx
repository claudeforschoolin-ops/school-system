"use client";
import { Mail, MessageSquareText } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { usePrefs } from "@/components/shell/app-context";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function OutboxPage() {
  const prefs = usePrefs();
  const list = trpc.org.outbox.useQuery();
  return (
    <SettingsShell title="صندوق الإرسال" description="الرسائل الصادرة (دعوات، رموز الدخول، استعادة كلمة المرور). لا يوجد مزوّد بريد/رسائل مربوط في هذه النسخة، لذا تُحفظ الرسائل هنا.">
      {list.isLoading ? <SkeletonLines lines={6} /> : null}
      {list.data?.length === 0 ? <EmptyState illustration="inbox" title="لا توجد رسائل صادرة" /> : null}
      <ul className="space-y-2">
        {list.data?.map((m) => (
          <li key={m.id} className="rounded-lg p-4 shadow-card">
            <div className="flex items-center gap-2 text-[13px] text-fg-3">
              {m.channel === "email" ? <Mail className="size-4" /> : <MessageSquareText className="size-4" />}
              <span dir="ltr">{m.to}</span>
              <span className="ms-auto">{formatDate(m.createdAt, { digits: prefs.digits, withTime: true })}</span>
            </div>
            {m.subject ? <p className="mt-2 text-[14px] font-medium">{m.subject}</p> : null}
            <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-6 text-fg-2">{m.body}</pre>
          </li>
        ))}
      </ul>
    </SettingsShell>
  );
}
