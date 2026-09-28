/**
 * الموجّه الجذري لواجهة tRPC.
 */
import { createCallerFactory, router } from "./init";
import { admissionsRouter, studentsRouter } from "./routers/students";
import { academicRouter, moduleSettingsRouter } from "./routers/academic";
import { accountRouter } from "./routers/account";
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
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
