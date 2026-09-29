/**
 * الشؤون الأكاديمية — الفصول والطاقة الاستيعابية، القاعات، التوزيع التلقائي، وإنهاء العام الدراسي (الترفيع وفتح عام جديد).
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Action } from "@/lib/rbac/catalog";
import { can, resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { currentYear } from "@/server/collections/options";
import { teacherSectionIds } from "./student-scope";
import { readModuleSettings } from "./module-settings.service";

// ---------------------------------------------------------------------
// النطاق
// ---------------------------------------------------------------------

/** شرط الفصول حسب الصلاحية: كل المدرسة / فرع / مرحلة / فصول المعلم / فصول الأبناء */
export async function sectionWhere(db: TenantDb, session: SessionData, module: string, action: Action): Promise<Prisma.SectionWhereInput | null> {
  const scope = resolveScope(session.access, module, action);
  if (!scope) return null;
  if (scope.kind === "all") return {};
  const or: Prisma.SectionWhereInput[] = [];
  if (scope.branchIds.length) or.push({ branchId: { in: scope.branchIds } });
  if (scope.stageIds.length) or.push({ grade: { stageId: { in: scope.stageIds } } });
  if (scope.assigned) {
    const ids = await teacherSectionIds(db, session.user.id);
    if (ids.length) or.push({ id: { in: ids } });
  }
  if (scope.assigned || scope.own) {
    or.push({ students: { some: { OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] } } });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}

export async function requireSectionWhere(db: TenantDb, session: SessionData, module: string, action: Action, message?: string) {
  const where = await sectionWhere(db, session, module, action);
  if (!where) throw forbidden(message);
  return where;
}

/** هل يملك المستخدم الإجراء على فرع بعينه (نطاق كل المدرسة أو الفرع) */
export function canOnBranch(session: SessionData, module: string, action: Action, branchId: string) {
  const scope = resolveScope(session.access, module, action);
  if (!scope) return false;
  return scope.kind === "all" || scope.branchIds.includes(branchId);
}

export function requireBranch(session: SessionData, module: string, action: Action, branchId: string) {
  if (!canOnBranch(session, module, action, branchId)) throw forbidden("الفرع خارج نطاق صلاحيتك");
}

/** الفروع التي يملك فيها المستخدم الإجراء */
export async function branchesFor(db: TenantDb, session: SessionData, module: string, action: Action) {
  const scope = resolveScope(session.access, module, action);
  if (!scope) return [];
  const branches = await db.branch.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, select: { id: true, name: true, gender: true } });
  if (scope.kind === "all") return branches;
  if (scope.branchIds.length) return branches.filter((b) => scope.branchIds.includes(b.id));
  // نطاق المسند/الخاص: فروع فصوله
  const where = await sectionWhere(db, session, module, action);
  const sections = await db.section.findMany({ where: { ...where, deletedAt: null }, select: { branchId: true }, distinct: ["branchId"] });
  return branches.filter((b) => sections.some((s) => s.branchId === b.id));
}

export async function requireYear(db: TenantDb) {
  const year = await currentYear(db);
  if (!year) throw badRequest("لا يوجد عام دراسي حالي؛ أضفه من «الإعدادات ← الهيكل»");
  return year;
}

/** معلمو الفرع (أصحاب دور المعلم) */
export async function branchTeachers(db: TenantDb, branchId?: string) {
  const roles = await db.userRole.findMany({
    where: { role: { key: "TEACHER" }, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}), user: { status: "ACTIVE", deletedAt: null } },
    select: { branchId: true, user: { select: { id: true, name: true, jobTitle: true, avatarColor: true, avatarUrl: true } } },
  });
  const map = new Map<string, { id: string; name: string; jobTitle: string | null; avatarColor: string | null; avatarUrl: string | null; branchId: string | null }>();
  for (const r of roles) if (!map.has(r.user.id)) map.set(r.user.id, { ...r.user, branchId: r.branchId });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ---------------------------------------------------------------------
