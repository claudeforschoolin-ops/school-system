/**
 * الفوترة: إعداد الرسوم (البنود، الجداول، خطط التقسيط، الخصومات)، تسعير الطالب (الجدول الأخص، خصم الأشقاء
 * والخصومات المعتمدة، الضريبة حسب البند وجنسية الطالب)، إصدار الفاتورة بقيدها الآلي ورقم غير منقطع،
 * الفوترة الجماعية بمعاينة، الإلغاء والإشعارات الدائنة/المدينة، غرامات التأخير، والربط مع القبول والأنشطة والانسحاب.
 */
import { isCitizen, readRegion } from "@/lib/region";
import type { FeeKind, Prisma } from "@/generated/prisma/client";
import { allocateMinor, formatMoney } from "@/lib/money";
import {
  applyBp,
  computeInvoice,
  recognizedToDate,
  siblingDiscountBp,
  splitInstallments,
  splitTaxInclusive,
  unusedMonths,
  type DiscountRule,
  type LineInput,
} from "@/lib/finance/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { messageGuardians } from "@/server/services/guardian-messages";
import { nextNumber } from "@/server/services/sequence.service";
import {
  balanceOf,
  dateOnly,
  displayStatus,
  financeSettings,
  invoiceWhere,
  isoOf,
  requirePerm,
  requireStaff,
  todayIso,
} from "./common";
import {
  accountIds,
  branchCostCenter,
  postEntry,
  reverseEntry,
  toDate,
  type PostLine,
  type Tx,
} from "./ledger";

// =====================================================================
// إعداد الرسوم
// =====================================================================

export async function feeSetup(db: TenantDb, session: SessionData) {
  requireStaff(session, "invoices", "view", "إعداد الرسوم لموظفي المالية");
  const [items, taxCodes, schedules, plans, discountTypes, accounts, years, grades, stages, branches] =
    await Promise.all([
      db.feeItem.findMany({ orderBy: { position: "asc" } }),
      db.taxCode.findMany({ orderBy: { code: "asc" } }),
      db.feeSchedule.findMany({ include: { lines: true }, orderBy: { createdAt: "asc" } }),
      db.installmentPlan.findMany({ orderBy: { createdAt: "asc" } }),
      db.discountType.findMany({ orderBy: { createdAt: "asc" } }),
      db.account.findMany({
        where: { deletedAt: null, isGroup: false, isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, type: true },
      }),
      db.academicYear.findMany({
        where: { deletedAt: null },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, isCurrent: true },
      }),
      db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { order: true } } } }),
      db.stage.findMany({
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, name: true },
      }),
      db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    ]);
  return {
    canEdit: Boolean(requirePermSafe(session, "invoices", "update")),
    items,
    taxCodes,
    schedules,
    plans: plans.map((p) => ({
      ...p,
      parts: (p.parts ?? []) as Array<{ label: string; weight: number; dueDate: string }>,
    })),
    discountTypes: discountTypes.map((d) => ({
      ...d,
      siblingTiers: (d.siblingTiers ?? null) as Array<{ order: number; valueBp: number }> | null,
    })),
    accounts,
    years,
    grades: grades
      .sort((a, b) => a.stage.order - b.stage.order || a.order - b.order)
      .map((g) => ({ id: g.id, name: g.name, stageId: g.stageId })),
    stages,
    branches,
  };
}

function requirePermSafe(session: SessionData, module: string, action: "update") {
  try {
    return requirePerm(session, module, action);
  } catch {
    return null;
  }
}

export interface FeeItemInput {
  code: string;
  name: string;
  kind: FeeKind;
  revenueAccountId: string;
  receivableAccountId: string;
  deferred: boolean;
  taxCodeId: string | null;
  citizenTaxCodeId: string | null;
  refundable: boolean;
  isActive: boolean;
}

export async function saveFeeItem(
  db: TenantDb,
  session: SessionData,
  id: string | null,
  input: FeeItemInput,
) {
  requirePerm(session, "invoices", "update", "إعداد الرسوم من صلاحية المحاسبة");
  const code = input.code.trim().toUpperCase();
  const dup = await db.feeItem.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw badRequest("يوجد بند بالرمز نفسه");
  const data = { ...input, code, name: input.name.trim(), updatedById: session.user.id };
  if (id) return db.feeItem.update({ where: { id }, data });
  const last = await db.feeItem.findFirst({ orderBy: { position: "desc" } });
  return db.feeItem.create({
    data: {
      tenantId: session.tenant.id,
      ...data,
      position: (last?.position ?? 0) + 1,
      createdById: session.user.id,
    },
  });
}

export async function saveTaxCode(
  db: TenantDb,
  session: SessionData,
  id: string | null,
  input: {
    code: string;
    name: string;
    rateBp: number;
    kind: string;
    outputAccountId: string | null;
    inputAccountId: string | null;
    isActive: boolean;
  },
) {
  requirePerm(session, "taxes", "update", "رموز الضريبة من صلاحية المحاسبة");
  const code = input.code.trim().toUpperCase();
  if (input.kind !== "STANDARD" && input.rateBp !== 0) throw badRequest("النسبة الصفرية والمعفاة بلا نسبة");
  if (id) return db.taxCode.update({ where: { id }, data: { ...input, code } });
  return db.taxCode.create({ data: { tenantId: session.tenant.id, ...input, code } });
}

export async function saveSchedule(
  db: TenantDb,
  session: SessionData,
  id: string | null,
  input: {
    academicYearId: string;
    name: string;
    branchId: string | null;
    stageId: string | null;
    gradeId: string | null;
    isActive: boolean;
    lines: Array<{ feeItemId: string; amountMinor: number; optional: boolean }>;
  },
) {
  requirePerm(session, "invoices", "update", "جداول الرسوم من صلاحية المحاسبة");
  if (!input.lines.length) throw badRequest("أضف بنداً واحداً على الأقل");
  if (new Set(input.lines.map((l) => l.feeItemId)).size !== input.lines.length)
    throw badRequest("بند مكرر في الجدول");
  return db.$transaction(async (tx) => {
    const data = {
      academicYearId: input.academicYearId,
      name: input.name.trim(),
      branchId: input.branchId,
      stageId: input.stageId,
      gradeId: input.gradeId,
      isActive: input.isActive,
      updatedById: session.user.id,
    };
    const s = id
      ? await tx.feeSchedule.update({ where: { id }, data })
      : await tx.feeSchedule.create({
          data: { tenantId: session.tenant.id, ...data, createdById: session.user.id },
        });
    await tx.feeScheduleLine.deleteMany({ where: { scheduleId: s.id } });
    await tx.feeScheduleLine.createMany({
      data: input.lines.map((l) => ({ tenantId: session.tenant.id, scheduleId: s.id, ...l })),
    });
    return s;
  });
}

export async function savePlan(
  db: TenantDb,
  session: SessionData,
  id: string | null,
  input: {
    name: string;
    kind: string;
    parts: Array<{ label: string; weight: number; dueDate: string }>;
    lateFeeKind: string;
    lateFeeValue: number;
    graceDays: number;
    isDefault: boolean;
    isActive: boolean;
  },
) {
  requirePerm(session, "invoices", "update");
  if (!input.parts.length) throw badRequest("أضف قسطاً واحداً على الأقل");
  if (input.parts.some((p) => p.weight <= 0)) throw badRequest("وزن القسط يجب أن يكون موجباً");
  const data = { ...input, parts: input.parts as Prisma.InputJsonValue };
  if (input.isDefault)
    await db.installmentPlan.updateMany({
      where: { isDefault: true, ...(id ? { id: { not: id } } : {}) },
      data: { isDefault: false },
    });
  if (id) return db.installmentPlan.update({ where: { id }, data });
  return db.installmentPlan.create({ data: { tenantId: session.tenant.id, ...data } });
}

