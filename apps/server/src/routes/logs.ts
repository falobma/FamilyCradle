import {
  CreateMpasiFoodSchema,
  CreateLogEntrySchema,
  LogEntryDetailsSchemas,
  UpdateLogEntrySchema,
  UpdateMpasiFoodSchema,
  UuidSchema,
} from "@familycradle/shared";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import type { createDatabase } from "../db/client.js";
import { z } from "zod";
import {
  auditLog,
  child,
  family,
  familyMember,
  familyRevCounter,
  logEntry,
  mpasiFood,
  userProfile,
} from "../db/schema.js";
import { createUuidV5, createUuidV7 } from "../ids.js";

type Db = ReturnType<typeof createDatabase>["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const TimerActionSchema = z.strictObject({
  action: z.enum(["pause", "resume", "switch"]),
});
function uid(res: Response) {
  const s = res.locals.session as { user?: { id?: string } } | undefined;
  return s?.user?.id ?? null;
}
function err(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}
function param(req: Request, key: string) {
  return req.params[key] ?? "";
}
async function membership(db: Db, fid: string, userId: string) {
  return db
    .select({ role: familyMember.role })
    .from(familyMember)
    .innerJoin(family, eq(family.id, familyMember.familyId))
    .where(
      and(
        eq(familyMember.familyId, fid),
        eq(familyMember.userId, userId),
        isNull(familyMember.removedAt),
        isNull(family.deletedAt),
      ),
    )
    .get();
}
async function bump(tx: Tx, fid: string) {
  const [r] = await tx
    .update(familyRevCounter)
    .set({ rev: sql`${familyRevCounter.rev} + 1` })
    .where(eq(familyRevCounter.familyId, fid))
    .returning({ rev: familyRevCounter.rev });
  if (!r) throw new Error("Missing family revision counter.");
  return r.rev;
}
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (e?: unknown) => void) =>
    void fn(req, res).catch(next);
}
function lastOpenIndex(items: Array<{ endedAt?: string }>) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!items[index]!.endedAt) return index;
  }
  return -1;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const allergens = new Set([
  "egg",
  "telur",
  "peanut",
  "kacang tanah",
  "cow's milk",
  "susu sapi",
  "dairy",
  "milk",
  "susu",
  "fish",
  "ikan",
  "shrimp",
  "udang",
  "shellfish",
  "kerang",
  "wheat",
  "gandum",
  "soy",
  "kedelai",
  "sesame",
  "wijen",
  "almond",
  "mete",
  "cashew",
  "kenari",
  "walnut",
  "tree nut",
]);
async function resolveMpasiFoods(
  tx: Tx,
  familyId: string,
  childId: string,
  foodIds: string[],
  foodNames: string[] | undefined,
  userId: string,
  nowIso: string,
) {
  const ids = new Set(foodIds);
  for (const rawName of foodNames ?? []) {
    const name = rawName.toLowerCase();
    const existing = await tx
      .select({ id: mpasiFood.id })
      .from(mpasiFood)
      .where(and(eq(mpasiFood.childId, childId), eq(mpasiFood.name, name)))
      .get();
    if (existing) {
      ids.add(existing.id);
      continue;
    }
    await tx
      .insert(mpasiFood)
      .values({
        id: createUuidV7(),
        familyId,
        childId,
        name,
        foodGroup: "other",
        isCommonAllergen: allergens.has(name),
        createdBy: userId,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: userId,
      })
      .onConflictDoNothing();
    const created = await tx
      .select({ id: mpasiFood.id })
      .from(mpasiFood)
      .where(and(eq(mpasiFood.childId, childId), eq(mpasiFood.name, name)))
      .get();
    if (created) ids.add(created.id);
  }
  if (ids.size === 0) return [];
  return tx
    .select()
    .from(mpasiFood)
    .where(
      and(eq(mpasiFood.childId, childId), inArray(mpasiFood.id, [...ids])),
    );
}

