"use client";
/**
 * إعدادات القبول: تفعيل نموذج التقديم العام ورابطه ونص الترحيب، وقوالب رسائل القبول.
 */
import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { TemplatesEditor } from "@/components/modules/templates-editor";
import { SettingsCard } from "@/components/settings/settings-shell";
import { ADMISSION_TABS, publicApplyUrl } from "./admissions-home";

export function AdmissionsSettings() {
  const nav = MODULE_NAV.find((m) => m.key === "admissions")!;
  const q = trpc.moduleSettings.get.useQuery({ key: "admissions" });
  return (
    <ModuleShell nav={nav} tabs={ADMISSION_TABS}>
      {q.data ? <Form initial={q.data.values as { publicFormEnabled: boolean; intro?: string }} canEdit={q.data.canEdit} /> : <SkeletonLines lines={8} />}
      <SettingsCard title="رسائل أولياء الأمور" description="تُرسل تلقائياً عند استلام الطلب وعند كل قرار.">
        <TemplatesEditor keys={["admission_received", "admission_accepted", "admission_rejected", "admission_waitlist"]} />
      </SettingsCard>
    </ModuleShell>
  );
}

function Form({ initial, canEdit }: { initial: { publicFormEnabled: boolean; intro?: string }; canEdit: boolean }) {
  const { tenant } = useApp();
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => {
      await utils.moduleSettings.get.invalidate({ key: "admissions" });
      toast.success("حُفظت إعدادات القبول");
    },
    onError: (e) => toast.error(e.message),
  });
  const url = publicApplyUrl(tenant.slug);
  return (
    <div className="mb-4 space-y-4">
      <SettingsCard title="نموذج التقديم العام" description="رابط يرسله ولي الأمر أو يُنشر في الموقع؛ يُنشئ طلب قبول دون حساب.">
        <label className="flex items-center gap-3 text-[14px]">
          <Switch checked={v.publicFormEnabled} disabled={!canEdit} onChange={(on) => setV({ ...v, publicFormEnabled: on })} />
          استقبال الطلبات عبر النموذج العام
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-hover px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[13px]" dir="ltr">
            {url}
          </code>
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("نُسخ الرابط");
            }}
          >
            نسخ
          </Button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-fg-2 hover:bg-card">
            <ExternalLink className="size-3.5" />
            فتح
          </a>
        </div>
        <Field label="نص الترحيب أعلى النموذج" className="mt-3">
          <Textarea rows={3} value={v.intro ?? ""} disabled={!canEdit} onChange={(e) => setV({ ...v, intro: e.target.value })} placeholder="مثال: يسعدنا انضمام أبنائكم. القبول للعام ١٤٤٨هـ مفتوح حتى نهاية شوال." />
        </Field>
        {canEdit ? (
          <div className="mt-3 flex justify-end">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "admissions", patch: v })}>
              حفظ
            </Button>
          </div>
        ) : null}
      </SettingsCard>
    </div>
  );
}
