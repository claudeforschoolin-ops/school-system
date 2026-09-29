import { z } from "zod";
import { toISODate } from "@/lib/dates";
import * as common from "@/server/services/assessment/common";
import * as exams from "@/server/services/assessment/exams.service";
import * as grades from "@/server/services/assessment/grades.service";
import * as results from "@/server/services/assessment/results.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const tenths = z.number().int().min(0).max(10000);
const examKind = z.enum(["DAILY", "MONTHLY", "MIDTERM", "FINAL"]);
const examInput = z.object({ termId: id, title: z.string().trim().min(2).max(120), kind: examKind, componentKey: z.string().max(40).nullish(), gradeIds: z.array(id).min(1).max(30), branchId: id.nullish(), startDate: isoDate, endDate: isoDate, instructions: z.string().max(2000).nullish() });
const component = z.object({ key: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, "الرمز بأحرف لاتينية صغيرة"), name: z.string().trim().min(2).max(80), weight: z.number().int().min(1).max(100) });
const band = z.object({ minBp: z.number().int().min(0).max(10000), label: z.string().trim().min(1).max(40), letter: z.string().trim().min(1).max(4), points: z.number().int().min(0).max(500) });
const block = z.object({ type: z.enum(Object.keys(results.REPORT_BLOCKS) as [results.ReportBlockType, ...results.ReportBlockType[]]), enabled: z.boolean(), title: z.string().max(80).optional() });

const examsRouter = router({
  options: authedProcedure.query(({ ctx }) => exams.examOptions(ctx.db)),
  list: authedProcedure.input(z.object({ termId: id.nullish() })).query(({ ctx, input }) => exams.listExams(ctx.db, ctx.session, input)),
  get: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => exams.getExam(ctx.db, ctx.session, input.id)),
  create: authedProcedure.input(examInput).mutation(({ ctx, input }) => exams.createExam(ctx.db, ctx.session, input)),
  update: authedProcedure.input(examInput.extend({ id })).mutation(({ ctx, input }) => {
    const { id: examId, ...rest } = input;
    return exams.updateExam(ctx.db, ctx.session, examId, rest);
  }),
  delete: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => exams.deleteExam(ctx.db, ctx.session, input.id)),
  saveSession: authedProcedure
    .input(z.object({ examId: id, id: id.nullish(), gradeId: id, subjectId: id, date: isoDate, startTime: z.string().regex(/^\d{2}:\d{2}$/), durationMin: z.number().int().min(10).max(300), maxTenths: tenths }))
    .mutation(({ ctx, input }) => exams.upsertSession(ctx.db, ctx.session, input)),
  deleteSession: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => exams.deleteSession(ctx.db, ctx.session, input.id)),
  autoSchedule: authedProcedure
    .input(z.object({ examId: id, startTime: z.string().regex(/^\d{2}:\d{2}$/), durationMin: z.number().int().min(10).max(300), maxTenths: tenths.nullish() }))
    .mutation(({ ctx, input }) => exams.autoSchedule(ctx.db, ctx.session, input)),
  autoCommittees: authedProcedure
    .input(z.object({ examId: id, capacity: z.number().int().min(5).max(60), invigilatorsPerCommittee: z.number().int().min(1).max(4), interleaveGrades: z.boolean(), firstSeat: z.number().int().min(1).max(999_999).nullish() }))
    .mutation(({ ctx, input }) => exams.autoCommittees(ctx.db, ctx.session, input)),
  updateCommittee: authedProcedure
    .input(z.object({ id, name: z.string().trim().max(60), roomId: id.nullable(), invigilatorIds: z.array(id).max(6) }))
    .mutation(({ ctx, input }) => exams.updateCommittee(ctx.db, ctx.session, input)),
  committee: authedProcedure.input(z.object({ id })).query(({ ctx, input }) => exams.committeeSheet(ctx.db, ctx.session, input.id)),
  saveReport: authedProcedure
    .input(z.object({ sessionId: id, committeeId: id, absentStudentIds: z.array(id).max(200), incidents: z.array(z.object({ studentId: id, kind: z.string().trim().min(1).max(60), note: z.string().max(500) })).max(50), notes: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => exams.saveInvigilationReport(ctx.db, ctx.session, input)),
  mine: authedProcedure.query(({ ctx }) => exams.myInvigilation(ctx.db, ctx.session)),
  createSheets: authedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => exams.createSheetsFromSession(ctx.db, ctx.session, input.sessionId)),
});

