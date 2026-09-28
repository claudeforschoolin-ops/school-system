"use client";
/**
 * الأدوار ومصفوفة الصلاحيات المرئية: أدوار × وحدات × إجراءات مع نطاق البيانات لكل خلية،
 * وإنشاء أدوار مخصصة (مع النسخ من دور قائم). صلاحيات مالك النظام ثابتة.
 */
import { ChevronLeft, Copy, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ACTIONS, ACTION_LABELS, MODULE_GROUPS, SCOPES, SCOPE_LABELS, actionsFor, type Action, type Scope } from "@/lib/rbac/catalog";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettingsShell } from "@/components/settings/settings-shell";

type RoleRow = RouterOutputs["roles"]["list"][number];

const SCOPE_SHORT: Record<Scope, string> = { ALL: "الكل", BRANCH: "الفرع", STAGE: "المرحلة", ASSIGNED: "المسند", OWN: "سجلاته" };
const SCOPE_COLOR: Record<Scope, string> = { ALL: "navy", BRANCH: "teal", STAGE: "slate", ASSIGNED: "gold", OWN: "brown" };

export default function RolesPage() {
  const { can } = useApp();
  const roles = trpc.roles.list.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  return (
    <SettingsShell
      title="الأدوار والصلاحيات"
      description="الصلاحية = وحدة × إجراء × نطاق بيانات. تُطبَّق فوراً على كل المستخدمين الحاملين للدور."
      actions={can("roles", "create") ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewOpen(true)}>دور مخصص</Button> : null}
    >
      {roles.isLoading ? <SkeletonLines lines={8} /> : null}
      {roles.data ? (
        <div className="flex flex-col gap-5 xl:flex-row">
          <aside className="xl:w-[230px] xl:shrink-0">
            <ul className="thin-scroll flex gap-1 overflow-x-auto xl:max-h-[70vh] xl:flex-col xl:overflow-y-auto">
              {roles.data.map((r) => (
                <li key={r.id} className="shrink-0">
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-[14px] transition-colors hover:bg-hover", selected?.id === r.id && "bg-active font-medium")}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--tag-${r.color}-dot)` }} />
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="text-[12px] text-fg-3 tabular">{new Intl.NumberFormat("ar-SA").format(r.userCount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          {selected ? <RoleEditor key={selected.id} role={selected} /> : null}
        </div>
      ) : null}
      <NewRoleDialog open={newOpen} onOpenChange={setNewOpen} roles={roles.data ?? []} onCreated={setSelectedId} />
    </SettingsShell>
  );
}

function RoleEditor({ role }: { role: RoleRow }) {
  const { can } = useApp();
  const utils = trpc.useUtils();
  const locked = role.key === "OWNER" || !can("roles", "update");
  const initial = useMemo(() => new Map(role.permissions.map((p) => [`${p.module}:${p.action}`, p.scope])), [role.permissions]);
  const [grants, setGrants] = useState<Map<string, Scope>>(initial);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState({ name: role.name, description: role.description ?? "", requires2fa: role.requires2fa });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changes = useMemo(() => {
    let n = 0;
    const keys = new Set([...initial.keys(), ...grants.keys()]);
    for (const k of keys) if (initial.get(k) !== grants.get(k)) n++;
    return n;
  }, [initial, grants]);

  const save = trpc.roles.setPermissions.useMutation({
    onSuccess: async (r) => {
      await utils.roles.list.invalidate();
      toast.success(`حُفظت الصلاحيات (+${r.added} / -${r.removed})`);
    },
  });
  const updateMeta = trpc.roles.update.useMutation({ onSuccess: () => utils.roles.list.invalidate().then(() => toast.success("حُفظ الدور")) });
  const remove = trpc.roles.delete.useMutation({ onSuccess: () => utils.roles.list.invalidate() });

  const set = (module: string, action: Action, scope: Scope | null) =>
    setGrants((prev) => {
      const next = new Map(prev);
      if (scope) next.set(`${module}:${action}`, scope);
      else next.delete(`${module}:${action}`);
      return next;
    });

  const setRow = (module: string, scope: Scope | null) => {
    for (const a of actionsFor(module)) set(module, a, scope);
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 rounded-lg p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="size-5 text-fg-3" />
          <input
            value={meta.name}
            disabled={locked}
            onChange={(e) => setMeta({ ...meta, name: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-[18px] font-bold outline-none disabled:opacity-100"
            aria-label="اسم الدور"
          />
          {role.isSystem ? <Tag color="slate">دور نظامي</Tag> : <Tag color="teal">دور مخصص</Tag>}
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <Switch size="sm" checked={meta.requires2fa} disabled={locked} onChange={(v) => setMeta({ ...meta, requires2fa: v })} />
            مصادقة ثنائية إلزامية
          </label>
        </div>
        <input
          value={meta.description}
          disabled={locked}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          placeholder="وصف الدور"
          className="mt-1 w-full bg-transparent text-[13px] text-fg-3 outline-none"
        />
        {!locked ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {meta.name !== role.name || meta.description !== (role.description ?? "") || meta.requires2fa !== role.requires2fa ? (
              <Button size="sm" loading={updateMeta.isPending} onClick={() => updateMeta.mutate({ roleId: role.id, ...meta })}>
                حفظ بيانات الدور
              </Button>
            ) : null}
            {!role.isSystem && can("roles", "delete") ? (
              <Button size="sm" variant="ghost" className="text-danger-700" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)}>
                حذف الدور
              </Button>
            ) : null}
          </div>
        ) : role.key === "OWNER" ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-3">
            <Lock className="size-3" /> صلاحيات مالك النظام كاملة وثابتة ولا يمكن تعديلها.
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
        النطاقات:
        {SCOPES.map((s) => (
          <Tag key={s} color={SCOPE_COLOR[s]} size="sm">
            {SCOPE_LABELS[s]}
          </Tag>
        ))}
      </div>

      <div className="thin-scroll max-h-[calc(100vh-240px)] overflow-auto rounded-lg shadow-card">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-[2] bg-sidebar shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="w-[260px] px-3 py-2 text-start font-medium text-fg-3">الوحدة</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-1 py-2 text-center font-medium text-fg-3">
                  {ACTION_LABELS[a]}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {MODULE_GROUPS.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              const granted = group.modules.reduce((n, m) => n + actionsFor(m.key).filter((a) => grants.has(`${m.key}:${a}`)).length, 0);
              return (
                <GroupRows key={group.key}>
                  <tr className="border-t border-line bg-app">
                    <td colSpan={ACTIONS.length + 2} className="px-2 py-1.5">
                      <button
                        onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(group.key)) n.delete(group.key); else n.add(group.key); return n; })}
                        className="flex items-center gap-1.5 text-[13px] font-medium"
                      >
                        <ChevronLeft className={cn("size-3.5 text-fg-3 transition-transform", !isCollapsed && "-rotate-90")} />
                        {group.label}
                        <span className="text-[12px] font-normal text-fg-3">({new Intl.NumberFormat("ar-SA").format(granted)} صلاحية)</span>
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed
                    ? group.modules.map((m) => {
                        const allowed = actionsFor(m.key);
                        return (
                          <tr key={m.key} className="border-t border-line/60 hover:bg-hover/50">
                            <td className="px-3 py-1.5">
                              <span className="flex items-center gap-2">
                                <span className="truncate">{m.label}</span>
                                {m.section ? <span className="text-[11px] text-fg-4 tabular">#{m.section}</span> : null}
                                <span className="rounded bg-hover px-1 text-[10px] text-fg-3" title="مرحلة التنفيذ">م{new Intl.NumberFormat("ar-SA").format(m.phase)}</span>
                              </span>
                            </td>
                            {ACTIONS.map((a) => (
                              <td key={a} className="px-1 py-1 text-center">
                                {allowed.includes(a) ? (
                                  <ScopeCell value={grants.get(`${m.key}:${a}`) ?? null} disabled={locked} onChange={(s) => set(m.key, a, s)} />
                                ) : (
                                  <span className="text-fg-4">·</span>
                                )}
                              </td>
                            ))}
                            <td className="px-1">
                              {!locked ? (
                                <Menu>
                                  <MenuTrigger asChild>
                                    <button className="grid size-6 place-items-center rounded text-fg-3 hover:bg-active" aria-label="كل إجراءات الوحدة" title="كل الإجراءات">
                                      <Copy className="size-3.5" />
                                    </button>
                                  </MenuTrigger>
                                  <MenuContent align="end">
                                    <MenuLabel>كل إجراءات «{m.label}»</MenuLabel>
                                    {SCOPES.map((s) => (
                                      <MenuItem key={s} onSelect={() => setRow(m.key, s)}>
                                        منح بنطاق: {SCOPE_LABELS[s]}
                                      </MenuItem>
                                    ))}
                                    <MenuSeparator />
                                    <MenuItem danger onSelect={() => setRow(m.key, null)}>
                                      إزالة كل الصلاحيات
                                    </MenuItem>
                                  </MenuContent>
                                </Menu>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    : null}
                </GroupRows>
              );
            })}
          </tbody>
        </table>
      </div>

      {!locked && changes ? (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-3 rounded-lg bg-elevated p-3 shadow-popover">
          <span className="text-[13px] text-fg-2">{new Intl.NumberFormat("ar-SA").format(changes)} تغيير غير محفوظ</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setGrants(initial)}>
              تجاهل
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  roleId: role.id,
                  grants: [...grants].map(([k, scope]) => {
                    const [module, action] = k.split(":") as [string, string];
                    return { module, action, scope };
                  }),
                })
              }
            >
              حفظ الصلاحيات
            </Button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`حذف الدور «${role.name}»؟`}
        description={role.userCount ? `الدور مسند إلى ${role.userCount} مستخدم؛ أزل الإسناد أولاً.` : "لا يمكن التراجع عن الحذف."}
        confirmLabel="حذف"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate({ roleId: role.id }, { onSettled: () => setConfirmDelete(false) })}
      />
    </div>
  );
}

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function ScopeCell({ value, onChange, disabled }: { value: Scope | null; onChange: (s: Scope | null) => void; disabled: boolean }) {
  const cell = value ? (
    <span className="inline-flex h-6 min-w-[52px] items-center justify-center rounded-full px-2 text-[11px] font-medium" style={{ background: `var(--tag-${SCOPE_COLOR[value]}-bg)`, color: `var(--tag-${SCOPE_COLOR[value]}-fg)` }}>
      {SCOPE_SHORT[value]}
    </span>
  ) : (
    <span className="inline-block size-4 rounded-full border border-dashed border-line-strong" />
  );
  if (disabled) return cell;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="rounded-full p-0.5 transition-transform hover:scale-105" aria-label={value ? SCOPE_LABELS[value] : "بدون صلاحية"}>
          {cell}
        </button>
      </MenuTrigger>
      <MenuContent align="center" className="min-w-[160px]">
        {SCOPES.map((s) => (
          <MenuItem key={s} onSelect={() => onChange(s)}>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: `var(--tag-${SCOPE_COLOR[s]}-dot)` }} />
              {SCOPE_LABELS[s]}
            </span>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => onChange(null)}>بدون صلاحية</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function NewRoleDialog({ open, onOpenChange, roles, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleRow[]; onCreated: (id: string) => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("__none__");
  const create = trpc.roles.create.useMutation({
    onSuccess: async (r) => {
      await utils.roles.list.invalidate();
      onCreated(r.id);
      onOpenChange(false);
      setName("");
      setDescription("");
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="دور مخصص جديد" width={460}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="اسم الدور"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="مثال: منسق الأنشطة" /></Field>
          <Field label="الوصف"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="نسخ الصلاحيات من">
            <Select value={copyFrom} onChange={setCopyFrom} options={[{ value: "__none__", label: "بدون (دور فارغ)" }, ...roles.filter((r) => r.key !== "OWNER").map((r) => ({ value: r.id, label: r.name }))]} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate({ name, description: description || null, copyFromRoleId: copyFrom === "__none__" ? null : copyFrom })}>
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