export async function saveDiscountType(
  db: TenantDb,
  session: SessionData,
  id: string | null,
  input: {
    code: string;
    name: string;
    kind: "SIBLING" | "STAFF" | "MERIT" | "SCHOLARSHIP" | "EARLY_PAYMENT" | "MANUAL";
    method: "PERCENT" | "FIXED";
    value: number;
    siblingTiers: Array<{ order: number; valueBp: number }> | null;
    feeItemIds: string[];
    approvalLimitMinor: number | null;
    isActive: boolean;
  },
) {
  requirePerm(session, "invoices", "update");
  if (input.method === "PERCENT" && (input.value < 0 || input.value > 10000))
    throw badRequest("النسبة بين ٠ و١٠٠٪");
  const data = {
    ...input,
    code: input.code.trim().toUpperCase(),
    siblingTiers: (input.siblingTiers ?? undefined) as Prisma.InputJsonValue | undefined,
  };
  if (id) return db.discountType.update({ where: { id }, data });
  return db.discountType.create({ data: { tenantId: session.tenant.id, ...data } });
}

/** منح خصم لطالب: يتطلب موافقة المدير إذا تجاوز حد الاعتماد */
export async function grantStudentDiscount(
  db: TenantDb,
  session: SessionData,
  input: { studentId: string; discountTypeId: string; valueOverride: number | null; note: string | null },
) {
  requirePerm(session, "invoices", "update", "منح الخصومات من صلاحية المحاسبة");
  const [student, type, year] = await Promise.all([
    db.student.findFirst({ where: { id: input.studentId, deletedAt: null } }),
    db.discountType.findFirst({ where: { id: input.discountTypeId, isActive: true } }),
    db.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!student || !type || !year) throw notFound("الطالب أو نوع الخصم غير موجود");
  if (type.kind === "SIBLING") throw badRequest("خصم الأشقاء يُطبَّق تلقائياً حسب ترتيب الأخ");
  const value = input.valueOverride ?? type.value;
  const tuition = await estimateTuition(db, student);
  const amount = type.method === "PERCENT" ? applyBp(tuition, value) : value;
  const needsApproval = type.approvalLimitMinor !== null && amount > type.approvalLimitMinor;
  const sd = await db.studentDiscount.create({
    data: {
      tenantId: session.tenant.id,
      studentId: student.id,
      discountTypeId: type.id,
      academicYearId: year.id,
      valueOverride: input.valueOverride,
      status: needsApproval ? "PENDING" : "ACTIVE",
      note: input.note,
      createdById: session.user.id,
    },
  });
  if (needsApproval) {
    const req = await createApprovalRequest(db, session, {
      type: "student_discount",
      title: `${type.name} لـ${student.fullName} (${formatMoney(amount, { currency: session.tenant.currency })} تقريباً)`,
      description: input.note ?? undefined,
      entityType: "StudentDiscount",
      entityId: sd.id,
      link: `/students/${student.id}?tab=finance`,
      amountMinor: amount,
      steps: [{ name: "اعتماد مدير المدرسة", approverRoleKey: "PRINCIPAL" }],
    });
    await db.studentDiscount.update({ where: { id: sd.id }, data: { approvalRequestId: req.id } });
  }
  return sd;
}

export async function onDiscountApproval(
  db: TenantDb,
  _session: SessionData,
  request: { entityId: string | null },
  event: ApprovalHookEvent,
) {
  if (!request.entityId || !event.final) return;
  await db.studentDiscount.updateMany({
    where: { id: request.entityId, status: "PENDING" },
    data: { status: event.decision === "APPROVED" ? "ACTIVE" : "REJECTED" },
  });
}

export async function revokeStudentDiscount(db: TenantDb, session: SessionData, id: string) {
  requirePerm(session, "invoices", "update");
  await db.studentDiscount.update({ where: { id }, data: { status: "REVOKED" } });
  return { ok: true };
}

// =====================================================================
// التسعير
// =====================================================================

type StudentForBilling = {
  id: string;
  branchId: string;
  gradeId: string;
  academicYearId: string;
  nationality: string;
  birthDate: Date;
  fullName: string;
};

/** بنود الجداول المطابقة للطالب: الأخص (صف > مرحلة > فرع > عام) يغلب لكل بند */
export async function scheduleLinesFor(db: Tx, student: StudentForBilling, academicYearId: string) {
  const grade = await db.grade.findFirst({ where: { id: student.gradeId }, select: { stageId: true } });
  const schedules = await db.feeSchedule.findMany({
    where: {
      academicYearId,
      isActive: true,
      AND: [
        { OR: [{ branchId: null }, { branchId: student.branchId }] },
        { OR: [{ stageId: null }, { stageId: grade?.stageId }] },
        { OR: [{ gradeId: null }, { gradeId: student.gradeId }] },
      ],
    },
    include: { lines: true },
  });
  const rank = (s: (typeof schedules)[number]) =>
    (s.gradeId ? 4 : 0) + (s.stageId ? 2 : 0) + (s.branchId ? 1 : 0);
  const best = new Map<
    string,
    { feeItemId: string; amountMinor: number; optional: boolean; rank: number; schedule: string }
  >();
  for (const s of schedules) {
    for (const l of s.lines) {
      const cur = best.get(l.feeItemId);
      if (!cur || rank(s) > cur.rank)
        best.set(l.feeItemId, {
          feeItemId: l.feeItemId,
          amountMinor: l.amountMinor,
          optional: l.optional,
          rank: rank(s),
          schedule: s.name,
        });
    }
  }
  return [...best.values()];
}

async function estimateTuition(db: Tx, student: StudentForBilling) {
  const tuitionItems = await db.feeItem.findMany({ where: { kind: "TUITION" }, select: { id: true } });
  const lines = await scheduleLinesFor(db, student, student.academicYearId);
  return lines
    .filter((l) => tuitionItems.some((t) => t.id === l.feeItemId))
    .reduce((s, l) => s + l.amountMinor, 0);
}

/** الولي الأساسي للطالب (يُفوتَر باسمه) */
export async function primaryGuardian(db: Tx, studentId: string) {
  const links = await db.studentGuardian.findMany({
    where: { studentId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { guardian: { select: { id: true, name: true, phone: true } } },
  });
  return links[0]?.guardian ?? null;
}

/** ترتيب الطالب بين إخوته المنتظمين (الأكبر = ١) */
export async function siblingOrder(db: Tx, studentId: string, guardianId: string | null) {
  if (!guardianId) return 1;
  const siblings = await db.student.findMany({
    where: { status: "ACTIVE", deletedAt: null, guardians: { some: { guardianId, isPrimary: true } } },
    select: { id: true, birthDate: true },
    orderBy: [{ birthDate: "asc" }, { id: "asc" }],
  });
  const i = siblings.findIndex((s) => s.id === studentId);
  return i < 0 ? 1 : i + 1;
}

/** قواعد الخصم للطالب: الأشقاء (تلقائي) + الخصومات المعتمدة للعام */
export async function discountRulesFor(
  db: Tx,
  student: StudentForBilling,
  guardianId: string | null,
  academicYearId: string,
  onDate: Date,
): Promise<DiscountRule[]> {
  const [types, granted, tuitionItems] = await Promise.all([
    db.discountType.findMany({ where: { isActive: true } }),
    db.studentDiscount.findMany({ where: { studentId: student.id, academicYearId, status: "ACTIVE" } }),
    db.feeItem.findMany({ where: { kind: "TUITION" }, select: { id: true } }),
  ]);
  const valid = (t: (typeof types)[number]) =>
    (!t.validFrom || t.validFrom <= onDate) && (!t.validTo || t.validTo >= onDate);
  const scope = (t: (typeof types)[number]) =>
    t.feeItemIds.length ? t.feeItemIds : tuitionItems.map((x) => x.id);
  const rules: DiscountRule[] = [];
  const sibling = types.find((t) => t.kind === "SIBLING" && valid(t));
  if (sibling) {
    const order = await siblingOrder(db, student.id, guardianId);
    const bp = siblingDiscountBp(
      order,
      (sibling.siblingTiers ?? []) as Array<{ order: number; valueBp: number }>,
    );
    if (bp > 0)
      rules.push({
        id: sibling.id,
        name: `${sibling.name} (الابن ${order})`,
        method: "PERCENT",
        value: bp,
        feeItemIds: scope(sibling),
      });
  }
  for (const g of granted) {
    const t = types.find((x) => x.id === g.discountTypeId);
    if (!t || !valid(t)) continue;
    rules.push({
      id: t.id,
      name: t.name,
      method: t.method as "PERCENT" | "FIXED",
      value: g.valueOverride ?? t.value,
      feeItemIds: scope(t),
    });
  }
  return rules;
}

export interface DraftLine {
  feeItemId: string | null;
  description: string;
  unitMinor: number;
  quantity?: number;
}

/** يبني الفاتورة المقترحة لطالب (دون حفظ) */
export async function buildDraft(
  db: Tx,
  input: {
    studentId: string;
    academicYearId?: string;
    feeItemIds?: string[];
    lines?: DraftLine[];
    applyDiscounts?: boolean;
    onDate?: Date;
  },
) {
  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    include: { grade: { include: { stage: true } }, section: { select: { name: true } } },
  });
  if (!student) throw notFound("الطالب غير موجود");
  const academicYearId = input.academicYearId ?? student.academicYearId;
  const year = await db.academicYear.findFirst({ where: { id: academicYearId } });
  if (!year) throw badRequest("العام الدراسي غير موجود");
  const guardian = await primaryGuardian(db, student.id);
  const [items, taxCodes] = await Promise.all([
    db.feeItem.findMany({ where: { isActive: true } }),
    db.taxCode.findMany({ where: { isActive: true } }),
  ]);
  const warnings: string[] = [];
  let raw: DraftLine[] = input.lines ?? [];
  if (!input.lines) {
    const sched = await scheduleLinesFor(db, student, academicYearId);
    const wanted = input.feeItemIds
      ? sched.filter((l) => input.feeItemIds!.includes(l.feeItemId))
      : sched.filter((l) => !l.optional);
    if (!sched.length) warnings.push("لا يوجد جدول رسوم مطابق لصف الطالب");
    raw = wanted.map((l) => ({
      feeItemId: l.feeItemId,
      description: items.find((i) => i.id === l.feeItemId)?.name ?? "",
      unitMinor: l.amountMinor,
    }));
  }
  // «المواطن» = جنسية دولة المدرسة (إعدادات الإقليم)
  const tenantRow = await db.tenant.findFirst({ where: { id: student.tenantId }, select: { settings: true } });
  const citizen = isCitizen(student.nationality, readRegion(tenantRow?.settings));
  const lineInputs: Array<LineInput & { item: (typeof items)[number] | null; taxCodeId: string | null }> =
    raw.map((l) => {
      const item = l.feeItemId ? (items.find((i) => i.id === l.feeItemId) ?? null) : null;
      const taxCodeId = item
        ? citizen && item.citizenTaxCodeId
          ? item.citizenTaxCodeId
          : item.taxCodeId
        : null;
      const rate = taxCodeId ? (taxCodes.find((t) => t.id === taxCodeId)?.rateBp ?? 0) : 0;
      return {
        feeItemId: l.feeItemId,
        description: l.description || item?.name || "",
        unitMinor: l.unitMinor,
        quantity: l.quantity ?? 1,
        taxRateBp: rate,
        item,
        taxCodeId,
      };
    });
  const discounts =
    input.applyDiscounts === false
      ? []
      : await discountRulesFor(db, student, guardian?.id ?? null, academicYearId, input.onDate ?? new Date());
  const computed = computeInvoice(lineInputs, discounts);
  // حساب الإيراد: الرسوم الدراسية حسب المرحلة إن وُجد حساب لها
  const stageKey = `REV_TUITION:${student.grade.stage.code}`;
  const stageAccount = await db.account.findFirst({ where: { systemKey: stageKey } });
  const lines = computed.lines.map((l, i) => {
    const item = lineInputs[i]!.item;
    return {
      ...l,
      taxCodeId: lineInputs[i]!.taxCodeId,
      revenueAccountId:
        item?.kind === "TUITION" && stageAccount ? stageAccount.id : (item?.revenueAccountId ?? ""),
      receivableAccountId: item?.receivableAccountId ?? "",
      deferred: item?.deferred ?? false,
      kind: item?.kind ?? "OTHER",
    };
  });
  if (lines.some((l) => !l.revenueAccountId || !l.receivableAccountId))
    throw badRequest("بند بلا حسابات إيراد/ذمم؛ راجع إعداد البنود");
  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      academicNumber: student.academicNumber,
      branchId: student.branchId,
      grade: student.grade.name,
      section: student.section?.name ?? null,
      nationality: student.nationality,
    },
    guardian,
    academicYear: { id: year.id, name: year.name, startDate: year.startDate, endDate: year.endDate },
    lines,
    subtotalMinor: computed.subtotalMinor,
    discountMinor: computed.discountMinor,
    taxMinor: computed.taxMinor,
    totalMinor: computed.totalMinor,
    warnings,
  };
}

