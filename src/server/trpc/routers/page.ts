import { z } from "zod";
import * as pages from "@/server/services/page.service";
import { authedProcedure, router } from "../init";

const id = z.string().min(1).max(64);

export const pageRouter = router({
  get: authedProcedure.input(z.object({ pageId: id })).query(async ({ ctx, input }) => {
    const result = await pages.getPage(ctx.db, ctx.session, input.pageId);
    await pages.recordVisit(ctx.db, ctx.session, { targetType: "PAGE", targetId: input.pageId });
    return result;
  }),

  create: authedProcedure
    .input(
      z.object({
        teamspaceId: id.nullish(),
        parentId: id.nullish(),
        title: z.string().max(500).optional(),
        icon: z.string().max(300).nullish(),
        kind: z.enum(["PAGE", "DATABASE"]).optional(),
        afterPageId: id.nullish(),
        content: z.unknown().optional(),
      }),
    )
    .mutation(({ ctx, input }) => pages.createPage(ctx.db, ctx.session, input)),

  update: authedProcedure
    .input(
      z.object({
        pageId: id,
        title: z.string().max(500).optional(),
        icon: z.string().max(300).nullish(),
        cover: z.string().max(500).nullish(),
        description: z.string().max(2000).nullish(),
        content: z.unknown().optional(),
        fullWidth: z.boolean().optional(),
        isLocked: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => pages.updatePage(ctx.db, ctx.session, input)),

  move: authedProcedure
    .input(z.object({ pageId: id, parentId: id.nullish(), teamspaceId: id.nullish(), beforeId: id.nullish(), afterId: id.nullish() }))
    .mutation(({ ctx, input }) => pages.movePage(ctx.db, ctx.session, input)),

  duplicate: authedProcedure.input(z.object({ pageId: id })).mutation(({ ctx, input }) => pages.duplicatePage(ctx.db, ctx.session, input.pageId)),
  trash: authedProcedure.input(z.object({ pageId: id })).mutation(({ ctx, input }) => pages.trashPage(ctx.db, ctx.session, input.pageId)),
  restore: authedProcedure.input(z.object({ pageId: id })).mutation(({ ctx, input }) => pages.restorePage(ctx.db, ctx.session, input.pageId)),
  purge: authedProcedure.input(z.object({ pageId: id })).mutation(({ ctx, input }) => pages.purgePage(ctx.db, ctx.session, input.pageId)),
  trashList: authedProcedure.query(({ ctx }) => pages.listTrash(ctx.db, ctx.session)),

  versions: authedProcedure
    .input(z.object({ targetType: z.enum(["PAGE", "ROW"]), targetId: id }))
    .query(({ ctx, input }) => pages.listVersions(ctx.db, ctx.session, input.targetType, input.targetId)),
  restoreVersion: authedProcedure.input(z.object({ versionId: id })).mutation(({ ctx, input }) => pages.restoreVersion(ctx.db, ctx.session, input.versionId)),

  shares: authedProcedure.input(z.object({ pageId: id })).query(({ ctx, input }) => pages.listShares(ctx.db, ctx.session, input.pageId)),
  setShare: authedProcedure
    .input(z.object({ pageId: id, userId: id, level: z.enum(["VIEW", "COMMENT", "EDIT", "FULL"]) }))
    .mutation(({ ctx, input }) => pages.setShare(ctx.db, ctx.session, input)),
  removeShare: authedProcedure
    .input(z.object({ pageId: id, userId: id }))
    .mutation(({ ctx, input }) => pages.removeShare(ctx.db, ctx.session, input)),
});
