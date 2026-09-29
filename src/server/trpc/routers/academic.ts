import { z } from "zod";
import * as academic from "@/server/services/academic.service";
import * as activities from "@/server/services/activities.service";
import * as assignments from "@/server/services/assignments.service";
import * as curriculum from "@/server/services/curriculum.service";
import * as timetable from "@/server/services/timetable.service";
import { getModuleSettings, updateModuleSettings, type ModuleSettingsKey } from "@/server/services/module-settings.service";
import { systemDatabaseId } from "@/server/services/system-db.service";
import { authedProcedure, permissionProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");
const time = z.string().regex(/^\d{2}:\d{2}$/, "وقت غير صالح");
const settingsKey = z.enum(["students", "admissions", "attendance", "finance", "assessment", "hr", "messageTemplates"]);
const roomKind = z.enum(["CLASSROOM", "LAB", "COMPUTER", "GYM", "LIBRARY", "ART", "HALL"]);
const color = z.enum(["gray", "navy", "teal", "slate", "gold", "green", "orange", "red", "brown", "purple"]);
const activityKind = z.enum(["CLUB", "COMMITTEE", "TRIP", "COMPETITION", "EVENT"]);
const activityStatus = z.enum(["PLANNED", "REGISTRATION", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const academicRouter = router({
  sectionOptions: authedProcedure.query(({ ctx }) => academic.sectionOptions(ctx.db, ctx.session)),
  classes: permissionProcedure("classes", "view").query(({ ctx }) => academic.classesOverview(ctx.db, ctx.session)),
  roster: permissionProcedure("classes", "view").input(z.object({ id })).query(({ ctx, input }) => academic.sectionRoster(ctx.db, ctx.session, input.id)),
  teachers: permissionProcedure("classes", "view").input(z.object({ branchId: id })).query(({ ctx, input }) => academic.branchTeachers(ctx.db, input.branchId)),
  createSection: permissionProcedure("classes", "create")
    .input(z.object({ branchId: id, gradeId: id, name: z.string().trim().min(1).max(20), capacity: z.number().int().min(1).max(60), room: z.string().max(40).nullish(), homeroomUserId: id.nullish() }))
    .mutation(({ ctx, input }) => academic.createSection(ctx.db, ctx.session, input)),
  updateSection: permissionProcedure("classes", "update")
    .input(z.object({ id, patch: z.object({ name: z.string().max(20).optional(), capacity: z.number().int().min(1).max(60).optional(), room: z.string().max(40).nullish(), homeroomUserId: id.nullish() }) }))
    .mutation(({ ctx, input }) => academic.updateSection(ctx.db, ctx.session, input.id, input.patch)),
  deleteSection: permissionProcedure("classes", "delete").input(z.object({ id })).mutation(({ ctx, input }) => academic.deleteSection(ctx.db, ctx.session, input.id)),
  distribute: permissionProcedure("classes", "update")
    .input(z.object({ branchId: id, gradeId: id, mode: z.enum(["unassigned", "rebalance"]), dryRun: z.boolean().optional() }))
    .mutation(({ ctx, input }) => academic.autoDistribute(ctx.db, ctx.session, input)),
  rooms: permissionProcedure("classes", "view").query(({ ctx }) => academic.listRooms(ctx.db, ctx.session)),
  saveRoom: permissionProcedure("classes", "update")
    .input(z.object({ id: id.nullish(), branchId: id, code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(80), kind: roomKind, capacity: z.number().int().min(1).max(500), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      const { id: roomId, ...rest } = input;
      return academic.saveRoom(ctx.db, ctx.session, roomId ?? null, rest);
    }),
  deleteRoom: permissionProcedure("classes", "delete").input(z.object({ id })).mutation(({ ctx, input }) => academic.deleteRoom(ctx.db, ctx.session, input.id)),
  yearEndPreview: permissionProcedure("classes", "approve").query(({ ctx }) => academic.yearEndPreview(ctx.db, ctx.session)),
  gradeStudents: permissionProcedure("classes", "approve").input(z.object({ gradeId: id })).query(({ ctx, input }) => academic.gradeStudents(ctx.db, ctx.session, input.gradeId)),
  closeYear: permissionProcedure("classes", "approve")
    .input(z.object({ name: z.string().trim().min(3).max(60), startDate: isoDate, endDate: isoDate, retainStudentIds: z.array(id).max(2000), confirm: z.string().max(80) }))
    .mutation(({ ctx, input }) => academic.closeYear(ctx.db, ctx.session, input)),
});

export const curriculumRouter = router({
  subjects: permissionProcedure("curriculum", "view").query(({ ctx }) => curriculum.listSubjects(ctx.db, ctx.session)),
  saveSubject: permissionProcedure("curriculum", "update")
    .input(z.object({ id: id.nullish(), code: z.string().trim().min(1).max(12), name: z.string().trim().min(1).max(80), color, roomKind: roomKind.nullable() }))
    .mutation(({ ctx, input }) => curriculum.saveSubject(ctx.db, ctx.session, input.id ?? null, input)),
  deleteSubject: permissionProcedure("curriculum", "delete").input(z.object({ id })).mutation(({ ctx, input }) => curriculum.deleteSubject(ctx.db, ctx.session, input.id)),
  grades: permissionProcedure("curriculum", "view").query(({ ctx }) => curriculum.planOverview(ctx.db, ctx.session)),
  plan: permissionProcedure("curriculum", "view").input(z.object({ gradeId: id })).query(({ ctx, input }) => curriculum.gradePlan(ctx.db, ctx.session, input.gradeId)),
  savePlanItem: permissionProcedure("curriculum", "update")
    .input(z.object({ gradeId: id, subjectId: id, weeklyPeriods: z.number().int().min(1).max(12), heavy: z.boolean(), textbook: z.string().max(200).nullish() }))
    .mutation(({ ctx, input }) => curriculum.saveGradeSubject(ctx.db, ctx.session, input)),
  removePlanItem: permissionProcedure("curriculum", "update").input(z.object({ id })).mutation(({ ctx, input }) => curriculum.removeGradeSubject(ctx.db, ctx.session, input.id)),
  syllabus: permissionProcedure("curriculum", "view").input(z.object({ id, sectionId: id.nullish() })).query(({ ctx, input }) => curriculum.syllabus(ctx.db, ctx.session, input.id, input.sectionId)),
  saveUnit: permissionProcedure("curriculum", "update")
    .input(z.object({ id: id.nullish(), gradeSubjectId: id, title: z.string().trim().min(1).max(200), objectives: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => curriculum.saveUnit(ctx.db, ctx.session, input)),
  deleteUnit: permissionProcedure("curriculum", "update").input(z.object({ id })).mutation(({ ctx, input }) => curriculum.deleteUnit(ctx.db, ctx.session, input.id)),
  saveLesson: permissionProcedure("curriculum", "update")
    .input(z.object({ id: id.nullish(), unitId: id, title: z.string().trim().min(1).max(200), week: z.number().int().min(1).max(45).nullish(), periods: z.number().int().min(1).max(12), objectives: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => curriculum.saveLesson(ctx.db, ctx.session, input)),
  deleteLesson: permissionProcedure("curriculum", "update").input(z.object({ id })).mutation(({ ctx, input }) => curriculum.deleteLesson(ctx.db, ctx.session, input.id)),
  move: permissionProcedure("curriculum", "update")
    .input(z.object({ kind: z.enum(["unit", "lesson"]), id, direction: z.union([z.literal(-1), z.literal(1)]) }))
    .mutation(({ ctx, input }) => curriculum.moveItem(ctx.db, ctx.session, input)),
  mark: permissionProcedure("curriculum", "view")
    .input(z.object({ lessonId: id, sectionId: id, done: z.boolean(), note: z.string().max(500).nullish() }))
    .mutation(({ ctx, input }) => curriculum.markLesson(ctx.db, ctx.session, input)),
});

export const assignmentsRouter = router({
  board: permissionProcedure("teacher_assignments", "view").input(z.object({ branchId: id.nullish() })).query(({ ctx, input }) => assignments.assignmentBoard(ctx.db, ctx.session, input.branchId)),
  set: permissionProcedure("teacher_assignments", "update")
    .input(z.object({ sectionId: id, subjectId: id, teacherId: id.nullable() }))
    .mutation(({ ctx, input }) => assignments.setAssignment(ctx.db, ctx.session, input)),
  saveLoad: permissionProcedure("teacher_assignments", "update")
    .input(z.object({ userId: id, quota: z.number().int().min(0).max(40), freeDay: z.number().int().min(0).max(6).nullable(), subjectIds: z.array(id).max(20) }))
    .mutation(({ ctx, input }) => assignments.saveTeacherLoad(ctx.db, ctx.session, input)),
  auto: permissionProcedure("teacher_assignments", "update").input(z.object({ branchId: id })).mutation(({ ctx, input }) => assignments.autoAssign(ctx.db, ctx.session, input.branchId)),
});

export const timetableRouter = router({
  meta: permissionProcedure("timetable", "view").query(({ ctx }) => timetable.timetableMeta(ctx.db, ctx.session)),
  grid: permissionProcedure("timetable", "view")
    .input(z.object({ kind: z.enum(["section", "teacher", "room", "student"]), id }))
    .query(({ ctx, input }) => timetable.grid(ctx.db, ctx.session, input)),
  generate: permissionProcedure("timetable", "update").input(z.object({ branchId: id, seed: z.number().int().optional() })).mutation(({ ctx, input }) => timetable.generate(ctx.db, ctx.session, input)),
  move: permissionProcedure("timetable", "update")
    .input(z.object({ slotId: id, day: z.number().int().min(0).max(6), period: z.number().int().min(1).max(12) }))
    .mutation(({ ctx, input }) => timetable.moveSlot(ctx.db, ctx.session, input)),
  place: permissionProcedure("timetable", "update")
    .input(z.object({ sectionId: id, subjectId: id, day: z.number().int().min(0).max(6), period: z.number().int().min(1).max(12) }))
    .mutation(({ ctx, input }) => timetable.placeSlot(ctx.db, ctx.session, input)),
  remove: permissionProcedure("timetable", "update").input(z.object({ slotId: id })).mutation(({ ctx, input }) => timetable.removeSlot(ctx.db, ctx.session, input.slotId)),
  lock: permissionProcedure("timetable", "update").input(z.object({ slotId: id })).mutation(({ ctx, input }) => timetable.toggleLock(ctx.db, ctx.session, input.slotId)),
  feasible: permissionProcedure("timetable", "update").input(z.object({ slotId: id })).query(({ ctx, input }) => timetable.feasibleCells(ctx.db, ctx.session, input.slotId)),
  bell: permissionProcedure("timetable", "view").input(z.object({ branchId: id })).query(({ ctx, input }) => timetable.getBell(ctx.db, input.branchId)),
  saveBell: permissionProcedure("timetable", "update")
    .input(z.object({ branchId: id, name: z.string().max(80), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), periods: z.array(z.object({ start: time, end: time })).min(1).max(12), maxConsecutive: z.number().int().min(1).max(8) }))
    .mutation(({ ctx, input }) => {
      const { branchId, ...rest } = input;
      return timetable.saveBell(ctx.db, ctx.session, branchId, rest);
    }),
  substitutions: permissionProcedure("timetable", "view").input(z.object({ date: isoDate })).query(({ ctx, input }) => timetable.substitutionDay(ctx.db, ctx.session, input.date)),
  recordAbsence: permissionProcedure("timetable", "update")
    .input(z.object({ date: isoDate, teacherId: id, note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => timetable.recordTeacherAbsence(ctx.db, ctx.session, input)),
  suggestions: permissionProcedure("timetable", "update").input(z.object({ id })).query(({ ctx, input }) => timetable.substituteSuggestions(ctx.db, ctx.session, input.id)),
  assignSubstitute: permissionProcedure("timetable", "update")
    .input(z.object({ id, teacherId: id.nullable(), note: z.string().max(300).nullish() }))
    .mutation(({ ctx, input }) => timetable.assignSubstitute(ctx.db, ctx.session, input)),
  cancelSubstitution: permissionProcedure("timetable", "update").input(z.object({ id })).mutation(({ ctx, input }) => timetable.cancelSubstitution(ctx.db, ctx.session, input.id)),
  myDay: permissionProcedure("timetable", "view").input(z.object({ date: isoDate })).query(({ ctx, input }) => timetable.myDay(ctx.db, ctx.session, input.date)),
});

export const activitiesRouter = router({
  overview: permissionProcedure("activities", "view").query(({ ctx }) => activities.activitiesOverview(ctx.db, ctx.session)),
  databaseId: permissionProcedure("activities", "view").query(({ ctx }) => systemDatabaseId(ctx.db, ctx.session, "activities")),
  get: permissionProcedure("activities", "view").input(z.object({ id })).query(({ ctx, input }) => activities.getActivity(ctx.db, ctx.session, input.id)),
  create: permissionProcedure("activities", "create")
    .input(
      z.object({
        title: z.string().trim().min(2).max(200),
        kind: activityKind,
        branchId: id.nullish(),
        description: z.string().max(3000).nullish(),
        startAt: z.coerce.date().nullish(),
        endAt: z.coerce.date().nullish(),
        location: z.string().max(200).nullish(),
        supervisorId: id.nullish(),
        capacity: z.number().int().min(1).max(5000).nullish(),
        feeMinor: z.number().int().min(0).max(100_000_000).nullish(),
        requiresConsent: z.boolean().optional(),
        gradeIds: z.array(id).max(30).optional(),
      }),
    )
    .mutation(({ ctx, input }) => activities.createActivity(ctx.db, ctx.session, input)),
  update: permissionProcedure("activities", "update")
    .input(
      z.object({
        id,
        patch: z.object({
          title: z.string().max(200).optional(),
          kind: activityKind.optional(),
          status: activityStatus.optional(),
          description: z.string().max(3000).nullish(),
          startAt: z.coerce.date().nullish(),
          endAt: z.coerce.date().nullish(),
          location: z.string().max(200).nullish(),
          supervisorId: id.nullish(),
          capacity: z.number().int().min(1).max(5000).nullish(),
          feeMinor: z.number().int().min(0).max(100_000_000).nullish(),
          requiresConsent: z.boolean().optional(),
          gradeIds: z.array(id).max(30).optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => activities.updateActivity(ctx.db, ctx.session, input.id, input.patch)),
  eligible: permissionProcedure("activities", "update")
    .input(z.object({ id, q: z.string().max(80).optional(), sectionId: id.nullish() }))
    .query(({ ctx, input }) => activities.eligibleStudents(ctx.db, ctx.session, input.id, input)),
  register: permissionProcedure("activities", "update").input(z.object({ id, studentIds: z.array(id).min(1).max(200) })).mutation(({ ctx, input }) => activities.registerStudents(ctx.db, ctx.session, input.id, input.studentIds)),
  updateRegistration: permissionProcedure("activities", "update")
    .input(z.object({ id, status: z.enum(["REGISTERED", "WAITLIST", "CANCELLED", "ATTENDED"]).optional(), consentStatus: z.enum(["PENDING", "GRANTED", "DENIED"]).optional(), consentBy: z.string().max(120).nullish() }))
    .mutation(({ ctx, input }) => {
      const { id: regId, ...patch } = input;
      return activities.updateRegistration(ctx.db, ctx.session, regId, patch);
    }),
  requestConsents: permissionProcedure("activities", "update").input(z.object({ id })).mutation(({ ctx, input }) => activities.requestConsents(ctx.db, ctx.session, input.id)),
  syncCalendar: permissionProcedure("activities", "update").input(z.object({ id })).mutation(({ ctx, input }) => activities.syncCalendar(ctx.db, ctx.session, input.id)),
  addPhotos: permissionProcedure("activities", "update").input(z.object({ id, fileIds: z.array(id).min(1).max(30) })).mutation(({ ctx, input }) => activities.addPhotos(ctx.db, ctx.session, input.id, input.fileIds)),
  removePhoto: permissionProcedure("activities", "update").input(z.object({ id, fileId: id })).mutation(({ ctx, input }) => activities.removePhoto(ctx.db, ctx.session, input.id, input.fileId)),
  setCover: permissionProcedure("activities", "update").input(z.object({ id, url: z.string().max(500).nullable() })).mutation(({ ctx, input }) => activities.setCover(ctx.db, ctx.session, input.id, input.url)),
  student: permissionProcedure("activities", "view").input(z.object({ studentId: id })).query(({ ctx, input }) => activities.studentActivities(ctx.db, ctx.session, input.studentId)),
});

export const moduleSettingsRouter = router({
  get: authedProcedure.input(z.object({ key: settingsKey })).query(({ ctx, input }) => getModuleSettings(ctx.db, ctx.session, input.key as ModuleSettingsKey)),
  update: authedProcedure
    .input(z.object({ key: settingsKey, patch: z.record(z.string(), z.unknown()) }))
    .mutation(({ ctx, input }) => updateModuleSettings(ctx.db, ctx.session, input.key as ModuleSettingsKey, input.patch)),
});
