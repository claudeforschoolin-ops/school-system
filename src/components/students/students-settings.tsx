"use client";
/**
 * إعدادات وحدة الطلاب: المستندات المطلوبة، وصيغة الرقم الأكاديمي.
 */
import { useState } from "react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { DOCUMENT_TYPES } from "@/lib/students";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ModuleShell } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { STUDENT_TABS } from "./students-home";

interface StudentsSettingsValues {
  requiredDocuments: string[];
  numberPrefix?: string;
  numberPadding: number;
}

export function StudentsSettings() {
  const nav = MODULE_NAV.find((m) => m.key === "students")!;
  const q = trpc.moduleSettings.get.useQuery({ key: "students" });
  return (
    <ModuleShell nav={nav} tabs={STUDENT_TABS}>
      {q.data ? <Form initial={q.data.values as StudentsSettingsValues} canEdit={q.data.canEdit} /> : <SkeletonLines lines={8} />}
    </ModuleShell>
  );
}

function Form({ initial, canEdit }: { initial: StudentsSettingsValues; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.moduleSettings.get.invalidate({ key: "students" }), utils.students.overview.invalidate(), utils.database.rows.invalidate()]);
      toast.success("حُفظت إعدادات الطلاب");
    },
    onError: (e) => toast.error(e.message),
  });
  const year = new Date().getUTCFullYear();
  const preview = `${v.numberPrefix || year}${"1".padStart(v.numberPadding, "0")}`;
  return (
    <div className="space-y-4">
      {!canEdit ? <p className="rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: تعديل الإعدادات يتطلب صلاحية الوحدة على مستوى المدرسة كاملة.</p> : null}
      <SettingsCard title="المستندات المطلوبة" description="تظهر المستندات الناقصة في ملف الطالب ومؤشر «مستندات ناقصة».">
        <ul className="grid gap-2 sm:grid-cols-2">
          {DOCUMENT_TYPES.filter((d) => d.id !== "OTHER").map((d) => (
            <li key={d.id}>
              <label className="flex items-center gap-2 text-[14px]">
                <Checkbox
                  checked={v.requiredDocuments.includes(d.id)}
                  disabled={!canEdit}
                  onChange={(on) => setV({ ...v, requiredDocuments: on ? [...v.requiredDocuments, d.id] : v.requiredDocuments.filter((x) => x !== d.id) })}
                />
                {d.label}
              </label>
            </li>
          ))}
        </ul>
      </SettingsCard>
      <SettingsCard title="الرقم الأكاديمي" description="يُولَّد تلقائياً عند قبول الطالب أو إضافته. التغيير يطبّق على الطلاب الجدد فقط.">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="البادئة" hint="فارغة = سنة بداية العام الدراسي">
            <Input value={v.numberPrefix ?? ""} disabled={!canEdit} dir="ltr" className="text-end" onChange={(e) => setV({ ...v, numberPrefix: e.target.value || undefined })} />
          </Field>
          <Field label="عدد الخانات">
            <Input type="number" min={3} max={8} value={v.numberPadding} disabled={!canEdit} onChange={(e) => setV({ ...v, numberPadding: Math.max(3, Math.min(8, Number(e.target.value) || 4)) })} />
          </Field>
        </div>
        <p className="mt-2 text-[13px] text-fg-3">
          مثال: <span className="tabular text-fg" dir="ltr">{preview}</span>
        </p>
      </SettingsCard>
      {canEdit ? (
        <div className="flex justify-end">
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "students", patch: { ...v } })}>
            حفظ الإعدادات
          </Button>
        </div>
      ) : null}
    </div>
  );
}
