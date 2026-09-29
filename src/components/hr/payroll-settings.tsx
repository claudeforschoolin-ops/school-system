"use client";
/**
 * إعدادات الرواتب: كل قاعدة قابلة للتعديل لأي دولة — أنظمة التأمين، الإضافي، سقف الاستقطاعات،
 * مكافأة نهاية الخدمة وجدول الاستقالة، الإجازة بالأقدمية، ملف تحويل الرواتب، ومعالجة الجزاءات.
 * القيم الافتراضية لنظام العمل السعودي كنقطة بداية.
 */
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { COUNTRY_PRESETS } from "@/lib/region";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useRegion } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { MoneyInput, PercentInput } from "@/components/finance/common";
import { hrNav, PAYROLL_TABS } from "./common";

type WageBasis = "FULL" | "BASIC" | "BASIC_HOUSING";
interface HrSettingsValues {
  insuranceSchemes: Array<{ name: string; appliesTo: "CITIZEN" | "NON_CITIZEN" | "ALL"; employeeBp: number; employerBp: number }>;
  insuranceBase: WageBasis;
  insuranceCapMinor: number;
  deductAbsence: boolean;
  deductLate: boolean;
  lateMonthlyGraceMinutes: number;
  overtimeMode: "PREMIUM_ON_BASIC" | "FULL_WAGE";
  overtimeRateBp: number;
  overtimeMinMinutes: number;
  monthDays: number;
  deductionCapBp: number;
  expiryAlertDays: number;
  eosEnabled: boolean;
  eosFirstYears: number;
  eosFirstYearsMonthsBp: number;
  eosLaterYearsMonthsBp: number;
  eosWageBasis: WageBasis;
  eosResignation: Array<{ minYears: number; factorBp: number }>;
  eosYearDays: number;
  accrueEosMonthly: boolean;
  seniorLeaveDays: number;
  seniorLeaveAfterYears: number;
  wpsDelimiter: "COMMA" | "SEMICOLON" | "TAB";
  wpsEmployerId: string;
  wpsIncludeHeader: boolean;
  penaltiesTreatment: "REDUCE_EXPENSE" | "LIABILITY";
  loanMaxSalaries: number;
  leaveEncashmentBasis: WageBasis;
}

const WAGE_OPTIONS = [
  { value: "FULL", label: "الأجر الفعلي (أساسي + كل البدلات الثابتة)" },
  { value: "BASIC_HOUSING", label: "الأساسي + السكن" },
  { value: "BASIC", label: "الأساسي فقط" },
];
const APPLIES = [
  { value: "CITIZEN", label: "المواطنون" },
  { value: "NON_CITIZEN", label: "غير المواطنين" },
  { value: "ALL", label: "الجميع" },
];

export function PayrollSettingsPage() {
  const q = trpc.moduleSettings.get.useQuery({ key: "hr" });
  return (
    <ModuleShell nav={hrNav("payroll")} tabs={PAYROLL_TABS}>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الإعدادات" description={q.error.message} /> : q.data ? <HrSettingsForm key={JSON.stringify(q.data.values)} initial={q.data.values as unknown as HrSettingsValues} canEdit={q.data.canEdit} /> : <SkeletonLines lines={10} />}
    </ModuleShell>
  );
}

