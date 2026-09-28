/**
 * بذور البيانات التجريبية — المرحلة ١.
 * تشغيل: npm run db:seed (بعد prisma migrate deploy)
 *
 * تُنشئ: مدرسة تجريبية بفرعين وثلاث مراحل، عاماً دراسياً بفصلين وشُعباً،
 * ١٩ دوراً نظامياً بصلاحياتها، ٥٠ مستخدماً بأسماء عربية، ٨ مساحات فرق
 * بصفحاتها وقواعد بياناتها، أحداث تقويم، تعليقات، إشعارات، موافقات ومحادثات.
 */
import "dotenv/config";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb, writeAudit, type TenantDb } from "../../src/server/db/tenant";
import { encryptField, sha256 } from "../../src/server/auth/crypto";
import { hashPassword } from "../../src/server/auth/password";
import { provisionTenant } from "../../src/server/services/admin/provisioning.service";
import { createDatabaseRecords } from "../../src/server/services/database.service";
import { toISODate } from "../../src/lib/dates";
import type { PropertyConfig } from "../../src/lib/database/types";
import { DEMO_2FA_ROLES, DEMO_PASSWORD, DEMO_TOTP_SECRET, PEOPLE, fakePhone } from "./data/people";
import { WORKSPACE, type DatabaseSeed, type PageSeed } from "./data/workspace";
import { bullets, callout, doc, h2, mentionUser, p, todos } from "./doc";

const TENANT_SLUG = "demo";
const TZ = "Asia/Riyadh";

function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return toISODate(d, TZ);
}

/** وقت محدد في يوم نسبي بتوقيت الرياض (UTC+3) */
function at(offsetDays: number, hour: number, minute = 0): Date {
  const day = isoDay(offsetDays);
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);
}

