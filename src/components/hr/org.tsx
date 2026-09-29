"use client";
/**
 * الهيكل التنظيمي: شجرة الأقسام (رئيس القسم، الفئة، مركز التكلفة) بمسمياتها وشواغرها،
 * ومخطط الارتباط الإداري للموظفين (المدير المباشر ← المرؤوسون) كشجرة قابلة للطي.
 */
import { ChevronDown, ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
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
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { CATEGORY, EMPLOYEE_TABS, hrNav } from "./common";

type Org = RouterOutputs["hr"]["employees"]["org"];
type Dept = Org["departments"][number];

export function OrgPage() {
  const { can } = useApp();
  const q = trpc.hr.employees.org.useQuery();
  const [view, setView] = useState<"chart" | "departments">("chart");
  const [dialog, setDialog] = useState<null | { dept: Dept | null; parentId?: string | null } | { position: Org["positions"][number] | null; departmentId: string }>(null);
  const canEdit = can("employees", "update");
  const d = q.data;
  return (
    <ModuleShell nav={hrNav("employees")} wide tabs={EMPLOYEE_TABS} actions={canEdit && view === "departments" ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ dept: null })}>قسم</Button> : null}>
      <div className="mb-4">
        <Segmented value={view} onChange={setView} options={[{ value: "chart", label: "مخطط الارتباط الإداري" }, { value: "departments", label: "الأقسام والمسميات" }]} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الهيكل" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={12} />
      ) : view === "chart" ? (
        <Chart org={d} />
      ) : !d.departments.length ? (
        <EmptyState illustration="table" title="لا أقسام بعد" description="أنشئ الأقسام (الإدارة العليا، الشؤون التعليمية، …) ثم مسمياتها الوظيفية." action={canEdit ? <Button variant="primary" onClick={() => setDialog({ dept: null })}>أول قسم</Button> : undefined} />
      ) : (
        <DeptTree org={d} parentId={null} depth={0} canEdit={canEdit} onEdit={(dept) => setDialog({ dept })} onAdd={(parentId) => setDialog({ dept: null, parentId })} onPosition={(position, departmentId) => setDialog({ position, departmentId })} />
      )}
      {dialog && "dept" in dialog && d ? <DeptDialog org={d} dept={dialog.dept} parentId={dialog.parentId ?? null} onClose={() => setDialog(null)} /> : null}
      {dialog && "position" in dialog ? <PositionDialog position={dialog.position} departmentId={dialog.departmentId} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function Chart({ org }: { org: Org }) {
  const roots = org.employees.filter((e) => !e.managerId || !org.employees.some((x) => x.id === e.managerId));
  const withReports = roots.filter((r) => org.employees.some((e) => e.managerId === r.id));
  const loose = roots.filter((r) => !org.employees.some((e) => e.managerId === r.id));
  if (!org.employees.length) return <EmptyState illustration="table" title="لا موظفين" />;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg bg-card p-4 shadow-card thin-scroll">
        <ul className="min-w-[480px]">
          {withReports.map((r) => (
            <Node key={r.id} org={org} id={r.id} depth={0} />
          ))}
        </ul>
      </div>
      {loose.length ? (
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-fg-3">بلا مدير مباشر ولا مرؤوسين ({loose.length}) — حدد مديرهم من ملف الموظف</h3>
          <div className="flex flex-wrap gap-2">
            {loose.map((e) => (
              <Link key={e.id} href={`/hr/employees/${e.id}`} className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-[13px] shadow-card hover:bg-hover">
                <Avatar name={e.fullName} size={20} /> {e.fullName}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Node({ org, id, depth }: { org: Org; id: string; depth: number }) {
  const prefs = usePrefs();
  const e = org.employees.find((x) => x.id === id)!;
  const children = org.employees.filter((x) => x.managerId === id).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const [open, setOpen] = useState(depth < 2);
  return (
    <li className={cn(depth > 0 && "ms-6 border-s border-line ps-3")}>
      <div className="flex items-center gap-2 py-1">
        {children.length ? (
          <button type="button" onClick={() => setOpen(!open)} className="grid size-5 place-items-center rounded text-fg-3 hover:bg-hover" aria-label={open ? "طي" : "توسيع"} aria-expanded={open}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        ) : (
          <span className="size-5" />
        )}
        <Avatar name={e.fullName} src={e.photoUrl} size={26} />
        <Link href={`/hr/employees/${e.id}`} className="min-w-0 hover:underline">
          <span className="block truncate text-[14px] font-medium">{e.fullName}</span>
          <span className="block truncate text-[12px] text-fg-3">{e.position ?? CATEGORY[e.category]?.label}</span>
        </Link>
        {children.length ? <span className="ms-2 rounded-full bg-hover px-2 text-[11px] tabular text-fg-3">{formatNumber(children.length, prefs.digits)}</span> : null}
      </div>
      {open && children.length ? (
        <ul>
          {children.map((c) => (
            <Node key={c.id} org={org} id={c.id} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DeptTree({ org, parentId, depth, canEdit, onEdit, onAdd, onPosition }: { org: Org; parentId: string | null; depth: number; canEdit: boolean; onEdit: (d: Dept) => void; onAdd: (parentId: string) => void; onPosition: (p: Org["positions"][number] | null, departmentId: string) => void }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const del = trpc.hr.employees.deleteDepartment.useMutation({ onSuccess: () => (toast.success("حُذف القسم"), void utils.hr.employees.invalidate()), onError: (e) => toast.error(e.message) });
  const delPos = trpc.hr.employees.deletePosition.useMutation({ onSuccess: () => void utils.hr.employees.invalidate(), onError: (e) => toast.error(e.message) });
  const list = org.departments.filter((x) => x.parentId === parentId);
  if (!list.length) return null;
  return (
    <ul className={cn("space-y-2", depth > 0 && "ms-6 mt-2 border-s border-line ps-3")}>
      {list.map((dept) => (
        <li key={dept.id}>
          <div className="rounded-lg bg-card p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold">{dept.name}</span>
              <span className="text-[12px] tabular text-fg-3">{dept.code}</span>
              <Tag size="sm" color={CATEGORY[dept.category]?.color}>
                {CATEGORY[dept.category]?.label}
              </Tag>
              <span className="text-[12px] text-fg-3">
                الرئيس: {dept.head ?? "—"} · {formatNumber(dept.employees, prefs.digits)} موظفاً
              </span>
              {canEdit ? (
                <div className="ms-auto flex gap-1">
                  <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => onPosition(null, dept.id)}>
                    مسمى
                  </Button>
                  <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => onAdd(dept.id)}>
                    قسم فرعي
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${dept.name}`} onClick={() => onEdit(dept)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`حذف ${dept.name}`} onClick={() => del.mutate({ id: dept.id })}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
            {org.positions.some((p) => p.departmentId === dept.id) ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {org.positions
                  .filter((p) => p.departmentId === dept.id)
                  .map((p) => (
                    <span key={p.id} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]", p.filled < p.headcount ? "bg-warning-50 text-warning-700" : "bg-hover text-fg-2")}>
                      {p.title} {formatNumber(p.filled, prefs.digits)}/{formatNumber(p.headcount, prefs.digits)}
                      {canEdit ? (
                        <>
                          <button type="button" className="opacity-60 hover:opacity-100" aria-label={`تعديل ${p.title}`} onClick={() => onPosition(p, dept.id)}>
                            <Pencil className="size-3" />
                          </button>
                          <button type="button" className="opacity-60 hover:opacity-100" aria-label={`إلغاء ${p.title}`} onClick={() => delPos.mutate({ id: p.id })}>
                            <Trash2 className="size-3" />
                          </button>
                        </>
                      ) : null}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
          <DeptTree org={org} parentId={dept.id} depth={depth + 1} canEdit={canEdit} onEdit={onEdit} onAdd={onAdd} onPosition={onPosition} />
        </li>
      ))}
    </ul>
  );
}

function DeptDialog({ org, dept, parentId, onClose }: { org: Org; dept: Dept | null; parentId: string | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ code: dept?.code ?? "", name: dept?.name ?? "", parentId: dept?.parentId ?? parentId ?? "", headEmployeeId: dept?.headEmployeeId ?? "", category: (dept?.category ?? "ADMIN") as "ADMIN" | "ACADEMIC" | "SERVICES", costCenterId: dept?.costCenterId ?? "" });
  const m = trpc.hr.employees.saveDepartment.useMutation({ onSuccess: () => (toast.success("حُفظ القسم"), void utils.hr.employees.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const none = { value: "", label: "—" };
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={dept ? `تعديل ${dept.name}` : "قسم جديد"} description="الفئة تحدد حساب مصروف الرواتب في القيد (تعليمية/إدارية/خدمات)، ومركز التكلفة يوزّع التكلفة.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="يتبع">
            <Select value={v.parentId} onChange={(parentId) => setV({ ...v, parentId })} options={[none, ...org.departments.filter((x) => x.id !== dept?.id).map((x) => ({ value: x.id, label: x.name }))]} />
          </Field>
          <Field label="الفئة">
            <Select value={v.category} onChange={(c) => setV({ ...v, category: c as "ADMIN" })} options={Object.entries(CATEGORY).map(([value, x]) => ({ value, label: x.label }))} />
          </Field>
          <Field label="رئيس القسم">
            <Select value={v.headEmployeeId} onChange={(headEmployeeId) => setV({ ...v, headEmployeeId })} options={[none, ...org.employees.map((e) => ({ value: e.id, label: e.fullName }))]} />
          </Field>
          <Field label="مركز التكلفة">
            <Select value={v.costCenterId} onChange={(costCenterId) => setV({ ...v, costCenterId })} options={[none, ...org.costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || v.name.trim().length < 2} onClick={() => m.mutate({ id: dept?.id ?? null, code: v.code, name: v.name, parentId: v.parentId || null, headEmployeeId: v.headEmployeeId || null, category: v.category, costCenterId: v.costCenterId || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PositionDialog({ position, departmentId, onClose }: { position: Org["positions"][number] | null; departmentId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ title: position?.title ?? "", headcount: position?.headcount ?? 1 });
  const m = trpc.hr.employees.savePosition.useMutation({ onSuccess: () => (toast.success("حُفظ المسمى"), void utils.hr.employees.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={position ? "تعديل المسمى" : "مسمى وظيفي"}>
        <div className="grid grid-cols-[1fr_120px] gap-3 px-5 pb-4">
          <Field label="المسمى">
            <Input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field label="الشواغر المعتمدة">
            <Input type="number" min={0} value={v.headcount} onChange={(e) => setV({ ...v, headcount: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 2} onClick={() => m.mutate({ id: position?.id ?? null, departmentId, title: v.title, headcount: v.headcount })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
