/**
 * موجّهات المرحلة ٧ (الأتمتة والامتثال): مسارات الموافقة، قواعد الأتمتة.
 * الصلاحيات تُفحص في الخدمات.
 */
import { z } from "zod";
import * as rules from "@/server/services/automation-rules.service";
import * as workflows from "@/server/services/workflows.service";
import { configSchema } from "@/server/services/analytics/reports.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const p = authedProcedure;
const filters = configSchema.shape.filters;

export const workflowsRouter = router({
  list: p.query(({ ctx }) => workflows.listWorkflows(ctx.db, ctx.session)),
  get: p.input(z.object({ type: z.string().max(40) })).query(({ ctx, input }) => workflows.getWorkflow(ctx.db, ctx.session, input.type)),
  save: p.input(z.object({ type: z.string().max(40), isActive: z.boolean(), steps: z.array(workflows.stepSchema).max(8) })).mutation(({ ctx, input }) => workflows.saveWorkflow(ctx.db, ctx.session, input)),
  reset: p.input(z.object({ type: z.string().max(40) })).mutation(({ ctx, input }) => workflows.resetWorkflow(ctx.db, ctx.session, input.type)),
  monitor: p.input(z.object({ type: z.string().max(40).nullish(), state: z.string().max(20).nullish() })).query(({ ctx, input }) => workflows.monitor(ctx.db, ctx.session, input)),
});

const ruleInput = z.object({
  id: id.nullish(),
  name: z.string().trim().max(120),
  description: z.string().trim().max(400).nullish(),
  isEnabled: z.boolean(),
  dataset: z.string().max(60),
  filters,
  frequency: z.enum(["HOURLY", "DAILY", "WEEKLY"]),
  mode: z.enum(["EACH_ROW", "SUMMARY"]),
  threshold: z.number().int().min(1).max(100_000),
  cooldownDays: z.number().int().min(0).max(365),
  actions: z.array(rules.actionSchema).min(1).max(6),
});

export const automationRouter = router({
  list: p.query(({ ctx }) => rules.listRules(ctx.db, ctx.session)),
  templates: p.query(() => rules.RULE_TEMPLATES),
  get: p.input(z.object({ id })).query(({ ctx, input }) => rules.getRule(ctx.db, ctx.session, input.id)),
  save: p.input(ruleInput).mutation(({ ctx, input }) => rules.saveRule(ctx.db, ctx.session, input)),
  delete: p.input(z.object({ id })).mutation(({ ctx, input }) => rules.deleteRule(ctx.db, ctx.session, input.id)),
  preview: p.input(z.object({ id: id.nullish(), dataset: z.string().max(60), filters, cooldownDays: z.number().int().min(0).max(365) })).query(({ ctx, input }) => rules.previewRule(ctx.db, ctx.session, input)),
  runNow: p.input(z.object({ id })).mutation(({ ctx, input }) => rules.runRuleNow(ctx.db, ctx.session, input.id)),
});
