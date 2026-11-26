import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { createDatabase } from "../db/client.js";
import {
  child,
  childMilestone,
  childVaccine,
  family,
  familyMember,
  familyRevCounter,
  growthMeasurement,
  growthTarget,
  logEntry,
  mpasiFood,
} from "../db/schema.js";

type Db = ReturnType<typeof createDatabase>["db"];
type SyncTable =
  | "log_entry"
  | "growth_measurement"
  | "growth_target"
  | "child_vaccine"
  | "child_milestone"
  | "mpasi_food"
  | "child"
  | "family_member"
  | "family";
type SyncRow = { id: string; rev: number };
type SyncItem = {
  table: SyncTable;
  id: string;
  rev: number;
  row: unknown;
};
const PageSize = 500;
const SinceSchema = z.number().int().nonnegative().safe();

function uid(res: Response) {
  const session = res.locals.session as { user?: { id?: string } } | undefined;
  return session?.user?.id ?? null;
}

function err(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

function itemsFor<T extends SyncRow>(table: SyncTable, rows: T[]): SyncItem[] {
  return rows.map((row) => ({ table, id: row.id, rev: row.rev, row }));
}

function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (error?: unknown) => void) =>
    void fn(req, res).catch(next);
}

export function createSyncRouter(db: Db) {
  const router = Router();

  router.get(
    "/families/:fid/sync",
    handler(async (req, res) => {
      const userId = uid(res);
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );

      const familyId = req.params.fid ?? "";
      const rawSince = req.query.since;
      const parsedSince =
        typeof rawSince === "string" ? Number(rawSince) : Number.NaN;
      if (!SinceSchema.safeParse(parsedSince).success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "A non-negative integer since revision is required.",
        );

      const membership = await db
        .select({ id: familyMember.id })
        .from(familyMember)
        .innerJoin(family, eq(family.id, familyMember.familyId))
        .where(
          and(
            eq(familyMember.familyId, familyId),
            eq(familyMember.userId, userId),
            isNull(familyMember.removedAt),
            isNull(family.deletedAt),
          ),
        )
        .get();
      if (!membership)
        return void err(res, 404, "NOT_FOUND", "Family not found.");

      const counter = await db
        .select({ rev: familyRevCounter.rev })
        .from(familyRevCounter)
        .where(eq(familyRevCounter.familyId, familyId))
        .get();
      if (!counter) throw new Error("Missing family revision counter.");
      const snapshotRev = Math.max(parsedSince, counter.rev);
      const changed = (rev: SQLWrapper) =>
        and(gt(rev, parsedSince), lte(rev, snapshotRev));

      const [
        logs,
        growth,
        targets,
        vaccines,
        milestones,
        foods,
        children,
        members,
        families,
      ] = await Promise.all([
        db
          .select()
          .from(logEntry)
          .where(and(eq(logEntry.familyId, familyId), changed(logEntry.rev)))
          .limit(PageSize + 1),
        db
          .select()
          .from(growthMeasurement)
          .where(
            and(
              eq(growthMeasurement.familyId, familyId),
              changed(growthMeasurement.rev),
            ),
          )
          .limit(PageSize + 1),
        db
          .select()
          .from(growthTarget)
          .where(
            and(eq(growthTarget.familyId, familyId), changed(growthTarget.rev)),
          )
          .limit(PageSize + 1),
        db
          .select()
          .from(childVaccine)
          .where(
            and(eq(childVaccine.familyId, familyId), changed(childVaccine.rev)),
          )
          .limit(PageSize + 1),
        db
          .select()
          .from(childMilestone)
          .where(
            and(
              eq(childMilestone.familyId, familyId),
              changed(childMilestone.rev),
            ),
          )
          .limit(PageSize + 1),
        db
          .select()
          .from(mpasiFood)
          .where(and(eq(mpasiFood.familyId, familyId), changed(mpasiFood.rev)))
          .limit(PageSize + 1),
        db
          .select()
          .from(child)
          .where(and(eq(child.familyId, familyId), changed(child.rev)))
          .limit(PageSize + 1),
        db
          .select()
          .from(familyMember)
          .where(
            and(eq(familyMember.familyId, familyId), changed(familyMember.rev)),
          )
          .limit(PageSize + 1),
        db
          .select()
          .from(family)
          .where(and(eq(family.id, familyId), changed(family.rev)))
          .limit(PageSize + 1),
      ]);

      const candidates = [
        ...itemsFor("log_entry", logs),
        ...itemsFor("growth_measurement", growth),
        ...itemsFor("growth_target", targets),
        ...itemsFor("child_vaccine", vaccines),
        ...itemsFor("child_milestone", milestones),
        ...itemsFor("mpasi_food", foods),
        ...itemsFor("child", children),
        ...itemsFor("family_member", members),
        ...itemsFor("family", families),
      ].sort(
        (left, right) =>
          left.rev - right.rev ||
          left.table.localeCompare(right.table) ||
          left.id.localeCompare(right.id),
      );

      const page = candidates.slice(0, PageSize);
      if (candidates.length > PageSize) {
        const boundaryRev = page.at(-1)?.rev;
        while (
          boundaryRev !== undefined &&
          candidates[page.length]?.rev === boundaryRev
        ) {
          page.push(candidates[page.length]!);
        }
      }

      const hasMore = candidates.length > page.length;
      const pageRev = page.at(-1)?.rev;
      res.json({
        items: page.map(({ table, row }) => ({ table, row })),
        rev: hasMore ? (pageRev ?? parsedSince) : snapshotRev,
        hasMore,
      });
    }),
  );

  return router;
}
