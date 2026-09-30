/**
 * إدارة المشاريع: كل مشروع قاعدة بيانات مهام (صفحة بمفتاح نظامي "project") داخل مساحة فريق،
 * بعروض لوحة كانبان ومخطط جانت (خط زمني بالبداية والاستحقاق) وجدول وتقويم.
 * ---------------------------------------------------------------------
 * - الإنشاء من قالب يولّد المهام بمواعيد نسبية من تاريخ بداية المشروع ومراحلها.
 * - الرؤية تتبع صلاحية الصفحة/مساحة الفريق كأي صفحة في المنصة؛ والوحدة تفتح الواجهة فقط.
 * - ملخص المحفظة (التقدم، المتأخر، المدة) يُحسب من المهام نفسها فلا يتقادم.
 */
import { atLeast } from "@/lib/access-levels";
import { defaultStatusConfig, type DatabaseTemplateSeed } from "@/lib/database/defaults";
import type { DateValue, StatusGroup } from "@/lib/database/types";
import { toISODate } from "@/lib/dates";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden } from "@/server/errors";
import { resolvePageAccess, teamspaceLevel, visibleTeamspaces } from "./access.service";
import { createDatabaseRecords } from "./database.service";

export const PROJECT_KEY = "project";

interface TemplateTask {
  title: string;
  phase: string;
  /** يوم البداية بعد بداية المشروع */
  at: number;
  days: number;
  priority?: "HIGH" | "MEDIUM" | "LOW";
}