// الفصول
// ---------------------------------------------------------------------

/** فصول العام الحالي مع الإشغال (لمنتقيات التسكين) */
export async function sectionOptions(db: TenantDb, session: SessionData) {
  void session;
  const year = await currentYear(db);
  if (!year) return [];
  const [sections, counts] = await Promise.all([
    db.section.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      include: { grade: { select: { id: true, name: true, order: true, stage: { select: { order: true } } } }, branch: { select: { id: true, name: true } } },
    }),
    db.student.groupBy({ by: ["sectionId"], where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null, sectionId: { not: null } }, _count: { _all: true } }),
  ]);
  const occupied = new Map(counts.map((c) => [c.sectionId!, c._count._all]));
  return sections
    .sort((a, b) => a.grade.stage.order - b.grade.stage.order || a.grade.order - b.grade.order || a.name.localeCompare(b.name, "ar"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      label: `${s.grade.name} / ${s.name}`,
      gradeId: s.gradeId,
      gradeName: s.grade.name,
      branchId: s.branchId,
      branchName: s.branch.name,
      capacity: s.capacity,
      occupied: occupied.get(s.id) ?? 0,
      homeroomUserId: s.homeroomUserId,
      room: s.room,
    }));
}

export function canManageClasses(session: SessionData) {
  return can(session.access, "classes", "update");
}

/** نظرة الفصول: حسب الفرع والمرحلة والصف، مع الإشغال والرائد والقاعة والطلاب غير المسكّنين */
export async function classesOverview(db: TenantDb, session: SessionData) {
  const where = await requireSectionWhere(db, session, "classes", "view", "لا تملك صلاحية عرض الفصول");
  const year = await currentYear(db);
  if (!year) return { year: null, branches: [], canManage: false, canYearEnd: false, totals: { sections: 0, students: 0, capacity: 0, unassigned: 0 } };
  const [sections, counts, unassigned, assignmentCounts] = await Promise.all([
    db.section.findMany({
      where: { ...where, academicYearId: year.id, deletedAt: null },
      include: { grade: { select: { id: true, name: true, order: true, stage: { select: { id: true, name: true, order: true } } } }, branch: { select: { id: true, name: true, gender: true } } },
    }),
    db.student.groupBy({ by: ["sectionId", "gender"], where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null, sectionId: { not: null } }, _count: { _all: true } }),
    db.student.groupBy({ by: ["branchId", "gradeId"], where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null, sectionId: null }, _count: { _all: true } }),
    db.teacherAssignment.groupBy({ by: ["sectionId"], where: { academicYearId: year.id }, _count: { _all: true } }),
  ]);
  const occupied = new Map<string, number>();
  for (const c of counts) occupied.set(c.sectionId!, (occupied.get(c.sectionId!) ?? 0) + c._count._all);
  const assignedSubjects = new Map(assignmentCounts.map((a) => [a.sectionId, a._count._all]));
  const planCounts = await db.gradeSubject.groupBy({ by: ["gradeId"], _count: { _all: true } });
  const planByGrade = new Map(planCounts.map((p) => [p.gradeId, p._count._all]));
  const homeroomIds = [...new Set(sections.map((s) => s.homeroomUserId).filter((x): x is string => Boolean(x)))];
  const homerooms = homeroomIds.length ? await db.user.findMany({ where: { id: { in: homeroomIds } }, select: { id: true, name: true } }) : [];
  const hr = new Map(homerooms.map((u) => [u.id, u.name]));
  const unassignedMap = new Map(unassigned.map((u) => [`${u.branchId}|${u.gradeId}`, u._count._all]));

  type SectionCard = {
    id: string;
    name: string;
    capacity: number;
    occupied: number;
    room: string | null;
    homeroomUserId: string | null;
    homeroomName: string | null;
    subjectsAssigned: number;
    subjectsRequired: number;
  };
  type GradeGroup = { id: string; name: string; stageName: string; order: number; stageOrder: number; unassigned: number; sections: SectionCard[] };
  const branches = new Map<string, { id: string; name: string; gender: string; grades: Map<string, GradeGroup> }>();
  for (const s of sections) {
    const b = branches.get(s.branchId) ?? { id: s.branch.id, name: s.branch.name, gender: s.branch.gender, grades: new Map<string, GradeGroup>() };
    branches.set(s.branchId, b);
    const g = b.grades.get(s.gradeId) ?? { id: s.grade.id, name: s.grade.name, stageName: s.grade.stage.name, order: s.grade.order, stageOrder: s.grade.stage.order, unassigned: unassignedMap.get(`${s.branchId}|${s.gradeId}`) ?? 0, sections: [] };
    b.grades.set(s.gradeId, g);
    g.sections.push({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      occupied: occupied.get(s.id) ?? 0,
      room: s.room,
      homeroomUserId: s.homeroomUserId,
      homeroomName: s.homeroomUserId ? (hr.get(s.homeroomUserId) ?? null) : null,
      subjectsAssigned: assignedSubjects.get(s.id) ?? 0,
      subjectsRequired: planByGrade.get(s.gradeId) ?? 0,
    });
  }
  const out = [...branches.values()].map((b) => ({
    id: b.id,
    name: b.name,
    gender: b.gender,
    grades: [...b.grades.values()]
      .sort((x, y) => x.stageOrder - y.stageOrder || x.order - y.order)
      .map((g) => ({ ...g, sections: g.sections.sort((x, y) => x.name.localeCompare(y.name, "ar")) })),
  }));
  const totals = { sections: sections.length, students: [...occupied.values()].reduce((a, b) => a + b, 0), capacity: sections.reduce((a, s) => a + s.capacity, 0), unassigned: out.reduce((a, b) => a + b.grades.reduce((x, g) => x + g.unassigned, 0), 0) };
  const approve = resolveScope(session.access, "classes", "approve");
  return { year: { id: year.id, name: year.name }, branches: out, canManage: canManageClasses(session), canYearEnd: approve?.kind === "all", totals };
}

