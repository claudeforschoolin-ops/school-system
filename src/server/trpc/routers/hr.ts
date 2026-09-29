import { z } from "zod";
import * as eos from "@/server/services/hr/eos.service";
import * as employees from "@/server/services/hr/employees.service";
import * as payroll from "@/server/services/hr/payroll.service";
import * as performance from "@/server/services/hr/performance.service";
import * as recruitment from "@/server/services/hr/recruitment.service";
import * as time from "@/server/services/hr/time.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const month = z.string().regex(/^\d{4}-\d{2}$/, "الشهر بصيغة YYYY-MM");
const minor = z.number().int().min(0).max(1_000_000_000);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const category = z.enum(["ACADEMIC", "ADMIN", "SERVICES"]);
const opt = (s: z.ZodString) => s.nullish();
const file = z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500) });

const employeeInput = z.object({
  fullName: z.string().trim().min(5).max(120),
  gender: z.enum(["MALE", "FEMALE"]),
  birthDate: isoDate.nullish(),
  nationality: z.string().trim().min(2).max(3),
  maritalStatus: opt(z.string().max(20)),
  idType: z.enum(["NATIONAL_ID", "IQAMA", "PASSPORT"]),
  nationalId: opt(z.string().max(20)),
  idExpiry: isoDate.nullish(),
  passportNumber: opt(z.string().max(20)),
  passportExpiry: isoDate.nullish(),
  phone: opt(z.string().max(20)),
  email: z.string().email().max(120).nullish(),
  address: opt(z.string().max(300)),
  branchId: id.nullish(),
  departmentId: id.nullish(),
  positionId: id.nullish(),
  managerId: id.nullish(),
  category,
  hireDate: isoDate,
  bankName: opt(z.string().max(80)),
  iban: opt(z.string().max(34)),
  sponsor: opt(z.string().max(120)),
  shiftId: id.nullish(),
  gosiRegistered: z.boolean(),
  qualifications: z.array(z.object({ degree: z.string().max(80), major: z.string().max(80), institution: z.string().max(120), year: z.string().max(8) })).max(10).optional(),
  experiences: z.array(z.object({ employer: z.string().max(120), title: z.string().max(80), from: z.string().max(10), to: z.string().max(10) })).max(15).optional(),
  notes: opt(z.string().max(2000)),
});

const employeesRouter = router({
  options: authedProcedure.query(({ ctx }) => employees.hrOptions(ctx.db)),
  list: authedProcedure.input(z.object({ q: z.string().max(80).nullish(), status: z.string().max(20).nullish(), departmentId: id.nullish(), category: category.nullish() })).query(({ ctx, input }) => employees.listEmployees(ctx.db, ctx.session, input)),
  get: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => employees.getEmployee(ctx.db, ctx.session, input.id)),
  create: authedProcedure.input(employeeInput).mutation(({ ctx, input }) => employees.createEmployee(ctx.db, ctx.session, input)),
  update: authedProcedure.input(employeeInput.extend({ id })).mutation(({ ctx, input }) => {
    const { id: eid, ...rest } = input;
    return employees.updateEmployee(ctx.db, ctx.session, eid, rest);
  }),
  linkUser: authedProcedure.input(z.object({ employeeId: id, userId: id.nullable() })).mutation(({ ctx, input }) => employees.linkUser(ctx.db, ctx.session, input)),
  saveContract: authedProcedure
    .input(z.object({ id: id.nullish(), employeeId: id, type: z.enum(["FIXED", "UNLIMITED", "PART_TIME"]), startDate: isoDate, endDate: isoDate.nullish(), probationEnd: isoDate.nullish(), basicMinor: minor, housingMinor: minor, transportMinor: minor, otherAllowances: z.array(z.object({ name: z.string().trim().min(1).max(60), amountMinor: minor })).max(10), hoursPerDay: z.number().int().min(1).max(12), annualLeaveDays: z.number().int().min(21).max(60) }))
    .mutation(({ ctx, input }) => employees.saveContract(ctx.db, ctx.session, input)),
  org: authedProcedure.query(({ ctx }) => employees.orgStructure(ctx.db, ctx.session)),
  saveDepartment: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(80), parentId: id.nullable(), headEmployeeId: id.nullable(), category, costCenterId: id.nullable() }))
    .mutation(({ ctx, input }) => employees.saveDepartment(ctx.db, ctx.session, input)),
  deleteDepartment: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => employees.deleteDepartment(ctx.db, ctx.session, input.id)),
  savePosition: authedProcedure.input(z.object({ id: id.nullish(), departmentId: id, title: z.string().trim().min(2).max(80), headcount: z.number().int().min(0).max(500) })).mutation(({ ctx, input }) => employees.savePosition(ctx.db, ctx.session, input)),
  deletePosition: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => employees.deletePosition(ctx.db, ctx.session, input.id)),
  alerts: authedProcedure.query(({ ctx }) => {
    employees.requireHrView(ctx.session);
    return employees.expiryAlerts(ctx.db, ctx.session);
  }),
});

