import { z } from "zod";
import * as academic from "@/server/services/academic.service";
import { getModuleSettings, updateModuleSettings, type ModuleSettingsKey } from "@/server/services/module-settings.service";
import { authedProcedure, router } from "../init";

const settingsKey = z.enum(["students", "admissions", "attendance", "messageTemplates"]);

export const academicRouter = router({
  sectionOptions: authedProcedure.query(({ ctx }) => academic.sectionOptions(ctx.db, ctx.session)),
});

export const moduleSettingsRouter = router({
  get: authedProcedure.input(z.object({ key: settingsKey })).query(({ ctx, input }) => getModuleSettings(ctx.db, ctx.session, input.key as ModuleSettingsKey)),
  update: authedProcedure
    .input(z.object({ key: settingsKey, patch: z.record(z.string(), z.unknown()) }))
    .mutation(({ ctx, input }) => updateModuleSettings(ctx.db, ctx.session, input.key as ModuleSettingsKey, input.patch)),
});
