/**
 * بذور المرحلة ٥ (العمليات) — كلها عبر الخدمات نفسها، فكل مبلغ له قيده في الأستاذ العام:
 * - الأصول: مبانٍ وحافلات وأجهزة كأرصدة افتتاحية بمجمع إهلاكها، ومشتريات جديدة، وإهلاك شهري حتى الشهر السابق، واستبعاد ببيع
 * - الموازنة التشغيلية للعام معتمدة بمرحلتين، بسياسة «تنبيه»
 * - المخزون والمشتريات: مستودعات وأصناف ورصيد افتتاحي، طلبات شراء بمراحلها، أوامر واستلام جزئي وكلي،
 *   فواتير موردين (مطابقة ثلاثية، فرق سعر، ومباشرة للكهرباء)، سداد، صرف للأقسام، وجرد معتمد وآخر مفتوح
 * - المتجر والمقصف: مبيعات نقدية وعلى حساب الطالب، ومحافظ مشحونة ومشتريات بحدود وفئات ممنوعة
 * - الصيانة: بلاغات بكل الحالات، قطع غيار، تكلفة خارجية مرحّلة، صيانة دورية، وحجوزات للقاعات
 * - النقل: حافلات بسائقيها ومشرفاتها، خطوط بمحطات وإحداثيات، تسكين طلاب بفواتير، سجل حافلات، ورحلة صباحية جارية
 * - المكتبة: فهرس ونسخ، إعارات جارية ومتأخرة، إرجاع متأخر بغرامة مفوترة، حجوزات، وموارد رقمية
 * - الأمن والعيادة: زوار، مفوضون واستلام، حوادث، تمارين إخلاء وخطط، أدوية وزيارات
 * كل الأسماء والأرقام وهمية.
 */
import "dotenv/config";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb, type TenantDb } from "../../src/server/db/tenant";
import { createSession, validateSessionToken, type SessionData } from "../../src/server/auth/session";
import { decideApproval } from "../../src/server/services/approval.service";
import { toISODate } from "../../src/lib/dates";
import * as assets from "../../src/server/services/finance/assets.service";
import * as budget from "../../src/server/services/finance/budget.service";
import * as inv from "../../src/server/services/ops/inventory.service";
import * as proc from "../../src/server/services/ops/procurement.service";
import * as pos from "../../src/server/services/ops/pos.service";
import * as maint from "../../src/server/services/ops/maintenance.service";
import * as transport from "../../src/server/services/ops/transport.service";
import * as library from "../../src/server/services/ops/library.service";
import * as safety from "../../src/server/services/ops/safety.service";
import { updateModuleSettings } from "../../src/server/services/module-settings.service";
import { rng } from "./data/students-data";

const SAR = (riyals: number) => Math.round(riyals * 100);

interface Actor {
  session: SessionData;
  db: TenantDb;
}
const actors = new Map<string, Actor>();
async function actor(tenantId: string, email: string): Promise<Actor> {
  const cached = actors.get(email);
  if (cached) return cached;
  const user = await rootDb.user.findFirstOrThrow({ where: { tenantId, email } });
  const { token } = await createSession({ tenantId, userId: user.id, twoFactorVerified: true, ip: null, userAgent: "seed" });
  const session = await validateSessionToken(token);
  if (!session) throw new Error(`تعذرت جلسة ${email}`);
  const a = { session, db: createTenantDb({ tenantId, actor: { id: user.id, name: user.name }, ip: null, userAgent: "seed" }) };
  actors.set(email, a);
  return a;
}
/** جلسة جديدة بإعدادات المدرسة المحدثة */
async function refresh(tenantId: string, email: string) {
  actors.delete(email);
  return actor(tenantId, email);
}
async function approveAll(tenantId: string, requestId: string | null, emails: string[]) {
  if (!requestId) throw new Error("لا طلب موافقة");
  for (const email of emails) {
    const a = await actor(tenantId, email);
    await decideApproval(a.db, a.session, { requestId, decision: "APPROVED", comment: "معتمد" });
  }
}

