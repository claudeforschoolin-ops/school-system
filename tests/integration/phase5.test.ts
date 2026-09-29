import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { callerFor, makeUser, uid } from "./helpers";
import { makeSchool } from "./school-fixture";

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const prevMonth = (m: string) => {
  const [y = 2000, mm = 1] = m.split("-").map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
};

/** مجموع مدين/دائن قيد والتحقق من توازنه */
async function balanced(entryId: string) {
  const e = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: { include: { account: true } } } });
  const d = e.lines.reduce((s, l) => s + Number(l.debitMinor), 0);
  const c = e.lines.reduce((s, l) => s + Number(l.creditMinor), 0);
  expect(d).toBe(c);
  const by = (key: string, side: "debitMinor" | "creditMinor") => e.lines.filter((l) => l.account.systemKey === key).reduce((s, l) => s + Number(l[side]), 0);
  return { e, by };
}

async function opsSchool() {
  const s = await makeSchool();
  const users = {
    owner: await makeUser(s.t, "OWNER", { name: "المالك" }),
    principal: await makeUser(s.t, "PRINCIPAL", { name: "المدير" }),
    accountant: await makeUser(s.t, "ACCOUNTANT", { name: "المحاسب" }),
    procurement: await makeUser(s.t, "PROCUREMENT", { name: "مسؤول المشتريات" }),
    facilities: await makeUser(s.t, "FACILITIES", { branchId: s.branch.id, name: "مسؤول المرافق" }),
    transport: await makeUser(s.t, "TRANSPORT", { name: "مسؤول النقل" }),
    librarian: await makeUser(s.t, "LIBRARIAN", { branchId: s.branch.id, name: "أمين المكتبة" }),
    reception: await makeUser(s.t, "RECEPTION", { branchId: s.branch.id, name: "الاستقبال" }),
    nurse: await makeUser(s.t, "NURSE", { branchId: s.branch.id, name: "الممرضة" }),
    canteen: await makeUser(s.t, "CANTEEN", { branchId: s.branch.id, name: "المقصف" }),
    teacher: await makeUser(s.t, "TEACHER", { branchId: s.branch.id, name: "المعلم" }),
  };
  const as = async (u: { id: string }) => (await callerFor(s.tenantId, u.id)).caller;
  const acc = await as(users.accountant);
  const bank = await acc.finance.banking.saveAccount({ name: "الحساب الجاري", bankName: "البنك", iban: "SA0380000000608010167519", isActive: true });
  return { ...s, users, as, bank };
}

