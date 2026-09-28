"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";

const COLORS = ["navy", "teal", "slate", "gold", "green", "orange", "red", "purple", "brown"] as const;

export default function ProfilePage() {
  const { user, data } = useApp();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: user.name, jobTitle: user.jobTitle ?? "", phone: user.phone ?? "", avatarColor: user.avatarColor as (typeof COLORS)[number] });
  const save = trpc.account.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.account.context.invalidate();
      toast.success("تم حفظ الملف الشخصي");
    },
  });
  return (
    <SettingsShell title="الملف الشخصي" description="معلوماتك كما تظهر لزملائك.">
      <SettingsCard
        title="البيانات الأساسية"
        footer={
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ name: form.name, jobTitle: form.jobTitle || null, phone: form.phone || null, avatarColor: form.avatarColor })}>
            حفظ التغييرات
          </Button>
        }
      >
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={form.name} color={form.avatarColor} size={56} />
          <div>
            <p className="mb-1.5 text-[13px] text-fg-3">لون الصورة الرمزية</p>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, avatarColor: c })}
                  className={cn("size-6 rounded-full ring-offset-2 ring-offset-app transition-shadow", form.avatarColor === c && "ring-2 ring-navy-600")}
                  style={{ background: `var(--tag-${c}-dot)` }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم الكامل">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="المسمى الوظيفي">
            <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" hint="يغيّره مسؤول النظام فقط.">
            <Input value={user.email} disabled dir="ltr" className="text-start" />
          </Field>
          <Field label="رقم الجوال">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" className="text-start" />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="أدواري" description="تحدد الأدوار ما يمكنك رؤيته وتعديله.">
        <ul className="space-y-1.5 text-[14px]">
          {data.roles.map((r, i) => (
            <li key={`${r.key}-${i}`} className="flex items-center justify-between">
              <span>{r.name}</span>
              <span className="text-[12px] text-fg-3">{r.branchId ? "مقيّد بفرع" : r.stageId ? "مقيّد بمرحلة" : "كل المدرسة"}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SettingsShell>
  );
}