export interface SectionInput {
  branchId: string;
  gradeId: string;
  name: string;
  capacity: number;
  room?: string | null;
  homeroomUserId?: string | null;
}

async function assertHomeroom(db: TenantDb, userId: string | null | undefined, branchId: string) {
  if (!userId) return;
  const teachers = await branchTeachers(db, branchId);
  if (!teachers.some((t) => t.id === userId)) throw badRequest("رائد الفصل يجب أن يكون معلماً في الفرع نفسه");
}

export async function createSection(db: TenantDb, session: SessionData, input: SectionInput) {
  requireBranch(session, "classes", "create", input.branchId);
  const year = await requireYear(db);
  const name = input.name.trim();
  if (!name) throw badRequest("اسم الفصل مطلوب");
  const dup = await db.section.findFirst({ where: { branchId: input.branchId, gradeId: input.gradeId, academicYearId: year.id, name, deletedAt: null } });
  if (dup) throw badRequest("يوجد فصل بالاسم نفسه في هذا الصف");
  await assertHomeroom(db, input.homeroomUserId, input.branchId);
  // فصل محذوف سابقاً بالاسم نفسه: يُستعاد بدل إنشاء مكرر (القيد الفريد)
  const trashed = await db.section.findFirst({ where: { branchId: input.branchId, gradeId: input.gradeId, academicYearId: year.id, name, deletedAt: { not: null } } });
  const data = { capacity: input.capacity, room: input.room?.trim() || null, homeroomUserId: input.homeroomUserId ?? null, updatedById: session.user.id };
  if (trashed) return db.section.update({ where: { id: trashed.id }, data: { ...data, deletedAt: null } });
  return db.section.create({ data: { tenantId: session.tenant.id, branchId: input.branchId, gradeId: input.gradeId, academicYearId: year.id, name, ...data, createdById: session.user.id } });
}

