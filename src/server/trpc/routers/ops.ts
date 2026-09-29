/**
 * موجّهات المرحلة ٥: الموازنة، الأصول الثابتة، المخزون، المشتريات، نقطة البيع والمحافظ، الصيانة والحجوزات،
 * المواصلات، المكتبة، الأمن والسلامة، والعيادة. الصلاحيات تُفحص في الخدمات.
 */
import { z } from "zod";
import * as assets from "@/server/services/finance/assets.service";
import * as budget from "@/server/services/finance/budget.service";
import * as inventory from "@/server/services/ops/inventory.service";
import * as library from "@/server/services/ops/library.service";
import * as maintenance from "@/server/services/ops/maintenance.service";
import * as pos from "@/server/services/ops/pos.service";
import * as procurement from "@/server/services/ops/procurement.service";
import * as safety from "@/server/services/ops/safety.service";
import * as transport from "@/server/services/ops/transport.service";
import { opsLookups, requireOps } from "@/server/services/ops/common";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const month = z.string().regex(/^\d{4}-\d{2}$/, "الشهر بصيغة YYYY-MM");
const minor = z.number().int().min(0).max(1_000_000_000);
const qty = z.number().int().min(1).max(1_000_000);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
const opt = (max: number) => z.string().trim().max(max).nullish();
const photo = z.object({ url: z.string().max(500), name: z.string().max(255).optional() });
const itemCategory = z.enum(["UNIFORM", "BOOK", "SUPPLY", "CANTEEN", "SPARE_PART", "MEDICAL", "OTHER"]);
const paidFrom = z.enum(["CASH", "BANK", "AP"]).nullish();

const p = authedProcedure;

export const budgetRouter = router({
  list: p.query(({ ctx }) => budget.listBudgets(ctx.db, ctx.session)),
  get: p.input(z.object({ id })).query(({ ctx, input }) => budget.getBudget(ctx.db, ctx.session, input.id)),
  save: p.input(z.object({ id: id.nullish(), fiscalYearId: id, name: text(120).min(2), notes: opt(500) })).mutation(({ ctx, input }) => budget.saveBudget(ctx.db, ctx.session, input)),
  setRow: p
    .input(z.object({ budgetId: id, accountId: id, costCenterId: id.nullable(), previousCostCenterId: id.nullish(), months: z.record(month, minor), remove: z.boolean().optional() }))
    .mutation(({ ctx, input }) => budget.setBudgetRow(ctx.db, ctx.session, input)),
  copy: p.input(z.object({ budgetId: id, source: z.union([z.object({ budgetId: id }), z.object({ actualFiscalYearId: id })]), upliftBp: z.number().int().min(-5000).max(10000) })).mutation(({ ctx, input }) => budget.copyBudget(ctx.db, ctx.session, input)),
  submit: p.input(z.object({ id })).mutation(({ ctx, input }) => budget.submitBudget(ctx.db, ctx.session, input.id)),
  vsActual: p.input(z.object({ budgetId: id.nullish() })).query(({ ctx, input }) => budget.budgetVsActual(ctx.db, ctx.session, input)),
  check: p.input(z.object({ accountId: id, costCenterId: id.nullish(), date: isoDate, amountMinor: minor })).query(({ ctx, input }) => budget.checkBudget(ctx.db, ctx.session, { ...input, date: new Date(`${input.date}T00:00:00Z`) }).catch((e: Error) => ({ state: "BLOCKED", message: e.message, budgetMinor: 0, afterMinor: 0 }))),
});

const assetInput = z.object({
  name: text(160).min(2),
  categoryId: id,
  tag: opt(40),
  serialNumber: opt(80),
  branchId: id.nullish(),
  roomId: id.nullish(),
  location: opt(160),
  custodianId: id.nullish(),
  supplierId: id.nullish(),
  purchaseDate: isoDate,
  inServiceDate: isoDate.nullish(),
  costMinor: minor,
  salvageMinor: minor,
  usefulLifeMonths: z.number().int().min(1).max(1200).nullish(),
  method: z.enum(["STRAIGHT_LINE", "DECLINING", "NONE"]).nullish(),
  fundedBy: z.enum(["BANK", "CASH", "AP", "OPENING"]),
  bankAccountId: id.nullish(),
  openingAccumulatedMinor: minor.optional(),
  openingDepreciatedTo: month.nullish(),
  notes: opt(500),
});