function HrSettingsForm({ initial, canEdit }: { initial: HrSettingsValues; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const region = useRegion();
  const country = COUNTRY_PRESETS[region.country]?.name ?? region.country;
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({ onSuccess: async () => (await Promise.all([utils.moduleSettings.get.invalidate({ key: "hr" }), utils.account.context.invalidate()]), toast.success("حُفظت إعدادات الرواتب")), onError: (e) => toast.error(e.message) });
  const int = (s: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(s) || 0)));
  const set = (patch: Partial<HrSettingsValues>) => setV({ ...v, ...patch });
  const saveBtn = canEdit ? (
    <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "hr", patch: { ...v } })}>
      حفظ
    </Button>
  ) : undefined;
  const setScheme = (i: number, patch: Partial<HrSettingsValues["insuranceSchemes"][number]>) => set({ insuranceSchemes: v.insuranceSchemes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setTier = (i: number, patch: Partial<HrSettingsValues["eosResignation"][number]>) => set({ eosResignation: v.eosResignation.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div>
      {!canEdit ? <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: التعديل لمدير الموارد البشرية.</p> : null}
      <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">
        القيم الافتراضية مطابقة لنظام العمل السعودي كنقطة بداية. عدّلها وفق أنظمة دولتك ({country}) وعقود منشأتك؛ «المواطن» هو من يحمل جنسية دولة المدرسة المحددة في إعدادات الإقليم.
      </p>

      <SettingsCard title="التأمينات الاجتماعية" description="أضف نظاماً لكل اشتراك (تقاعد، أخطار مهنية، تعطل…) وحدد على من يُطبق. تُجمع نسب الأنظمة المنطبقة على كل موظف.">
        <div className="space-y-2">
          {v.insuranceSchemes.map((x, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_120px_120px_36px]">
              <Field label="اسم النظام">
                <Input disabled={!canEdit} value={x.name} onChange={(e) => setScheme(i, { name: e.target.value })} />
              </Field>
              <Field label="يُطبق على">
                <Select disabled={!canEdit} value={x.appliesTo} onChange={(appliesTo) => setScheme(i, { appliesTo: appliesTo as "ALL" })} options={APPLIES} />
              </Field>
              <Field label="على الموظف ٪">
                <PercentInput disabled={!canEdit} bp={x.employeeBp} onChange={(employeeBp) => setScheme(i, { employeeBp })} />
              </Field>
              <Field label="على المنشأة ٪">
                <PercentInput disabled={!canEdit} bp={x.employerBp} onChange={(employerBp) => setScheme(i, { employerBp })} />
              </Field>
              <Button variant="ghost" size="sm" disabled={!canEdit} aria-label="حذف النظام" onClick={() => set({ insuranceSchemes: v.insuranceSchemes.filter((_, j) => j !== i) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!v.insuranceSchemes.length ? <p className="text-[13px] text-fg-3">لا تأمينات: لن تُستقطع أي نسبة.</p> : null}
          {canEdit && v.insuranceSchemes.length < 6 ? (
            <Button size="sm" variant="ghost" onClick={() => set({ insuranceSchemes: [...v.insuranceSchemes, { name: "نظام جديد", appliesTo: "ALL", employeeBp: 0, employerBp: 0 }] })}>
              <Plus className="size-4" /> إضافة نظام
            </Button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="الأجر الخاضع للتأمينات">
            <Select disabled={!canEdit} value={v.insuranceBase} onChange={(insuranceBase) => set({ insuranceBase: insuranceBase as WageBasis })} options={WAGE_OPTIONS} />
          </Field>
          <Field label="سقف الأجر الخاضع" hint="صفر = بلا سقف">
            <MoneyInput disabled={!canEdit} value={v.insuranceCapMinor} onChange={(a) => set({ insuranceCapMinor: a ?? 0 })} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="الحضور والإضافي والاستقطاعات">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.deductAbsence} onChange={(deductAbsence) => set({ deductAbsence })} /> خصم الغياب بأجر اليوم
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.deductLate} onChange={(deductLate) => set({ deductLate })} /> خصم التأخر بالدقيقة
          </label>
          <Field label="مهلة التأخر الشهرية (دقيقة)">
            <Input disabled={!canEdit} type="number" value={v.lateMonthlyGraceMinutes} onChange={(e) => set({ lateMonthlyGraceMinutes: int(e.target.value, 0, 600) })} />
          </Field>
          <Field label="أيام الشهر لأجر اليوم">
            <Input disabled={!canEdit} type="number" value={v.monthDays} onChange={(e) => set({ monthDays: int(e.target.value, 22, 31) })} />
          </Field>
          <Field label="طريقة أجر الساعة الإضافية">
            <Select
              disabled={!canEdit}
              value={v.overtimeMode}
              onChange={(overtimeMode) => set({ overtimeMode: overtimeMode as "FULL_WAGE" })}
              options={[
                { value: "PREMIUM_ON_BASIC", label: "أجر الساعة الفعلي + علاوة على الأساسي" },
                { value: "FULL_WAGE", label: "أجر الساعة الفعلي × المعامل" },
              ]}
            />
          </Field>
          <Field label="معامل الإضافي ٪" hint="١٥٠٪ = مرة ونصف">
            <PercentInput disabled={!canEdit} bp={v.overtimeRateBp} onChange={(overtimeRateBp) => set({ overtimeRateBp: Math.max(10000, overtimeRateBp) })} />
          </Field>
          <Field label="يُسجَّل الإضافي بعد (دقيقة من نهاية الدوام)">
            <Input disabled={!canEdit} type="number" value={v.overtimeMinMinutes} onChange={(e) => set({ overtimeMinMinutes: int(e.target.value, 0, 240) })} />
          </Field>
          <Field label="سقف السلف والجزاءات من الأجر ٪" hint="الافتراضي ٥٠٪">
            <PercentInput disabled={!canEdit} bp={v.deductionCapBp} onChange={(deductionCapBp) => set({ deductionCapBp: Math.max(1000, Math.min(10000, deductionCapBp)) })} />
          </Field>
          <Field label="أقصى السلفة (عدد الرواتب الأساسية)" hint="صفر = بلا حد">
            <Input disabled={!canEdit} type="number" value={v.loanMaxSalaries} onChange={(e) => set({ loanMaxSalaries: int(e.target.value, 0, 24) })} />
          </Field>
          <Field label="معالجة الجزاءات المستقطعة">
            <Select
              disabled={!canEdit}
              value={v.penaltiesTreatment}
              onChange={(penaltiesTreatment) => set({ penaltiesTreatment: penaltiesTreatment as "LIABILITY" })}
              options={[
                { value: "REDUCE_EXPENSE", label: "تخفيض مصروف الرواتب" },
                { value: "LIABILITY", label: "التزام يُودع لصندوق/جهة (حساب 2190)" },
              ]}
            />
          </Field>
          <Field label="التنبيه قبل انتهاء الوثائق (يوم)">
            <Input disabled={!canEdit} type="number" value={v.expiryAlertDays} onChange={(e) => set({ expiryAlertDays: int(e.target.value, 7, 180) })} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="الإجازة السنوية بالأقدمية" description="الاستحقاق الأساسي من «أنواع الإجازات». هنا الزيادة بعد عدد من سنوات الخدمة.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الأيام بعد الأقدمية" hint="صفر = بلا زيادة">
            <Input disabled={!canEdit} type="number" value={v.seniorLeaveDays} onChange={(e) => set({ seniorLeaveDays: int(e.target.value, 0, 60) })} />
          </Field>
          <Field label="بعد (سنوات خدمة)">
            <Input disabled={!canEdit} type="number" value={v.seniorLeaveAfterYears} onChange={(e) => set({ seniorLeaveAfterYears: int(e.target.value, 0, 40) })} />
          </Field>
          <Field label="أساس بدل الإجازة عند التصفية">
            <Select disabled={!canEdit} value={v.leaveEncashmentBasis} onChange={(leaveEncashmentBasis) => set({ leaveEncashmentBasis: leaveEncashmentBasis as WageBasis })} options={WAGE_OPTIONS} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="مكافأة نهاية الخدمة" description="معدل (من أجر الشهر) لكل سنة من السنوات الأولى ومعدل لما بعدها، وجدول نسب الاستحقاق عند الاستقالة.">
        <label className="mb-3 flex items-center gap-2 text-[14px]">
          <Checkbox disabled={!canEdit} checked={v.eosEnabled} onChange={(eosEnabled) => set({ eosEnabled })} /> تفعيل مكافأة نهاية الخدمة (عطّلها إن كان نظام دولتك يعتمد صندوق تقاعد بديلاً)
        </label>
        {v.eosEnabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="عدد السنوات الأولى">
                <Input disabled={!canEdit} type="number" value={v.eosFirstYears} onChange={(e) => set({ eosFirstYears: int(e.target.value, 0, 40) })} />
              </Field>
              <Field label="من أجر الشهر لكل سنة (الأولى) ٪" hint="٥٠٪ = نصف شهر">
                <PercentInput disabled={!canEdit} bp={v.eosFirstYearsMonthsBp} onChange={(eosFirstYearsMonthsBp) => set({ eosFirstYearsMonthsBp })} />
              </Field>
              <Field label="من أجر الشهر لكل سنة (بعدها) ٪">
                <PercentInput disabled={!canEdit} bp={v.eosLaterYearsMonthsBp} onChange={(eosLaterYearsMonthsBp) => set({ eosLaterYearsMonthsBp })} />
              </Field>
              <Field label="أجر المكافأة">
                <Select disabled={!canEdit} value={v.eosWageBasis} onChange={(eosWageBasis) => set({ eosWageBasis: eosWageBasis as WageBasis })} options={WAGE_OPTIONS} />
              </Field>
              <Field label="أيام السنة">
                <Input disabled={!canEdit} type="number" value={v.eosYearDays} onChange={(e) => set({ eosYearDays: int(e.target.value, 360, 366) })} />
              </Field>
              <label className="flex items-center gap-2 text-[14px]">
                <Checkbox disabled={!canEdit} checked={v.accrueEosMonthly} onChange={(accrueEosMonthly) => set({ accrueEosMonthly })} /> تكوين المخصص شهرياً مع المسير
              </label>
            </div>
            <h4 className="mb-2 mt-5 text-[13px] font-semibold text-fg-2">الاستحقاق عند الاستقالة</h4>
            <div className="space-y-2">
              {v.eosResignation.map((t, i) => (
                <div key={i} className="grid max-w-md items-end gap-2 sm:grid-cols-[1fr_1fr_36px]">
                  <Field label="من (سنوات خدمة)">
                    <Input disabled={!canEdit} type="number" step="0.5" value={t.minYears} onChange={(e) => setTier(i, { minYears: Math.max(0, Math.min(40, Number(e.target.value) || 0)) })} />
                  </Field>
                  <Field label="نسبة المكافأة ٪">
                    <PercentInput disabled={!canEdit} bp={t.factorBp} onChange={(factorBp) => setTier(i, { factorBp: Math.min(10000, factorBp) })} />
                  </Field>
                  <Button variant="ghost" size="sm" disabled={!canEdit} aria-label="حذف الشريحة" onClick={() => set({ eosResignation: v.eosResignation.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <p className="text-[12px] text-fg-3">أقل من أول شريحة: لا مكافأة عند الاستقالة. الفصل التأديبي: لا مكافأة. باقي أسباب الانتهاء: كاملة.</p>
              {canEdit && v.eosResignation.length < 8 ? (
                <Button size="sm" variant="ghost" onClick={() => set({ eosResignation: [...v.eosResignation, { minYears: (v.eosResignation.at(-1)?.minYears ?? 0) + 1, factorBp: 10000 }] })}>
                  <Plus className="size-4" /> إضافة شريحة
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </SettingsCard>

      <SettingsCard title="ملف تحويل الرواتب للبنك" description="ملف CSV عام بحقول: رقم المنشأة، هوية الموظف ونوعها، الاسم، الآيبان، رمز البنك، الأساسي، السكن، باقي المستحقات، الاستقطاعات، الصافي، الشهر." footer={saveBtn}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="رقم المنشأة لدى البنك/الوزارة">
            <Input disabled={!canEdit} dir="ltr" value={v.wpsEmployerId} onChange={(e) => set({ wpsEmployerId: e.target.value })} />
          </Field>
          <Field label="الفاصل">
            <Select
              disabled={!canEdit}
              value={v.wpsDelimiter}
              onChange={(wpsDelimiter) => set({ wpsDelimiter: wpsDelimiter as "COMMA" })}
              options={[
                { value: "COMMA", label: "فاصلة ," },
                { value: "SEMICOLON", label: "فاصلة منقوطة ;" },
                { value: "TAB", label: "مسافة جدولة" },
              ]}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox disabled={!canEdit} checked={v.wpsIncludeHeader} onChange={(wpsIncludeHeader) => set({ wpsIncludeHeader })} /> سطر عناوين الأعمدة
          </label>
        </div>
      </SettingsCard>
    </div>
  );
}