export type InvoiceDraft = Awaited<ReturnType<typeof buildDraft>>;

// =====================================================================
// الإصدار
// =====================================================================

type IssueOpts = {
  source: string;
  sourceId?: string | null;
  batchId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  planId?: string | null;
  notes?: string | null;
  notify?: boolean;
};

/** قيد إصدار الفاتورة: مدين الذمم (الصافي) والخصومات، دائن الإيراد/المؤجل (الإجمالي) والضريبة */
function issueLines(
  draft: InvoiceDraft,
  costCenterId: string | null,
  taxAccounts: Map<string, string>,
  discountsAccount: string,
  deferredAccount: string,
): PostLine[] {
  const out: PostLine[] = [];
  const party = { studentId: draft.student.id, guardianId: draft.guardian?.id ?? null, costCenterId };
  for (const l of draft.lines) {
    out.push({ account: l.receivableAccountId, debit: l.totalMinor, ...party, description: l.description });
    if (l.discountMinor)
      out.push({
        account: discountsAccount,
        debit: l.discountMinor,
        ...party,
        description: `خصم: ${l.discounts.map((d) => d.name).join("، ")}`,
      });
    out.push({
      account: l.deferred ? deferredAccount : l.revenueAccountId,
      credit: l.amountMinor,
      costCenterId,
      description: l.description,
    });
    if (l.taxMinor) {
      const acc = l.taxCodeId ? taxAccounts.get(l.taxCodeId) : undefined;
      if (!acc) throw badRequest("رمز الضريبة بلا حساب مخرجات");
      out.push({ account: acc, credit: l.taxMinor, costCenterId, description: `ضريبة: ${l.description}` });
    }
  }
  return out;
}

