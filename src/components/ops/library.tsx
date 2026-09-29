"use client";
/**
 * المكتبة: الفهرس (بحث، تصنيفات، موارد رقمية، حجز)، بطاقة الكتاب ونسخه، مكتب الإعارة والإرجاع بالمسح،
 * سجل الإعارات والمتأخرات والغرامات، الحجوزات، الجرد بالمسح، الإعدادات، وصفحة «مكتبة أبنائي».
 */
import { BookOpen, BookPlus, Clock, ExternalLink, Library, Plus, RotateCcw, ScanLine, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { FinTable, MoneyInput, num, useFmtDate, useMoney } from "@/components/finance/common";
import { COPY_STATUS, LIBRARY_TABS, ModuleSettingsForm, opsNav } from "./common";

const nav = () => opsNav("library");

function useLibTabs() {
  const { scopeOf } = useApp();
  const s = scopeOf("library", "create");
  return s === "ALL" || s === "BRANCH" || s === "STAGE" ? LIBRARY_TABS : [{ href: "/library", label: "الفهرس", exact: true }];
}

export function CatalogPage() {
  const tabs = useLibTabs();
  const [filter, setFilter] = useState({ q: "", category: "", digital: "" });
  const q = trpc.library.books.useQuery({ q: filter.q || null, category: filter.category || null, digital: filter.digital === "" ? null : filter.digital === "1" });
  const stats = trpc.library.stats.useQuery(undefined, { retry: false });
  const prefs = usePrefs();
  const money = useMoney();
  const [adding, setAdding] = useState(false);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={tabs} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<BookPlus className="size-3.5" />} onClick={() => setAdding(true)}>كتاب جديد</Button> : null}>
      {stats.data ? (
        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="العناوين" value={stats.data.books} icon={<Library className="size-4" />} hint={`${formatNumber(Object.values(stats.data.copies).reduce((s, n) => s + n, 0), prefs.digits)} نسخة`} />
          <StatCard label="معار الآن" value={stats.data.copies.ON_LOAN ?? 0} icon={<BookOpen className="size-4" />} href="/library/loans" />
          <StatCard label="إعارات آخر ٣٠ يوماً" value={stats.data.loans30} icon={<Clock className="size-4" />} />
          <StatCard label="غرامات مفوترة" value={stats.data.finesInvoicedMinor} format={money.whole} compact icon={<RotateCcw className="size-4" />} />
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="w-72" placeholder="العنوان، المؤلف، ISBN أو باركود النسخة" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <Select size="sm" className="w-40" value={filter.category || "ALL"} onChange={(c) => setFilter({ ...filter, category: c === "ALL" ? "" : c })} options={[{ value: "ALL", label: "كل التصنيفات" }, ...(d?.categories ?? []).map((c) => ({ value: c.name, label: `${c.name} (${formatNumber(c.count, prefs.digits)})` }))]} />
        <Segmented value={filter.digital || "ALL"} onChange={(x) => setFilter({ ...filter, digital: x === "ALL" ? "" : x })} options={[{ value: "ALL", label: "الكل" }, { value: "0", label: "ورقي" }, { value: "1", label: "رقمي" }]} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الفهرس" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.books.length ? (
        <EmptyState illustration="search" title="لا كتب مطابقة" action={d.canEdit ? <Button variant="primary" onClick={() => setAdding(true)}>كتاب جديد</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {d.books.map((b) => (
            <Link key={b.id} href={`/library/books/${b.id}`} className="flex gap-3 rounded-lg bg-card p-3 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
              <span className="grid h-20 w-14 shrink-0 place-items-center rounded bg-[var(--tag-brown-bg)] text-[var(--tag-brown-fg)]"><BookOpen className="size-5" /></span>
              <span className="min-w-0">
                <span className="line-clamp-2 block text-[14px] font-medium leading-snug">{b.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-fg-3">{b.author ?? "—"}{b.year ? ` · ${formatNumber(b.year, prefs.digits)}` : ""}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {b.isDigital ? <Tag size="sm" color="purple">رقمي</Tag> : <Tag size="sm" color={b.available ? "green" : "orange"}>{b.available ? `متاح ${formatNumber(b.available, prefs.digits)}/${formatNumber(b.copies, prefs.digits)}` : "كل النسخ معارة"}</Tag>}
                  {b.category ? <Tag size="sm" color="gray">{b.category}</Tag> : null}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {adding ? <BookDialog onClose={() => setAdding(false)} /> : null}
    </ModuleShell>
  );
}

function BookDialog({ book, onClose }: { book?: { id: string; isbn: string | null; title: string; author: string | null; publisher: string | null; year: number | null; category: string | null; callNumber: string | null; description: string | null; isDigital: boolean; digitalUrl: string | null }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ isbn: book?.isbn ?? "", title: book?.title ?? "", author: book?.author ?? "", publisher: book?.publisher ?? "", year: book?.year ?? null as number | null, category: book?.category ?? "", callNumber: book?.callNumber ?? "", description: book?.description ?? "", isDigital: book?.isDigital ?? false, digitalUrl: book?.digitalUrl ?? "", newCopies: book ? 0 : 1, shelf: "" });
  const m = trpc.library.saveBook.useMutation({ onSuccess: () => (toast.success("حُفظ الكتاب"), void utils.library.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const n = (s: string) => s.trim() || null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={book ? "تعديل الكتاب" : "كتاب جديد"} description="تُولَّد باركودات النسخ تلقائياً للطباعة واللصق." width={640}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-3">
          <Field label="العنوان" className="col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus /></Field>
          <Field label="ISBN" hint="يُتحقق من خانة التحقق"><Input dir="ltr" value={v.isbn} onChange={(e) => setV({ ...v, isbn: e.target.value })} /></Field>
          <Field label="المؤلف"><Input value={v.author} onChange={(e) => setV({ ...v, author: e.target.value })} /></Field>
          <Field label="الناشر"><Input value={v.publisher} onChange={(e) => setV({ ...v, publisher: e.target.value })} /></Field>
          <Field label="سنة النشر"><Input type="number" value={v.year ?? ""} onChange={(e) => setV({ ...v, year: e.target.value ? Math.trunc(Number(e.target.value)) : null })} /></Field>
          <Field label="التصنيف"><Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="قصص، علوم، مراجع…" /></Field>
          <Field label="رقم الاستدعاء"><Input dir="ltr" value={v.callNumber} onChange={(e) => setV({ ...v, callNumber: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isDigital} onChange={(isDigital) => setV({ ...v, isDigital })} /> مورد رقمي</label>
          {v.isDigital ? <Field label="رابط المورد" className="col-span-2 sm:col-span-3"><Input dir="ltr" value={v.digitalUrl} onChange={(e) => setV({ ...v, digitalUrl: e.target.value })} placeholder="https://" /></Field> : (
            <>
              <Field label={book ? "نسخ إضافية" : "عدد النسخ"}><Input type="number" min={0} max={200} value={v.newCopies} onChange={(e) => setV({ ...v, newCopies: Math.max(0, Math.min(200, Math.trunc(Number(e.target.value) || 0))) })} /></Field>
              <Field label="الرف"><Input value={v.shelf} onChange={(e) => setV({ ...v, shelf: e.target.value })} placeholder="أ-٣" /></Field>
            </>
          )}
          <Field label="نبذة" className="col-span-2 sm:col-span-3"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.title.trim()} onClick={() => m.mutate({ id: book?.id ?? null, isbn: n(v.isbn), title: v.title, author: n(v.author), publisher: n(v.publisher), year: v.year, category: n(v.category), callNumber: n(v.callNumber), description: n(v.description), isDigital: v.isDigital, digitalUrl: n(v.digitalUrl), newCopies: v.newCopies, shelf: n(v.shelf) })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BookDetail({ id }: { id: string }) {
  const tabs = useLibTabs();
  const q = trpc.library.book.useQuery({ id });
  const family = trpc.library.family.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"edit" | "reserve" | null>(null);
  const [kid, setKid] = useState<PickedStudent | null>(null);
  const setStatus = trpc.library.setCopyStatus.useMutation({ onSuccess: () => (toast.success("حُدّثت حالة النسخة"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const reserve = trpc.library.reserve.useMutation({ onSuccess: (r) => (toast.success(r.status === "READY" ? "النسخة محجوزة وجاهزة للاستلام" : "أُضيف الحجز لقائمة الانتظار"), setDialog(null), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const b = d?.book;
  const kids = family.data ?? [];
  return (
    <ModuleShell nav={nav()} tabs={tabs} wide title={b?.title} crumbs={b ? [{ title: "الفهرس", href: "/library" }, { title: b.title }] : undefined}
      actions={d ? (<>{d.canEdit ? <Button size="sm" onClick={() => setDialog("edit")}>تعديل</Button> : null}{b && !b.isDigital ? <Button size="sm" variant="primary" onClick={() => setDialog("reserve")}>حجز</Button> : null}</>) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الكتاب" description={q.error.message} />
      ) : !d || !b ? (
        <SkeletonLines lines={8} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <header>
              <h1 className="text-[26px] font-bold">{b.title}</h1>
              <p className="mt-1 text-[14px] text-fg-2">{[b.author, b.publisher, b.year ? formatNumber(b.year, prefs.digits) : null].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 flex flex-wrap gap-2 text-[12px] text-fg-3">{b.isbn ? <span className="tabular">ISBN {b.isbn}</span> : null}{b.callNumber ? <span>رقم الاستدعاء {b.callNumber}</span> : null}{b.category ? <Tag color="gray">{b.category}</Tag> : null}</p>
              {b.description ? <p className="mt-3 text-[14px] text-fg-2">{b.description}</p> : null}
              {b.isDigital && b.digitalUrl ? <a href={b.digitalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[14px] text-navy-700 underline"><ExternalLink className="size-4" />فتح المورد الرقمي</a> : null}
            </header>
            {!b.isDigital ? (
              <section>
                <h2 className="mb-2 text-[15px] font-semibold">النسخ</h2>
                <FinTable dense head={<tr><th>الباركود</th><th>الرف</th><th>الحالة</th>{d.canEdit ? <th /> : null}</tr>}>
                  {b.copies.map((c) => (
                    <tr key={c.id}>
                      <td className="tabular" dir="ltr">{c.barcode}</td>
                      <td>{c.shelf ?? "—"}</td>
                      <td><Tag color={COPY_STATUS[c.status]?.color}>{COPY_STATUS[c.status]?.label}</Tag></td>
                      {d.canEdit ? <td className="text-end">{c.status !== "ON_LOAN" ? <Select size="sm" className="ms-auto w-36" value={c.status === "ON_HOLD" ? undefined : c.status} placeholder="تغيير الحالة" onChange={(s) => setStatus.mutate({ copyId: c.id, status: s as "AVAILABLE" })} options={[{ value: "AVAILABLE", label: "متاحة" }, { value: "DAMAGED", label: "تالفة" }, { value: "LOST", label: "مفقودة" }, { value: "WITHDRAWN", label: "سحب من التداول" }]} /> : null}</td> : null}
                    </tr>
                  ))}
                </FinTable>
              </section>
            ) : null}
            {d.staff && d.loans.length ? (
              <section>
                <h2 className="mb-2 text-[15px] font-semibold">آخر الإعارات</h2>
                <FinTable dense head={<tr><th>النسخة</th><th>المستعير</th><th>أُعير</th><th>الإرجاع</th></tr>}>
                  {d.loans.map((l) => <tr key={l.id}><td className="tabular" dir="ltr">{l.copy.barcode}</td><td>{l.borrowerName}</td><td className="tabular">{fmtDate(l.loanedAt)}</td><td className="tabular">{l.returnedAt ? fmtDate(l.returnedAt) : <Tag color="navy">معار حتى {fmtDate(l.dueDate)}</Tag>}</td></tr>)}
                </FinTable>
              </section>
            ) : null}
          </div>
          <aside className="rounded-lg bg-card p-4 shadow-card">
            <h2 className="mb-2 text-[14px] font-semibold">الحجوزات ({formatNumber(d.reservations.length, prefs.digits)})</h2>
            {d.reservations.length ? (
              <ol className="space-y-1.5 text-[13px]">{d.reservations.map((r, i) => <li key={r.id}>{formatNumber(i + 1, prefs.digits)}. {r.name} <Tag size="sm" color={r.status === "READY" ? "green" : "gold"}>{r.status === "READY" ? "جاهز" : "بالانتظار"}</Tag></li>)}</ol>
            ) : <p className="text-[13px] text-fg-3">لا حجوزات.</p>}
          </aside>
        </div>
      )}
      {dialog === "edit" && b ? <BookDialog book={b} onClose={() => setDialog(null)} /> : null}
      <Dialog open={dialog === "reserve"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="حجز الكتاب" description="إن توفرت نسخة تُحفظ لك، وإلا تدخل قائمة الانتظار ويصلك إشعار عند إرجاعها." width={440}>
          <div className="px-5 pb-4">
            {kids.length ? (
              <Field label="للطالب"><Select value={kid?.id ?? undefined} onChange={(sid) => { const k = kids.find((x) => x.studentId === sid); setKid(k ? { id: k.studentId, fullName: k.name, academicNumber: "" } : null); }} options={kids.map((k) => ({ value: k.studentId, label: k.name }))} /></Field>
            ) : <Field label="للطالب"><StudentPicker value={kid} onChange={setKid} /></Field>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button variant="primary" loading={reserve.isPending} disabled={!kid} onClick={() => reserve.mutate({ bookId: id, studentId: kid!.id })}>حجز</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}

/** مكتب الإعارة والإرجاع: مسح الباركود */
export function DeskPage() {
  const utils = trpc.useUtils();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const [mode, setMode] = useState<"OUT" | "IN">("OUT");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [code, setCode] = useState("");
  const [log, setLog] = useState<Array<{ ok: boolean; text: string }>>([]);
  const input = useRef<HTMLInputElement>(null);
  const push = (ok: boolean, text: string) => setLog((l) => [{ ok, text }, ...l].slice(0, 12));
  const out = trpc.library.checkout.useMutation({ onSuccess: (l) => (push(true, `أُعير «${code}» لـ${l.borrowerName} حتى ${fmtDate(l.dueDate)}`), void utils.library.invalidate()), onError: (e) => push(false, e.message), onSettled: () => (setCode(""), input.current?.focus()) });
  const back = trpc.library.checkin.useMutation({ onSuccess: (r) => (push(true, `أُرجع «${r.title}» من ${r.borrower}${r.lateDays ? ` — تأخر ${r.lateDays} يوماً${r.fineMinor ? `، غرامة ${money.fmt(r.fineMinor)}${r.invoiced ? " أُضيفت لحساب الطالب" : ""}` : ""}` : ""}${r.heldFor ? ` · محجوز لـ${r.heldFor}` : ""}`), void utils.library.invalidate()), onError: (e) => push(false, e.message), onSettled: () => (setCode(""), input.current?.focus()) });
  const submit = () => {
    if (!code.trim()) return;
    if (mode === "OUT") {
      if (!student) return push(false, "اختر الطالب أولاً");
      out.mutate({ barcode: code.trim(), studentId: student.id });
    } else back.mutate({ barcode: code.trim() });
  };
  return (
    <ModuleShell nav={nav()} tabs={LIBRARY_TABS}>
      <div className="rounded-lg bg-card p-5 shadow-card">
        <Segmented value={mode} onChange={setMode} options={[{ value: "OUT", label: "إعارة", icon: <BookOpen className="size-3.5" /> }, { value: "IN", label: "إرجاع", icon: <Undo2 className="size-3.5" /> }]} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mode === "OUT" ? <Field label="المستعير"><StudentPicker value={student} onChange={setStudent} /></Field> : null}
          <Field label="باركود النسخة" hint="امسح الباركود أو اكتبه ثم Enter">
            <div className="relative">
              <ScanLine className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
              <Input ref={input} dir="ltr" className="ps-8" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus aria-label="باركود النسخة" />
            </div>
          </Field>
        </div>
        <Button className="mt-3" variant="primary" loading={out.isPending || back.isPending} onClick={submit}>{mode === "OUT" ? "إعارة" : "إرجاع"}</Button>
      </div>
      {log.length ? (
        <ul className="mt-4 space-y-1.5" aria-live="polite">
          {log.map((l, i) => <li key={i} className={cn("rounded-md px-3 py-2 text-[13px]", l.ok ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-700")}>{l.text}</li>)}
        </ul>
      ) : null}
    </ModuleShell>
  );
}

export function LoansPage() {
  const [filter, setFilter] = useState<{ status: "ACTIVE" | "OVERDUE" | "RETURNED" | ""; q: string }>({ status: "ACTIVE", q: "" });
  const q = trpc.library.circulation.useQuery({ status: filter.status || null, q: filter.q || null });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const renew = trpc.library.renew.useMutation({ onSuccess: () => (toast.success("مُدّدت الإعارة"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const waive = trpc.library.waive.useMutation({ onSuccess: () => (toast.success("أُعفي من الغرامة"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={LIBRARY_TABS} wide>
      {d ? (
        <section className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="معار الآن" value={d.stats.active} icon={<BookOpen className="size-4" />} />
          <StatCard label="متأخر" value={d.stats.overdue} tone={d.stats.overdue ? "danger" : undefined} icon={<Clock className="size-4" />} />
          <StatCard label="أُعير اليوم" value={d.stats.today} icon={<Plus className="size-4" />} />
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter.status || "ALL"} onChange={(s) => setFilter({ ...filter, status: s === "ALL" ? "" : (s as "ACTIVE") })} options={[{ value: "ACTIVE", label: "معار" }, { value: "OVERDUE", label: "متأخر" }, { value: "RETURNED", label: "مُرجع" }, { value: "ALL", label: "الكل" }]} />
        <Input className="w-64" placeholder="المستعير أو العنوان أو الباركود" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإعارات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.loans.length ? (
        <EmptyState illustration="table" title="لا إعارات مطابقة" />
      ) : (
        <FinTable head={<tr><th>الكتاب</th><th>النسخة</th><th>المستعير</th><th>أُعير</th><th>الاستحقاق</th><th className="text-end">التمديد</th><th className="text-end">الغرامة</th><th /></tr>}>
          {d.loans.map((l) => (
            <tr key={l.id}>
              <td><Link className="font-medium hover:underline" href={`/library/books/${l.bookId}`}>{l.title}</Link></td>
              <td className="tabular" dir="ltr">{l.barcode}</td>
              <td>{l.borrower}</td>
              <td className="tabular">{fmtDate(l.loanedAt)}</td>
              <td className={cn("tabular", l.overdue && "font-semibold text-danger-700")}>{l.returnedAt ? `أُرجع ${fmtDate(l.returnedAt)}` : `${fmtDate(l.dueDate)}${l.overdue ? ` (متأخر ${formatNumber(l.lateDays, prefs.digits)} يوماً)` : ""}`}</td>
              <td className={num}>{formatNumber(l.renewals, prefs.digits)}</td>
              <td className={num}>{l.fineMinor ? <>{money.fmt(l.fineMinor, false)} {l.fineStatus === "INVOICED" && l.fineInvoiceId ? <Link className="text-[11px] underline" href={`/finance/invoices/${l.fineInvoiceId}`}>مفوترة</Link> : l.fineStatus === "WAIVED" ? <Tag size="sm" color="gray">معفاة</Tag> : null}</> : "—"}</td>
              <td className="whitespace-nowrap text-end">
                {!l.returnedAt && !l.overdue ? <Button size="xs" variant="ghost" onClick={() => renew.mutate({ loanId: l.id })}>تمديد</Button> : null}
                {d.canWaive && l.fineMinor > 0 && l.fineStatus === "NONE" ? <Button size="xs" variant="ghost" onClick={() => waive.mutate({ loanId: l.id })}>إعفاء</Button> : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
    </ModuleShell>
  );
}

export function ReservationsPage() {
  const q = trpc.library.reservations.useQuery();
  const utils = trpc.useUtils();
  const fmtDate = useFmtDate();
  const cancel = trpc.library.cancelReservation.useMutation({ onSuccess: () => (toast.success("أُلغي الحجز"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={nav()} tabs={LIBRARY_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحجوزات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.length ? (
        <EmptyState illustration="inbox" title="لا حجوزات قائمة" />
      ) : (
        <FinTable head={<tr><th>الكتاب</th><th>لـ</th><th>منذ</th><th>الحالة</th><th /></tr>}>
          {q.data.map((r) => (
            <tr key={r.id}>
              <td><Link className="hover:underline" href={`/library/books/${r.bookId}`}>{r.book.title}</Link></td>
              <td>{r.name}</td>
              <td className="tabular">{fmtDate(r.createdAt)}</td>
              <td>{r.status === "READY" ? <Tag color="green">جاهز حتى {fmtDate(r.readyUntil)}</Tag> : <Tag color="gold">بالانتظار</Tag>}</td>
              <td className="text-end"><Button size="xs" variant="ghost" onClick={() => cancel.mutate({ id: r.id })}>إلغاء</Button></td>
            </tr>
          ))}
        </FinTable>
      )}
    </ModuleShell>
  );
}

export function StockTakePage() {
  const q = trpc.library.stockTake.useQuery();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [code, setCode] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const [missing, setMissing] = useState<Array<{ barcode: string; title: string; shelf: string | null }> | null>(null);
  const [markLost, setMarkLost] = useState(false);
  const start = trpc.library.startStockTake.useMutation({ onSuccess: () => void utils.library.stockTake.invalidate(), onError: (e) => toast.error(e.message) });
  const scan = trpc.library.scan.useMutation({ onSuccess: (r) => (setLast(`${r.title}${r.duplicate ? " (مكرر)" : ""}`), setCode(""), void utils.library.stockTake.invalidate()), onError: (e) => (toast.error(e.message), setCode("")) });
  const close = trpc.library.closeStockTake.useMutation({ onSuccess: (r) => (setMissing(r.missing), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={LIBRARY_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الجرد" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={6} />
      ) : !d.open ? (
        <div className="rounded-lg bg-card p-5 shadow-card">
          <p className="text-[14px]">النسخ المتوقعة على الرفوف: <b className="tabular">{formatNumber(d.expected, prefs.digits)}</b></p>
          {d.last ? <p className="mt-1 text-[13px] text-fg-3">آخر جرد {fmtDate(d.last.closedAt)} — المفقود {formatNumber(d.last.missing ?? 0, prefs.digits)}</p> : null}
          <Button className="mt-3" variant="primary" loading={start.isPending} onClick={() => start.mutate()}>بدء الجرد</Button>
          {missing ? (
            <div className="mt-4">
              <h3 className="mb-2 text-[14px] font-semibold">غير الممسوحة ({formatNumber(missing.length, prefs.digits)})</h3>
              <FinTable dense head={<tr><th>الباركود</th><th>العنوان</th><th>الرف</th></tr>}>{missing.map((m) => <tr key={m.barcode}><td className="tabular" dir="ltr">{m.barcode}</td><td>{m.title}</td><td>{m.shelf ?? "—"}</td></tr>)}</FinTable>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg bg-card p-5 shadow-card">
          <p className="mb-3 text-[14px]">ممسوح <b className="tabular">{formatNumber(d.open.scanned, prefs.digits)}</b> من <span className="tabular">{formatNumber(d.expected, prefs.digits)}</span> متوقعة</p>
          <div className="h-2 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full bg-[var(--tag-green-dot)]" style={{ width: `${Math.min(100, d.expected ? (d.open.scanned * 100) / d.expected : 0)}%` }} /></div>
          <Field label="امسح باركود النسخة" className="mt-4 max-w-sm"><Input dir="ltr" value={code} autoFocus onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code.trim() && scan.mutate({ barcode: code.trim() })} aria-label="باركود" /></Field>
          {last ? <p className="mt-2 text-[13px] text-success-800">✓ {last}</p> : null}
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={markLost} onChange={setMarkLost} /> تعليم غير الممسوح كمفقود</label>
            <Button variant="primary" loading={close.isPending} onClick={() => close.mutate({ markMissingLost: markLost })}>إنهاء الجرد</Button>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}

export function LibrarySettingsPage() {
  return (
    <ModuleShell nav={nav()} tabs={LIBRARY_TABS}>
      <ModuleSettingsForm<{ loanDays: number; staffLoanDays: number; maxLoans: number; maxRenewals: number; finePerDayMinor: number; fineCapMinor: number; graceDays: number; holdDays: number; autoInvoiceFines: boolean; blockWithFines: boolean }> settingsKey="library" title="قواعد الإعارة والغرامات">
        {(v, set, canEdit) => {
          const int = (s: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(s) || 0)));
          return (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="مدة إعارة الطالب (يوم)"><Input disabled={!canEdit} type="number" value={v.loanDays} onChange={(e) => set({ loanDays: int(e.target.value, 1, 120) })} /></Field>
              <Field label="مدة إعارة الموظف (يوم)"><Input disabled={!canEdit} type="number" value={v.staffLoanDays} onChange={(e) => set({ staffLoanDays: int(e.target.value, 1, 365) })} /></Field>
              <Field label="أقصى عدد كتب معارة"><Input disabled={!canEdit} type="number" value={v.maxLoans} onChange={(e) => set({ maxLoans: int(e.target.value, 1, 30) })} /></Field>
              <Field label="مرات التمديد"><Input disabled={!canEdit} type="number" value={v.maxRenewals} onChange={(e) => set({ maxRenewals: int(e.target.value, 0, 10) })} /></Field>
              <Field label="غرامة اليوم" hint="صفر = بلا غرامات"><MoneyInput disabled={!canEdit} value={v.finePerDayMinor} onChange={(a) => set({ finePerDayMinor: a ?? 0 })} /></Field>
              <Field label="الحد الأعلى للغرامة" hint="صفر = بلا حد"><MoneyInput disabled={!canEdit} value={v.fineCapMinor} onChange={(a) => set({ fineCapMinor: a ?? 0 })} /></Field>
              <Field label="أيام السماح"><Input disabled={!canEdit} type="number" value={v.graceDays} onChange={(e) => set({ graceDays: int(e.target.value, 0, 30) })} /></Field>
              <Field label="الاحتفاظ بالمحجوز (يوم)"><Input disabled={!canEdit} type="number" value={v.holdDays} onChange={(e) => set({ holdDays: int(e.target.value, 1, 30) })} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.autoInvoiceFines} onChange={(autoInvoiceFines) => set({ autoInvoiceFines })} /> إضافة الغرامة لحساب الطالب تلقائياً</label>
              <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.blockWithFines} onChange={(blockWithFines) => set({ blockWithFines })} /> منع الإعارة مع غرامة غير مسددة</label>
            </div>
          );
        }}
      </ModuleSettingsForm>
    </ModuleShell>
  );
}

/** مكتبة أبنائي */
export function FamilyLibraryPage() {
  const q = trpc.library.family.useQuery();
  const utils = trpc.useUtils();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const renew = trpc.library.renew.useMutation({ onSuccess: () => (toast.success("مُدّدت الإعارة"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  const cancel = trpc.library.cancelReservation.useMutation({ onSuccess: () => (toast.success("أُلغي الحجز"), void utils.library.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={opsNav("my-library")} actions={<Link href="/library"><Button size="sm" icon={<Library className="size-3.5" />}>تصفح الفهرس</Button></Link>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المكتبة" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.length ? (
        <EmptyState title="لا أبناء مرتبطون بحسابك" />
      ) : (
        <div className="space-y-5">
          {q.data.map((k) => (
            <section key={k.studentId} className="rounded-lg bg-card p-4 shadow-card">
              <h2 className="mb-3 text-[16px] font-semibold">{k.name}</h2>
              {!k.loans.length && !k.holds.length ? <p className="text-[13px] text-fg-3">لا إعارات ولا حجوزات.</p> : null}
              {k.loans.filter((l) => !l.returnedAt).map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                  <span><b>{l.title}</b> <span className="text-fg-3">{l.author ?? ""}</span></span>
                  <span className="flex items-center gap-2">
                    <Tag color={l.overdue ? "red" : "navy"}>{l.overdue ? "متأخر — " : "يُرجع "}{fmtDate(l.dueDate)}</Tag>
                    {!l.overdue ? <Button size="xs" variant="ghost" onClick={() => renew.mutate({ loanId: l.id })}>تمديد</Button> : null}
                  </span>
                </div>
              ))}
              {k.holds.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span>حجز: {h.title}</span>
                  <span className="flex items-center gap-2"><Tag color={h.status === "READY" ? "green" : "gold"}>{h.status === "READY" ? `جاهز للاستلام حتى ${fmtDate(h.readyUntil)}` : "بالانتظار"}</Tag><Button size="xs" variant="ghost" onClick={() => cancel.mutate({ id: h.id })}>إلغاء</Button></span>
                </div>
              ))}
              {k.loans.some((l) => l.fineMinor > 0) ? <p className="mt-2 text-[12px] text-fg-3">غرامات سابقة: {money.fmt(k.loans.reduce((s, l) => s + (l.fineStatus === "INVOICED" ? l.fineMinor : 0), 0))} (تظهر في فواتير الأسرة)</p> : null}
            </section>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
