/**
 * موجّهات المرحلة ٧ (الأتمتة والامتثال): مسارات الموافقة، قواعد الأتمتة، الامتثال والخصوصية،
 * التوثيق الإلكتروني، الدعم الفني وقاعدة المعرفة، والنسخ الاحتياطية.
 * الصلاحيات تُفحص في الخدمات.
 */
import { z } from "zod";
import { normalizeIp } from "@/lib/ip";
import * as rules from "@/server/services/automation-rules.service";
import * as backups from "@/server/services/backup.service";
import * as compliance from "@/server/services/compliance.service";
import * as documents from "@/server/services/documents.service";
import * as projects from "@/server/services/projects.service";
import * as support from "@/server/services/support.service";
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

const meta = (ctx: { ip: string | null; userAgent: string | null }) => ({ ip: ctx.ip, userAgent: ctx.userAgent });
const consentStatus = z.enum(["GRANTED", "WITHDRAWN", "DENIED"]);

export const complianceRouter = router({
  overview: p.query(({ ctx }) => compliance.complianceOverview(ctx.db, ctx.session)),
  policies: p.query(({ ctx }) => compliance.listPolicies(ctx.db, ctx.session)),
  savePolicy: p.input(z.object({ id: id.nullish(), title: z.string().max(160), body: z.string().max(40_000), changes: z.string().max(1000).nullish(), audience: z.enum(["ALL", "GUARDIANS", "STAFF"]), requireAcceptance: z.boolean() })).mutation(({ ctx, input }) => compliance.savePolicyDraft(ctx.db, ctx.session, input)),
  publishPolicy: p.input(z.object({ id })).mutation(({ ctx, input }) => compliance.publishPolicy(ctx.db, ctx.session, input.id)),
  current: p.query(({ ctx }) => compliance.currentPolicy(ctx.db, ctx.session)),
  accept: p.input(z.object({ policyId: id })).mutation(({ ctx, input }) => compliance.acceptPolicy(ctx.db, ctx.session, input, meta(ctx))),
  consentTypes: p.query(({ ctx }) => compliance.listConsentTypes(ctx.db, ctx.session)),
  saveConsentType: p.input(z.object({ id: id.nullish(), name: z.string().max(120), description: z.string().max(1000), subject: z.enum(["STUDENT", "STAFF"]), isRequired: z.boolean(), isActive: z.boolean() })).mutation(({ ctx, input }) => compliance.saveConsentType(ctx.db, ctx.session, input)),
  matrix: p.input(z.object({ gradeId: id.nullish(), typeId: id.nullish(), status: z.enum(["GRANTED", "MISSING", "WITHDRAWN"]).nullish() })).query(({ ctx, input }) => compliance.consentMatrix(ctx.db, ctx.session, input)),
  myConsents: p.query(({ ctx }) => compliance.myConsents(ctx.db, ctx.session)),
  setConsent: p.input(z.object({ consentTypeId: id, studentId: id.nullish(), employeeId: id.nullish(), status: consentStatus, method: z.enum(["PORTAL", "PAPER", "STAFF_ENTRY"]).optional(), note: z.string().max(500).nullish() })).mutation(({ ctx, input }) => compliance.setConsent(ctx.db, ctx.session, input, meta(ctx))),
  retention: p.query(({ ctx }) => compliance.retentionOverview(ctx.db, ctx.session)),
  saveRetention: p.input(z.object({ category: z.string().max(40), retainDays: z.number().int().min(30).max(3650), isEnabled: z.boolean() })).mutation(({ ctx, input }) => compliance.saveRetention(ctx.db, ctx.session, input)),
  runRetention: p.input(z.object({ category: z.string().max(40), dryRun: z.boolean() })).mutation(({ ctx, input }) => compliance.runRetentionNow(ctx.db, ctx.session, input)),
  requests: p.input(z.object({ status: z.string().max(20).nullish() })).query(({ ctx, input }) => compliance.listRequests(ctx.db, ctx.session, input)),
  createRequest: p.input(z.object({ kind: z.enum(["ACCESS", "CORRECTION", "DELETION", "PORTABILITY", "OBJECTION"]), subjectType: z.enum(["GUARDIAN", "STUDENT", "EMPLOYEE", "USER"]), subjectId: id.nullish(), description: z.string().max(2000), requesterName: z.string().max(120).nullish(), requesterContact: z.string().max(200).nullish() })).mutation(({ ctx, input }) => compliance.createRequest(ctx.db, ctx.session, input)),
  updateRequest: p.input(z.object({ id, status: z.enum(["VERIFYING", "IN_PROGRESS", "COMPLETED", "REJECTED"]).optional(), assigneeId: id.nullish(), resolution: z.string().max(2000).nullish() })).mutation(({ ctx, input }) => compliance.updateRequest(ctx.db, ctx.session, input)),
  generateExport: p.input(z.object({ id })).mutation(({ ctx, input }) => compliance.generateExport(ctx.db, ctx.session, input.id)),
});

