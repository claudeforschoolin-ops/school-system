"use client";
import { formatDate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { usePrefs } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";

export default function StructurePage() {
  const prefs = usePrefs();
  const data = trpc.org.structure.useQuery();
  return (
    <SettingsShell title="المراحل والأعوام الدراسية" description="الهيكل الأكاديمي: مرحلة ← صف ← فصل. إدارة الفصول والترقية وإغلاق العام تأتي في المرحلة ٢.">
      {data.isLoading ? <SkeletonLines lines={6} /> : null}
      <SettingsCard title="الأعوام الدراسية">
        <ul className="space-y-3">
          {data.data?.years.map((y) => (
            <li key={y.id}>
              <p className="flex items-center gap-2 text-[14px] font-medium">
                {y.name} {y.isCurrent ? <Tag color="green">الحالي</Tag> : null}
              </p>
              <p className="text-[12px] text-fg-3">
                {formatDate(y.startDate, { digits: prefs.digits, calendar: "both" })} — {formatDate(y.endDate, { digits: prefs.digits })}
              </p>
              {y.terms.length ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {y.terms.map((t) => (
                    <li key={t.id}>
                      <Tag color="slate" dot={false}>{t.name}</Tag>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </SettingsCard>
      <SettingsCard title="المراحل والصفوف">
        <div className="grid gap-4 sm:grid-cols-3">
          {data.data?.stages.map((s) => (
            <div key={s.id}>
              <p className="mb-2 text-[14px] font-medium">{s.name}</p>
              <ul className="space-y-1 text-[13px] text-fg-2">
                {s.grades.map((g) => (
                  <li key={g.id}>{g.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