export async function updateSection(db: TenantDb, session: SessionData, id: string, patch: Partial<Pick<SectionInput, "name" | "capacity" | "room" | "homeroomUserId">>) {
  const section = await db.section.findFirst({ where: { id, deletedAt: null } });
  if (!section) throw notFound("الفصل غير موجود");
  requireBranch(session, "classes", "update", section.branchId);
  const data: Prisma.SectionUncheckedUpdateInput = { updatedById: session.user.id };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw badRequest("اسم الفصل مطلوب");
    const dup = await db.section.findFirst({ where: { id: { not: id }, branchId: section.branchId, gradeId: section.gradeId, academicYearId: section.academicYearId, name } });
    if (dup) throw badRequest("يوجد فصل بالاسم نفسه في هذا الصف");
    data.name = name;
  }
  if (patch.capacity !== undefined) {
    const occupied = await db.student.count({ where: { sectionId: id, status: "ACTIVE", deletedAt: null } });
    if (patch.capacity < occupied) throw badRequest(`لا يمكن خفض الطاقة إلى أقل من عدد الطلاب الحاليين (${occupied})`);
    data.capacity = patch.capacity;
  }
  if (patch.room !== undefined) data.room = patch.room?.trim() || null;
  if (patch.homeroomUserId !== undefined) {
    await assertHomeroom(db, patch.homeroomUserId, section.branchId);
    data.homeroomUserId = patch.homeroomUserId;
  }
  return db.section.update({ where: { id }, data });
}

export async function deleteSection(db: TenantDb, session: SessionData, id: string) {
  const section = await db.section.findFirst({ where: { id, deletedAt: null } });
  if (!section) throw notFound("الفصل غير موجود");
  requireBranch(session, "classes", "delete", section.branchId);
  const students = await db.student.count({ where: { sectionId: id, deletedAt: null, status: "ACTIVE" } });
  if (students) throw badRequest(`الفصل يضم ${students} طالباً؛ انقلهم أولاً`);
  const slots = await db.timetableSlot.count({ where: { sectionId: id } });
  if (slots) throw badRequest("للفصل حصص في الجدول؛ احذفها من «الجداول» أولاً");
  await db.teacherAssignment.deleteMany({ where: { sectionId: id } });
  await db.section.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  return { ok: true };
}

/** طلاب الفصل (لعرض القائمة ونقل طالب بين فصول الصف) */
export async function sectionRoster(db: TenantDb, session: SessionData, id: string) {
  const where = await requireSectionWhere(db, session, "classes", "view");
  const section = await db.section.findFirst({ where: { ...where, id, deletedAt: null }, include: { grade: { select: { name: true } }, branch: { select: { name: true } } } });
  if (!section) throw notFound("الفصل غير موجود أو خارج نطاق صلاحيتك");
  const students = await db.student.findMany({
    where: { sectionId: id, status: "ACTIVE", deletedAt: null },
    select: { id: true, fullName: true, academicNumber: true, photoUrl: true, birthDate: true, gender: true },
    orderBy: { fullName: "asc" },
  });
  return { section: { id: section.id, label: `${section.grade.name} / ${section.name}`, branchName: section.branch.name, capacity: section.capacity }, students };
}

// ---------------------------------------------------------------------
// التوزيع التلقائي
// ---------------------------------------------------------------------

/**
 * يوزّع طلاب صف على فصوله:
 * - «unassigned»: يسكّن غير المسكّنين في الفصل الأقل امتلاءً نسبةً لطاقته.
 * - «rebalance»: يعيد توزيع كل طلاب الصف بالتناوب الثعباني حسب العمر، فتتقارب الأعداد والأعمار.
 * التوازن حسب المستوى الدراسي يحتاج الدرجات (المرحلة ٤).
 */