const recruitmentRouter = router({
  openings: authedProcedure.query(({ ctx }) => recruitment.listOpenings(ctx.db, ctx.session)),
  saveOpening: authedProcedure
    .input(z.object({ id: id.nullish(), title: z.string().trim().min(2).max(120), departmentId: id.nullable(), positionId: id.nullable(), branchId: id.nullable(), description: z.string().max(4000).nullable(), requirements: z.string().max(4000).nullable(), openings: z.number().int().min(1).max(50), status: z.enum(["OPEN", "ON_HOLD", "CLOSED"]), closingDate: isoDate.nullable() }))
    .mutation(({ ctx, input }) => recruitment.saveOpening(ctx.db, ctx.session, input)),
  board: authedProcedure.input(z.object({ openingId: id.nullish() })).query(({ ctx, input }) => recruitment.board(ctx.db, ctx.session, input.openingId ?? null)),
  saveApplication: authedProcedure
    .input(z.object({ id: id.nullish(), openingId: id, fullName: z.string().trim().min(5).max(120), email: z.string().email().max(120).nullable(), phone: z.string().max(20).nullable(), nationality: z.string().min(2).max(3), gender: z.enum(["MALE", "FEMALE"]), qualification: z.string().max(120).nullable(), experienceYears: z.number().int().min(0).max(50), rating: z.number().int().min(1).max(5).nullable(), interviewAt: z.coerce.date().nullable(), offerSalaryMinor: minor.nullable(), notes: z.string().max(4000).nullable(), cv: file.nullish() }))
    .mutation(({ ctx, input }) => recruitment.saveApplication(ctx.db, ctx.session, input)),
  move: authedProcedure.input(z.object({ id, stage: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]), position: z.number() })).mutation(({ ctx, input }) => recruitment.moveApplication(ctx.db, ctx.session, input)),
  hire: authedProcedure
    .input(z.object({ applicationId: id, hireDate: isoDate, category, departmentId: id.nullable(), positionId: id.nullable(), branchId: id.nullable(), managerId: id.nullable(), basicMinor: minor.min(1), housingMinor: minor, transportMinor: minor, contractType: z.enum(["FIXED", "UNLIMITED"]), contractMonths: z.number().int().min(1).max(60) }))
    .mutation(({ ctx, input }) => recruitment.hire(ctx.db, ctx.session, input)),
});

