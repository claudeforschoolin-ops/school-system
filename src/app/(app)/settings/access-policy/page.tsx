"use client";
import { Globe, Plus, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ipAllowed } from "@/lib/ip";
import { trpc } from "@/lib/trpc/client";
import { ModuleSettingsForm } from "@/components/ops/common";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonLines } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";

type Security = {
  ipRestrictionEnabled: boolean;
  ipAllowlist: string[];
  ipScope: "SENSITIVE" | "ALL_STAFF";
};
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$/;

export default function AccessPolicyPage() {
  const status = trpc.security.status.useQuery();
  return (
    <SettingsShell title="سياسة الوصول" description="تقييد الدخول بعناوين الشبكة (IP) المسموحة للأدوار الحساسة أو لكل الموظفين. أولياء الأمور والطلاب غير مشمولين.">
      {!status.data ? <SkeletonLines lines={6} /> : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-card">
            <Globe className="size-5 text-fg-3" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg-3">عنوان اتصالك الحالي</p>
              <p dir="ltr" className="text-start font-mono text-[15px] font-semibold">{status.data.ip ?? "غير معروف"}</p>
            </div>
            <Tag color={status.data.sensitive ? "gold" : "gray"}>{status.data.sensitive ? "دورك حساس (يتطلب التحقق بخطوتين)" : "دور غير حساس"}</Tag>
          </div>
          <ModuleSettingsForm<Security> settingsKey="security" title="قيود الشبكة" description="عند التفعيل يُرفض تسجيل الدخول وأي طلب من خارج القائمة لمن يشملهم القيد، ويُسجَّل الرفض في سجل التدقيق. عناوين الخادم المحلية مسموحة دائماً.">
            {(v, set, canEdit) => <SecurityForm v={v} set={set} canEdit={canEdit} status={status.data} />}
          </ModuleSettingsForm>
          <p className="text-[13px] text-fg-3">سياسة كلمات المرور (الطول والتعقيد والانتهاء) في <Link href="/settings/school" className="text-navy-600 underline">إعدادات المدرسة</Link>، والتحقق بخطوتين إلزامي للأدوار الحساسة من <Link href="/settings/roles" className="text-navy-600 underline">الأدوار والصلاحيات</Link>.</p>
        </>
      )}
    </SettingsShell>
  );
}

function SecurityForm({ v, set, canEdit, status }: { v: Security; set: (p: Partial<Security>) => void; canEdit: boolean; status: { ip: string | null; sensitive: boolean; staff: boolean } }) {
  const [draft, setDraft] = useState("");
  const draftOk = IP_RE.test(draft.trim()) && draft.trim().split("/")[0]!.split(".").every((o) => Number(o) <= 255);
  const add = (entry: string) => {
    if (!v.ipAllowlist.includes(entry)) set({ ipAllowlist: [...v.ipAllowlist, entry] });
    setDraft("");
  };
  const applies = v.ipScope === "ALL_STAFF" ? status.staff : status.sensitive;
  const lockout = v.ipRestrictionEnabled && v.ipAllowlist.length > 0 && applies && !ipAllowed(status.ip, v.ipAllowlist);
  return (
    <div className="space-y-4">
      <SwitchRow checked={v.ipRestrictionEnabled} disabled={!canEdit} onChange={(ipRestrictionEnabled) => set({ ipRestrictionEnabled })} label="تفعيل تقييد عناوين IP" hint="بلا عناوين في القائمة لا يُطبَّق أي قيد" />
      <Field label="يُطبَّق على">
        <Segmented value={v.ipScope} onChange={(ipScope) => canEdit && set({ ipScope: ipScope as Security["ipScope"] })} options={[{ value: "SENSITIVE", label: "الأدوار الحساسة فقط" }, { value: "ALL_STAFF", label: "كل الموظفين" }]} />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-fg-2">العناوين والنطاقات المسموحة</p>
        {v.ipAllowlist.length ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {v.ipAllowlist.map((c) => (
              <li key={c} className="flex items-center gap-1 rounded-md bg-hover py-1 pe-1 ps-2 font-mono text-[13px]" dir="ltr">
                {c}
                {canEdit ? <button type="button" className="grid size-5 place-items-center rounded text-fg-3 hover:bg-active hover:text-danger-700" aria-label={`حذف ${c}`} onClick={() => set({ ipAllowlist: v.ipAllowlist.filter((x) => x !== c) })}><Trash2 className="size-3" /></button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mb-2 text-[13px] text-fg-3">القائمة فارغة.</p>}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Input dir="ltr" className="w-56 font-mono" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="10.0.0.0/24" aria-label="عنوان أو نطاق" onKeyDown={(e) => e.key === "Enter" && draftOk && (e.preventDefault(), add(draft.trim()))} />
            <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} disabled={!draftOk || v.ipAllowlist.length >= 50} onClick={() => add(draft.trim())}>إضافة</Button>
            {status.ip && IP_RE.test(status.ip) && !v.ipAllowlist.includes(status.ip) ? <Button size="sm" variant="ghost" onClick={() => add(status.ip!)}>إضافة عنواني الحالي</Button> : null}
          </div>
        ) : null}
        <p className="mt-1 text-[12px] text-fg-3">عنوان مفرد (مثل 185.12.4.20) أو نطاق CIDR (مثل 10.20.0.0/16)، حتى ٥٠ إدخالاً.</p>
      </div>
      {lockout ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          عنوانك الحالي خارج القائمة وأنت مشمول بالقيد؛ سيُرفض الحفظ حتى لا يُقفل حسابك. أضف عنوانك أو نطاق شبكتك أولاً.
        </p>
      ) : null}
    </div>
  );
}
