/**
 * النتائج: درجة كل مادة من مكوناتها، المعدل الفصلي والتراكمي، الترتيب على الفصل والصف والمدرسة،
 * والنتيجة (ناجح/دور ثانٍ/راسب). الشهادات: قوالب بكتل مرتبة، إصدار جماعي بلقطة ورمز تحقق QR،
 * ونشر في تاريخ يحدده المدير مع حجب شهادات من عليهم مستحقات (اختياري). والإحصاءات وتحليل البنود.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { bandFor, componentBp, divRound, rankBy, subjectResult, termResult, type ResultStatus, type SubjectResult, type TermResult } from "@/lib/assessment/calc";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { rootDb } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { notify } from "@/server/services/notifications.service";
import { studentWhere } from "@/server/services/student-scope";
import { assessmentSettings, gradeScope, requireTerm, schemeFor, type LoadedScheme } from "./common";

export const RESULT_LABEL: Record<ResultStatus, string> = { PASS: "ناجح", SECOND_ROUND: "دور ثانٍ", FAIL: "راسب", INCOMPLETE: "غير مكتمل" };

// ---------------------------------------------------------------------
// الحساب
// ---------------------------------------------------------------------

export interface StudentRow {
  student: { id: string; fullName: string; academicNumber: string; sectionId: string; section: string; gradeId: string; grade: string; branchId: string; stageId: string };
  subjects: Record<string, SubjectResult>;
  term: TermResult;
  rank: { section: number | null; grade: number | null; school: number | null };
}

interface ComputeOptions {
  approvedOnly: boolean;
  /** شرط إضافي على الطلاب (نطاق المستخدم) */
  where?: Prisma.StudentWhereInput;
}

/** نتائج فصل دراسي لكل طلاب العام (للترتيب على الصف والمدرسة)، مع المواد من خطة الصف */
export async function computeTerm(db: TenantDb, tenantId: string, termId: string, opts: ComputeOptions) {
  const term = await requireTerm(db, termId);
  const students = await db.student.findMany({
    where: { academicYearId: term.academicYearId, status: "ACTIVE", deletedAt: null, sectionId: { not: null } },
    select: { id: true, fullName: true, academicNumber: true, sectionId: true, gradeId: true, branchId: true, section: { select: { name: true } }, grade: { select: { name: true, stageId: true } } },
    orderBy: { fullName: "asc" },
  });
  const [plan, subjects, assessments] = await Promise.all([
    db.gradeSubject.findMany({ where: { gradeId: { in: [...new Set(students.map((s) => s.gradeId))] } }, select: { gradeId: true, subjectId: true } }),
    db.subject.findMany({ where: { deletedAt: null }, select: { id: true, name: true, color: true } }),
    db.assessment.findMany({ where: { termId, ...(opts.approvedOnly ? { status: "APPROVED" } : {}) }, select: { id: true, sectionId: true, subjectId: true, componentKey: true, maxTenths: true, status: true, marks: { select: { studentId: true, scoreTenths: true, absent: true, excused: true } } } }),
  ]);
  const schemes = new Map<string, LoadedScheme>();
  for (const stageId of new Set(students.map((s) => s.grade.stageId))) schemes.set(stageId, await schemeFor(db, tenantId, stageId));
  const bySheet = new Map<string, typeof assessments>();
  for (const a of assessments) {
    const k = `${a.sectionId}|${a.subjectId}`;
    bySheet.set(k, [...(bySheet.get(k) ?? []), a]);
  }
  const rows: StudentRow[] = students.map((st) => {
    const scheme = schemes.get(st.grade.stageId)!;
    const subs: Record<string, SubjectResult> = {};
    for (const p of plan.filter((x) => x.gradeId === st.gradeId)) {
      const items = bySheet.get(`${st.sectionId}|${p.subjectId}`) ?? [];
      const byComponent: Record<string, number | null> = {};
      for (const c of scheme.components) {
        byComponent[c.key] = componentBp(
          items
            .filter((a) => a.componentKey === c.key)
            .map((a) => {
              const m = a.marks.find((x) => x.studentId === st.id);
              return { maxTenths: a.maxTenths, scoreTenths: m?.scoreTenths ?? null, absent: m?.absent ?? false, excused: m?.excused ?? false };
            }),
        );
      }
      subs[p.subjectId] = subjectResult(scheme.components, byComponent);
    }
    return {
      student: { id: st.id, fullName: st.fullName, academicNumber: st.academicNumber, sectionId: st.sectionId!, section: st.section?.name ?? "", gradeId: st.gradeId, grade: st.grade.name, branchId: st.branchId, stageId: st.grade.stageId },
      subjects: subs,
      term: termResult(Object.values(subs).map((s) => s.bp), scheme),
      rank: { section: null, grade: null, school: null },
    };
  });
  applyRanks(rows);
  const scoped = opts.where ? new Set((await db.student.findMany({ where: { AND: [opts.where, { id: { in: rows.map((r) => r.student.id) } }] }, select: { id: true } })).map((s) => s.id)) : null;
  return { term, subjects, plan, schemes, rows: scoped ? rows.filter((r) => scoped.has(r.student.id)) : rows, allRows: rows, assessments };
}

function applyRanks(rows: StudentRow[]) {
  const val = (r: StudentRow) => (r.term.result === "INCOMPLETE" ? null : r.term.averageBp);
  const group = (key: (r: StudentRow) => string, set: (r: StudentRow, n: number | null) => void) => {
    const groups = new Map<string, StudentRow[]>();
    for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    for (const g of groups.values()) {
      const ranks = rankBy(g, val);
      for (const r of g) set(r, ranks.get(r) ?? null);
    }
  };
  group((r) => r.student.sectionId, (r, n) => (r.rank.section = n));
  group((r) => r.student.gradeId, (r, n) => (r.rank.grade = n));
  group(() => "all", (r, n) => (r.rank.school = n));
}

