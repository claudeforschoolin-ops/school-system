"use client";
/**
 * نافذة سند صرف جديد: المستفيد، حساب المصروف ومركز التكلفة، الضريبة المدخلة، طريقة الدفع، والمرفقات.
 * فوق حد الصلاحية يُرسل لاعتماد المدير؛ القيد يُرحّل عند الصرف.
 */
import { Paperclip, Upload, X } from "lucide-react";
import { useState } from "react";
import { applyBp } from "@/lib/finance/calc";
import { PAYMENT_METHOD, type PaymentMethodKey } from "@/lib/finance/labels";
import { trpc } from "@/lib/trpc/client";
import { pickFile, uploadFile, type UploadedFile } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import type { CreateDialogProps } from "@/components/students/create-dialogs";
import { MoneyInput, useMoney, useToday } from "./common";

export function NewVoucherDialog({ onClose, onCreated }: CreateDialogProps) {
  const money = useMoney();
  const today = useToday();
  const { can } = useApp();
  const chart = trpc.finance.accounting.chart.useQuery({}, { enabled: can("accounting", "view") });
  const setup = trpc.finance.setup.get.useQuery();
  const banks = trpc.finance.banking.accounts.useQuery(undefined, { enabled: can("banking", "view") });
  const centers = trpc.finance.accounting.costCenters.useQuery(undefined, { enabled: can("accounting", "view") });
  const [v, setV] = useState({ date: today, payee: "", expenseAccountId: undefined as string | undefined, costCenterId: null as string | null, method: "BANK_TRANSFER" as PaymentMethodKey, bankAccountId: null as string | null, amountMinor: null as number | null, taxCodeId: null as string | null, description: "" });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const m = trpc.finance.banking.createVoucher.useMutation({
    onSuccess: (r) => {
      toast.success(r.status === "PENDING" ? "أُنشئ السند وأُرسل لاعتماد المدير" : "أُنشئ السند وهو جاهز للصرف");
      onCreated(r.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const expenseAccounts = (chart.data?.accounts ?? setup.data?.accounts ?? []).filter((a) => a.type === "EXPENSE" && !("isGroup" in a && a.isGroup));
  const taxCodes = (setup.data?.taxCodes ?? []).filter((t) => t.isActive && t.inputAccountId);
  const tax = taxCodes.find((t) => t.id === v.taxCodeId);
  const taxMinor = v.amountMinor && tax ? applyBp(v.amountMinor, tax.rateBp) : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="سند صرف جديد" description="فوق حد الصلاحية يُرسل لاعتماد المدير قبل الصرف؛ القيد يُرحّل عند الصرف." width={620}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المستفيد" className="col-span-2">
            <Input value={v.payee} onChange={(e) => setV({ ...v, payee: e.target.value })} placeholder="مثال: شركة الكهرباء السعودية" autoFocus />
          </Field>
          <Field label="حساب المصروف">
            <Select value={v.expenseAccountId} onChange={(id) => setV({ ...v, expenseAccountId: id })} options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} placeholder="اختر" />
          </Field>
          <Field label="مركز التكلفة">
            <Select value={v.costCenterId ?? "none"} onChange={(c) => setV({ ...v, costCenterId: c === "none" ? null : c })} options={[{ value: "none", label: "—" }, ...(centers.data?.rows ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label="المبلغ قبل الضريبة">
            <MoneyInput value={v.amountMinor} onChange={(a) => setV({ ...v, amountMinor: a })} />
          </Field>
          <Field label="ضريبة المدخلات" hint={taxMinor ? `الضريبة ${money.fmt(taxMinor)} · الإجمالي ${money.fmt((v.amountMinor ?? 0) + taxMinor)}` : undefined}>
            <Select value={v.taxCodeId ?? "none"} onChange={(t) => setV({ ...v, taxCodeId: t === "none" ? null : t })} options={[{ value: "none", label: "بدون ضريبة" }, ...taxCodes.map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={v.method} onChange={(mth) => setV({ ...v, method: mth as PaymentMethodKey })} options={(["BANK_TRANSFER", "CASH", "CHEQUE", "CARD"] as const).map((k) => ({ value: k, label: PAYMENT_METHOD[k].label }))} />
          </Field>
          {v.method !== "CASH" && banks.data?.banks.length ? (
            <Field label="من حساب">
              <Select value={v.bankAccountId ?? "default"} onChange={(b) => setV({ ...v, bankAccountId: b === "default" ? null : b })} options={[{ value: "default", label: "الحساب الافتراضي" }, ...banks.data.banks.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))]} />
            </Field>
          ) : (
            <Field label="التاريخ">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
          )}
          <Field label="البيان" className="col-span-2">
            <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="مثال: فاتورة كهرباء المبنى الرئيسي لشهر أغسطس" />
          </Field>
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<Upload className="size-3.5" />}
              loading={uploading}
              onClick={async () => {
                const f = await pickFile("application/pdf,image/png,image/jpeg,image/webp");
                if (!f) return;
                setUploading(true);
                try {
                  const up = await uploadFile(f);
                  setFiles((x) => [...x, up]);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            >
              إرفاق فاتورة المورد
            </Button>
            {files.map((f) => (
              <span key={f.id} className="flex items-center gap-1 rounded-md bg-hover px-2 py-1 text-[12px]">
                <Paperclip className="size-3" />
                {f.name}
                <button aria-label="إزالة" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={v.payee.trim().length < 2 || !v.expenseAccountId || !v.amountMinor || v.description.trim().length < 3}
            onClick={() => m.mutate({ date: v.date, payee: v.payee, expenseAccountId: v.expenseAccountId!, costCenterId: v.costCenterId, method: v.method, bankAccountId: v.bankAccountId, amountMinor: v.amountMinor!, taxCodeId: v.taxCodeId, description: v.description, attachments: files })}
          >
            إنشاء السند
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