describe("المرحلة ٥ — المخزون والمشتريات", () => {
  it("طلب شراء ← اعتماد ← أمر ← استلام جزئي ← مطابقة ثلاثية ← سداد، والمتوسط المرجّح في الصرف والجرد", async () => {
    const s = await opsSchool();
    const pr = await s.as(s.users.procurement);
    const accountant = await s.as(s.users.accountant);
    const wh = await pr.inventory.saveWarehouse({ code: `W${uid()}`, name: "مستودع المستلزمات", kind: "SUPPLIES", branchId: s.branch.id, isActive: true });
    const paper = await pr.inventory.saveItem({ sku: `P${uid()}`, name: "ورق تصوير A4", category: "SUPPLY", unit: "رزمة", minQty: 20, reorderQty: 50, sellable: false, isActive: true });
    const supplier = await pr.procurement.saveSupplier({ name: "مؤسسة الأدوات المكتبية", paymentTermsDays: 30, isActive: true });

    // طلب شراء صغير: يعتمده المحاسب وحده (تحت حد المدير)
    const req = await pr.procurement.saveRequest({ title: "ورق للفصل الدراسي", branchId: s.branch.id, lines: [{ itemId: paper.id, description: "ورق A4", quantity: 100, estUnitMinor: 1500 }] });
    const sub = await pr.procurement.submitRequest({ id: req.id });
    await expect(pr.procurement.createOrder({ supplierId: supplier.id, requestId: req.id, warehouseId: wh.id, orderDate: today(), lines: [{ itemId: paper.id, description: "ورق A4", quantity: 100, unitMinor: 1500, taxBp: 1500 }] })).rejects.toThrow(/غير معتمد/);
    await accountant.approval.decide({ requestId: sub.approvalRequestId!, decision: "APPROVED" });
    expect((await rootDb.purchaseRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    const po = await pr.procurement.createOrder({ supplierId: supplier.id, requestId: req.id, warehouseId: wh.id, orderDate: today(), lines: [{ itemId: paper.id, description: "ورق A4", quantity: 100, unitMinor: 1500, taxBp: 1500 }] });
    await pr.procurement.issueOrder({ id: po.id });
    const line = (await pr.procurement.order({ id: po.id })).lines[0]!;

    // استلام جزئي ٦٠ ← المخزون ٦٠ بقيمة ٩٠٠٬٠٠ ودائن «مستلمة لم تُفوتر»
    const r1 = await pr.procurement.receive({ orderId: po.id, date: today(), lines: [{ orderLineId: line.id, quantity: 60 }] });
    expect(r1.status).toBe("PARTIAL");
    const g1 = await balanced(r1.receipt.journalEntryId!);
    expect(g1.by("GRNI", "creditMinor")).toBe(90_000);
    await expect(pr.procurement.receive({ orderId: po.id, date: today(), lines: [{ orderLineId: line.id, quantity: 41 }] })).rejects.toThrow(/يتجاوز المطلوب/);

    // المطابقة الثلاثية: لا فوترة لكمية لم تُستلم
    await expect(pr.procurement.createBill({ supplierId: supplier.id, orderId: po.id, supplierRef: "INV-77", billDate: today(), orderLines: [{ orderLineId: line.id, quantity: 70, unitMinor: 1500 }] })).rejects.toThrow(/لم تُستلم/);
    // فرق سعر خارج السماحية يحتاج صلاحية الاعتماد (مسؤول المشتريات يملكها بدوره)
    const bill = await pr.procurement.createBill({ supplierId: supplier.id, orderId: po.id, supplierRef: "INV-77", billDate: today(), orderLines: [{ orderLineId: line.id, quantity: 60, unitMinor: 1550 }] });
    expect(bill.bill.matchStatus).toBe("PRICE_VARIANCE");
    expect(bill.bill.varianceMinor).toBe(3_000);
    expect(bill.bill.taxMinor).toBe(13_950);
    const b = await balanced(bill.bill.journalEntryId!);
    expect(b.by("GRNI", "debitMinor")).toBe(90_000);
    expect(b.by("PURCHASE_VARIANCE", "debitMinor")).toBe(3_000);
    expect(b.by("VAT_INPUT", "debitMinor")).toBe(13_950);
    expect(b.by("AP", "creditMinor")).toBe(106_950);
    await expect(pr.procurement.createBill({ supplierId: supplier.id, orderId: po.id, supplierRef: "INV-77", billDate: today(), orderLines: [] , directLines: [{ accountId: g1.e.lines[0]!.accountId, description: "تكرار", quantity: 1, unitMinor: 1, taxBp: 0 }] })).rejects.toThrow(/مسجلة مسبقاً/);

    // سداد جزئي ثم كلي
    await pr.procurement.pay({ billId: bill.bill.id, amountMinor: 50_000, date: today(), method: "BANK_TRANSFER", bankAccountId: s.bank.id });
    await expect(pr.procurement.pay({ billId: bill.bill.id, amountMinor: 60_000, date: today(), method: "CASH" })).rejects.toThrow(/المتبقي/);
    await pr.procurement.pay({ billId: bill.bill.id, amountMinor: 56_950, date: today(), method: "CASH" });
    expect((await rootDb.supplierBill.findUniqueOrThrow({ where: { id: bill.bill.id } })).status).toBe("PAID");

    // استلام الباقي بسعر أمر الشراء ثم متوسط مرجّح
    await pr.procurement.receive({ orderId: po.id, date: today(), lines: [{ orderLineId: line.id, quantity: 40 }] });
    const item = await rootDb.inventoryItem.findUniqueOrThrow({ where: { id: paper.id } });
    expect(item.onHandQty).toBe(100);
    expect(item.stockValueMinor).toBe(150_000);

    // صرف ٣٣ رزمة لقسم: التكلفة ٤٩٬٥٠ ريالاً بالمتوسط
    const issue = await pr.inventory.issue({ warehouseId: wh.id, date: today(), branchId: s.branch.id, purpose: "قسم الرياضيات", lines: [{ itemId: paper.id, quantity: 33 }] });
    expect(issue.totalCostMinor).toBe(49_500);
    await expect(pr.inventory.issue({ warehouseId: wh.id, date: today(), purpose: "زيادة", lines: [{ itemId: paper.id, quantity: 68 }] })).rejects.toThrow(/فقط/);

    // جرد: عُدّ ٦٥ بدل ٦٧ ← عجز رزمتين بقيد
    const count = await pr.inventory.startCount({ warehouseId: wh.id, date: today() });
    const cd = await pr.inventory.count({ id: count.id });
    await pr.inventory.setCountLines({ countId: count.id, lines: cd.lines.map((l) => ({ id: l.id, countedQty: l.itemId === paper.id ? 65 : l.systemQty })) });
    const posted = await pr.inventory.postCount({ id: count.id });
    expect(posted.varianceMinor).toBe(-3_000);
    const cnt = await balanced(posted.journalEntryId!);
    expect(cnt.by("INVENTORY_VARIANCE", "debitMinor")).toBe(3_000);
    const after = await rootDb.inventoryItem.findUniqueOrThrow({ where: { id: paper.id } });
    expect(after.onHandQty).toBe(65);
    expect(after.stockValueMinor).toBe(97_500);
    // المعلم لا يرى المخزون
    await expect((await s.as(s.users.teacher)).inventory.items()).rejects.toThrow();
  });

  it("نقطة بيع المتجر: نقداً بقيد إيراد وتكلفة، وعلى حساب الطالب بفاتورة في كشف الأسرة", async () => {
    const s = await opsSchool();
    const pr = await s.as(s.users.procurement);
    const vat = await rootDb.taxCode.findFirstOrThrow({ where: { tenantId: s.tenantId, kind: "STANDARD" } });
    const wh = await pr.inventory.saveWarehouse({ code: `S${uid()}`, name: "المتجر", kind: "STORE", branchId: s.branch.id, isActive: true });
    const shirt = await pr.inventory.saveItem({ sku: `U${uid()}`, name: "قميص الزي", category: "UNIFORM", unit: "حبة", minQty: 0, reorderQty: 0, sellable: true, salePriceMinor: 6_000, taxCodeId: vat.id, isActive: true });
    await pr.inventory.opening({ itemId: shirt.id, warehouseId: wh.id, quantity: 10, unitCostMinor: 3_500, date: today() });
    const st = await s.student(s.g1.id, s.s1a.id);
    const sale = await pr.pos.sell({ kind: "STORE", warehouseId: wh.id, paymentMethod: "CASH", lines: [{ itemId: shirt.id, quantity: 2 }] });
    expect(sale.totalMinor).toBe(13_800);
    const e = await balanced(sale.journalEntryId!);
    expect(e.by("CASH", "debitMinor")).toBe(13_800);
    expect(e.by("VAT_OUTPUT", "creditMinor")).toBe(1_800);
    expect(e.by("COGS_STORE", "debitMinor")).toBe(7_000);
    const onAccount = await pr.pos.sell({ kind: "STORE", warehouseId: wh.id, paymentMethod: "STUDENT_ACCOUNT", studentId: st.id, lines: [{ itemId: shirt.id, quantity: 1 }] });
    const inv = await rootDb.invoice.findUniqueOrThrow({ where: { id: onAccount.invoiceId! } });
    expect(inv.studentId).toBe(st.id);
    expect(inv.totalMinor).toBe(6_900);
    await expect(pr.pos.sell({ kind: "STORE", warehouseId: wh.id, paymentMethod: "CASH", lines: [{ itemId: shirt.id, quantity: 8 }] })).rejects.toThrow(/فقط/);
  });
});

describe("المرحلة ٥ — المقصف ومحفظة الطالب", () => {
  it("شحن نقدي، شراء بالمحفظة مع حد يومي وفئات ممنوعة، رصيد لا يكون سالباً، وإلغاء يعيد الرصيد", async () => {
    const s = await opsSchool();
    const canteen = await s.as(s.users.canteen);
    const pr = await s.as(s.users.procurement);
    const wh = await pr.inventory.saveWarehouse({ code: `C${uid()}`, name: "مخزن المقصف", kind: "CANTEEN", branchId: s.branch.id, isActive: true });
    const juice = await pr.inventory.saveItem({ sku: `J${uid()}`, name: "عصير برتقال", category: "CANTEEN", unit: "علبة", minQty: 0, reorderQty: 0, sellable: true, salePriceMinor: 250, isActive: true });
    const chips = await pr.inventory.saveItem({ sku: `H${uid()}`, name: "رقائق", category: "CANTEEN", unit: "كيس", minQty: 0, reorderQty: 0, sellable: true, salePriceMinor: 300, isActive: true });
    await pr.inventory.opening({ itemId: juice.id, warehouseId: wh.id, quantity: 50, unitCostMinor: 120, date: today() });
    await pr.inventory.opening({ itemId: chips.id, warehouseId: wh.id, quantity: 50, unitCostMinor: 150, date: today() });
    const st = await s.student(s.g1.id, s.s1a.id);

    const top = await canteen.pos.topUp({ studentId: st.id, amountMinor: 2_000, method: "CASH" });
    expect(top.balanceAfterMinor).toBe(2_000);
    const w = await rootDb.studentWallet.findFirstOrThrow({ where: { studentId: st.id } });
    const te = await balanced(top.journalEntryId!);
    expect(te.by("STUDENT_WALLETS", "creditMinor")).toBe(2_000);
    await canteen.pos.setLimits({ studentId: st.id, dailyLimitMinor: 1_000, blockedCategories: [chips.id], notifyPurchases: true, lowBalanceMinor: 500 });

    const sale = await canteen.pos.sell({ kind: "CANTEEN", warehouseId: wh.id, paymentMethod: "WALLET", studentId: st.id, lines: [{ itemId: juice.id, quantity: 2 }] });
    expect(sale.totalMinor).toBe(500);
    const se = await balanced(sale.journalEntryId!);
    expect(se.by("STUDENT_WALLETS", "debitMinor")).toBe(500);
    expect(se.by("REV_CANTEEN", "creditMinor")).toBe(500);
    await expect(canteen.pos.sell({ kind: "CANTEEN", warehouseId: wh.id, paymentMethod: "WALLET", studentId: st.id, lines: [{ itemId: chips.id, quantity: 1 }] })).rejects.toThrow(/غير مسموح/);
    await expect(canteen.pos.sell({ kind: "CANTEEN", warehouseId: wh.id, paymentMethod: "WALLET", studentId: st.id, lines: [{ itemId: juice.id, quantity: 3 }] })).rejects.toThrow(/الحد اليومي/);
    await canteen.pos.setLimits({ studentId: st.id, dailyLimitMinor: null, blockedCategories: [], notifyPurchases: false, lowBalanceMinor: null });
    await expect(canteen.pos.sell({ kind: "CANTEEN", warehouseId: wh.id, paymentMethod: "WALLET", studentId: st.id, lines: [{ itemId: juice.id, quantity: 7 }] })).rejects.toThrow(/لا يكفي/);
    // قاعدة البيانات تمنع الرصيد السالب وتعديل الحركات حتى من العميل الجذري
    await expect(rootDb.studentWallet.update({ where: { id: w.id }, data: { balanceMinor: -1 } })).rejects.toThrow();
    const tx = await rootDb.walletTransaction.findFirstOrThrow({ where: { walletId: w.id } });
    await expect(rootDb.walletTransaction.update({ where: { id: tx.id }, data: { amountMinor: 1 } })).rejects.toThrow();

    // إلغاء البيع (بصلاحية الاعتماد) يعيد المخزون والرصيد
    await canteen.pos.void({ id: sale.id, reason: "خطأ في الإدخال" });
    expect((await rootDb.studentWallet.findUniqueOrThrow({ where: { id: w.id } })).balanceMinor).toBe(2_000);
    expect((await rootDb.inventoryItem.findUniqueOrThrow({ where: { id: juice.id } })).onHandQty).toBe(50);
    // المعلم لا يشحن ولا يبيع
    await expect((await s.as(s.users.teacher)).pos.topUp({ studentId: st.id, amountMinor: 100, method: "CASH" })).rejects.toThrow();
  });
});

describe("المرحلة ٥ — الأصول والموازنة", () => {
  it("أصل بقيد اقتناء، إهلاك شهري مجمّع لا يتكرر، واستبعاد بخسارة؛ والموازنة المعتمدة تمنع التجاوز حسب السياسة", async () => {
    const s = await opsSchool();
    const acc = await s.as(s.users.accountant);
    const principal = await s.as(s.users.principal);
    const cats = await acc.assets.categories();
    const furn = cats.categories.find((c) => c.code === "FURN")!;
    const start = `${prevMonth(prevMonth(thisMonth()))}-05`;
    const asset = await acc.assets.create({ name: "مكيف قاعة المسرح", categoryId: furn.id, branchId: s.branch.id, purchaseDate: start, costMinor: 1_200_000, salvageMinor: 0, usefulLifeMonths: 60, method: "STRAIGHT_LINE", fundedBy: "BANK", bankAccountId: s.bank.id });
    await balanced(asset.acquisitionEntryId!);
    // إهلاك الشهر السابق يستكمل الشهرين الفائتين (٢ × ٢٠٬٠٠٠)
    const run = await acc.assets.depreciate({ month: prevMonth(thisMonth()) });
    expect(run.totalMinor).toBe(40_000);
    const d = await balanced(run.entryId!);
    expect(d.by("DEPRECIATION", "debitMinor")).toBe(40_000);
    expect(d.by("ACCUMULATED_DEPRECIATION", "creditMinor")).toBe(40_000);
    await expect(acc.assets.depreciate({ month: prevMonth(thisMonth()) })).rejects.toThrow(/مسبقاً/);
    // الاستبعاد يتطلب صلاحية الاعتماد: المحاسب لا، المدير نعم
    await expect(acc.assets.dispose({ id: asset.id, date: today(), proceedsMinor: 100_000, receivedIn: "CASH", reason: "تلف" })).rejects.toThrow();
    const disposed = await principal.assets.dispose({ id: asset.id, date: today(), proceedsMinor: 100_000, receivedIn: "CASH", reason: "استبدال" });
    expect(disposed.disposalGainMinor).toBe(100_000 - (1_200_000 - 40_000));
    const x = await balanced(disposed.disposalEntryId!);
    expect(x.by("ASSET_LOSS", "debitMinor")).toBe(1_060_000);
    // قيد قاعدة البيانات: المجمع لا يتجاوز القيمة القابلة للإهلاك
    await expect(rootDb.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedMinor: 2_000_000 } })).rejects.toThrow();

    // الموازنة: مصروف صيانة ٥٠٠ ريال للعام بسياسة المنع
    const owner = await s.as(s.users.owner);
    await owner.moduleSettings.update({ key: "finance", patch: { budgetControl: "BLOCK" } });
    const fy = await rootDb.fiscalYear.findFirstOrThrow({ where: { tenantId: s.tenantId, startDate: { lte: new Date() }, endDate: { gte: new Date() } } });
    const acc2 = await s.as(s.users.accountant);
    const bud = await acc2.budget.save({ fiscalYearId: fy.id, name: "موازنة التشغيل" });
    const maint = await rootDb.account.findFirstOrThrow({ where: { tenantId: s.tenantId, systemKey: "MAINTENANCE_EXPENSE" } });
    await acc2.budget.setRow({ budgetId: bud.id, accountId: maint.id, costCenterId: null, months: { [thisMonth()]: 50_000 } });
    const sub = await acc2.budget.submit({ id: bud.id });
    await expect(acc2.budget.setRow({ budgetId: bud.id, accountId: maint.id, costCenterId: null, months: { [thisMonth()]: 1 } })).rejects.toThrow(/لا تُعدَّل/);
    const other = await makeUser(s.t, "ACCOUNTANT", { name: "محاسب ثان" });
    await (await s.as(other)).approval.decide({ requestId: sub.approvalRequestId!, decision: "APPROVED" });
    await principal.approval.decide({ requestId: sub.approvalRequestId!, decision: "APPROVED" });
    expect((await rootDb.budget.findUniqueOrThrow({ where: { id: bud.id } })).status).toBe("APPROVED");
    const fac = await s.as(s.users.facilities);
    const r = await fac.maintenance.create({ title: "إصلاح التكييف", category: "HVAC", priority: "HIGH", branchId: s.branch.id });
    await expect(fac.maintenance.complete({ id: r.id, resolution: "تبديل ضاغط", externalCostMinor: 60_000, paidFrom: "CASH" })).rejects.toThrow(/يتجاوز موازنة/);
    const ok = await fac.maintenance.complete({ id: r.id, resolution: "تنظيف وشحن غاز", externalCostMinor: 45_000, paidFrom: "CASH" });
    expect(ok.warning).toMatch(/٩٠٪/);
    const vs = await acc2.budget.get({ id: bud.id });
    expect(vs.rows[0]!.actualMinor).toBe(45_000);
    expect(vs.rows[0]!.state).toBe("WARNING");
  });
});