/** النتيجة التراكمية للعام: متوسط المادة عبر الفصول الدراسية ثم النتيجة والترتيب */
export async function computeYear(db: TenantDb, tenantId: string, academicYearId: string, opts: ComputeOptions) {
  const terms = await db.term.findMany({ where: { academicYearId, deletedAt: null }, orderBy: { order: "asc" } });
  const perTerm: Array<{ term: (typeof terms)[number]; data: Awaited<ReturnType<typeof computeTerm>> }> = [];
  for (const t of terms) perTerm.push({ term: t, data: await computeTerm(db, tenantId, t.id, { approvedOnly: opts.approvedOnly }) });
  const last = perTerm.at(-1);
  if (!last) return { terms: [], rows: [] as StudentRow[], subjects: [] as Array<{ id: string; name: string; color: string }> };
  const rows: StudentRow[] = last.data.allRows.map((r) => {
    const subs: Record<string, SubjectResult> = {};
    for (const sid of Object.keys(r.subjects)) {
      const bps = perTerm.map((p) => p.data.allRows.find((x) => x.student.id === r.student.id)?.subjects[sid]?.bp ?? null).filter((b): b is number => b !== null);
      subs[sid] = { bp: bps.length === perTerm.length ? divRound(bps.reduce((a, b) => a + b, 0), bps.length) : null, missing: bps.length === perTerm.length ? [] : ["term"], components: [] };
    }
    return { student: r.student, subjects: subs, term: termResult(Object.values(subs).map((s) => s.bp), last.data.schemes.get(r.student.stageId)!), rank: { section: null, grade: null, school: null } };
  });
  applyRanks(rows);
  const scoped = opts.where ? new Set((await db.student.findMany({ where: { AND: [opts.where, { id: { in: rows.map((r) => r.student.id) } }] }, select: { id: true } })).map((s) => s.id)) : null;
  return { terms: terms.map((t) => ({ id: t.id, name: t.name })), rows: scoped ? rows.filter((r) => scoped.has(r.student.id)) : rows, subjects: last.data.subjects, termRows: perTerm };
}

// ---------------------------------------------------------------------
// النطاق
// ---------------------------------------------------------------------

/** من يرى نتائج فصل: نطاق «حساب المعدلات» (مدرسة/فرع/مرحلة)، أو رائد الفصل ومعلموه */
async function resultsWhere(db: TenantDb, session: SessionData): Promise<Prisma.StudentWhereInput> {
  const w = await studentWhere(db, session, "gpa", "view");
  const or: Prisma.StudentWhereInput[] = [];
  if (w) or.push(w);
  const gs = await gradeScope(db, session, "view");
  if (gs && (gs.homeroom.size || gs.teaching.size)) or.push({ sectionId: { in: [...gs.homeroom, ...[...gs.teaching].map((k) => k.split("|")[0]!)] } });
  if (!or.length) throw forbidden("ليس لديك صلاحية على النتائج");
  return { OR: or };
}

const pct = (n: number, d: number) => (d ? divRound(n * 10000, d) : 0);

/** نتائج فصل (أو العام كاملاً) لقسم دراسي: جدول المواد والمعدل والترتيب والنتيجة */
export async function sectionResults(db: TenantDb, session: SessionData, input: { sectionId: string; termId: string | "YEAR"; approvedOnly?: boolean }) {
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, include: { grade: { select: { id: true, name: true, stageId: true } }, branch: { select: { name: true } } } });
  if (!section) throw notFound("الفصل غير موجود");
  const where = await resultsWhere(db, session);
  const approvedOnly = input.approvedOnly ?? false;
  const scheme = await schemeFor(db, session.tenant.id, section.grade.stageId);
  let rows: StudentRow[];
  let subjects: Array<{ id: string; name: string; color: string }>;
  let pending = 0;
  if (input.termId === "YEAR") {
    const y = await computeYear(db, session.tenant.id, section.academicYearId, { approvedOnly, where: { AND: [where, { sectionId: section.id }] } });
    rows = y.rows;
    subjects = y.subjects;
  } else {
    const t = await computeTerm(db, session.tenant.id, input.termId, { approvedOnly, where: { AND: [where, { sectionId: section.id }] } });
    rows = t.rows;
    subjects = t.subjects;
    pending = t.assessments.filter((a) => a.sectionId === section.id && a.status !== "APPROVED").length;
  }
  if (!rows.length && !(await db.student.count({ where: { AND: [where, { sectionId: section.id }] } }))) throw forbidden("الفصل خارج نطاقك");
  const subjectIds = [...new Set(rows.flatMap((r) => Object.keys(r.subjects)))];
  const cols = subjects.filter((s) => subjectIds.includes(s.id));
  const withAvg = rows.filter((r) => r.term.averageBp !== null);
  return {
    section: { id: section.id, name: section.name, grade: section.grade.name, branch: section.branch.name },
    scheme: { passBp: scheme.passBp, bands: scheme.bands, display: scheme.display },
    subjects: cols,
    pendingApproval: pending,
    rows: rows.sort((a, b) => (a.rank.section ?? 9999) - (b.rank.section ?? 9999) || a.student.fullName.localeCompare(b.student.fullName)),
    summary: {
      students: rows.length,
      averageBp: withAvg.length ? divRound(withAvg.reduce((s, r) => s + r.term.averageBp!, 0), withAvg.length) : null,
      pass: rows.filter((r) => r.term.result === "PASS").length,
      secondRound: rows.filter((r) => r.term.result === "SECOND_ROUND").length,
      fail: rows.filter((r) => r.term.result === "FAIL").length,
      incomplete: rows.filter((r) => r.term.result === "INCOMPLETE").length,
      passRateBp: pct(rows.filter((r) => r.term.result === "PASS").length, rows.filter((r) => r.term.result !== "INCOMPLETE").length),
    },
  };
}