export async function issueDraft(tx: Tx, session: SessionData, draft: InvoiceDraft, opts: IssueOpts) {
  if (draft.totalMinor <= 0 && draft.subtotalMinor <= 0) throw badRequest("فاتورة بلا مبلغ");
  const issueDate = dateOnly(opts.issueDate);
  const plan = opts.planId ? await tx.installmentPlan.findFirst({ where: { id: opts.planId } }) : null;
  const parts = plan
    ? ((plan.parts ?? []) as Array<{ label: string; weight: number; dueDate: string }>)
    : [{ label: "كامل المبلغ", weight: 1, dueDate: opts.dueDate ?? opts.issueDate }];
  // الأقساط المستحقة سابقاً تُستحق عند الإصدار
  const installments = splitInstallments(draft.totalMinor, parts).map((i) => ({
    ...i,
    dueDate: i.dueDate < opts.issueDate ? opts.issueDate : i.dueDate,
  }));
  const costCenterId = await branchCostCenter(tx, session.tenant.id, draft.student.branchId);
  const taxCodes = await tx.taxCode.findMany({
    where: { id: { in: draft.lines.map((l) => l.taxCodeId).filter((x): x is string => Boolean(x)) } },
  });
  const keys = await accountIds(tx, ["DISCOUNTS", "DEFERRED_REVENUE"]);
  const number = await nextNumber(tx, session.tenant.id, "invoice");
  const invoice = await tx.invoice.create({
    data: {
      tenantId: session.tenant.id,
      number,
      status: draft.totalMinor === 0 ? "PAID" : "ISSUED",
      studentId: draft.student.id,
      guardianId: draft.guardian?.id ?? null,
      branchId: draft.student.branchId,
      academicYearId: draft.academicYear.id,
      costCenterId,
      issueDate,
      dueDate: dateOnly(installments[0]!.dueDate),
      subtotalMinor: draft.subtotalMinor,
      discountMinor: draft.discountMinor,
      taxMinor: draft.taxMinor,
      totalMinor: draft.totalMinor,
      source: opts.source,
      sourceId: opts.sourceId ?? null,
      batchId: opts.batchId ?? null,
      installmentPlanId: plan?.id ?? null,
      notes: opts.notes ?? null,
      createdById: session.user.id,
      updatedById: session.user.id,
      lines: {
        create: draft.lines.map((l, i) => ({
          tenantId: session.tenant.id,
          feeItemId: l.feeItemId,
          description: l.description,
          quantity: l.quantity,
          unitMinor: l.unitMinor,
          amountMinor: l.amountMinor,
          discountMinor: l.discountMinor,
          discountDetail: l.discounts as unknown as Prisma.InputJsonValue,
          taxCodeId: l.taxCodeId,
          taxRateBp: l.taxRateBp,
          taxMinor: l.taxMinor,
          totalMinor: l.totalMinor,
          revenueAccountId: l.revenueAccountId,
          receivableAccountId: l.receivableAccountId,
          deferred: l.deferred,
          serviceStart: l.deferred ? draft.academicYear.startDate : null,
          serviceEnd: l.deferred ? draft.academicYear.endDate : null,
          position: i,
        })),
      },
      installments: {
        create: installments.map((i) => ({
          tenantId: session.tenant.id,
          seq: i.seq,
          label: i.label,
          dueDate: dateOnly(i.dueDate),
          amountMinor: i.amountMinor,
        })),
      },
    },
  });
  if (draft.totalMinor > 0 || draft.discountMinor > 0) {
    const entry = await postEntry(tx, session, {
      date: issueDate,
      description: `فاتورة رقم ${number} — ${draft.student.fullName}`,
      source: "INVOICE",
      sourceType: "Invoice",
      sourceId: invoice.id,
      reference: String(number),
      academicYearId: draft.academicYear.id,
      lines: issueLines(
        draft,
        costCenterId,
        new Map(taxCodes.map((t) => [t.id, t.outputAccountId ?? ""])),
        keys.get("DISCOUNTS")!,
        keys.get("DEFERRED_REVENUE")!,
      ),
    });
    return tx.invoice.update({ where: { id: invoice.id }, data: { journalEntryId: entry.id } });
  }
  return invoice;
}

async function notifyInvoice(db: TenantDb, session: SessionData, invoiceId: string) {
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId },
    include: { student: { select: { id: true, fullName: true } } },
  });
  if (!inv || inv.totalMinor <= 0) return;
  await messageGuardians(
    db,
    session,
    inv.studentId,
    "invoice_issued",
    {
      number: inv.number,
      student: inv.student.fullName,
      amount: formatMoney(inv.totalMinor, { currency: session.tenant.currency }),
      dueDate: isoOf(inv.dueDate),
    },
    { link: `/finance/invoices/${inv.id}`, title: `فاتورة رقم ${inv.number}` },
  );
}

/** فاتورة فردية (من شاشة الطالب أو الفواتير) */
export async function createInvoice(
  db: TenantDb,
  session: SessionData,
  input: {
    studentId: string;
    lines?: DraftLine[];
    feeItemIds?: string[];
    planId?: string | null;
    issueDate: string;
    dueDate?: string | null;
    notes?: string | null;
    applyDiscounts?: boolean;
    notify?: boolean;
  },
) {
  requirePerm(session, "invoices", "create", "إصدار الفواتير من صلاحية المحاسبة");
  const inv = await db.$transaction(async (tx) => {
    const draft = await buildDraft(tx as unknown as Tx, {
      studentId: input.studentId,
      lines: input.lines,
      feeItemIds: input.feeItemIds,
      applyDiscounts: input.applyDiscounts,
      onDate: dateOnly(input.issueDate),
    });
    return issueDraft(tx as unknown as Tx, session, draft, {
      source: "MANUAL",
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      planId: input.planId,
      notes: input.notes,
    });
  });
  if (input.notify !== false) await notifyInvoice(db, session, inv.id);
  return inv;
}

export async function previewInvoice(
  db: TenantDb,
  session: SessionData,
  input: { studentId: string; lines?: DraftLine[]; feeItemIds?: string[]; applyDiscounts?: boolean },
) {
  requireStaff(session, "invoices", "create");
  return buildDraft(db, input);
}

// =====================================================================
// الفوترة الجماعية
// =====================================================================

export interface BulkInput {
  academicYearId: string;
  branchId?: string | null;
  gradeIds?: string[];
  sectionId?: string | null;
  feeItemIds: string[];
  planId: string | null;
  issueDate: string;
  applyDiscounts: boolean;
}