describe("المرحلة ٥ — الصيانة والنقل والمكتبة", () => {
  it("المعلم يبلّغ، المسؤول يسند ويصرف قطعاً، والحجز يمنع التعارض", async () => {
    const s = await opsSchool();
    const teacher = await s.as(s.users.teacher);
    const fac = await s.as(s.users.facilities);
    const room = await rootDb.room.create({ data: { tenantId: s.tenantId, branchId: s.branch.id, code: `LAB${uid()}`, name: "مختبر العلوم", kind: "LAB" } });
    const r = await teacher.maintenance.create({ title: "تسرب مياه في المختبر", category: "PLUMBING", priority: "URGENT", roomId: room.id });
    expect(r.branchId).toBe(s.branch.id);
    const board = await teacher.maintenance.board();
    expect(board.requests.map((x) => x.id)).toEqual([r.id]);
    await expect(teacher.maintenance.update({ id: r.id, assigneeId: s.users.facilities.id })).rejects.toThrow();
    await fac.maintenance.update({ id: r.id, assigneeId: s.users.facilities.id, status: "IN_PROGRESS" });
    const note = await rootDb.notification.findFirst({ where: { userId: s.users.facilities.id, entityId: r.id } });
    expect(note).toBeTruthy();
    const d = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await teacher.maintenance.book({ roomId: room.id, title: "تجربة عملية", date: d, startTime: "18:00", endTime: "19:00" });
    await expect(fac.maintenance.book({ roomId: room.id, title: "اجتماع", date: d, startTime: "18:30", endTime: "20:00" })).rejects.toThrow(/محجوزة/);
  });

  it("النقل: سعة الحافلة، فاتورة رسوم بنسبة المدة، ووصول المحطة يشعر أولياء أمور المحطة التالية", async () => {
    const s = await opsSchool();
    const tr = await s.as(s.users.transport);
    const bus = await tr.transport.saveBus({ code: `BUS${uid()}`, plateNumber: "أ ب ج 1234", capacity: 1, status: "ACTIVE" });
    const route = await tr.transport.saveRoute({ code: `R${uid()}`, name: "خط الشمال", busId: bus.id, annualFeeMinor: 300_000, isActive: true, stops: [{ name: "حي النرجس", morningTime: "06:30" }, { name: "حي الياسمين", morningTime: "06:45" }] });
    const full = await tr.transport.route({ id: route.id });
    const [stop1, stop2] = full.route.stops;
    const a = await s.student(s.g1.id, s.s1a.id);
    const b = await s.student(s.g1.id, s.s1a.id);
    const guardianUser = await makeUser(s.t, "PARENT", { name: "ولي أمر ب" });
    const link = await rootDb.studentGuardian.findFirstOrThrow({ where: { studentId: b.id } });
    await rootDb.guardian.update({ where: { id: link.guardianId }, data: { userId: guardianUser.id } });
    const res = await tr.transport.assign({ studentId: a.id, routeId: route.id, stopId: stop1!.id, direction: "BOTH", startDate: today() });
    expect(res.feeMinor).toBeGreaterThan(0);
    expect(res.feeMinor).toBeLessThanOrEqual(300_000);
    const inv = await rootDb.invoice.findUniqueOrThrow({ where: { id: res.assignment.invoiceId! } });
    expect(inv.source).toBe("TRANSPORT");
    await expect(tr.transport.assign({ studentId: b.id, routeId: route.id, stopId: stop2!.id, direction: "BOTH", startDate: today() })).rejects.toThrow(/ممتلئة/);
    await tr.transport.saveBus({ id: bus.id, code: bus.code, plateNumber: bus.plateNumber, capacity: 30, status: "ACTIVE" });
    await tr.transport.assign({ studentId: b.id, routeId: route.id, stopId: stop2!.id, direction: "MORNING", startDate: today(), invoice: false });
    const trip = await tr.transport.startTrip({ routeId: route.id, shift: "MORNING" });
    const arr = await tr.transport.arrive({ tripId: trip.id, stopId: stop1!.id });
    expect(arr.next).toBe("حي الياسمين");
    expect(arr.notified).toBe(1);
    const fam = await (await s.as(guardianUser)).transport.family();
    expect(fam[0]!.assignment?.stop?.name).toBe("حي الياسمين");
    expect(fam[0]!.assignment?.trips[0]?.currentStop).toBe("حي النرجس");
  });

  it("المكتبة: إعارة وحد أقصى، إرجاع متأخر بغرامة تُضاف لحساب الطالب، والحجز يُعرض عند الإرجاع", async () => {
    const s = await opsSchool();
    const lib = await s.as(s.users.librarian);
    const owner = await s.as(s.users.owner);
    await owner.moduleSettings.update({ key: "library", patch: { maxLoans: 1, finePerDayMinor: 100, fineCapMinor: 500, graceDays: 0 } });
    const lib2 = await s.as(s.users.librarian);
    await expect(lib2.library.saveBook({ title: "كتاب", isbn: "978-0-306-40615-6", isDigital: false })).rejects.toThrow(/ISBN/);
    const book = await lib2.library.saveBook({ title: "مغامرات في الفضاء", author: "كاتب", isbn: "978-0-306-40615-7", isDigital: false, newCopies: 1 });
    const copy = await rootDb.libraryCopy.findFirstOrThrow({ where: { bookId: book.id } });
    const a = await s.student(s.g1.id, s.s1a.id);
    const b = await s.student(s.g1.id, s.s1a.id);
    const loan = await lib2.library.checkout({ barcode: copy.barcode, studentId: a.id });
    await expect(lib2.library.checkout({ barcode: copy.barcode, studentId: b.id })).rejects.toThrow(/غير متاحة/);
    // حجز طالب آخر، ثم إرجاع متأخر ٧ أيام (الغرامة بحد ٥ ريالات)
    await lib2.library.reserve({ bookId: book.id, studentId: b.id });
    await rootDb.libraryLoan.update({ where: { id: loan.id }, data: { dueDate: new Date(Date.now() - 7 * 86_400_000) } });
    const back = await lib2.library.checkin({ barcode: copy.barcode });
    expect(back.lateDays).toBeGreaterThanOrEqual(7);
    expect(back.fineMinor).toBe(500);
    expect(back.invoiced).toBe(true);
    expect(back.heldFor).toContain("طالب");
    const l = await rootDb.libraryLoan.findUniqueOrThrow({ where: { id: loan.id } });
    const inv = await rootDb.invoice.findUniqueOrThrow({ where: { id: l.fineInvoiceId! } });
    expect(inv.studentId).toBe(a.id);
    expect(inv.totalMinor).toBe(500);
    // الطالب «أ» عليه غرامة غير مسددة فلا يستعير؛ النسخة محجوزة لـ «ب» فقط
    await expect(lib2.library.checkout({ barcode: copy.barcode, studentId: a.id })).rejects.toThrow(/محجوزة|غرامات/);
    await lib2.library.checkout({ barcode: copy.barcode, studentId: b.id });
    // قاعدة البيانات تمنع إعارتين مفتوحتين للنسخة
    await expect(rootDb.libraryLoan.create({ data: { tenantId: s.tenantId, copyId: copy.id, borrowerName: "x", dueDate: new Date() } })).rejects.toThrow();
  });
});