/** الفصول المتاحة للمستخدم (لاختيار كشف النتائج) */
export async function resultSections(db: TenantDb, session: SessionData) {
  const where = await resultsWhere(db, session);
  const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) return { year: null, terms: [], sections: [] };
  const [terms, grouped] = await Promise.all([
    db.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, name: true, startDate: true, endDate: true } }),
    db.student.groupBy({ by: ["sectionId"], where: { AND: [where, { academicYearId: year.id, status: "ACTIVE", deletedAt: null, sectionId: { not: null } }] }, _count: { _all: true } }),
  ]);
  const sections = await db.section.findMany({ where: { id: { in: grouped.map((g) => g.sectionId!).filter(Boolean) } }, include: { grade: { select: { name: true, order: true, stage: { select: { order: true } } } }, branch: { select: { name: true } } } });
  return {
    year: { id: year.id, name: year.name },
    terms,
    sections: sections
      .sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name))
      .map((s) => ({ id: s.id, name: `${s.grade.name} / ${s.name}`, branch: s.branch.name, students: grouped.find((g) => g.sectionId === s.id)?._count._all ?? 0 })),
  };
}

// ---------------------------------------------------------------------
// قوالب الشهادات
// ---------------------------------------------------------------------

export const REPORT_BLOCKS = {
  header: "ترويسة المدرسة والشعار",
  student: "بيانات الطالب",
  grades: "جدول درجات المواد",
  components: "تفصيل المكونات",
  summary: "المعدل والترتيب والنتيجة",
  attendance: "ملخص الحضور",
  notes: "ملاحظات وتوجيهات",
  signatures: "التواقيع والختم",
  qr: "رمز التحقق",
} as const;
export type ReportBlockType = keyof typeof REPORT_BLOCKS;
export interface ReportBlock {
  type: ReportBlockType;
  enabled: boolean;
  title?: string;
}

export const DEFAULT_TEMPLATE_BLOCKS: ReportBlock[] = (Object.keys(REPORT_BLOCKS) as ReportBlockType[]).map((type) => ({ type, enabled: type !== "components" }));
const DEFAULT_SIGNATURES = [
  { title: "رائد الفصل", name: "" },
  { title: "وكيل الشؤون الأكاديمية", name: "" },
  { title: "مدير المدرسة", name: "" },
];

function requireCards(session: SessionData, action: "view" | "create" | "update" | "approve") {
  const s = resolveScope(session.access, "report_cards", action);
  if (!s || (s.kind === "limited" && !s.branchIds.length && !s.stageIds.length)) throw forbidden("إدارة الشهادات لوكيل الشؤون الأكاديمية أو المدير");
  return s;
}

export async function listTemplates(db: TenantDb, session: SessionData) {
  requireCards(session, "view");
  let rows = await db.reportCardTemplate.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (!rows.length) {
    await db.reportCardTemplate.create({ data: { tenantId: session.tenant.id, name: "الشهادة الرسمية", blocks: DEFAULT_TEMPLATE_BLOCKS as unknown as Prisma.InputJsonValue, signatures: DEFAULT_SIGNATURES, isDefault: true, footerNote: assessmentSettings(session).reportCardFooter || null, createdById: session.user.id } });
    rows = await db.reportCardTemplate.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  }
  return rows.map((r) => ({ ...r, blocks: r.blocks as unknown as ReportBlock[], signatures: r.signatures as Array<{ title: string; name: string }> }));
}

export async function saveTemplate(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; blocks: ReportBlock[]; signatures: Array<{ title: string; name: string }>; stampUrl?: string | null; footerNote?: string | null; isDefault: boolean }) {
  requireCards(session, "update");
  if (!input.name.trim()) throw badRequest("اسم القالب مطلوب");
  const types = input.blocks.map((b) => b.type);
  if (new Set(types).size !== types.length || types.some((t) => !(t in REPORT_BLOCKS))) throw badRequest("كتل القالب غير صالحة");
  if (!input.blocks.some((b) => b.type === "grades" && b.enabled)) throw badRequest("جدول الدرجات إلزامي في الشهادة");
  if (input.signatures.length > 4) throw badRequest("أربعة تواقيع كحد أقصى");
  const data = { name: input.name.trim(), blocks: input.blocks as unknown as Prisma.InputJsonValue, signatures: input.signatures, stampUrl: input.stampUrl ?? null, footerNote: input.footerNote ?? null, isDefault: input.isDefault, updatedById: session.user.id };
  const saved = input.id ? await db.reportCardTemplate.update({ where: { id: input.id }, data }) : await db.reportCardTemplate.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
  if (input.isDefault) await db.reportCardTemplate.updateMany({ where: { id: { not: saved.id }, isDefault: true }, data: { isDefault: false } });
  return saved;
}

