/**
 * التوظيف: الوظائف الشاغرة ولوحة كانبان للمرشحين (تقديم ← فرز ← مقابلة ← عرض ← تعيين/رفض)،
 * والتعيين ينشئ ملف الموظف وعقده مباشرة من بيانات المرشح.
 */
import type { ApplicationStage } from "@/generated/prisma/client";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { nextNumber } from "@/server/services/sequence.service";
import { dateOnly, requireHr } from "./common";
import { saveContract } from "./employees.service";

export const STAGES: Array<{ key: ApplicationStage; label: string; color: string }> = [
  { key: "APPLIED", label: "تقديم جديد", color: "gray" },
  { key: "SCREENING", label: "فرز", color: "slate" },
  { key: "INTERVIEW", label: "مقابلة", color: "navy" },
  { key: "OFFER", label: "عرض وظيفي", color: "gold" },
  { key: "HIRED", label: "تم التعيين", color: "green" },
  { key: "REJECTED", label: "مستبعد", color: "red" },
];

export async function listOpenings(db: TenantDb, session: SessionData) {
  requireHr(session, "employees", "view");
  const [rows, counts, departments] = await Promise.all([
    db.jobOpening.findMany({ where: { deletedAt: null }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.jobApplication.groupBy({ by: ["openingId", "stage"], where: { deletedAt: null }, _count: { _all: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
  ]);
  return rows.map((o) => ({ ...o, department: departments.find((d) => d.id === o.departmentId)?.name ?? null, applicants: counts.filter((c) => c.openingId === o.id).reduce((s, c) => s + c._count._all, 0), hired: counts.find((c) => c.openingId === o.id && c.stage === "HIRED")?._count._all ?? 0 }));
}

export async function saveOpening(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; departmentId: string | null; positionId: string | null; branchId: string | null; description: string | null; requirements: string | null; openings: number; status: "OPEN" | "ON_HOLD" | "CLOSED"; closingDate: string | null }) {
  requireHr(session, "employees", "create");
  const data = { title: input.title.trim(), departmentId: input.departmentId, positionId: input.positionId, branchId: input.branchId, description: input.description, requirements: input.requirements, openings: input.openings, status: input.status, closingDate: input.closingDate ? dateOnly(input.closingDate) : null, updatedById: session.user.id };
  return input.id ? db.jobOpening.update({ where: { id: input.id }, data }) : db.jobOpening.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "job-opening"), ...data, createdById: session.user.id } });
}

export async function board(db: TenantDb, session: SessionData, openingId: string | null) {
  requireHr(session, "employees", "view");
  const apps = await db.jobApplication.findMany({ where: { deletedAt: null, ...(openingId ? { openingId } : { opening: { status: { not: "CLOSED" } } }) }, include: { opening: { select: { id: true, title: true } } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return { stages: STAGES, columns: STAGES.map((s) => ({ ...s, items: apps.filter((a) => a.stage === s.key) })) };
}

export interface ApplicationInput {
  id?: string | null;
  openingId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string;
  gender: "MALE" | "FEMALE";
  qualification: string | null;
  experienceYears: number;
  rating: number | null;
  interviewAt: Date | null;
  offerSalaryMinor: number | null;
  notes: string | null;
  cv?: { id: string; name: string; url: string } | null;
}

export async function saveApplication(db: TenantDb, session: SessionData, input: ApplicationInput) {
  requireHr(session, "employees", "create");
  if (!(await db.jobOpening.findFirst({ where: { id: input.openingId, deletedAt: null } }))) throw notFound("الوظيفة غير موجودة");
  const { id, cv, ...rest } = input;
  const data = { ...rest, fullName: rest.fullName.trim(), ...(cv !== undefined ? { cv: cv ?? undefined } : {}), updatedById: session.user.id };
  return id ? db.jobApplication.update({ where: { id }, data }) : db.jobApplication.create({ data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "job-application"), ...data, createdById: session.user.id } });
}

/** نقل مرشح بين المراحل (بالسحب)؛ «تم التعيين» يمر عبر hire فقط */
export async function moveApplication(db: TenantDb, session: SessionData, input: { id: string; stage: ApplicationStage; position: number }) {
  requireHr(session, "employees", "update");
  const a = await db.jobApplication.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!a) throw notFound("المرشح غير موجود");
  if (a.stage === "HIRED") throw badRequest("المرشح عُيّن؛ لا يُنقل");
  if (input.stage === "HIRED") throw badRequest("استخدم «تعيين» لإنشاء ملف الموظف والعقد");
  if (input.stage === "OFFER" && !a.offerSalaryMinor) throw badRequest("حدد الراتب المعروض قبل مرحلة العرض");
  return db.jobApplication.update({ where: { id: a.id }, data: { stage: input.stage, position: input.position, updatedById: session.user.id } });
}

/** التعيين: ملف موظف + عقد، وإغلاق الوظيفة عند اكتمال شواغرها */
export async function hire(db: TenantDb, session: SessionData, input: { applicationId: string; hireDate: string; category: "ACADEMIC" | "ADMIN" | "SERVICES"; departmentId: string | null; positionId: string | null; branchId: string | null; managerId: string | null; basicMinor: number; housingMinor: number; transportMinor: number; contractType: "FIXED" | "UNLIMITED"; contractMonths: number }) {
  requireHr(session, "employees", "create");
  const a = await db.jobApplication.findFirst({ where: { id: input.applicationId, deletedAt: null }, include: { opening: true } });
  if (!a) throw notFound("المرشح غير موجود");
  if (a.stage !== "OFFER") throw badRequest("التعيين من مرحلة «عرض وظيفي» بعد قبول العرض");
  const employee = await db.employee.create({
    data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "employee"), fullName: a.fullName, gender: a.gender, nationality: a.nationality, idType: a.nationality === "SA" ? "NATIONAL_ID" : "IQAMA", phone: a.phone, email: a.email, hireDate: dateOnly(input.hireDate), category: input.category, departmentId: input.departmentId ?? a.opening.departmentId, positionId: input.positionId ?? a.opening.positionId, branchId: input.branchId ?? a.opening.branchId, managerId: input.managerId, qualifications: a.qualification ? [{ degree: a.qualification, major: "", institution: "", year: "" }] : [], createdById: session.user.id, updatedById: session.user.id },
  });
  const start = dateOnly(input.hireDate);
  const end = input.contractType === "FIXED" ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + input.contractMonths, start.getUTCDate() - 1)) : null;
  const probation = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 89));
  await saveContract(db, session, { employeeId: employee.id, type: input.contractType, startDate: input.hireDate, endDate: end ? end.toISOString().slice(0, 10) : null, probationEnd: probation.toISOString().slice(0, 10), basicMinor: input.basicMinor, housingMinor: input.housingMinor, transportMinor: input.transportMinor, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });
  await db.jobApplication.update({ where: { id: a.id }, data: { stage: "HIRED", employeeId: employee.id, updatedById: session.user.id } });
  const hired = await db.jobApplication.count({ where: { openingId: a.openingId, stage: "HIRED", deletedAt: null } });
  if (hired >= a.opening.openings) await db.jobOpening.update({ where: { id: a.openingId }, data: { status: "CLOSED" } });
  return employee;
}
