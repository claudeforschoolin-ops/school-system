/**
 * مدرسة اختبار بهيكل أكاديمي: فرع بنين، مرحلة بصفين، عام دراسي حالي بفصل دراسي يغطي اليوم،
 * فصول، وطلاب بأولياء أمور (أرقام وهمية).
 */
import { rootDb } from "@/server/db/client";
import { makeTenant, uid } from "./helpers";

const DAY = 86_400_000;
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** رقم هوية سعودي صالح (خوارزمية لون) يبدأ بـ 1 — للاختبار فقط */
export function fakeNationalId(seed: number): string {
  const body = `1${String(100000000 + (seed % 899999999)).slice(0, 8)}`;
  for (let check = 0; check <= 9; check++) {
    const id = `${body}${check}`;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const d = Number(id[i]);
      if (i % 2 === 0) {
        const x = d * 2;
        sum += Math.floor(x / 10) + (x % 10);
      } else sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error("unreachable");
}

/** آخر يوم دراسي (الأحد–الخميس) قبل اليوم بـ offset أيام دراسية على الأقل */
export function pastSchoolDay(offset = 1): string {
  let d = new Date(Date.now() - DAY);
  let seen = 0;
  for (;;) {
    const wd = d.getUTCDay();
    if (wd <= 4) {
      seen++;
      if (seen >= offset) return isoOf(d);
    }
    d = new Date(d.getTime() - DAY);
  }
}

export async function makeSchool(opts: { settings?: Record<string, unknown> } = {}) {
  const t = await makeTenant();
  const tenantId = t.tenant.id;
  if (opts.settings) await rootDb.tenant.update({ where: { id: tenantId }, data: { settings: opts.settings as never } });
  const branch = await rootDb.branch.create({ data: { tenantId, code: `B${uid()}`, name: "فرع البنين", gender: "BOYS" } });
  const stage = await rootDb.stage.create({ data: { tenantId, code: `PRI${uid()}`, name: "المرحلة الابتدائية", order: 1 } });
  const g1 = await rootDb.grade.create({ data: { tenantId, stageId: stage.id, code: `G1-${uid()}`, name: "الصف الأول", order: 1 } });
  const g2 = await rootDb.grade.create({ data: { tenantId, stageId: stage.id, code: `G2-${uid()}`, name: "الصف الثاني", order: 2 } });
  const start = new Date(Date.now() - 90 * DAY);
  const year = await rootDb.academicYear.create({ data: { tenantId, name: `عام ${uid()}`, startDate: new Date(isoOf(start)), endDate: new Date(isoOf(new Date(Date.now() + 250 * DAY))), isCurrent: true } });
  await rootDb.term.create({ data: { tenantId, academicYearId: year.id, name: "الفصل الأول", order: 1, startDate: year.startDate, endDate: new Date(isoOf(new Date(Date.now() + 60 * DAY))) } });
  const section = (gradeId: string, name: string, capacity: number) => rootDb.section.create({ data: { tenantId, branchId: branch.id, gradeId, academicYearId: year.id, name, capacity } });
  const s1a = await section(g1.id, "أ", 3);
  const s1b = await section(g1.id, "ب", 3);
  const s2a = await section(g2.id, "أ", 30);
  let n = 0;
  const student = async (gradeId: string, sectionId: string | null, name = "طالب") => {
    n++;
    const st = await rootDb.student.create({
      data: {
        tenantId,
        branchId: branch.id,
        academicNumber: `T${uid()}`,
        firstName: `${name}${n}`,
        fatherName: "عبدالله",
        grandfatherName: "محمد",
        familyName: "الاختباري",
        fullName: `${name}${n} عبدالله محمد الاختباري`,
        gender: "MALE",
        birthDate: new Date(`201${n % 10}-0${(n % 9) + 1}-15`),
        academicYearId: year.id,
        gradeId,
        sectionId,
        enrollmentDate: year.startDate,
      },
    });
    const guardian = await rootDb.guardian.create({ data: { tenantId, name: `ولي أمر ${n}`, phone: `05${String(10000000 + n * 7919).slice(0, 8)}` } });
    await rootDb.studentGuardian.create({ data: { tenantId, studentId: st.id, guardianId: guardian.id, relation: "FATHER", isPrimary: true } });
    return st;
  };
  return { t, tenantId, branch, stage, g1, g2, year, s1a, s1b, s2a, student };
}
