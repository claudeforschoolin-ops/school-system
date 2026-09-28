"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useApp, type Prefs } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";

export default function AppearancePage() {
  const { prefs, setPrefs, tenant } = useApp();
  const option = <T extends string>(value: T, current: T, onClick: (v: T) => void, label: React.ReactNode, preview?: React.ReactNode) => (
    <button
      key={value}
      onClick={() => onClick(value)}
      className={cn("flex flex-1 flex-col items-center gap-2 rounded-lg p-3 text-[13px] transition-colors", current === value ? "bg-teal-50 text-teal-700 shadow-[0_0_0_1px_var(--teal-500)]" : "text-fg-2 shadow-[0_0_0_1px_var(--border)] hover:bg-hover")}
    >
      {preview}
      {label}
    </button>
  );
  const now = new Date();
  return (
    <SettingsShell title="المظهر والتفضيلات" description="تُحفظ تفضيلاتك في حسابك وتُطبق على كل أجهزتك.">
      <SettingsCard title="المظهر">
        <div className="flex gap-3">
          {(["light", "dark", "system"] as Prefs["theme"][]).map((t) =>
            option(t, prefs.theme, (v) => setPrefs({ theme: v }), t === "light" ? "فاتح" : t === "dark" ? "داكن" : "تلقائي (حسب الجهاز)", t === "light" ? <Sun className="size-5" /> : t === "dark" ? <Moon className="size-5" /> : <Monitor className="size-5" />),
          )}
        </div>
      </SettingsCard>
      <SettingsCard title="الأرقام" description="طريقة عرض الأرقام في كل الشاشات والتقارير.">
        <div className="flex gap-3">
          {option("arab", prefs.digits, (v) => setPrefs({ digits: v }), "أرقام عربية", <span className="text-[20px] font-bold tabular">١٢٣٤</span>)}
          {option("latn", prefs.digits, (v) => setPrefs({ digits: v }), "أرقام لاتينية", <span className="text-[20px] font-bold tabular">1234</span>)}
        </div>
        <p className="mt-3 text-[13px] text-fg-3">مثال: {formatMoney(1234550, { currency: tenant.currency, digits: prefs.digits })}</p>
      </SettingsCard>
      <SettingsCard title="التقويم" description="التاريخ المعروض في الصفحات والجداول.">
        <div className="flex gap-3">
          {option("gregory", prefs.calendar, (v) => setPrefs({ calendar: v }), "ميلادي")}
          {option("hijri", prefs.calendar, (v) => setPrefs({ calendar: v }), "هجري (أم القرى)")}
          {option("both", prefs.calendar, (v) => setPrefs({ calendar: v }), "كلاهما")}
        </div>
        <p className="mt-3 text-[13px] text-fg-3">اليوم: {formatDate(now, { calendar: prefs.calendar, digits: prefs.digits, style: "full" })}</p>
      </SettingsCard>
      <SettingsCard title="الحركة">
        <label className="flex items-center justify-between text-[14px]">
          <span>
            تقليل الحركة
            <span className="block text-[13px] text-fg-3">يعطّل الحركات غير الضرورية (يُحترم أيضاً إعداد نظام التشغيل تلقائياً).</span>
          </span>
          <Switch checked={prefs.reducedMotion} onChange={(v) => setPrefs({ reducedMotion: v })} />
        </label>
      </SettingsCard>
    </SettingsShell>
  );
}
