"use client";
/** تبويب أنشطة الطالب في ملفه: الأنشطة المسجل فيها وحالة التسجيل والموافقة */
import Link from "next/link";
import { ACTIVITY_KIND, ACTIVITY_STATUS, CONSENT_STATUS, REGISTRATION_STATUS } from "@/lib/students";
import { formatDate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { usePrefs } from "@/components/shell/app-context";

export function StudentActivitiesTab({ studentId }: { studentId: string }) {
  const prefs = usePrefs();
  const q = trpc.activities.student.useQuery({ studentId });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الأنشطة" description={q.error.message} compact />;
  if (!q.data) return <SkeletonLines lines={6} />;
  if (!q.data.length) return <EmptyState compact title="لم يشارك في أنشطة بعد" description="يُسجَّل الطالب من صفحة النشاط ← «تسجيل طلاب»." action={<Link href="/activities" className="text-[14px] font-medium text-navy-700 underline">الأنشطة والفعاليات</Link>} />;
  return (
    <section className="rounded-lg bg-card shadow-card">
      <ul className="divide-y divide-line">
        {q.data.map((r) => (
          <li key={r.id}>
            <Link href={`/activities/${r.activity.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-hover">
              <Tag color={ACTIVITY_KIND[r.activity.kind].color} size="sm">
                {ACTIVITY_KIND[r.activity.kind].label}
              </Tag>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.activity.title}</span>
                <span className="block text-[12px] text-fg-3">
                  {r.activity.startAt ? formatDate(r.activity.startAt, { digits: prefs.digits, calendar: prefs.calendar }) : "بلا موعد"}
                  {r.activity.location ? ` · ${r.activity.location}` : ""} · {ACTIVITY_STATUS[r.activity.status].label}
                </span>
              </span>
              <Tag color={REGISTRATION_STATUS[r.status as keyof typeof REGISTRATION_STATUS].color} size="sm">
                {REGISTRATION_STATUS[r.status as keyof typeof REGISTRATION_STATUS].label}
              </Tag>
              {r.activity.requiresConsent ? (
                <Tag color={CONSENT_STATUS[r.consentStatus as keyof typeof CONSENT_STATUS].color} size="sm">
                  {CONSENT_STATUS[r.consentStatus as keyof typeof CONSENT_STATUS].label}
                </Tag>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
