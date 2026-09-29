"use client";
/**
 * التوظيف: الوظائف الشاغرة، ولوحة كانبان للمرشحين تُسحب بين المراحل، وبطاقة المرشح،
 * والتعيين الذي ينشئ ملف الموظف وعقده ويغلق الوظيفة عند اكتمال شواغرها.
 */
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Briefcase, Plus, Star, UserCheck } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { MoneyInput, useMoney } from "@/components/finance/common";
import { CATEGORY, hrNav, nationalityLabel, NATIONALITIES } from "./common";

type Board = RouterOutputs["hr"]["recruitment"]["board"];
type App = Board["columns"][number]["items"][number];
type Opening = RouterOutputs["hr"]["recruitment"]["openings"][number];
type Stage = App["stage"];

export function RecruitmentPage() {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const openings = trpc.hr.recruitment.openings.useQuery();
  const [openingId, setOpeningId] = useState<string>("ALL");
  const board = trpc.hr.recruitment.board.useQuery({ openingId: openingId === "ALL" ? null : openingId });
  const [dialog, setDialog] = useState<null | { opening: Opening | null } | { app: App | null } | { hire: App }>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const move = trpc.hr.recruitment.move.useMutation({ onSettled: () => void utils.hr.recruitment.invalidate(), onError: (e) => toast.error(e.message) });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const stage = String(e.over.id) as Stage;
    const app = board.data?.columns.flatMap((c) => c.items).find((a) => a.id === e.active.id);
    if (!app || app.stage === stage) return;
    if (stage === "HIRED") {
      if (app.stage !== "OFFER") return void toast.error("التعيين من مرحلة «عرض وظيفي»");
      return setDialog({ hire: app });
    }
    move.mutate({ id: app.id, stage, position: Date.now() });
  };
  const open = (openings.data ?? []).filter((o) => o.status === "OPEN");
  return (
    <ModuleShell
      nav={hrNav("recruitment")}
      wide
      actions={
        <>
          <Button size="sm" icon={<Briefcase className="size-3.5" />} onClick={() => setDialog({ opening: null })}>
            وظيفة شاغرة
          </Button>
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} disabled={!open.length} onClick={() => setDialog({ app: null })}>
            مرشح
          </Button>
        </>
      }
    >
      {openings.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض التوظيف" description={openings.error.message} />
      ) : !openings.data ? (
        <SkeletonLines lines={10} />
      ) : !openings.data.length ? (
        <EmptyState illustration="inbox" title="لا وظائف شاغرة" description="أنشئ وظيفة شاغرة ثم أضف مرشحيها وحرّكهم على اللوحة حتى التعيين." action={<Button variant="primary" onClick={() => setDialog({ opening: null })}>وظيفة شاغرة</Button>} />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 thin-scroll">
            <button type="button" onClick={() => setOpeningId("ALL")} className={cn("shrink-0 rounded-lg px-3 py-2 text-start text-[13px] shadow-card", openingId === "ALL" ? "bg-active font-medium" : "bg-card hover:bg-hover")}>
              كل الوظائف المفتوحة
            </button>
            {openings.data.map((o) => (
              <button key={o.id} type="button" onClick={() => setOpeningId(o.id)} onDoubleClick={() => setDialog({ opening: o })} className={cn("shrink-0 rounded-lg px-3 py-2 text-start shadow-card", openingId === o.id ? "bg-active" : "bg-card hover:bg-hover")}>
                <span className="block text-[13px] font-medium">{o.title}</span>
                <span className="block text-[11px] text-fg-3">
                  {o.department ?? "—"} · {formatNumber(o.applicants, prefs.digits)} مرشح · {formatNumber(o.hired, prefs.digits)}/{formatNumber(o.openings, prefs.digits)} {o.status === "OPEN" ? "" : o.status === "CLOSED" ? "· مغلقة" : "· معلّقة"}
                </span>
              </button>
            ))}
          </div>
          {openingId !== "ALL" ? (
            <div className="mb-3">
              <Button size="xs" variant="ghost" onClick={() => setDialog({ opening: openings.data.find((o) => o.id === openingId) ?? null })}>
                تعديل الوظيفة
              </Button>
            </div>
          ) : null}
          {!board.data ? (
            <SkeletonLines lines={8} />
          ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="flex gap-3 overflow-x-auto pb-4 thin-scroll">
                {board.data.columns.map((c) => (
                  <Column key={c.key} col={c} onOpen={(app) => setDialog({ app })} />
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}
      {dialog && "opening" in dialog ? <OpeningDialog opening={dialog.opening} onClose={() => setDialog(null)} /> : null}
      {dialog && "app" in dialog ? <AppDialog app={dialog.app} openings={openings.data ?? []} defaultOpening={openingId === "ALL" ? open[0]?.id : openingId} onClose={() => setDialog(null)} onHire={(app) => setDialog({ hire: app })} /> : null}
      {dialog && "hire" in dialog ? <HireDialog app={dialog.hire} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function Column({ col, onOpen }: { col: Board["columns"][number]; onOpen: (a: App) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const prefs = usePrefs();
  return (
    <section ref={setNodeRef} className={cn("flex w-[250px] shrink-0 flex-col rounded-lg bg-hover/50 p-2 transition-colors", isOver && "bg-active")} aria-label={col.label}>
      <h3 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-medium">
        <Tag color={col.color}>{col.label}</Tag>
        <span className="tabular text-fg-3">{formatNumber(col.items.length, prefs.digits)}</span>
      </h3>
      <ul className="flex min-h-[80px] flex-col gap-2">
        {col.items.map((a) => (
          <Card key={a.id} app={a} onOpen={() => onOpen(a)} />
        ))}
      </ul>
    </section>
  );
}

function Card({ app, onOpen }: { app: App; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id, disabled: app.stage === "HIRED" });
  const prefs = usePrefs();
  return (
    <li ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} className={cn("cursor-grab rounded-md bg-card p-2.5 shadow-card active:cursor-grabbing", isDragging && "z-10 shadow-popover")} {...attributes} {...listeners}>
      <button type="button" className="block w-full text-start" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()}>
        <span className="block text-[13px] font-medium">{app.fullName}</span>
      </button>
      <span className="block text-[11px] text-fg-3">{app.opening.title}</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
        <span>{nationalityLabel(app.nationality)}</span>·<span>{formatNumber(app.experienceYears, prefs.digits)} سنوات خبرة</span>
        {app.rating ? (
          <span className="ms-auto flex items-center gap-0.5 text-warning-700">
            <Star className="size-3 fill-current" />
            {formatNumber(app.rating, prefs.digits)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function OpeningDialog({ opening, onClose }: { opening: Opening | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const opts = trpc.hr.employees.options.useQuery();
  const [v, setV] = useState({ title: opening?.title ?? "", departmentId: opening?.departmentId ?? "", positionId: opening?.positionId ?? "", branchId: opening?.branchId ?? "", description: opening?.description ?? "", requirements: opening?.requirements ?? "", openings: opening?.openings ?? 1, status: (opening?.status ?? "OPEN") as "OPEN" | "ON_HOLD" | "CLOSED", closingDate: opening?.closingDate ? new Date(opening.closingDate).toISOString().slice(0, 10) : "" });
  const m = trpc.hr.recruitment.saveOpening.useMutation({ onSuccess: () => (toast.success("حُفظت الوظيفة"), void utils.hr.recruitment.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const none = { value: "", label: "—" };
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={opening ? "تعديل الوظيفة" : "وظيفة شاغرة"} width={600}>
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
          <Field label="المسمى" className="sm:col-span-2">
            <Input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="معلم رياضيات — المرحلة المتوسطة" />
          </Field>
          <Field label="القسم">
            <Select value={v.departmentId} onChange={(departmentId) => setV({ ...v, departmentId })} options={[none, ...(opts.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
          <Field label="المسمى في الهيكل">
            <Select value={v.positionId} onChange={(positionId) => setV({ ...v, positionId })} options={[none, ...(opts.data?.positions ?? []).filter((p) => !v.departmentId || p.departmentId === v.departmentId).map((p) => ({ value: p.id, label: p.title }))]} />
          </Field>
          <Field label="الفرع">
            <Select value={v.branchId} onChange={(branchId) => setV({ ...v, branchId })} options={[none, ...(opts.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
          </Field>
          <Field label="عدد الشواغر">
            <Input type="number" min={1} max={50} value={v.openings} onChange={(e) => setV({ ...v, openings: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
          </Field>
          <Field label="الحالة">
            <Select value={v.status} onChange={(s) => setV({ ...v, status: s as "OPEN" })} options={[{ value: "OPEN", label: "مفتوحة" }, { value: "ON_HOLD", label: "معلّقة" }, { value: "CLOSED", label: "مغلقة" }]} />
          </Field>
          <Field label="آخر موعد للتقديم">
            <Input type="date" value={v.closingDate} onChange={(e) => setV({ ...v, closingDate: e.target.value })} />
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <Field label="المتطلبات" className="sm:col-span-2">
            <Textarea rows={2} value={v.requirements} onChange={(e) => setV({ ...v, requirements: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 2} onClick={() => m.mutate({ id: opening?.id ?? null, ...v, departmentId: v.departmentId || null, positionId: v.positionId || null, branchId: v.branchId || null, description: v.description || null, requirements: v.requirements || null, closingDate: v.closingDate || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppDialog({ app, openings, defaultOpening, onClose, onHire }: { app: App | null; openings: Opening[]; defaultOpening?: string; onClose: () => void; onHire: (a: App) => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ openingId: app?.openingId ?? defaultOpening ?? "", fullName: app?.fullName ?? "", email: app?.email ?? "", phone: app?.phone ?? "", nationality: app?.nationality ?? "SA", gender: (app?.gender ?? "MALE") as "MALE" | "FEMALE", qualification: app?.qualification ?? "", experienceYears: app?.experienceYears ?? 0, rating: app?.rating ?? 0, interviewAt: app?.interviewAt ? new Date(app.interviewAt).toISOString().slice(0, 16) : "", offerSalaryMinor: app?.offerSalaryMinor ?? null, notes: app?.notes ?? "" });
  const m = trpc.hr.recruitment.saveApplication.useMutation({ onSuccess: () => (toast.success("حُفظ المرشح"), void utils.hr.recruitment.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const moveM = trpc.hr.recruitment.move.useMutation({ onSuccess: () => (toast.success("استُبعد المرشح"), void utils.hr.recruitment.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={app ? app.fullName : "مرشح جديد"} width={620}>
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
          <Field label="الوظيفة" className="sm:col-span-2">
            <Select value={v.openingId} onChange={(openingId) => setV({ ...v, openingId })} options={openings.filter((o) => o.status !== "CLOSED" || o.id === app?.openingId).map((o) => ({ value: o.id, label: o.title }))} />
          </Field>
          <Field label="الاسم الكامل" className="sm:col-span-2">
            <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
          </Field>
          <Field label="الجوال">
            <Input dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field label="البريد">
            <Input dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="الجنسية">
            <Select value={v.nationality} onChange={(nationality) => setV({ ...v, nationality })} options={NATIONALITIES} />
          </Field>
          <Field label="الجنس">
            <Select value={v.gender} onChange={(g) => setV({ ...v, gender: g as "MALE" })} options={[{ value: "MALE", label: "ذكر" }, { value: "FEMALE", label: "أنثى" }]} />
          </Field>
          <Field label="المؤهل">
            <Input value={v.qualification} onChange={(e) => setV({ ...v, qualification: e.target.value })} placeholder="بكالوريوس رياضيات" />
          </Field>
          <Field label="سنوات الخبرة">
            <Input type="number" min={0} max={50} value={v.experienceYears} onChange={(e) => setV({ ...v, experienceYears: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
          </Field>
          <Field label="موعد المقابلة">
            <Input type="datetime-local" value={v.interviewAt} onChange={(e) => setV({ ...v, interviewAt: e.target.value })} />
          </Field>
          <Field label="التقييم (١–٥)">
            <div className="flex h-8 items-center gap-1" role="radiogroup" aria-label="التقييم">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={v.rating === n} aria-label={`${n}`} onClick={() => setV({ ...v, rating: n })} className={cn("grid size-7 place-items-center rounded", n <= v.rating ? "text-warning-700" : "text-fg-3")}>
                  <Star className={cn("size-4", n <= v.rating && "fill-current")} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="الراتب المعروض (الأساسي)" className="sm:col-span-2">
            <MoneyInput value={v.offerSalaryMinor} onChange={(offerSalaryMinor) => setV({ ...v, offerSalaryMinor })} />
          </Field>
          <Field label="ملاحظات المقابلة" className="sm:col-span-2">
            <Textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          {app && app.stage !== "HIRED" && app.stage !== "REJECTED" ? (
            <Button variant="ghost" className="me-auto" onClick={() => moveM.mutate({ id: app.id, stage: "REJECTED", position: Date.now() })}>
              استبعاد
            </Button>
          ) : null}
          {app?.stage === "OFFER" ? (
            <Button icon={<UserCheck className="size-3.5" />} onClick={() => onHire(app)}>
              تعيين
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.openingId || v.fullName.trim().split(/\s+/).length < 2} onClick={() => m.mutate({ id: app?.id ?? null, openingId: v.openingId, fullName: v.fullName, email: v.email || null, phone: v.phone || null, nationality: v.nationality, gender: v.gender, qualification: v.qualification || null, experienceYears: v.experienceYears, rating: v.rating || null, interviewAt: v.interviewAt ? new Date(v.interviewAt) : null, offerSalaryMinor: v.offerSalaryMinor, notes: v.notes || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HireDialog({ app, onClose }: { app: App; onClose: () => void }) {
  const utils = trpc.useUtils();
  const money = useMoney();
  const opts = trpc.hr.employees.options.useQuery();
  const [v, setV] = useState({ hireDate: new Date().toISOString().slice(0, 10), category: "ACADEMIC" as "ACADEMIC" | "ADMIN" | "SERVICES", departmentId: "", managerId: "", basicMinor: app.offerSalaryMinor ?? 0, housingMinor: Math.round((app.offerSalaryMinor ?? 0) / 4), transportMinor: Math.round((app.offerSalaryMinor ?? 0) / 10), contractType: "FIXED" as "FIXED" | "UNLIMITED", contractMonths: 12 });
  const m = trpc.hr.recruitment.hire.useMutation({ onSuccess: (e) => (toast.success(`عُيّن ${e.fullName} وأُنشئ ملفه وعقده`), void utils.hr.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const none = { value: "", label: "—" };
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={`تعيين ${app.fullName}`} description="يُنشأ ملف الموظف وعقده، وتُغلق الوظيفة إذا اكتملت شواغرها. أكمل الهوية والآيبان من ملف الموظف." width={600}>
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
          <Field label="تاريخ المباشرة">
            <Input type="date" value={v.hireDate} onChange={(e) => setV({ ...v, hireDate: e.target.value })} />
          </Field>
          <Field label="الفئة">
            <Select value={v.category} onChange={(c) => setV({ ...v, category: c as "ADMIN" })} options={Object.entries(CATEGORY).map(([value, x]) => ({ value, label: x.label }))} />
          </Field>
          <Field label="القسم">
            <Select value={v.departmentId} onChange={(departmentId) => setV({ ...v, departmentId })} options={[{ value: "", label: "قسم الوظيفة" }, ...(opts.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
          </Field>
          <Field label="المدير المباشر">
            <Select value={v.managerId} onChange={(managerId) => setV({ ...v, managerId })} options={[none, ...(opts.data?.managers ?? []).map((x) => ({ value: x.id, label: x.fullName }))]} />
          </Field>
          <Field label="الأساسي">
            <MoneyInput value={v.basicMinor} onChange={(a) => setV({ ...v, basicMinor: a ?? 0 })} />
          </Field>
          <Field label="السكن">
            <MoneyInput value={v.housingMinor} onChange={(a) => setV({ ...v, housingMinor: a ?? 0 })} />
          </Field>
          <Field label="النقل">
            <MoneyInput value={v.transportMinor} onChange={(a) => setV({ ...v, transportMinor: a ?? 0 })} />
          </Field>
          <Field label="العقد">
            <Select value={v.contractType} onChange={(t) => setV({ ...v, contractType: t as "FIXED" })} options={[{ value: "FIXED", label: "محدد المدة" }, { value: "UNLIMITED", label: "غير محدد المدة" }]} />
          </Field>
          {v.contractType === "FIXED" ? (
            <Field label="مدة العقد (شهراً)">
              <Input type="number" min={1} max={60} value={v.contractMonths} onChange={(e) => setV({ ...v, contractMonths: Math.max(1, Math.min(60, Math.trunc(Number(e.target.value) || 12))) })} />
            </Field>
          ) : null}
          <p className="text-[13px] text-fg-2 sm:col-span-2">الإجمالي الشهري: <b className="tabular">{money.fmt(v.basicMinor + v.housingMinor + v.transportMinor)}</b> · فترة التجربة ٩٠ يوماً</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.basicMinor} onClick={() => m.mutate({ applicationId: app.id, hireDate: v.hireDate, category: v.category, departmentId: v.departmentId || null, positionId: null, branchId: null, managerId: v.managerId || null, basicMinor: v.basicMinor, housingMinor: v.housingMinor, transportMinor: v.transportMinor, contractType: v.contractType, contractMonths: v.contractMonths })}>
            تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
