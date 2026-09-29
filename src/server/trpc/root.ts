/**
 * الموجّه الجذري لواجهة tRPC.
 */
import { createCallerFactory, router } from "./init";
import { admissionsRouter, studentsRouter } from "./routers/students";
import { academicRouter, activitiesRouter, assignmentsRouter, curriculumRouter, moduleSettingsRouter, timetableRouter } from "./routers/academic";
import { attendanceRouter, behaviorRouter, leavesRouter, transfersRouter } from "./routers/student-ops";
import { accountRouter } from "./routers/account";
import { financeRouter } from "./routers/finance";
import { assessmentRouter } from "./routers/assessment";
import { auditRouter, orgRouter, rolesRouter, usersRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { approvalRouter, calendarRouter, chatRouter, commentRouter, notificationRouter } from "./routers/collaboration";
import { databaseRouter } from "./routers/database";
import { pageRouter } from "./routers/page";
import { workspaceRouter } from "./routers/workspace";

export const appRouter = router({
  auth: authRouter,
  account: accountRouter,
  workspace: workspaceRouter,
  page: pageRouter,
  database: databaseRouter,
  comment: commentRouter,
  notification: notificationRouter,
  approval: approvalRouter,
  calendar: calendarRouter,
  chat: chatRouter,
  users: usersRouter,
  roles: rolesRouter,
  org: orgRouter,
  audit: auditRouter,
  students: studentsRouter,
  admissions: admissionsRouter,
  academic: academicRouter,
  moduleSettings: moduleSettingsRouter,
  attendance: attendanceRouter,
  leaves: leavesRouter,
  transfers: transfersRouter,
  behavior: behaviorRouter,
  curriculum: curriculumRouter,
  assignments: assignmentsRouter,
  timetable: timetableRouter,
  activities: activitiesRouter,
  finance: financeRouter,
  assessment: assessmentRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