describe("المرحلة ٥ — الأمن والعيادة", () => {
  it("بطاقة الزائر دخول/خروج، الاستلام من مفوَّض بمطابقة الهوية، وزيارة العيادة مشفّرة ولا يراها غير المخوّل", async () => {
    const s = await opsSchool();
    const rec = await s.as(s.users.reception);
    const v = await rec.safety.register({ fullName: "خالد الزائر الأول", idNumber: "1234567890", purpose: "مراجعة شؤون الطلاب", checkInNow: false });
    expect(v.idLast4).toBe("7890");
    expect((await rec.safety.scan({ code: v.badgeCode })).action).toBe("IN");
    expect((await rec.safety.scan({ code: v.badgeCode })).action).toBe("OUT");
    await expect(rec.safety.scan({ code: v.badgeCode })).rejects.toThrow(/انتهت/);

    const st = await s.student(s.g1.id, s.s1a.id);
    const parentU = await makeUser(s.t, "PARENT", { name: "ولي الأمر" });
    const link = await rootDb.studentGuardian.findFirstOrThrow({ where: { studentId: st.id } });
    await rootDb.guardian.update({ where: { id: link.guardianId }, data: { userId: parentU.id } });
    const parent = await s.as(parentU);
    const auth = await parent.safety.saveAuthorized({ studentId: st.id, name: "سالم العم", relation: "عم", idNumber: "2233445566", isActive: true });
    await expect(rec.safety.recordPickup({ studentId: st.id, authorizedPickupId: auth.id, verification: "ID_CHECK", idNumber: "9999999999", early: false })).rejects.toThrow(/لا يطابق/);
    await expect(rec.safety.recordPickup({ studentId: st.id, authorizedPickupId: auth.id, verification: "ID_CHECK", idNumber: "2233445566", early: true })).rejects.toThrow(/سبب/);
    await rec.safety.recordPickup({ studentId: st.id, authorizedPickupId: auth.id, verification: "ID_CHECK", idNumber: "2233445566", early: true, reason: "موعد طبي" });
    expect(await rootDb.notification.count({ where: { userId: parentU.id, entityType: "StudentPickup" } })).toBe(1);
    // ولي أمر آخر لا يفوّض لطالب ليس ابنه
    const stranger = await makeUser(s.t, "PARENT", { name: "غريب" });
    await expect((await s.as(stranger)).safety.saveAuthorized({ studentId: st.id, name: "شخص ما", relation: "صديق", isActive: true })).rejects.toThrow();

    const nurse = await s.as(s.users.nurse);
    const med = await nurse.clinic.saveMedicine({ name: "باراسيتامول ٥٠٠", unit: "قرص", quantity: 20, minQty: 5, isActive: true });
    await nurse.clinic.visit({ studentId: st.id, complaint: "صداع وحرارة خفيفة", temperatureTenths: 381, outcome: "SENT_HOME", notifyGuardian: true, medicines: [{ medicineId: med.id, quantity: 1 }] });
    const raw = await rootDb.clinicVisit.findFirstOrThrow({ where: { studentId: st.id } });
    expect(raw.complaintEnc).not.toContain("صداع");
    const dash = await nurse.clinic.dashboard({ studentId: st.id });
    expect(dash.visits[0]!.complaint).toBe("صداع وحرارة خفيفة");
    expect((await rootDb.clinicMedicine.findUniqueOrThrow({ where: { id: med.id } })).quantity).toBe(19);
    await expect(rec.clinic.dashboard({})).rejects.toThrow();
    await expect(parent.clinic.dashboard({ studentId: st.id })).rejects.toThrow();
    const n = await rootDb.notification.findFirstOrThrow({ where: { userId: parentU.id, entityType: "ClinicVisit" } });
    expect(n.body).not.toContain("صداع");
  });
});