export async function autoDistribute(db: TenantDb, session: SessionData, input: { branchId: string; gradeId: string; mode: "unassigned" | "rebalance"; dryRun?: boolean }) {
  requireBranch(session, "classes", "update", input.branchId);
  const year = await requireYear(db);
  const sections = await db.section.findMany({ where: { branchId: input.branchId, gradeId: input.gradeId, academicYearId: year.id, deletedAt: null }, orderBy: { name: "asc" } });
  if (!sections.length) throw badRequest("لا توجد فصول لهذا الصف في الفرع");
  const students = await db.student.findMany({
    where: { branchId: input.branchId, gradeId: input.gradeId, academicYearId: year.id, status: "ACTIVE", deletedAt: null, ...(input.mode === "unassigned" ? { sectionId: null } : {}) },
    select: { id: true, fullName: true, sectionId: true, birthDate: true },
    orderBy: [{ birthDate: "asc" }, { fullName: "asc" }],
  });
  const occupancy = new Map(sections.map((s) => [s.id, 0]));
  if (input.mode === "unassigned") {
    const counts = await db.student.groupBy({ by: ["sectionId"], where: { sectionId: { in: sections.map((s) => s.id) }, status: "ACTIVE", deletedAt: null }, _count: { _all: true } });
    for (const c of counts) occupancy.set(c.sectionId!, c._count._all);
  }
  const plan: Array<{ studentId: string; name: string; from: string | null; to: string }> = [];
  const unplaced: string[] = [];
  const pick = (order: typeof sections) => order.find((s) => (occupancy.get(s.id) ?? 0) < s.capacity);
  if (input.mode === "unassigned") {
    for (const st of students) {
      const target = [...sections].sort((a, b) => (occupancy.get(a.id)! + 1) / a.capacity - (occupancy.get(b.id)! + 1) / b.capacity || a.name.localeCompare(b.name, "ar"));
      const s = pick(target);
      if (!s) {
        unplaced.push(st.fullName);
        continue;
      }
      occupancy.set(s.id, occupancy.get(s.id)! + 1);
      plan.push({ studentId: st.id, name: st.fullName, from: st.sectionId, to: s.id });
    }
  } else {
    // ثعباني: أ ب ج ج ب أ … مع تخطي الفصل الممتلئ
    let forward = true;
    let i = 0;
    while (i < students.length) {
      const order = forward ? sections : [...sections].reverse();
      let placedAny = false;
      for (const s of order) {
        if (i >= students.length) break;
        if ((occupancy.get(s.id) ?? 0) >= s.capacity) continue;
        const st = students[i++]!;
        occupancy.set(s.id, occupancy.get(s.id)! + 1);
        plan.push({ studentId: st.id, name: st.fullName, from: st.sectionId, to: s.id });
        placedAny = true;
      }
      if (!placedAny) {
        unplaced.push(...students.slice(i).map((s) => s.fullName));
        break;
      }
      forward = !forward;
    }
  }
  const moves = plan.filter((p) => p.from !== p.to);
  if (!input.dryRun) {
    for (const m of moves) await db.student.update({ where: { id: m.studentId }, data: { sectionId: m.to, updatedById: session.user.id } });
  }
  const name = new Map(sections.map((s) => [s.id, s.name]));
  return {
    moved: moves.length,
    unplaced,
    result: sections.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, count: occupancy.get(s.id) ?? 0 })),
    moves: moves.slice(0, 200).map((m) => ({ name: m.name, from: m.from ? (name.get(m.from) ?? null) : null, to: name.get(m.to)! })),
  };
}

// ---------------------------------------------------------------------
// القاعات
// ---------------------------------------------------------------------