const signer = z.object({ userId: id, roleLabel: z.string().max(60).nullish() });
export const documentsRouter = router({
  list: p.input(z.object({ tab: z.enum(["TO_SIGN", "SENT", "ALL", "ARCHIVE"]), q: z.string().max(100).nullish() })).query(({ ctx, input }) => documents.listDocuments(ctx.db, ctx.session, input)),
  get: p.input(z.object({ id })).query(({ ctx, input }) => documents.getDocument(ctx.db, ctx.session, input.id)),
  saveDraft: p.input(z.object({ id: id.nullish(), title: z.string().max(160), kind: z.enum(["CONTRACT", "ACKNOWLEDGMENT", "POLICY", "FORM", "OTHER"]), body: z.string().max(60_000), fileId: id.nullish(), tags: z.array(z.string().max(40)).max(10), signingOrder: z.enum(["PARALLEL", "SEQUENTIAL"]), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), signers: z.array(signer).max(30) })).mutation(({ ctx, input }) => documents.saveDraft(ctx.db, ctx.session, input)),
  send: p.input(z.object({ id })).mutation(({ ctx, input }) => documents.sendDocument(ctx.db, ctx.session, input.id)),
  sign: p.input(z.object({ id, method: z.enum(["DRAW", "TYPE"]), signatureData: z.string().max(200_000).nullish(), typedName: z.string().max(120).nullish(), agree: z.boolean() })).mutation(({ ctx, input }) => documents.signDocument(ctx.db, ctx.session, input, meta(ctx))),
  decline: p.input(z.object({ id, reason: z.string().max(500) })).mutation(({ ctx, input }) => documents.declineDocument(ctx.db, ctx.session, input)),
  cancel: p.input(z.object({ id })).mutation(({ ctx, input }) => documents.cancelDocument(ctx.db, ctx.session, input.id)),
  archive: p.input(z.object({ id, archived: z.boolean() })).mutation(({ ctx, input }) => documents.archiveDocument(ctx.db, ctx.session, input)),
  remind: p.input(z.object({ id })).mutation(({ ctx, input }) => documents.remindSigners(ctx.db, ctx.session, input.id)),
  signers: p.input(z.object({ q: z.string().max(60) })).query(({ ctx, input }) => documents.signerOptions(ctx.db, ctx.session, input.q)),
});

const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const supportRouter = router({
  tickets: p.input(z.object({ status: z.string().max(20).nullish(), mine: z.boolean().optional() })).query(({ ctx, input }) => support.listTickets(ctx.db, ctx.session, input)),
  ticket: p.input(z.object({ id })).query(({ ctx, input }) => support.getTicket(ctx.db, ctx.session, input.id)),
  create: p.input(z.object({ title: z.string().max(160), description: z.string().max(5000), category: z.enum(["TECHNICAL", "ACCOUNT", "DATA", "TRAINING", "FEATURE", "OTHER"]), priority, pageUrl: z.string().max(300).nullish() })).mutation(({ ctx, input }) => support.createTicket(ctx.db, ctx.session, input)),
  reply: p.input(z.object({ id, body: z.string().max(5000), isInternal: z.boolean().optional(), status: z.enum(["IN_PROGRESS", "WAITING", "RESOLVED"]).nullish() })).mutation(({ ctx, input }) => support.replyTicket(ctx.db, ctx.session, input)),
  update: p.input(z.object({ id, status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).optional(), assigneeId: id.nullish(), priority: priority.optional(), resolution: z.string().max(2000).nullish() })).mutation(({ ctx, input }) => support.updateTicket(ctx.db, ctx.session, input)),
  close: p.input(z.object({ id, satisfaction: z.number().int().min(1).max(5) })).mutation(({ ctx, input }) => support.closeTicket(ctx.db, ctx.session, input)),
  articles: p.input(z.object({ q: z.string().max(100).nullish(), category: z.string().max(60).nullish() })).query(({ ctx, input }) => support.listArticles(ctx.db, ctx.session, input)),
  article: p.input(z.object({ slug: z.string().max(120) })).query(({ ctx, input }) => support.getArticle(ctx.db, ctx.session, input.slug)),
  saveArticle: p.input(z.object({ id: id.nullish(), title: z.string().max(160), category: z.string().max(60), summary: z.string().max(300).nullish(), body: z.string().max(40_000), isPublished: z.boolean() })).mutation(({ ctx, input }) => support.saveArticle(ctx.db, ctx.session, input)),
  rateArticle: p.input(z.object({ id, helpful: z.boolean() })).mutation(({ ctx, input }) => support.rateArticle(ctx.db, ctx.session, input)),
  completeTour: p.meta({ allowPending2fa: false }).input(z.object({ key: z.string().max(40), reset: z.boolean().optional() })).mutation(({ ctx, input }) => support.completeTour(ctx.db, ctx.session, input)),
});

export const backupsRouter = router({
  list: p.query(({ ctx }) => backups.listBackups(ctx.db, ctx.session)),
  create: p.mutation(({ ctx }) => backups.backupNow(ctx.db, ctx.session)),
  verify: p.input(z.object({ id })).mutation(({ ctx, input }) => backups.verifyBackup(ctx.db, ctx.session, input.id)),
  restore: p.input(z.object({ id, slug: z.string().max(40), name: z.string().max(160) })).mutation(({ ctx, input }) => backups.restoreBackup(ctx.db, ctx.session, input)),
});

export const projectsRouter = router({
  options: p.query(({ ctx }) => projects.projectOptions(ctx.db, ctx.session)),
  list: p.query(({ ctx }) => projects.listProjects(ctx.db, ctx.session)),
  create: p.input(z.object({ title: z.string().max(160), description: z.string().max(500).nullish(), icon: z.string().max(80).nullish(), teamspaceId: id, templateKey: z.string().max(40), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), assigneeIds: z.array(id).max(20).optional() })).mutation(({ ctx, input }) => projects.createProject(ctx.db, ctx.session, input)),
});

export const securityRouter = router({
  /** عنوان الاتصال الحالي وهل تشمله قيود الشبكة (لصفحة سياسة الوصول) */
  status: p.query(({ ctx }) => ({ ip: normalizeIp(ctx.ip), sensitive: Boolean(ctx.session.sensitive), staff: ctx.session.roleKeys.some((k) => k !== "PARENT" && k !== "STUDENT") })),
});