async function bulkTargets(db: TenantDb, input: BulkInput) {
  const students = await db.student.findMany({
    where: {
      academicYearId: input.academicYearId,
      status: "ACTIVE",
      deletedAt: null,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.gradeIds?.length ? { gradeId: { in: input.gradeIds } } : {}),
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    },
    select: {
      id: true,
      fullName: true,
      academicNumber: true,
      grade: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: [{ gradeId: "asc" }, { fullName: "asc" }],
  });
  // من سبقت فوترته بالبنود نفسها في العام (فاتورة غير ملغاة) يُتخطى
  const billed = await db.invoiceLine.findMany({
    where: {
      feeItemId: { in: input.feeItemIds },
      invoice: {
        academicYearId: input.academicYearId,
        status: { not: "CANCELLED" },
        studentId: { in: students.map((s) => s.id) },
        deletedAt: null,
      },
    },
    select: { feeItemId: true, invoice: { select: { studentId: true } } },
  });
  const done = new Set(billed.map((b) => `${b.invoice.studentId}|${b.feeItemId}`));
  return { students, done };
}

export async function bulkPreview(db: TenantDb, session: SessionData, input: BulkInput) {
  requirePerm(session, "invoices", "create");
  const { students, done } = await bulkTargets(db, input);
  const rows = [];
  for (const s of students) {
    const pending = input.feeItemIds.filter((f) => !done.has(`${s.id}|${f}`));
    if (!pending.length) {
      rows.push({
        studentId: s.id,
        name: s.fullName,
        academicNumber: s.academicNumber,
        grade: s.grade.name,
        section: s.section?.name ?? null,
        skipped: "مفوتر مسبقاً",
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        discounts: [] as string[],
      });
      continue;
    }
    const d = await buildDraft(db, {
      studentId: s.id,
      academicYearId: input.academicYearId,
      feeItemIds: pending,
      applyDiscounts: input.applyDiscounts,
      onDate: dateOnly(input.issueDate),
    });
    rows.push({
      studentId: s.id,
      name: s.fullName,
      academicNumber: s.academicNumber,
      grade: s.grade.name,
      section: s.section?.name ?? null,
      skipped: d.lines.length ? null : (d.warnings[0] ?? "لا بنود مطابقة في جدول الرسوم"),
      subtotal: d.subtotalMinor,
      discount: d.discountMinor,
      tax: d.taxMinor,
      total: d.totalMinor,
      discounts: [...new Set(d.lines.flatMap((l) => l.discounts.map((x) => x.name)))],
    });
  }
  const billable = rows.filter((r) => !r.skipped);
  return {
    rows,
    count: billable.length,
    skipped: rows.length - billable.length,
    subtotal: billable.reduce((s, r) => s + r.subtotal, 0),
    discount: billable.reduce((s, r) => s + r.discount, 0),
    tax: billable.reduce((s, r) => s + r.tax, 0),
    total: billable.reduce((s, r) => s + r.total, 0),
  };
}

export async function bulkIssue(
  db: TenantDb,
  session: SessionData,
  input: BulkInput & { description: string; notify: boolean },
) {
  requirePerm(session, "invoices", "create");
  const preview = await bulkPreview(db, session, input);
  if (!preview.count) throw badRequest("لا يوجد طلاب قابلون للفوترة بهذه المعايير");
  const batch = await db.invoiceBatch.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "invoice-batch"),
      academicYearId: input.academicYearId,
      description: input.description,
      scope: { ...input } as unknown as Prisma.InputJsonValue,
      count: 0,
      totalMinor: 0,
      createdById: session.user.id,
    },
  });
  let count = 0;
  let total = 0;
  const failures: Array<{ name: string; error: string }> = [];
  for (const row of preview.rows.filter((r) => !r.skipped)) {
    try {
      const inv = await db.$transaction(async (tx) => {
        const pendingItems = input.feeItemIds;
        const draft = await buildDraft(tx as unknown as Tx, {
          studentId: row.studentId,
          academicYearId: input.academicYearId,
          feeItemIds: pendingItems,
          applyDiscounts: input.applyDiscounts,
          onDate: dateOnly(input.issueDate),
        });
        const already = await tx.invoiceLine.findMany({
          where: {
            feeItemId: { in: pendingItems },
            invoice: {
              studentId: row.studentId,
              academicYearId: input.academicYearId,
              status: { not: "CANCELLED" },
              deletedAt: null,
            },
          },
          select: { feeItemId: true },
        });
        draft.lines = draft.lines.filter((l) => !already.some((a) => a.feeItemId === l.feeItemId));
        if (!draft.lines.length) return null;
        const recomputed = {
          ...draft,
          subtotalMinor: sum(draft.lines, "amountMinor"),
          discountMinor: sum(draft.lines, "discountMinor"),
          taxMinor: sum(draft.lines, "taxMinor"),
          totalMinor: sum(draft.lines, "totalMinor"),
        };
        return issueDraft(tx as unknown as Tx, session, recomputed, {
          source: "BULK",
          batchId: batch.id,
          issueDate: input.issueDate,
          planId: input.planId,
        });
      });
      if (inv) {
        count++;
        total += inv.totalMinor;
        if (input.notify) await notifyInvoice(db, session, inv.id);
      }
    } catch (e) {
      failures.push({ name: row.name, error: (e as Error).message });
    }
  }
  await db.invoiceBatch.update({ where: { id: batch.id }, data: { count, totalMinor: total } });
  return { batchId: batch.id, number: batch.number, count, total, failures };
}

const sum = <T extends Record<K, number>, K extends string>(rows: T[], k: K) =>
  rows.reduce((s, r) => s + r[k], 0);

// =====================================================================
// حالة الفاتورة
// =====================================================================

/** يعيد احتساب المدفوع وحالة الفاتورة وأقساطها من التخصيصات السارية */
export async function refreshInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findFirst({
    where: { id: invoiceId },
    include: { installments: { orderBy: { seq: "asc" } } },
  });
  if (!inv) return null;
  const allocs = await tx.receiptAllocation.findMany({ where: { invoiceId, reversedAt: null } });
  const paid = allocs.reduce((s, a) => s + a.amountMinor, 0);
  // المدفوع والمخفَّض يغطيان الأقساط بترتيب الاستحقاق
  let covered = paid + inv.creditedMinor;
  for (const i of inv.installments) {
    const p = Math.max(0, Math.min(i.amountMinor, covered));
    covered -= p;
    if (p !== i.paidMinor)
      await tx.invoiceInstallment.update({ where: { id: i.id }, data: { paidMinor: p } });
  }
  const balance = inv.totalMinor - paid - inv.creditedMinor;
  const status =
    inv.status === "CANCELLED" || inv.status === "DRAFT"
      ? inv.status
      : balance <= 0
        ? "PAID"
        : paid > 0 || inv.creditedMinor > 0
          ? "PARTIAL"
          : "ISSUED";
  return tx.invoice.update({ where: { id: invoiceId }, data: { paidMinor: paid, status } });
}

// =====================================================================
// الإلغاء والإشعارات الدائنة والمدينة
// =====================================================================