const staffStatus = z.enum(["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "HOLIDAY", "EXCUSED"]);
const timeRouter = router({
  shifts: authedProcedure.query(({ ctx }) => time.listShifts(ctx.db)),
  saveShift: authedProcedure.input(z.object({ id: id.nullish(), name: z.string().trim().min(2).max(60), startTime: hhmm, endTime: hhmm, graceMinutes: z.number().int().min(0).max(60), workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), isDefault: z.boolean() })).mutation(({ ctx, input }) => time.saveShift(ctx.db, ctx.session, input)),
  day: authedProcedure.input(z.object({ date: isoDate, departmentId: id.nullish() })).query(({ ctx, input }) => time.daySheet(ctx.db, ctx.session, input)),
  month: authedProcedure.input(z.object({ month })).query(({ ctx, input }) => time.monthGrid(ctx.db, ctx.session, input)),
  set: authedProcedure.input(z.object({ employeeId: id, date: isoDate, status: staffStatus, checkIn: hhmm.nullish(), checkOut: hhmm.nullish(), note: z.string().max(300).nullish() })).mutation(({ ctx, input }) => time.setAttendance(ctx.db, ctx.session, input)),
  markAllPresent: authedProcedure.input(z.object({ date: isoDate })).mutation(({ ctx, input }) => time.markAllPresent(ctx.db, ctx.session, input)),
  check: authedProcedure.input(z.object({ kind: z.enum(["IN", "OUT"]) })).mutation(({ ctx, input }) => time.selfCheck(ctx.db, ctx.session, input.kind)),
  import: authedProcedure.input(z.object({ rows: z.array(z.object({ number: z.number().int().min(1), date: z.string().max(10), checkIn: hhmm.nullable(), checkOut: hhmm.nullable() })).max(5000) })).mutation(({ ctx, input }) => time.importAttendance(ctx.db, ctx.session, input.rows)),
  leaveTypes: authedProcedure.query(({ ctx }) => time.listLeaveTypes(ctx.db, ctx.session)),
  saveLeaveType: authedProcedure
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(60), paid: z.boolean(), annualDays: z.number().int().min(0).max(365).nullable(), requiresAttachment: z.boolean(), maxPerRequest: z.number().int().min(1).max(365).nullable(), carryOverDays: z.number().int().min(0).max(60), gender: z.enum(["MALE", "FEMALE"]).nullable(), color: z.string().max(20), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => time.saveLeaveType(ctx.db, ctx.session, input)),
  balances: authedProcedure.input(z.object({ employeeId: id, year: z.number().int().min(2000).max(2100) })).query(({ ctx, input }) => time.balancesFor(ctx.db, ctx.session, input.employeeId, input.year)),
  adjustBalance: authedProcedure.input(z.object({ balanceId: id, adjustedDays: z.number().int().min(-60).max(60), reason: z.string().trim().min(3).max(300) })).mutation(({ ctx, input }) => time.adjustBalance(ctx.db, ctx.session, input)),
  leaves: authedProcedure.input(z.object({ status: z.string().max(20).nullish(), mine: z.boolean().optional() })).query(({ ctx, input }) => time.listLeaveRequests(ctx.db, ctx.session, input)),
  requestLeave: authedProcedure.input(z.object({ employeeId: id.nullish(), leaveTypeId: id, startDate: isoDate, endDate: isoDate, reason: z.string().max(1000).nullish(), attachments: z.array(file).max(5).optional() })).mutation(({ ctx, input }) => time.requestLeave(ctx.db, ctx.session, input)),
  cancelLeave: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => time.cancelLeave(ctx.db, ctx.session, input.id)),
  me: authedProcedure.query(({ ctx }) => time.selfService(ctx.db, ctx.session)),
});

const payrollRouter = router({
  options: authedProcedure.query(({ ctx }) => payroll.payrollOptions(ctx.db, ctx.session)),
  runs: authedProcedure.query(({ ctx }) => payroll.listRuns(ctx.db, ctx.session)),
  run: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => payroll.getRun(ctx.db, ctx.session, input.id)),
  create: authedProcedure.input(z.object({ month, notes: z.string().max(500).nullish() })).mutation(({ ctx, input }) => payroll.createRun(ctx.db, ctx.session, input)),
  recalc: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => payroll.recalcRun(ctx.db, ctx.session, input.id)),
  submit: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => payroll.submitRun(ctx.db, ctx.session, input.id)),
  cancel: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => payroll.cancelRun(ctx.db, ctx.session, input.id)),
  pay: authedProcedure.input(z.object({ id, bankAccountId: id, date: isoDate })).mutation(({ ctx, input }) => payroll.payRun(ctx.db, ctx.session, input)),
  wps: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => payroll.wpsFile(ctx.db, ctx.session, input.id)),
  payslip: authedProcedure.input(z.object({ lineId: id })).query(({ ctx, input }) => payroll.payslip(ctx.db, ctx.session, input.lineId)),
  adjustments: authedProcedure.input(z.object({ month })).query(({ ctx, input }) => payroll.listAdjustments(ctx.db, ctx.session, input.month)),
  saveAdjustment: authedProcedure
    .input(z.object({ id: id.nullish(), employeeId: id, month, kind: z.enum(["BONUS", "OVERTIME", "PENALTY", "DEDUCTION", "ALLOWANCE"]), amountMinor: minor, hours: z.number().int().min(1).max(200).nullable(), description: z.string().trim().min(3).max(200) }))
    .mutation(({ ctx, input }) => payroll.saveAdjustment(ctx.db, ctx.session, input)),
  deleteAdjustment: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => payroll.deleteAdjustment(ctx.db, ctx.session, input.id)),
  loans: authedProcedure.query(({ ctx }) => payroll.listLoans(ctx.db, ctx.session)),
  requestLoan: authedProcedure.input(z.object({ employeeId: id.nullish(), amountMinor: minor.min(1), installmentMinor: minor.min(1), startMonth: month, reason: z.string().trim().min(3).max(500) })).mutation(({ ctx, input }) => payroll.requestLoan(ctx.db, ctx.session, input)),
  disburseLoan: authedProcedure.input(z.object({ id, bankAccountId: id, date: isoDate })).mutation(({ ctx, input }) => payroll.disburseLoan(ctx.db, ctx.session, input)),
});

