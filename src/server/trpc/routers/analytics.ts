/**
 * موجّهات المرحلة ٧ (التحليلات): منشئ التقارير، لوحات التحكم، تحليل البيانات.
 * الصلاحيات تُفحص في الخدمات.
 */
import { z } from "zod";
import * as dashboards from "@/server/services/analytics/dashboards.service";
import { availableDatasets } from "@/server/services/analytics/datasets";
import * as metrics from "@/server/services/analytics/metrics.service";
import * as reports from "@/server/services/analytics/reports.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const p = authedProcedure;
const branch = z.object({ branchId: id.nullish() });

export const reportsRouter = router({
  datasets: p.query(({ ctx }) => availableDatasets(ctx.session)),
  list: p.query(({ ctx }) => reports.listReports(ctx.db, ctx.session)),
  shareTargets: p.query(({ ctx }) => reports.shareTargets(ctx.db, ctx.session)),
  get: p.input(z.object({ id })).query(({ ctx, input }) => reports.getReport(ctx.db, ctx.session, input.id)),
  run: p.input(z.object({ dataset: z.string().max(60), config: reports.configSchema })).query(({ ctx, input }) => reports.runAdhoc(ctx.db, ctx.session, { dataset: input.dataset, config: input.config })),
  runSaved: p.input(z.object({ id })).query(({ ctx, input }) => reports.runSaved(ctx.db, ctx.session, input.id)),
  save: p
    .input(z.object({ id: id.nullish(), name: z.string().trim().max(120), description: z.string().trim().max(500).nullish(), dataset: z.string().max(60), config: reports.configSchema, visibility: z.enum(["PRIVATE", "ROLES", "ALL"]), sharedRoleIds: z.array(id).max(30), isPinned: z.boolean().optional() }))
    .mutation(({ ctx, input }) => reports.saveReport(ctx.db, ctx.session, input)),
  delete: p.input(z.object({ id })).mutation(({ ctx, input }) => reports.deleteReport(ctx.db, ctx.session, input.id)),
  schedule: p.input(z.object({ id, enabled: z.boolean(), schedule: reports.scheduleSchema.nullable() })).mutation(({ ctx, input }) => reports.setSchedule(ctx.db, ctx.session, input)),
  sendNow: p.input(z.object({ id })).mutation(({ ctx, input }) => reports.sendNow(ctx.db, ctx.session, input.id)),
});

export const dashboardsRouter = router({
  tabs: p.query(({ ctx }) => dashboards.dashboardTabs(ctx.db, ctx.session)),
  principal: p.input(branch).query(({ ctx, input }) => dashboards.principalDashboard(ctx.db, ctx.session, input)),
  finance: p.input(branch).query(({ ctx, input }) => dashboards.financeBoard(ctx.db, ctx.session, input)),
  academic: p.input(branch).query(({ ctx, input }) => dashboards.academicBoard(ctx.db, ctx.session, input)),
  hr: p.input(branch).query(({ ctx, input }) => dashboards.hrBoard(ctx.db, ctx.session, input)),
  operations: p.input(branch).query(({ ctx, input }) => dashboards.operationsBoard(ctx.db, ctx.session, input)),
});

export const analyticsRouter = router({
  overview: p.query(({ ctx }) => metrics.analyticsOverview(ctx.db, ctx.session)),
  catalog: p.query(({ ctx }) => metrics.metricsCatalog(ctx.session)),
  trend: p.input(z.object({ key: z.string().max(60) })).query(({ ctx, input }) => metrics.metricTrend(ctx.db, ctx.session, input.key)),
  forecasts: p.query(({ ctx }) => metrics.forecasts(ctx.db, ctx.session)),
  snapshots: p.query(({ ctx }) => metrics.snapshotStatus(ctx.db, ctx.session)),
  importSnapshots: p.input(z.object({ rows: metrics.importSchema })).mutation(({ ctx, input }) => metrics.importSnapshots(ctx.db, ctx.session, input.rows)),
});