export async function cancelInvoice(db: TenantDb, session: SessionData, id: string, reason: string) {
  requirePerm(session, "invoices", "update", "إلغاء الفواتير من صلاحية المحاسبة");
  const where = await invoiceWhere(db, session, "update");
  const inv = await db.invoice.findFirst({ where: { ...where, id }, include: { lines: true } });
  if (!inv) throw notFound("الفاتورة غير موجودة");
  if (inv.status === "CANCELLED") throw badRequest("الفاتورة ملغاة مسبقاً");
  if (inv.paidMinor > 0 || inv.creditedMinor > 0)
    throw badRequest("على الفاتورة دفعات أو إشعارات؛ استخدم إشعاراً دائناً بالمتبقي");
  if (inv.lines.some((l) => l.recognizedMinor !== 0))
    throw badRequest("اعتُرف بجزء من إيرادها؛ استخدم إشعاراً دائناً");
  return db.$transaction(async (tx) => {
    const t = tx as unknown as Tx;
    if (inv.journalEntryId)
      await reverseEntry(t, session, inv.journalEntryId, {
        date: todayIso(session),
        reason: `إلغاء الفاتورة ${inv.number}: ${reason}`,
      });
    const cn = await tx.creditNote.create({
      data: {
        tenantId: session.tenant.id,
        number: await nextNumber(t, session.tenant.id, "credit-note"),
        invoiceId: inv.id,
        date: dateOnly(todayIso(session)),
        kind: "CANCELLATION",
        reason,
        amountMinor: inv.totalMinor - inv.taxMinor,
        taxMinor: inv.taxMinor,
        totalMinor: inv.totalMinor,
        createdById: session.user.id,
      },
    });
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: new Date(),
        updatedById: session.user.id,
      },
    });
    return cn;
  });
}

/**
 * إشعار دائن بمبلغ (شامل الضريبة) يوزَّع على سطور الفاتورة بنسب متبقيها:
 * مدين الإيراد/المؤجل (الصافي) والضريبة، ودائن الذمم (حتى الرصيد) والزائد رصيد دائن للأسرة.
 */