const performanceRouter = router({
  templates: authedProcedure.query(({ ctx }) => performance.templates(ctx.db, ctx.session)),
  saveTemplate: authedProcedure.input(z.object({ id: id.nullish(), name: z.string().trim().min(2).max(80), criteria: z.array(z.object({ key: z.string().trim().min(1).max(30), name: z.string().trim().min(2).max(80), weight: z.number().int().min(1).max(100), description: z.string().max(300).optional() })).min(1).max(12) })).mutation(({ ctx, input }) => performance.saveTemplate(ctx.db, ctx.session, input)),
  cycles: authedProcedure.query(({ ctx }) => performance.listCycles(ctx.db, ctx.session)),
  createCycle: authedProcedure.input(z.object({ name: z.string().trim().min(2).max(80), templateId: id, startDate: isoDate, endDate: isoDate })).mutation(({ ctx, input }) => performance.createCycle(ctx.db, ctx.session, input)),
  cycle: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => performance.cycleDetail(ctx.db, ctx.session, input.id)),
  closeCycle: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => performance.closeCycle(ctx.db, ctx.session, input.id)),
  review: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => performance.getReview(ctx.db, ctx.session, input.id)),
  submitSelf: authedProcedure.input(z.object({ id, scores: z.record(z.string(), z.number().int().min(1).max(5)), goals: z.array(z.object({ title: z.string().trim().min(2).max(120), target: z.string().max(200), progressBp: z.number().int().min(0).max(10000) })).max(10), comment: z.string().max(2000).nullable() })).mutation(({ ctx, input }) => performance.submitSelf(ctx.db, ctx.session, input)),
  submitManager: authedProcedure.input(z.object({ id, scores: z.record(z.string(), z.number().int().min(1).max(5)), comment: z.string().max(2000).nullable() })).mutation(({ ctx, input }) => performance.submitManager(ctx.db, ctx.session, input)),
});

const eosReason = z.enum(["RESIGNATION", "TERMINATION", "CONTRACT_END", "RETIREMENT", "DEATH", "ARTICLE_80"]);
const eosRouter = router({
  list: authedProcedure.query(({ ctx }) => eos.listSettlements(ctx.db, ctx.session)),
  get: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => eos.getSettlement(ctx.db, ctx.session, input.id)),
  preview: authedProcedure.input(z.object({ employeeId: id, reason: eosReason, lastWorkingDay: isoDate, otherDeductionsMinor: minor.optional() })).query(({ ctx, input }) => eos.previewEos(ctx.db, ctx.session, input)),
  create: authedProcedure.input(z.object({ employeeId: id, reason: eosReason, lastWorkingDay: isoDate, otherDeductionsMinor: minor.optional(), notes: z.string().max(1000).nullish() })).mutation(({ ctx, input }) => eos.createSettlement(ctx.db, ctx.session, input)),
  pay: authedProcedure.input(z.object({ id, bankAccountId: id, date: isoDate })).mutation(({ ctx, input }) => eos.payEos(ctx.db, ctx.session, input)),
});

export const hrRouter = router({
  employees: employeesRouter,
  recruitment: recruitmentRouter,
  time: timeRouter,
  payroll: payrollRouter,
  performance: performanceRouter,
  eos: eosRouter,
});
