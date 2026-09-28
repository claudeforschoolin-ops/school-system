"use client";
/**
 * إدارة المستخدمين: قائمة، دعوة بالبريد، الأدوار مع قيود الفرع/المرحلة،
 * الإيقاف/التفعيل، إعادة تعيين كلمة المرور، فك القفل، والجلسات النشطة.
 */
import { KeyRound, LockOpen, MailPlus, MonitorSmartphone, Plus, Search, Send, Trash2, UserCheck, UserX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatRelative } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettingsShell } from "@/components/settings/settings-shell";

type UserRow = RouterOutputs["users"]["list"][number];
type Assignment = { roleId: string; branchId: string | null; stageId: string | null };

const STATUS = { ACTIVE: ["فعّال", "green"], INVITED: ["مدعو", "gold"], SUSPENDED: ["موقوف", "red"] } as const;

export default function UsersPage() {
  const { can, prefs } = useApp();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "INVITED" | "SUSPENDED">((params.get("status") as "INVITED") ?? "all");
  const list = trpc.users.list.useQuery({ search: search || undefined, status: status === "all" ? undefined : status });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<UserRow | null>(null);

  return (
    <SettingsShell
      title="المستخدمون"
      description="الحسابات والأدوار والدعوات والجلسات."
      actions={can("users", "create") ? <Button variant="primary" icon={<MailPlus className="size-4" />} onClick={() => setInviteOpen(true)}>دعوة مستخدم</Button> : null}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[280px]">
          <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو البريد أو الجوال" className="h-8 w-full rounded-md bg-hover ps-8 pe-2 text-[14px] outline-none" />
        </div>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "الكل" },
            { value: "ACTIVE", label: "فعّال" },
            { value: "INVITED", label: "مدعو" },
            { value: "SUSPENDED", label: "موقوف" },
          ]}
        />
        {list.data ? <span className="text-[13px] text-fg-3">{new Intl.NumberFormat("ar-SA").format(list.data.length)} مستخدم</span> : null}
      </div>
      {list.isLoading ? <SkeletonLines lines={8} /> : null}
      {list.data?.length === 0 ? <EmptyState illustration="search" title="لا يوجد مستخدمون مطابقون" /> : null}
      <div className="overflow-hidden rounded-lg shadow-card">
        <ul className="divide-y divide-line">
          {list.data?.map((u) => (
            <li key={u.id}>
              <button onClick={() => setSelected(u)} className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-hover">
                <Avatar name={u.name} color={u.avatarColor} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{u.name}</span>
                    {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? <Tag color="red" size="sm">مقفل مؤقتاً</Tag> : null}
                  </span>
                  <span className="block truncate text-[12px] text-fg-3" dir="auto">
                    {u.jobTitle ?? ""} · <span dir="ltr">{u.email}</span>
                  </span>
                </span>
                <span className="hidden max-w-[260px] flex-wrap justify-end gap-1 lg:flex">
                  {u.roles.slice(0, 2).map((r) => (
                    <Tag key={r.id} color={r.color} dot={false} size="sm">
                      {r.name}
                      {r.branch ? ` · ${r.branch.name.split("—")[0]!.trim()}` : ""}
                    </Tag>
                  ))}
                  {u.roles.length > 2 ? <span className="text-[11px] text-fg-3">+{u.roles.length - 2}</span> : null}
                </span>
                <span className="hidden w-[110px] text-end text-[12px] text-fg-3 md:block">{u.lastLoginAt ? formatRelative(u.lastLoginAt, new Date(), prefs.digits) : "لم يسجل الدخول"}</span>
                <Tag color={STATUS[u.status][1]}>{STATUS[u.status][0]}</Tag>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UserDialog user={selected} onClose={() => setSelected(null)} />
    </SettingsShell>
  );
}

function RolesEditor({ value, onChange }: { value: Assignment[]; onChange: (v: Assignment[]) => void }) {
  const roles = trpc.roles.options.useQuery();
  const branches = trpc.org.branchOptions.useQuery();
  const stages = trpc.org.stageOptions.useQuery();
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select size="sm" className="min-w-[170px] flex-1" value={a.roleId} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, roleId: v } : x)))} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} placeholder="الدور" />
          <Select
            size="sm"
            className="w-[150px]"
            value={a.branchId ?? "__all__"}
            onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, branchId: v === "__all__" ? null : v } : x)))}
            options={[{ value: "__all__", label: "كل الفروع" }, ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))]}
          />
          <Select
            size="sm"
            className="w-[140px]"
            value={a.stageId ?? "__all__"}
            onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, stageId: v === "__all__" ? null : v } : x)))}
            options={[{ value: "__all__", label: "كل المراحل" }, ...(stages.data ?? []).map((s) => ({ value: s.id, label: s.name }))]}
          />
          {value.length > 1 ? (
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="إزالة الدور">
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      <button onClick={() => onChange([...value, { roleId: roles.data?.[4]?.id ?? "", branchId: null, stageId: null }])} className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-fg-2 hover:bg-hover">
        <Plus className="size-3.5" /> دور إضافي
      </button>
      <p className="text-[12px] leading-5 text-fg-3">قيد الفرع/المرحلة يحدد نطاق البيانات للصلاحيات ذات نطاق «الفرع» أو «المرحلة».</p>
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: "", email: "", phone: "", jobTitle: "" });
  const [roles, setRoles] = useState<Assignment[]>([{ roleId: "", branchId: null, stageId: null }]);
  const invite = trpc.users.invite.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
      toast.success("أُرسلت الدعوة (تظهر في صندوق الإرسال)");
      onOpenChange(false);
      setForm({ name: "", email: "", phone: "", jobTitle: "" });
      setRoles([{ roleId: "", branchId: null, stageId: null }]);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="دعوة مستخدم" description="يُرسل رابط تفعيل صالح لمدة ٧ أيام لتعيين كلمة المرور." width={620}>
        <div className="grid gap-3 px-5 sm:grid-cols-2">
          <Field label="الاسم الكامل"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="البريد الإلكتروني"><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="المسمى الوظيفي"><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></Field>
          <Field label="الجوال (اختياري)"><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-fg-2">الأدوار</span>
            <RolesEditor value={roles} onChange={setRoles} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="primary" icon={<Send className="size-4" />} loading={invite.isPending} disabled={!form.name || !form.email || roles.some((r) => !r.roleId)} onClick={() => invite.mutate({ ...form, phone: form.phone || null, jobTitle: form.jobTitle || null, roles })}>
            إرسال الدعوة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const { can, prefs, user: me } = useApp();
  const utils = trpc.useUtils();
  const [roles, setRoles] = useState<Assignment[]>([]);
  const [info, setInfo] = useState({ name: "", jobTitle: "", phone: "" });
  const [key, setKey] = useState<string | null>(null);
  if ((user?.id ?? null) !== key) {
    setKey(user?.id ?? null);
    if (user) {
      setRoles(user.roles.map((r) => ({ roleId: r.roleId, branchId: r.branch?.id ?? null, stageId: r.stageId })));
      setInfo({ name: user.name, jobTitle: user.jobTitle ?? "", phone: user.phone ?? "" });
    }
  }
  const sessions = trpc.users.sessions.useQuery({ userId: user?.id ?? "" }, { enabled: Boolean(user) });
  const refresh = () => utils.users.list.invalidate();
  const setRolesM = trpc.users.setRoles.useMutation({ onSuccess: () => refresh().then(() => toast.success("حُدّثت الأدوار")) });
  const update = trpc.users.update.useMutation({ onSuccess: () => refresh().then(() => toast.success("حُفظت البيانات")) });
  const setStatus = trpc.users.setStatus.useMutation({ onSuccess: () => refresh().then(onClose) });
  const reset = trpc.users.sendReset.useMutation({ onSuccess: () => toast.success("أُرسل رابط استعادة كلمة المرور") });
  const unlock = trpc.users.unlock.useMutation({ onSuccess: () => refresh().then(() => toast.success("فُك القفل")) });
  const resend = trpc.users.resendInvite.useMutation({ onSuccess: () => toast.success("أُعيد إرسال الدعوة") });
  const revoke = trpc.users.revokeSession.useMutation({ onSuccess: () => utils.users.sessions.invalidate() });
  const canUpdate = can("users", "update");
  const rolesChanged = useMemo(() => JSON.stringify(roles) !== JSON.stringify(user?.roles.map((r) => ({ roleId: r.roleId, branchId: r.branch?.id ?? null, stageId: r.stageId })) ?? []), [roles, user]);

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !o && onClose()}>
      {user ? (
        <DialogContent title={user.name} description={`${user.email} · ${STATUS[user.status][0]}`} width={640}>
          <div className="space-y-5 px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="الاسم"><Input value={info.name} disabled={!canUpdate} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></Field>
              <Field label="المسمى الوظيفي"><Input value={info.jobTitle} disabled={!canUpdate} onChange={(e) => setInfo({ ...info, jobTitle: e.target.value })} /></Field>
              <Field label="الجوال"><Input dir="ltr" value={info.phone} disabled={!canUpdate} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
            </div>
            {canUpdate ? (
              <div className="flex justify-end">
                <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ userId: user.id, name: info.name, jobTitle: info.jobTitle || null, phone: info.phone || null })}>حفظ البيانات</Button>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-[13px] font-medium text-fg-2">الأدوار والنطاق</p>
              {canUpdate ? <RolesEditor value={roles} onChange={setRoles} /> : (
                <div className="flex flex-wrap gap-1">{user.roles.map((r) => <Tag key={r.id} color={r.color}>{r.name}</Tag>)}</div>
              )}
              {canUpdate && rolesChanged ? (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="primary" loading={setRolesM.isPending} disabled={roles.some((r) => !r.roleId)} onClick={() => setRolesM.mutate({ userId: user.id, roles })}>حفظ الأدوار</Button>
                </div>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-fg-2">الجلسات النشطة ({new Intl.NumberFormat("ar-SA").format(sessions.data?.length ?? 0)})</p>
              <ul className="divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--border)]">
                {sessions.data?.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <MonitorSmartphone className="size-4 text-fg-3" />
                    <span className="flex-1">{s.deviceLabel} · آخر نشاط {formatRelative(s.lastActiveAt, new Date(), prefs.digits)} · <span dir="ltr">{s.ip}</span></span>
                    {canUpdate ? <Button size="xs" variant="ghost" onClick={() => revoke.mutate({ sessionId: s.id })}>إنهاء</Button> : null}
                  </li>
                ))}
                {sessions.data?.length === 0 ? <li className="px-3 py-2 text-[13px] text-fg-3">لا توجد جلسات نشطة</li> : null}
              </ul>
            </div>
            <p className="text-[12px] text-fg-3">
              أُنشئ {formatDate(user.createdAt, { digits: prefs.digits })} · آخر دخول {user.lastLoginAt ? formatRelative(user.lastLoginAt, new Date(), prefs.digits) : "—"} · المصادقة الثنائية {user.twoFactorEnabled ? "مفعّلة" : "غير مفعّلة"}
            </p>
          </div>
          {canUpdate && user.id !== me.id ? (
            <DialogFooter className="flex-wrap">
              {user.status === "INVITED" ? <Button size="sm" variant="ghost" icon={<Send className="size-4" />} loading={resend.isPending} onClick={() => resend.mutate({ userId: user.id })}>إعادة إرسال الدعوة</Button> : null}
              {user.status === "ACTIVE" ? <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} loading={reset.isPending} onClick={() => reset.mutate({ userId: user.id })}>رابط استعادة كلمة المرور</Button> : null}
              {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? <Button size="sm" variant="ghost" icon={<LockOpen className="size-4" />} onClick={() => unlock.mutate({ userId: user.id })}>فك القفل</Button> : null}
              {user.status === "SUSPENDED" ? (
                <Button size="sm" variant="teal" icon={<UserCheck className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate({ userId: user.id, status: "ACTIVE" })}>تفعيل الحساب</Button>
              ) : (
                <Button size="sm" variant="danger" icon={<UserX className="size-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate({ userId: user.id, status: "SUSPENDED" })}>إيقاف الحساب</Button>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