export interface ProjectTemplate {
  key: string;
  name: string;
  icon: string;
  description: string;
  phases: string[];
  tasks: TemplateTask[];
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    key: "event",
    name: "تنظيم فعالية مدرسية",
    icon: "lucide:calendar-heart",
    description: "حفل أو يوم مفتوح أو معرض: التخطيط والدعوات والتجهيز والتنفيذ والتقييم.",
    phases: ["التخطيط", "التجهيز", "التنفيذ", "الختام"],
    tasks: [
      { title: "تحديد أهداف الفعالية والجمهور المستهدف", phase: "التخطيط", at: 0, days: 3, priority: "HIGH" },
      { title: "إعداد الميزانية التقديرية ورفعها للاعتماد", phase: "التخطيط", at: 2, days: 4, priority: "HIGH" },
      { title: "تشكيل لجان التنظيم وتوزيع المهام", phase: "التخطيط", at: 3, days: 2 },
      { title: "حجز المسرح/القاعة والتجهيزات الصوتية", phase: "التجهيز", at: 6, days: 3 },
      { title: "تصميم الدعوات وإرسالها لأولياء الأمور", phase: "التجهيز", at: 7, days: 5 },
      { title: "بروفات فقرات الطلاب", phase: "التجهيز", at: 9, days: 8 },
      { title: "تنسيق الضيافة والتصوير", phase: "التجهيز", at: 12, days: 4 },
      { title: "يوم الفعالية: الاستقبال والتنظيم", phase: "التنفيذ", at: 18, days: 1, priority: "HIGH" },
      { title: "استبانة رضا الحضور", phase: "الختام", at: 19, days: 5 },
      { title: "التقرير الختامي والدروس المستفادة", phase: "الختام", at: 20, days: 5 },
    ],
  },
  {
    key: "accreditation",
    name: "التقويم الذاتي والاعتماد المدرسي",
    icon: "lucide:badge-check",
    description: "جمع الشواهد لكل معيار، ومراجعتها داخلياً، وخطة التحسين، واستقبال فريق الزيارة.",
    phases: ["الإعداد", "جمع الشواهد", "المراجعة", "الزيارة"],
    tasks: [
      { title: "تشكيل فريق التميز وتوزيع المعايير", phase: "الإعداد", at: 0, days: 5, priority: "HIGH" },
      { title: "ورشة تعريفية بأدلة التقويم الذاتي", phase: "الإعداد", at: 4, days: 2 },
      { title: "شواهد معيار القيادة والإدارة المدرسية", phase: "جمع الشواهد", at: 7, days: 21 },
      { title: "شواهد معيار التعليم والتعلم", phase: "جمع الشواهد", at: 7, days: 28 },
      { title: "شواهد معيار نواتج التعلم (تحليل النتائج)", phase: "جمع الشواهد", at: 14, days: 21 },
      { title: "شواهد معيار البيئة المدرسية والسلامة", phase: "جمع الشواهد", at: 14, days: 14 },
      { title: "المراجعة الداخلية للشواهد وسد الفجوات", phase: "المراجعة", at: 36, days: 10, priority: "HIGH" },
      { title: "إعداد خطة التحسين المدرسية", phase: "المراجعة", at: 42, days: 10 },
      { title: "رفع ملف التقويم الذاتي", phase: "الزيارة", at: 53, days: 2, priority: "HIGH" },
      { title: "استقبال فريق الزيارة وجدول المقابلات", phase: "الزيارة", at: 60, days: 3 },
    ],
  },
  {
    key: "curriculum",
    name: "تطوير مقرر أو برنامج تعليمي",
    icon: "lucide:book-open",
    description: "تحليل الاحتياج، وتصميم الوحدات، وإعداد المواد والتقويم، والتجريب والتحسين.",
    phases: ["التحليل", "التصميم", "الإعداد", "التجريب"],
    tasks: [
      { title: "تحليل نتائج الطلاب ونواتج التعلم الحالية", phase: "التحليل", at: 0, days: 7 },
      { title: "استطلاع آراء المعلمين والطلاب", phase: "التحليل", at: 3, days: 7 },
      { title: "صياغة نواتج التعلم ومصفوفة المدى والتتابع", phase: "التصميم", at: 10, days: 7, priority: "HIGH" },
      { title: "تصميم الوحدات وتوزيعها على الأسابيع", phase: "التصميم", at: 15, days: 7 },
      { title: "إعداد أوراق العمل والمواد الرقمية", phase: "الإعداد", at: 22, days: 14 },
      { title: "بناء أدوات التقويم ومعايير التصحيح", phase: "الإعداد", at: 26, days: 10 },
      { title: "تجريب وحدة على فصلين", phase: "التجريب", at: 37, days: 14 },
      { title: "تحليل نتائج التجريب والتحسين", phase: "التجريب", at: 51, days: 5 },
    ],
  },
  {
    key: "facility",
    name: "تجهيز أو صيانة مرفق",
    icon: "lucide:construction",
    description: "معمل أو مكتبة أو ملعب: المواصفات، وعروض الأسعار، والتنفيذ، والاستلام.",
    phases: ["المواصفات", "الشراء", "التنفيذ", "الاستلام"],
    tasks: [
      { title: "حصر الاحتياج وإعداد المواصفات الفنية", phase: "المواصفات", at: 0, days: 5, priority: "HIGH" },
      { title: "طلب ثلاثة عروض أسعار ومقارنتها", phase: "الشراء", at: 5, days: 7 },
      { title: "اعتماد طلب الشراء وأمر الشراء", phase: "الشراء", at: 12, days: 3, priority: "HIGH" },
      { title: "تنفيذ الأعمال ومتابعة المقاول", phase: "التنفيذ", at: 16, days: 21 },
      { title: "فحص السلامة ومطابقة المواصفات", phase: "الاستلام", at: 37, days: 2 },
      { title: "الاستلام وتسجيل الأصول في السجل", phase: "الاستلام", at: 39, days: 2 },
    ],
  },
  { key: "blank", name: "مشروع فارغ", icon: "lucide:kanban", description: "لوحة مهام ومخطط جانت دون مهام مسبقة.", phases: ["التخطيط", "التنفيذ", "الإغلاق"], tasks: [] },
];

const PRIORITY_OPTIONS = [
  { id: "HIGH", name: "عالية", color: "red" as const },
  { id: "MEDIUM", name: "متوسطة", color: "orange" as const },
  { id: "LOW", name: "منخفضة", color: "gray" as const },
];
const PHASE_COLORS = ["navy", "teal", "purple", "orange", "green", "brown"] as const;