export async function deleteTemplate(db: TenantDb, session: SessionData, id: string) {
  requireCards(session, "update");
  const t = await db.reportCardTemplate.findFirst({ where: { id } });
  if (!t) throw notFound("القالب غير موجود");
  if (t.isDefault) throw badRequest("لا يُحذف القالب الافتراضي؛ اجعل قالباً آخر افتراضياً أولاً");
  await db.reportCardTemplate.delete({ where: { id } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// إصدار الشهادات ونشرها
// ---------------------------------------------------------------------

export interface CardSnapshot {
  student: { name: string; academicNumber: string; grade: string; section: string; branch: string };
  term: { name: string; year: string };
  subjects: Array<{ name: string; bp: number | null; band: string | null; letter: string | null; points: number | null; pass: boolean; components: Array<{ name: string; weight: number; bp: number | null }> }>;
  averageBp: number | null;
  gpa: number | null;
  result: ResultStatus;
  rank: { section: number | null; sectionSize: number; grade: number | null; gradeSize: number };
  attendance: { present: number; absent: number; late: number; excused: number };
  display: string;
  passBp: number;
}

function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** إصدار شهادات فصول: لا يُصدر إلا بعد اعتماد كل الدرجات، وتُحفظ لقطة ثابتة ورمز تحقق */
export async function issueReportCards(db: TenantDb, session: SessionData, input: { termId: string; sectionIds: string[]; templateId?: string | null }) {
  const scope = requireCards(session, "create");
  if (!input.sectionIds.length) throw badRequest("اختر فصلاً واحداً على الأقل");
  const sections = await db.section.findMany({ where: { id: { in: input.sectionIds }, deletedAt: null, ...(scope.kind === "all" ? {} : { branchId: { in: scope.branchIds } }) }, include: { branch: { select: { name: true } } } });
  if (sections.length !== input.sectionIds.length) throw forbidden("فصل خارج نطاقك");
  const pending = await db.assessment.count({ where: { termId: input.termId, sectionId: { in: input.sectionIds }, status: { not: "APPROVED" } } });
  if (pending) throw badRequest(`${pending} بند تقييم لم يُعتمد بعد في الفصول المختارة؛ اعتمد الدرجات أولاً`);
  const templates = await listTemplates(db, session);
  const template = templates.find((t) => t.id === input.templateId) ?? templates[0]!;
  const data = await computeTerm(db, session.tenant.id, input.termId, { approvedOnly: true });
  const targets = data.allRows.filter((r) => input.sectionIds.includes(r.student.sectionId));
  if (!targets.length) throw badRequest("لا طلاب في الفصول المختارة");
  const attendance = await db.attendance.groupBy({ by: ["studentId", "status"], where: { studentId: { in: targets.map((t) => t.student.id) }, period: 0, date: { gte: data.term.startDate, lte: data.term.endDate } }, _count: { _all: true } });
  const sizeOf = (key: (r: StudentRow) => string, v: string) => data.allRows.filter((r) => key(r) === v && r.term.result !== "INCOMPLETE").length;
  const existing = await db.reportCard.findMany({ where: { termId: input.termId, studentId: { in: targets.map((t) => t.student.id) } }, select: { studentId: true, verifyCode: true } });
  let issued = 0;
  for (const r of targets) {
    const scheme = data.schemes.get(r.student.stageId)!;
    const att = (s: string) => attendance.find((a) => a.studentId === r.student.id && a.status === s)?._count._all ?? 0;
    const snapshot: CardSnapshot = {
      student: { name: r.student.fullName, academicNumber: r.student.academicNumber, grade: r.student.grade, section: r.student.section, branch: sections.find((s) => s.id === r.student.sectionId)?.branch.name ?? "" },
      term: { name: data.term.name, year: data.term.academicYear.name },
      subjects: Object.entries(r.subjects).map(([sid, s]) => {
        const band = bandFor(s.bp, scheme.bands);
        return { name: data.subjects.find((x) => x.id === sid)?.name ?? "", bp: s.bp, band: band?.label ?? null, letter: band?.letter ?? null, points: band?.points ?? null, pass: s.bp !== null && s.bp >= scheme.passBp, components: s.components.map((c) => ({ name: c.name, weight: c.weight, bp: c.bp })) };
      }),
      averageBp: r.term.averageBp,
      gpa: r.term.gpa,
      result: r.term.result,
      rank: { section: r.rank.section, sectionSize: sizeOf((x) => x.student.sectionId, r.student.sectionId), grade: r.rank.grade, gradeSize: sizeOf((x) => x.student.gradeId, r.student.gradeId) },
      attendance: { present: att("PRESENT"), absent: att("ABSENT"), late: att("LATE"), excused: att("EXCUSED") + att("PERMISSION") },
      display: scheme.display,
      passBp: scheme.passBp,
    };
    const code = existing.find((e) => e.studentId === r.student.id)?.verifyCode ?? newCode();
    const values = { sectionId: r.student.sectionId, snapshot: snapshot as unknown as Prisma.InputJsonValue, averageBp: r.term.averageBp ?? 0, rank: r.rank.section, result: r.term.result, templateId: template.id, issuedAt: new Date(), issuedById: session.user.id };
    await db.reportCard.upsert({ where: { termId_studentId: { termId: input.termId, studentId: r.student.id } }, create: { tenantId: session.tenant.id, termId: input.termId, studentId: r.student.id, verifyCode: code, ...values }, update: values });
    issued += 1;
  }
  return { issued, template: template.name };
}

/** قائمة الشهادات لفصل: صادرة أم لا، مع حالة النشر والحجب */
export async function reportCardList(db: TenantDb, session: SessionData, input: { termId: string; sectionId: string }) {
  const scope = requireCards(session, "view");
  const section = await db.section.findFirst({ where: { id: input.sectionId, deletedAt: null, ...(scope.kind === "all" ? {} : { branchId: { in: scope.branchIds } }) } });
  if (!section) throw notFound("الفصل غير موجود أو خارج نطاقك");
  const [students, cards, publication, pending] = await Promise.all([
    db.student.findMany({ where: { sectionId: section.id, status: "ACTIVE", deletedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, academicNumber: true } }),
    db.reportCard.findMany({ where: { termId: input.termId, sectionId: section.id } }),
    db.resultPublication.findFirst({ where: { termId: input.termId } }),
    db.assessment.count({ where: { termId: input.termId, sectionId: section.id, status: { not: "APPROVED" } } }),
  ]);
  const debts = await studentDebts(db, students.map((s) => s.id));
  const withhold = Boolean(publication?.withholdOnDebt && assessmentSettings(session).withholdOnDebt);
  return {
    publication,
    pendingApproval: pending,
    rows: students.map((s) => {
      const c = cards.find((x) => x.studentId === s.id);
      return { student: s, card: c ? { id: c.id, averageBp: c.averageBp, rank: c.rank, result: c.result as ResultStatus, issuedAt: c.issuedAt, verifyCode: c.verifyCode } : null, debtMinor: debts.get(s.id) ?? 0, withheld: withhold && (debts.get(s.id) ?? 0) > 0 };
    }),
  };
}

/** مستحقات الطلاب غير المسددة (فواتير صادرة أو مسددة جزئياً) */
export async function studentDebts(db: TenantDb, studentIds: string[]) {
  const invoices = await db.invoice.findMany({ where: { studentId: { in: studentIds }, status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null }, select: { studentId: true, totalMinor: true, paidMinor: true, creditedMinor: true } });
  const out = new Map<string, number>();
  for (const i of invoices) out.set(i.studentId, (out.get(i.studentId) ?? 0) + i.totalMinor - i.paidMinor - i.creditedMinor);
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}

/** بيانات الطباعة: لقطات الشهادات مع القالب وبيانات المدرسة */
export async function printCards(db: TenantDb, session: SessionData, input: { termId: string; sectionId?: string | null; cardIds?: string[] | null }) {
  const family = await familyStudentIds(db, session);
  const staff = (() => {
    try {
      return requireCards(session, "view");
    } catch {
      return null;
    }
  })();
  if (!staff && !family.length) throw forbidden();
  const where: Prisma.ReportCardWhereInput = { termId: input.termId, ...(input.sectionId ? { sectionId: input.sectionId } : {}), ...(input.cardIds?.length ? { id: { in: input.cardIds } } : {}) };
  let cards = await db.reportCard.findMany({ where, orderBy: [{ sectionId: "asc" }, { rank: "asc" }] });
  if (!staff) {
    cards = cards.filter((c) => family.includes(c.studentId));
    const visible = await familyVisibility(db, session, input.termId, cards.map((c) => c.studentId));
    cards = cards.filter((c) => visible.get(c.studentId) === "VISIBLE");
  } else if (staff.kind === "limited") {
    const allowed = new Set((await db.section.findMany({ where: { branchId: { in: staff.branchIds } }, select: { id: true } })).map((s) => s.id));
    cards = cards.filter((c) => c.sectionId && allowed.has(c.sectionId));
  }
  const templates = await db.reportCardTemplate.findMany();
  const tenant = await db.tenant.findFirst({ where: { id: session.tenant.id }, select: { name: true, logoUrl: true } });
  return {
    school: { name: tenant?.name ?? session.tenant.name, logoUrl: tenant?.logoUrl ?? null },
    cards: cards.map((c) => {
      const t = templates.find((x) => x.id === c.templateId) ?? templates.find((x) => x.isDefault) ?? null;
      return { id: c.id, verifyCode: c.verifyCode, issuedAt: c.issuedAt, snapshot: c.snapshot as unknown as CardSnapshot, template: t ? { blocks: t.blocks as unknown as ReportBlock[], signatures: t.signatures as Array<{ title: string; name: string }>, stampUrl: t.stampUrl, footerNote: t.footerNote } : { blocks: DEFAULT_TEMPLATE_BLOCKS, signatures: DEFAULT_SIGNATURES, stampUrl: null, footerNote: null } };
    }),
  };
}

/** تحديد تاريخ نشر النتائج (المدير) وسياسة حجب المدينين */
export async function setPublication(db: TenantDb, session: SessionData, input: { termId: string; publishAt: Date; withholdOnDebt: boolean }) {
  requireCards(session, "approve");
  const term = await requireTerm(db, input.termId);
  const pub = await db.resultPublication.upsert({ where: { termId: term.id }, create: { tenantId: session.tenant.id, termId: term.id, publishAt: input.publishAt, withholdOnDebt: input.withholdOnDebt, createdById: session.user.id }, update: { publishAt: input.publishAt, withholdOnDebt: input.withholdOnDebt } });
  // إشعار أولياء الأمور والطلاب ذوي الحسابات بموعد الإتاحة
  const cards = await db.reportCard.findMany({ where: { termId: term.id }, select: { studentId: true } });
  const links = await db.student.findMany({ where: { id: { in: cards.map((c) => c.studentId) } }, select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } } });
  const users = [...new Set(links.flatMap((l) => [l.userId, ...l.guardians.map((g) => g.guardian.userId)]).filter((u): u is string => Boolean(u)))];
  if (users.length) await notify(db, { tenantId: session.tenant.id, userIds: users, type: "SYSTEM", title: `نتائج ${term.name}`, body: `تُتاح الشهادات في ${input.publishAt.toISOString().slice(0, 10)}`, link: "/assessment/my-results", actorId: session.user.id, entityType: "ResultPublication", entityId: pub.id });
  return pub;
}

async function familyStudentIds(db: TenantDb, session: SessionData) {
  const rows = await db.student.findMany({ where: { deletedAt: null, OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** حالة الشهادة لولي الأمر: متاحة / لم يحن موعدها / محجوبة لوجود مستحقات */
async function familyVisibility(db: TenantDb, session: SessionData, termId: string, studentIds: string[]) {
  const pub = await db.resultPublication.findFirst({ where: { termId } });
  const out = new Map<string, "VISIBLE" | "NOT_YET" | "WITHHELD">();
  const debts = pub?.withholdOnDebt && assessmentSettings(session).withholdOnDebt ? await studentDebts(db, studentIds) : new Map<string, number>();
  for (const id of studentIds) out.set(id, !pub || pub.publishAt > new Date() ? "NOT_YET" : (debts.get(id) ?? 0) > 0 ? "WITHHELD" : "VISIBLE");
  return out;
}

/** نتائج الأبناء (ولي الأمر) أو نتيجتي (الطالب) بعد تاريخ النشر */
export async function familyResults(db: TenantDb, session: SessionData) {
  if (!resolveScope(session.access, "report_cards", "view")) throw forbidden();
  const ids = await familyStudentIds(db, session);
  if (!ids.length) return { students: [] };
  const [students, cards] = await Promise.all([
    db.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, grade: { select: { name: true } }, section: { select: { name: true } } } }),
    db.reportCard.findMany({ where: { studentId: { in: ids } }, orderBy: { issuedAt: "desc" } }),
  ]);
  const terms = await db.term.findMany({ where: { id: { in: [...new Set(cards.map((c) => c.termId))] } }, include: { academicYear: { select: { name: true } } } });
  const pubs = await db.resultPublication.findMany({ where: { termId: { in: terms.map((t) => t.id) } } });
  const out = [];
  for (const s of students) {
    const list = [];
    for (const c of cards.filter((x) => x.studentId === s.id)) {
      const vis = (await familyVisibility(db, session, c.termId, [s.id])).get(s.id)!;
      const term = terms.find((t) => t.id === c.termId);
      list.push({ id: c.id, termId: c.termId, term: term ? `${term.name} — ${term.academicYear.name}` : "", status: vis, publishAt: pubs.find((p) => p.termId === c.termId)?.publishAt ?? null, snapshot: vis === "VISIBLE" ? (c.snapshot as unknown as CardSnapshot) : null, verifyCode: vis === "VISIBLE" ? c.verifyCode : null });
    }
    out.push({ id: s.id, name: s.fullName, grade: s.grade.name, section: s.section?.name ?? "", cards: list });
  }
  return { students: out };
}

/**
 * التحقق العام من شهادة برمزها (دون تسجيل دخول). الاستعلام بالعميل الجذري استثناء مقصود:
 * الرمز عشوائي فريد عالمياً ويُعاد الحد الأدنى من البيانات فقط.
 */
export async function verifyReportCard(code: string) {
  if (!/^[A-Z0-9]{10}$/.test(code)) return null;
  const card = await rootDb.reportCard.findUnique({ where: { verifyCode: code } });
  if (!card) return null;
  const tenant = await rootDb.tenant.findUnique({ where: { id: card.tenantId }, select: { name: true, logoUrl: true, isDemo: true } });
  const snap = card.snapshot as unknown as CardSnapshot;
  return { school: tenant?.name ?? "", isDemo: tenant?.isDemo ?? false, student: snap.student.name, grade: `${snap.student.grade} / ${snap.student.section}`, term: `${snap.term.name} — ${snap.term.year}`, averageBp: snap.averageBp, result: snap.result, issuedAt: card.issuedAt, subjects: snap.subjects.length };
}

// ---------------------------------------------------------------------
// الإحصاءات
// ---------------------------------------------------------------------

function requireStats(session: SessionData) {
  const s = resolveScope(session.access, "academic_reports", "view");
  if (!s || (s.kind === "limited" && !s.branchIds.length && !s.stageIds.length)) throw forbidden("التقارير الإحصائية للإدارة الأكاديمية");
  return s;
}

const avg = (xs: number[]) => (xs.length ? divRound(xs.reduce((a, b) => a + b, 0), xs.length) : null);

export async function termStats(db: TenantDb, session: SessionData, input: { termId: string; gradeId?: string | null; branchId?: string | null }) {
  const scope = requireStats(session);
  const data = await computeTerm(db, session.tenant.id, input.termId, { approvedOnly: false });
  const settings = assessmentSettings(session);
  const allowed = (r: StudentRow) => (scope.kind === "all" || scope.branchIds.includes(r.student.branchId) || scope.stageIds.includes(r.student.stageId)) && (!input.gradeId || r.student.gradeId === input.gradeId) && (!input.branchId || r.student.branchId === input.branchId);
  const rows = data.allRows.filter(allowed);
  const scheme = data.schemes.values().next().value as LoadedScheme | undefined;
  const bands = scheme?.bands ?? [];
  const averages = rows.map((r) => r.term.averageBp).filter((b): b is number => b !== null);
  const sectionIds = [...new Set(rows.map((r) => r.student.sectionId))];
  const assignments = await db.teacherAssignment.findMany({ where: { sectionId: { in: sectionIds } }, select: { sectionId: true, subjectId: true, teacherId: true } });
  const teachers = await db.user.findMany({ where: { id: { in: [...new Set(assignments.map((a) => a.teacherId))] } }, select: { id: true, name: true } });
  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? "";
  const passBpOf = (r: StudentRow) => data.schemes.get(r.student.stageId)?.passBp ?? 5000;

  const bySubject = [...new Set(rows.flatMap((r) => Object.keys(r.subjects)))].map((sid) => {
    const vals = rows.map((r) => ({ r, bp: r.subjects[sid]?.bp ?? null })).filter((x): x is { r: StudentRow; bp: number } => x.bp !== null);
    return { id: sid, name: subjectName(sid), students: vals.length, averageBp: avg(vals.map((v) => v.bp)), passRateBp: pct(vals.filter((v) => v.bp >= passBpOf(v.r)).length, vals.length), fail: vals.filter((v) => v.bp < passBpOf(v.r)).length };
  });
  const bySection = sectionIds.map((sid) => {
    const rs = rows.filter((r) => r.student.sectionId === sid);
    const done = rs.filter((r) => r.term.result !== "INCOMPLETE");
    return { id: sid, name: `${rs[0]!.student.grade} / ${rs[0]!.student.section}`, students: rs.length, averageBp: avg(rs.map((r) => r.term.averageBp).filter((b): b is number => b !== null)), passRateBp: pct(done.filter((r) => r.term.result === "PASS").length, done.length) };
  });
  const teacherMap = new Map<string, number[]>();
  const teacherSheets = new Map<string, number>();
  for (const a of assignments) {
    const vals = rows.filter((r) => r.student.sectionId === a.sectionId).map((r) => r.subjects[a.subjectId]?.bp ?? null).filter((b): b is number => b !== null);
    if (!vals.length) continue;
    teacherMap.set(a.teacherId, [...(teacherMap.get(a.teacherId) ?? []), ...vals]);
    teacherSheets.set(a.teacherId, (teacherSheets.get(a.teacherId) ?? 0) + 1);
  }
  const byTeacher = [...teacherMap.entries()].map(([id, vals]) => ({ id, name: teachers.find((t) => t.id === id)?.name ?? "", sheets: teacherSheets.get(id) ?? 0, students: vals.length, averageBp: avg(vals), subjects: [...new Set(assignments.filter((a) => a.teacherId === id).map((a) => subjectName(a.subjectId)))] }));
  const atRisk = rows
    .filter((r) => r.term.averageBp !== null && (r.term.averageBp < settings.atRiskBp || r.term.failed > 0))
    .sort((a, b) => b.term.failed - a.term.failed || a.term.averageBp! - b.term.averageBp!)
    .slice(0, 60)
    .map((r) => ({ id: r.student.id, name: r.student.fullName, section: `${r.student.grade} / ${r.student.section}`, averageBp: r.term.averageBp, failed: Object.entries(r.subjects).filter(([, s]) => s.bp !== null && s.bp < passBpOf(r)).map(([sid]) => subjectName(sid)), result: r.term.result }));
  const top = rows
    .filter((r) => r.term.averageBp !== null && r.term.result !== "INCOMPLETE")
    .sort((a, b) => b.term.averageBp! - a.term.averageBp!)
    .slice(0, 10)
    .map((r) => ({ id: r.student.id, name: r.student.fullName, section: `${r.student.grade} / ${r.student.section}`, averageBp: r.term.averageBp, rank: r.rank.grade }));
  const histogram = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: averages.filter((b) => Math.min(9, Math.floor(b / 1000)) === i).length }));
  const pendingApproval = data.assessments.filter((a) => sectionIds.includes(a.sectionId) && a.status !== "APPROVED").length;
  const grades = await db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { order: true } } } });
  return {
    term: { id: data.term.id, name: data.term.name },
    filters: { grades: grades.sort((a, b) => a.stage.order - b.stage.order || a.order - b.order).map((g) => ({ id: g.id, name: g.name })), branches: await db.branch.findMany({ where: { deletedAt: null, ...(scope.kind === "all" ? {} : { id: { in: scope.branchIds } }) }, select: { id: true, name: true } }) },
    summary: { students: rows.length, averageBp: avg(averages), pass: rows.filter((r) => r.term.result === "PASS").length, secondRound: rows.filter((r) => r.term.result === "SECOND_ROUND").length, fail: rows.filter((r) => r.term.result === "FAIL").length, incomplete: rows.filter((r) => r.term.result === "INCOMPLETE").length, pendingApproval, atRiskBp: settings.atRiskBp },
    distribution: [...bands].sort((a, b) => b.minBp - a.minBp).map((b) => ({ label: b.label, letter: b.letter, count: averages.filter((v) => bandFor(v, bands)?.label === b.label).length })),
    histogram,
    bySubject: bySubject.sort((a, b) => (b.averageBp ?? 0) - (a.averageBp ?? 0)),
    bySection: bySection.sort((a, b) => (b.averageBp ?? 0) - (a.averageBp ?? 0)),
    byTeacher: byTeacher.sort((a, b) => (b.averageBp ?? 0) - (a.averageBp ?? 0)),
    atRisk,
    top,
  };
}