export async function issueCreditNote(
  tx: Tx,
  session: SessionData,
  input: {
    invoiceId: string;
    totalMinor: number;
    reason: string;
    kind: "ADJUSTMENT" | "PRORATION" | "DISCOUNT" | "CANCELLATION";
    date?: string;
    sourceType?: string;
    sourceId?: string;
  },
) {
  const inv = await tx.invoice.findFirst({
    where: { id: input.invoiceId },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!inv) throw notFound("الفاتورة غير موجودة");
  if (inv.status === "CANCELLED" || inv.status === "DRAFT")
    throw badRequest("لا إشعار دائن على فاتورة ملغاة أو مسودة");
  if (!Number.isSafeInteger(input.totalMinor) || input.totalMinor <= 0)
    throw badRequest("مبلغ الإشعار غير صالح");
  const creditable = inv.totalMinor - inv.creditedMinor;
  if (input.totalMinor > creditable) throw badRequest("مبلغ الإشعار يتجاوز قيمة الفاتورة غير المخفَّضة");
  const remaining = inv.lines.map((l) =>
    Math.max(0, l.totalMinor - l.creditedMinor - applyBp(l.creditedMinor, l.taxRateBp)),
  );
  const weights = remaining.some((r) => r > 0) ? remaining : inv.lines.map((l) => Math.max(1, l.totalMinor));
  const shares = allocateMinor(input.totalMinor, weights);
  const date = input.date ?? todayIso(session);
  const keys = await accountIds(tx, ["DEFERRED_REVENUE", "GUARDIAN_CREDIT"]);
  const taxCodes = await tx.taxCode.findMany({
    where: { id: { in: inv.lines.map((l) => l.taxCodeId).filter((x): x is string => Boolean(x)) } },
  });
  const balance = balanceOf(inv);
  const toAr = Math.min(balance, input.totalMinor);
  const toCredit = input.totalMinor - toAr;
  const party = { studentId: inv.studentId, guardianId: inv.guardianId, costCenterId: inv.costCenterId };
  const lines: PostLine[] = [];
  let netTotal = 0;
  let taxTotal = 0;
  const arShares = toAr > 0 ? allocateMinor(toAr, shares) : shares.map(() => 0);
  for (const [i, l] of inv.lines.entries()) {
    const share = shares[i]!;
    if (!share) continue;
    const { netMinor, taxMinor } = splitTaxInclusive(share, l.taxRateBp);
    netTotal += netMinor;
    taxTotal += taxMinor;
    lines.push({
      account: l.deferred ? keys.get("DEFERRED_REVENUE")! : l.revenueAccountId,
      debit: netMinor,
      costCenterId: inv.costCenterId,
      description: `إشعار دائن: ${l.description}`,
    });
    if (taxMinor) {
      const acc = taxCodes.find((t) => t.id === l.taxCodeId)?.outputAccountId;
      if (!acc) throw badRequest("رمز الضريبة بلا حساب مخرجات");
      lines.push({ account: acc, debit: taxMinor, costCenterId: inv.costCenterId });
    }
    if (arShares[i]) lines.push({ account: l.receivableAccountId, credit: arShares[i], ...party });
    await tx.invoiceLine.update({ where: { id: l.id }, data: { creditedMinor: l.creditedMinor + netMinor } });
  }
  if (toCredit)
    lines.push({
      account: keys.get("GUARDIAN_CREDIT")!,
      credit: toCredit,
      ...party,
      description: "رصيد دائن للأسرة",
    });
  const number = await nextNumber(tx, session.tenant.id, "credit-note");
  const cn = await tx.creditNote.create({
    data: {
      tenantId: session.tenant.id,
      number,
      invoiceId: inv.id,
      date: dateOnly(date),
      kind: input.kind,
      reason: input.reason,
      amountMinor: netTotal,
      taxMinor: taxTotal,
      totalMinor: input.totalMinor,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdById: session.user.id,
    },
  });
  const entry = await postEntry(tx, session, {
    date,
    description: `إشعار دائن ${number} على الفاتورة ${inv.number}: ${input.reason}`,
    source: "CREDIT_NOTE",
    sourceType: "CreditNote",
    sourceId: cn.id,
    reference: String(inv.number),
    academicYearId: inv.academicYearId,
    lines,
  });
  const saved = await tx.creditNote.update({ where: { id: cn.id }, data: { journalEntryId: entry.id } });
  await tx.invoice.update({
    where: { id: inv.id },
    data: { creditedMinor: inv.creditedMinor + toAr, updatedById: session.user.id },
  });
  if (toCredit && inv.guardianId) {
    await tx.guardianCredit.create({
      data: {
        tenantId: session.tenant.id,
        guardianId: inv.guardianId,
        studentId: inv.studentId,
        amountMinor: toCredit,
        source: "CREDIT_NOTE",
        sourceId: cn.id,
        note: input.reason,
        createdById: session.user.id,
      },
    });
  }
  await refreshInvoice(tx, inv.id);
  return saved;
}

export async function creditNote(
  db: TenantDb,
  session: SessionData,
  input: { invoiceId: string; totalMinor: number; reason: string; kind: "ADJUSTMENT" | "DISCOUNT" },
) {
  requirePerm(session, "invoices", "update", "الإشعارات الدائنة من صلاحية المحاسبة");
  const where = await invoiceWhere(db, session, "update");
  if (!(await db.invoice.findFirst({ where: { ...where, id: input.invoiceId } })))
    throw notFound("الفاتورة غير موجودة");
  return db.$transaction((tx) => issueCreditNote(tx as unknown as Tx, session, input));
}

/** إشعار مدين: فاتورة إضافية مرتبطة بالأصلية */
export async function debitNote(
  db: TenantDb,
  session: SessionData,
  input: { invoiceId: string; lines: DraftLine[]; reason: string },
) {
  requirePerm(session, "invoices", "create");
  const orig = await db.invoice.findFirst({ where: { id: input.invoiceId } });
  if (!orig) throw notFound("الفاتورة غير موجودة");
  return db.$transaction(async (tx) => {
    const draft = await buildDraft(tx as unknown as Tx, {
      studentId: orig.studentId,
      academicYearId: orig.academicYearId,
      lines: input.lines,
      applyDiscounts: false,
    });
    return issueDraft(tx as unknown as Tx, session, draft, {
      source: "DEBIT_NOTE",
      sourceId: orig.id,
      issueDate: todayIso(session),
      notes: `إشعار مدين على الفاتورة ${orig.number}: ${input.reason}`,
    });
  });
}

// =====================================================================
// غرامات التأخير
// =====================================================================

export async function applyLateFees(db: TenantDb, session: SessionData, asOfIso?: string) {
  requirePerm(session, "invoices", "create");
  const asOf = dateOnly(asOfIso ?? todayIso(session));
  const plans = await db.installmentPlan.findMany({ where: { lateFeeKind: { not: "NONE" } } });
  const lateItem = await db.feeItem.findFirst({ where: { kind: "LATE_FEE", isActive: true } });
  if (!lateItem) throw badRequest("أضف بند «غرامة تأخير» في إعداد الرسوم");
  let created = 0;
  for (const plan of plans) {
    const cutoff = new Date(asOf.getTime() - plan.graceDays * 86_400_000);
    const due = await db.invoiceInstallment.findMany({
      where: {
        lateFeeInvoiceId: null,
        dueDate: { lt: cutoff },
        invoice: { installmentPlanId: plan.id, status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null },
      },
      include: { invoice: { select: { id: true, number: true, studentId: true, academicYearId: true } } },
    });
    for (const i of due) {
      const unpaid = i.amountMinor - i.paidMinor;
      if (unpaid <= 0) continue;
      const fee = plan.lateFeeKind === "PERCENT" ? applyBp(unpaid, plan.lateFeeValue) : plan.lateFeeValue;
      if (fee <= 0) continue;
      await db.$transaction(async (tx) => {
        const draft = await buildDraft(tx as unknown as Tx, {
          studentId: i.invoice.studentId,
          academicYearId: i.invoice.academicYearId,
          lines: [
            {
              feeItemId: lateItem.id,
              description: `غرامة تأخير ${i.label} — الفاتورة ${i.invoice.number}`,
              unitMinor: fee,
            },
          ],
          applyDiscounts: false,
        });
        const inv = await issueDraft(tx as unknown as Tx, session, draft, {
          source: "LATE_FEE",
          sourceId: i.invoice.id,
          issueDate: isoOf(asOf)!,
          dueDate: isoOf(new Date(asOf.getTime() + 7 * 86_400_000)),
        });
        await tx.invoiceInstallment.update({ where: { id: i.id }, data: { lateFeeInvoiceId: inv.id } });
      });
      created++;
    }
  }
  return { created };
}

// =====================================================================
// الربط مع الوحدات الأخرى
// =====================================================================

/** قبول طالب ← فاتورة رسوم التسجيل (إن وُجد بند تسجيل في جدول صفه) */
export async function onAdmissionAccepted(
  db: TenantDb,
  session: SessionData,
  input: { studentId: string; admissionId: string },
) {
  const regItems = await db.feeItem.findMany({
    where: { kind: "REGISTRATION", isActive: true },
    select: { id: true },
  });
  if (!regItems.length) return null;
  const settings = financeSettings(session);
  try {
    const inv = await db.$transaction(async (tx) => {
      const draft = await buildDraft(tx as unknown as Tx, {
        studentId: input.studentId,
        feeItemIds: regItems.map((r) => r.id),
      });
      if (!draft.lines.length) return null;
      const today = todayIso(session);
      return issueDraft(tx as unknown as Tx, session, draft, {
        source: "ADMISSION",
        sourceId: input.admissionId,
        issueDate: today,
        dueDate: isoOf(new Date(dateOnly(today).getTime() + settings.registrationDueDays * 86_400_000)),
      });
    });
    if (inv) await notifyInvoice(db, session, inv.id);
    return inv;
  } catch (e) {
    // لا يُفشل القبول إن تعذرت الفوترة (مثلاً لا فترة مالية)؛ تُسجَّل الملاحظة للمحاسبة
    console.error("[billing] تعذر إصدار فاتورة التسجيل:", (e as Error).message);
    return null;
  }
}

/** تسجيل في نشاط برسم ← فاتورة الرسم */
export async function onActivityRegistered(db: TenantDb, session: SessionData, registrationId: string) {
  const reg = await db.activityRegistration.findFirst({
    where: { id: registrationId },
    include: { activity: true },
  });
  if (!reg || reg.invoiceId || !reg.activity.feeMinor || reg.status !== "REGISTERED") return null;
  const item = await db.feeItem.findFirst({ where: { kind: "ACTIVITY", isActive: true } });
  if (!item) return null;
  try {
    const inv = await db.$transaction(async (tx) => {
      const draft = await buildDraft(tx as unknown as Tx, {
        studentId: reg.studentId,
        lines: [
          {
            feeItemId: item.id,
            description: `${item.name}: ${reg.activity.title}`,
            unitMinor: reg.activity.feeMinor!,
          },
        ],
        applyDiscounts: false,
      });
      const today = todayIso(session);
      const due =
        reg.activity.startAt && reg.activity.startAt > new Date() ? isoOf(reg.activity.startAt)! : today;
      const i = await issueDraft(tx as unknown as Tx, session, draft, {
        source: "ACTIVITY",
        sourceId: reg.activityId,
        issueDate: today,
        dueDate: due,
      });
      await tx.activityRegistration.update({ where: { id: reg.id }, data: { invoiceId: i.id } });
      return i;
    });
    return inv;
  } catch (e) {
    console.error("[billing] تعذر إصدار فاتورة النشاط:", (e as Error).message);
    return null;
  }
}

/** إلغاء التسجيل في نشاط ← إلغاء الفاتورة إن لم تُسدَّد، أو إشعار دائن (يتحول لرصيد للأسرة) */
export async function onActivityRegistrationCancelled(
  db: TenantDb,
  session: SessionData,
  registrationId: string,
) {
  const reg = await db.activityRegistration.findFirst({ where: { id: registrationId } });
  if (!reg?.invoiceId) return;
  const inv = await db.invoice.findFirst({ where: { id: reg.invoiceId } });
  if (!inv || inv.status === "CANCELLED") return;
  if (inv.paidMinor === 0 && inv.creditedMinor === 0) {
    await db.$transaction(async (tx) => {
      if (inv.journalEntryId)
        await reverseEntry(tx as unknown as Tx, session, inv.journalEntryId, {
          reason: "إلغاء التسجيل في النشاط",
        });
      await tx.creditNote.create({
        data: {
          tenantId: session.tenant.id,
          number: await nextNumber(tx as unknown as Tx, session.tenant.id, "credit-note"),
          invoiceId: inv.id,
          date: dateOnly(todayIso(session)),
          kind: "CANCELLATION",
          reason: "إلغاء التسجيل في النشاط",
          amountMinor: inv.totalMinor - inv.taxMinor,
          taxMinor: inv.taxMinor,
          totalMinor: inv.totalMinor,
          createdById: session.user.id,
        },
      });
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: "CANCELLED", cancelReason: "إلغاء التسجيل في النشاط", cancelledAt: new Date() },
      });
    });
  } else {
    const creditable = inv.totalMinor - inv.creditedMinor;
    if (creditable > 0)
      await db.$transaction((tx) =>
        issueCreditNote(tx as unknown as Tx, session, {
          invoiceId: inv.id,
          totalMinor: creditable,
          reason: "إلغاء التسجيل في النشاط",
          kind: "CANCELLATION",
          sourceType: "ActivityRegistration",
          sourceId: reg.id,
        }),
      );
  }
}