export function createLogRouter(db: Db) {
  const router = Router();
  router.get(
    "/children/:cid/foods",
    handler(async (req, res) => {
      const userId = uid(res);
      const cid = param(req, "cid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const target = await db
        .select({ familyId: child.familyId })
        .from(child)
        .where(and(eq(child.id, cid), isNull(child.deletedAt)))
        .get();
      if (!target || !(await membership(db, target.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Child not found.");
      const foods = await db
        .select()
        .from(mpasiFood)
        .where(eq(mpasiFood.childId, cid));
      res.json({ items: foods });
    }),
  );
  router.post(
    "/children/:cid/foods",
    handler(async (req, res) => {
      const userId = uid(res);
      const cid = param(req, "cid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const body = CreateMpasiFoodSchema.safeParse(req.body);
      if (!body.success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
        );
      const target = await db
        .select({ familyId: child.familyId })
        .from(child)
        .where(and(eq(child.id, cid), isNull(child.deletedAt)))
        .get();
      if (!target || !(await membership(db, target.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Child not found.");
      const now = new Date().toISOString();
      const name = body.data.name.toLowerCase();
      const flagged = body.data.isCommonAllergen ?? allergens.has(name);
      const foodId = createUuidV7();
      await db.transaction(async (tx) => {
        await bump(tx, target.familyId);
        await tx
          .insert(mpasiFood)
          .values({
            id: foodId,
            familyId: target.familyId,
            childId: cid,
            name,
            foodGroup: body.data.foodGroup,
            isCommonAllergen: flagged,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
          })
          .onConflictDoNothing();
        const [food] = await tx
          .select()
          .from(mpasiFood)
          .where(and(eq(mpasiFood.childId, cid), eq(mpasiFood.name, name)));
        if (!food) throw new Error("Food could not be created.");
        await tx.insert(auditLog).values({
          id: createUuidV7(),
          familyId: target.familyId,
          actorUserId: userId,
          entityType: "mpasi_food",
          entityId: food.id,
          action: "create",
          changes: JSON.stringify({
            foodGroup: food.foodGroup,
            isCommonAllergen: food.isCommonAllergen,
          }),
          at: now,
        });
      });
      const food = await db
        .select()
        .from(mpasiFood)
        .where(and(eq(mpasiFood.childId, cid), eq(mpasiFood.name, name)))
        .get();
      res.status(201).json(food);
    }),
  );
  router.patch(
    "/foods/:id",
    handler(async (req, res) => {
      const userId = uid(res);
      const id = param(req, "id");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const body = UpdateMpasiFoodSchema.safeParse(req.body);
      if (!body.success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
        );
      const current = await db
        .select()
        .from(mpasiFood)
        .where(eq(mpasiFood.id, id))
        .get();
      if (!current || !(await membership(db, current.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Food not found.");
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await bump(tx, current.familyId);
        await tx
          .update(mpasiFood)
          .set({ ...body.data, updatedAt: now, updatedBy: userId })
          .where(eq(mpasiFood.id, id));
        await tx.insert(auditLog).values({
          id: createUuidV7(),
          familyId: current.familyId,
          actorUserId: userId,
          entityType: "mpasi_food",
          entityId: id,
          action: "update",
          changes: JSON.stringify(body.data),
          at: now,
        });
      });
      res.json({ ...current, ...body.data, updatedAt: now });
    }),
  );
  router.get(
    "/families/:fid/logs",
    handler(async (req, res) => {
      const userId = uid(res);
      const fid = param(req, "fid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      if (
        !UuidSchema.safeParse(fid).success ||
        !(await membership(db, fid, userId))
      )
        return void err(res, 404, "NOT_FOUND", "Family not found.");
      const rows = await db
        .select()
        .from(logEntry)
        .where(and(eq(logEntry.familyId, fid), isNull(logEntry.deletedAt)))
        .orderBy(desc(logEntry.startedAt))
        .limit(300);
      const authors = rows.length
        ? await db
            .select({
              userId: userProfile.userId,
              displayName: userProfile.displayName,
            })
            .from(userProfile)
            .where(
              inArray(userProfile.userId, [
                ...new Set([
                  ...rows.map((row) => row.createdBy),
                  ...rows.map((row) => row.updatedBy),
                ]),
              ]),
            )
        : [];
      const authorNames = new Map(
        authors.map((author) => [author.userId, author.displayName]),
      );
      res.json({
        items: rows.map((row) => ({
          ...row,
          createdByDisplayName:
            authorNames.get(row.createdBy) ?? "Former member",
          updatedByDisplayName:
            authorNames.get(row.updatedBy) ?? "Former member",
          details: JSON.parse(row.details),
        })),
      });
    }),
  );
  router.get(
    "/families/:fid/logs/deleted",
    handler(async (req, res) => {
      const userId = uid(res);
      const fid = param(req, "fid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      if (
        !UuidSchema.safeParse(fid).success ||
        !(await membership(db, fid, userId))
      )
        return void err(res, 404, "NOT_FOUND", "Family not found.");
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const rows = await db
        .select()
        .from(logEntry)
        .where(
          and(
            eq(logEntry.familyId, fid),
            isNotNull(logEntry.deletedAt),
            gt(logEntry.deletedAt, cutoff),
          ),
        )
        .orderBy(desc(logEntry.deletedAt));
      res.json({
        items: rows.map((row) => ({
          ...row,
          details: JSON.parse(row.details),
        })),
      });
    }),
  );
  router.post(
    "/logs/:id/timer/action",
    handler(async (req, res) => {
      const userId = uid(res);
      const id = param(req, "id");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const parsed = TimerActionSchema.safeParse(req.body);
      if (!parsed.success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Timer action is invalid.",
        );
      const current = await db
        .select()
        .from(logEntry)
        .where(and(eq(logEntry.id, id), isNull(logEntry.deletedAt)))
        .get();
      if (!current || !(await membership(db, current.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Timer not found.");
      if (
        current.type === "medicine" ||
        current.type === "bottle" ||
        current.type === "diaper" ||
        current.type === "mpasi"
      )
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "This entry does not support timers.",
        );
      const action = parsed.data.action;
      if (
        (action === "resume" && current.status !== "paused") ||
        (action !== "resume" && current.status !== "running")
      )
        return void err(
          res,
          409,
          "CONFLICT",
          "Timer state changed. Refresh and try again.",
        );
      if (action === "switch" && current.type !== "breastfeed")
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Only breastfeeding timers can switch sides.",
        );
      const now = new Date().toISOString();
      const details = JSON.parse(current.details) as Record<string, unknown>;
      const nextStatus: "running" | "paused" =
        action === "pause" ? "paused" : "running";
      if (current.type === "breastfeed") {
        const segments = Array.isArray(details.segments)
          ? (details.segments as Array<{
              side: "left" | "right";
              startedAt: string;
              endedAt?: string;
            }>)
          : [];
        if (action === "resume")
          segments.push({
            side: details.lastSide as "left" | "right",
            startedAt: now,
          });
        else {
          const index = lastOpenIndex(segments);
          if (index >= 0)
            segments[index] = { ...segments[index]!, endedAt: now };
          if (action === "switch") {
            const side = details.lastSide === "left" ? "right" : "left";
            details.lastSide = side;
            segments.push({ side, startedAt: now });
          }
        }
        details.segments = segments;
      } else {
        const pauses = Array.isArray(details.pauses)
          ? (details.pauses as Array<{ startedAt: string; endedAt?: string }>)
          : [];
        if (action === "pause") pauses.push({ startedAt: now });
        if (action === "resume") {
          const index = lastOpenIndex(pauses);
          if (index >= 0) pauses[index] = { ...pauses[index]!, endedAt: now };
        }
        details.pauses = pauses;
      }
      const result = await db.transaction(async (tx) => {
        const rev = await bump(tx, current.familyId);
        const [row] = await tx
          .update(logEntry)
          .set({
            status: nextStatus,
            details: JSON.stringify(details),
            updatedAt: now,
            updatedBy: userId,
            version: sql`${logEntry.version} + 1`,
            rev,
          })
          .where(
            and(eq(logEntry.id, id), eq(logEntry.version, current.version)),
          )
          .returning();
        if (!row) throw new Error("Timer changed concurrently.");
        await tx.insert(auditLog).values({
          id: createUuidV7(),
          familyId: current.familyId,
          actorUserId: userId,
          entityType: "log_entry",
          entityId: id,
          action: "update",
          changes: JSON.stringify({ action, status: nextStatus }),
          at: now,
        });
        return row;
      });
      res.json({ ...result, details });
    }),
  );
  router.post(
    "/families/:fid/logs",
    handler(async (req, res) => {
      const userId = uid(res);
      const fid = param(req, "fid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      if (
        !UuidSchema.safeParse(fid).success ||
        !(await membership(db, fid, userId))
      )
        return void err(res, 404, "NOT_FOUND", "Family not found.");
      const parsed = CreateLogEntrySchema.safeParse(req.body);
      if (!parsed.success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
        );
      const input = parsed.data;
      const now = new Date();
      const running =
        !("endedAt" in input && input.endedAt) &&
        ["sleep", "breastfeed", "pumping"].includes(input.type);
      const startedAt = running ? now.toISOString() : input.startedAt;
      const started = new Date(startedAt);
      if (started.valueOf() > now.valueOf() + 5 * 60_000)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Entry time cannot be more than five minutes in the future.",
        );
      const end = "endedAt" in input ? input.endedAt : undefined;
      if (end && new Date(end).valueOf() < started.valueOf())
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "End time must follow start time.",
        );
      const requestedChildIds: Array<string | null> =
        input.type === "pumping"
          ? [null]
          : "childIds" in input && input.childIds
            ? [...new Set(input.childIds)]
            : [input.childId];
      if (requestedChildIds.length > 1 && !("batchId" in input))
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Multi-child entries require a batch ID.",
        );
      const targets: Array<{ id: string | null; dateOfBirth: string | null }> =
        [];
      for (const childId of requestedChildIds) {
        if (childId === null) {
          targets.push({ id: null, dateOfBirth: null });
          continue;
        }
        const target = await db
          .select({ id: child.id, dateOfBirth: child.dateOfBirth })
          .from(child)
          .where(
            and(
              eq(child.id, childId),
              eq(child.familyId, fid),
              isNull(child.deletedAt),
            ),
          )
          .get();
        if (!target) return void err(res, 404, "NOT_FOUND", "Child not found.");
        if (startedAt.slice(0, 10) < target.dateOfBirth)
          return void err(
            res,
            400,
            "VALIDATION_ERROR",
            "Entry cannot predate the child.",
          );
        targets.push(target);
      }
      if (input.type === "sleep") {
        for (const target of targets) {
          if (!target.id) continue;
          const overlap = await db
            .select({ id: logEntry.id })
            .from(logEntry)
            .where(
              and(
                eq(logEntry.childId, target.id),
                eq(logEntry.type, "sleep"),
                isNull(logEntry.deletedAt),
                lt(logEntry.startedAt, end ?? "9999-12-31T23:59:59.999Z"),
                sql`(${logEntry.status} IN ('running','paused') OR (${logEntry.endedAt} IS NOT NULL AND ${logEntry.endedAt} > ${startedAt}))`,
              ),
            )
            .get();
          if (overlap)
            return void err(
              res,
              409,
              "CONFLICT",
              "Sleep entry overlaps another sleep session.",
            );
        }
      }
      const nowIso = now.toISOString();
      const batchId = "batchId" in input ? (input.batchId ?? null) : null;
      const baseId = input.id;
      const entryIds = targets.map((target, index) =>
        index === 0 || !target.id ? baseId : createUuidV5(baseId, target.id),
      );
      try {
        const result = await db.transaction(async (tx) => {
          const rev = await bump(tx, fid);
          const created: Array<Record<string, unknown>> = [];
          let allergyWatch = false;
          const commonAllergenNames = new Set<string>();
          let diaperDoctorNote = false;
          for (const [index, target] of targets.entries()) {
            const entryId = entryIds[index]!;
            let entryDetails: Record<string, unknown> = input.details;
            if (input.type === "mpasi" && target.id) {
              const foods = await resolveMpasiFoods(
                tx,
                fid,
                target.id,
                input.details.foodIds,
                input.details.foodNames,
                userId,
                nowIso,
              );
              if (foods.length === 0)
                throw new HttpError(
                  400,
                  "VALIDATION_ERROR",
                  "Food selection is invalid.",
                );
              const foodIntroducedIds = foods
                .filter((food) => !food.firstIntroducedAt)
                .map((food) => food.id);
              for (const food of foods)
                if (food.isCommonAllergen) commonAllergenNames.add(food.name);
              const cutoff = now.valueOf() - 3 * 24 * 60 * 60_000;
              const recentFoods = await tx
                .select({
                  id: mpasiFood.id,
                  firstIntroducedAt: mpasiFood.firstIntroducedAt,
                })
                .from(mpasiFood)
                .where(eq(mpasiFood.childId, target.id));
              if (
                foodIntroducedIds.length > 0 &&
                recentFoods.some(
                  (food) =>
                    food.firstIntroducedAt &&
                    new Date(food.firstIntroducedAt).valueOf() >= cutoff &&
                    !foods.some((selected) => selected.id === food.id),
                )
              )
                allergyWatch = true;
              if (foodIntroducedIds.length) {
                await tx
                  .update(mpasiFood)
                  .set({
                    firstIntroducedAt: startedAt,
                    updatedAt: nowIso,
                    updatedBy: userId,
                  })
                  .where(
                    and(
                      inArray(mpasiFood.id, foodIntroducedIds),
                      isNull(mpasiFood.firstIntroducedAt),
                    ),
                  );
              }
              if (
                input.details.reaction &&
                input.details.reaction.kind !== "none"
              ) {
                const reactionFoodIds =
                  input.details.reaction.foodIds ??
                  foods.map((food) => food.id);
                await tx
                  .update(mpasiFood)
                  .set({
                    reactionStatus: "suspected",
                    updatedAt: nowIso,
                    updatedBy: userId,
                  })
                  .where(
                    and(
                      eq(mpasiFood.childId, target.id),
                      inArray(mpasiFood.id, reactionFoodIds),
                    ),
                  );
              }
              entryDetails = {
                ...input.details,
                foodIds: foods.map((food) => food.id),
                newFoodIds: foodIntroducedIds,
              };
            }
            if (input.type === "diaper" && target.dateOfBirth) {
              const ageDays = Math.floor(
                (started.valueOf() -
                  new Date(`${target.dateOfBirth}T00:00:00.000Z`).valueOf()) /
                  86400000,
              );
              if (
                ["merah", "pucat_putih"].includes(input.details.color ?? "") ||
                (input.details.color === "hitam" && ageDays > 4)
              )
                diaperDoctorNote = true;
            }
            const durationSec =
              input.type === "breastfeed" &&
              "leftSec" in input.details &&
              input.details.leftSec !== undefined
                ? input.details.leftSec + (input.details.rightSec ?? 0)
                : end
                  ? Math.floor(
                      (new Date(end).valueOf() - started.valueOf()) / 1000,
                    )
                  : null;
            if (running && input.type === "breastfeed") {
              entryDetails = {
                ...input.details,
                segments: [{ side: input.details.lastSide, startedAt }],
              };
            }
            const row = {
              id: entryId,
              familyId: fid,
              childId: target.id,
              type: input.type,
              status: running ? ("running" as const) : ("completed" as const),
              startedAt: startedAt,
              endedAt: end ?? null,
              amountMl: "amountMl" in input ? input.amountMl : null,
              durationSec,
              details: JSON.stringify(entryDetails),
              note: input.note ?? null,
              batchId,
              source: running ? ("timer" as const) : (input.source ?? "manual"),
              createdBy: userId,
              updatedBy: userId,
              version: 1,
              rev,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            await tx.insert(logEntry).values(row);
            await tx.insert(auditLog).values({
              id: createUuidV7(),
              familyId: fid,
              actorUserId: userId,
              entityType: "log_entry",
              entityId: entryId,
              action: "create",
              changes: JSON.stringify({
                type: input.type,
                startedAt: input.startedAt,
                status: row.status,
              }),
              at: nowIso,
            });
            created.push({ ...row, details: entryDetails });
          }
          return {
            items: created,
            allergyWatch,
            commonAllergenNames: [...commonAllergenNames],
            diaperDoctorNote,
          };
        });
        const first = result.items[0]!;
        res.status(201).json({ ...first, ...result });
      } catch (e) {
        if (e instanceof HttpError)
          return void err(res, e.status, e.code, e.message);
        if (String(e).includes("UNIQUE"))
          return void err(
            res,
            409,
            "CONFLICT",
            "A timer of this type is already running.",
          );
        throw e;
      }
    }),
  );
  router.patch(
    "/logs/:id",
    handler(async (req, res) => {
      const userId = uid(res);
      const id = param(req, "id");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      if (!UuidSchema.safeParse(id).success)
        return void err(res, 400, "VALIDATION_ERROR", "Invalid entry ID.");
      const body = UpdateLogEntrySchema.safeParse(req.body);
      if (!body.success)
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
        );
      const current = await db
        .select()
        .from(logEntry)
        .where(and(eq(logEntry.id, id), isNull(logEntry.deletedAt)))
        .get();
      if (!current || !(await membership(db, current.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Entry not found.");
      if (current.version !== body.data.version)
        return void err(
          res,
          409,
          "CONFLICT",
          "Entry changed. Refresh and try again.",
        );
      if (
        body.data.details &&
        !LogEntryDetailsSchemas[current.type].safeParse(body.data.details)
          .success
      )
        return void err(
          res,
          400,
          "VALIDATION_ERROR",
          "Entry details are invalid.",
        );
      const nextStart = body.data.startedAt ?? current.startedAt;
      const nextEnd =
        body.data.endedAt === undefined ? current.endedAt : body.data.endedAt;
      if (
        new Date(nextStart).valueOf() > Date.now() + 5 * 60_000 ||
        (nextEnd && new Date(nextEnd).valueOf() < new Date(nextStart).valueOf())
      )
        return void err(res, 400, "VALIDATION_ERROR", "Entry time is invalid.");
      if (current.childId) {
        const ownedChild = await db
          .select({ dateOfBirth: child.dateOfBirth })
          .from(child)
          .where(
            and(
              eq(child.id, current.childId),
              eq(child.familyId, current.familyId),
            ),
          )
          .get();
        if (!ownedChild || nextStart.slice(0, 10) < ownedChild.dateOfBirth)
          return void err(
            res,
            400,
            "VALIDATION_ERROR",
            "Entry cannot predate the child.",
          );
      }
      if (current.type === "sleep" && current.childId) {
        const overlap = await db
          .select({ id: logEntry.id })
          .from(logEntry)
          .where(
            and(
              eq(logEntry.childId, current.childId),
              eq(logEntry.type, "sleep"),
              isNull(logEntry.deletedAt),
              sql`${logEntry.id} <> ${id}`,
              lt(logEntry.startedAt, nextEnd ?? "9999-12-31T23:59:59.999Z"),
              sql`(${logEntry.status} IN ('running','paused') OR (${logEntry.endedAt} IS NOT NULL AND ${logEntry.endedAt} > ${nextStart}))`,
            ),
          )
          .get();
        if (overlap)
          return void err(
            res,
            409,
            "CONFLICT",
            "Sleep entry overlaps another sleep session.",
          );
      }
      const now = new Date().toISOString();
      const result = await db.transaction(async (tx) => {
        const rev = await bump(tx, current.familyId);
        const changes = body.data;
        const [updated] = await tx
          .update(logEntry)
          .set({
            ...(changes.startedAt !== undefined
              ? { startedAt: changes.startedAt }
              : {}),
            ...(changes.endedAt !== undefined
              ? { endedAt: changes.endedAt }
              : {}),
            ...(changes.amountMl !== undefined
              ? { amountMl: changes.amountMl }
              : {}),
            ...(changes.details !== undefined
              ? { details: JSON.stringify(changes.details) }
              : {}),
            ...(changes.note !== undefined ? { note: changes.note } : {}),
            updatedAt: now,
            updatedBy: userId,
            version: sql`${logEntry.version} + 1`,
            rev,
          })
          .where(
            and(eq(logEntry.id, id), eq(logEntry.version, body.data.version)),
          )
          .returning();
        if (!updated) throw new Error("Entry changed concurrently.");
        await tx.insert(auditLog).values({
          id: createUuidV7(),
          familyId: current.familyId,
          actorUserId: userId,
          entityType: "log_entry",
          entityId: id,
          action: "update",
          changes: JSON.stringify(changes),
          at: now,
        });
        return updated;
      });
      res.json({ ...result, details: JSON.parse(result.details) });
    }),
  );
  router.post(
    "/logs/:id/timer/stop",
    handler(async (req, res) => {
      const userId = uid(res);
      const id = param(req, "id");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const current = await db
        .select()
        .from(logEntry)
        .where(and(eq(logEntry.id, id), isNull(logEntry.deletedAt)))
        .get();
      if (!current || !(await membership(db, current.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Timer not found.");
      if (current.status !== "running" && current.status !== "paused")
        return void err(res, 409, "CONFLICT", "Timer is not running.");
      const now = new Date().toISOString();
      const durationWall = Math.max(
        0,
        Math.floor((Date.now() - new Date(current.startedAt).valueOf()) / 1000),
      );
      const details = JSON.parse(current.details) as Record<string, unknown>;
      let durationSec = durationWall;
      if (current.type === "breastfeed") {
        const segments = Array.isArray(details.segments)
          ? (details.segments as Array<{
              side: "left" | "right";
              startedAt: string;
              endedAt?: string;
            }>)
          : [];
        const openIndex = lastOpenIndex(segments);
        if (openIndex >= 0)
          segments[openIndex] = { ...segments[openIndex]!, endedAt: now };
        durationSec = segments.reduce(
          (sum, segment) =>
            sum +
            Math.max(
              0,
              Math.floor(
                (new Date(segment.endedAt ?? now).valueOf() -
                  new Date(segment.startedAt).valueOf()) /
                  1000,
              ),
            ),
          0,
        );
        details.segments = segments;
      } else if (current.type === "sleep" || current.type === "pumping") {
        const pauses = Array.isArray(details.pauses)
          ? (details.pauses as Array<{ startedAt: string; endedAt?: string }>)
          : [];
        const openIndex = lastOpenIndex(pauses);
        if (openIndex >= 0)
          pauses[openIndex] = { ...pauses[openIndex]!, endedAt: now };
        durationSec = Math.max(
          0,
          durationWall -
            pauses.reduce(
              (sum, pause) =>
                sum +
                Math.max(
                  0,
                  Math.floor(
                    (new Date(pause.endedAt ?? now).valueOf() -
                      new Date(pause.startedAt).valueOf()) /
                      1000,
                  ),
                ),
              0,
            ),
        );
        details.pauses = pauses;
      }
      const stoppedDetails = JSON.stringify(details);
      const updated = await db.transaction(async (tx) => {
        const rev = await bump(tx, current.familyId);
        const [row] = await tx
          .update(logEntry)
          .set({
            status: "completed",
            endedAt: now,
            durationSec,
            details: stoppedDetails,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${logEntry.version} + 1`,
            rev,
          })
          .where(and(eq(logEntry.id, id), eq(logEntry.status, current.status)))
          .returning();
        if (!row) throw new Error("Timer changed concurrently.");
        await tx.insert(auditLog).values({
          id: createUuidV7(),
          familyId: current.familyId,
          actorUserId: userId,
          entityType: "log_entry",
          entityId: id,
          action: "update",
          changes: JSON.stringify({
            status: "completed",
            endedAt: now,
            durationSec,
          }),
          at: now,
        });
        return row;
      });
      res.json({ ...updated, details: JSON.parse(updated.details) });
    }),
  );
  for (const action of ["delete", "restore"] as const) {
    router[action === "delete" ? "delete" : "post"](
      `/logs/:id/${action === "restore" ? "restore" : ""}`,
      handler(async (req, res) => {
        const userId = uid(res);
        const id = param(req, "id");
        if (!userId)
          return void err(
            res,
            401,
            "UNAUTHENTICATED",
            "Authentication required.",
          );
        const current = await db
          .select()
          .from(logEntry)
          .where(eq(logEntry.id, id))
          .get();
        if (!current)
          return void err(res, 404, "NOT_FOUND", "Entry not found.");
        if (!(await membership(db, current.familyId, userId)))
          return void err(res, 404, "NOT_FOUND", "Entry not found.");
        const now = new Date().toISOString();
        const deletedAt = action === "delete" ? now : null;
        await db.transaction(async (tx) => {
          const rev = await bump(tx, current.familyId);
          await tx
            .update(logEntry)
            .set({
              deletedAt,
              updatedAt: now,
              updatedBy: userId,
              version: sql`${logEntry.version} + 1`,
              rev,
            })
            .where(eq(logEntry.id, id));
          await tx.insert(auditLog).values({
            id: createUuidV7(),
            familyId: current.familyId,
            actorUserId: userId,
            entityType: "log_entry",
            entityId: id,
            action,
            changes: JSON.stringify({ deletedAt }),
            at: now,
          });
        });
        if (action === "delete") res.status(204).end();
        else res.json({ id, restored: true });
      }),
    );
  }
  router.get(
    "/logs/:id/history",
    handler(async (req, res) => {
      const userId = uid(res);
      const id = param(req, "id");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const entry = await db
        .select({ familyId: logEntry.familyId })
        .from(logEntry)
        .where(eq(logEntry.id, id))
        .get();
      if (!entry || !(await membership(db, entry.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Entry not found.");
      const history = await db
        .select({
          action: auditLog.action,
          changes: auditLog.changes,
          at: auditLog.at,
          actorUserId: auditLog.actorUserId,
        })
        .from(auditLog)
        .where(
          and(eq(auditLog.entityId, id), eq(auditLog.entityType, "log_entry")),
        )
        .orderBy(desc(auditLog.at));
      const actors = history.length
        ? await db
            .select({
              userId: userProfile.userId,
              displayName: userProfile.displayName,
            })
            .from(userProfile)
            .where(
              inArray(userProfile.userId, [
                ...new Set(history.map((row) => row.actorUserId)),
              ]),
            )
        : [];
      const actorNames = new Map(
        actors.map((actor) => [actor.userId, actor.displayName]),
      );
      res.json({
        items: history.map((x) => ({
          ...x,
          actorDisplayName: actorNames.get(x.actorUserId) ?? "Former member",
          changes: JSON.parse(x.changes),
        })),
      });
    }),
  );
  router.get(
    "/children/:cid/medicines/history",
    handler(async (req, res) => {
      const userId = uid(res);
      const cid = param(req, "cid");
      if (!userId)
        return void err(
          res,
          401,
          "UNAUTHENTICATED",
          "Authentication required.",
        );
      const target = await db
        .select({ familyId: child.familyId })
        .from(child)
        .where(and(eq(child.id, cid), isNull(child.deletedAt)))
        .get();
      if (!target || !(await membership(db, target.familyId, userId)))
        return void err(res, 404, "NOT_FOUND", "Child not found.");
      const name =
        typeof req.query.name === "string" ? req.query.name.trim() : "";
      const from = typeof req.query.from === "string" ? req.query.from : "";
      const to = typeof req.query.to === "string" ? req.query.to : "";
      const rows = await db
        .select()
        .from(logEntry)
        .where(
          and(
            eq(logEntry.childId, cid),
            eq(logEntry.type, "medicine"),
            isNull(logEntry.deletedAt),
            ...(from ? [gt(logEntry.startedAt, `${from}T00:00:00.000Z`)] : []),
            ...(to ? [lt(logEntry.startedAt, `${to}T23:59:59.999Z`)] : []),
          ),
        )
        .orderBy(desc(logEntry.startedAt))
        .limit(300);
      const items = rows
        .map((row) => ({ ...row, details: JSON.parse(row.details) }))
        .filter(
          (row) =>
            !name ||
            String((row.details as { name?: string }).name ?? "")
              .toLowerCase()
              .includes(name.toLowerCase()),
        );
      res.json({ items });
    }),
  );
  return router;
}