/**
 * تحليل بند تقييم: المتوسط والوسيط والانحراف المعياري، معامل السهولة (المتوسط ÷ العظمى)،
 * ومعامل التمييز (متوسط أعلى ٢٧٪ ناقص أدنى ٢٧٪ حسب درجة المادة، ÷ العظمى)، وتوزيع الدرجات.
 */
export async function itemAnalysis(db: TenantDb, session: SessionData, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId }, include: { marks: true } });
  if (!a) throw notFound("البند غير موجود");
  const { gradeBook } = await import("./grades.service");
  const book = await gradeBook(db, session, { sectionId: a.sectionId, subjectId: a.subjectId, termId: a.termId });
  const scores = a.marks.filter((m) => m.scoreTenths !== null && !m.excused).map((m) => ({ studentId: m.studentId, s: m.scoreTenths! }));
  const absents = a.marks.filter((m) => m.absent).length;
  if (!scores.length) return { assessment: { id: a.id, title: a.title, maxTenths: a.maxTenths, status: a.status }, n: 0, absents, stats: null, histogram: [], upper: null, lower: null };
  const vals = scores.map((x) => x.s).sort((x, y) => x - y);
  const n = vals.length;
  const mean = divRound(vals.reduce((p, c) => p + c, 0), n);
  const median = n % 2 ? vals[(n - 1) / 2]! : divRound(vals[n / 2 - 1]! + vals[n / 2]!, 2);
  const variance = vals.reduce((p, c) => p + (c - mean) ** 2, 0) / n;
  const sd = Math.round(Math.sqrt(variance));
  const ranked = scores.map((x) => ({ ...x, total: book.results[x.studentId]?.bp ?? 0 })).sort((p, q) => q.total - p.total);
  const k = Math.max(1, Math.round(n * 0.27));
  const upper = divRound(ranked.slice(0, k).reduce((p, c) => p + c.s, 0), k);
  const lower = divRound(ranked.slice(-k).reduce((p, c) => p + c.s, 0), k);
  const histogram = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: vals.filter((v) => Math.min(9, Math.floor((v * 10) / a.maxTenths)) === i).length }));
  const difficultyBp = divRound(mean * 10000, a.maxTenths);
  const discriminationBp = Math.round(((upper - lower) * 10000) / a.maxTenths);
  return {
    assessment: { id: a.id, title: a.title, maxTenths: a.maxTenths, status: a.status },
    n,
    absents,
    stats: { mean, median, sd, min: vals[0]!, max: vals[n - 1]!, difficultyBp, discriminationBp, passRateBp: pct(vals.filter((v) => v * 2 >= a.maxTenths).length, n) },
    histogram,
    upper,
    lower,
    interpretation: difficultyBp > 8500 ? "سهل جداً" : difficultyBp < 3500 ? "صعب جداً" : "مناسب",
    discrimination: discriminationBp >= 4000 ? "تمييز ممتاز" : discriminationBp >= 2000 ? "تمييز مقبول" : "تمييز ضعيف — راجع البند",
  };
}

