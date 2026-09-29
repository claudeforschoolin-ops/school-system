"use client";
/**
 * محرر قوالب رسائل أولياء الأمور لوحدة ما (المتغيرات بين { }).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DEFAULT_TEMPLATES, type TemplateKey } from "@/server/services/template-defaults";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const LABELS: Record<TemplateKey, string> = {
  admission_received: "استلام طلب القبول",
  admission_accepted: "خطاب القبول",
  admission_rejected: "الاعتذار عن القبول",
  admission_waitlist: "قائمة الانتظار",
  absence: "غياب الطالب",
  late: "تأخر الطالب",
  absence_threshold: "تجاوز حد الغياب",
  guardian_summon: "استدعاء ولي الأمر",
  leave_decision: "قرار الإجازة/الاستئذان",
  transfer_completed: "تنفيذ التحويل",
  activity_consent: "موافقة على نشاط/رحلة",
  behavior_notice: "ملاحظة سلوكية",
  invoice_issued: "إصدار فاتورة",
  receipt_issued: "إيصال سداد",
  reminder_before: "تذكير قبل الاستحقاق",
  reminder_due: "تذكير يوم الاستحقاق",
  reminder_overdue: "تذكير بالتأخر",
  reminder_final: "إشعار أخير بالمديونية",
};

export function TemplatesEditor({ keys }: { keys: TemplateKey[] }) {
  const utils = trpc.useUtils();
  const q = trpc.moduleSettings.get.useQuery({ key: "messageTemplates" });
  const [draft, setDraft] = useState<Partial<Record<TemplateKey, string>> | null>(null);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => {
      await utils.moduleSettings.get.invalidate({ key: "messageTemplates" });
      setDraft(null);
      toast.success("حُفظت القوالب");
    },
    onError: (e) => toast.error(e.message),
  });
  const values = (q.data?.values ?? {}) as Partial<Record<TemplateKey, string>>;
  const current = (k: TemplateKey) => draft?.[k] ?? values[k] ?? "";
  return (
    <div className="space-y-3">
      {keys.map((k) => (
        <Field key={k} label={LABELS[k]} hint={`الافتراضي: ${DEFAULT_TEMPLATES[k]}`}>
          <Textarea rows={2} value={current(k)} placeholder={DEFAULT_TEMPLATES[k]} disabled={!q.data?.canEdit} onChange={(e) => setDraft({ ...(draft ?? {}), [k]: e.target.value })} />
        </Field>
      ))}
      <p className="text-[12px] text-fg-3">المتغيرات المتاحة: {"{student}"}، {"{grade}"}، {"{date}"}، {"{number}"}، {"{academicNumber}"}، {"{school}"}. اترك الحقل فارغاً لاستخدام النص الافتراضي.</p>
      {q.data?.canEdit ? (
        <div className="flex justify-end">
          <Button variant="primary" disabled={!draft} loading={save.isPending} onClick={() => save.mutate({ key: "messageTemplates", patch: { ...values, ...draft } })}>
            حفظ القوالب
          </Button>
        </div>
      ) : null}
    </div>
  );
}