/** رصيد الطالب المستحق (فواتير صادرة غير مسددة) */
export async function studentOutstanding(db: TenantDb | Tx, studentId: string) {
  const invs = await db.invoice.findMany({
    where: { studentId, status: { in: ["ISSUED", "PARTIAL"] }, deletedAt: null },
    select: { totalMinor: true, paidMinor: true, creditedMinor: true },
  });
  return invs.reduce((s, i) => s + balanceOf(i), 0);
}

/** التسوية المالية عند الانسحاب/النقل: المستحق، وإشعار دائن تناسبي مقترح للرسوم الدراسية غير المستهلكة */
export async function withdrawalSettlement(
  db: TenantDb,
  session: SessionData,
  studentId: string,
  effectiveIso: string,
) {
  requireStaff(session, "invoices", "view");
  const effective = dateOnly(effectiveIso);
  const invoices = await db.invoice.findMany({
    where: { studentId, status: { in: ["ISSUED", "PARTIAL", "PAID"] }, deletedAt: null },
    include: { lines: true },
  });
  const items = await db.feeItem.findMany({ select: { id: true, refundable: true } });
  const proposals: Array<{
    invoiceId: string;
    number: number | null;
    description: string;
    months: number;
    totalMonths: number;
    creditMinor: number;
  }> = [];
  for (const inv of invoices) {
    for (const l of inv.lines) {
      if (!l.deferred || !l.serviceStart || !l.serviceEnd) continue;
      if (l.feeItemId && !items.find((i) => i.id === l.feeItemId)?.refundable) continue;
      const total =
        (l.serviceEnd.getUTCFullYear() - l.serviceStart.getUTCFullYear()) * 12 +
        l.serviceEnd.getUTCMonth() -
        l.serviceStart.getUTCMonth() +
        1;
      const unused = unusedMonths(l.serviceStart, l.serviceEnd, effective);
      if (!unused) continue;
      // الجزء غير المستهلك من صافي السطر (بعد الخصم والإشعارات) شاملاً الضريبة
      const net = l.amountMinor - l.discountMinor - l.creditedMinor;
      const unusedNet =
        net - recognizedToDate(net, l.serviceStart, l.serviceEnd, new Date(effective.getTime()));
      const credit = unusedNet + applyBp(unusedNet, l.taxRateBp);
      if (credit > 0)
        proposals.push({
          invoiceId: inv.id,
          number: inv.number,
          description: l.description,
          months: unused,
          totalMonths: total,
          creditMinor: Math.min(credit, inv.totalMinor - inv.creditedMinor),
        });
    }
  }
  const outstanding = await studentOutstanding(db, studentId);
  const credited = await db.creditNote.findMany({
    where: { kind: "PRORATION", invoice: { studentId } },
    select: { id: true },
  });
  return {
    outstanding,
    proposals,
    alreadyProrated: credited.length > 0,
    totalCredit: proposals.reduce((s, p) => s + p.creditMinor, 0),
  };
}

export async function applyWithdrawalSettlement(
  db: TenantDb,
  session: SessionData,
  input: { studentId: string; effectiveDate: string; transferId?: string | null },
) {
  requirePerm(session, "invoices", "update", "التسوية التناسبية من صلاحية المحاسبة");
  const s = await withdrawalSettlement(db, session, input.studentId, input.effectiveDate);
  if (s.alreadyProrated) throw badRequest("أُصدرت التسوية التناسبية مسبقاً لهذا الطالب");
  if (!s.proposals.length) throw badRequest("لا رسوم غير مستهلكة قابلة للاسترداد");
  let count = 0;
  for (const p of s.proposals) {
    await db.$transaction((tx) =>
      issueCreditNote(tx as unknown as Tx, session, {
        invoiceId: p.invoiceId,
        totalMinor: p.creditMinor,
        reason: `تسوية تناسبية للانسحاب: ${p.months} من ${p.totalMonths} أشهر غير مستهلكة`,
        kind: "PRORATION",
        sourceType: input.transferId ? "Transfer" : undefined,
        sourceId: input.transferId ?? undefined,
      }),
    );
    count++;
  }
  return { count, total: s.totalCredit };
}

// =====================================================================
// العرض
// =====================================================================

export async function getInvoice(db: TenantDb, session: SessionData, id: string) {
  const where = await invoiceWhere(db, session, "view");
  const inv = await db.invoice.findFirst({
    where: { ...where, id },
    include: {
      lines: { orderBy: { position: "asc" } },
      installments: { orderBy: { seq: "asc" } },
      allocations: {
        where: { reversedAt: null },
        include: { receipt: { select: { id: true, number: true, date: true, method: true, status: true } } },
      },
      creditNotes: { orderBy: { createdAt: "asc" } },
      student: {
        select: {
          id: true,
          fullName: true,
          academicNumber: true,
          nationality: true,
          grade: { select: { name: true } },
          section: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
      guardian: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!inv) throw notFound("الفاتورة غير موجودة أو خارج نطاق صلاحيتك");
  const [year, taxCodes, entry, settings, lateFees] = await Promise.all([
    db.academicYear.findFirst({ where: { id: inv.academicYearId }, select: { name: true } }),
    db.taxCode.findMany({ select: { id: true, name: true, rateBp: true } }),
    inv.journalEntryId
      ? db.journalEntry.findFirst({ where: { id: inv.journalEntryId }, select: { id: true, number: true } })
      : null,
    Promise.resolve(financeSettings(session)),
    db.invoice.findMany({
      where: { source: "LATE_FEE", sourceId: inv.id },
      select: { id: true, number: true, totalMinor: true, status: true },
    }),
  ]);
  const today = dateOnly(todayIso(session));
  return {
    ...inv,
    displayStatus: displayStatus(inv, today),
    balanceMinor: balanceOf(inv),
    academicYear: year?.name ?? "",
    taxNames: Object.fromEntries(taxCodes.map((t) => [t.id, t.name])),
    journalEntry: entry,
    lateFees,
    seller: {
      name: settings.legalName || session.tenant.name,
      vatNumber: settings.vatNumber,
      crNumber: settings.crNumber,
      address: settings.address,
    },
    permissions: {
      canEdit: Boolean(requirePermSafe(session, "invoices", "update")),
      canCollect: Boolean(requirePermSafe(session, "collections", "update")) || hasCreate(session),
    },
  };
}

function hasCreate(session: SessionData) {
  try {
    requirePerm(session, "collections", "create");
    return true;
  } catch {
    return false;
  }
}

export { toDate };