export const assetsRouter = router({
  list: p.input(z.object({ status: opt(20), categoryId: id.nullish(), q: opt(80) }).optional()).query(({ ctx, input }) => assets.listAssets(ctx.db, ctx.session, input ?? {})),
  get: p.input(z.object({ id })).query(({ ctx, input }) => assets.getAsset(ctx.db, ctx.session, input.id)),
  create: p.input(assetInput).mutation(({ ctx, input }) => assets.createAsset(ctx.db, ctx.session, input)),
  update: p.input(z.object({ id, name: text(160).min(2), serialNumber: opt(80), notes: opt(500), salvageMinor: minor.optional(), usefulLifeMonths: z.number().int().min(1).max(1200).optional() })).mutation(({ ctx, input }) => assets.updateAsset(ctx.db, ctx.session, input.id, input)),
  transfer: p.input(z.object({ id, branchId: id.nullish(), roomId: id.nullish(), location: opt(160), custodianId: id.nullish(), date: isoDate, notes: opt(300) })).mutation(({ ctx, input }) => assets.transferAsset(ctx.db, ctx.session, input.id, input)),
  dispose: p.input(z.object({ id, date: isoDate, proceedsMinor: minor, receivedIn: z.enum(["CASH", "BANK", "NONE"]), bankAccountId: id.nullish(), reason: text(300).min(3) })).mutation(({ ctx, input }) => assets.disposeAsset(ctx.db, ctx.session, input.id, input)),
  categories: p.query(({ ctx }) => assets.listCategories(ctx.db, ctx.session)),
  saveCategory: p
    .input(z.object({ id: id.nullish(), code: text(20).min(1), name: text(80).min(2), assetAccountId: id, accumAccountId: id, expenseAccountId: id, method: z.enum(["STRAIGHT_LINE", "DECLINING", "NONE"]), usefulLifeMonths: z.number().int().min(1).max(1200), decliningRateBp: z.number().int().min(100).max(10000).nullish(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => assets.saveCategory(ctx.db, ctx.session, input)),
  runs: p.query(({ ctx }) => assets.depreciationRuns(ctx.db, ctx.session)),
  depreciate: p.input(z.object({ month })).mutation(({ ctx, input }) => assets.runDepreciation(ctx.db, ctx.session, input.month)),
});

const lines = z.array(z.object({ itemId: id, quantity: qty })).min(1).max(200);

export const inventoryRouter = router({
  dashboard: p.query(({ ctx }) => inventory.inventoryDashboard(ctx.db, ctx.session)),
  items: p.input(z.object({ category: opt(20), q: opt(80), warehouseId: id.nullish(), sellable: z.boolean().nullish(), lowOnly: z.boolean().optional() }).optional()).query(({ ctx, input }) => inventory.listItems(ctx.db, ctx.session, input ?? {})),
  item: p.input(z.object({ id })).query(({ ctx, input }) => inventory.getItem(ctx.db, ctx.session, input.id)),
  saveItem: p
    .input(z.object({ id: id.nullish(), sku: text(40).min(1), barcode: opt(40), name: text(160).min(2), category: itemCategory, unit: text(20), minQty: z.number().int().min(0), reorderQty: z.number().int().min(0), sellable: z.boolean(), salePriceMinor: minor.nullish(), taxCodeId: id.nullish(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => inventory.saveItem(ctx.db, ctx.session, input)),
  warehouses: p.query(({ ctx }) => inventory.listWarehouses(ctx.db, ctx.session)),
  saveWarehouse: p.input(z.object({ id: id.nullish(), code: text(20).min(1), name: text(80).min(2), kind: z.enum(["STORE", "SUPPLIES", "CANTEEN", "MAINTENANCE", "CLINIC"]), branchId: id.nullish(), isActive: z.boolean() })).mutation(({ ctx, input }) => inventory.saveWarehouse(ctx.db, ctx.session, input)),
  opening: p.input(z.object({ itemId: id, warehouseId: id, quantity: qty, unitCostMinor: minor, date: isoDate })).mutation(({ ctx, input }) => inventory.openingStock(ctx.db, ctx.session, input)),
  issue: p.input(z.object({ warehouseId: id, date: isoDate, branchId: id.nullish(), requestedBy: opt(120), purpose: text(200).min(3), lines })).mutation(({ ctx, input }) => inventory.issueStock(ctx.db, ctx.session, input)),
  transfer: p.input(z.object({ fromId: id, toId: id, date: isoDate, lines, notes: opt(300) })).mutation(({ ctx, input }) => inventory.transferStock(ctx.db, ctx.session, input)),
  counts: p.query(({ ctx }) => inventory.listCounts(ctx.db, ctx.session)),
  count: p.input(z.object({ id })).query(({ ctx, input }) => inventory.getCount(ctx.db, ctx.session, input.id)),
  startCount: p.input(z.object({ warehouseId: id, date: isoDate, notes: opt(300) })).mutation(({ ctx, input }) => inventory.startCount(ctx.db, ctx.session, input)),
  setCountLines: p.input(z.object({ countId: id, lines: z.array(z.object({ id, countedQty: z.number().int().min(0).nullable() })).max(2000) })).mutation(({ ctx, input }) => inventory.setCountLines(ctx.db, ctx.session, input)),
  postCount: p.input(z.object({ id })).mutation(({ ctx, input }) => inventory.postCount(ctx.db, ctx.session, input.id)),
});

const orderLine = z.object({ itemId: id.nullish(), expenseAccountId: id.nullish(), description: text(200).min(1), quantity: qty, unitMinor: minor, taxBp: z.number().int().min(0).max(5000) });

export const procurementRouter = router({
  suppliers: p.input(z.object({ q: opt(80) }).optional()).query(({ ctx, input }) => procurement.listSuppliers(ctx.db, ctx.session, input ?? {})),
  supplier: p.input(z.object({ id })).query(({ ctx, input }) => procurement.getSupplier(ctx.db, ctx.session, input.id)),
  saveSupplier: p
    .input(z.object({ id: id.nullish(), name: text(160).min(2), taxNumber: opt(30), crNumber: opt(30), contactName: opt(120), phone: opt(30), email: opt(120), address: opt(300), iban: opt(34), paymentTermsDays: z.number().int().min(0).max(365), category: opt(60), notes: opt(500), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => procurement.saveSupplier(ctx.db, ctx.session, input)),
  rate: p.input(z.object({ supplierId: id, orderId: id.nullish(), quality: z.number().int(), delivery: z.number().int(), price: z.number().int(), comment: opt(300) })).mutation(({ ctx, input }) => procurement.rateSupplier(ctx.db, ctx.session, input)),
  requests: p.query(({ ctx }) => procurement.listRequests(ctx.db, ctx.session)),
  request: p.input(z.object({ id })).query(({ ctx, input }) => procurement.getRequest(ctx.db, ctx.session, input.id)),
  saveRequest: p
    .input(z.object({ id: id.nullish(), title: text(160).min(3), branchId: id.nullish(), neededBy: isoDate.nullish(), justification: opt(1000), lines: z.array(z.object({ itemId: id.nullish(), description: text(200).min(1), quantity: qty, estUnitMinor: minor })).min(1).max(100) }))
    .mutation(({ ctx, input }) => procurement.saveRequest(ctx.db, ctx.session, input)),
  submitRequest: p.input(z.object({ id })).mutation(({ ctx, input }) => procurement.submitRequest(ctx.db, ctx.session, input.id)),
  orders: p.input(z.object({ status: opt(20) }).optional()).query(({ ctx, input }) => procurement.listOrders(ctx.db, ctx.session, input ?? {})),
  order: p.input(z.object({ id })).query(({ ctx, input }) => procurement.getOrder(ctx.db, ctx.session, input.id)),
  createOrder: p
    .input(z.object({ supplierId: id, requestId: id.nullish(), warehouseId: id, orderDate: isoDate, expectedDate: isoDate.nullish(), notes: opt(500), lines: z.array(orderLine).min(1).max(100) }))
    .mutation(({ ctx, input }) => procurement.createOrder(ctx.db, ctx.session, input)),
  issueOrder: p.input(z.object({ id })).mutation(({ ctx, input }) => procurement.issueOrder(ctx.db, ctx.session, input.id)),
  cancelOrder: p.input(z.object({ id })).mutation(({ ctx, input }) => procurement.cancelOrder(ctx.db, ctx.session, input.id)),
  receive: p.input(z.object({ orderId: id, date: isoDate, notes: opt(300), lines: z.array(z.object({ orderLineId: id, quantity: z.number().int().min(0) })).min(1) })).mutation(({ ctx, input }) => procurement.receiveOrder(ctx.db, ctx.session, input)),
  bills: p.input(z.object({ status: opt(20), supplierId: id.nullish() }).optional()).query(({ ctx, input }) => procurement.listBills(ctx.db, ctx.session, input ?? {})),
  bill: p.input(z.object({ id })).query(({ ctx, input }) => procurement.getBill(ctx.db, ctx.session, input.id)),
  createBill: p
    .input(
      z.object({
        supplierId: id,
        orderId: id.nullish(),
        supplierRef: text(60).min(1),
        billDate: isoDate,
        dueDate: isoDate.nullish(),
        branchId: id.nullish(),
        orderLines: z.array(z.object({ orderLineId: id, quantity: z.number().int().min(0), unitMinor: minor })).optional(),
        directLines: z.array(z.object({ accountId: id, description: text(200).min(1), quantity: qty, unitMinor: minor, taxBp: z.number().int().min(0).max(5000) })).optional(),
        attachments: z.array(z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500) })).max(10).optional(),
      }),
    )
    .mutation(({ ctx, input }) => procurement.createBill(ctx.db, ctx.session, input)),
  pay: p.input(z.object({ billId: id, amountMinor: minor, date: isoDate, method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE"]), bankAccountId: id.nullish(), reference: opt(60) })).mutation(({ ctx, input }) => procurement.paySupplier(ctx.db, ctx.session, input)),
});

const posKind = z.enum(["STORE", "CANTEEN"]);

export const posRouter = router({
  catalog: p.input(z.object({ kind: posKind })).query(({ ctx, input }) => pos.posCatalog(ctx.db, ctx.session, input.kind)),
  menu: p.query(({ ctx }) => pos.canteenMenu(ctx.db, ctx.session)),
  sell: p
    .input(z.object({ kind: posKind, warehouseId: id, paymentMethod: z.enum(["CASH", "CARD", "STUDENT_ACCOUNT", "WALLET"]), studentId: id.nullish(), customerName: opt(120), lines }))
    .mutation(({ ctx, input }) => pos.createSale(ctx.db, ctx.session, input)),
  void: p.input(z.object({ id, reason: text(200).min(3) })).mutation(({ ctx, input }) => pos.voidSale(ctx.db, ctx.session, input.id, input.reason)),
  sales: p.input(z.object({ kind: posKind, from: isoDate.nullish(), to: isoDate.nullish() })).query(({ ctx, input }) => pos.listSales(ctx.db, ctx.session, input)),
  sale: p.input(z.object({ id })).query(({ ctx, input }) => pos.getSale(ctx.db, ctx.session, input.id)),
  wallets: p.input(z.object({ q: opt(80) })).query(({ ctx, input }) => pos.listWallets(ctx.db, ctx.session, input)),
  wallet: p.input(z.object({ studentId: id })).query(({ ctx, input }) => pos.getWallet(ctx.db, ctx.session, input.studentId)),
  myWallets: p.query(({ ctx }) => pos.myWallets(ctx.db, ctx.session)),
  topUp: p.input(z.object({ studentId: id, amountMinor: minor, method: z.enum(["CASH", "CARD", "FROM_CREDIT"]), note: opt(200) })).mutation(({ ctx, input }) => pos.topUp(ctx.db, ctx.session, input)),
  setLimits: p
    .input(z.object({ studentId: id, dailyLimitMinor: minor.nullable(), blockedCategories: z.array(z.string().max(64)).max(50), notifyPurchases: z.boolean(), lowBalanceMinor: minor.nullable(), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => pos.setWalletLimits(ctx.db, ctx.session, input)),
  withdraw: p.input(z.object({ studentId: id, amountMinor: minor, reason: text(200).min(3) })).mutation(({ ctx, input }) => pos.withdraw(ctx.db, ctx.session, input)),
});

const maintCategory = z.enum(["ELECTRICAL", "PLUMBING", "HVAC", "CARPENTRY", "IT", "CLEANING", "SAFETY", "VEHICLE", "OTHER"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const maintenanceRouter = router({
  board: p.input(z.object({ branchId: id.nullish(), category: opt(20), assigneeId: id.nullish(), q: opt(80) }).optional()).query(({ ctx, input }) => maintenance.board(ctx.db, ctx.session, input ?? {})),
  get: p.input(z.object({ id })).query(({ ctx, input }) => maintenance.getRequest(ctx.db, ctx.session, input.id)),
  create: p
    .input(z.object({ title: text(160).min(3), description: opt(2000), category: maintCategory, priority, branchId: id.nullish(), roomId: id.nullish(), location: opt(160), assetId: id.nullish(), busId: id.nullish(), beforePhotos: z.array(photo).max(10).optional() }))
    .mutation(({ ctx, input }) => maintenance.createRequest(ctx.db, ctx.session, input)),
  update: p
    .input(z.object({ id, title: opt(160), description: opt(2000), category: maintCategory.optional(), priority: priority.optional(), status: z.enum(["NEW", "IN_PROGRESS", "WAITING_PARTS", "CANCELLED"]).optional(), assigneeId: id.nullish(), dueDate: isoDate.nullish(), resolution: opt(2000), afterPhotos: z.array(photo).max(10).optional(), beforePhotos: z.array(photo).max(10).optional(), position: z.number().optional(), vendorName: opt(120) }))
    .mutation(({ ctx, input }) => {
      const { id: rid, title, ...rest } = input;
      return maintenance.updateRequest(ctx.db, ctx.session, rid, { ...rest, ...(title ? { title } : {}) });
    }),
  parts: p.input(z.object({ id, warehouseId: id, lines })).mutation(({ ctx, input }) => maintenance.issueParts(ctx.db, ctx.session, input.id, input)),
  complete: p
    .input(z.object({ id, resolution: text(2000).min(3), afterPhotos: z.array(photo).max(10).optional(), externalCostMinor: minor, paidFrom, bankAccountId: id.nullish(), vendorName: opt(120) }))
    .mutation(({ ctx, input }) => maintenance.completeRequest(ctx.db, ctx.session, input.id, input)),
  schedules: p.query(({ ctx }) => maintenance.listSchedules(ctx.db, ctx.session)),
  saveSchedule: p
    .input(z.object({ id: id.nullish(), title: text(160).min(3), description: opt(1000), category: maintCategory, branchId: id.nullish(), roomId: id.nullish(), assetId: id.nullish(), busId: id.nullish(), assigneeId: id.nullish(), frequencyDays: z.number().int().min(1).max(730), nextDue: isoDate, isActive: z.boolean() }))
    .mutation(({ ctx, input }) => maintenance.saveSchedule(ctx.db, ctx.session, input)),
  runSchedules: p.mutation(({ ctx }) => {
    requireOps(ctx.session, "maintenance", "update");
    return maintenance.runSchedules(ctx.db, ctx.session);
  }),
  bookings: p.input(z.object({ weekStart: isoDate, roomId: id.nullish() })).query(({ ctx, input }) => maintenance.bookings(ctx.db, ctx.session, input)),
  book: p.input(z.object({ roomId: id, title: text(160).min(2), date: isoDate, startTime: hhmm, endTime: hhmm, notes: opt(300) })).mutation(({ ctx, input }) => maintenance.createBooking(ctx.db, ctx.session, input)),
  cancelBooking: p.input(z.object({ id })).mutation(({ ctx, input }) => maintenance.cancelBooking(ctx.db, ctx.session, input.id)),
  stats: p.query(({ ctx }) => maintenance.maintenanceStats(ctx.db, ctx.session)),
});

export const transportRouter = router({
  buses: p.query(({ ctx }) => transport.listBuses(ctx.db, ctx.session)),
  bus: p.input(z.object({ id })).query(({ ctx, input }) => transport.getBus(ctx.db, ctx.session, input.id)),
  saveBus: p
    .input(z.object({ id: id.nullish(), code: text(20).min(1), plateNumber: text(20).min(2), model: opt(60), year: z.number().int().min(1980).max(2100).nullish(), capacity: z.number().int(), branchId: id.nullish(), driverId: id.nullish(), supervisorId: id.nullish(), insuranceExpiry: isoDate.nullish(), licenseExpiry: isoDate.nullish(), inspectionExpiry: isoDate.nullish(), status: z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]), notes: opt(500) }))
    .mutation(({ ctx, input }) => transport.saveBus(ctx.db, ctx.session, input)),
  addLog: p
    .input(z.object({ busId: id, kind: z.enum(["MAINTENANCE", "FUEL", "INSPECTION", "INSURANCE", "ACCIDENT"]), date: isoDate, odometer: z.number().int().min(0).nullish(), costMinor: minor, description: text(300).min(2), paidFrom, bankAccountId: id.nullish() }))
    .mutation(({ ctx, input }) => transport.addBusLog(ctx.db, ctx.session, input)),
  routes: p.query(({ ctx }) => transport.listRoutes(ctx.db, ctx.session)),
  route: p.input(z.object({ id })).query(({ ctx, input }) => transport.getRoute(ctx.db, ctx.session, input.id)),
  saveRoute: p
    .input(z.object({ id: id.nullish(), code: text(20).min(1), name: text(120).min(2), busId: id.nullish(), branchId: id.nullish(), annualFeeMinor: minor, isActive: z.boolean(), stops: z.array(z.object({ id: id.nullish(), name: text(120), lat: z.number().nullish(), lng: z.number().nullish(), morningTime: hhmm.nullish(), afternoonTime: hhmm.nullish() })).max(60) }))
    .mutation(({ ctx, input }) => transport.saveRoute(ctx.db, ctx.session, input)),
  assign: p.input(z.object({ studentId: id, routeId: id, stopId: id.nullish(), direction: z.enum(["BOTH", "MORNING", "AFTERNOON"]), startDate: isoDate, invoice: z.boolean().optional() })).mutation(({ ctx, input }) => transport.assignStudent(ctx.db, ctx.session, input)),
  endAssignment: p.input(z.object({ id, endDate: isoDate })).mutation(({ ctx, input }) => transport.endAssignment(ctx.db, ctx.session, input.id, input.endDate)),
  unassigned: p.input(z.object({ q: opt(80) })).query(({ ctx, input }) => transport.unassigned(ctx.db, ctx.session, input)),
  myTrips: p.query(({ ctx }) => transport.myTrips(ctx.db, ctx.session)),
  startTrip: p.input(z.object({ routeId: id, shift: z.enum(["MORNING", "AFTERNOON"]) })).mutation(({ ctx, input }) => transport.startTrip(ctx.db, ctx.session, input)),
  arrive: p.input(z.object({ tripId: id, stopId: id })).mutation(({ ctx, input }) => transport.arriveAtStop(ctx.db, ctx.session, input)),
  board: p.input(z.object({ tripId: id, studentId: id, boarded: z.boolean() })).mutation(({ ctx, input }) => transport.toggleBoarded(ctx.db, ctx.session, input)),
  completeTrip: p.input(z.object({ tripId: id })).mutation(({ ctx, input }) => transport.completeTrip(ctx.db, ctx.session, input.tripId)),
  family: p.query(({ ctx }) => transport.familyTransport(ctx.db, ctx.session)),
});

export const libraryRouter = router({
  books: p.input(z.object({ q: opt(120), category: opt(60), digital: z.boolean().nullish() }).optional()).query(({ ctx, input }) => library.listBooks(ctx.db, ctx.session, input ?? {})),
  book: p.input(z.object({ id })).query(({ ctx, input }) => library.getBook(ctx.db, ctx.session, input.id)),
  saveBook: p
    .input(z.object({ id: id.nullish(), isbn: opt(20), title: text(300).min(1), author: opt(200), publisher: opt(200), year: z.number().int().min(1000).max(2100).nullish(), category: opt(60), language: z.string().max(5).optional(), callNumber: opt(40), description: opt(2000), isDigital: z.boolean(), digitalUrl: opt(500), branchId: id.nullish(), newCopies: z.number().int().min(0).max(200).optional(), shelf: opt(40) }))
    .mutation(({ ctx, input }) => library.saveBook(ctx.db, ctx.session, input)),
  addCopies: p.input(z.object({ bookId: id, count: z.number().int(), shelf: opt(40), priceMinor: minor.nullish() })).mutation(({ ctx, input }) => library.addCopies(ctx.db, ctx.session, input)),
  setCopyStatus: p.input(z.object({ copyId: id, status: z.enum(["AVAILABLE", "LOST", "DAMAGED", "WITHDRAWN"]), shelf: opt(40) })).mutation(({ ctx, input }) => library.setCopyStatus(ctx.db, ctx.session, input)),
  checkout: p.input(z.object({ barcode: text(40).min(1), studentId: id.nullish(), userId: id.nullish(), dueDate: isoDate.nullish() })).mutation(({ ctx, input }) => library.checkout(ctx.db, ctx.session, input)),
  checkin: p.input(z.object({ barcode: text(40).min(1), condition: z.enum(["GOOD", "DAMAGED"]).nullish(), notes: opt(300) })).mutation(({ ctx, input }) => library.checkin(ctx.db, ctx.session, input)),
  renew: p.input(z.object({ loanId: id })).mutation(({ ctx, input }) => library.renew(ctx.db, ctx.session, input.loanId)),
  waive: p.input(z.object({ loanId: id })).mutation(({ ctx, input }) => library.waiveFine(ctx.db, ctx.session, input.loanId)),
  circulation: p.input(z.object({ status: z.enum(["ACTIVE", "OVERDUE", "RETURNED"]).nullish(), q: opt(80) }).optional()).query(({ ctx, input }) => library.circulation(ctx.db, ctx.session, input ?? {})),
  family: p.query(({ ctx }) => library.familyLibrary(ctx.db, ctx.session)),
  reserve: p.input(z.object({ bookId: id, studentId: id.nullish() })).mutation(({ ctx, input }) => library.reserve(ctx.db, ctx.session, input)),
  cancelReservation: p.input(z.object({ id })).mutation(({ ctx, input }) => library.cancelReservation(ctx.db, ctx.session, input.id)),
  reservations: p.query(({ ctx }) => library.listReservations(ctx.db, ctx.session)),
  stockTake: p.query(({ ctx }) => library.currentStockTake(ctx.db, ctx.session)),
  startStockTake: p.mutation(({ ctx }) => library.startStockTake(ctx.db, ctx.session)),
  scan: p.input(z.object({ barcode: text(40).min(1) })).mutation(({ ctx, input }) => library.scanStockTake(ctx.db, ctx.session, input.barcode)),
  closeStockTake: p.input(z.object({ markMissingLost: z.boolean() })).mutation(({ ctx, input }) => library.closeStockTake(ctx.db, ctx.session, input)),
  stats: p.query(({ ctx }) => library.libraryStats(ctx.db, ctx.session)),
});

export const safetyRouter = router({
  visitors: p.input(z.object({ date: isoDate.nullish(), q: opt(80) })).query(({ ctx, input }) => safety.listVisitors(ctx.db, ctx.session, input)),
  register: p
    .input(z.object({ fullName: text(120).min(3), idNumber: opt(20), phone: opt(20), company: opt(120), purpose: text(200).min(2), hostName: opt(120), hostUserId: id.nullish(), branchId: id.nullish(), vehiclePlate: opt(20), expectedAt: z.string().max(40).nullish(), checkInNow: z.boolean(), notes: opt(300) }))
    .mutation(({ ctx, input }) => safety.registerVisitor(ctx.db, ctx.session, input)),
  scan: p.input(z.object({ code: text(20).min(4) })).mutation(({ ctx, input }) => safety.scanVisitor(ctx.db, ctx.session, input.code)),
  checkOut: p.input(z.object({ id })).mutation(({ ctx, input }) => safety.checkOutVisitor(ctx.db, ctx.session, input.id)),
  pickupInfo: p.input(z.object({ studentId: id })).query(({ ctx, input }) => safety.pickupInfo(ctx.db, ctx.session, input.studentId)),
  saveAuthorized: p
    .input(z.object({ id: id.nullish(), studentId: id, name: text(120).min(3), relation: text(40).min(2), idNumber: opt(20), phone: opt(20), photoUrl: opt(500), validUntil: isoDate.nullish(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => safety.saveAuthorized(ctx.db, ctx.session, input)),
  recordPickup: p
    .input(z.object({ studentId: id, guardianId: id.nullish(), authorizedPickupId: id.nullish(), verification: z.enum(["ID_CHECK", "PHOTO", "CODE"]), idNumber: opt(20), early: z.boolean(), reason: opt(300), notes: opt(300) }))
    .mutation(({ ctx, input }) => safety.recordPickup(ctx.db, ctx.session, input)),
  pickups: p.input(z.object({ date: isoDate.nullish() })).query(({ ctx, input }) => safety.pickupsToday(ctx.db, ctx.session, input)),
  incidents: p.input(z.object({ status: opt(20) })).query(({ ctx, input }) => safety.listIncidents(ctx.db, ctx.session, input)),
  saveIncident: p
    .input(
      z.object({
        id: id.nullish(),
        kind: z.enum(["INJURY", "FIGHT", "FIRE", "PROPERTY", "SECURITY", "HEALTH", "BUS", "OTHER"]),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        occurredAt: z.string().max(40),
        branchId: id.nullish(),
        location: text(160).min(2),
        description: text(3000),
        involved: z.array(z.object({ type: z.enum(["STUDENT", "STAFF", "OTHER"]), id: id.nullish(), name: text(120), role: opt(60) })).max(30),
        actionsTaken: opt(3000),
        status: z.enum(["OPEN", "INVESTIGATING", "CLOSED"]).optional(),
        guardiansNotified: z.boolean().optional(),
        attachments: z.array(z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500) })).max(10).optional(),
      }),
    )
    .mutation(({ ctx, input }) => safety.saveIncident(ctx.db, ctx.session, input)),
  drills: p.query(({ ctx }) => safety.listDrills(ctx.db, ctx.session)),
  saveDrill: p
    .input(z.object({ id: id.nullish(), kind: z.enum(["FIRE", "EVACUATION", "EARTHQUAKE", "LOCKDOWN", "EQUIPMENT_CHECK"]), branchId: id.nullish(), scheduledAt: z.string().max(40), conductedAt: z.string().max(40).nullish(), durationSeconds: z.number().int().min(1).max(36000).nullish(), participants: z.number().int().min(0).max(100000).nullish(), result: opt(1000), issues: opt(2000), status: z.enum(["SCHEDULED", "DONE", "MISSED"]) }))
    .mutation(({ ctx, input }) => safety.saveDrill(ctx.db, ctx.session, input)),
  savePlan: p
    .input(z.object({ id: id.nullish(), branchId: id.nullish(), title: text(160).min(2), assemblyPoints: opt(1000), description: opt(3000), fileUrl: opt(500), reviewedAt: isoDate.nullish(), nextReview: isoDate.nullish() }))
    .mutation(({ ctx, input }) => safety.savePlan(ctx.db, ctx.session, input)),
});

export const clinicRouter = router({
  dashboard: p.input(z.object({ date: isoDate.nullish(), studentId: id.nullish() })).query(({ ctx, input }) => safety.clinicDashboard(ctx.db, ctx.session, input)),
  patient: p.input(z.object({ studentId: id })).query(({ ctx, input }) => safety.patientInfo(ctx.db, ctx.session, input.studentId)),
  visit: p
    .input(z.object({ studentId: id.nullish(), employeeId: id.nullish(), patientName: opt(120), complaint: text(1000).min(3), notes: opt(2000), temperatureTenths: z.number().int().nullish(), outcome: z.enum(["RETURNED_TO_CLASS", "RESTED", "SENT_HOME", "REFERRED", "AMBULANCE"]), notifyGuardian: z.boolean(), medicines: z.array(z.object({ medicineId: id, quantity: qty })).max(10) }))
    .mutation(({ ctx, input }) => safety.recordVisit(ctx.db, ctx.session, input)),
  saveMedicine: p
    .input(z.object({ id: id.nullish(), name: text(120).min(2), form: opt(40), unit: text(20), quantity: z.number().int().min(0), minQty: z.number().int().min(0), expiryDate: isoDate.nullish(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => safety.saveMedicine(ctx.db, ctx.session, input)),
});

export const opsRouter = router({
  lookups: p.query(({ ctx }) => opsLookups(ctx.db, ctx.session)),
});
