"use client";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { formatDate, formatRelative } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { TwoFactorSetupPanel } from "@/components/auth/two-factor-setup";
import { useApp } from "@/components/shell/app-context";
import { SettingsCard, SettingsShell } from "@/components/settings/settings-shell";

export default function SecurityPage() {
  const { user, prefs } = useApp();
  const utils = trpc.useUtils();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [setup, setSetup] = useState(false);
  const [disable, setDisable] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const change = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور وأُنهيت الجلسات الأخرى");
      setPw({ current: "", next: "", confirm: "" });
      void utils.account.sessions.invalidate();
    },
  });
  const sessions = trpc.account.sessions.useQuery();
  const revoke = trpc.account.revokeSession.useMutation({ onSuccess: () => utils.account.sessions.invalidate() });
  const revokeOthers = trpc.account.revokeOtherSessions.useMutation({
    onSuccess: (r) => {
      toast.success(`أُنهيت ${new Intl.NumberFormat("ar-SA").format(r.count)} جلسة`);
      void utils.account.sessions.invalidate();
    },
  });
  const disable2fa = trpc.account.twoFactorDisable.useMutation({
    onSuccess: async () => {
      setDisable(false);
      await utils.account.context.invalidate();
      toast.success("عُطّلت المصادقة الثنائية");
    },
  });

  return (
    <SettingsShell title="الأمان والجلسات" description="كلمة المرور، والمصادقة الثنائية، والأجهزة المتصلة بحسابك.">
      <SettingsCard
        title="كلمة المرور"
        description="١٠ أحرف على الأقل تتضمن حروفاً وأرقاماً. تغييرها يُنهي جلساتك على الأجهزة الأخرى."
        footer={
          <Button
            variant="primary"
            icon={<KeyRound className="size-4" />}
            loading={change.isPending}
            disabled={!pw.current || !pw.next}
            onClick={() => (pw.next !== pw.confirm ? toast.error("كلمتا المرور غير متطابقتين") : change.mutate({ current: pw.current, next: pw.next }))}
          >
            تغيير كلمة المرور
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الحالية">
            <Input type="password" dir="ltr" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="الجديدة">
            <Input type="password" dir="ltr" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="تأكيد الجديدة">
            <Input type="password" dir="ltr" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="المصادقة الثنائية (TOTP)" description="طبقة حماية إضافية عبر تطبيق مصادقة على جوالك.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[14px]">
            {user.twoFactorEnabled ? <ShieldCheck className="size-5 text-success-800" /> : <ShieldOff className="size-5 text-fg-3" />}
            {user.twoFactorEnabled ? <Tag color="green">مفعّلة</Tag> : <Tag color="gray">غير مفعّلة</Tag>}
          </span>
          {user.twoFactorEnabled ? (
            <Button variant="ghost" className="text-danger-700" onClick={() => setDisable(true)}>
              تعطيل
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setSetup(true)}>
              تفعيل المصادقة الثنائية
            </Button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="الجلسات النشطة"
        description="الأجهزة التي سجّلت الدخول بحسابك. أنهِ أي جلسة لا تعرفها فوراً."
        footer={
          <Button variant="ghost" icon={<LogOut className="size-4" />} loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            إنهاء كل الجلسات الأخرى
          </Button>
        }
      >
        {sessions.isLoading ? <SkeletonLines lines={3} /> : null}
        <ul className="divide-y divide-line">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <MonitorSmartphone className="size-5 text-fg-3" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-medium">
                  {s.deviceLabel ?? "جهاز"}
                  {s.isCurrent ? <Tag color="teal">هذا الجهاز</Tag> : null}
                </p>
                <p className="text-[12px] text-fg-3" dir="auto">
                  آخر نشاط {formatRelative(s.lastActiveAt, new Date(), prefs.digits)} · بدأت {formatDate(s.createdAt, { digits: prefs.digits })} · <span dir="ltr">{s.ip ?? "—"}</span>
                </p>
              </div>
              {!s.isCurrent ? (
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ sessionId: s.id })}>
                  إنهاء
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </SettingsCard>

      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent title="تفعيل المصادقة الثنائية" width={440}>
          <div className="px-5 pb-5">
            {setup ? (
              <TwoFactorSetupPanel
                onDone={() => {
                  setSetup(false);
                  void utils.account.context.invalidate();
                  toast.success("فُعّلت المصادقة الثنائية");
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={disable} onOpenChange={setDisable}>
        <DialogContent title="تعطيل المصادقة الثنائية" description="أدخل كلمة المرور للتأكيد. الأدوار الحساسة لا يمكنها تعطيلها." width={420}>
          <div className="px-5 pb-3">
            <Input type="password" dir="ltr" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisable(false)}>
              إلغاء
            </Button>
            <Button variant="danger" loading={disable2fa.isPending} onClick={() => disable2fa.mutate({ password: disablePw })}>
              تعطيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