function projectSeed(phases: string[]): DatabaseTemplateSeed {
  return {
    properties: [
      { key: "status", name: "الحالة", type: "STATUS", config: defaultStatusConfig() },
      { key: "assignee", name: "المسؤول", type: "PERSON" },
      { key: "start", name: "البداية", type: "DATE" },
      { key: "due", name: "الاستحقاق", type: "DATE" },
      { key: "phase", name: "المرحلة", type: "SELECT", config: { options: phases.map((p, i) => ({ id: `ph${i + 1}`, name: p, color: PHASE_COLORS[i % PHASE_COLORS.length]! })) } },
      { key: "priority", name: "الأولوية", type: "SELECT", config: { options: PRIORITY_OPTIONS } },
    ],
    views: [
      { name: "لوحة المهام", type: "BOARD", config: { groupBy: "status", cardSize: "medium" } },
      { name: "مخطط جانت", type: "TIMELINE", config: { dateProperty: "start", endDateProperty: "due", timelineScale: "week", sorts: [{ propertyId: "start", direction: "asc" }] } },
      { name: "كل المهام", type: "TABLE", config: { sorts: [{ propertyId: "start", direction: "asc" }] } },
      { name: "حسب المرحلة", type: "BOARD", config: { groupBy: "phase", cardSize: "small" } },
      { name: "التقويم", type: "CALENDAR", config: { dateProperty: "due" } },
    ],
  };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function requireModule(session: SessionData, action: "view" | "create") {
  if (!resolveScope(session.access, "projects", action)) throw forbidden(action === "create" ? "إنشاء المشاريع غير متاح لدورك" : "ليست لديك صلاحية المشاريع");
}

/** الخيارات المتاحة للإنشاء: القوالب ومساحات الفرق التي يملك فيها المستخدم التحرير */
export async function projectOptions(db: TenantDb, session: SessionData) {
  requireModule(session, "view");
  const spaces = (await visibleTeamspaces(db, session)).filter((t) => atLeast(t.level, "EDIT"));
  return {
    canCreate: Boolean(resolveScope(session.access, "projects", "create")) && spaces.length > 0,
    templates: PROJECT_TEMPLATES.map((t) => ({ key: t.key, name: t.name, icon: t.icon, description: t.description, tasks: t.tasks.length, phases: t.phases, days: t.tasks.reduce((m, x) => Math.max(m, x.at + x.days), 0) })),
    teamspaces: spaces.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
  };
}

export async function createProject(db: TenantDb, session: SessionData, input: { title: string; description?: string | null; icon?: string | null; teamspaceId: string; templateKey: string; startDate: string; assigneeIds?: string[] }) {
  requireModule(session, "create");
  const title = input.title.trim();
  if (title.length < 3) throw badRequest("اسم المشروع مطلوب");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw badRequest("تاريخ البداية غير صالح");
  if (!atLeast(await teamspaceLevel(db, session, input.teamspaceId), "EDIT")) throw forbidden("لا تملك التحرير في مساحة الفريق هذه");
  const tpl = PROJECT_TEMPLATES.find((t) => t.key === input.templateKey);
  if (!tpl) throw badRequest("القالب غير موجود");
  const assignees = input.assigneeIds?.length ? (await db.user.findMany({ where: { id: { in: input.assigneeIds }, deletedAt: null, status: "ACTIVE" }, select: { id: true } })).map((u) => u.id) : [];
  const last = await db.page.findFirst({ where: { teamspaceId: input.teamspaceId, parentId: null, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  const { page, database, keyToId } = await createDatabaseRecords(db, {
    tenantId: session.tenant.id,
    userId: session.user.id,
    ownerId: null,
    teamspaceId: input.teamspaceId,
    title,
    icon: input.icon || tpl.icon,
    description: input.description?.trim() || tpl.description,
    position: (last?.position ?? 0) + 1024,
    template: projectSeed(tpl.phases),
    systemKey: PROJECT_KEY,
  });
  let n = 0;
  for (const task of tpl.tasks) {
    n += 1;
    const phaseIdx = tpl.phases.indexOf(task.phase);
    const start = addDays(input.startDate, task.at);
    await db.databaseRow.create({
      data: {
        tenantId: session.tenant.id,
        databaseId: database.id,
        number: n,
        title: task.title,
        position: n * 1024,
        createdById: session.user.id,
        updatedById: session.user.id,
        values: {
          [keyToId.status!]: "not_started",
          [keyToId.start!]: { start },
          [keyToId.due!]: { start: addDays(start, Math.max(0, task.days - 1)) },
          [keyToId.phase!]: phaseIdx >= 0 ? `ph${phaseIdx + 1}` : "ph1",
          [keyToId.priority!]: task.priority ?? "MEDIUM",
          ...(assignees.length ? { [keyToId.assignee!]: [assignees[(n - 1) % assignees.length]!] } : {}),
        },
      },
    });
  }
  if (n) await db.database.update({ where: { id: database.id }, data: { rowCounter: n } });
  return { pageId: page.id };
}

interface PropLite {
  id: string;
  name: string;
  type: string;
  config: unknown;
}

/** محفظة المشاريع: ما يحق للمستخدم رؤيته مع التقدم والمتأخر والمدة */
export async function listProjects(db: TenantDb, session: SessionData) {
  requireModule(session, "view");
  const pages = await db.page.findMany({
    where: { systemKey: PROJECT_KEY, kind: "DATABASE", deletedAt: null },
    select: { id: true, title: true, icon: true, description: true, teamspaceId: true, createdById: true, createdAt: true, database: { select: { id: true, properties: { select: { id: true, name: true, type: true, config: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const visible: typeof pages = [];
  for (const p of pages) {
    const access = await resolvePageAccess(db, session, p.id).catch(() => null);
    if (access && access.level !== "NONE") visible.push(p);
  }
  const today = toISODate(new Date(), session.tenant.timezone);
  const teamspaces = await db.teamspace.findMany({ where: { id: { in: visible.map((p) => p.teamspaceId ?? "") } }, select: { id: true, name: true } });
  const rows = await db.databaseRow.findMany({ where: { databaseId: { in: visible.map((p) => p.database!.id) }, deletedAt: null }, select: { databaseId: true, title: true, values: true } });
  const userIds = new Set<string>(visible.map((p) => p.createdById ?? ""));
  const projects = visible.map((p) => {
    const props = (p.database?.properties ?? []) as PropLite[];
    const status = props.find((x) => x.type === "STATUS");
    const dates = props.filter((x) => x.type === "DATE");
    const startProp = dates.find((x) => x.name === "البداية") ?? dates[0];
    const dueProp = dates.find((x) => x.name === "الاستحقاق") ?? dates[1] ?? dates[0];
    const person = props.find((x) => x.type === "PERSON");
    const groups = ((status?.config as { groups?: StatusGroup[] } | undefined)?.groups ?? []) as StatusGroup[];
    const doneIds = new Set(groups.find((g) => g.key === "complete")?.optionIds ?? ["done"]);
    const startedIds = new Set(groups.find((g) => g.key === "in_progress")?.optionIds ?? []);
    const tasks = rows.filter((r) => r.databaseId === p.database!.id);
    let done = 0;
    let active = 0;
    let overdue = 0;
    let from: string | null = null;
    let to: string | null = null;
    const members = new Set<string>();
    let next: { title: string; due: string } | null = null;
    for (const t of tasks) {
      const v = (t.values ?? {}) as Record<string, unknown>;
      const st = status ? (v[status.id] as string | undefined) : undefined;
      const isDone = Boolean(st && doneIds.has(st));
      if (isDone) done += 1;
      else if (st && startedIds.has(st)) active += 1;
      const s = startProp ? ((v[startProp.id] as DateValue | undefined)?.start?.slice(0, 10) ?? null) : null;
      const dv = dueProp ? (v[dueProp.id] as DateValue | undefined) : undefined;
      const due = dv ? (dv.end ?? dv.start).slice(0, 10) : null;
      if (s && (!from || s < from)) from = s;
      if (due && (!to || due > to)) to = due;
      if (!isDone && due && due < today) overdue += 1;
      if (!isDone && due && due >= today && (!next || due < next.due)) next = { title: t.title, due };
      if (person) for (const id of (v[person.id] as string[] | undefined) ?? []) members.add(id);
    }
    for (const m of members) userIds.add(m);
    const total = tasks.length;
    const health: "DONE" | "LATE" | "AT_RISK" | "ON_TRACK" | "EMPTY" = !total ? "EMPTY" : done === total ? "DONE" : overdue ? (overdue / total > 0.15 ? "LATE" : "AT_RISK") : "ON_TRACK";
    return { id: p.id, title: p.title, icon: p.icon, description: p.description, teamspace: teamspaces.find((t) => t.id === p.teamspaceId)?.name ?? "خاص", createdById: p.createdById, createdAt: p.createdAt, total, done, active, overdue, from, to, next, members: [...members], health, progressBp: total ? Math.round((done / total) * 10_000) : 0 };
  });
  const users = await db.user.findMany({ where: { id: { in: [...userIds].filter(Boolean) } }, select: { id: true, name: true, avatarColor: true, avatarUrl: true } });
  return { today, projects, users };
}
