import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { PROPERTY_TYPES, VIEW_TYPES } from "@/lib/database/types";
import * as dbs from "@/server/services/database.service";
import { assertDatabaseAccess, assertRowAccess } from "@/server/services/access.service";
import { entityActivity } from "@/server/services/admin/audit.service";
import { commentCounts } from "@/server/services/comment.service";
import { notFound } from "@/server/errors";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const values = z.record(z.string(), z.unknown());
const viewConfig = z.record(z.string(), z.unknown());
const propertyConfig = z.record(z.string(), z.unknown());

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ROW_CREATED") }),
  z.object({ type: z.literal("PROPERTY_CHANGED"), propertyId: id, toValue: z.unknown().optional() }),
  z.object({ type: z.literal("DATE_REACHED"), propertyId: id, offsetDays: z.number().int().min(-365).max(365) }),
]);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SET_PROPERTY"), propertyId: id, value: z.unknown() }),
  z.object({
    type: z.literal("NOTIFY"),
    recipients: z.enum(["PERSON_PROPERTY", "CREATOR", "USERS"]),
    propertyId: id.optional(),
    userIds: z.array(id).max(50).optional(),
    message: z.string().max(300),
  }),
]);

export const databaseRouter = router({
  bundle: authedProcedure.input(z.object({ databaseId: id })).query(({ ctx, input }) => dbs.getDatabaseBundle(ctx.db, ctx.session, input.databaseId)),

  rows: authedProcedure.input(z.object({ databaseId: id })).query(async ({ ctx, input }) => {
    const result = await dbs.listRows(ctx.db, ctx.session, input.databaseId);
    const comments = await commentCounts(ctx.db, "ROW", result.rows.map((r) => r.id));
    return { ...result, commentCounts: comments };
  }),

  row: authedProcedure.input(z.object({ rowId: id })).query(async ({ ctx, input }) => {
    const result = await dbs.getRow(ctx.db, ctx.session, input.rowId);
    const { recordVisit } = await import("@/server/services/page.service");
    await recordVisit(ctx.db, ctx.session, { targetType: "ROW", targetId: input.rowId });
    return result;
  }),

  rowActivity: authedProcedure.input(z.object({ rowId: id })).query(async ({ ctx, input }) => {
    await assertRowAccess(ctx.db, ctx.session, input.rowId, "VIEW", { includeDeleted: true });
    return entityActivity(ctx.db, "DatabaseRow", input.rowId);
  }),

  createRow: authedProcedure
    .input(
      z.object({
        databaseId: id,
        title: z.string().max(500).optional(),
        values: values.optional(),
        templateId: id.nullish(),
        afterRowId: id.nullish(),
        beforeRowId: id.nullish(),
      }),
    )
    .mutation(({ ctx, input }) => dbs.createRow(ctx.db, ctx.session, input)),

  updateRow: authedProcedure
    .input(
      z.object({
        rowId: id,
        title: z.string().max(500).optional(),
        icon: z.string().max(300).nullish(),
        cover: z.string().max(500).nullish(),
        values: values.optional(),
        content: z.unknown().optional(),
      }),
    )
    .mutation(({ ctx, input }) => dbs.updateRow(ctx.db, ctx.session, input)),

  moveRow: authedProcedure
    .input(z.object({ rowId: id, beforeRowId: id.nullish(), afterRowId: id.nullish(), values: values.optional() }))
    .mutation(({ ctx, input }) => dbs.moveRow(ctx.db, ctx.session, input)),

  trashRows: authedProcedure.input(z.object({ rowIds: z.array(id).min(1).max(500) })).mutation(({ ctx, input }) => dbs.trashRows(ctx.db, ctx.session, input.rowIds)),
  restoreRows: authedProcedure.input(z.object({ rowIds: z.array(id).min(1).max(500) })).mutation(({ ctx, input }) => dbs.restoreRows(ctx.db, ctx.session, input.rowIds)),
  duplicateRow: authedProcedure.input(z.object({ rowId: id })).mutation(({ ctx, input }) => dbs.duplicateRow(ctx.db, ctx.session, input.rowId)),

  createProperty: authedProcedure
    .input(z.object({ databaseId: id, name: z.string().max(100), type: z.enum(PROPERTY_TYPES), config: propertyConfig.optional() }))
    .mutation(({ ctx, input }) => dbs.createProperty(ctx.db, ctx.session, { ...input, config: input.config as never })),

  updateProperty: authedProcedure
    .input(
      z.object({
        propertyId: id,
        name: z.string().max(100).optional(),
        type: z.enum(PROPERTY_TYPES).optional(),
        config: propertyConfig.optional(),
        description: z.string().max(500).nullish(),
      }),
    )
    .mutation(({ ctx, input }) => dbs.updateProperty(ctx.db, ctx.session, { ...input, config: input.config as never })),

  addOption: authedProcedure
    .input(z.object({ propertyId: id, name: z.string().trim().min(1).max(100), color: z.string().max(20).optional() }))
    .mutation(({ ctx, input }) => dbs.addSelectOption(ctx.db, ctx.session, input)),

  deleteProperty: authedProcedure.input(z.object({ propertyId: id })).mutation(({ ctx, input }) => dbs.deleteProperty(ctx.db, ctx.session, input.propertyId)),

  reorderProperty: authedProcedure
    .input(z.object({ propertyId: id, beforeId: id.nullish(), afterId: id.nullish() }))
    .mutation(({ ctx, input }) => dbs.reorderProperty(ctx.db, ctx.session, input)),

  createView: authedProcedure
    .input(z.object({ databaseId: id, name: z.string().max(100).optional(), type: z.enum(VIEW_TYPES), isPersonal: z.boolean().optional(), config: viewConfig.optional() }))
    .mutation(({ ctx, input }) => dbs.createView(ctx.db, ctx.session, { ...input, config: input.config as never })),

  updateView: authedProcedure
    .input(z.object({ viewId: id, name: z.string().max(100).optional(), type: z.enum(VIEW_TYPES).optional(), config: viewConfig.optional(), isPersonal: z.boolean().optional() }))
    .mutation(({ ctx, input }) => dbs.updateView(ctx.db, ctx.session, { ...input, config: input.config as never })),

  deleteView: authedProcedure.input(z.object({ viewId: id })).mutation(({ ctx, input }) => dbs.deleteView(ctx.db, ctx.session, input.viewId)),
  duplicateView: authedProcedure.input(z.object({ viewId: id })).mutation(({ ctx, input }) => dbs.duplicateView(ctx.db, ctx.session, input.viewId)),
  reorderView: authedProcedure
    .input(z.object({ viewId: id, beforeId: id.nullish(), afterId: id.nullish() }))
    .mutation(({ ctx, input }) => dbs.reorderView(ctx.db, ctx.session, input)),

  upsertTemplate: authedProcedure
    .input(
      z.object({
        databaseId: id,
        templateId: id.nullish(),
        name: z.string().max(100),
        icon: z.string().max(300).nullish(),
        title: z.string().max(500).optional(),
        values: values.optional(),
        content: z.unknown().optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => dbs.upsertTemplate(ctx.db, ctx.session, input)),
  deleteTemplate: authedProcedure.input(z.object({ templateId: id })).mutation(({ ctx, input }) => dbs.deleteTemplate(ctx.db, ctx.session, input.templateId)),

  accessibleDatabases: authedProcedure.query(({ ctx }) => dbs.listAccessibleDatabases(ctx.db, ctx.session)),

  // ---------------- الأتمتة ----------------
  upsertAutomation: authedProcedure
    .input(
      z.object({
        databaseId: id,
        automationId: id.nullish(),
        name: z.string().trim().min(1).max(120),
        isEnabled: z.boolean().optional(),
        trigger: triggerSchema,
        actions: z.array(actionSchema).min(1).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDatabaseAccess(ctx.db, ctx.session, input.databaseId, "EDIT");
      const data = {
        name: input.name,
        isEnabled: input.isEnabled ?? true,
        trigger: input.trigger as Prisma.InputJsonValue,
        actions: input.actions as Prisma.InputJsonValue,
        updatedById: ctx.session.user.id,
      };
      if (input.automationId) {
        const existing = await ctx.db.automation.findFirst({ where: { id: input.automationId, databaseId: input.databaseId } });
        if (!existing) throw notFound("قاعدة الأتمتة غير موجودة");
        return ctx.db.automation.update({ where: { id: existing.id }, data });
      }
      return ctx.db.automation.create({
        data: { ...data, tenantId: ctx.session.tenant.id, databaseId: input.databaseId, createdById: ctx.session.user.id },
      });
    }),

  toggleAutomation: authedProcedure.input(z.object({ automationId: id, isEnabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const automation = await ctx.db.automation.findFirst({ where: { id: input.automationId } });
    if (!automation) throw notFound("قاعدة الأتمتة غير موجودة");
    await assertDatabaseAccess(ctx.db, ctx.session, automation.databaseId, "EDIT");
    return ctx.db.automation.update({ where: { id: automation.id }, data: { isEnabled: input.isEnabled } });
  }),

  deleteAutomation: authedProcedure.input(z.object({ automationId: id })).mutation(async ({ ctx, input }) => {
    const automation = await ctx.db.automation.findFirst({ where: { id: input.automationId } });
    if (!automation) throw notFound("قاعدة الأتمتة غير موجودة");
    await assertDatabaseAccess(ctx.db, ctx.session, automation.databaseId, "EDIT");
    await ctx.db.automation.delete({ where: { id: automation.id } });
    return { id: automation.id };
  }),

  automationRuns: authedProcedure.input(z.object({ automationId: id })).query(async ({ ctx, input }) => {
    const automation = await ctx.db.automation.findFirst({ where: { id: input.automationId } });
    if (!automation) throw notFound("قاعدة الأتمتة غير موجودة");
    await assertDatabaseAccess(ctx.db, ctx.session, automation.databaseId, "VIEW");
    return ctx.db.automationRun.findMany({ where: { automationId: automation.id }, orderBy: { createdAt: "desc" }, take: 30 });
  }),
});