export async function listRooms(db: TenantDb, session: SessionData) {
  const branches = await branchesFor(db, session, "classes", "view");
  const ids = branches.map((b) => b.id);
  const year = await currentYear(db);
  const [rooms, usage] = await Promise.all([
    db.room.findMany({ where: { branchId: { in: ids }, deletedAt: null }, orderBy: [{ branchId: "asc" }, { code: "asc" }] }),
    year ? db.timetableSlot.groupBy({ by: ["roomId"], where: { academicYearId: year.id, roomId: { not: null } }, _count: { _all: true } }) : [],
  ]);
  const used = new Map(usage.map((u) => [u.roomId!, u._count._all]));
  const sectionsByRoom = year ? await db.section.findMany({ where: { academicYearId: year.id, deletedAt: null, room: { not: null }, branchId: { in: ids } }, select: { room: true, branchId: true, name: true, grade: { select: { name: true } } } }) : [];
  return {
    branches,
    canManage: branches.some((b) => canOnBranch(session, "classes", "update", b.id)),
    rooms: rooms.map((r) => ({
      ...r,
      weeklyUse: used.get(r.id) ?? 0,
      homeSections: sectionsByRoom.filter((s) => s.branchId === r.branchId && (s.room === r.code || s.room === r.name)).map((s) => `${s.grade.name} / ${s.name}`),
    })),
  };
}

export interface RoomInput {
  branchId: string;
  code: string;
  name: string;
  kind: string;
  capacity: number;
  isActive?: boolean;
}

export async function saveRoom(db: TenantDb, session: SessionData, id: string | null, input: RoomInput) {
  requireBranch(session, "classes", id ? "update" : "create", input.branchId);
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw badRequest("رمز القاعة واسمها مطلوبان");
  const dup = await db.room.findFirst({ where: { branchId: input.branchId, code, ...(id ? { id: { not: id } } : {}) } });
  if (dup && !dup.deletedAt) throw badRequest("يوجد قاعة بالرمز نفسه في الفرع");
  const data = { code, name, kind: input.kind, capacity: input.capacity, isActive: input.isActive ?? true, updatedById: session.user.id };
  if (id) {
    const room = await db.room.findFirst({ where: { id, deletedAt: null } });
    if (!room) throw notFound("القاعة غير موجودة");
    if (room.branchId !== input.branchId) throw badRequest("لا يمكن نقل القاعة إلى فرع آخر");
    return db.room.update({ where: { id }, data });
  }
  if (dup) return db.room.update({ where: { id: dup.id }, data: { ...data, deletedAt: null } });
  return db.room.create({ data: { tenantId: session.tenant.id, branchId: input.branchId, ...data, createdById: session.user.id } });
}

export async function deleteRoom(db: TenantDb, session: SessionData, id: string) {
  const room = await db.room.findFirst({ where: { id, deletedAt: null } });
  if (!room) throw notFound("القاعة غير موجودة");
  requireBranch(session, "classes", "delete", room.branchId);
  const used = await db.timetableSlot.count({ where: { roomId: id } });
  if (used) throw badRequest(`القاعة مستخدمة في ${used} حصة بالجدول؛ عطّلها بدلاً من حذفها أو أعد توليد الجدول`);
  await db.room.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// إنهاء العام الدراسي: ترفيع الطلاب وفتح عام جديد
// ---------------------------------------------------------------------

function requireYearEnd(session: SessionData) {
  const scope = resolveScope(session.access, "classes", "approve");
  if (scope?.kind !== "all") throw forbidden("إنهاء العام الدراسي من صلاحية مدير المدرسة");
}

/** الصف التالي لكل صف (null = الصف الأخير: تخرّج) */
async function nextGrades(db: TenantDb) {
  const grades = await db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { order: true, name: true } } } });
  const ordered = grades.sort((a, b) => a.stage.order - b.stage.order || a.order - b.order);
  const next = new Map<string, (typeof ordered)[number] | null>();
  ordered.forEach((g, i) => next.set(g.id, ordered[i + 1] ?? null));
  return { ordered, next };
}

