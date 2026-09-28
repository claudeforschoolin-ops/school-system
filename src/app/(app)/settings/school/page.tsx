"use client";
import { useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";

const CURRENCIES = ["SAR", "AED", "KWD", "BHD", "QAR", "OMR", "EGP", "JOD", "USD"];
const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "Africa/Cairo", "Asia/Amman"];

type SchoolSettings = RouterOutputs["org"]["settings"];

export default function SchoolSettingsPage() {
  const settings = trpc.org.settings.useQuery();
  if (!settings.data) return <SettingsShell title="المدرسة"><SkeletonLines lines={8} /></SettingsShell>;
  return <SchoolSettingsForm initial={settings.data} />;
}

/** النموذج يبدأ من القيم المحفوظة ويحتفظ بتعديلات المستخدم حتى الحفظ */
function SchoolSettingsForm({ initial }: { initial: SchoolSettings }) {
  const { can } = useApp();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<SchoolSettings>(initial);
  const save = trpc.org.updateSettings.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.org.settings.invalidate(), utils.account.context.invalidate()]);
      toast.success("حُفظت إعدادات المدرسة");
    },
  });
  const editable = can("settings", "update");
  const s = form.settings;
  const policy = s.passwordPolicy!;
  const submit = () =>
    save.mutate({
      name: form.name,
      platformName: form.platformName,
      accentColor: form.accentColor,
      currency: form.currency,
      timezone: form.timezone,
      settings: {
        address: s.address ?? "",
        phone: s.phone ?? "",
        email: s.email ?? "",
        website: s.website ?? "",
        taxNumber: s.taxNumber ?? "",
        crNumber: s.crNumber ?? "",
        defaultDigits: s.defaultDigits ?? "arab",
        defaultCalendar: s.defaultCalendar ?? "both",
        ...(can("security", "update") ? { passwordPolicy: policy } : {}),
      },
    });
  const setS = (patch: Partial<typeof s>) => setForm({ ...form, settings: { ...s, ...patch } });
  return (
    <SettingsShell
      title="المدرسة"
      description="الهوية والبيانات الرسمية التي تظهر في الشريط الجانبي وتسجيل الدخول والتقارير والفواتير."
      actions={editable ? <Button variant="primary" loading={save.isPending} onClick={submit}>حفظ</Button> : null}
    >
      <SettingsCard title="الهوية">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المدرسة أو المجموعة">
            <Input value={form.name} disabled={!editable} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="اسم المنصة" hint="يظهر في الشريط الجانبي وشاشة الدخول.">
            <Input value={form.platformName} disabled={!editable} onChange={(e) => setForm({ ...form, platformName: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-fg-2">لون التمييز (من الألوان الرسمية فقط)</span>
            <div className="flex gap-2">
              {(["navy", "teal", "slate"] as const).map((c) => (
                <button
                  key={c}
                  disabled={!editable}
                  onClick={() => setForm({ ...form, accentColor: c })}
                  className={cn("h-9 w-20 rounded-md ring-offset-2 ring-offset-app", form.accentColor === c && "ring-2 ring-navy-600")}
                  style={{ background: `var(--tag-${c}-dot)` }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
      <SettingsCard title="البيانات الرسمية">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العنوان"><Input value={s.address ?? ""} disabled={!editable} onChange={(e) => setS({ address: e.target.value })} /></Field>
          <Field label="الهاتف"><Input value={s.phone ?? ""} dir="ltr" disabled={!editable} onChange={(e) => setS({ phone: e.target.value })} /></Field>
          <Field label="البريد"><Input value={s.email ?? ""} dir="ltr" disabled={!editable} onChange={(e) => setS({ email: e.target.value })} /></Field>
          <Field label="الموقع الإلكتروني"><Input value={s.website ?? ""} dir="ltr" disabled={!editable} onChange={(e) => setS({ website: e.target.value })} /></Field>
          <Field label="الرقم الضريبي"><Input value={s.taxNumber ?? ""} dir="ltr" disabled={!editable} onChange={(e) => setS({ taxNumber: e.target.value })} /></Field>
          <Field label="السجل التجاري / الترخيص"><Input value={s.crNumber ?? ""} dir="ltr" disabled={!editable} onChange={(e) => setS({ crNumber: e.target.value })} /></Field>
        </div>
      </SettingsCard>
      <SettingsCard title="الإعدادات الإقليمية" description="العملة الافتراضية للمبالغ، والمنطقة الزمنية للتواريخ والتقارير.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العملة"><Select value={form.currency} disabled={!editable} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="المنطقة الزمنية"><Select value={form.timezone} disabled={!editable} onChange={(v) => setForm({ ...form, timezone: v })} options={TIMEZONES.map((t) => ({ value: t, label: t }))} /></Field>
          <Field label="الأرقام الافتراضية للمستخدمين الجدد"><Select value={s.defaultDigits ?? "arab"} disabled={!editable} onChange={(v) => setS({ defaultDigits: v as "arab" })} options={[{ value: "arab", label: "عربية ١٢٣" }, { value: "latn", label: "لاتينية 123" }]} /></Field>
          <Field label="التقويم الافتراضي"><Select value={s.defaultCalendar ?? "both"} disabled={!editable} onChange={(v) => setS({ defaultCalendar: v as "both" })} options={[{ value: "gregory", label: "ميلادي" }, { value: "hijri", label: "هجري" }, { value: "both", label: "كلاهما" }]} /></Field>
        </div>
      </SettingsCard>
      <SettingsCard title="سياسة كلمات المرور وقفل الحساب" description={can("security", "update") ? "تُطبق على كل المستخدمين عند تعيين كلمة مرور جديدة." : "تعديلها يتطلب صلاحية «الأمان والتشفير»."}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الحد الأدنى للطول"><Input type="number" min={8} value={policy.minLength} disabled={!can("security", "update")} onChange={(e) => setS({ passwordPolicy: { ...policy, minLength: Number(e.target.value) } })} /></Field>
          <Field label="المحاولات قبل القفل"><Input type="number" min={3} value={policy.maxFailedAttempts} disabled={!can("security", "update")} onChange={(e) => setS({ passwordPolicy: { ...policy, maxFailedAttempts: Number(e.target.value) } })} /></Field>
          <Field label="مدة القفل (دقيقة)"><Input type="number" min={1} value={policy.lockMinutes} disabled={!can("security", "update")} onChange={(e) => setS({ passwordPolicy: { ...policy, lockMinutes: Number(e.target.value) } })} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-[14px]">
          {([["requireLetters", "حروف"], ["requireDigits", "أرقام"], ["requireSymbols", "رموز خاصة"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <Switch size="sm" checked={policy[k]} disabled={!can("security", "update")} onChange={(v) => setS({ passwordPolicy: { ...policy, [k]: v } })} />
              تتطلب {label}
            </label>
          ))}
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