async function main() {
  const existing = await rootDb.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) {
    console.log("ℹ️  المستأجر التجريبي موجود مسبقاً. لإعادة البذر: npm run db:reset (يحذف كل البيانات).");
    return;
  }

  console.log("⏳ إنشاء المدرسة التجريبية...");
  const { tenant, roles, teamspaces } = await provisionTenant({
    slug: TENANT_SLUG,
    name: "مدارس منارات المعرفة الأهلية",
    platformName: "منصة",
    isDemo: true,
  });
  await rootDb.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: {
        defaultDigits: "arab",
        defaultCalendar: "both",
        address: "الرياض — حي النرجس",
        phone: "+966 11 555 0100",
        email: "info@demo.manassa.sa",
        website: "https://demo.manassa.sa",
      },
    },
  });

  // ------------------------------------------------------------------ الهيكل
  const branches = {
    BOYS: await rootDb.branch.create({
      data: { tenantId: tenant.id, code: "B1", name: "فرع البنين — حي النرجس", gender: "BOYS", address: "الرياض، حي النرجس", phone: "+966 11 555 0101" },
    }),
    GIRLS: await rootDb.branch.create({
      data: { tenantId: tenant.id, code: "G1", name: "فرع البنات — حي الياسمين", gender: "GIRLS", address: "الرياض، حي الياسمين", phone: "+966 11 555 0102" },
    }),
  };
  const stageDefs = [
    { code: "PRI", name: "المرحلة الابتدائية", grades: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"] },
    { code: "INT", name: "المرحلة المتوسطة", grades: ["الأول", "الثاني", "الثالث"] },
    { code: "SEC", name: "المرحلة الثانوية", grades: ["الأول", "الثاني", "الثالث"] },
  ] as const;
  const stages: Record<string, string> = {};
  const grades: Array<{ id: string; stage: string }> = [];
  for (const [i, s] of stageDefs.entries()) {
    const stage = await rootDb.stage.create({ data: { tenantId: tenant.id, code: s.code, name: s.name, order: i + 1 } });
    stages[s.code] = stage.id;
    for (const [j, g] of s.grades.entries()) {
      const grade = await rootDb.grade.create({
        data: { tenantId: tenant.id, stageId: stage.id, code: `${s.code}-${j + 1}`, name: `الصف ${g} ${s.code === "PRI" ? "الابتدائي" : s.code === "INT" ? "المتوسط" : "الثانوي"}`, order: j + 1 },
      });
      grades.push({ id: grade.id, stage: s.code });
    }
  }
  const year = await rootDb.academicYear.create({
    data: { tenantId: tenant.id, name: "١٤٤٨هـ (2026–2027)", startDate: new Date("2026-08-23"), endDate: new Date("2027-06-10"), isCurrent: true },
  });
  await rootDb.academicYear.create({
    data: { tenantId: tenant.id, name: "١٤٤٧هـ (2025–2026)", startDate: new Date("2025-08-24"), endDate: new Date("2026-06-11"), isCurrent: false },
  });
  await rootDb.term.createMany({
    data: [
      { tenantId: tenant.id, academicYearId: year.id, name: "الفصل الدراسي الأول", order: 1, startDate: new Date("2026-08-23"), endDate: new Date("2027-01-14") },
      { tenantId: tenant.id, academicYearId: year.id, name: "الفصل الدراسي الثاني", order: 2, startDate: new Date("2027-01-24"), endDate: new Date("2027-06-10") },
    ],
  });

  // ------------------------------------------------------------------ المستخدمون
  console.log("⏳ إنشاء المستخدمين والأدوار...");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users: Record<string, { id: string; name: string }> = {};
  for (const person of PEOPLE) {
    const twoFactor = DEMO_2FA_ROLES.has(person.role);
    const user = await rootDb.user.create({
      data: {
        tenantId: tenant.id,
        email: person.email,
        phone: fakePhone(),
        name: person.name,
        jobTitle: person.jobTitle,
        avatarColor: person.color,
        passwordHash,
        status: "ACTIVE",
        twoFactorEnabled: twoFactor,
        twoFactorSecret: twoFactor ? encryptField(DEMO_TOTP_SECRET) : null,
        twoFactorBackup: twoFactor ? ["MANASSA1", "MANASSA2", "MANASSA3"].map((c) => sha256(c)) : undefined,
        passwordChangedAt: new Date(),
        preferences: { theme: "system", digits: "arab", calendar: "both" },
      },
    });
    users[person.key] = { id: user.id, name: user.name };
    await rootDb.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        roleId: roles[person.role]!,
        branchId: person.branch ? branches[person.branch].id : null,
        stageId: person.stage ? stages[person.stage]! : null,
      },
    });
    for (const [tsKey, level] of person.teamspaces ?? []) {
      await rootDb.teamspaceMember.create({ data: { tenantId: tenant.id, teamspaceId: teamspaces[tsKey]!, userId: user.id, level } });
    }
  }
  // مستخدم مدعو لم يفعّل حسابه بعد (لعرض حالة الدعوة)
  const invited = await rootDb.user.create({
    data: { tenantId: tenant.id, email: "new.teacher@demo.manassa.sa", name: "أ. ليان بنت فهد العتيبي", jobTitle: "معلمة علوم (مدعوة)", status: "INVITED", avatarColor: "teal" },
  });
  await rootDb.userRole.create({ data: { tenantId: tenant.id, userId: invited.id, roleId: roles.TEACHER!, branchId: branches.GIRLS.id } });

  // الشعب الدراسية
  const teachersBy = (branch: "BOYS" | "GIRLS") => PEOPLE.filter((p) => p.role === "TEACHER" && p.branch === branch).map((p) => users[p.key]!.id);
  let homeroomIndex = 0;
  for (const grade of grades) {
    for (const branchKey of ["BOYS", "GIRLS"] as const) {
      for (const name of ["أ", "ب"]) {
        const pool = teachersBy(branchKey);
        await rootDb.section.create({
          data: {
            tenantId: tenant.id,
            branchId: branches[branchKey].id,
            gradeId: grade.id,
            academicYearId: year.id,
            name,
            capacity: grade.stage === "PRI" ? 28 : 30,
            homeroomUserId: pool[homeroomIndex++ % pool.length] ?? null,
          },
        });
      }
    }
  }

  // ------------------------------------------------------------------ مساحات العمل
  console.log("⏳ إنشاء مساحات العمل والصفحات وقواعد البيانات...");
  const owner = users.owner!;
  const db = createTenantDb({ tenantId: tenant.id, actor: { id: owner.id, name: owner.name }, ip: "127.0.0.1", userAgent: "seed" });
  const databases: Record<string, { id: string; pageId: string; keyToId: Record<string, string>; rows: Record<string, string> }> = {};
  const pagesByKey: Record<string, string> = {};

  const resolveValue = (value: unknown, dbSeed: DatabaseSeed): unknown => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      if ("__date" in v) {
        const start = isoDay(v.__date as number);
        return v.__end !== undefined ? { start, end: isoDay(v.__end as number) } : { start };
      }
      if ("__people" in v) return (v.__people as string[]).map((k) => users[k]?.id).filter(Boolean);
      if ("__money" in v) return Math.round((v.__money as number) * 100);
      if ("__relation" in v) {
        const target = databases[v.__relation as string];
        return ((v.titles as string[]) ?? []).map((t) => target?.rows[t]).filter(Boolean);
      }
    }
    void dbSeed;
    return value;
  };

  async function createSeedPage(teamspaceId: string, page: PageSeed, parentId: string | null, position: number) {
    const created = await db.page.create({
      data: {
        tenantId: tenant.id,
        kind: "PAGE",
        teamspaceId,
        parentId,
        title: page.title,
        icon: page.icon,
        cover: page.cover ?? null,
        content: page.content as never,
        position,
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    pagesByKey[page.key] = created.id;
    await db.pageVersion.create({
      data: { tenantId: tenant.id, targetType: "PAGE", targetId: created.id, title: page.title, content: page.content as never, createdById: owner.id },
    });
    for (const [i, child] of (page.children ?? []).entries()) await createSeedPage(teamspaceId, child, created.id, (i + 1) * 1024);
  }

  for (const content of WORKSPACE) {
    const teamspaceId = teamspaces[content.teamspace]!;
    let position = 0;
    for (const page of content.pages) {
      position += 1024;
      await createSeedPage(teamspaceId, page, null, position);
    }
    for (const dbSeed of content.databases) {
      position += 1024;
      // حل المراجع إلى قواعد بيانات أخرى قبل الإنشاء
      const template = {
        ...dbSeed.template,
        properties: dbSeed.template.properties.map((prop) => {
          const cfg = { ...(prop.config ?? {}) } as PropertyConfig;
          if (typeof cfg.targetDatabaseId === "string" && cfg.targetDatabaseId.startsWith("@")) {
            cfg.targetDatabaseId = databases[cfg.targetDatabaseId.slice(1)]?.id;
          }
          return { ...prop, config: cfg };
        }),
      };
      const created = await createDatabaseRecords(db, {
        tenantId: tenant.id,
        userId: owner.id,
        ownerId: null,
        teamspaceId,
        parentId: null,
        title: dbSeed.title,
        icon: dbSeed.icon,
        description: dbSeed.description,
        position,
        template,
      });
      // حل مراجع التجميع (Rollup) بعد معرفة معرّفات الخصائص
      for (const prop of dbSeed.template.properties) {
        const cfg = prop.config as PropertyConfig | undefined;
        if (prop.type !== "ROLLUP" || !cfg) continue;
        const next = { ...cfg };
        if (next.relationPropertyId?.startsWith("@prop:")) next.relationPropertyId = created.keyToId[next.relationPropertyId.slice(6)];
        if (next.targetPropertyId?.startsWith("@")) {
          const [dbKey, propKey] = next.targetPropertyId.slice(1).split(":");
          next.targetPropertyId = databases[dbKey!]?.keyToId[propKey!] ?? next.targetPropertyId;
        }
        await db.databaseProperty.update({ where: { id: created.keyToId[prop.key]! }, data: { config: next as never } });
      }

      const rowIds: Record<string, string> = {};
      let n = 0;
      for (const row of dbSeed.rows) {
        n++;
        const values: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row.values)) {
          const propId = created.keyToId[key];
          if (propId) values[propId] = resolveValue(value, dbSeed);
        }
        const createdRow = await db.databaseRow.create({
          data: {
            tenantId: tenant.id,
            databaseId: created.database.id,
            number: n,
            title: row.title,
            icon: row.icon ?? null,
            cover: row.cover ?? null,
            values: values as never,
            content: (row.content ?? undefined) as never,
            position: n * 1024,
            createdById: owner.id,
            updatedById: owner.id,
          },
        });
        rowIds[row.title] = createdRow.id;
      }
      await db.database.update({ where: { id: created.database.id }, data: { rowCounter: n } });
      for (const [i, t] of (dbSeed.templates ?? []).entries()) {
        const values = Object.fromEntries(
          Object.entries(t.values).map(([k, v]) => [created.keyToId[k] ?? k, resolveValue(v, dbSeed)]),
        );
        await db.databaseTemplate.create({
          data: {
            tenantId: tenant.id,
            databaseId: created.database.id,
            name: t.name,
            title: t.title,
            values: values as never,
            content: (t.content ?? undefined) as never,
            isDefault: t.isDefault ?? false,
            position: (i + 1) * 1024,
            createdById: owner.id,
          },
        });
      }
      databases[dbSeed.key] = { id: created.database.id, pageId: created.page.id, keyToId: created.keyToId, rows: rowIds };
      pagesByKey[dbSeed.key] = created.page.id;
    }
  }

  // أتمتة نموذجية على الخطة التشغيلية
  const tasks = databases.tasks!;
  await db.automation.create({
    data: {
      tenantId: tenant.id,
      databaseId: tasks.id,
      name: "إشعار المسؤول عند اكتمال المهمة",
      trigger: { type: "PROPERTY_CHANGED", propertyId: tasks.keyToId.status, toValue: "done" },
      actions: [
        { type: "SET_PROPERTY", propertyId: tasks.keyToId.progress, value: 100 },
        { type: "NOTIFY", recipients: "CREATOR", message: "اكتملت المهمة: {العنوان}" },
      ],
      createdById: owner.id,
    },
  });
  await db.automation.create({
    data: {
      tenantId: tenant.id,
      databaseId: tasks.id,
      name: "تذكير المسؤول قبل الاستحقاق بيومين",
      trigger: { type: "DATE_REACHED", propertyId: tasks.keyToId.end, offsetDays: -2 },
      actions: [{ type: "NOTIFY", recipients: "PERSON_PROPERTY", propertyId: tasks.keyToId.owner, message: "تذكير: يستحق «{العنوان}» بعد يومين" }],
      createdById: owner.id,
    },
  });

  // صفحات خاصة لكل حساب تجريبي رئيسي
  for (const person of PEOPLE.filter((pp) => pp.demo && pp.role !== "PARENT" && pp.role !== "STUDENT")) {
    const u = users[person.key]!;
    await rootDb.page.create({
      data: {
        tenantId: tenant.id,
        kind: "PAGE",
        ownerId: u.id,
        title: "مساحتي",
        icon: "lucide:user-round",
        position: 1024,
        content: doc(
          callout("lucide:sparkles", "neutral", "صفحتك الخاصة — لا يراها أحد غيرك ما لم تشاركها."),
          h2("أولوياتي هذا الأسبوع"),
          todos(["مراجعة مهامي في الخطة التشغيلية", false], ["الرد على الإشارات في صندوق الوارد", false]),
        ) as never,
        createdById: u.id,
        updatedById: u.id,
      },
    });
    await rootDb.page.create({
      data: {
        tenantId: tenant.id,
        kind: "PAGE",
        ownerId: u.id,
        title: "ملاحظات اجتماعات ١:١",
        icon: "lucide:notebook-pen",
        position: 2048,
        content: doc(h2("الاجتماع القادم"), bullets("نقاط للنقاش", "متابعة الأهداف"), p("")) as never,
        createdById: u.id,
        updatedById: u.id,
      },
    });
  }

  // ------------------------------------------------------------------ التقويم
  console.log("⏳ إنشاء أحداث التقويم والتعاون...");
  const events: Array<[string, "ACADEMIC" | "ADMINISTRATIVE" | "EXAM" | "MEETING" | "HOLIDAY" | "ACTIVITY", Date, Date, boolean, string?]> = [
    ["اجتماع مجلس الآباء", "MEETING", at(1, 10), at(1, 11), false, "قاعة المسرح"],
    ["تسليم كشوف الرواتب", "ADMINISTRATIVE", at(2, 16), at(2, 17), false, "الموارد البشرية"],
    ["اجتماع المعلمين الأسبوعي", "MEETING", at(3, 12, 30), at(3, 13, 15), false, "غرفة المعلمين"],
    ["اليوم العالمي للمعلم", "ACTIVITY", at(7, 7), at(7, 12), false],
    ["اختبارات منتصف الفصل الأول", "EXAM", at(14, 7), at(18, 12), false],
    ["لقاء أولياء أمور المرحلة الابتدائية", "MEETING", at(12, 17), at(12, 19), false, "فرع البنات"],
    ["إجازة نهاية أسبوع مطوّلة", "HOLIDAY", at(20, 0), at(21, 23, 59), true],
    ["معرض العلوم السنوي", "ACTIVITY", at(24, 8), at(24, 12), false, "الساحة الداخلية"],
    ["تدريب: التعلم النشط", "ACADEMIC", at(-2, 13), at(-2, 14, 30), false, "مركز مصادر التعلم"],
    ["اجتماع مجلس الإدارة", "MEETING", at(-6, 18), at(-6, 20), false],
    ["بداية العام الدراسي", "ACADEMIC", new Date("2026-08-23T07:00:00+03:00"), new Date("2026-08-23T12:00:00+03:00"), false],
    ["إجازة اليوم الوطني", "HOLIDAY", new Date("2026-09-23T00:00:00+03:00"), new Date("2026-09-23T23:59:00+03:00"), true],
  ];
  for (const [title, category, startAt, endAt, allDay, location] of events) {
    await db.calendarEvent.create({
      data: { tenantId: tenant.id, title, category, startAt, endAt, allDay, location: location ?? null, createdById: users.principal!.id },
    });
  }

  // ------------------------------------------------------------------ تعليقات وإشعارات وموافقات
  const principal = users.principal!;
  const teacher = users.teacher!;
  const taskRow = (title: string) => tasks.rows[title]!;
  const commentsSeed: Array<[string, string, string]> = [
    [taskRow("تجهيز معامل العلوم بأدوات السلامة"), principal.id, `@[${users.facilities!.name}](user:${users.facilities!.id}) نحتاج تحديثاً عن موعد توريد النظارات قبل نهاية الأسبوع.`],
    [taskRow("تجهيز معامل العلوم بأدوات السلامة"), users.facilities!.id, "تم التواصل مع المورد، والتسليم المتوقع يوم الأربعاء."],
    [taskRow("متابعة الطلاب المتعثرين دراسياً"), users.counselor!.id, `@[${teacher.name}](user:${teacher.id}) أرسلت لك قائمة الطلاب المحالين، أرجو مراجعتها.`],
    [taskRow("مراجعة عقود النقل المدرسي"), users.accountant!.id, "العقد الحالي ينتهي نهاية الشهر؛ نحتاج قرار التجديد أو الطرح."],
  ];
  for (const [rowId, authorId, body] of commentsSeed) {
    await db.comment.create({ data: { tenantId: tenant.id, targetType: "ROW", targetId: rowId, authorId, body } });
  }

  const notifications: Array<[string, "MENTION" | "ASSIGNMENT" | "APPROVAL" | "COMMENT" | "SYSTEM", string, string, string | null]> = [
    [teacher.id, "MENTION", `أشارت إليك ${users.counselor!.name} في تعليق على «متابعة الطلاب المتعثرين دراسياً»`, `/r/${taskRow("متابعة الطلاب المتعثرين دراسياً")}`, users.counselor!.id],
    [teacher.id, "ASSIGNMENT", `أسندت إليك ${principal.name}: إعداد جدول المراقبة لاختبارات منتصف الفصل`, `/r/${taskRow("إعداد جدول المراقبة لاختبارات منتصف الفصل")}`, principal.id],
    [users.facilities!.id, "MENTION", `أشارت إليك ${principal.name} في تعليق على «تجهيز معامل العلوم بأدوات السلامة»`, `/r/${taskRow("تجهيز معامل العلوم بأدوات السلامة")}`, principal.id],
    [principal.id, "COMMENT", `${users.accountant!.name} علّق على «مراجعة عقود النقل المدرسي»`, `/r/${taskRow("مراجعة عقود النقل المدرسي")}`, users.accountant!.id],
    [owner.id, "SYSTEM", "مرحباً بك في منصة! ابدأ بجولة في «دليل استخدام المنصة»", `/p/${pagesByKey.platformGuide}`, null],
  ];
  for (const [userId, type, title, link, actorId] of notifications) {
    await rootDb.notification.create({ data: { tenantId: tenant.id, userId, type, title, link, actorId } });
  }

  // طلبات موافقة متعددة المراحل
  const discount = await rootDb.approvalRequest.create({
    data: {
      tenantId: tenant.id,
      type: "discount_exception",
      title: "خصم استثنائي ١٥٪ لأسرة القرني (ثلاثة أبناء)",
      description: "طلب خصم إضافي بسبب ظروف الأسرة، مع إرفاق المستندات المؤيدة.",
      requestedById: users.admissions!.id,
      currentStep: 2,
      payload: { percent: 15 },
    },
  });
  await rootDb.approvalStep.createMany({
    data: [
      { tenantId: tenant.id, requestId: discount.id, order: 1, name: "مراجعة المحاسب", approverRoleId: roles.ACCOUNTANT!, status: "APPROVED", decidedById: users.accountant!.id, decidedAt: at(-1, 11), comment: "لا مانع مالياً" },
      { tenantId: tenant.id, requestId: discount.id, order: 2, name: "اعتماد مديرة المدارس", approverRoleId: roles.PRINCIPAL! },
    ],
  });
  const purchase = await rootDb.approvalRequest.create({
    data: {
      tenantId: tenant.id,
      type: "purchase",
      title: "شراء ١٢ جهاز عرض للفصول (٤٢٬٠٠٠ ر.س)",
      description: "استبدال أجهزة العرض المتعطلة في المبنى أ.",
      requestedById: users.procurement!.id,
      currentStep: 1,
    },
  });
  await rootDb.approvalStep.createMany({
    data: [
      { tenantId: tenant.id, requestId: purchase.id, order: 1, name: "مراجعة المحاسب", approverRoleId: roles.ACCOUNTANT! },
      { tenantId: tenant.id, requestId: purchase.id, order: 2, name: "اعتماد مديرة المدارس", approverRoleId: roles.PRINCIPAL! },
    ],
  });
  await rootDb.notification.create({
    data: { tenantId: tenant.id, userId: principal.id, type: "APPROVAL", title: "طلب موافقة: خصم استثنائي ١٥٪ لأسرة القرني", body: "بانتظار اعتمادك (اعتماد مديرة المدارس)", link: "/inbox?tab=approvals", actorId: users.accountant!.id },
  });

  // محادثات
  const convo = await rootDb.conversation.create({ data: { tenantId: tenant.id, kind: "DIRECT", createdById: principal.id, lastMessageAt: at(0, 9, 20) } });
  await rootDb.conversationMember.createMany({
    data: [
      { tenantId: tenant.id, conversationId: convo.id, userId: principal.id, lastReadAt: at(0, 9, 20) },
      { tenantId: tenant.id, conversationId: convo.id, userId: users.vpAcademic!.id, lastReadAt: at(0, 9, 0) },
    ],
  });
  await rootDb.message.createMany({
    data: [
      { tenantId: tenant.id, conversationId: convo.id, authorId: users.vpAcademic!.id, body: "صباح الخير أستاذة سارة، أرفقت جدول المراقبة المبدئي في الخطة التشغيلية.", createdAt: at(0, 9, 5) },
      { tenantId: tenant.id, conversationId: convo.id, authorId: principal.id, body: "صباح النور، شكراً نورة. سأراجعه اليوم وأعلق عليه مباشرة.", createdAt: at(0, 9, 20) },
    ],
  });
  const group = await rootDb.conversation.create({ data: { tenantId: tenant.id, kind: "GROUP", title: "لجنة التميز المدرسي", createdById: principal.id, lastMessageAt: at(0, 10) } });
  await rootDb.conversationMember.createMany({
    data: ["principal", "vpAcademic", "vpStudents", "counselor"].map((k) => ({ tenantId: tenant.id, conversationId: group.id, userId: users[k]!.id, lastReadAt: k === "principal" ? at(0, 8) : at(0, 10) })),
  });
  await rootDb.message.create({
    data: { tenantId: tenant.id, conversationId: group.id, authorId: users.vpStudents!.id, body: "تذكير: اجتماع اللجنة يوم الأحد القادم لمناقشة نتائج استبانة أولياء الأمور.", createdAt: at(0, 10) },
  });

  // عينة سجل دخول لسجل التدقيق
  for (const key of ["principal", "vpAcademic", "teacher", "accountant"]) {
    await writeAudit({ tenantId: tenant.id, actor: { id: users[key]!.id, name: users[key]!.name }, ip: "10.0.0.12", userAgent: "Mozilla/5.0 (seed)" }, {
      action: "LOGIN",
      entityType: "Auth",
      entityId: users[key]!.id,
      summary: PEOPLE.find((pp) => pp.key === key)!.email,
    });
  }

  // إشارة إلى المعلم في صفحة دليل المعلم (لعرض الإشارات في المحتوى)
  await db.page.update({
    where: { id: pagesByKey.teacherGuide! },
    data: {
      content: doc(
        callout("lucide:hand-heart", "success", "أهلاً بك في أسرة المدرسة! هذا الدليل يساعدك في أسبوعك الأول."),
        h2("قبل بدء الدراسة"),
        todos(["استلام الجدول الدراسي من وكيلة الشؤون الأكاديمية", false], ["تفعيل حسابك في المنصة", true], ["الاطلاع على توزيع المنهج", false]),
        h2("جهات الاتصال"),
        p("للاستفسارات الأكاديمية: ", mentionUser(users.vpAcademic!.id, users.vpAcademic!.name)),
        p("للدعم الفني: ", mentionUser(users.s02!.id, users.s02!.name)),
      ) as never,
    },
  });

  const counts = await Promise.all([
    rootDb.user.count({ where: { tenantId: tenant.id } }),
    rootDb.page.count({ where: { tenantId: tenant.id } }),
    rootDb.databaseRow.count({ where: { tenantId: tenant.id } }),
    rootDb.auditLog.count({ where: { tenantId: tenant.id } }),
  ]);
  console.log(`✅ تم: ${counts[0]} مستخدماً، ${counts[1]} صفحة، ${counts[2]} سجلاً، ${counts[3]} قيد تدقيق.`);
  console.log(`   كلمة المرور التجريبية لكل الحسابات: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("❌ فشل البذر:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await rootDb.$disconnect();
  });

export type { TenantDb };
