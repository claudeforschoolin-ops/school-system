/**
 * بذور المرحلة ٣ (المالية): تمر عبر خدمات المالية نفسها لتكون كل القيود من المحرك لا مكتوبة يدوياً.
 * - إعدادات المنشأة، الحسابات البنكية، جداول الرسوم لكل مرحلة، خصومات ممنوحة (ومنها بانتظار الاعتماد)
 * - أرصدة افتتاحية ١ يناير وملخصات شهرية يناير–يوليو من «النظام السابق» ثم إقفال تلك الفترات
 * - فوترة جماعية للعام الحالي، فواتير نقل وأنشطة، سندات قبض بكل الطرق مع ورديات صندوق
 * - شيكات (محصلة ومرتدة ومعلقة)، دفعات زائدة واسترداد بموافقة، إشعارات دائنة، فاتورة ملغاة
 * - سندات صرف (ومنها فوق الحد بموافقة وأخرى معلقة)، كشف بنك مستورد ومطابقة، تحويلات
 * - الاعتراف بإيراد أغسطس وإقفاله
 * كل الأسماء والهويات والجوالات وهمية.
 */
import "dotenv/config";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb, type TenantDb } from "../../src/server/db/tenant";
import { createSession, validateSessionToken, type SessionData } from "../../src/server/auth/session";
import { decideApproval } from "../../src/server/services/approval.service";
import { ensureSystemDatabase } from "../../src/server/services/system-db.service";
import * as accounting from "../../src/server/services/finance/accounting.service";
import * as banking from "../../src/server/services/finance/banking.service";
import * as billing from "../../src/server/services/finance/billing.service";
import * as collections from "../../src/server/services/finance/collections.service";
import { postEntry, type Tx } from "../../src/server/services/finance/ledger";
import { minorToDecimalString } from "../../src/lib/money";
import { rng, type Rng } from "./data/students-data";

/** ريالات صحيحة → هللات */
const SAR = (riyals: number) => {
  if (!Number.isInteger(riyals)) throw new Error("المبالغ في البذور بالريال الصحيح");
  return riyals * 100;
};
function shuffle<T>(r: Rng, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * 86_400_000));

interface Actor {
  session: SessionData;
  db: TenantDb;
  sessionId: string;
}

async function actor(tenantId: string, email: string): Promise<Actor> {
  const user = await rootDb.user.findFirstOrThrow({ where: { email } });
  const { token, sessionId } = await createSession({ tenantId, userId: user.id, twoFactorVerified: true, ip: null, userAgent: "seed" });
  const session = await validateSessionToken(token);
  if (!session) throw new Error(`تعذرت جلسة ${email}`);
  return { session, db: createTenantDb({ tenantId, actor: { id: user.id, name: user.name }, ip: null, userAgent: "seed" }), sessionId };
}

async function post(a: Actor, input: Parameters<typeof postEntry>[2]) {
  return a.db.$transaction((tx) => postEntry(tx as unknown as Tx, a.session, input));
}