const gradesRouter = router({
  currentTerm: authedProcedure.query(async ({ ctx }) => {
    const year = await ctx.db.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
    const terms = year ? await ctx.db.term.findMany({ where: { academicYearId: year.id, deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, name: true, startDate: true, endDate: true } }) : [];
    const current = await common.currentTerm(ctx.db, toISODate(new Date(), ctx.session.tenant.timezone));
    return { year: year ? { id: year.id, name: year.name } : null, terms, currentId: current?.id ?? null };
  }),
  sheets: authedProcedure.input(z.object({ termId: id })).query(({ ctx, input }) => grades.mySheets(ctx.db, ctx.session, input.termId)),
  pending: authedProcedure.query(({ ctx }) => grades.pendingForMe(ctx.db, ctx.session)),
  book: authedProcedure.input(z.object({ sectionId: id, subjectId: id, termId: id })).query(({ ctx, input }) => grades.gradeBook(ctx.db, ctx.session, input)),
  createAssessment: authedProcedure
    .input(z.object({ sectionId: id, subjectId: id, termId: id, componentKey: z.string().min(1).max(40), title: z.string().trim().min(2).max(120), maxTenths: tenths.min(1), date: isoDate.nullish() }))
    .mutation(({ ctx, input }) => grades.createAssessment(ctx.db, ctx.session, input)),
  updateAssessment: authedProcedure
    .input(z.object({ id, title: z.string().trim().min(2).max(120).optional(), maxTenths: tenths.min(1).optional(), date: isoDate.nullish(), componentKey: z.string().min(1).max(40).optional() }))
    .mutation(({ ctx, input }) => {
      const { id: aid, ...patch } = input;
      return grades.updateAssessment(ctx.db, ctx.session, aid, patch);
    }),
  deleteAssessment: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => grades.deleteAssessment(ctx.db, ctx.session, input.id)),
  saveMarks: authedProcedure
    .input(z.object({ assessmentId: id, marks: z.array(z.object({ studentId: id, scoreTenths: tenths.nullable(), absent: z.boolean(), excused: z.boolean(), note: z.string().max(300).nullish() })).max(200) }))
    .mutation(({ ctx, input }) => grades.saveMarks(ctx.db, ctx.session, input)),
  transition: authedProcedure
    .input(z.object({ ids: z.array(id).min(1).max(100), action: z.enum(["SUBMIT", "REVIEW", "APPROVE", "RETURN"]), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => grades.transition(ctx.db, ctx.session, input)),
  requestChange: authedProcedure
    .input(z.object({ assessmentId: id, studentId: id, newTenths: tenths.nullable(), newAbsent: z.boolean(), reason: z.string().trim().min(5).max(500) }))
    .mutation(({ ctx, input }) => grades.requestChange(ctx.db, ctx.session, input)),
  changeRequests: authedProcedure.input(z.object({ sectionId: id, subjectId: id, termId: id })).query(({ ctx, input }) => grades.listChangeRequests(ctx.db, ctx.session, input)),
  itemAnalysis: authedProcedure.input(z.object({ assessmentId: id })).query(({ ctx, input }) => results.itemAnalysis(ctx.db, ctx.session, input.assessmentId)),
});

const resultsRouter = router({
  sections: authedProcedure.query(({ ctx }) => results.resultSections(ctx.db, ctx.session)),
  section: authedProcedure
    .input(z.object({ sectionId: id, termId: z.union([id, z.literal("YEAR")]), approvedOnly: z.boolean().optional() }))
    .query(({ ctx, input }) => results.sectionResults(ctx.db, ctx.session, input)),
  stats: authedProcedure.input(z.object({ termId: id, gradeId: id.nullish(), branchId: id.nullish() })).query(({ ctx, input }) => results.termStats(ctx.db, ctx.session, input)),
  retainSuggestions: authedProcedure.query(({ ctx }) => results.retainSuggestions(ctx.db, ctx.session)),
  schemes: authedProcedure.query(({ ctx }) => results.listSchemes(ctx.db, ctx.session)),
  saveScheme: authedProcedure
    .input(z.object({ id: id.nullish(), stageId: id.nullable(), name: z.string().trim().min(2).max(80), components: z.array(component).min(1).max(12), bands: z.array(band).min(2).max(10), passBp: z.number().int().min(0).max(10000), maxSecondRoundSubjects: z.number().int().min(0).max(10), display: z.enum(["PERCENT", "LETTER", "POINTS"]) }))
    .mutation(({ ctx, input }) => results.saveScheme(ctx.db, ctx.session, input)),
});

const cardsRouter = router({
  templates: authedProcedure.query(({ ctx }) => results.listTemplates(ctx.db, ctx.session)),
  saveTemplate: authedProcedure
    .input(z.object({ id: id.nullish(), name: z.string().trim().min(2).max(80), blocks: z.array(block).min(1).max(12), signatures: z.array(z.object({ title: z.string().trim().max(60), name: z.string().trim().max(80) })).max(4), stampUrl: z.string().max(500).nullish(), footerNote: z.string().max(500).nullish(), isDefault: z.boolean() }))
    .mutation(({ ctx, input }) => results.saveTemplate(ctx.db, ctx.session, input)),
  deleteTemplate: authedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => results.deleteTemplate(ctx.db, ctx.session, input.id)),
  list: authedProcedure.input(z.object({ termId: id, sectionId: id })).query(({ ctx, input }) => results.reportCardList(ctx.db, ctx.session, input)),
  issue: authedProcedure.input(z.object({ termId: id, sectionIds: z.array(id).min(1).max(100), templateId: id.nullish() })).mutation(({ ctx, input }) => results.issueReportCards(ctx.db, ctx.session, input)),
  print: authedProcedure.input(z.object({ termId: id, sectionId: id.nullish(), cardIds: z.array(id).max(500).nullish() })).query(({ ctx, input }) => results.printCards(ctx.db, ctx.session, input)),
  publication: authedProcedure.input(z.object({ termId: id })).query(({ ctx, input }) => ctx.db.resultPublication.findFirst({ where: { termId: input.termId } })),
  setPublication: authedProcedure.input(z.object({ termId: id, publishAt: z.coerce.date(), withholdOnDebt: z.boolean() })).mutation(({ ctx, input }) => results.setPublication(ctx.db, ctx.session, input)),
  family: authedProcedure.query(({ ctx }) => results.familyResults(ctx.db, ctx.session)),
});

export const assessmentRouter = router({
  exams: examsRouter,
  grades: gradesRouter,
  results: resultsRouter,
  cards: cardsRouter,
});