/** اقتراح الإبقاء في الصف عند إغلاق العام: الراسبون في النتيجة التراكمية */
export async function retainSuggestions(db: TenantDb, session: SessionData) {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) return [];
  const y = await computeYear(db, session.tenant.id, year.id, { approvedOnly: true });
  return y.rows.filter((r) => r.term.result === "FAIL").map((r) => ({ id: r.student.id, name: r.student.fullName, section: `${r.student.grade} / ${r.student.section}`, averageBp: r.term.averageBp, failed: r.term.failed }));
}

// ---------------------------------------------------------------------
// أنظمة التقييم (الأوزان والتقديرات)
// ---------------------------------------------------------------------

export async function listSchemes(db: TenantDb, session: SessionData) {
  if (!resolveScope(session.access, "gpa", "view")) throw forbidden();
  await schemeFor(db, session.tenant.id, null);
  const [rows, stages] = await Promise.all([db.gradingScheme.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }), db.stage.findMany({ where: { deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, name: true } })]);
  return { schemes: rows.map((r) => ({ ...r, components: r.components as unknown as LoadedScheme["components"], bands: r.bands as unknown as LoadedScheme["bands"], stage: stages.find((s) => s.id === r.stageId)?.name ?? null })), stages, canEdit: resolveScope(session.access, "gpa", "update")?.kind === "all" };
}

