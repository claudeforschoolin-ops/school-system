/**
 * بذور المرحلة ٢: الطلاب وأولياء الأمور والقبول (وتتوسع مع بقية وحدات المرحلة).
 * تُستدعى من index.ts بعد بذور المرحلة ١، ويمكن تشغيلها وحدها على قاعدة موجودة:
 *   npm run db:seed:phase2
 */
import "dotenv/config";
import type { Prisma } from "../../src/generated/prisma/client";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb } from "../../src/server/db/tenant";
import { protectId } from "../../src/server/pii";
import { storage } from "../../src/server/storage";
import { ensureSystemDatabase } from "../../src/server/services/system-db.service";
import { composeFullName, DOCUMENT_TYPES } from "../../src/lib/students";
import { CHRONIC, DISTRICTS, EMPLOYERS, FAMILY_NAMES, FEMALE_NAMES, MALE_NAMES, OCCUPATIONS, PREVIOUS_SCHOOLS, fakeMobile, fakeNationalId, rng, type Rng } from "./data/students-data";
import { seedPhase2Operations } from "./phase2-ops";

const DAY = 86_400_000;
const TOTAL_STUDENTS = 300;
const VIA_ADMISSIONS = 15;

/** ملف PDF صغير صالح (نموذج مستند) */
function placeholderPdf(title: string): Buffer {
  const text = `(${title.replace(/[()\\]/g, "")}) Tj`;
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj\n4 0 obj<</Length ${text.length + 20}>>stream\nBT /F1 18 Tf 72 760 Td ${text} ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

interface Ctx {
  tenantId: string;
  r: Rng;
  yearId: string;
  yearStart: Date;
  branches: { boys: { id: string }; girls: { id: string } };
  grades: Array<{ id: string; name: string; index: number }>;
  sections: Array<{ id: string; branchId: string; gradeId: string; capacity: number; count: number }>;
  seq: Map<string, number>;
  ownerId: string;
  files: Record<string, { id: string; url: string; size: number; mime: string }>;
}

function academicNumber(c: Ctx, enrollYear: number): string {
  const n = (c.seq.get(String(enrollYear)) ?? 0) + 1;
  c.seq.set(String(enrollYear), n);
  return `${enrollYear}${String(n).padStart(4, "0")}`;
}

function birthDateFor(c: Ctx, gradeIndex: number): Date {
  // الصف الأول الابتدائي: ٦ سنوات عند بداية العام
  const age = 6 + gradeIndex;
  const year = c.yearStart.getUTCFullYear() - age - (c.r.chance(0.35) ? 1 : 0);
  return new Date(Date.UTC(year, c.r.int(0, 11), c.r.int(1, 28)));
}

function placeSection(c: Ctx, branchId: string, gradeId: string): string | null {
  const options = c.sections.filter((s) => s.branchId === branchId && s.gradeId === gradeId && s.count < s.capacity).sort((a, b) => a.count - b.count);
  const s = options[0];
  if (!s) return null;
  s.count += 1;
  return s.id;
}

async function createGuardian(c: Ctx, data: { name: string; phone: string; withId: boolean; iqama?: boolean; email?: string | null; occupation?: string | null; employer?: string | null; address?: string | null }) {
  return rootDb.guardian.create({
    data: {
      tenantId: c.tenantId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      occupation: data.occupation ?? null,
      employer: data.employer ?? null,
      address: data.address ?? null,
      idType: data.iqama ? "IQAMA" : "NATIONAL_ID",
      ...(data.withId ? protectId(c.tenantId, fakeNationalId(c.r, data.iqama ? "2" : "1")) : {}),
      createdById: c.ownerId,
    },
  });
}

async function createStudentRecord(
  c: Ctx,
  input: { firstName: string; fatherName: string; grandfatherName: string; familyName: string; gender: "MALE" | "FEMALE"; gradeIndex: number; nationality: string; enrollYear: number; status?: "ACTIVE" | "INACTIVE" | "DEFERRED"; placed?: boolean },
) {
  const grade = c.grades[input.gradeIndex]!;
  const branchId = input.gender === "MALE" ? c.branches.boys.id : c.branches.girls.id;
  const chronic = c.r.chance(0.08) ? c.r.pick(CHRONIC) : null;
  const transport = c.r.pick(["BUS", "BUS", "GUARDIAN", "GUARDIAN", "PRIVATE"] as const);
  const iqama = input.nationality !== "SA";
  const names = { firstName: input.firstName, fatherName: input.fatherName, grandfatherName: input.grandfatherName, familyName: input.familyName };
  const enrollmentDate = new Date(Date.UTC(input.enrollYear, 7, 23));
  return rootDb.student.create({
    data: {
      tenantId: c.tenantId,
      branchId,
      academicNumber: academicNumber(c, input.enrollYear),
      ...names,
      fullName: composeFullName(names),
      gender: input.gender,
      nationality: input.nationality,
      idType: iqama ? "IQAMA" : "NATIONAL_ID",
      ...protectId(c.tenantId, fakeNationalId(c.r, iqama ? "2" : "1")),
      birthDate: birthDateFor(c, input.gradeIndex),
      birthPlace: c.r.pick(["الرياض", "الرياض", "جدة", "الدمام", "القصيم", "أبها"]),
      status: input.status ?? "ACTIVE",
      academicYearId: c.yearId,
      gradeId: grade.id,
      sectionId: input.placed === false ? null : placeSection(c, branchId, grade.id),
      enrollmentDate,
      previousSchool: input.enrollYear === c.yearStart.getUTCFullYear() && input.gradeIndex > 0 ? c.r.pick(PREVIOUS_SCHOOLS) : null,
      bloodType: c.r.chance(0.7) ? c.r.pick(["A+", "A+", "O+", "O+", "B+", "AB+", "A-", "O-"]) : null,
      chronicConditions: chronic?.condition ?? null,
      allergies: chronic?.allergies ?? null,
      medications: chronic?.medications ?? null,
      criticalHealth: chronic?.critical ?? false,
      transportMode: transport,
      busNumber: transport === "BUS" ? String(c.r.int(1, 6)) : null,
      emergencyContacts: (c.r.chance(0.6) ? [{ name: `${c.r.pick(MALE_NAMES)} ${input.familyName}`, relation: "العم", phone: fakeMobile() }] : []) as Prisma.InputJsonValue,
      createdById: c.ownerId,
      createdAt: new Date(enrollmentDate.getTime() + c.r.int(0, 20) * DAY),
    },
  });
}

async function attachDocuments(c: Ctx, studentId: string, hasChronic: boolean, complete: boolean) {
  const required = DOCUMENT_TYPES.filter((d) => d.required);
  const missing = complete ? new Set<string>() : new Set(required.filter(() => c.r.chance(0.4)).map((d) => d.id).slice(0, 2));
  if (!complete && missing.size === 0) missing.add(required[c.r.int(0, required.length - 1)]!.id);
  const types = [...required.filter((d) => !missing.has(d.id)).map((d) => d.id), ...(hasChronic ? ["MEDICAL"] : [])];
  if (!types.length) return;
  await rootDb.studentDocument.createMany({
    data: types.map((t) => {
      const f = c.files[t]!;
      return {
        tenantId: c.tenantId,
        studentId,
        type: t,
        name: DOCUMENT_TYPES.find((d) => d.id === t)!.label,
        fileId: f.id,
        url: f.url,
        size: f.size,
        mime: f.mime,
        verifiedAt: c.r.chance(0.8) ? new Date() : null,
        verifiedById: null,
        createdById: c.ownerId,
      };
    }),
  });
}

export async function seedPhase2(tenantId: string) {
  if ((await rootDb.student.count({ where: { tenantId } })) > 0) {
    console.log("ℹ️  بيانات الطلاب موجودة مسبقاً — تخطي بذور المرحلة ٢.");
    return;
  }
  console.log("⏳ بذور المرحلة ٢: الطلاب وأولياء الأمور والقبول...");
  const r = rng(1448);
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const branches = await rootDb.branch.findMany({ where: { tenantId } });
  const boys = branches.find((b) => b.gender === "BOYS")!;
  const girls = branches.find((b) => b.gender === "GIRLS")!;
  const grades = (await rootDb.grade.findMany({ where: { tenantId }, include: { stage: true } }))
    .sort((a, b) => a.stage.order - b.stage.order || a.order - b.order)
    .map((g, index) => ({ id: g.id, name: g.name, index }));
  const sections = (await rootDb.section.findMany({ where: { tenantId, academicYearId: year.id } })).map((s) => ({ id: s.id, branchId: s.branchId, gradeId: s.gradeId, capacity: s.capacity, count: 0 }));
  const users = await rootDb.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
  const userBy = (email: string) => users.find((u) => u.email === email)!.id;
  const ownerId = userBy("owner@demo.manassa.sa");

  // مستندات نموذجية (ملف لكل نوع)
  const files: Ctx["files"] = {};
  for (const d of DOCUMENT_TYPES) {
    const data = placeholderPdf(`Sample ${d.id}`);
    const key = `${tenantId}/seed/${d.id.toLowerCase()}.pdf`;
    await storage().put(key, data, "application/pdf");
    const fo = await rootDb.fileObject.create({ data: { tenantId, storageKey: key, name: `${d.label}.pdf`, mime: "application/pdf", size: data.length, uploadedById: ownerId } });
    files[d.id] = { id: fo.id, url: `/api/files/${fo.id}`, size: data.length, mime: "application/pdf" };
  }

  const c: Ctx = { tenantId, r, yearId: year.id, yearStart: year.startDate, branches: { boys, girls }, grades, sections, seq: new Map(), ownerId, files };
  const currentYear = year.startDate.getUTCFullYear();

  // ---------------- الأسر والطلاب ----------------
  let created = 0;
  let guardians = 0;
  const families: Array<{ fatherId: string; familyName: string; fatherFirst: string; grandfather: string; phone: string }> = [];
  const target = TOTAL_STUDENTS - VIA_ADMISSIONS;
  while (created < target) {
    const familyName = r.pick(FAMILY_NAMES);
    const fatherFirst = r.pick(MALE_NAMES);
    const grandfather = r.pick(MALE_NAMES);
    const nationality = r.chance(0.12) ? r.pick(["EG", "JO", "SY", "YE", "SD"]) : "SA";
    const phone = fakeMobile();
    const district = r.pick(DISTRICTS);
    const father = await createGuardian(c, {
      name: `${fatherFirst} ${grandfather} ${familyName}`,
      phone,
      withId: true,
      iqama: nationality !== "SA",
      email: r.chance(0.5) ? `parent${families.length + 1}@example.sa` : null,
      occupation: r.pick(OCCUPATIONS),
      employer: r.pick(EMPLOYERS),
      address: `الرياض — ${district}`,
    });
    guardians += 1;
    const mother = r.chance(0.32)
      ? await createGuardian(c, { name: `${r.pick(FEMALE_NAMES)} ${r.pick(MALE_NAMES)} ${r.pick(FAMILY_NAMES)}`, phone: fakeMobile(), withId: r.chance(0.5), iqama: nationality !== "SA", address: `الرياض — ${district}` })
      : null;
    if (mother) guardians += 1;
    families.push({ fatherId: father.id, familyName, fatherFirst, grandfather, phone });

    const children = Math.min(target - created, r.chance(0.55) ? 1 : r.chance(0.7) ? 2 : 3);
    const usedGrades = new Set<number>();
    for (let k = 0; k < children; k++) {
      let gradeIndex = r.int(0, 11);
      while (usedGrades.has(gradeIndex)) gradeIndex = (gradeIndex + 1) % 12;
      usedGrades.add(gradeIndex);
      const gender = r.chance(0.5) ? "MALE" : "FEMALE";
      const yearsAgo = r.int(0, Math.min(gradeIndex, 6));
      const statusRoll = r.next();
      const student = await createStudentRecord(c, {
        firstName: gender === "MALE" ? r.pick(MALE_NAMES) : r.pick(FEMALE_NAMES),
        fatherName: fatherFirst,
        grandfatherName: grandfather,
        familyName,
        gender,
        gradeIndex,
        nationality,
        enrollYear: currentYear - yearsAgo,
        status: statusRoll < 0.01 ? "DEFERRED" : statusRoll < 0.025 ? "INACTIVE" : "ACTIVE",
        placed: !(yearsAgo === 0 && r.chance(0.04)),
      });
      await rootDb.studentGuardian.create({ data: { tenantId, studentId: student.id, guardianId: father.id, relation: "FATHER", isPrimary: true } });
      if (mother) await rootDb.studentGuardian.create({ data: { tenantId, studentId: student.id, guardianId: mother.id, relation: "MOTHER", isPrimary: false, canPickup: true } });
      await attachDocuments(c, student.id, Boolean(student.chronicConditions || student.allergies), r.chance(0.85));
      created += 1;
    }
  }

  // ---------------- القبول ----------------
  const plan: Array<{ stage: "NEW" | "REVIEW" | "ASSESSMENT" | "ACCEPTED" | "WAITLIST" | "REJECTED" | "ENROLLED"; count: number }> = [
    { stage: "NEW", count: 8 },
    { stage: "REVIEW", count: 7 },
    { stage: "ASSESSMENT", count: 6 },
    { stage: "ACCEPTED", count: 5 },
    { stage: "WAITLIST", count: 4 },
    { stage: "REJECTED", count: 5 },
    { stage: "ENROLLED", count: 10 },
  ];
  const admissionsOwners = [userBy("admissions@demo.manassa.sa"), userBy("vp.students@demo.manassa.sa")];
  let number = 0;
  const sources = ["sibling", "friend", "social", "website", "signboard", "other"];
  for (const { stage, count } of plan) {
    for (let k = 0; k < count; k++) {
      number += 1;
      const gender = r.chance(0.5) ? "MALE" : "FEMALE";
      const gradeIndex = r.chance(0.6) ? 0 : r.int(1, 8);
      const grade = grades[gradeIndex]!;
      const branchId = gender === "MALE" ? boys.id : girls.id;
      // بعض المتقدمين أشقاء لطلاب حاليين (نفس ولي الأمر)
      const siblingFamily = r.chance(0.25) ? r.pick(families) : null;
      const familyName = siblingFamily?.familyName ?? r.pick(FAMILY_NAMES);
      const fatherFirst = siblingFamily?.fatherFirst ?? r.pick(MALE_NAMES);
      const grandfather = siblingFamily?.grandfather ?? r.pick(MALE_NAMES);
      const firstName = gender === "MALE" ? r.pick(MALE_NAMES) : r.pick(FEMALE_NAMES);
      const guardianPhone = siblingFamily?.phone ?? fakeMobile();
      const guardianName = `${fatherFirst} ${grandfather} ${familyName}`;
      const createdAt = new Date(Date.now() - r.int(stage === "NEW" ? 0 : 6, 55) * DAY);
      const decided = ["ACCEPTED", "WAITLIST", "REJECTED", "ENROLLED"].includes(stage);
      const names = { firstName, fatherName: fatherFirst, grandfatherName: grandfather, familyName };
      const guardianRow = siblingFamily ? await rootDb.guardian.findUnique({ where: { id: siblingFamily.fatherId } }) : null;

      let studentId: string | null = null;
      if (stage === "ACCEPTED" || stage === "ENROLLED") {
        const student = await createStudentRecord(c, { ...names, gender, gradeIndex, nationality: "SA", enrollYear: currentYear, placed: stage === "ENROLLED" });
        studentId = student.id;
        const guardianId =
          siblingFamily?.fatherId ??
          (await createGuardian(c, { name: guardianName, phone: guardianPhone, withId: true, occupation: r.pick(OCCUPATIONS) })).id;
        if (!siblingFamily) guardians += 1;
        await rootDb.studentGuardian.create({ data: { tenantId, studentId, guardianId, relation: "FATHER", isPrimary: true } });
        await attachDocuments(c, studentId, false, stage === "ENROLLED" || r.chance(0.5));
        created += 1;
      }
      const student = studentId ? await rootDb.student.findUniqueOrThrow({ where: { id: studentId } }) : null;
      await rootDb.admission.create({
        data: {
          tenantId,
          branchId,
          number,
          academicYearId: year.id,
          stage,
          ...names,
          fullName: composeFullName(names),
          gender,
          nationality: "SA",
          idType: "NATIONAL_ID",
          ...(student
            ? { nationalIdHash: student.nationalIdHash, nationalIdEnc: student.nationalIdEnc, nationalIdLast4: student.nationalIdLast4 }
            : protectId(tenantId, fakeNationalId(r, "1"))),
          birthDate: student?.birthDate ?? birthDateFor(c, gradeIndex),
          requestedGradeId: grade.id,
          previousSchool: gradeIndex > 0 ? r.pick(PREVIOUS_SCHOOLS) : r.chance(0.6) ? "روضة البراعم" : null,
          guardianName,
          guardianRelation: "FATHER",
          guardianPhone,
          guardianEmail: r.chance(0.5) ? `applicant${number}@example.sa` : null,
          contacts: [
            {
              relation: "FATHER",
              name: guardianName,
              phone: guardianPhone,
              email: null,
              ...(guardianRow?.nationalIdHash ? { nationalIdHash: guardianRow.nationalIdHash, nationalIdEnc: guardianRow.nationalIdEnc, nationalIdLast4: guardianRow.nationalIdLast4 } : {}),
            },
          ] as Prisma.InputJsonValue,
          address: `الرياض — ${r.pick(DISTRICTS)}`,
          source: siblingFamily ? "sibling" : r.pick(sources),
          ownerId: gender === "MALE" ? admissionsOwners[1] : admissionsOwners[0],
          assessmentAt: stage === "ASSESSMENT" ? new Date(Date.now() + r.int(1, 12) * DAY + r.int(8, 12) * 3_600_000) : ["ACCEPTED", "ENROLLED", "REJECTED", "WAITLIST"].includes(stage) ? new Date(createdAt.getTime() + 5 * DAY) : null,
          assessmentScore: decided ? (stage === "REJECTED" ? r.int(35, 58) : r.int(70, 98)) : null,
          decisionAt: decided ? new Date(createdAt.getTime() + r.int(6, 14) * DAY) : null,
          decisionReason: stage === "REJECTED" ? "لم يحقق الحد الأدنى في اختبار القبول" : null,
          submittedVia: r.chance(0.4) ? "PUBLIC_FORM" : "STAFF",
          studentId,
          createdAt,
          createdById: ownerId,
          position: number * 1024,
        },
      });
    }
  }

  // تسلسلات الترقيم
  for (const [prefix, n] of c.seq) {
    await rootDb.sequence.upsert({
      where: { tenantId_key: { tenantId, key: `student:${prefix}` } },
      create: { tenantId, key: `student:${prefix}`, prefix, padding: 4, nextValue: n + 1 },
      update: { nextValue: n + 1 },
    });
  }
  await rootDb.sequence.upsert({ where: { tenantId_key: { tenantId, key: "admission" } }, create: { tenantId, key: "admission", nextValue: number + 1 }, update: { nextValue: number + 1 } });

  // قواعد بيانات النظام في مساحة «شؤون الطلاب»
  const db = createTenantDb({ tenantId, actor: null });
  for (const source of ["admissions", "students"]) await ensureSystemDatabase(db, tenantId, source, ownerId);

  await seedPhase2Operations(tenantId, r);
  console.log(`✅ المرحلة ٢: ${created} طالباً، ${guardians} ولي أمر، ${number} طلب قبول.`);
}

// التشغيل المباشر على قاعدة موجودة
if (process.argv[1]?.endsWith("phase2.ts")) {
  (async () => {
    const tenant = await rootDb.tenant.findUnique({ where: { slug: "demo" } });
    if (!tenant) throw new Error("شغّل npm run db:seed أولاً");
    await seedPhase2(tenant.id);
  })()
    .catch((e) => {
      console.error("❌", e);
      process.exitCode = 1;
    })
    .finally(() => rootDb.$disconnect());
}
