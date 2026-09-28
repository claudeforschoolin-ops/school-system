"use client";
import { Archive, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettingsShell } from "@/components/settings/settings-shell";

type Branch = RouterOutputs["org"]["branches"][number];
const GENDER = { BOYS: "بنين", GIRLS: "بنات", MIXED: "مشترك" } as const;

export default function BranchesPage() {
  const { can } = useApp();
  const utils = trpc.useUtils();
  const branches = trpc.org.branches.useQuery();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [archiving, setArchiving] = useState<Branch | null>(null);
  const archive = trpc.org.archiveBranch.useMutation({
    onSuccess: async () => {
      await utils.org.branches.invalidate();
      setArchiving(null);
      toast.success("أُرشف الفرع");
    },
  });
  const editable = can("settings", "update");
  return (
    <SettingsShell title="الفروع" description="المجموعة الواحدة تدعم عدة فروع. تُسند الأدوار إلى فرع لتقييد نطاق البيانات." actions={editable ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>فرع جديد</Button> : null}>
      {branches.isLoading ? <SkeletonLines lines={4} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.data?.map((b) => (
          <div key={b.id} className="rounded-lg p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[15px] font-medium">{b.name}</p>
                <p className="mt-0.5 text-[12px] text-fg-3">
                  الرمز <span dir="ltr" className="font-mono">{b.code}</span> · {b.address ?? "—"}
                </p>
              </div>
              <Tag color={b.gender === "BOYS" ? "navy" : b.gender === "GIRLS" ? "purple" : "teal"}>{GENDER[b.gender]}</Tag>
            </div>
            <p className="mt-3 text-[13px] text-fg-2">{new Intl.NumberFormat("ar-SA").format(b.assignedUsers)} إسناد دور مقيّد بهذا الفرع</p>
            {editable ? (
              <div className="mt-3 flex gap-1">
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(b)}>تعديل</Button>
                <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => setArchiving(b)}>أرشفة</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <BranchDialog value={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(archiving)} onOpenChange={(o) => !o && setArchiving(null)} title={`أرشفة «${archiving?.name}»؟`} description="يُخفى الفرع من القوائم وتبقى بياناته محفوظة." confirmLabel="أرشفة" loading={archive.isPending} onConfirm={() => archiving && archive.mutate({ id: archiving.id })} />
    </SettingsShell>
  );
}

function BranchDialog({ value, onClose }: { value: Branch | "new" | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const existing = value && value !== "new" ? value : null;
  const [form, setForm] = useState({ code: "", name: "", gender: "MIXED" as Branch["gender"], address: "", phone: "", email: "" });
  const [key, setKey] = useState<string | null>(null);
  const k = value ? (existing?.id ?? "new") : null;
  if (k !== key) {
    setKey(k);
    if (value) setForm(existing ? { code: existing.code, name: existing.name, gender: existing.gender, address: existing.address ?? "", phone: existing.phone ?? "", email: existing.email ?? "" } : { code: "", name: "", gender: "MIXED", address: "", phone: "", email: "" });
  }
  const done = async () => {
    await utils.org.branches.invalidate();
    toast.success("تم الحفظ");
    onClose();
  };
  const create = trpc.org.createBranch.useMutation({ onSuccess: done });
  const update = trpc.org.updateBranch.useMutation({ onSuccess: done });
  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={existing ? "تعديل الفرع" : "فرع جديد"} width={480}>
        <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
          <Field label="اسم الفرع" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="الرمز"><Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="الفئة"><Select value={form.gender} onChange={(v) => setForm({ ...form, gender: v as Branch["gender"] })} options={Object.entries(GENDER).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="العنوان" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="الهاتف"><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="البريد"><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending || update.isPending} onClick={() => (existing ? update.mutate({ id: existing.id, ...form }) : create.mutate(form))}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
