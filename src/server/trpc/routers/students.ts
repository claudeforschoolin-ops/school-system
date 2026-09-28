import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ADMISSION_FLOW } from "@/lib/students";
import { rootDb } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { rateLimit } from "@/server/auth/rate-limit";
import * as admissions from "@/server/services/admissions.service";
import * as students from "@/server/services/students.service";
import { systemDatabaseId } from "@/server/services/system-db.service";
import { authedProcedure, permissionProcedure, publicProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(60);
const idType = z.enum(["NATIONAL_ID", "IQAMA", "PASSPORT"]);
const relation = z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]);
const gender = z.enum(["MALE", "FEMALE"]);
const fileValue = z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500), size: z.number().optional(), mime: z.string().max(120).optional() });
const optText = (max = 500) => z.string().trim().max(max).nullish();

const admissionInput = z.object({
  branchId: id,
  requestedGradeId: id,
  firstName: name,
  fatherName: name,
  grandfatherName: name,
  familyName: name,
  gender,
  nationality: z.string().max(10),
  idType,
  nationalId: z.string().trim().min(5).max(20),
  birthDate: z.coerce.date(),
  previousSchool: optText(200),
  guardianName: z.string().trim().min(3).max(120),
  guardianRelation: relation,
  guardianPhone: z.string().trim().min(9).max(20),
  guardianEmail: z.string().trim().email("البريد الإلكتروني غير صالح").max(200).nullish().or(z.literal("")),
  guardianNationalId: z.string().trim().max(20).nullish().or(z.literal("")),
  motherName: optText(120),
  motherPhone: optText(20),
  address: optText(300),
  source: z.string().max(40).nullish(),
  attachments: z.array(fileValue).max(10).optional(),
  notes: optText(2000),
});