/** مستحقات الطلاب المنتظمين في العام (لسياسة منع إعادة القيد مع المديونية) */
async function studentDebts(db: TenantDb | Prisma.TransactionClient, yearId: string) {
  const invoices = await db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null, student: { academicYearId: yearId, status: "ACTIVE", deletedAt: null } }, select: { studentId: true, totalMinor: true, paidMinor: true, creditedMinor: true } });
  const debts = new Map<string, number>();
  for (const i of invoices) debts.set(i.studentId, (debts.get(i.studentId) ?? 0) + i.totalMinor - i.paidMinor - i.creditedMinor);
  for (const [k, v] of debts) if (v <= 0) debts.delete(k);
  return debts;
}

const addYears = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));

export async function yearEndPreview(db: TenantDb, session: SessionData) {
  requireYearEnd(session);
  const year = await requireYear(db);
  const { ordered, next } = await nextGrades(db);
  const [byGrade, sections, openTransfers, pendingLeaves, loads] = await Promise.all([
    db.student.groupBy({ by: ["gradeId"], where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null }, _count: { _all: true } }),
    db.section.count({ where: { academicYearId: year.id, deletedAt: null } }),
    db.transfer.count({ where: { status: { in: ["PENDING", "APPROVED"] }, deletedAt: null } }),
    db.studentLeave.count({ where: { status: "PENDING", deletedAt: null } }),
    db.teacherLoad.count({ where: { academicYearId: year.id } }),
  ]);
  const count = new Map(byGrade.map((g) => [g.gradeId, g._count._all]));
  const startYear = year.startDate.getUTCFullYear() + 1;
  const debts = await studentDebts(db, year.id);
  return {
    year: { id: year.id, name: year.name, startDate: year.startDate, endDate: year.endDate },
    suggested: { name: `${startYear}–${startYear + 1}`, startDate: addYears(year.startDate, 1).toISOString().slice(0, 10), endDate: addYears(year.endDate, 1).toISOString().slice(0, 10) },
    grades: ordered.map((g) => {
      const n = next.get(g.id);
      return { id: g.id, name: g.name, stageName: g.stage.name, students: count.get(g.id) ?? 0, nextGrade: n ? n.name : null };
    }),
    sections,
    teacherLoads: loads,
    openTransfers,
    pendingLeaves,
    debtors: { count: debts.size, totalMinor: [...debts.values()].reduce((a, b) => a + b, 0), blockReenrollment: readModuleSettings(session.tenant.settings, "finance").blockReenrollment },
    endsInFuture: year.endDate.getTime() > Date.now(),
  };
}

export interface CloseYearInput {
  name: string;
  startDate: string;
  endDate: string;
  /** طلاب يبقون في صفهم (راسبون أو معادون) */
  retainStudentIds: string[];
  /** نص التأكيد: اسم العام الحالي */
  confirm: string;
}