export async function saveScheme(db: TenantDb, session: SessionData, input: { id?: string | null; stageId: string | null; name: string; components: LoadedScheme["components"]; bands: LoadedScheme["bands"]; passBp: number; maxSecondRoundSubjects: number; display: "PERCENT" | "LETTER" | "POINTS" }) {
  if (resolveScope(session.access, "gpa", "update")?.kind !== "all") throw forbidden("تعديل نظام التقييم لإدارة المدرسة");
  const { validateScheme } = await import("@/lib/assessment/calc");
  const err = validateScheme(input);
  if (err) throw badRequest(err);
  const current = input.id ? await db.gradingScheme.findFirst({ where: { id: input.id } }) : null;
  if (input.id && !current) throw notFound("نظام التقييم غير موجود");
  const keys = input.components.map((c) => c.key);
  const used = await db.assessment.findMany({ where: { componentKey: { notIn: keys } }, select: { componentKey: true }, distinct: ["componentKey"] });
  if (current && used.length) {
    const removed = (current.components as unknown as LoadedScheme["components"]).map((c) => c.key).filter((k) => !keys.includes(k));
    const inUse = used.map((u) => u.componentKey).filter((k) => removed.includes(k));
    if (inUse.length) throw badRequest(`لا يُحذف مكوّن عليه بنود مرصودة: ${inUse.join("، ")}`);
  }
  const other = await db.gradingScheme.findFirst({ where: { stageId: input.stageId, isActive: true, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (other) throw badRequest("يوجد نظام تقييم لهذه المرحلة؛ عدّله بدلاً من إنشاء آخر");
  const data = { stageId: input.stageId, name: input.name.trim(), components: input.components as unknown as Prisma.InputJsonValue, bands: [...input.bands].sort((a, b) => b.minBp - a.minBp) as unknown as Prisma.InputJsonValue, passBp: input.passBp, maxSecondRoundSubjects: input.maxSecondRoundSubjects, display: input.display, updatedById: session.user.id };
  return input.id ? db.gradingScheme.update({ where: { id: input.id }, data }) : db.gradingScheme.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
}
