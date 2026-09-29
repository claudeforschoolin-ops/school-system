"use client";
/**
 * الموظفون: القائمة بالبحث والتصفية، نموذج الإضافة والتعديل (الهوية مشفّرة، الآيبان بفحص صحة)،
 * ملف الموظف الكامل (العقد والراتب، الأرصدة، الحضور، السلف، التقييمات، القسائم)، وتنبيهات انتهاء الوثائق.
 */
import { AlertTriangle, CalendarClock, FilePlus2, Link2, Pencil, Plus, Printer, Search, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { docNo, MoneyInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { ATT_STATUS, CATEGORY, EMPLOYEE_STATUS, EMPLOYEE_TABS, hrNav, LEAVE_STATUS, LOAN_STATUS, nationalityLabel, NATIONALITIES, RUN_STATUS, useMonthLabel } from "./common";

type Options = RouterOutputs["hr"]["employees"]["options"];
type Profile = RouterOutputs["hr"]["employees"]["get"];

export function EmployeesPage() {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("CURRENT");
  const [category, setCategory] = useState<string>("ALL");
  const [open, setOpen] = useState(false);
  const list = trpc.hr.employees.list.useQuery({ q: q || null, status: status === "CURRENT" ? null : status, category: category === "ALL" ? null : (category as "ACADEMIC") });
  const rows = list.data ?? [];
  const expiring = rows.filter((r) => r.expiring.length).length;
  return (
    <ModuleShell
      nav={hrNav("employees")}
      wide
      tabs={EMPLOYEE_TABS}
      actions={
        can("employees", "create") ? (
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>
            موظف جديد
          </Button>
        ) : null
      }
    >
      {list.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الموظفين" description={list.error.message} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="الموظفون" value={list.data ? rows.length : undefined} icon={<Users className="size-4" />} />
            <StatCard label="هيئة تعليمية" value={list.data ? rows.filter((r) => r.category === "ACADEMIC").length : undefined} icon={<Users className="size-4" />} />
            <StatCard label="سعوديون" value={list.data ? rows.filter((r) => r.nationality === "SA").length : undefined} icon={<Users className="size-4" />} hint={rows.length ? `نسبة التوطين ${formatNumber(Math.round((rows.filter((r) => r.nationality === "SA").length * 100) / rows.length), prefs.digits)}٪` : undefined} />
            <StatCard label="وثائق تنتهي قريباً" value={list.data ? expiring : undefined} tone={expiring ? "warning" : undefined} icon={<AlertTriangle className="size-4" />} href="/hr/employees/alerts" />
          </section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[280px]">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
              <Input className="ps-8" placeholder="بحث بالاسم أو الرقم أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الموظفين" />
            </div>
            <Select size="sm" className="w-[160px]" value={status} onChange={setStatus} options={[{ value: "CURRENT", label: "الحاليون" }, ...Object.entries(EMPLOYEE_STATUS).map(([value, v]) => ({ value, label: v.label }))]} />
            <Select size="sm" className="w-[150px]" value={category} onChange={setCategory} options={[{ value: "ALL", label: "كل الفئات" }, ...Object.entries(CATEGORY).map(([value, v]) => ({ value, label: v.label }))]} />
          </div>
          {!list.data ? (
            <SkeletonLines lines={10} />
          ) : !rows.length ? (
            <EmptyState illustration="search" title="لا موظفين مطابقين" description="غيّر البحث أو التصفية، أو أضف موظفاً جديداً." />
          ) : (
            <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
              <table className="w-full min-w-[860px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الموظف</th>
                    <th>القسم / المسمى</th>
                    <th>الفئة</th>
                    <th>الجنسية</th>
                    <th>المباشرة</th>
                    {rows.some((r) => r.wageMinor !== null) ? <th className="text-end">الأجر الشهري</th> : null}
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-hover/60">
                      <td className="tabular text-fg-3">{docNo(r.number, prefs.digits)}</td>
                      <td>
                        <Link href={`/hr/employees/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                          <Avatar name={r.fullName} src={r.photoUrl} size={24} />
                          {r.fullName}
                        </Link>
                      </td>
                      <td className="text-fg-2">
                        {r.department?.name ?? "—"}
                        {r.position ? <span className="block text-[12px] text-fg-3">{r.position}</span> : null}
                      </td>
                      <td>
                        <Tag color={CATEGORY[r.category]?.color}>{CATEGORY[r.category]?.label ?? r.category}</Tag>
                      </td>
                      <td>{nationalityLabel(r.nationality)}</td>
                      <td className="tabular text-fg-2">
                        <FmtDate d={r.hireDate} />
                      </td>
                      {rows.some((x) => x.wageMinor !== null) ? <td className="text-end tabular">{r.wageMinor !== null ? money.fmt(r.wageMinor) : "—"}</td> : null}
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Tag color={EMPLOYEE_STATUS[r.status]!.color}>{EMPLOYEE_STATUS[r.status]!.label}</Tag>
                          {r.expiring.map((x) => (
                            <Tag key={x} size="sm" color="orange">
                              {x}
                            </Tag>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {open ? <EmployeeDialog employee={null} onClose={() => setOpen(false)} /> : null}
    </ModuleShell>
  );
}

function FmtDate({ d }: { d: Date | string | null | undefined }) {
  const f = useFmtDate();
  return <>{f(d)}</>;
}

const isoOf = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function EmployeeDialog({ employee, onClose }: { employee: Profile["employee"] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const opts = trpc.hr.employees.options.useQuery();
  const [tab, setTab] = useState<"personal" | "job" | "bank">("personal");
  const [v, setV] = useState({
    fullName: employee?.fullName ?? "",
    gender: (employee?.gender ?? "MALE") as "MALE" | "FEMALE",
    birthDate: isoOf(employee?.birthDate),
    nationality: employee?.nationality ?? "SA",
    maritalStatus: employee?.maritalStatus ?? "",
    idType: (employee?.idType ?? "NATIONAL_ID") as "NATIONAL_ID" | "IQAMA" | "PASSPORT",
    nationalId: "",
    idExpiry: isoOf(employee?.idExpiry),
    passportNumber: employee?.passportNumber ?? "",
    passportExpiry: isoOf(employee?.passportExpiry),
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    address: employee?.address ?? "",
    branchId: employee?.branchId ?? "",
    departmentId: employee?.departmentId ?? "",
    positionId: employee?.positionId ?? "",
    managerId: employee?.managerId ?? "",
    category: (employee?.category ?? "ACADEMIC") as "ACADEMIC" | "ADMIN" | "SERVICES",
    hireDate: isoOf(employee?.hireDate) || new Date().toISOString().slice(0, 10),
    bankName: employee?.bankName ?? "",
    iban: employee?.iban && !employee.iban.startsWith("•") ? employee.iban : "",
    sponsor: employee?.sponsor ?? "",
    shiftId: employee?.shiftId ?? "",
    gosiRegistered: employee?.gosiRegistered ?? true,
    notes: employee?.notes ?? "",
  });
  const onSuccess = (r: { id: string }) => (toast.success(employee ? "حُفظ ملف الموظف" : "أُضيف الموظف"), void utils.hr.employees.invalidate(), onClose(), !employee && router.push(`/hr/employees/${r.id}`));
  const create = trpc.hr.employees.create.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const update = trpc.hr.employees.update.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const o: Options | undefined = opts.data;
  const nul = (s: string) => s.trim() || null;
  const payload = { ...v, birthDate: nul(v.birthDate), maritalStatus: nul(v.maritalStatus), nationalId: nul(v.nationalId), idExpiry: nul(v.idExpiry), passportNumber: nul(v.passportNumber), passportExpiry: nul(v.passportExpiry), phone: nul(v.phone), email: nul(v.email), address: nul(v.address), branchId: nul(v.branchId), departmentId: nul(v.departmentId), positionId: nul(v.positionId), managerId: nul(v.managerId), bankName: nul(v.bankName), iban: nul(v.iban), sponsor: nul(v.sponsor), shiftId: nul(v.shiftId), notes: nul(v.notes), qualifications: employee ? (employee.qualifications as never) : [], experiences: employee ? (employee.experiences as never) : [] };
  const ibanOk = !v.iban || /^SA\d{22}$/.test(v.iban.replace(/\s/g, ""));
  const valid = v.fullName.trim().split(/\s+/).length >= 3 && v.hireDate && ibanOk;
  const none = { value: "", label: "—" };
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={employee ? `تعديل: ${employee.fullName}` : "موظف جديد"} description="رقم الهوية يُحفظ مشفّراً ولا يظهر إلا لمن يملك الصلاحية." width={680}>
        <div className="px-5">
          <div className="mb-3 flex gap-1 border-b border-line text-[13px]" role="tablist">
            {(
              [
                ["personal", "البيانات الشخصية"],
                ["job", "الوظيفة"],
                ["bank", "البنك والتأمينات"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-2.5 pb-2", tab === k ? "border-fg font-medium" : "border-transparent text-fg-3")}>
                {l}
              </button>
            ))}
          </div>
          {tab === "personal" ? (
            <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
              <Field label="الاسم الرباعي" className="sm:col-span-2">
                <Input autoFocus value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
              </Field>
              <Field label="الجنس">
                <Select value={v.gender} onChange={(g) => setV({ ...v, gender: g as "MALE" })} options={[{ value: "MALE", label: "ذكر" }, { value: "FEMALE", label: "أنثى" }]} />
              </Field>
              <Field label="الجنسية">
                <Select value={v.nationality} onChange={(nationality) => setV({ ...v, nationality, idType: nationality === "SA" ? "NATIONAL_ID" : "IQAMA" })} options={NATIONALITIES} />
              </Field>
              <Field label="نوع الهوية">
                <Select value={v.idType} onChange={(t) => setV({ ...v, idType: t as "IQAMA" })} options={[{ value: "NATIONAL_ID", label: "هوية وطنية" }, { value: "IQAMA", label: "إقامة" }, { value: "PASSPORT", label: "جواز سفر" }]} />
              </Field>
              <Field label={employee ? "رقم الهوية (اتركه فارغاً لعدم التغيير)" : "رقم الهوية"}>
                <Input dir="ltr" inputMode="numeric" value={v.nationalId} placeholder={employee?.nationalId ?? ""} onChange={(e) => setV({ ...v, nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
              </Field>
              <Field label="انتهاء الهوية/الإقامة">
                <Input type="date" value={v.idExpiry} onChange={(e) => setV({ ...v, idExpiry: e.target.value })} />
              </Field>
              <Field label="تاريخ الميلاد">
                <Input type="date" value={v.birthDate} onChange={(e) => setV({ ...v, birthDate: e.target.value })} />
              </Field>
              {v.nationality !== "SA" ? (
                <>
                  <Field label="رقم الجواز">
                    <Input dir="ltr" value={v.passportNumber} onChange={(e) => setV({ ...v, passportNumber: e.target.value })} />
                  </Field>
                  <Field label="انتهاء الجواز">
                    <Input type="date" value={v.passportExpiry} onChange={(e) => setV({ ...v, passportExpiry: e.target.value })} />
                  </Field>
                </>
              ) : null}
              <Field label="الجوال">
                <Input dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="05XXXXXXXX" />
              </Field>
              <Field label="البريد">
                <Input dir="ltr" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
              </Field>
              <Field label="العنوان" className="sm:col-span-2">
                <Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
              </Field>
            </div>
          ) : tab === "job" ? (
            <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
              <Field label="تاريخ المباشرة">
                <Input type="date" value={v.hireDate} onChange={(e) => setV({ ...v, hireDate: e.target.value })} />
              </Field>
              <Field label="الفئة">
                <Select value={v.category} onChange={(c) => setV({ ...v, category: c as "ADMIN" })} options={Object.entries(CATEGORY).map(([value, x]) => ({ value, label: x.label }))} />
              </Field>
              <Field label="الفرع">
                <Select value={v.branchId} onChange={(branchId) => setV({ ...v, branchId })} options={[none, ...(o?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
              </Field>
              <Field label="القسم">
                <Select value={v.departmentId} onChange={(departmentId) => setV({ ...v, departmentId, positionId: "" })} options={[none, ...(o?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
              </Field>
              <Field label="المسمى الوظيفي">
                <Select value={v.positionId} onChange={(positionId) => setV({ ...v, positionId })} options={[none, ...(o?.positions ?? []).filter((p) => !v.departmentId || p.departmentId === v.departmentId).map((p) => ({ value: p.id, label: p.title }))]} />
              </Field>
              <Field label="المدير المباشر">
                <Select value={v.managerId} onChange={(managerId) => setV({ ...v, managerId })} options={[none, ...(o?.managers ?? []).filter((m) => m.id !== employee?.id).map((m) => ({ value: m.id, label: m.fullName }))]} />
              </Field>
              <Field label="الوردية">
                <Select value={v.shiftId} onChange={(shiftId) => setV({ ...v, shiftId })} options={[{ value: "", label: "الوردية الافتراضية" }, ...(o?.shifts ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))]} />
              </Field>
              <Field label="ملاحظات" className="sm:col-span-2">
                <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
              <Field label="البنك">
                <Input value={v.bankName} onChange={(e) => setV({ ...v, bankName: e.target.value })} />
              </Field>
              <Field label="الآيبان" error={ibanOk ? null : "آيبان سعودي: SA و٢٢ رقماً"}>
                <Input dir="ltr" value={v.iban} placeholder={employee?.iban ?? "SA"} onChange={(e) => setV({ ...v, iban: e.target.value.toUpperCase().replace(/\s/g, "") })} />
              </Field>
              {v.nationality !== "SA" ? (
                <Field label="الكفيل / جهة الاستقدام">
                  <Input value={v.sponsor} onChange={(e) => setV({ ...v, sponsor: e.target.value })} />
                </Field>
              ) : null}
              <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                <Checkbox checked={v.gosiRegistered} onChange={(gosiRegistered) => setV({ ...v, gosiRegistered })} /> مسجّل في التأمينات الاجتماعية
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending || update.isPending} onClick={() => (employee ? update.mutate({ id: employee.id, ...payload }) : create.mutate(payload))}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// ملف الموظف
// ---------------------------------------------------------------------

export function EmployeeProfilePage({ id }: { id: string }) {
  const q = trpc.hr.employees.get.useQuery({ id });
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const monthLabel = useMonthLabel();
  const today = useToday();
  const [dialog, setDialog] = useState<null | "edit" | "contract" | "link">(null);
  const d = q.data;
  if (q.error) {
    return (
      <ModuleShell nav={hrNav("employees")} title="ملف الموظف">
        <EmptyState illustration="lock" title="لا يمكن عرض الملف" description={q.error.message} />
      </ModuleShell>
    );
  }
  if (!d) {
    return (
      <ModuleShell nav={hrNav("employees")} title="ملف الموظف">
        <SkeletonLines lines={14} />
      </ModuleShell>
    );
  }
  const e = d.employee;
  const contract = e.contracts.find((c) => c.status === "ACTIVE") ?? e.contracts[0] ?? null;
  const years = Math.floor((Date.parse(`${today}T00:00:00Z`) - new Date(e.hireDate).getTime()) / (365 * 86_400_000));
  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="flex justify-between gap-3 border-b border-line/50 py-1.5 text-[13px] last:border-0">
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-end font-medium">{v || "—"}</dd>
    </div>
  );
  return (
    <ModuleShell
      nav={hrNav("employees")}
      wide
      title={e.fullName}
      crumbs={[{ title: e.fullName }]}
      actions={
        d.permissions.edit ? (
          <>
            <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => setDialog("link")}>
              حساب الدخول
            </Button>
            <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setDialog("edit")}>
              تعديل
            </Button>
            {d.permissions.eos && e.status !== "TERMINATED" ? (
              <Link href={`/hr/end-of-service?employee=${e.id}`}>
                <Button size="sm" variant="ghost" icon={<UserMinus className="size-3.5" />}>
                  إنهاء الخدمة
                </Button>
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={e.fullName} src={e.photoUrl} size={64} />
        <div>
          <h1 className="text-[26px] font-bold leading-tight">{e.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-fg-3">
            <span className="tabular">#{docNo(e.number, prefs.digits)}</span>·<span>{e.positionRef?.title ?? "بلا مسمى"}</span>·<span>{e.department?.name ?? "بلا قسم"}</span>
            <Tag color={EMPLOYEE_STATUS[e.status]!.color}>{EMPLOYEE_STATUS[e.status]!.label}</Tag>
            <Tag color={CATEGORY[e.category]?.color}>{CATEGORY[e.category]?.label}</Tag>
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold">البيانات الشخصية</h2>
          <dl>
            {row("الجنسية", nationalityLabel(e.nationality))}
            {row(e.idType === "IQAMA" ? "رقم الإقامة" : e.idType === "PASSPORT" ? "رقم الجواز" : "رقم الهوية", <bdi className="tabular">{e.nationalId}</bdi>)}
            {row("انتهاء الهوية", e.idExpiry ? fmtDate(e.idExpiry) : null)}
            {e.passportNumber ? row("انتهاء الجواز", fmtDate(e.passportExpiry)) : null}
            {row("تاريخ الميلاد", e.birthDate ? fmtDate(e.birthDate) : null)}
            {row("الجوال", e.phone ? <bdi dir="ltr">{e.phone}</bdi> : null)}
            {row("البريد", e.email)}
            {e.sponsor ? row("الكفيل", e.sponsor) : null}
          </dl>
        </section>
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold">الوظيفة</h2>
          <dl>
            {row("تاريخ المباشرة", `${fmtDate(e.hireDate)} (${formatNumber(years, prefs.digits)} سنة)`)}
            {row("الفرع", d.branch)}
            {row("المدير المباشر", e.manager ? <Link className="hover:underline" href={`/hr/employees/${e.manager.id}`}>{e.manager.fullName}</Link> : null)}
            {row("المرؤوسون", e.reports.length ? formatNumber(e.reports.length, prefs.digits) : null)}
            {row("الوردية", d.shift ? `${d.shift.name} ${d.shift.startTime}–${d.shift.endTime}` : null)}
            {row("حساب الدخول", d.user ? `${d.user.name} (${d.user.status === "ACTIVE" ? "نشط" : "موقوف"})` : "غير مرتبط")}
            {row("التأمينات", e.gosiRegistered ? "مسجل" : "غير مسجل")}
            {e.terminationDate ? row("انتهاء الخدمة", `${fmtDate(e.terminationDate)} — ${e.terminationReason ?? ""}`) : null}
          </dl>
        </section>
        <section className="rounded-lg bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">العقد والراتب</h2>
            {d.permissions.salary ? (
              <Button size="xs" variant="ghost" icon={<FilePlus2 className="size-3.5" />} onClick={() => setDialog("contract")}>
                {contract ? "عقد جديد / تعديل راتب" : "إضافة عقد"}
              </Button>
            ) : null}
          </div>
          {!contract ? (
            <p className="text-[13px] text-fg-3">{d.permissions.salary || d.permissions.self ? "لا عقد مسجل." : "بيانات الراتب لموظفي الرواتب."}</p>
          ) : (
            <dl>
              {row("نوع العقد", contract.type === "FIXED" ? "محدد المدة" : contract.type === "UNLIMITED" ? "غير محدد المدة" : "دوام جزئي")}
              {row("المدة", `${fmtDate(contract.startDate)} ← ${contract.endDate ? fmtDate(contract.endDate) : "مفتوح"}`)}
              {row("الأساسي", money.fmt(contract.basicMinor))}
              {row("بدل السكن", money.fmt(contract.housingMinor))}
              {row("بدل النقل", money.fmt(contract.transportMinor))}
              {contract.otherTotalMinor ? row("بدلات أخرى", money.fmt(contract.otherTotalMinor)) : null}
              {row("الإجمالي الشهري", <b>{money.fmt(contract.wageMinor)}</b>)}
              {row("الإجازة السنوية", `${formatNumber(contract.annualLeaveDays, prefs.digits)} يوماً`)}
            </dl>
          )}
          {e.iban ? <p className="mt-2 text-[12px] text-fg-3">{e.bankName} · <bdi dir="ltr">{e.iban}</bdi></p> : null}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
            <CalendarClock className="size-4 text-fg-3" /> أرصدة الإجازات وحضور الشهر
          </h2>
          <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {d.balances
              .filter((b) => b.type.annualDays !== null)
              .map((b) => (
                <li key={b.type.id} className="rounded-md bg-hover/60 px-3 py-2">
                  <p className="text-[12px] text-fg-3">{b.type.name}</p>
                  <p className="text-[16px] font-bold tabular">
                    {formatNumber(b.remaining ?? 0, prefs.digits)} <span className="text-[12px] font-normal text-fg-3">من {formatNumber(b.entitled, prefs.digits)}</span>
                  </p>
                </li>
              ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {d.monthAttendance.length ? (
              d.monthAttendance.map((a) => (
                <Tag key={a.status} color={ATT_STATUS[a.status]?.color}>
                  {ATT_STATUS[a.status]?.label} {formatNumber(a.days, prefs.digits)}
                </Tag>
              ))
            ) : (
              <span className="text-[13px] text-fg-3">لا سجلات حضور هذا الشهر.</span>
            )}
          </div>
          {d.leaveRequests.length ? (
            <ul className="mt-3 divide-y divide-line/60 text-[13px]">
              {d.leaveRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span>{r.type}</span>
                  <span className="text-fg-3 tabular">
                    {fmtDate(r.startDate)} ← {fmtDate(r.endDate)} ({formatNumber(r.days, prefs.digits)} يوم)
                  </span>
                  <Tag size="sm" color={LEAVE_STATUS[r.status]?.color}>
                    {LEAVE_STATUS[r.status]?.label}
                  </Tag>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold">قسائم الراتب والسلف والتقييم</h2>
          {d.payslips.length ? (
            <ul className="divide-y divide-line/60 text-[13px]">
              {d.payslips.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1">{monthLabel(p.month)}</span>
                  <Tag size="sm" color={RUN_STATUS[p.status]?.color}>
                    {RUN_STATUS[p.status]?.label}
                  </Tag>
                  <span className="tabular">{money.fmt(p.netMinor)}</span>
                  <Link href={`/hr/payroll/payslip/${p.id}`}>
                    <Button size="icon-sm" variant="ghost" aria-label="طباعة القسيمة">
                      <Printer className="size-3.5" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-3">لا قسائم معتمدة بعد.</p>
          )}
          {e.loans.length ? (
            <ul className="mt-3 space-y-1 text-[13px]">
              {e.loans.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <span className="flex-1">سلفة {money.fmt(l.amountMinor)} — سُدد {money.fmt(l.repaidMinor)}</span>
                  <Tag size="sm" color={LOAN_STATUS[l.status]?.color}>
                    {LOAN_STATUS[l.status]?.label}
                  </Tag>
                </li>
              ))}
            </ul>
          ) : null}
          {d.reviews.length ? (
            <ul className="mt-3 space-y-1 text-[13px]">
              {d.reviews.map((r) => (
                <li key={r.id}>
                  <Link className="hover:underline" href={`/hr/performance/reviews/${r.id}`}>
                    {r.cycle}: {r.rating ?? "قيد التقييم"}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
      {dialog === "edit" ? <EmployeeDialog employee={e} onClose={() => setDialog(null)} /> : null}
      {dialog === "contract" ? <ContractDialog employeeId={e.id} current={contract} onClose={() => setDialog(null)} /> : null}
      {dialog === "link" ? <LinkUserDialog employeeId={e.id} userId={e.userId} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function ContractDialog({ employeeId, current, onClose }: { employeeId: string; current: Profile["employee"]["contracts"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({
    type: (current?.type ?? "FIXED") as "FIXED" | "UNLIMITED" | "PART_TIME",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    basicMinor: current?.basicMinor ?? 0,
    housingMinor: current?.housingMinor ?? 0,
    transportMinor: current?.transportMinor ?? 0,
    hoursPerDay: current?.hoursPerDay ?? 8,
    annualLeaveDays: current?.annualLeaveDays ?? 21,
  });
  const m = trpc.hr.employees.saveContract.useMutation({ onSuccess: () => (toast.success("حُفظ العقد؛ أُنهي العقد السابق"), void utils.hr.employees.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const money = useMoney();
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="عقد جديد / تعديل الراتب" description="يُنهى العقد الساري في اليوم السابق لبداية العقد الجديد، ويبقى السابق في السجل." width={600}>
        <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
          <Field label="نوع العقد">
            <Select value={v.type} onChange={(t) => setV({ ...v, type: t as "FIXED" })} options={[{ value: "FIXED", label: "محدد المدة" }, { value: "UNLIMITED", label: "غير محدد المدة" }, { value: "PART_TIME", label: "دوام جزئي" }]} />
          </Field>
          <Field label="ساعات العمل اليومية">
            <Input type="number" min={1} max={12} value={v.hoursPerDay} onChange={(e) => setV({ ...v, hoursPerDay: Math.max(1, Math.min(12, Number(e.target.value) || 8)) })} />
          </Field>
          <Field label="البداية">
            <Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
          </Field>
          <Field label="النهاية" hint={v.type === "FIXED" ? "مطلوبة للعقد محدد المدة" : undefined}>
            <Input type="date" value={v.endDate} min={v.startDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
          </Field>
          <Field label="الراتب الأساسي">
            <MoneyInput value={v.basicMinor} onChange={(a) => setV({ ...v, basicMinor: a ?? 0 })} />
          </Field>
          <Field label="بدل السكن">
            <MoneyInput value={v.housingMinor} onChange={(a) => setV({ ...v, housingMinor: a ?? 0 })} />
          </Field>
          <Field label="بدل النقل">
            <MoneyInput value={v.transportMinor} onChange={(a) => setV({ ...v, transportMinor: a ?? 0 })} />
          </Field>
          <Field label="الإجازة السنوية (يوماً)" hint="٢١ يوماً، و٣٠ بعد خمس سنوات تلقائياً">
            <Input type="number" min={21} max={60} value={v.annualLeaveDays} onChange={(e) => setV({ ...v, annualLeaveDays: Math.max(21, Math.min(60, Number(e.target.value) || 21)) })} />
          </Field>
          <p className="text-[13px] text-fg-2 sm:col-span-2">الإجمالي الشهري: <b className="tabular">{money.fmt(v.basicMinor + v.housingMinor + v.transportMinor)}</b></p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.basicMinor || (v.type === "FIXED" && !v.endDate)} onClick={() => m.mutate({ employeeId, type: v.type, startDate: v.startDate, endDate: v.endDate || null, probationEnd: null, basicMinor: v.basicMinor, housingMinor: v.housingMinor, transportMinor: v.transportMinor, otherAllowances: [], hoursPerDay: v.hoursPerDay, annualLeaveDays: v.annualLeaveDays })}>
            حفظ العقد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkUserDialog({ employeeId, userId, onClose }: { employeeId: string; userId: string | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const opts = trpc.hr.employees.options.useQuery();
  const [v, setV] = useState(userId ?? "");
  const m = trpc.hr.employees.linkUser.useMutation({ onSuccess: () => (toast.success("حُفظ الربط"), void utils.hr.employees.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="ربط حساب الدخول" description="يتيح للموظف الخدمة الذاتية: تسجيل الحضور، طلب الإجازة، قسائم الراتب. يُنشأ الحساب من «المستخدمون» في الإعدادات.">
        <div className="px-5 pb-4">
          <Select value={v} onChange={setV} options={[{ value: "", label: "بلا حساب" }, ...(opts.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.name} — ${u.email}` }))]} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ employeeId, userId: v || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// التنبيهات
// ---------------------------------------------------------------------

export function AlertsPage() {
  const q = trpc.hr.employees.alerts.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  return (
    <ModuleShell nav={hrNav("employees")} tabs={EMPLOYEE_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض التنبيهات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.length ? (
        <EmptyState illustration="calendar" title="لا وثائق تنتهي قريباً" description="تظهر هنا الهويات والإقامات والجوازات والعقود المنتهية أو القريبة من الانتهاء (المهلة من إعدادات الرواتب)." />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="w-full min-w-[560px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الوثيقة</th>
                <th>تاريخ الانتهاء</th>
                <th>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a, i) => (
                <tr key={i}>
                  <td>
                    <Link href={`/hr/employees/${a.employeeId}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td>{a.kind}</td>
                  <td className="tabular">{fmtDate(a.date)}</td>
                  <td>
                    <Tag color={a.daysLeft < 0 ? "red" : a.daysLeft <= 30 ? "orange" : "gold"}>{a.daysLeft < 0 ? `منتهية منذ ${formatNumber(-a.daysLeft, prefs.digits)} يوماً` : `${formatNumber(a.daysLeft, prefs.digits)} يوماً`}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleShell>
  );
}