export async function closeYear(db: TenantDb, session: SessionData, input: CloseYearInput) {
  requireYearEnd(session);
  const year = await requireYear(db);
  if (input.confirm.trim() !== year.name) throw badRequest("اكتب اسم العام الحالي كما هو للتأكيد");
  const name = input.name.trim();
  if (!name) throw badRequest("اسم العام الجديد مطلوب");
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);
  if (!(end > start)) throw badRequest("تاريخ نهاية العام يجب أن يكون بعد بدايته");
  if (start <= year.startDate) throw badRequest("بداية العام الجديد يجب أن تكون بعد بداية العام الحالي");
  if (await db.academicYear.findFirst({ where: { name } })) throw badRequest("يوجد عام دراسي بالاسم نفسه");
  const { next } = await nextGrades(db);
  const retain = new Set(input.retainStudentIds);
  // سياسة المديونية: من عليه مستحقات يُنقل للعام الجديد «مؤجلاً» دون فصل حتى السداد
  const hold = readModuleSettings(session.tenant.settings, "finance").blockReenrollment ? await studentDebts(db, year.id) : new Map<string, number>();

  return db.$transaction(
    async (tx) => {
      const newYear = await tx.academicYear.create({ data: { tenantId: session.tenant.id, name, startDate: start, endDate: end, isCurrent: false, createdById: session.user.id } });
      // الفصول الدراسية للعام الجديد بنفس الإزاحة الزمنية
      const shift = start.getTime() - year.startDate.getTime();
      const terms = await tx.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" } });
      for (const t of terms) {
        const tEnd = new Date(Math.min(t.endDate.getTime() + shift, end.getTime()));
        await tx.term.create({ data: { tenantId: session.tenant.id, academicYearId: newYear.id, name: t.name, order: t.order, startDate: new Date(t.startDate.getTime() + shift), endDate: tEnd, createdById: session.user.id } });
      }
      // نسخ الفصول (نفس الأسماء والطاقة والقاعة والرائد)
      const sections = await tx.section.findMany({ where: { academicYearId: year.id, deletedAt: null } });
      const newSection = new Map<string, string>(); // branch|grade|name → id
      for (const s of sections) {
        const created = await tx.section.create({
          data: { tenantId: session.tenant.id, branchId: s.branchId, gradeId: s.gradeId, academicYearId: newYear.id, name: s.name, capacity: s.capacity, room: s.room, homeroomUserId: s.homeroomUserId, createdById: session.user.id },
        });
        newSection.set(`${s.branchId}|${s.gradeId}|${s.name}`, created.id);
      }
      const sectionName = new Map(sections.map((s) => [s.id, s.name]));
      // أنصبة المعلمين وتفضيلاتهم
      const loads = await tx.teacherLoad.findMany({ where: { academicYearId: year.id } });
      for (const l of loads) {
        await tx.teacherLoad.create({ data: { tenantId: session.tenant.id, userId: l.userId, academicYearId: newYear.id, quota: l.quota, freeDay: l.freeDay, subjectIds: l.subjectIds, createdById: session.user.id } });
      }
      // ترفيع الطلاب
      const students = await tx.student.findMany({ where: { academicYearId: year.id, status: "ACTIVE", deletedAt: null }, select: { id: true, branchId: true, gradeId: true, sectionId: true } });
      let promoted = 0;
      let retained = 0;
      let graduated = 0;
      let deferred = 0;
      for (const st of students) {
        const keep = retain.has(st.id);
        const target = keep ? { id: st.gradeId } : next.get(st.gradeId);
        if (!target) {
          await tx.student.update({ where: { id: st.id }, data: { status: "GRADUATED", sectionId: null, updatedById: session.user.id } });
          graduated++;
          continue;
        }
        const secName = st.sectionId ? sectionName.get(st.sectionId) : undefined;
        const held = hold.has(st.id);
        const sectionId = secName && !held ? (newSection.get(`${st.branchId}|${target.id}|${secName}`) ?? null) : null;
        await tx.student.update({ where: { id: st.id }, data: { academicYearId: newYear.id, gradeId: target.id, sectionId, ...(held ? { status: "DEFERRED" as const } : {}), updatedById: session.user.id } });
        if (held) deferred++;
        if (keep) retained++;
        else promoted++;
      }
      await tx.academicYear.update({ where: { id: year.id }, data: { isCurrent: false, updatedById: session.user.id } });
      await tx.academicYear.update({ where: { id: newYear.id }, data: { isCurrent: true, updatedById: session.user.id } });
      return { yearId: newYear.id, name: newYear.name, promoted, retained, graduated, deferred, sections: sections.length, teacherLoads: loads.length };
    },
    { timeout: 120_000 },
  );
}

/** طلاب صف (لاختيار الباقين للإعادة في معالج إنهاء العام) */
export async function gradeStudents(db: TenantDb, session: SessionData, gradeId: string) {
  requireYearEnd(session);
  const year = await requireYear(db);
  return db.student.findMany({
    where: { academicYearId: year.id, gradeId, status: "ACTIVE", deletedAt: null },
    select: { id: true, fullName: true, academicNumber: true, section: { select: { name: true } }, branch: { select: { name: true } } },
    orderBy: [{ branchId: "asc" }, { fullName: "asc" }],
  });
}