export async function seedPhase3(tenantId: string) {
  const r = rng(3303);
  const acc = await actor(tenantId, "accountant@demo.manassa.sa");
  const cashier = await actor(tenantId, "cashier@demo.manassa.sa");
  const principal = await actor(tenantId, "principal@demo.manassa.sa");
  const db = acc.db;

  // -------------------------------------------------------------------
  // الإعدادات والحسابات البنكية ومراكز التكلفة
  // -------------------------------------------------------------------
  const tenant = await rootDb.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  await rootDb.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...settings,
        finance: {
          ...((settings.finance as object) ?? {}),
          legalName: "شركة منصة للخدمات التعليمية (مدارس منصة الأهلية)",
          vatNumber: "310000000000003",
          crNumber: "1010000000",
          address: "الرياض — حي النرجس — طريق أنس بن مالك",
          voucherApprovalLimitMinor: SAR(5000),
          collectionTargetBp: 9000,
        },
      },
    },
  });
  // الجلسات تقرأ الإعدادات عند إنشائها؛ نعيد إنشاءها بعد التحديث
  Object.assign(acc, await actor(tenantId, "accountant@demo.manassa.sa"));
  Object.assign(cashier, await actor(tenantId, "cashier@demo.manassa.sa"));
  Object.assign(principal, await actor(tenantId, "principal@demo.manassa.sa"));

  const account = async (code: string) => (await rootDb.account.findFirstOrThrow({ where: { tenantId, code } })).id;
  const collectionBank = await banking.saveBankAccount(acc.db, acc.session, null, { name: "حساب التحصيل", bankName: "مصرف الراجحي", iban: "SA0380000000608010167519", accountId: await account("1112"), isActive: true });
  const currentBank = await banking.saveBankAccount(acc.db, acc.session, null, { name: "الحساب الجاري", bankName: "البنك الأهلي السعودي", iban: "SA4410000000123456789012", accountId: await account("1111"), isActive: true });

  const stages = await rootDb.stage.findMany({ where: { tenantId, deletedAt: null }, orderBy: { order: "asc" } });
  for (const s of stages) {
    if (!(await rootDb.costCenter.findFirst({ where: { tenantId, stageId: s.id } }))) await rootDb.costCenter.create({ data: { tenantId, code: `ST-${s.code}`, name: s.name, kind: "STAGE", stageId: s.id } });
  }

  // -------------------------------------------------------------------
  // جداول الرسوم للعام الحالي
  // -------------------------------------------------------------------
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const items = Object.fromEntries((await rootDb.feeItem.findMany({ where: { tenantId } })).map((i) => [i.code, i]));
  const plans = await rootDb.installmentPlan.findMany({ where: { tenantId } });
  const termly = plans.find((p) => p.kind === "TERMLY")!;
  const FEES: Record<string, { tuition: number; books: number; registration: number; transport: number; uniform: number }> = {
    PRI: { tuition: 18000, books: 800, registration: 1500, transport: 3500, uniform: 450 },
    INT: { tuition: 21000, books: 950, registration: 1500, transport: 3800, uniform: 480 },
    SEC: { tuition: 24000, books: 1100, registration: 1500, transport: 4000, uniform: 520 },
  };
  for (const s of stages) {
    const f = FEES[s.code] ?? FEES.PRI!;
    await billing.saveSchedule(acc.db, acc.session, null, {
      academicYearId: year.id,
      name: `رسوم ${s.name}`,
      branchId: null,
      stageId: s.id,
      gradeId: null,
      isActive: true,
      lines: [
        { feeItemId: items.TUITION!.id, amountMinor: SAR(f.tuition), optional: false },
        { feeItemId: items.BOOKS!.id, amountMinor: SAR(f.books), optional: false },
        { feeItemId: items.REGISTRATION!.id, amountMinor: SAR(f.registration), optional: true },
        { feeItemId: items.TRANSPORT!.id, amountMinor: SAR(f.transport), optional: true },
        { feeItemId: items.UNIFORM!.id, amountMinor: SAR(f.uniform), optional: true },
      ],
    });
  }

  // -------------------------------------------------------------------
  // أرصدة افتتاحية وملخصات يناير–يوليو (العام المالي ٢٠٢٦)
  // -------------------------------------------------------------------
  const fy = new Date().getUTCFullYear();
  const opening: Array<[string, number, number]> = [
    ["1101", SAR(38500), 0],
    ["1111", SAR(3850000), 0],
    ["1112", SAR(1386200), 0],
    ["1201", SAR(2900000), 0],
    ["1502", SAR(8500000), 0],
    ["1503", SAR(640000), 0],
    ["1504", SAR(285000), 0],
    ["1505", SAR(1120000), 0],
    ["1590", 0, SAR(2150000)],
    ["2101", 0, SAR(96300)],
    ["2601", 0, SAR(842000)],
    ["2201", 0, SAR(4140000)],
    ["3101", 0, SAR(4000000)],
    ["3301", 0, SAR(7491400)],
  ];
  await post(acc, {
    date: `${fy}-01-01`,
    description: "الأرصدة الافتتاحية للعام المالي (منقولة من النظام السابق)",
    source: "OPENING",
    reference: "OB-" + fy,
    lines: await Promise.all(opening.map(async ([code, debit, credit]) => ({ account: await account(code), debit, credit }))),
  });

  const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر"];
  const monthEnd = (m: number) => iso(new Date(Date.UTC(fy, m + 1, 0)));
  for (let m = 0; m < 7; m++) {
    const date = monthEnd(m);
    const name = MONTH_NAMES[m]!;
    if (m < 6) {
      await accounting.createManualEntry(acc.db, acc.session, {
        date,
        description: `الاعتراف بإيراد الرسوم الدراسية لشهر ${name} (العام الدراسي السابق)`,
        reference: `REC-${m + 1}`,
        lines: [
          { accountId: await account("2201"), debit: SAR(690000), credit: 0 },
          { accountId: await account("4101"), debit: 0, credit: SAR(290000) },
          { accountId: await account("4102"), debit: 0, credit: SAR(215000) },
          { accountId: await account("4103"), debit: 0, credit: SAR(185000) },
        ],
      });
    }
    if (m === 0 || m === 1) {
      const amount = m === 0 ? SAR(2100000) : SAR(800000);
      await accounting.createManualEntry(acc.db, acc.session, {
        date: `${fy}-0${m + 1}-${m === 0 ? "28" : "25"}`,
        description: `تحصيل أقساط الفصل الثاني للعام السابق — ${name} (ملخص)`,
        reference: `COL-${m + 1}`,
        lines: [
          { accountId: await account("1112"), debit: amount, credit: 0 },
          { accountId: await account("1201"), debit: 0, credit: amount },
        ],
      });
    }
    const jitter = (base: number) => SAR(base + r.int(-4, 4) * 500);
    const academic = SAR(290000);
    const admin = SAR(72000);
    const services = SAR(28000);
    const gosi = SAR(31000);
    await accounting.createManualEntry(acc.db, acc.session, {
      date,
      description: `رواتب شهر ${name} — قيد إجمالي (تفصيل الرواتب في وحدة الموارد البشرية)`,
      reference: `PAY-${m + 1}`,
      lines: [
        { accountId: await account("6101"), debit: academic, credit: 0 },
        { accountId: await account("6102"), debit: admin, credit: 0 },
        { accountId: await account("6103"), debit: services, credit: 0 },
        { accountId: await account("6301"), debit: gosi, credit: 0 },
        { accountId: await account("1111"), debit: 0, credit: academic + admin + services + gosi },
      ],
    });
    const elec = jitter(m >= 4 ? 36000 : 24000);
    const water = jitter(6200);
    const net = SAR(4800);
    const fuel = jitter(m === 6 ? 4000 : 14000);
    const maint = jitter(11000);
    const supplies = jitter(m === 6 ? 2000 : 9000);
    await accounting.createManualEntry(acc.db, acc.session, {
      date,
      description: `مصروفات تشغيلية لشهر ${name} (ملخص من النظام السابق)`,
      reference: `OPX-${m + 1}`,
      lines: [
        { accountId: await account("6501"), debit: elec, credit: 0 },
        { accountId: await account("6502"), debit: water, credit: 0 },
        { accountId: await account("6503"), debit: net, credit: 0 },
        { accountId: await account("6701"), debit: fuel, credit: 0 },
        { accountId: await account("6601"), debit: maint, credit: 0 },
        { accountId: await account("6801"), debit: supplies, credit: 0 },
        { accountId: await account("1111"), debit: 0, credit: elec + water + net + fuel + maint + supplies },
      ],
    });
  }
  await banking.transferFunds(acc.db, acc.session, { fromAccountId: await account("1112"), toAccountId: await account("1111"), amountMinor: SAR(2500000), date: `${fy}-03-02`, description: "تحويل متحصلات الفصل الثاني إلى الحساب الجاري" });
  await banking.transferFunds(acc.db, acc.session, { fromAccountId: await account("1112"), toAccountId: await account("1111"), amountMinor: SAR(1200000), date: `${fy}-05-03`, description: "تغذية الحساب الجاري لرواتب الصيف" });
  const periods = await rootDb.fiscalPeriod.findMany({ where: { tenantId }, orderBy: { startDate: "asc" } });
  for (const p of periods.slice(0, 7)) await accounting.closePeriod(acc.db, acc.session, p.id, true);

  // -------------------------------------------------------------------
  // الخصومات الممنوحة (قبل الفوترة لتُطبق)
  // -------------------------------------------------------------------
  const students = await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE", deletedAt: null }, orderBy: { academicNumber: "asc" }, select: { id: true, fullName: true, nationality: true, gradeId: true } });
  const types = Object.fromEntries((await rootDb.discountType.findMany({ where: { tenantId } })).map((t) => [t.code, t]));
  const pickStudents = (n: number, skip: Set<string>) => {
    const out: typeof students = [];
    while (out.length < n) {
      const s = r.pick(students);
      if (!skip.has(s.id)) (out.push(s), skip.add(s.id));
    }
    return out;
  };
  const discounted = new Set<string>();
  for (const s of pickStudents(3, discounted)) await billing.grantStudentDiscount(acc.db, acc.session, { studentId: s.id, discountTypeId: types.STAFF!.id, valueOverride: null, note: "ابن/ابنة معلم في المدرسة" });
  for (const s of pickStudents(6, discounted)) await billing.grantStudentDiscount(acc.db, acc.session, { studentId: s.id, discountTypeId: types.MERIT!.id, valueOverride: null, note: "تفوق دراسي بنسبة ٩٨٪ في العام السابق" });
  const [sch1, sch2] = pickStudents(2, discounted);
  const g1 = await billing.grantStudentDiscount(acc.db, acc.session, { studentId: sch1!.id, discountTypeId: types.SCHOLARSHIP!.id, valueOverride: null, note: "منحة كاملة — ظروف أسرية (بقرار لجنة المنح)" });
  if (g1.approvalRequestId) await decideApproval(principal.db, principal.session, { requestId: g1.approvalRequestId, decision: "APPROVED", comment: "موافقة وفق محضر لجنة المنح" });
  await billing.grantStudentDiscount(acc.db, acc.session, { studentId: sch2!.id, discountTypeId: types.SCHOLARSHIP!.id, valueOverride: 5000, note: "طلب منحة جزئية ٥٠٪ — بانتظار قرار المدير" });

  // -------------------------------------------------------------------
  // الفوترة الجماعية ثم النقل والأنشطة
  // -------------------------------------------------------------------
  const issueDate = addDays(iso(year.startDate), -3);
  const bulk = await billing.bulkIssue(acc.db, acc.session, { academicYearId: year.id, feeItemIds: [items.TUITION!.id, items.BOOKS!.id], planId: termly.id, issueDate, applyDiscounts: true, description: `رسوم العام الدراسي ${year.name}`, notify: false });
  const transportKids = shuffle(r, students).slice(0, 36);
  for (const s of transportKids) {
    await billing.createInvoice(acc.db, acc.session, { studentId: s.id, feeItemIds: [items.TRANSPORT!.id], planId: termly.id, issueDate: addDays(issueDate, r.int(2, 8)), notify: false });
  }
  const regs = await rootDb.activityRegistration.findMany({ where: { tenantId, status: "REGISTERED", activity: { feeMinor: { gt: 0 } } }, select: { id: true } });
  for (const reg of regs) await billing.onActivityRegistered(acc.db, acc.session, reg.id);

  // فاتورة صدرت بالخطأ ثم أُلغيت
  const wrong = await billing.createInvoice(acc.db, acc.session, { studentId: students[5]!.id, feeItemIds: [items.UNIFORM!.id], issueDate: addDays(issueDate, 5), notify: false });
  await billing.cancelInvoice(acc.db, acc.session, wrong.id, "صدرت بالخطأ؛ الطالب استلم الزي من العام السابق");

  // -------------------------------------------------------------------
  // التحصيل: سندات بكل الطرق عبر الأسابيع الستة الماضية
  // -------------------------------------------------------------------
  const openInv = await rootDb.invoice.findMany({ where: { tenantId, status: { in: ["ISSUED", "PARTIAL"] } }, select: { guardianId: true, totalMinor: true, paidMinor: true, creditedMinor: true } });
  const dueByGuardian = new Map<string, number>();
  for (const i of openInv) if (i.guardianId) dueByGuardian.set(i.guardianId, (dueByGuardian.get(i.guardianId) ?? 0) + i.totalMinor - i.paidMinor - i.creditedMinor);
  const parentUser = await rootDb.user.findFirst({ where: { email: "parent@demo.manassa.sa" } });
  const parentGuardian = parentUser ? await rootDb.guardian.findFirst({ where: { tenantId, userId: parentUser.id } }) : null;

  type Plan = { guardianId: string; amount: number; method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "SADAD"; date: string };
  const today = iso(new Date());
  const firstPay = addDays(issueDate, 1);
  const span = Math.max(1, Math.round((new Date(today).getTime() - new Date(firstPay).getTime()) / 86_400_000) - 1);
  const payments: Plan[] = [];
  const overpayers: string[] = [];
  for (const [guardianId, due] of dueByGuardian) {
    const roll = r.next();
    let amount = 0;
    if (guardianId === parentGuardian?.id) amount = Math.floor(due / 2);
    else if (roll < 0.14) amount = due; // سداد كامل
    else if (roll < 0.58) amount = Math.floor(due / 2); // القسط الأول
    else if (roll < 0.72) amount = SAR(r.int(10, 60) * 100); // جزئي
    else if (roll < 0.76) {
      amount = due + SAR(r.pick([500, 750, 1000]));
      overpayers.push(guardianId);
    } // دفعة زائدة
    if (amount <= 0) continue; // الباقي لم يسدد بعد (متأخر)
    amount = Math.min(amount, due + SAR(1000));
    const m = r.next();
    const method = m < 0.38 ? "BANK_TRANSFER" : m < 0.58 ? "SADAD" : m < 0.73 ? "CARD" : m < 0.9 ? "CASH" : "CHEQUE";
    const early = r.chance(0.55);
    const date = addDays(firstPay, early ? r.int(0, Math.min(10, span)) : r.int(0, span));
    payments.push({ guardianId, amount, method, date });
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));

  // النقد عبر ورديات أمين الصندوق: وردية لكل يوم تحصيل نقدي
  const byDay = new Map<string, Plan[]>();
  for (const p of payments.filter((x) => x.method === "CASH")) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const refs = new Map<string, number>();
  const nextRef = (prefix: string) => {
    const n = (refs.get(prefix) ?? 0) + 1;
    refs.set(prefix, n);
    return `${prefix}${String(740000 + n * 37).padStart(7, "0")}`;
  };
  const CHEQUE_BANKS = ["مصرف الراجحي", "البنك الأهلي السعودي", "بنك الرياض", "البنك السعودي الفرنسي", "مصرف الإنماء", "البنك العربي الوطني"];
  const created: Array<{ id: string; method: string; amount: number; date: string; reference: string | null }> = [];
  for (const p of payments.filter((x) => x.method !== "CASH")) {
    const isCheque = p.method === "CHEQUE";
    const who = p.method === "CARD" ? cashier : acc;
    const rec = await collections.createReceipt(who.db, who.session, {
      guardianId: p.guardianId,
      amountMinor: p.amount,
      method: p.method,
      date: p.date,
      reference: p.method === "BANK_TRANSFER" ? nextRef("TRX") : p.method === "SADAD" ? nextRef("SDD") : p.method === "CARD" ? nextRef("POS") : null,
      chequeNumber: isCheque ? String(r.int(100000, 999999)) : null,
      chequeBank: isCheque ? r.pick(CHEQUE_BANKS) : null,
      chequeDate: isCheque ? addDays(p.date, r.int(0, 20)) : null,
      notify: false,
    });
    created.push({ id: rec.id, method: p.method, amount: p.amount, date: p.date, reference: rec.reference });
  }
  const cashDays = [...byDay.keys()].sort();
  for (const [idx, day] of cashDays.entries()) {
    const isToday = day === today;
    const s = await collections.openCashSession(cashier.db, cashier.session, { openingFloatMinor: SAR(500) });
    for (const p of byDay.get(day)!) {
      const rec = await collections.createReceipt(cashier.db, cashier.session, { guardianId: p.guardianId, amountMinor: p.amount, method: "CASH", date: p.date, notify: false });
      created.push({ id: rec.id, method: "CASH", amount: p.amount, date: p.date, reference: null });
    }
    if (!isToday) {
      const cur = await collections.currentCashSession(cashier.db, cashier.session);
      const short = idx === cashDays.length - 2 ? SAR(20) : 0;
      await collections.closeCashSession(cashier.db, cashier.session, { countedMinor: cur.open!.expectedMinor - short, note: short ? "عجز بسيط — ورقة نقدية ناقصة عند العد" : null });
      await rootDb.cashSession.update({ where: { id: s.id }, data: { openedAt: new Date(`${day}T04:30:00Z`), closedAt: new Date(`${day}T10:45:00Z`) } });
    }
  }
  // وردية اليوم مفتوحة بسندات قليلة
  if (!(await collections.currentCashSession(cashier.db, cashier.session)).open) await collections.openCashSession(cashier.db, cashier.session, { openingFloatMinor: SAR(500) });
  const unpaidFamilies = [...dueByGuardian.keys()].filter((g) => !payments.some((p) => p.guardianId === g));
  for (const g of unpaidFamilies.slice(0, 3)) {
    const amt = SAR(r.pick([1500, 2000, 3000]));
    const rec = await collections.createReceipt(cashier.db, cashier.session, { guardianId: g, amountMinor: amt, method: "CASH", date: today, notify: false });
    created.push({ id: rec.id, method: "CASH", amount: amt, date: today, reference: null });
  }

  // الشيكات: أغلبها محصّل، اثنان مرتدان، والباقي تحت التحصيل
  const cheques = created.filter((c) => c.method === "CHEQUE");
  for (const [i, c] of cheques.entries()) {
    const when = addDays(c.date, 4);
    if (when >= today) continue;
    if (i < 2) await collections.chequeAction(acc.db, acc.session, { receiptId: c.id, action: "BOUNCE", date: when, note: i === 0 ? "رصيد غير كافٍ" : "توقيع غير مطابق" });
    else if (i < cheques.length - 3) await collections.chequeAction(acc.db, acc.session, { receiptId: c.id, action: "CLEAR", bankAccountId: collectionBank.id, date: when });
  }

  // سند أُلغي لخطأ في المبلغ
  const toVoid = created.find((c) => c.method === "BANK_TRANSFER" && c.date < addDays(today, -5));
  if (toVoid) await collections.voidReceipt(acc.db, acc.session, toVoid.id, "سُجل التحويل مرتين؛ السند مكرر");

  // الاسترداد: أسرة دفعت زيادة وطلبت ردها
  if (overpayers[0]) {
    const credit = await collections.guardianCreditBalance(acc.db, overpayers[0]);
    if (credit > 0) {
      const ref = await collections.requestRefund(acc.db, acc.session, { guardianId: overpayers[0], amountMinor: credit, method: "BANK_TRANSFER", bankAccountId: currentBank.id, reason: "رد المبلغ الزائد بطلب ولي الأمر" });
      if (ref.approvalRequestId) await decideApproval(principal.db, principal.session, { requestId: ref.approvalRequestId, decision: "APPROVED" });
      await collections.payRefund(acc.db, acc.session, ref.id, addDays(today, -1));
    }
  }
  if (overpayers[1]) {
    const credit = await collections.guardianCreditBalance(acc.db, overpayers[1]);
    if (credit > 0) await collections.requestRefund(acc.db, acc.session, { guardianId: overpayers[1], amountMinor: credit, method: "BANK_TRANSFER", bankAccountId: currentBank.id, reason: "انتقال الأسرة إلى مدينة أخرى" });
  }

  // إشعارات دائنة
  const openNow = await rootDb.invoice.findMany({ where: { tenantId, status: { in: ["ISSUED", "PARTIAL"] }, source: "BULK" }, take: 40, orderBy: { number: "asc" } });
  const notes: Array<[number, number, string, "ADJUSTMENT" | "DISCOUNT"]> = [
    [3, SAR(800), "إعفاء من رسوم الكتب — الطالب يتيم (بقرار الإدارة)", "ADJUSTMENT"],
    [11, SAR(1500), "تعويض عن فترة انقطاع النقل المدرسي", "ADJUSTMENT"],
    [19, SAR(600), "خصم لاحق للسداد المبكر لكامل الرسوم", "DISCOUNT"],
  ];
  for (const [idx, amount, reason, kind] of notes) {
    const inv = openNow[idx];
    if (inv && inv.totalMinor - inv.paidMinor - inv.creditedMinor >= amount) await billing.creditNote(acc.db, acc.session, { invoiceId: inv.id, totalMinor: amount, reason, kind });
  }

  // -------------------------------------------------------------------
  // سندات الصرف
  // -------------------------------------------------------------------
  const vat = await rootDb.taxCode.findFirstOrThrow({ where: { tenantId, code: "VAT15" } });
  const cc = await rootDb.costCenter.findFirst({ where: { tenantId, code: "DEP-ADMIN" } });
  const VOUCHERS: Array<[string, string, string, number, boolean, number, "BANK_TRANSFER" | "CASH"]> = [
    ["الشركة السعودية للكهرباء", "6501", "فاتورة كهرباء المبنى الرئيسي — أغسطس", 41850, true, 12, "BANK_TRANSFER"],
    ["شركة المياه الوطنية", "6502", "فاتورة المياه — أغسطس", 5920, false, 13, "BANK_TRANSFER"],
    ["شركة الاتصالات السعودية", "6503", "إنترنت الألياف البصرية وخطوط الهاتف — أغسطس", 4800, true, 14, "BANK_TRANSFER"],
    ["مؤسسة النظافة المتقدمة", "6601", "عقد النظافة الشهري — أغسطس", 18500, true, 15, "BANK_TRANSFER"],
    ["مكتبة جرير", "6802", "قرطاسية ومستلزمات مكتبية لبداية العام", 3240, true, 5, "BANK_TRANSFER"],
    ["محطة ساسكو", "6701", "وقود الحافلات — الأسبوع الأول", 2180, true, 8, "CASH"],
    ["مؤسسة الإتقان للصيانة", "6601", "صيانة طارئة لمضخة المياه", 1750, true, 21, "CASH"],
    ["شركة الأدوات التعليمية", "6801", "وسائل تعليمية لمعامل العلوم", 4600, true, 25, "BANK_TRANSFER"],
    ["محطة ساسكو", "6701", "وقود الحافلات — الأسبوع الثالث", 2320, true, 29, "CASH"],
    ["الشركة السعودية للكهرباء", "6501", "فاتورة كهرباء المبنى الرئيسي — سبتمبر (مقدّرة)", 38400, true, 33, "BANK_TRANSFER"],
  ];
  const vDate = (offset: number) => addDays(iso(year.startDate), offset);
  for (const [payee, code, description, amount, taxable, offset, method] of VOUCHERS) {
    const date = vDate(offset);
    if (date > today) continue;
    const v = await banking.createVoucher(acc.db, acc.session, { date, payee, expenseAccountId: await account(code), costCenterId: cc?.id ?? null, method, bankAccountId: method === "CASH" ? null : currentBank.id, amountMinor: SAR(amount), taxCodeId: taxable ? vat.id : null, description });
    if (v.approvalRequestId) await decideApproval(principal.db, principal.session, { requestId: v.approvalRequestId, decision: "APPROVED", comment: "معتمد ضمن الموازنة" });
    await banking.payVoucher(acc.db, acc.session, v.id, addDays(date, 1) > today ? today : addDays(date, 1));
  }
  // فوق الحد: عقد صيانة التكييف (معتمد ومصروف) وأجهزة المعمل (بانتظار المدير)
  const ac = await banking.createVoucher(acc.db, acc.session, { date: vDate(9), payee: "شركة التكييف الحديث", expenseAccountId: await account("6601"), costCenterId: cc?.id ?? null, method: "BANK_TRANSFER", bankAccountId: currentBank.id, amountMinor: SAR(38000), taxCodeId: vat.id, description: "عقد الصيانة الوقائية للتكييف المركزي — الربع الأول" });
  if (ac.approvalRequestId) await decideApproval(principal.db, principal.session, { requestId: ac.approvalRequestId, decision: "APPROVED", comment: "معتمد" });
  await banking.payVoucher(acc.db, acc.session, ac.id, vDate(11));
  await banking.createVoucher(acc.db, acc.session, { date: addDays(today, -2), payee: "شركة الحلول التقنية المتكاملة", expenseAccountId: await account("6801"), costCenterId: cc?.id ?? null, method: "BANK_TRANSFER", bankAccountId: currentBank.id, amountMinor: SAR(46500), taxCodeId: vat.id, description: "توريد ٣٠ جهاز حاسب لمعمل المرحلة المتوسطة (عرض السعر مرفق)" });
  await banking.createVoucher(acc.db, acc.session, { date: addDays(today, -1), payee: "مطبعة النرجس", expenseAccountId: await account("6901"), costCenterId: cc?.id ?? null, method: "BANK_TRANSFER", bankAccountId: currentBank.id, amountMinor: SAR(2750), taxCodeId: vat.id, description: "مطبوعات حفل اليوم الوطني" });

  await banking.transferFunds(acc.db, acc.session, { fromAccountId: await account("1112"), toAccountId: await account("1111"), amountMinor: SAR(1500000), date: addDays(today, -9), description: "تحويل متحصلات الفصل الأول إلى الحساب الجاري" });

  // رواتب أغسطس وسبتمبر (قيد إجمالي لحين وحدة الرواتب)
  for (const [m, name] of [[7, "أغسطس"], [8, "سبتمبر"]] as const) {
    const date = m === 8 ? addDays(today, -2) : monthEnd(m);
    if (date > today) continue;
    await accounting.createManualEntry(acc.db, acc.session, {
      date,
      description: `رواتب شهر ${name} — قيد إجمالي (تفصيل الرواتب في وحدة الموارد البشرية)`,
      reference: `PAY-${m + 1}`,
      lines: [
        { accountId: await account("6101"), debit: SAR(296000), credit: 0 },
        { accountId: await account("6102"), debit: SAR(72000), credit: 0 },
        { accountId: await account("6103"), debit: SAR(28000), credit: 0 },
        { accountId: await account("6301"), debit: SAR(32000), credit: 0 },
        { accountId: await account("1111"), debit: 0, credit: SAR(428000) },
      ],
    });
  }

  // إيداع نقدية الصندوق في البنك
  const cashBal = await rootDb.journalLine.aggregate({ where: { tenantId, accountId: await account("1101") }, _sum: { debitMinor: true, creditMinor: true } });
  const cashNow = Number((cashBal._sum.debitMinor ?? 0n) - (cashBal._sum.creditMinor ?? 0n));
  const deposit = Math.floor((cashNow * 7) / 10 / 100_00) * 100_00;
  if (deposit > 0) await banking.transferFunds(acc.db, acc.session, { fromAccountId: await account("1101"), toAccountId: await account("1112"), amountMinor: deposit, date: addDays(today, -3), description: "إيداع نقدية الصندوق في حساب التحصيل" });

  // -------------------------------------------------------------------
  // كشف البنك المستورد والمطابقة
  // -------------------------------------------------------------------
  const bankReceipts = await rootDb.receipt.findMany({ where: { tenantId, status: "POSTED", method: { in: ["BANK_TRANSFER", "SADAD", "CARD"] }, date: { gte: new Date(`${addDays(today, -21)}T00:00:00Z`) } }, orderBy: { date: "asc" } });
  const csv = ["date,description,reference,amount"];
  for (const [i, rc] of bankReceipts.entries()) {
    if (i % 9 === 4) continue; // حركات لم تظهر في الكشف بعد
    const label = rc.method === "SADAD" ? "SADAD PAYMENT" : rc.method === "CARD" ? "MADA POS SETTLEMENT" : "INCOMING TRANSFER";
    csv.push(`${iso(rc.date)},${label} ${rc.payerName.split(" ")[0]},${rc.reference ?? ""},${minorToDecimalString(rc.amountMinor, "SAR")}`);
  }
  csv.push(`${addDays(today, -6)},POS SERVICE FEES,FEE-0925,-85.50`);
  csv.push(`${addDays(today, -4)},TRANSFER CHARGES,FEE-0927,-11.50`);
  csv.push(`${addDays(today, -2)},UNIDENTIFIED DEPOSIT,DEP-55310,1200.00`);
  const collectionBankAccount = await rootDb.bankAccount.findFirstOrThrow({ where: { id: collectionBank.id } });
  await banking.importStatement(acc.db, acc.session, { bankAccountId: collectionBankAccount.id, csv: csv.join("\n") });
  await banking.autoMatch(acc.db, acc.session, collectionBankAccount.id);
  const fee = await rootDb.bankStatementLine.findFirst({ where: { tenantId, reference: "FEE-0925" } });
  if (fee) await banking.postFromStatement(acc.db, acc.session, { statementLineId: fee.id, accountId: await account("7401"), description: "رسوم خدمة نقاط البيع — سبتمبر" });

  // -------------------------------------------------------------------
  // الاعتراف بإيراد أغسطس وإقفاله
  // -------------------------------------------------------------------
  const aug = periods[7]!;
  await accounting.runRevenueRecognition(acc.db, acc.session, aug.id);
  await accounting.closePeriod(acc.db, acc.session, aug.id, true);

  // قواعد بيانات النظام في مساحة «المالية»
  const owner = await rootDb.user.findFirstOrThrow({ where: { email: "owner@demo.manassa.sa" } });
  for (const source of ["invoices", "vouchers"]) await ensureSystemDatabase(db, tenantId, source, owner.id);

  // جلسات البذر ليست جلسات حقيقية
  await rootDb.session.deleteMany({ where: { userAgent: "seed" } });
  const counts = await Promise.all([rootDb.invoice.count({ where: { tenantId } }), rootDb.receipt.count({ where: { tenantId } }), rootDb.journalEntry.count({ where: { tenantId } }), rootDb.paymentVoucher.count({ where: { tenantId } })]);
  console.log(`✅ المرحلة ٣: ${counts[0]} فاتورة (دفعة جماعية ${bulk.count})، ${counts[1]} سند قبض، ${counts[3]} سند صرف، ${counts[2]} قيداً.`);
}

// التشغيل المباشر على قاعدة موجودة
if (process.argv[1]?.endsWith("phase3-finance.ts")) {
  (async () => {
    const tenant = await rootDb.tenant.findUnique({ where: { slug: "demo" } });
    if (!tenant) throw new Error("شغّل npm run db:seed أولاً");
    await seedPhase3(tenant.id);
  })()
    .catch((e) => {
      console.error("❌", e);
      process.exitCode = 1;
    })
    .finally(() => rootDb.$disconnect());
}

