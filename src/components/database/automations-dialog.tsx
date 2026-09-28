"use client";
/**
 * الأتمتة (رمز البرق): قواعد «عندما … فإن …» لقاعدة البيانات.
 */
import { Bell, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { SPECIAL_VALUES, describeTrigger, type AutomationAction, type AutomationTrigger } from "@/lib/database/automation-types";
import { COMPUTED_TYPES } from "@/lib/database/types";
import { formatRelative } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePrefs } from "@/components/shell/app-context";
import type { DatabaseApi } from "./use-database";

export function AutomationsButton({ api }: { api: DatabaseApi }) {
  const [open, setOpen] = useState(false);
  const count = api.bundle?.automations.filter((a) => a.isEnabled).length ?? 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn("flex h-7 items-center gap-1 rounded-md px-1.5 text-[13px] transition-colors hover:bg-hover", count ? "text-gold-700" : "text-fg-2")}
        aria-label="الأتمتة"
        title="الأتمتة"
      >
        <Zap className="size-4" />
        {count ? <span className="tabular">{new Intl.NumberFormat("ar-SA").format(count)}</span> : null}
      </button>
      <AutomationsDialog api={api} open={open} onOpenChange={setOpen} />
    </>
  );
}

function AutomationsDialog({ api, open, onOpenChange }: { api: DatabaseApi; open: boolean; onOpenChange: (o: boolean) => void }) {
  const prefs = usePrefs();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const toggle = trpc.database.toggleAutomation.useMutation({ onSuccess: () => api.refreshBundle() });
  const remove = trpc.database.deleteAutomation.useMutation({ onSuccess: () => api.refreshBundle() });
  const automations = api.bundle?.automations ?? [];
  const propName = (id: string) => api.properties.find((p) => p.id === id)?.name ?? "خاصية محذوفة";
  const current = editing && editing !== "new" ? automations.find((a) => a.id === editing) : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setEditing(null); }}>
      <DialogContent title="الأتمتة" description="قواعد تُنفَّذ تلقائياً: عندما يحدث شيء في السجلات فإن النظام ينفذ إجراءً." width={620}>
        {editing ? (
          <AutomationEditor api={api} automation={current} onDone={() => setEditing(null)} />
        ) : (
          <div className="px-5 pb-5">
            {automations.length === 0 ? (
              <EmptyState compact illustration="blank" title="لا توجد قواعد أتمتة" description="مثال: عندما تتغير الحالة إلى «مكتمل» فأرسل إشعاراً لمنشئ السجل." />
            ) : (
              <ul className="space-y-2">
                {automations.map((a) => {
                  const trigger = a.trigger as AutomationTrigger;
                  const actions = a.actions as AutomationAction[];
                  return (
                    <li key={a.id} className="rounded-lg p-3 shadow-card">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("size-4", a.isEnabled ? "text-gold-700" : "text-fg-4")} />
                        <span className="flex-1 truncate text-[14px] font-medium">{a.name}</span>
                        {api.canEdit ? (
                          <>
                            <Switch size="sm" checked={a.isEnabled} onChange={(v) => toggle.mutate({ automationId: a.id, isEnabled: v })} label="تفعيل" />
                            <button onClick={() => setEditing(a.id)} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover" aria-label="تعديل">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => remove.mutate({ automationId: a.id })} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="حذف">
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[13px] text-fg-2">
                        <span className="font-medium text-fg">عندما</span> {describeTrigger(trigger, propName).replace(/^عند /, "")}{" "}
                        <span className="font-medium text-fg">فإن</span>{" "}
                        {actions.map((act) => (act.type === "SET_PROPERTY" ? `تُعيَّن «${propName(act.propertyId)}»` : `يُرسل إشعار: «${act.message}»`)).join("، ثم ")}
                      </p>
                      <p className="mt-1 text-[12px] text-fg-3">
                        نُفذت {new Intl.NumberFormat("ar-SA").format(a.runCount)} مرة{a.lastRunAt ? ` · آخرها ${formatRelative(a.lastRunAt, new Date(), prefs.digits)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {api.canEdit ? (
              <Button className="mt-4" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
                قاعدة جديدة
              </Button>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AutomationEditor({ api, automation, onDone }: { api: DatabaseApi; automation?: { id: string; name: string; trigger: unknown; actions: unknown; isEnabled: boolean }; onDone: () => void }) {
  const [name, setName] = useState(automation?.name ?? "");
  const [trigger, setTrigger] = useState<AutomationTrigger>((automation?.trigger as AutomationTrigger) ?? { type: "ROW_CREATED" });
  const [actions, setActions] = useState<AutomationAction[]>((automation?.actions as AutomationAction[]) ?? [{ type: "NOTIFY", recipients: "CREATOR", message: "تحديث على: {العنوان}" }]);
  const save = trpc.database.upsertAutomation.useMutation({
    onSuccess: async () => {
      await api.refreshBundle();
      onDone();
    },
  });
  const props = api.properties;
  const editable = props.filter((p) => !COMPUTED_TYPES.has(p.type));
  const dateProps = props.filter((p) => p.type === "DATE");
  const personProps = props.filter((p) => p.type === "PERSON");
  const optionProps = (id: string) => props.find((p) => p.id === id);

  const valueOptionsFor = (propId: string): Array<{ value: string; label: string }> | null => {
    const p = optionProps(propId);
    if (!p) return null;
    if (p.type === "SELECT" || p.type === "STATUS") return (p.config.options ?? []).map((o) => ({ value: o.id, label: o.name }));
    if (p.type === "CHECKBOX") return [{ value: "true", label: "محدَّد" }, { value: "false", label: "غير محدَّد" }];
    if (p.type === "DATE") return [{ value: SPECIAL_VALUES.TODAY, label: "تاريخ اليوم" }];
    if (p.type === "PERSON") return [{ value: SPECIAL_VALUES.ACTOR, label: "من نفذ التغيير" }, ...api.users.map((u) => ({ value: u.id, label: u.name }))];
    return null;
  };

  return (
    <div className="px-5 pb-2">
      <label className="block">
        <span className="mb-1 block text-[12px] text-fg-3">اسم القاعدة</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: إشعار عند اكتمال المهمة" autoFocus />
      </label>

      <div className="mt-4 rounded-lg bg-sidebar p-3">
        <p className="mb-2 text-[13px] font-medium">عندما</p>
        <div className="flex flex-wrap gap-2">
          <Select
            size="sm"
            className="w-[180px]"
            value={trigger.type}
            onChange={(t) => {
              if (t === "ROW_CREATED") setTrigger({ type: "ROW_CREATED" });
              else if (t === "PROPERTY_CHANGED") setTrigger({ type: "PROPERTY_CHANGED", propertyId: editable[0]?.id ?? "" });
              else setTrigger({ type: "DATE_REACHED", propertyId: dateProps[0]?.id ?? "", offsetDays: 0 });
            }}
            options={[
              { value: "ROW_CREATED", label: "يُضاف سجل جديد" },
              { value: "PROPERTY_CHANGED", label: "تتغير خاصية" },
              ...(dateProps.length ? [{ value: "DATE_REACHED", label: "يحل تاريخ" }] : []),
            ]}
          />
          {trigger.type === "PROPERTY_CHANGED" ? (
            <>
              <Select size="sm" className="w-[150px]" value={trigger.propertyId} onChange={(pid) => setTrigger({ type: "PROPERTY_CHANGED", propertyId: pid })} options={editable.map((p) => ({ value: p.id, label: p.name }))} />
              {valueOptionsFor(trigger.propertyId)?.length ? (
                <Select
                  size="sm"
                  className="w-[150px]"
                  value={trigger.toValue === undefined ? "__any__" : String(trigger.toValue)}
                  onChange={(v) => setTrigger({ ...trigger, toValue: v === "__any__" ? undefined : v === "true" ? true : v === "false" ? false : v })}
                  options={[{ value: "__any__", label: "إلى أي قيمة" }, ...valueOptionsFor(trigger.propertyId)!.filter((o) => !o.value.startsWith("__")).map((o) => ({ value: o.value, label: `إلى «${o.label}»` }))]}
                />
              ) : null}
            </>
          ) : null}
          {trigger.type === "DATE_REACHED" ? (
            <>
              <Select size="sm" className="w-[150px]" value={trigger.propertyId} onChange={(pid) => setTrigger({ ...trigger, propertyId: pid })} options={dateProps.map((p) => ({ value: p.id, label: p.name }))} />
              <Select
                size="sm"
                className="w-[150px]"
                value={String(trigger.offsetDays)}
                onChange={(v) => setTrigger({ ...trigger, offsetDays: Number(v) })}
                options={[-7, -3, -2, -1, 0, 1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 0 ? "في اليوم نفسه" : d < 0 ? `قبله بـ ${-d} يوم` : `بعده بـ ${d} يوم` }))}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-sidebar p-3">
        <p className="mb-2 text-[13px] font-medium">فإن</p>
        <div className="space-y-2">
          {actions.map((act, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                size="sm"
                className="w-[150px]"
                value={act.type}
                onChange={(t) =>
                  setActions(actions.map((a, j) => (j !== i ? a : t === "NOTIFY" ? { type: "NOTIFY", recipients: "CREATOR", message: "" } : { type: "SET_PROPERTY", propertyId: editable[0]?.id ?? "", value: null })))
                }
                options={[
                  { value: "NOTIFY", label: "أرسل إشعاراً" },
                  { value: "SET_PROPERTY", label: "عيّن خاصية" },
                ]}
              />
              {act.type === "NOTIFY" ? (
                <>
                  <Select
                    size="sm"
                    className="w-[140px]"
                    value={act.recipients === "PERSON_PROPERTY" ? `prop:${act.propertyId}` : act.recipients}
                    onChange={(v) =>
                      setActions(actions.map((a, j) => (j !== i ? a : v.startsWith("prop:") ? { ...act, recipients: "PERSON_PROPERTY", propertyId: v.slice(5) } : { ...act, recipients: v as "CREATOR" })))
                    }
                    options={[{ value: "CREATOR", label: "منشئ السجل" }, ...personProps.map((p) => ({ value: `prop:${p.id}`, label: `«${p.name}»` }))]}
                  />
                  <Input className="h-7 min-w-[180px] flex-1 text-[13px]" value={act.message} onChange={(e) => setActions(actions.map((a, j) => (j === i ? { ...act, message: e.target.value } : a)))} placeholder="نص الإشعار — استخدم {العنوان}" />
                </>
              ) : (
                <>
                  <Select size="sm" className="w-[150px]" value={act.propertyId} onChange={(pid) => setActions(actions.map((a, j) => (j === i ? { ...act, propertyId: pid, value: null } : a)))} options={editable.map((p) => ({ value: p.id, label: p.name }))} />
                  {valueOptionsFor(act.propertyId) ? (
                    <Select
                      size="sm"
                      className="w-[150px]"
                      value={act.value === null || act.value === undefined ? undefined : String(act.value)}
                      onChange={(v) => setActions(actions.map((a, j) => (j === i ? { ...act, value: v === "true" ? true : v === "false" ? false : v } : a)))}
                      options={valueOptionsFor(act.propertyId)!}
                      placeholder="القيمة"
                    />
                  ) : (
                    <Input className="h-7 w-[150px] text-[13px]" value={act.value === null || act.value === undefined ? "" : String(act.value)} onChange={(e) => setActions(actions.map((a, j) => (j === i ? { ...act, value: optionProps(act.propertyId)?.type === "NUMBER" ? Number(e.target.value) : e.target.value } : a)))} placeholder="القيمة" />
                  )}
                </>
              )}
              {actions.length > 1 ? (
                <button onClick={() => setActions(actions.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-danger-700" aria-label="حذف الإجراء">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button onClick={() => setActions([...actions, { type: "NOTIFY", recipients: "CREATOR", message: "" }])} className="mt-2 flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover">
          <Bell className="size-3.5" /> إجراء إضافي
        </button>
      </div>

      <DialogFooter className="-mx-5 mt-4">
        <Button variant="ghost" onClick={onDone}>
          رجوع
        </Button>
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!name.trim()}
          onClick={() => save.mutate({ databaseId: api.databaseId, automationId: automation?.id ?? null, name, trigger, actions, isEnabled: automation?.isEnabled ?? true })}
        >
          حفظ القاعدة
        </Button>
      </DialogFooter>
    </div>
  );
}
