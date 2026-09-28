import { z } from "zod";
import * as attendance from "@/server/services/attendance.service";
import * as behavior from "@/server/services/behavior.service";
import * as leaves from "@/server/services/leaves.service";
import * as transfers from "@/server/services/transfers.service";
import { behaviorOverview, transfersOverview } from "@/server/services/ops-overview.service";
import { systemDatabaseId } from "@/server/services/system-db.service";
import { authedProcedure, permissionProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const month = z.string().regex(/^\d{4}-\d{2}$/, "شهر غير صالح");
const status = z.enum(["PRESENT", "ABSENT", "LATE", "PERMISSION", "EXCUSED"]);
const fileValue = z.object({ id: z.string().max(64), name: z.string().max(255), url: z.string().max(500), size: z.number().optional(), mime: z.string().max(120).optional() });
const severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const attendanceRouter = router({
  sections: permissionProcedure("attendance", "view").input(z.object({ date: isoDate })).query(({ ctx, input }) => attendance.mySections(ctx.db, ctx.session, input.date)),
  rollCall: permissionProcedure("attendance", "view")
    .input(z.object({ sectionId: id, date: isoDate, period: z.number().int().min(0).max(12).optional() }))
    .query(({ ctx, input }) => attendance.rollCall(ctx.db, ctx.session, input)),
  save: permissionProcedure("attendance", "create")
    .input(
      z.object({
        sectionId: id,
        date: isoDate,
        period: z.number().int().min(0).max(12).optional(),
        entries: z.array(z.object({ studentId: id, status, reason: z.string().max(300).nullish(), minutesLate: z.number().int().min(0).max(240).nullish() })).max(80),
      }),
    )
    .mutation(({ ctx, input }) => attendance.saveRollCall(ctx.db, ctx.session, input)),
  day: permissionProcedure("attendance", "view").input(z.object({ date: isoDate })).query(({ ctx, input }) => attendance.dayBoard(ctx.db, ctx.session, input.date)),
  student: permissionProcedure("attendance", "view").input(z.object({ studentId: id, month: month.optional() })).query(({ ctx, input }) => attendance.studentAttendance(ctx.db, ctx.session, input.studentId, input.month)),
  sectionMonth: permissionProcedure("attendance", "view").input(z.object({ sectionId: id, month })).query(({ ctx, input }) => attendance.sectionMonth(ctx.db, ctx.session, input.sectionId, input.month)),
  report: permissionProcedure("attendance", "view").input(z.object({ from: isoDate, to: isoDate })).query(({ ctx, input }) => attendance.attendanceReport(ctx.db, ctx.session, input)),
});

export const leavesRouter = router({
  databaseId: permissionProcedure("transfers", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "leaves")),
  get: permissionProcedure("transfers", "view").input(z.object({ id })).query(({ ctx, input }) => leaves.getLeave(ctx.db, ctx.session, input.id)),
  create: permissionProcedure("transfers", "create")
    .input(z.object({ studentId: id, kind: z.enum(["LEAVE", "EARLY_DISMISSAL"]), startDate: isoDate, endDate: isoDate, reason: z.string().trim().min(3).max(500), requestedBy: z.string().max(120).nullish(), attachments: z.array(fileValue).max(5).optional() }))
    .mutation(({ ctx, input }) => leaves.createLeave(ctx.db, ctx.session, input)),
  decide: permissionProcedure("transfers", "approve")
    .input(z.object({ id, decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => leaves.decideLeave(ctx.db, ctx.session, input.id, input.decision, input.note)),
  cancel: permissionProcedure("transfers", "update").input(z.object({ id })).mutation(({ ctx, input }) => leaves.cancelLeave(ctx.db, ctx.session, input.id)),
});

export const transfersRouter = router({
  overview: permissionProcedure("transfers", "view").query(({ ctx }) => transfersOverview(ctx.db, ctx.session)),
  databaseId: permissionProcedure("transfers", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "transfers")),
  get: permissionProcedure("transfers", "view").input(z.object({ id })).query(({ ctx, input }) => transfers.getTransfer(ctx.db, ctx.session, input.id)),
  create: permissionProcedure("transfers", "create")
    .input(
      z.object({
        studentId: id,
        type: z.enum(["SECTION", "GRADE", "INCOMING", "OUTGOING", "WITHDRAWAL"]),
        toSectionId: id.nullish(),
        toGradeId: id.nullish(),
        otherSchool: z.string().max(200).nullish(),
        reason: z.string().trim().min(3).max(1000),
        effectiveDate: isoDate,
        attachments: z.array(fileValue).max(10).optional(),
      }),
    )
    .mutation(({ ctx, input }) => transfers.createTransfer(ctx.db, ctx.session, input)),
  complete: permissionProcedure("transfers", "update").input(z.object({ id })).mutation(({ ctx, input }) => transfers.completeTransfer(ctx.db, ctx.session, input.id)),
  cancel: permissionProcedure("transfers", "update").input(z.object({ id })).mutation(({ ctx, input }) => transfers.cancelTransfer(ctx.db, ctx.session, input.id)),
  certificate: permissionProcedure("transfers", "view").input(z.object({ id })).query(({ ctx, input }) => transfers.transferCertificate(ctx.db, ctx.session, input.id)),
});

export const behaviorRouter = router({
  overview: permissionProcedure("counseling", "view").query(({ ctx }) => behaviorOverview(ctx.db, ctx.session)),
  databaseId: permissionProcedure("counseling", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "behavior")),
  casesDatabaseId: permissionProcedure("counseling", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "counseling")),
  create: permissionProcedure("counseling", "create")
    .input(z.object({ studentId: id, category: z.string().max(40), points: z.number().int().min(-20).max(20).optional(), severity: severity.optional(), occurredAt: z.coerce.date().optional(), description: z.string().max(1000).nullish(), actionTaken: z.string().max(1000).nullish(), notifyGuardian: z.boolean().optional() }))
    .mutation(({ ctx, input }) => behavior.createBehavior(ctx.db, ctx.session, input)),
  student: permissionProcedure("counseling", "view").input(z.object({ studentId: id })).query(({ ctx, input }) => behavior.behaviorSummary(ctx.db, ctx.session, input.studentId)),
  get: permissionProcedure("counseling", "view").input(z.object({ id })).query(({ ctx, input }) => behavior.getBehavior(ctx.db, ctx.session, input.id)),
  canOpenCases: authedProcedure.query(({ ctx }) => behavior.canOpenCases(ctx.session)),
  createCase: permissionProcedure("counseling", "create")
    .input(z.object({ studentId: id, title: z.string().trim().min(3).max(200), category: z.string().max(40), severity, counselorId: id.nullish(), description: z.string().max(3000).nullish() }))
    .mutation(({ ctx, input }) => behavior.createCase(ctx.db, ctx.session, input)),
  getCase: permissionProcedure("counseling", "view").input(z.object({ id })).query(({ ctx, input }) => behavior.getCase(ctx.db, ctx.session, input.id)),
  updateCase: permissionProcedure("counseling", "update")
    .input(z.object({ id, patch: z.object({ title: z.string().max(200).optional(), category: z.string().max(40).optional(), severity: severity.optional(), status: z.enum(["OPEN", "IN_PROGRESS", "MONITORING", "CLOSED"]).optional(), counselorId: id.optional(), plan: z.unknown().optional() }) }))
    .mutation(({ ctx, input }) => behavior.updateCase(ctx.db, ctx.session, input.id, input.patch)),
  addSession: permissionProcedure("counseling", "update")
    .input(z.object({ caseId: id, scheduledAt: z.coerce.date(), durationMinutes: z.number().int().min(10).max(180).optional(), attendees: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => behavior.addSession(ctx.db, ctx.session, input.caseId, input)),
  updateSession: permissionProcedure("counseling", "update")
    .input(z.object({ id, status: z.enum(["SCHEDULED", "DONE", "MISSED", "CANCELLED"]).optional(), summary: z.string().max(3000).nullish(), scheduledAt: z.coerce.date().optional() }))
    .mutation(({ ctx, input }) => {
      const { id: sessionId, ...patch } = input;
      return behavior.updateSession(ctx.db, ctx.session, sessionId, patch);
    }),
  summon: permissionProcedure("counseling", "update").input(z.object({ caseId: id, date: isoDate })).mutation(({ ctx, input }) => behavior.summonGuardian(ctx.db, ctx.session, input.caseId, input.date)),
});