export const studentsRouter = router({
  overview: permissionProcedure("students", "view").query(({ ctx }) => students.studentsOverview(ctx.db, ctx.session)),
  databaseId: permissionProcedure("students", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "students")),
  get: permissionProcedure("students", "view").input(z.object({ id })).query(({ ctx, input }) => students.getStudentProfile(ctx.db, ctx.session, input.id)),
  search: permissionProcedure("students", "view")
    .input(z.object({ query: z.string().max(100), limit: z.number().int().min(1).max(30).optional() }))
    .query(({ ctx, input }) => students.searchStudents(ctx.db, ctx.session, input.query, input.limit)),
  activity: permissionProcedure("students", "view").input(z.object({ id })).query(({ ctx, input }) => students.studentActivity(ctx.db, ctx.session, input.id)),
  revealId: permissionProcedure("students", "update").input(z.object({ id })).mutation(({ ctx, input }) => students.revealStudentId(ctx.db, ctx.session, input.id)),
  create: permissionProcedure("students", "create")
    .input(
      z.object({
        branchId: id,
        gradeId: id,
        sectionId: id.nullish(),
        firstName: name,
        fatherName: name,
        grandfatherName: name,
        familyName: name,
        gender,
        nationality: z.string().max(10),
        idType,
        nationalId: z.string().trim().min(5).max(20),
        birthDate: z.coerce.date(),
        enrollmentDate: z.coerce.date().optional(),
        previousSchool: optText(200),
        guardianName: z.string().trim().min(3).max(120),
        guardianRelation: relation,
        guardianPhone: z.string().trim().min(9).max(20),
        guardianNationalId: z.string().trim().max(20).nullish(),
      }),
    )
    .mutation(({ ctx, input }) => students.createStudent(ctx.db, ctx.session, input)),
  update: permissionProcedure("students", "update")
    .input(
      z.object({
        id,
        patch: z.object({
          firstName: name.optional(),
          fatherName: name.optional(),
          grandfatherName: name.optional(),
          familyName: name.optional(),
          gender: gender.optional(),
          nationality: z.string().max(10).optional(),
          idType: idType.optional(),
          nationalId: z.string().trim().min(5).max(20).optional(),
          birthDate: z.coerce.date().optional(),
          birthPlace: optText(100),
          photoUrl: z.string().max(500).nullish(),
          cover: z.string().max(500).nullish(),
          previousSchool: optText(200),
          sectionId: id.nullish(),
          bloodType: z.string().max(4).nullish(),
          chronicConditions: optText(1000),
          allergies: optText(1000),
          medications: optText(1000),
          criticalHealth: z.boolean().optional(),
          healthNotes: optText(2000),
          transportMode: z.string().max(20).nullish(),
          busNumber: optText(20),
          mealPlan: optText(60),
          emergencyContacts: z.array(z.object({ name: z.string().max(100), relation: z.string().max(40), phone: z.string().max(20) })).max(5).optional(),
          notes: z.unknown().optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => students.updateStudentProfile(ctx.db, ctx.session, input.id, input.patch)),
  addGuardian: permissionProcedure("students", "update")
    .input(z.object({ studentId: id, relation, isPrimary: z.boolean().optional(), guardianId: id.nullish(), name: z.string().max(120).optional(), phone: z.string().max(20).optional(), email: z.string().max(200).nullish(), nationalId: z.string().max(20).nullish() }))
    .mutation(({ ctx, input }) => {
      const { studentId, ...rest } = input;
      return students.addGuardian(ctx.db, ctx.session, studentId, rest);
    }),
  updateGuardianLink: permissionProcedure("students", "update")
    .input(z.object({ linkId: id, isPrimary: z.boolean().optional(), canPickup: z.boolean().optional(), receivesNotifications: z.boolean().optional(), relation: relation.optional() }))
    .mutation(({ ctx, input }) => {
      const { linkId, ...patch } = input;
      return students.updateGuardianLink(ctx.db, ctx.session, linkId, patch);
    }),
  removeGuardian: permissionProcedure("students", "update").input(z.object({ linkId: id })).mutation(({ ctx, input }) => students.removeGuardian(ctx.db, ctx.session, input.linkId)),
  updateGuardian: permissionProcedure("students", "update")
    .input(z.object({ guardianId: id, name: z.string().max(120).optional(), phone: z.string().max(20).optional(), phoneAlt: optText(20), email: optText(200), occupation: optText(100), employer: optText(120), address: optText(300) }))
    .mutation(({ ctx, input }) => {
      const { guardianId, ...patch } = input;
      return students.updateGuardian(ctx.db, ctx.session, guardianId, patch);
    }),
  searchGuardians: permissionProcedure("students", "update").input(z.object({ query: z.string().max(100) })).query(({ ctx, input }) => students.searchGuardians(ctx.db, ctx.session, input.query)),
  addDocument: permissionProcedure("students", "update")
    .input(z.object({ studentId: id, type: z.string().max(40), name: z.string().max(200).optional(), file: fileValue, expiresAt: z.coerce.date().nullish() }))
    .mutation(({ ctx, input }) => students.addDocument(ctx.db, ctx.session, input.studentId, input)),
  verifyDocument: permissionProcedure("students", "update").input(z.object({ documentId: id, verified: z.boolean() })).mutation(({ ctx, input }) => students.verifyDocument(ctx.db, ctx.session, input.documentId, input.verified)),
  removeDocument: permissionProcedure("students", "update").input(z.object({ documentId: id })).mutation(({ ctx, input }) => students.removeDocument(ctx.db, ctx.session, input.documentId)),
  formOptions: authedProcedure.query(({ ctx }) => admissions.admissionFormOptions(ctx.db)),
});

export const admissionsRouter = router({
  databaseId: permissionProcedure("admissions", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "admissions")),
  get: permissionProcedure("admissions", "view").input(z.object({ id })).query(({ ctx, input }) => admissions.getAdmission(ctx.db, ctx.session, input.id)),
  create: permissionProcedure("admissions", "create")
    .input(admissionInput)
    .mutation(({ ctx, input }) => admissions.createAdmission(ctx.db, ctx.session, ctx.session.user.id, { ...input, guardianEmail: input.guardianEmail || null, guardianNationalId: input.guardianNationalId || null }, "STAFF")),
  update: permissionProcedure("admissions", "update")
    .input(
      z.object({
        id,
        patch: z.object({
          firstName: name.optional(),
          fatherName: name.optional(),
          grandfatherName: name.optional(),
          familyName: name.optional(),
          gender: gender.nullish(),
          nationality: z.string().max(10).optional(),
          idType: idType.optional(),
          nationalId: z.string().trim().min(5).max(20).optional(),
          birthDate: z.coerce.date().nullish(),
          requestedGradeId: id.nullish(),
          previousSchool: optText(200),
          guardianName: optText(120),
          guardianRelation: relation.nullish(),
          guardianPhone: optText(20),
          guardianEmail: optText(200),
          address: optText(300),
          source: z.string().max(40).nullish(),
          ownerId: id.nullish(),
          assessmentAt: z.coerce.date().nullish(),
          assessmentScore: z.number().int().min(0).max(1000).nullish(),
          assessmentNotes: optText(2000),
          attachments: z.array(fileValue).max(20).optional(),
          notes: z.unknown().optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => admissions.updateAdmission(ctx.db, ctx.session, input.id, input.patch)),
  setStage: permissionProcedure("admissions", "update")
    .input(z.object({ id, stage: z.enum(ADMISSION_FLOW as [string, ...string[]]), reason: optText(500) }))
    .mutation(({ ctx, input }) => admissions.changeAdmissionStage(ctx.db, ctx.session, input.id, input.stage as never, input.reason)),
  funnel: permissionProcedure("admissions", "view").query(({ ctx }) => admissions.admissionFunnel(ctx.db, ctx.session)),
  seats: permissionProcedure("admissions", "view").input(z.object({ branchId: id, gradeId: id })).query(({ ctx, input }) => admissions.seatsFor(ctx.db, input.branchId, input.gradeId)),

  /** النموذج العام: بيانات المدرسة وخياراتها (دون تسجيل دخول) */
  publicForm: publicProcedure.input(z.object({ slug: z.string().max(60) })).query(async ({ input }) => {
    const tenant = await rootDb.tenant.findUnique({ where: { slug: input.slug } });
    const settings = (tenant?.settings ?? {}) as { admissions?: { publicFormEnabled?: boolean } };
    if (!tenant || settings.admissions?.publicFormEnabled === false) throw new TRPCError({ code: "NOT_FOUND", message: "نموذج التقديم غير متاح" });
    const db = createTenantDb({ tenantId: tenant.id, actor: null });
    return { school: { name: tenant.name, platformName: tenant.platformName, logoUrl: tenant.logoUrl, isDemo: tenant.isDemo }, ...(await admissions.admissionFormOptions(db)) };
  }),

  /** التقديم العام: يُنشئ طلب قبول دون حساب (مع حدّ للمحاولات وحقل مصيدة للبرامج الآلية) */
  publicApply: publicProcedure
    .input(admissionInput.extend({ slug: z.string().max(60), website: z.string().max(0).optional(), consent: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const limit = rateLimit(`public-apply:${ctx.ip ?? "unknown"}`, 5, 60 * 60_000);
      if (!limit.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "عدد كبير من الطلبات. حاول لاحقاً" });
      const tenant = await rootDb.tenant.findUnique({ where: { slug: input.slug } });
      const settings = (tenant?.settings ?? {}) as { admissions?: { publicFormEnabled?: boolean } };
      if (!tenant || settings.admissions?.publicFormEnabled === false) throw new TRPCError({ code: "NOT_FOUND", message: "نموذج التقديم غير متاح" });
      const db = createTenantDb({ tenantId: tenant.id, actor: null, ip: ctx.ip, userAgent: ctx.userAgent });
      const { slug, website, consent, ...data } = input;
      void slug;
      void website;
      void consent;
      const created = await admissions.createAdmission(
        db,
        { tenant: { id: tenant.id, name: tenant.name, settings: (tenant.settings ?? {}) as Record<string, unknown> } as never },
        null,
        { ...data, guardianEmail: data.guardianEmail || null, guardianNationalId: data.guardianNationalId || null },
        "PUBLIC_FORM",
      );
      return { number: created.number };
    }),
});