const daysAgo = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const monthsBack = (month: string, n: number) => {
  const [y = 2000, m = 1] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

/** ISBN-13 وهمي صحيح خانة التحقق */
function fakeIsbn(seed: number) {
  const body = `978603${String(100000 + seed * 37).slice(-6)}`;
  const sum = body.split("").reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}

export async function seedPhase5(tenantId: string) {
  const r = rng(5505);
  const shuffle = <T,>(a: readonly T[]): T[] => a.map((x) => [r.next(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const today = toISODate(new Date(), "Asia/Riyadh");
  const month = today.slice(0, 7);
  const owner = await actor(tenantId, "owner@demo.manassa.sa");
  const rec = await actor(tenantId, "reception@demo.manassa.sa");
  const nurse = await actor(tenantId, "nurse@demo.manassa.sa");
  const parent = await actor(tenantId, "parent@demo.manassa.sa");
  const branches = await rootDb.branch.findMany({ where: { tenantId }, orderBy: { code: "asc" } });
  const boys = branches.find((b) => b.gender === "BOYS")!;
  const girls = branches.find((b) => b.gender === "GIRLS")!;
  const banks = await rootDb.bankAccount.findMany({ where: { tenantId, isActive: true } });
  const bank = banks[0]!;
  const students = await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE", deletedAt: null }, select: { id: true, fullName: true, branchId: true, gender: true }, orderBy: { academicNumber: "asc" } });
  const qarni = await rootDb.student.findMany({ where: { tenantId, guardians: { some: { guardian: { userId: parent.session.user.id } } } }, select: { id: true, fullName: true, branchId: true } });

  // ------------------------------------------------------------------ الإعدادات
  await updateModuleSettings(owner.db, owner.session, "finance", { budgetControl: "WARN", budgetWarnBp: 8000, autoDepreciation: true });
  await updateModuleSettings(owner.db, owner.session, "library", { loanDays: 14, finePerDayMinor: SAR(1), fineCapMinor: SAR(30) });
  await updateModuleSettings(owner.db, owner.session, "canteen", { defaultDailyLimitMinor: SAR(20), lowBalanceMinor: SAR(10) });
  for (const email of ["accountant@demo.manassa.sa", "principal@demo.manassa.sa", "procurement@demo.manassa.sa", "facilities@demo.manassa.sa", "transport@demo.manassa.sa", "librarian@demo.manassa.sa", "canteen@demo.manassa.sa"]) await refresh(tenantId, email);
  const A = async (email: string) => actor(tenantId, email);

  // ------------------------------------------------------------------ الأصول الثابتة
  console.log("   • الأصول والإهلاك…");
  const accA = await A("accountant@demo.manassa.sa");
  const cats = await assets.listCategories(accA.db, accA.session);
  const cat = (code: string) => cats.categories.find((c) => c.code === code)!.id;
  const rooms = await rootDb.room.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, branchId: true, kind: true } });
  const assetDefs: Array<[string, string, number, number, string, "OPENING" | "BANK" | "AP", string | null, number, string | null]> = [
    ["أرض مجمع البنين — حي النرجس", "LAND", 8_500_000, 0, "2012-06-01", "OPENING", boys.id, 0, null],
    ["مبنى فرع البنين", "BLDG", 12_400_000, 0, "2014-09-01", "OPENING", boys.id, 6_200_000, "2026-08"],
    ["مبنى فرع البنات", "BLDG", 10_800_000, 0, "2016-01-01", "OPENING", girls.id, 4_608_000, "2026-08"],
    ["حافلة تويوتا كوستر ٣٠ راكباً (B-01)", "BUS", 285_000, 25_000, "2021-08-15", "OPENING", boys.id, 130_000, "2026-08"],
    ["حافلة هيونداي كاونتي ٢٨ راكباً (B-02)", "BUS", 262_000, 22_000, "2022-07-10", "OPENING", boys.id, 96_000, "2026-08"],
    ["حافلة تويوتا كوستر ٣٠ راكباً (B-03)", "BUS", 298_000, 28_000, "2023-08-01", "OPENING", girls.id, 81_000, "2026-08"],
    ["أثاث الفصول — فرع البنين (٢٤ فصلاً)", "FURN", 420_000, 20_000, "2022-08-20", "OPENING", boys.id, 280_000, "2026-08"],
    ["أثاث الفصول — فرع البنات (٢٠ فصلاً)", "FURN", 360_000, 18_000, "2023-08-20", "OPENING", girls.id, 182_400, "2026-08"],
    ["أجهزة معمل الحاسب ١ (٣٠ جهازاً)", "IT", 126_000, 6_000, "2024-08-10", "OPENING", boys.id, 75_000, "2026-08"],
    ["شاشات تفاعلية للفصول (١٦ شاشة)", "IT", 176_000, 8_000, "2026-09-02", "BANK", boys.id, 0, null],
    ["مكيفات مركزية لقاعة المسرح", "FURN", 94_500, 4_500, "2026-09-06", "AP", girls.id, 0, null],
    ["جهاز عرض قديم — قاعة الاجتماعات", "IT", 9_800, 0, "2022-03-01", "OPENING", boys.id, 9_200, "2026-08"],
  ];
  const createdAssets: Array<{ id: string; name: string }> = [];
  for (const [name, code, cost, salvage, date, funded, branchId, openAcc, depTo] of assetDefs) {
    const room = rooms.find((x) => x.branchId === branchId && (code === "IT" ? x.kind === "COMPUTER" : code === "FURN" && name.includes("المسرح") ? x.kind === "HALL" : false));
    const a = await assets.createAsset(accA.db, accA.session, { name, categoryId: cat(code), branchId, roomId: room?.id ?? null, purchaseDate: date, costMinor: SAR(cost), salvageMinor: SAR(salvage), fundedBy: funded, bankAccountId: funded === "BANK" ? bank.id : null, openingAccumulatedMinor: SAR(openAcc), openingDepreciatedTo: depTo, serialNumber: code === "IT" ? `SN-${r.int(100000, 999999)}` : null });
    createdAssets.push({ id: a.id, name });
  }
  // الفترات حتى أغسطس مقفلة؛ الأصول القديمة مُهلكة حتى أغسطس ويُرحّل إهلاك الشهر الحالي
  await assets.runDepreciation(accA.db, accA.session, month);
  // بيع جهاز العرض القديم
  const princ = await A("principal@demo.manassa.sa");
  const projector = createdAssets.find((a) => a.name.startsWith("جهاز عرض"))!;
  await assets.disposeAsset(princ.db, princ.session, projector.id, { date: daysAgo(today, 12), proceedsMinor: SAR(450), receivedIn: "CASH", reason: "استبدال بشاشات تفاعلية وبيعه لمعرض مستعمل" });
  await assets.transferAsset(accA.db, accA.session, createdAssets.find((a) => a.name.startsWith("شاشات"))!.id, { branchId: boys.id, location: "الدور الثاني — فصول الصف الخامس", custodianId: null, date: daysAgo(today, 20), notes: "نقل من المستودع إلى الفصول" });

  // ------------------------------------------------------------------ الموازنة
  console.log("   • الموازنة…");
  const fy = await rootDb.fiscalYear.findFirstOrThrow({ where: { tenantId, startDate: { lte: new Date() }, endDate: { gte: new Date() } } });
  const b = await budget.saveBudget(accA.db, accA.session, { fiscalYearId: fy.id, name: "الموازنة التشغيلية", notes: "معتمدة من مجلس الإدارة؛ التنبيه عند ٨٠٪" });
  const accountByCode = async (code: string) => (await rootDb.account.findFirstOrThrow({ where: { tenantId, code, deletedAt: null } })).id;
  const months = Array.from({ length: 12 }, (_, i) => `${fy.startDate.getUTCFullYear()}-${String(i + 1).padStart(2, "0")}`);
  const spread = (annual: number, summerFactor = 1) => Object.fromEntries(months.map((m) => [m, SAR((annual / 12) * (["06", "07"].includes(m.slice(5)) ? summerFactor : 1))]));
  const budgetRows: Array<[string, number, number?]> = [
    ["6601", 180_000],
    ["6501", 240_000, 1.4],
    ["6502", 48_000],
    ["6503", 36_000],
    ["6701", 150_000, 0.3],
    ["6801", 96_000],
    ["6802", 60_000],
    ["6901", 80_000],
    ["7201", 1_150_000],
    ["4501", 320_000],
    ["4601", 260_000, 0.2],
  ];
  for (const [code, annual, f] of budgetRows) await budget.setBudgetRow(accA.db, accA.session, { budgetId: b.id, accountId: await accountByCode(code), costCenterId: null, months: spread(annual, f ?? 1) });
  const bs = await budget.submitBudget(accA.db, accA.session, b.id);
  await approveAll(tenantId, bs.approvalRequestId, ["g.altamimi@demo.manassa.sa", "principal@demo.manassa.sa"]);

  // ------------------------------------------------------------------ المخزون
  console.log("   • المخزون والمشتريات…");
  const P = await A("procurement@demo.manassa.sa");
  const vat = await rootDb.taxCode.findFirstOrThrow({ where: { tenantId, kind: "STANDARD" }, orderBy: { rateBp: "desc" } });
  const wh = {
    SUP: await inv.saveWarehouse(P.db, P.session, { code: "SUP-B", name: "مستودع المستلزمات — البنين", kind: "SUPPLIES", branchId: boys.id, isActive: true }),
    SUPG: await inv.saveWarehouse(P.db, P.session, { code: "SUP-G", name: "مستودع المستلزمات — البنات", kind: "SUPPLIES", branchId: girls.id, isActive: true }),
    STORE: await inv.saveWarehouse(P.db, P.session, { code: "STORE", name: "المتجر المدرسي (الزي والكتب)", kind: "STORE", branchId: boys.id, isActive: true }),
    CAN: await inv.saveWarehouse(P.db, P.session, { code: "CAN-B", name: "مقصف فرع البنين", kind: "CANTEEN", branchId: boys.id, isActive: true }),
    MNT: await inv.saveWarehouse(P.db, P.session, { code: "MNT", name: "مخزن الصيانة", kind: "MAINTENANCE", branchId: boys.id, isActive: true }),
  };
  type ItemDef = [sku: string, name: string, cat: inv.ItemCategory, unit: string, min: number, price: number | null, cost: number, qty: number, w: keyof typeof wh, barcode?: string];
  const items: ItemDef[] = [
    ["SUP-A4", "ورق تصوير A4 (رزمة ٥٠٠)", "SUPPLY", "رزمة", 40, null, 17.5, 60, "SUP"],
    ["SUP-MRK", "أقلام سبورة بيضاء (علبة ١٢)", "SUPPLY", "علبة", 25, null, 28, 30, "SUP"],
    ["SUP-TNR", "حبر طابعة ليزر", "SUPPLY", "عبوة", 6, null, 185, 8, "SUP"],
    ["SUP-GLV", "قفازات مختبر (علبة ١٠٠)", "SUPPLY", "علبة", 10, null, 32, 6, "SUPG"],
    ["SUP-CLN", "منظف أرضيات (جالون)", "SUPPLY", "جالون", 20, null, 24, 45, "SUPG"],
    ["SUP-TIS", "مناديل ورقية (كرتون)", "SUPPLY", "كرتون", 15, null, 38, 22, "SUP"],
    ["SP-LED", "لمبة LED ٤٠ واط", "SPARE_PART", "حبة", 30, null, 14, 80, "MNT"],
    ["SP-FLT", "فلتر مكيف سبليت", "SPARE_PART", "حبة", 20, null, 22, 36, "MNT"],
    ["SP-TAP", "خلاط مغسلة", "SPARE_PART", "حبة", 4, null, 95, 5, "MNT"],
    ["UNI-SH-S", "قميص الزي — مقاس صغير", "UNIFORM", "حبة", 20, 55, 30, 80, "STORE", "6281000100011"],
    ["UNI-SH-M", "قميص الزي — مقاس متوسط", "UNIFORM", "حبة", 20, 60, 33, 90, "STORE", "6281000100028"],
    ["UNI-SH-L", "قميص الزي — مقاس كبير", "UNIFORM", "حبة", 20, 65, 36, 70, "STORE", "6281000100035"],
    ["UNI-PT", "بنطال الزي", "UNIFORM", "حبة", 20, 70, 38, 110, "STORE", "6281000100042"],
    ["UNI-PE", "طقم التربية البدنية", "UNIFORM", "طقم", 15, 95, 52, 60, "STORE", "6281000100059"],
    ["BK-MATH", "كراسة تمارين الرياضيات", "BOOK", "نسخة", 30, 25, 11, 150, "STORE", "6281000200017"],
    ["BK-ENG", "سلسلة القراءة الإنجليزية (مستوى ٣)", "BOOK", "نسخة", 20, 85, 48, 60, "STORE", "6281000200024"],
    ["BK-SCI", "دليل التجارب العلمية", "BOOK", "نسخة", 20, 35, 16, 70, "STORE", "6281000200031"],
    ["CN-WTR", "مياه معبأة ٣٣٠ مل", "CANTEEN", "علبة", 100, 1, 0.45, 600, "CAN", "6281000300014"],
    ["CN-JUC", "عصير برتقال طبيعي ٢٠٠ مل", "CANTEEN", "علبة", 60, 2.5, 1.2, 300, "CAN", "6281000300021"],
    ["CN-MLK", "حليب بالتمر ٢٠٠ مل", "CANTEEN", "علبة", 60, 2, 1, 280, "CAN", "6281000300038"],
    ["CN-SND", "ساندويتش جبنة وزعتر", "CANTEEN", "حبة", 40, 4, 2.2, 150, "CAN"],
    ["CN-CHK", "ساندويتش دجاج", "CANTEEN", "حبة", 40, 6, 3.4, 120, "CAN"],
    ["CN-FRT", "كوب فواكه مقطعة", "CANTEEN", "كوب", 30, 5, 2.6, 80, "CAN"],
    ["CN-CHP", "رقائق بطاطس مخبوزة", "CANTEEN", "كيس", 50, 1.5, 0.7, 240, "CAN", "6281000300045"],
    ["CN-CKE", "كيك شوكولاتة", "CANTEEN", "قطعة", 30, 3, 1.4, 120, "CAN"],
  ];
  const itemIds = new Map<string, string>();
  const openingDate = daysAgo(today, 28);
  for (const [sku, name, category, unit, min, price, cost, qty, w, barcode] of items) {
    const it = await inv.saveItem(P.db, P.session, { sku, name, category, unit, minQty: min, reorderQty: min * 2, sellable: price !== null, salePriceMinor: price !== null ? SAR(price) : null, taxCodeId: price !== null ? vat.id : null, barcode: barcode ?? null, isActive: true });
    itemIds.set(sku, it.id);
    await inv.openingStock(P.db, P.session, { itemId: it.id, warehouseId: wh[w].id, quantity: qty, unitCostMinor: SAR(cost), date: openingDate });
  }
  const I = (sku: string) => itemIds.get(sku)!;

  const supplierDefs = [
    { name: "مؤسسة دار المعرفة للقرطاسية", category: "قرطاسية ومستلزمات مكتبية", phone: "0114560011", taxNumber: "310123456700003", paymentTermsDays: 30 },
    { name: "شركة الغذاء الصحي للتموين", category: "أغذية ومشروبات", phone: "0114560022", taxNumber: "310234567800003", paymentTermsDays: 15 },
    { name: "مصنع الأناقة للزي الموحد", category: "زي مدرسي", phone: "0114560033", taxNumber: "310345678900003", paymentTermsDays: 45 },
    { name: "مؤسسة البرودة للتكييف والتبريد", category: "صيانة وتكييف", phone: "0114560044", taxNumber: "310456789000003", paymentTermsDays: 30 },
    { name: "شركة الكهرباء (فواتير الخدمات)", category: "خدمات عامة", phone: "920001100", taxNumber: "300000000000003", paymentTermsDays: 20 },
  ];
  const sup: Array<{ id: string; name: string }> = [];
  for (const s of supplierDefs) sup.push(await proc.saveSupplier(P.db, P.session, { ...s, contactName: "مسؤول المبيعات", isActive: true }));
  const [stationery, food, uniformCo, hvac, utility] = sup as [typeof sup[number], typeof sup[number], typeof sup[number], typeof sup[number], typeof sup[number]];

  // طلب ١: مستلزمات (معتمد ← أمر ← استلام كامل ← فاتورة مطابقة ← سداد)
  const pr1 = await proc.saveRequest(P.db, P.session, { title: "مستلزمات الفصل الدراسي الأول", branchId: boys.id, neededBy: daysAgo(today, 20), justification: "إعادة تموين الورق والأقلام قبل الاختبارات", lines: [{ itemId: I("SUP-A4"), description: "ورق تصوير A4", quantity: 120, estUnitMinor: SAR(17.5) }, { itemId: I("SUP-MRK"), description: "أقلام سبورة", quantity: 40, estUnitMinor: SAR(28) }] });
  await approveAll(tenantId, (await proc.submitRequest(P.db, P.session, pr1.id)).approvalRequestId, ["accountant@demo.manassa.sa"]);
  const po1 = await proc.createOrder(P.db, P.session, { supplierId: stationery.id, requestId: pr1.id, warehouseId: wh.SUP.id, orderDate: daysAgo(today, 24), expectedDate: daysAgo(today, 18), lines: [{ itemId: I("SUP-A4"), description: "ورق تصوير A4", quantity: 120, unitMinor: SAR(17), taxBp: 1500 }, { itemId: I("SUP-MRK"), description: "أقلام سبورة", quantity: 40, unitMinor: SAR(27.5), taxBp: 1500 }] });
  await proc.issueOrder(P.db, P.session, po1.id);
  const po1d = await proc.getOrder(P.db, P.session, po1.id);
  await proc.receiveOrder(P.db, P.session, { orderId: po1.id, date: daysAgo(today, 18), lines: po1d.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })) });
  const bill1 = await proc.createBill(P.db, P.session, { supplierId: stationery.id, orderId: po1.id, supplierRef: "INV-2291", billDate: daysAgo(today, 17), orderLines: po1d.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity, unitMinor: l.unitMinor })) });
  await proc.paySupplier(P.db, P.session, { billId: bill1.bill.id, amountMinor: bill1.bill.totalMinor, date: daysAgo(today, 6), method: "BANK_TRANSFER", bankAccountId: bank.id, reference: "TRF-88120" });
  await proc.rateSupplier(P.db, P.session, { supplierId: stationery.id, orderId: po1.id, quality: 5, delivery: 4, price: 4, comment: "التزام جيد بالمواعيد" });

  // طلب ٢: مواد المقصف (أمر مباشر ← استلام جزئي ← فاتورة بفرق سعر ضمن السماحية)
  const po2 = await proc.createOrder(P.db, P.session, { supplierId: food.id, warehouseId: wh.CAN.id, orderDate: daysAgo(today, 9), expectedDate: daysAgo(today, 7), lines: [{ itemId: I("CN-JUC"), description: "عصير برتقال", quantity: 400, unitMinor: SAR(1.2), taxBp: 1500 }, { itemId: I("CN-MLK"), description: "حليب بالتمر", quantity: 300, unitMinor: SAR(1), taxBp: 1500 }, { itemId: I("CN-WTR"), description: "مياه معبأة", quantity: 1200, unitMinor: SAR(0.45), taxBp: 1500 }] });
  await proc.issueOrder(P.db, P.session, po2.id);
  const po2d = await proc.getOrder(P.db, P.session, po2.id);
  await proc.receiveOrder(P.db, P.session, { orderId: po2.id, date: daysAgo(today, 7), lines: po2d.lines.map((l) => ({ orderLineId: l.id, quantity: l.description.includes("مياه") ? 600 : l.quantity })) });
  const po2r = await proc.getOrder(P.db, P.session, po2.id);
  await proc.createBill(P.db, P.session, { supplierId: food.id, orderId: po2.id, supplierRef: "F-10233", billDate: daysAgo(today, 6), orderLines: po2r.lines.filter((l) => l.receivedQty > 0).map((l) => ({ orderLineId: l.id, quantity: l.receivedQty, unitMinor: l.description.includes("عصير") ? SAR(1.22) : l.unitMinor })) });
  await proc.rateSupplier(P.db, P.session, { supplierId: food.id, orderId: po2.id, quality: 4, delivery: 3, price: 4, comment: "تأخر نصف كمية المياه" });

  // طلب ٣: زي (بانتظار اعتماد المدير لتجاوزه الحد) — يظهر في صندوق الموافقات
  const pr3 = await proc.saveRequest(P.db, P.session, { title: "زي مدرسي للفصل الدراسي الثاني", branchId: boys.id, neededBy: daysAgo(today, -30), justification: "نفاد المقاسات المتوسطة وتوقع زيادة الطلب", lines: [{ itemId: I("UNI-SH-M"), description: "قميص الزي — متوسط", quantity: 300, estUnitMinor: SAR(33) }, { itemId: I("UNI-PT"), description: "بنطال الزي", quantity: 250, estUnitMinor: SAR(38) }] });
  const pr3s = await proc.submitRequest(P.db, P.session, pr3.id);
  await approveAll(tenantId, pr3s.approvalRequestId, ["accountant@demo.manassa.sa"]);
  // طلب ٤: صيانة تكييف (مسودة)
  await proc.saveRequest(P.db, P.session, { title: "عقد صيانة وقائية للتكييف المركزي", branchId: girls.id, justification: "انتهاء العقد السابق", lines: [{ itemId: null, description: "زيارات صيانة ربع سنوية (٤ زيارات)", quantity: 4, estUnitMinor: SAR(3500) }] });
  // فواتير مباشرة: الكهرباء والاتصالات
  const elec = await accountByCode("6501");
  const tel = await accountByCode("6503");
  // فاتورة استهلاك أغسطس (مسددة) واستهلاك الشهر الحالي (مستحقة) — الفترات السابقة مقفلة
  for (const [i, m] of [2, 1].entries()) {
    const d = `${month}-${m === 2 ? "05" : "28"}`;
    const bl = await proc.createBill(P.db, P.session, { supplierId: utility.id, supplierRef: `ELC-${monthsBack(month, m - 1).replace("-", "")}`, billDate: d, branchId: boys.id, directLines: [{ accountId: elec, description: `كهرباء فرع البنين — ${monthsBack(month, m - 1)}`, quantity: 1, unitMinor: SAR(18_400 + i * 2_100), taxBp: 1500 }, { accountId: tel, description: "الإنترنت والاتصالات", quantity: 1, unitMinor: SAR(2_600), taxBp: 1500 }] });
    if (m > 1) await proc.paySupplier(P.db, P.session, { billId: bl.bill.id, amountMinor: bl.bill.totalMinor, date: `${month}-20`, method: "BANK_TRANSFER", bankAccountId: bank.id });
  }
  await proc.createBill(P.db, P.session, { supplierId: hvac.id, supplierRef: "HV-7781", billDate: daysAgo(today, 3), branchId: girls.id, directLines: [{ accountId: await accountByCode("6601"), description: "إصلاح ضاغط مكيف قاعة المسرح", quantity: 1, unitMinor: SAR(4_200), taxBp: 1500 }] });
  void uniformCo;

  // صرف للأقسام
  for (const [purpose, lines, w] of [
    ["قسم الرياضيات — أوراق الاختبارات القصيرة", [["SUP-A4", 22], ["SUP-MRK", 6]], "SUP"],
    ["الإدارة — طباعة الشهادات", [["SUP-A4", 15], ["SUP-TNR", 2]], "SUP"],
    ["مختبر العلوم — فرع البنات", [["SUP-GLV", 3]], "SUPG"],
    ["النظافة العامة — الأسبوع الحالي", [["SUP-CLN", 18]], "SUPG"],
    ["النظافة العامة — فرع البنين", [["SUP-TIS", 10]], "SUP"],
  ] as Array<[string, Array<[string, number]>, keyof typeof wh]>) {
    await inv.issueStock(P.db, P.session, { warehouseId: wh[w].id, date: daysAgo(today, r.int(1, 12)), branchId: wh[w].branchId, purpose, requestedBy: purpose.split(" — ")[0]!, lines: lines.map(([sku, q]) => ({ itemId: I(sku), quantity: q })) });
  }
  // جرد معتمد لمستودع الصيانة (عجز لمبتين) وجرد مفتوح للمتجر
  const c1 = await inv.startCount(P.db, P.session, { warehouseId: wh.MNT.id, date: daysAgo(today, 2), notes: "جرد شهري" });
  const c1d = await inv.getCount(P.db, P.session, c1.id);
  await inv.setCountLines(P.db, P.session, { countId: c1.id, lines: c1d.lines.filter((l) => l.systemQty > 0).map((l) => ({ id: l.id, countedQty: l.itemId === I("SP-LED") ? l.systemQty - 2 : l.systemQty })) });
  await inv.postCount(P.db, P.session, c1.id);
  await inv.startCount(P.db, P.session, { warehouseId: wh.STORE.id, date: today, notes: "جرد نهاية الشهر" });

  // ------------------------------------------------------------------ المتجر
  console.log("   • المتجر والمقصف…");
  const cashierStore = P;
  const storeSales: Array<[string, number]> = [["UNI-SH-M", 2], ["UNI-PT", 2], ["BK-MATH", 1], ["UNI-PE", 1], ["BK-ENG", 1], ["UNI-SH-S", 1], ["BK-SCI", 2]];
  for (let i = 0; i < 9; i++) {
    const picks = shuffle(storeSales).slice(0, r.int(1, 3));
    const onAccount = i % 3 === 0;
    const st = onAccount ? r.pick(students) : null;
    await pos.createSale(cashierStore.db, cashierStore.session, { kind: "STORE", warehouseId: wh.STORE.id, paymentMethod: onAccount ? "STUDENT_ACCOUNT" : i % 2 ? "CARD" : "CASH", studentId: st?.id ?? null, lines: picks.map(([sku, q]) => ({ itemId: I(sku), quantity: q })) });
  }
  if (qarni[0]) await pos.createSale(cashierStore.db, cashierStore.session, { kind: "STORE", warehouseId: wh.STORE.id, paymentMethod: "STUDENT_ACCOUNT", studentId: qarni[0].id, lines: [{ itemId: I("UNI-PE"), quantity: 1 }, { itemId: I("BK-ENG"), quantity: 1 }] });

  // ------------------------------------------------------------------ المقصف والمحافظ
  const C = await A("canteen@demo.manassa.sa");
  const boysStudents = students.filter((s) => s.branchId === boys.id);
  const walletKids = [...qarni.filter((q) => q.branchId === boys.id), ...shuffle(boysStudents).slice(0, 45)].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
  for (const s of walletKids) await pos.topUp(C.db, C.session, { studentId: s.id, amountMinor: SAR(r.pick([50, 50, 100, 100, 150, 200])), method: r.int(0, 3) ? "CASH" : "CARD" });
  if (qarni[0]) await pos.setWalletLimits(parent.db, parent.session, { studentId: qarni[0].id, dailyLimitMinor: SAR(15), blockedCategories: [I("CN-CHP"), I("CN-CKE")], notifyPurchases: true, lowBalanceMinor: SAR(20) });
  const menu: Array<[string, number]> = [["CN-WTR", 1], ["CN-JUC", 1], ["CN-MLK", 1], ["CN-SND", 1], ["CN-CHK", 1], ["CN-FRT", 1], ["CN-CHP", 1], ["CN-CKE", 1]];
  let purchases = 0;
  for (const s of walletKids) {
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const basket = shuffle(menu).slice(0, r.int(1, 2));
      try {
        await pos.createSale(C.db, C.session, { kind: "CANTEEN", warehouseId: wh.CAN.id, paymentMethod: "WALLET", studentId: s.id, lines: basket.map(([sku, q]) => ({ itemId: I(sku), quantity: q })) });
        purchases++;
      } catch {
        // الحد اليومي أو الفئات الممنوعة: كما في الواقع تُرفض العملية
      }
    }
  }
  for (let i = 0; i < 25; i++) await pos.createSale(C.db, C.session, { kind: "CANTEEN", warehouseId: wh.CAN.id, paymentMethod: "CASH", lines: shuffle(menu).slice(0, r.int(1, 3)).map(([sku, q]) => ({ itemId: I(sku), quantity: q })) });
  console.log(`     ${walletKids.length} محفظة، ${purchases} عملية بالمحفظة`);

  // ------------------------------------------------------------------ الصيانة
  console.log("   • الصيانة والحجوزات…");
  const F = await A("facilities@demo.manassa.sa");
  const tech = await rootDb.user.findFirstOrThrow({ where: { tenantId, email: "s.alatawi@demo.manassa.sa" } });
  const facUser = await rootDb.user.findFirstOrThrow({ where: { tenantId, email: "facilities@demo.manassa.sa" } });
  const teachers = await rootDb.user.findMany({ where: { tenantId, roles: { some: { role: { key: "TEACHER" } } } }, select: { email: true }, take: 6 });
  const boysRooms = rooms.filter((x) => x.branchId === boys.id);
  const reqDefs: Array<[string, string, "LOW" | "MEDIUM" | "HIGH" | "URGENT", string, "NEW" | "IN_PROGRESS" | "WAITING_PARTS" | "DONE", number]> = [
    ["تسرب مياه من سقف دورة مياه الدور الثاني", "PLUMBING", "URGENT", "تسرب واضح يبلل الممر", "IN_PROGRESS", 0],
    ["مكيف الفصل لا يبرد", "HVAC", "HIGH", "الحرارة داخل الفصل مرتفعة بعد الحصة الثالثة", "WAITING_PARTS", 0],
    ["جهاز العرض في معمل الحاسب لا يعمل", "IT", "MEDIUM", "لا يظهر الإدخال من الحاسب", "NEW", 0],
    ["باب الفصل يحتاج مقبضاً جديداً", "CARPENTRY", "LOW", "المقبض مكسور", "NEW", 0],
    ["إنارة الممر الشرقي ضعيفة", "ELECTRICAL", "MEDIUM", "ثلاث لمبات معطلة", "DONE", 0],
    ["تنظيف خزان المياه العلوي", "CLEANING", "MEDIUM", "حسب الجدول", "DONE", 1_800],
    ["كسر في زجاج نافذة المختبر", "SAFETY", "HIGH", "زجاج متصدع خطر على الطلاب", "DONE", 650],
    ["صوت غير طبيعي في محرك الحافلة B-02", "VEHICLE", "HIGH", "طقطقة عند التسارع", "IN_PROGRESS", 0],
    ["نقطة الشبكة في غرفة المعلمين معطلة", "IT", "LOW", "لا يوجد اتصال سلكي", "NEW", 0],
    ["تسريب في مغسلة الفصل ٤/ب", "PLUMBING", "MEDIUM", "تنقيط مستمر", "DONE", 0],
  ];
  const buses0 = await rootDb.bus.findMany({ where: { tenantId } });
  void buses0;
  for (const [i, [title, category, priority, description, status, extCost]] of reqDefs.entries()) {
    const reporter = await A(teachers[i % teachers.length]!.email);
    const room = boysRooms[i % Math.max(1, boysRooms.length)];
    const req = await maint.createRequest(reporter.db, reporter.session, { title, description, category, priority, roomId: category === "VEHICLE" ? null : (room?.id ?? null), location: category === "VEHICLE" ? "موقف الحافلات" : null });
    if (status === "NEW") continue;
    await maint.updateRequest(F.db, F.session, req.id, { assigneeId: i % 2 ? tech.id : facUser.id, status: "IN_PROGRESS", dueDate: daysAgo(today, -r.int(1, 5)) });
    if (title.includes("إنارة")) await maint.issueParts(F.db, F.session, req.id, { warehouseId: wh.MNT.id, lines: [{ itemId: I("SP-LED"), quantity: 3 }] });
    if (title.includes("مغسلة")) await maint.issueParts(F.db, F.session, req.id, { warehouseId: wh.MNT.id, lines: [{ itemId: I("SP-TAP"), quantity: 1 }] });
    if (status === "WAITING_PARTS") await maint.updateRequest(F.db, F.session, req.id, { status: "WAITING_PARTS", resolution: null });
    if (status === "DONE") await maint.completeRequest(F.db, F.session, req.id, { resolution: extCost ? "نُفذ بواسطة مقاول معتمد وتم الفحص" : "تم الإصلاح داخلياً", externalCostMinor: SAR(extCost), paidFrom: extCost ? "CASH" : null, vendorName: extCost ? "مؤسسة الخدمات الفنية" : null });
  }
  // البلاغات أُنشئت على مدى الأسابيع الماضية؛ مدة الإنجاز واقعية (ساعات إلى أيام)
  for (const [k, req] of (await rootDb.maintenanceRequest.findMany({ where: { tenantId }, orderBy: { number: "asc" } })).entries()) {
    const createdAt = new Date(Date.now() - (20 - k) * 26 * 3_600_000);
    await rootDb.maintenanceRequest.update({ where: { id: req.id }, data: { createdAt, ...(req.completedAt ? { completedAt: new Date(createdAt.getTime() + r.int(3, 52) * 3_600_000) } : {}) } });
  }
  const schedDefs: Array<[string, string, number, number]> = [
    ["تنظيف فلاتر المكيفات", "HVAC", 90, 12],
    ["فحص طفايات الحريق وأجهزة الإنذار", "SAFETY", 30, 0],
    ["تعقيم وتنظيف خزانات المياه", "CLEANING", 180, 75],
    ["فحص لوحات الكهرباء الرئيسية", "ELECTRICAL", 60, 20],
  ];
  for (const [title, category, freq, dueIn] of schedDefs) await maint.saveSchedule(F.db, F.session, { title, category, frequencyDays: freq, nextDue: daysAgo(today, -dueIn), assigneeId: category === "HVAC" ? tech.id : facUser.id, branchId: boys.id, isActive: true });
  await maint.runSchedules(F.db, F.session);
  const bookable = rooms.filter((x) => ["LAB", "GYM", "HALL", "COMPUTER"].includes(x.kind));
  const bookingDefs: Array<[string, number, string, string]> = [["تجربة عملية — الكيمياء", 1, "13:30", "14:30"], ["اجتماع أولياء أمور الصف السادس", 2, "17:00", "19:00"], ["تدريب فريق كرة الطائرة", 3, "13:15", "14:45"], ["ورشة البرمجة للموهوبين", 4, "14:00", "15:30"]];
  for (const [i, [title, dayOffset, s, e]] of bookingDefs.entries()) {
    const room = bookable[i % Math.max(1, bookable.length)];
    if (!room) break;
    const booker = await A(teachers[(i + 2) % teachers.length]!.email);
    try {
      await maint.createBooking(booker.db, booker.session, { roomId: room.id, title, date: daysAgo(today, -dayOffset), startTime: s, endTime: e });
    } catch {
      // تعارض مع حصة: لا حجز
    }
  }

  // ------------------------------------------------------------------ النقل
  console.log("   • النقل…");
  const T = await A("transport@demo.manassa.sa");
  const crew = await rootDb.employee.findMany({ where: { tenantId, deletedAt: null, status: "ACTIVE", category: "SERVICES" }, select: { id: true, fullName: true, gender: true }, orderBy: { number: "asc" } });
  const men = crew.filter((e) => e.gender === "MALE");
  const women = crew.filter((e) => e.gender === "FEMALE");
  const busDefs: Array<[string, string, string, number, string]> = [["B-01", "ح ط ب 4821", "تويوتا كوستر 2021", 30, boys.id], ["B-02", "ر س ع 7302", "هيونداي كاونتي 2022", 28, boys.id], ["B-03", "ن ق ل 1155", "تويوتا كوستر 2023", 30, girls.id], ["B-04", "د ر س 9044", "ميتسوبيشي روزا 2019", 26, girls.id]];
  const buses = [];
  for (const [i, [code, plate, model, capacity, branchId]] of busDefs.entries()) {
    buses.push(await transport.saveBus(T.db, T.session, { code, plateNumber: plate, model, year: Number(model.slice(-4)), capacity, branchId, driverId: men[i]?.id ?? null, supervisorId: (branchId === girls.id ? women[i] : women[i] ?? men[i + 4])?.id ?? null, insuranceExpiry: daysAgo(today, i === 3 ? -20 : -200), licenseExpiry: daysAgo(today, -300), inspectionExpiry: daysAgo(today, i === 1 ? -35 : -150), status: "ACTIVE" }));
  }
  const routeDefs: Array<[string, string, number, number, Array<[string, number, number, string, string]>]> = [
    ["R-N1", "خط النرجس والياسمين", 0, 3200, [["النرجس — شارع الأمير سعود", 24.8412, 46.6621, "06:25", "13:40"], ["النرجس — مسجد الراجحي", 24.8356, 46.6712, "06:32", "13:34"], ["الياسمين — شارع أنس بن مالك", 24.8228, 46.6405, "06:41", "13:25"], ["الياسمين — حديقة الحي", 24.8174, 46.6488, "06:48", "13:18"]]],
    ["R-M2", "خط الملقا والصحافة", 1, 3200, [["الملقا — طريق الملك فهد", 24.8032, 46.6192, "06:20", "13:45"], ["الملقا — شارع الأمير محمد", 24.7985, 46.6288, "06:30", "13:36"], ["الصحافة — مخرج ٥", 24.7879, 46.6533, "06:40", "13:26"]]],
    ["R-Q3", "خط القيروان وحطين (بنات)", 2, 3400, [["القيروان — شارع عبدالله العبدلي", 24.8398, 46.5794, "06:18", "13:50"], ["حطين — طريق الأمير تركي", 24.7613, 46.6021, "06:33", "13:35"], ["حطين — شارع العليا", 24.7688, 46.6147, "06:44", "13:24"]]],
    ["R-A4", "خط العارض (بنات)", 3, 3000, [["العارض — شارع الأمير نايف", 24.8693, 46.6108, "06:15", "13:55"], ["العارض — مدارس الحي", 24.8612, 46.6259, "06:27", "13:44"]]],
  ];
  const routes: Awaited<ReturnType<typeof transport.saveRoute>>[] = [];
  for (const [code, name, busIdx, fee, stops] of routeDefs) {
    routes.push(await transport.saveRoute(T.db, T.session, { code, name, busId: buses[busIdx]!.id, branchId: buses[busIdx]!.branchId, annualFeeMinor: SAR(fee), isActive: true, stops: stops.map(([n, lat, lng, mt, at]) => ({ name: n, lat, lng, morningTime: mt, afternoonTime: at })) }));
  }
  const routeFull = await Promise.all(routes.map((rt) => transport.getRoute(T.db, T.session, rt.id)));
  let riders = 0;
  const assign = async (s: { id: string }, ri: number, dir: "BOTH" | "MORNING" | "AFTERNOON", startDate: string) => {
    const stops = routeFull[ri]!.route.stops;
    try {
      await transport.assignStudent(T.db, T.session, { studentId: s.id, routeId: routes[ri]!.id, stopId: r.pick(stops).id, direction: dir, startDate });
      riders++;
    } catch {
      // ممتلئ
    }
  };
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const yearStart = toISODate(year.startDate, "UTC");
  for (const q of qarni) await assign(q, q.branchId === girls.id ? 2 : 0, "BOTH", yearStart);
  for (const s of shuffle(students.filter((x) => x.branchId === boys.id && !qarni.some((q) => q.id === x.id))).slice(0, 44)) await assign(s, r.int(0, 1), r.int(0, 5) ? "BOTH" : "MORNING", r.int(0, 4) ? yearStart : daysAgo(today, r.int(5, 20)));
  for (const s of shuffle(students.filter((x) => x.branchId === girls.id && !qarni.some((q) => q.id === x.id))).slice(0, 40)) await assign(s, r.int(2, 3), "BOTH", yearStart);
  for (const [i, bus] of buses.entries()) {
    await transport.addBusLog(T.db, T.session, { busId: bus.id, kind: "FUEL", date: daysAgo(today, 7), odometer: 84_000 + i * 12_500, costMinor: SAR(420 + i * 35), description: "تعبئة ديزل أسبوعية", paidFrom: "CASH" });
    await transport.addBusLog(T.db, T.session, { busId: bus.id, kind: "FUEL", date: daysAgo(today, 1), odometer: 84_600 + i * 12_500, costMinor: SAR(405 + i * 30), description: "تعبئة ديزل أسبوعية", paidFrom: "CASH" });
  }
  await transport.addBusLog(T.db, T.session, { busId: buses[0]!.id, kind: "MAINTENANCE", date: daysAgo(today, 15), odometer: 83_700, costMinor: SAR(1_350), description: "تغيير زيت وفلاتر وفحص الفرامل", paidFrom: "BANK", bankAccountId: bank.id });
  await transport.addBusLog(T.db, T.session, { busId: buses[3]!.id, kind: "INSPECTION", date: daysAgo(today, 25), costMinor: SAR(150), description: "الفحص الفني الدوري", paidFrom: "CASH" });
  // رحلة صباح اليوم على خط النرجس: المشرفة وصلت المحطة الثانية
  const trip = await transport.startTrip(T.db, T.session, { routeId: routes[0]!.id, shift: "MORNING" });
  const s0 = routeFull[0]!.route.stops;
  await transport.arriveAtStop(T.db, T.session, { tripId: trip.id, stopId: s0[0]!.id });
  await transport.arriveAtStop(T.db, T.session, { tripId: trip.id, stopId: s0[1]!.id });
  for (const rd of routeFull[0]!.riders.slice(0, 6)) await transport.toggleBoarded(T.db, T.session, { tripId: trip.id, studentId: rd.studentId, boarded: true });
  console.log(`     ${riders} طالباً مسكناً`);

  // ------------------------------------------------------------------ المكتبة
  console.log("   • المكتبة…");
  const L = await A("librarian@demo.manassa.sa");
  const bookDefs: Array<[string, string, string, number, number]> = [
    ["رحلة إلى أعماق المحيط", "سلمى الحربي", "قصص وروايات", 2019, 4],
    ["أسرار النجوم والكواكب", "د. فهد المطيري", "علوم", 2021, 3],
    ["مغامرات سندباد الصغير", "نورة القحطاني", "قصص وروايات", 2018, 5],
    ["الرياضيات الممتعة", "أ. خالد الزهراني", "رياضيات", 2020, 3],
    ["موسوعة الحيوانات المصورة", "فريق التحرير", "مراجع", 2022, 2],
    ["قصص الأنبياء للناشئة", "عبدالله السالم", "ثقافة إسلامية", 2017, 6],
    ["كيف تعمل الأشياء", "د. سامر العلي", "علوم", 2020, 3],
    ["تعلم البرمجة بلغة بايثون", "م. ريم الشهري", "تقنية", 2023, 3],
    ["ديوان الشعر العربي للأطفال", "مختارات", "أدب", 2016, 2],
    ["جغرافيا العالم العربي", "د. ماجد العنزي", "اجتماعيات", 2019, 2],
    ["القراءة السريعة", "هدى العمري", "مهارات", 2021, 2],
    ["عالم الديناصورات", "فريق التحرير", "علوم", 2018, 4],
    ["The Little Prince", "Antoine de Saint-Exupéry", "English Readers", 2015, 3],
    ["Charlotte's Web", "E. B. White", "English Readers", 2016, 2],
    ["مذكرات طالب مجتهد", "بدر الدوسري", "قصص وروايات", 2022, 3],
    ["التاريخ الإسلامي المصور", "د. عبدالرحمن الشمري", "تاريخ", 2019, 2],
    ["تجارب علمية منزلية", "م. ليلى الحارثي", "علوم", 2023, 4],
    ["فن الخط العربي", "أ. إبراهيم البقمي", "فنون", 2017, 2],
  ];
  const books: Awaited<ReturnType<typeof library.saveBook>>[] = [];
  for (const [i, [title, author, category, year, copies]] of bookDefs.entries()) books.push(await library.saveBook(L.db, L.session, { title, author, category, year, isbn: fakeIsbn(i + 1), language: /[a-z]/i.test(title) ? "en" : "ar", callNumber: `${category.slice(0, 2)}-${100 + i}`, isDigital: false, newCopies: copies, shelf: `${"أبجد"[i % 4]}-${(i % 6) + 1}` }));
  for (const [title, url, category] of [["منصة عين التعليمية — الدروس المصورة", "https://ien.edu.sa", "موارد رقمية"], ["المكتبة الرقمية السعودية", "https://sdl.edu.sa", "موارد رقمية"], ["قاموس المعاني الإلكتروني", "https://www.almaany.com", "مراجع"]] as const) await library.saveBook(L.db, L.session, { title, category, isDigital: true, digitalUrl: url });
  const copies = await rootDb.libraryCopy.findMany({ where: { tenantId }, orderBy: { barcode: "asc" } });
  const readers = shuffle(students.filter((s) => s.branchId === girls.id)).slice(0, 30);
  let loanCount = 0;
  for (const [i, s] of readers.entries()) {
    const copy = copies[(i * 3) % copies.length]!;
    try {
      const loan = await library.checkout(L.db, L.session, { barcode: copy.barcode, studentId: s.id });
      loanCount++;
      // إعارات أقدم: بعضها متأخر
      const back = i % 5 === 0 ? 20 : i % 3 === 0 ? 10 : r.int(1, 6);
      await rootDb.libraryLoan.update({ where: { id: loan.id }, data: { loanedAt: new Date(Date.now() - back * 86_400_000), dueDate: new Date(`${daysAgo(today, back - 14)}T00:00:00Z`) } });
    } catch {
      // النسخة معارة
    }
  }
  // إرجاع متأخر بغرامة مفوترة لطالبتين
  const late = await rootDb.libraryLoan.findMany({ where: { tenantId, returnedAt: null, dueDate: { lt: new Date(`${today}T00:00:00Z`) } }, include: { copy: true }, take: 2 });
  for (const l of late) await library.checkin(L.db, L.session, { barcode: l.copy.barcode });
  // حجوزات، ومنها لابن ولي الأمر التجريبي
  const popular = books[0]!;
  const waitList = shuffle(students.filter((s) => s.branchId === girls.id)).slice(0, 2);
  for (const s of waitList) {
    try {
      await library.reserve(L.db, L.session, { bookId: popular.id, studentId: s.id });
    } catch {
      // حجز قائم
    }
  }
  if (qarni[0]) {
    try {
      const c = copies.find((x) => x.bookId === books[7]!.id)!;
      await library.checkout(L.db, L.session, { barcode: c.barcode, studentId: qarni[0].id });
      await library.reserve(parent.db, parent.session, { bookId: books[1]!.id, studentId: qarni[0].id });
    } catch {
      // لا بأس
    }
  }
  console.log(`     ${loanCount} إعارة`);

  // ------------------------------------------------------------------ الأمن والسلامة
  console.log("   • الأمن والعيادة…");
  const R = rec;
  const hosts = await rootDb.user.findMany({ where: { tenantId, roles: { some: { role: { key: { in: ["VP_STUDENTS", "COUNSELOR", "PRINCIPAL"] } } } } }, select: { id: true, name: true }, take: 3 });
  const visitorDefs: Array<[string, string, string, boolean, boolean]> = [
    ["فهد بن سعد العنزي", "مراجعة شؤون الطلاب — نقل ابنه", "ولي أمر", true, true],
    ["م. عادل الغامدي", "صيانة أجهزة الإنذار", "مؤسسة السلامة الأولى", true, false],
    ["د. منيرة الشهري", "زيارة إشرافية", "إدارة التعليم", true, false],
    ["ناصر بن علي القحطاني", "مقابلة المرشدة الطلابية", "ولي أمر", true, true],
    ["سلطان الدوسري", "توريد مواد المقصف", "شركة الغذاء الصحي", true, true],
  ];
  for (const [i, [name, purpose, company, now, out]] of visitorDefs.entries()) {
    const host = hosts[i % Math.max(1, hosts.length)];
    const v = await safety.registerVisitor(R.db, R.session, { fullName: name, idNumber: `10${String(40000000 + i * 1234567).slice(0, 8)}`, phone: `05${String(51000000 + i * 777).slice(0, 8)}`, company, purpose, hostName: host?.name ?? null, hostUserId: host?.id ?? null, branchId: girls.id, checkInNow: now });
    if (out) await safety.scanVisitor(R.db, R.session, v.badgeCode);
  }
  await safety.registerVisitor(R.db, R.session, { fullName: "أ. ريم العتيبي", purpose: "اجتماع لجنة الأمهات", company: "ولية أمر", branchId: girls.id, checkInNow: false, expectedAt: new Date(Date.now() + 2 * 3_600_000).toISOString() });
  if (qarni[0]) {
    const auth = await safety.saveAuthorized(parent.db, parent.session, { studentId: qarni[0].id, name: "سالم بن محمد القرني", relation: "عم", idNumber: "1098765432", phone: "0551239876", isActive: true });
    await safety.recordPickup(R.db, R.session, { studentId: qarni[0].id, authorizedPickupId: auth.id, verification: "ID_CHECK", idNumber: "1098765432", early: true, reason: "موعد في المستشفى" });
  }
  for (const s of shuffle(students.filter((x) => x.branchId === girls.id)).slice(0, 6)) {
    const g = await rootDb.studentGuardian.findFirst({ where: { studentId: s.id }, select: { guardianId: true } });
    if (g) await safety.recordPickup(R.db, R.session, { studentId: s.id, guardianId: g.guardianId, verification: "PHOTO", early: false });
  }
  const guard = R;
  const incidentDefs: Array<[string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", string, string, "OPEN" | "INVESTIGATING" | "CLOSED", number]> = [
    ["INJURY", "MEDIUM", "الساحة الخارجية", "سقوط طالب أثناء الفسحة وإصابة في الركبة، نُقل للعيادة وأُبلغ ولي أمره", "CLOSED", 9],
    ["FIGHT", "HIGH", "ممر الصف الثاني المتوسط", "مشاجرة بين طالبين بعد الحصة الخامسة، فُصل بينهما وأُحيلا للوكيل", "INVESTIGATING", 3],
    ["PROPERTY", "LOW", "دورات المياه — الدور الأول", "كسر مرآة في دورة المياه، فُتح بلاغ صيانة", "CLOSED", 14],
    ["BUS", "MEDIUM", "حافلة B-02 — طريق الملقا", "توقف الحافلة بسبب عطل فني لمدة ٢٠ دقيقة وأُبلغ أولياء الأمور", "OPEN", 1],
    ["SECURITY", "LOW", "البوابة الرئيسية", "محاولة دخول شخص دون تسجيل، رُفض دخوله وسُجلت بياناته", "CLOSED", 20],
  ];
  for (const [kind, severity, location, description, status, ago] of incidentDefs) await safety.saveIncident(guard.db, guard.session, { kind, severity, occurredAt: new Date(Date.now() - ago * 86_400_000).toISOString(), branchId: boys.id, location, description, involved: [], actionsTaken: status === "CLOSED" ? "أُغلق بعد التحقق واتخاذ الإجراء" : null, status: status === "CLOSED" ? "INVESTIGATING" : status, guardiansNotified: kind !== "SECURITY" });
  const toClose = await rootDb.safetyIncident.findMany({ where: { tenantId, actionsTaken: { not: null } } });
  const fa = await A("facilities@demo.manassa.sa");
  void fa;
  for (const i of toClose) await rootDb.safetyIncident.update({ where: { id: i.id }, data: { status: "CLOSED", closedAt: new Date() } });
  const own = await A("owner@demo.manassa.sa");
  for (const [kind, ago, dur, participants, status] of [["FIRE", 110, 262, 684, "DONE"], ["EVACUATION", 60, 238, 702, "DONE"], ["EQUIPMENT_CHECK", 30, 0, 0, "DONE"], ["EARTHQUAKE", 5, 0, 0, "SCHEDULED"], ["FIRE", -20, 0, 0, "SCHEDULED"]] as const) {
    await safety.saveDrill(own.db, own.session, { kind, branchId: boys.id, scheduledAt: new Date(Date.now() - ago * 86_400_000).toISOString(), conductedAt: status === "DONE" ? new Date(Date.now() - ago * 86_400_000).toISOString() : null, durationSeconds: status === "DONE" ? (dur || 900) : null, participants: participants || null, result: status === "DONE" ? "نجح الإخلاء ضمن الزمن المستهدف" : null, issues: kind === "EVACUATION" ? "تأخر فصل ٥/ب دقيقة لغياب المعلم" : null, status });
  }
  await safety.savePlan(own.db, own.session, { branchId: boys.id, title: "خطة إخلاء فرع البنين", assemblyPoints: "الملعب الخارجي (نقطة أ) والموقف الشمالي (نقطة ب)", description: "الأدوار العليا عبر الدرج الشرقي، الأرضي عبر البوابتين ٢ و٣. المعلم آخر من يغادر الفصل ومعه كشف الحضور.", reviewedAt: daysAgo(today, 200), nextReview: daysAgo(today, 10) });
  await safety.savePlan(own.db, own.session, { branchId: girls.id, title: "خطة إخلاء فرع البنات", assemblyPoints: "الساحة الداخلية الكبرى", description: "المسار الأخضر للدور الأول، الأزرق للثاني. المشرفات عند أبواب الطوارئ.", reviewedAt: daysAgo(today, 90), nextReview: daysAgo(today, -275) });

  const N = nurse;
  const medDefs: Array<[string, string, string, number, number, number]> = [
    ["باراسيتامول ٥٠٠ ملغ", "أقراص", "قرص", 180, 40, 300],
    ["شراب باراسيتامول للأطفال", "شراب", "عبوة", 6, 3, 200],
    ["لاصق جروح", "ضمادات", "قطعة", 220, 50, 700],
    ["محلول تعقيم", "سائل", "عبوة", 4, 3, 400],
    ["كمادات باردة", "كمادات", "قطعة", 12, 10, 500],
    ["مضاد حساسية (لوراتادين)", "أقراص", "قرص", 30, 20, 25],
  ];
  const meds = [];
  for (const [name, form, unit, qty, min, expiresIn] of medDefs) meds.push(await safety.saveMedicine(N.db, N.session, { name, form, unit, quantity: qty, minQty: min, expiryDate: daysAgo(today, -expiresIn), isActive: true }));
  const complaints: Array<[string, string, "RETURNED_TO_CLASS" | "RESTED" | "SENT_HOME" | "REFERRED", number | null, number]> = [
    ["صداع خفيف", "راحة ١٥ دقيقة وماء", "RETURNED_TO_CLASS", 368, 0],
    ["ارتفاع في الحرارة", "حرارة ٣٨٫٤، أُبلغ ولي الأمر للاستلام", "SENT_HOME", 384, 0],
    ["جرح بسيط في الإصبع", "تنظيف وتعقيم ولاصق", "RETURNED_TO_CLASS", null, 2],
    ["ألم في البطن", "راحة ومتابعة", "RESTED", 371, 0],
    ["التواء الكاحل أثناء الرياضة", "كمادات باردة وتثبيت، يُراجع طبيباً", "REFERRED", null, 4],
    ["حساسية جلدية", "مضاد حساسية بعد مراجعة الملف الصحي", "RETURNED_TO_CLASS", 366, 5],
  ];
  for (const [i, [complaint, notes, outcome, temp, medIdx]] of complaints.entries()) {
    const qBoy = qarni.find((q) => q.branchId === boys.id);
    const s = i === 1 && qBoy ? qBoy : r.pick(boysStudents);
    await safety.recordVisit(N.db, N.session, { studentId: s.id, complaint, notes, temperatureTenths: temp, outcome, notifyGuardian: outcome !== "RETURNED_TO_CLASS" || i === 1, medicines: complaint.includes("حرارة") ? [{ medicineId: meds[0]!.id, quantity: 1 }] : medIdx ? [{ medicineId: meds[medIdx]!.id, quantity: 1 }] : [] });
  }
  console.log("   ✓ بيانات العمليات جاهزة");
}
