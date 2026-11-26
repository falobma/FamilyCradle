import {
  CreateCustomVaccineSchema,
  CreateGrowthMeasurementSchema,
  CreateGrowthTargetSchema,
  MAX_GROWTH_PHOTO_BYTES,
  SetVaccineOptionsSchema,
  UpdateGrowthMeasurementSchema,
  UpdateMilestoneSchema,
  UpdateVaccineSchema,
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
import { z } from "zod";
import type { createDatabase } from "../db/client.js";
import {
  auditLog,
  child,
  childMilestone,
  childVaccine,
  childVaccineOption,
  family,
  familyMember,
  familyRevCounter,
  growthMeasurement,
  growthPhoto,
  growthTarget,
  logEntry,
  milestoneDefinition,
  userProfile,
  vaccineDefinition,
} from "../db/schema.js";
import { createUuidV7 } from "../ids.js";
import { ensureExistingChildHealthRecords } from "../health/schedule.js";
import {
  addOffset,
  calculateMilkTarget,
  calculateWakeWindow,
  correctedAgeDays,
  correctedAgeMonths,
  correctedAgeRemainderDays,
  familyDate,
  growthChangeConfirmation,
  vaccineStatus,
  vaccineDefinitionsForOptions,
} from "../health/rules.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Access = {
  profile: typeof child.$inferSelect;
  familyTimezone: string;
};

const DeleteVersionSchema = z.strictObject({
  version: z.number().int().min(1),
});

function sessionUserId(response: Response): string | null {
  const session: unknown = response.locals.session;
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }
  const sessionUser = session.user;
  return typeof sessionUser === "object" &&
    sessionUser !== null &&
    "id" in sessionUser &&
    typeof sessionUser.id === "string"
    ? sessionUser.id
    : null;
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  response.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function routeParam(request: Request, key: string): string {
  return request.params[key] ?? "";
}

function handler(fn: (request: Request, response: Response) => Promise<void>) {
  return (
    request: Request,
    response: Response,
    next: (error?: unknown) => void,
  ) => void fn(request, response).catch(next);
}

function parseBody<T extends z.ZodType>(
  request: Request,
  response: Response,
  schema: T,
): z.output<T> | null {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    sendError(response, 400, "VALIDATION_ERROR", "Request validation failed.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return null;
  }
  return parsed.data;
}

async function getAccess(
  database: Database,
  childId: string,
  userId: string,
): Promise<Access | null> {
  const row = await database
    .select({ profile: child, familyTimezone: family.timezone })
    .from(child)
    .innerJoin(family, eq(family.id, child.familyId))
    .innerJoin(
      familyMember,
      and(
        eq(familyMember.familyId, child.familyId),
        eq(familyMember.userId, userId),
        isNull(familyMember.removedAt),
      ),
    )
    .where(
      and(
        eq(child.id, childId),
        isNull(child.deletedAt),
        isNull(family.deletedAt),
      ),
    )
    .limit(1);
  return row[0] ?? null;
}

async function bumpRevision(transaction: Transaction, familyId: string) {
  const [counter] = await transaction
    .update(familyRevCounter)
    .set({ rev: sql`${familyRevCounter.rev} + 1` })
    .where(eq(familyRevCounter.familyId, familyId))
    .returning({ rev: familyRevCounter.rev });
  if (!counter) throw new Error("Missing family revision counter.");
  return counter.rev;
}

async function addAudit(
  transaction: Transaction,
  familyId: string,
  userId: string,
  entityType: string,
  entityId: string,
  action: "create" | "update" | "delete",
  changes: Record<string, unknown>,
  now: string,
) {
  await transaction.insert(auditLog).values({
    id: createUuidV7(),
    familyId,
    actorUserId: userId,
    entityType,
    entityId,
    action,
    changes: JSON.stringify(changes),
    at: now,
  });
}

async function checkGrowthConfirmation(
  database: Database,
  familyId: string,
  childId: string,
  measuredAt: string,
  weightG: number | null | undefined,
  excludedId?: string,
) {
  if (weightG === null || weightG === undefined) {
    return { required: false, percentChange: null, days: null };
  }
  const candidates = await database
    .select({
      id: growthMeasurement.id,
      measuredAt: growthMeasurement.measuredAt,
      weightG: growthMeasurement.weightG,
    })
    .from(growthMeasurement)
    .where(
      and(
        eq(growthMeasurement.familyId, familyId),
        eq(growthMeasurement.childId, childId),
        isNull(growthMeasurement.deletedAt),
        lt(growthMeasurement.measuredAt, measuredAt),
        gt(growthMeasurement.weightG, 0),
        ...(excludedId ? [sql`${growthMeasurement.id} != ${excludedId}`] : []),
      ),
    )
    .orderBy(desc(growthMeasurement.measuredAt));
  const previous = candidates[0];
  return growthChangeConfirmation({ measuredAt, weightG }, previous);
}

function toGrowthRow(
  row: typeof growthMeasurement.$inferSelect,
  names: Map<string, string>,
  previous: { measuredAt: string; weightG: number | null } | null,
) {
  const days = previous
    ? Math.max(
        0,
        Math.round(
          (new Date(`${row.measuredAt}T00:00:00.000Z`).getTime() -
            new Date(`${previous.measuredAt}T00:00:00.000Z`).getTime()) /
            86_400_000,
        ),
      )
    : null;
  return {
    ...row,
    createdByName: names.get(row.createdBy) ?? "Former member",
    updatedByName: names.get(row.updatedBy) ?? "Former member",
    previousWeightDeltaG:
      previous?.weightG !== null &&
      previous?.weightG !== undefined &&
      row.weightG !== null
        ? row.weightG - previous.weightG
        : null,
    daysSincePrevious: days,
    averageWeightDeltaGPerDay:
      days && previous?.weightG !== null && previous?.weightG !== undefined
        ? Math.round((row.weightG! - previous.weightG) / days)
        : null,
  };
}

export function createHealthRouter(database: Database) {
  const router = Router();

  router.get(
    "/children/:cid/health-summary",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const now = new Date().toISOString();
      const [measurements, bottleEntries, sleepEntries] = await Promise.all([
        database
          .select()
          .from(growthMeasurement)
          .where(
            and(
              eq(growthMeasurement.familyId, access.profile.familyId),
              eq(growthMeasurement.childId, cid),
              isNull(growthMeasurement.deletedAt),
            ),
          )
          .orderBy(desc(growthMeasurement.measuredAt)),
        database
          .select()
          .from(logEntry)
          .where(
            and(
              eq(logEntry.familyId, access.profile.familyId),
              eq(logEntry.childId, cid),
              inArray(logEntry.type, ["bottle", "breastfeed"]),
              isNull(logEntry.deletedAt),
              gt(
                logEntry.startedAt,
                new Date(Date.now() - 4 * 86_400_000).toISOString(),
              ),
            ),
          ),
        database
          .select({ endedAt: logEntry.endedAt })
          .from(logEntry)
          .where(
            and(
              eq(logEntry.familyId, access.profile.familyId),
              eq(logEntry.childId, cid),
              eq(logEntry.type, "sleep"),
              eq(logEntry.status, "completed"),
              isNull(logEntry.deletedAt),
              isNotNull(logEntry.endedAt),
            ),
          )
          .orderBy(desc(logEntry.endedAt))
          .limit(1),
      ]);
      const today = familyDate(now, access.familyTimezone);
      const milkTarget = calculateMilkTarget({
        child: access.profile,
        measurements,
        bottleEntries,
        now,
        timeZone: access.familyTimezone,
      });
      const wakeWindow = calculateWakeWindow(
        access.profile,
        sleepEntries[0]?.endedAt ?? null,
        `${today}T00:00:00.000Z`,
      );
      response.json({
        childId: cid,
        today,
        ageDays: correctedAgeDays(access.profile, today),
        correctedAgeMonths: correctedAgeMonths(access.profile, today),
        correctedAgeRemainderDays: correctedAgeRemainderDays(
          access.profile,
          today,
        ),
        isPremature: (access.profile.gestationalAgeWeeks ?? 40) < 37,
        milkTarget,
        wakeWindow,
      });
    }),
  );

  router.get(
    "/children/:cid/growth",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const measurements = await database
        .select()
        .from(growthMeasurement)
        .where(
          and(
            eq(growthMeasurement.familyId, access.profile.familyId),
            eq(growthMeasurement.childId, cid),
            isNull(growthMeasurement.deletedAt),
          ),
        )
        .orderBy(growthMeasurement.measuredAt);
      const targets = await database
        .select()
        .from(growthTarget)
        .where(
          and(
            eq(growthTarget.familyId, access.profile.familyId),
            eq(growthTarget.childId, cid),
            isNull(growthTarget.deletedAt),
          ),
        )
        .orderBy(growthTarget.targetDate);
      const userIds = [
        ...new Set(
          measurements.flatMap((row) => [row.createdBy, row.updatedBy]),
        ),
      ];
      const profiles = userIds.length
        ? await database
            .select({
              userId: userProfile.userId,
              displayName: userProfile.displayName,
            })
            .from(userProfile)
            .where(inArray(userProfile.userId, userIds))
        : [];
      const names = new Map(
        profiles.map((profile) => [profile.userId, profile.displayName]),
      );
      const items = measurements.map((row, index) => {
        let previous = measurements
          .slice(0, index)
          .reverse()
          .find((candidate) => candidate.weightG !== null);
        if (!previous && row.weightG !== null && access.profile.birthWeightG) {
          previous = {
            measuredAt: access.profile.dateOfBirth,
            weightG: access.profile.birthWeightG,
          } as (typeof measurements)[number];
        }
        return toGrowthRow(
          row,
          names,
          previous
            ? {
                measuredAt: previous.measuredAt,
                weightG: previous.weightG,
              }
            : null,
        );
      });
      response.json({
        birthPoint: {
          measuredAt: access.profile.dateOfBirth,
          weightG: access.profile.birthWeightG,
          lengthMm: access.profile.birthLengthMm,
          headCircMm: access.profile.birthHeadCircMm,
        },
        items,
        targets,
      });
    }),
  );

  router.post(
    "/children/:cid/growth-targets",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, CreateGrowthTargetSchema);
      if (!body) return;
      if (body.targetDate < access.profile.dateOfBirth) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Target date must be on or after the child's birth date.",
        );
        return;
      }
      const now = new Date().toISOString();
      const created = await database.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(growthTarget)
          .values({
            ...body,
            familyId: access.profile.familyId,
            childId: cid,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
            rev: 0,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted) return null;
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .update(growthTarget)
          .set({ rev })
          .where(eq(growthTarget.id, inserted.id))
          .returning();
        if (!row) throw new Error("Growth target was not created.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "growth_target",
          row.id,
          "create",
          body,
          now,
        );
        return row;
      });
      if (!created) {
        sendError(
          response,
          409,
          "CONFLICT",
          "A target already exists for this date. Remove it before adding a replacement.",
        );
        return;
      }
      response.status(201).json(created);
    }),
  );

  router.delete(
    "/children/:cid/growth-targets/:tid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const tid = routeParam(request, "tid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(tid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, DeleteVersionSchema);
      if (!body) return;
      const now = new Date().toISOString();
      const removed = await database.transaction(async (transaction) => {
        const [row] = await transaction
          .update(growthTarget)
          .set({
            deletedAt: now,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${growthTarget.version} + 1`,
          })
          .where(
            and(
              eq(growthTarget.id, tid),
              eq(growthTarget.familyId, access.profile.familyId),
              eq(growthTarget.childId, cid),
              eq(growthTarget.version, body.version),
              isNull(growthTarget.deletedAt),
            ),
          )
          .returning();
        if (!row) return false;
        const rev = await bumpRevision(transaction, access.profile.familyId);
        await transaction
          .update(growthTarget)
          .set({ rev })
          .where(eq(growthTarget.id, tid));
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "growth_target",
          tid,
          "delete",
          { deletedAt: now },
          now,
        );
        return true;
      });
      if (!removed) {
        sendError(
          response,
          409,
          "CONFLICT",
          "Target not found or changed. Refresh and try again.",
        );
        return;
      }
      response.status(204).end();
    }),
  );

  router.post(
    "/children/:cid/growth",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, CreateGrowthMeasurementSchema);
      if (!body) return;
      if (
        body.measuredAt > new Date().toISOString().slice(0, 10) ||
        body.measuredAt < access.profile.dateOfBirth
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Measurement date must be on or after the child's birth date and not in the future.",
        );
        return;
      }
      const confirmation = await checkGrowthConfirmation(
        database,
        access.profile.familyId,
        cid,
        body.measuredAt,
        body.weightG,
      );
      if (confirmation.required && !body.confirmLargeChange) {
        sendError(
          response,
          409,
          "CONFIRM_REQUIRED",
          "Confirm the weight change before saving.",
          confirmation,
        );
        return;
      }
      const { photo, ...values } = body;
      delete values.confirmLargeChange;
      if (photo !== undefined) {
        const bytes = Buffer.from(photo, "base64");
        if (
          bytes.length < 4 ||
          bytes.length > MAX_GROWTH_PHOTO_BYTES ||
          bytes.toString("base64") !== photo ||
          bytes[0] !== 0xff ||
          bytes[1] !== 0xd8 ||
          bytes[2] !== 0xff ||
          bytes.at(-2) !== 0xff ||
          bytes.at(-1) !== 0xd9
        ) {
          sendError(response, 400, "VALIDATION_ERROR", "Invalid JPEG photo.");
          return;
        }
      }
      const now = new Date().toISOString();
      const [created] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .insert(growthMeasurement)
          .values({
            ...values,
            id: body.id,
            familyId: access.profile.familyId,
            childId: cid,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
            rev,
            hasPhoto: photo !== undefined,
          })
          .returning();
        if (!row) throw new Error("Growth measurement was not created.");
        if (photo !== undefined) {
          await transaction.insert(growthPhoto).values({
            measurementId: row.id,
            data: photo,
          });
        }
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "growth_measurement",
          row.id,
          "create",
          values,
          now,
        );
        return [row];
      });
      response.status(201).json(created);
    }),
  );

  router.get(
    "/children/:cid/growth/:mid/photo",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const mid = routeParam(request, "mid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(mid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const [photo] = await database
        .select({ data: growthPhoto.data })
        .from(growthPhoto)
        .innerJoin(
          growthMeasurement,
          eq(growthPhoto.measurementId, growthMeasurement.id),
        )
        .where(
          and(
            eq(growthMeasurement.id, mid),
            eq(growthMeasurement.childId, cid),
            eq(growthMeasurement.familyId, access.profile.familyId),
            isNull(growthMeasurement.deletedAt),
          ),
        )
        .limit(1);
      if (!photo) {
        sendError(response, 404, "NOT_FOUND", "Photo not found.");
        return;
      }
      response.set("Cache-Control", "private, no-store");
      response.type("image/jpeg").send(Buffer.from(photo.data, "base64"));
    }),
  );

  router.patch(
    "/children/:cid/growth/:mid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const mid = routeParam(request, "mid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(mid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, UpdateGrowthMeasurementSchema);
      if (!body) return;
      if (
        body.measuredAt > new Date().toISOString().slice(0, 10) ||
        body.measuredAt < access.profile.dateOfBirth
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Measurement date must be on or after the child's birth date and not in the future.",
        );
        return;
      }
      const [existing] = await database
        .select()
        .from(growthMeasurement)
        .where(
          and(
            eq(growthMeasurement.id, mid),
            eq(growthMeasurement.familyId, access.profile.familyId),
            eq(growthMeasurement.childId, cid),
            isNull(growthMeasurement.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        sendError(response, 404, "NOT_FOUND", "Growth measurement not found.");
        return;
      }
      if (existing.version !== body.version) {
        sendError(response, 409, "CONFLICT", "Growth measurement changed.", {
          current: existing,
        });
        return;
      }
      const confirmation = await checkGrowthConfirmation(
        database,
        access.profile.familyId,
        cid,
        body.measuredAt,
        body.weightG,
        mid,
      );
      if (confirmation.required && !body.confirmLargeChange) {
        sendError(
          response,
          409,
          "CONFIRM_REQUIRED",
          "Confirm the weight change before saving.",
          confirmation,
        );
        return;
      }
      const now = new Date().toISOString();
      const { version, ...values } = body;
      delete values.confirmLargeChange;
      const [updated] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .update(growthMeasurement)
          .set({
            ...values,
            updatedBy: userId,
            updatedAt: now,
            version: sql`${growthMeasurement.version} + 1`,
            rev,
          })
          .where(
            and(
              eq(growthMeasurement.id, mid),
              eq(growthMeasurement.familyId, access.profile.familyId),
              eq(growthMeasurement.childId, cid),
              eq(growthMeasurement.version, version),
              isNull(growthMeasurement.deletedAt),
            ),
          )
          .returning();
        if (!row) throw new Error("Growth measurement update lost a race.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "growth_measurement",
          mid,
          "update",
          values,
          now,
        );
        return [row];
      });
      response.json(updated);
    }),
  );

  router.delete(
    "/children/:cid/growth/:mid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const mid = routeParam(request, "mid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(mid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, DeleteVersionSchema);
      if (!body) return;
      const [existing] = await database
        .select()
        .from(growthMeasurement)
        .where(
          and(
            eq(growthMeasurement.id, mid),
            eq(growthMeasurement.familyId, access.profile.familyId),
            eq(growthMeasurement.childId, cid),
            isNull(growthMeasurement.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        sendError(response, 404, "NOT_FOUND", "Growth measurement not found.");
        return;
      }
      if (existing.version !== body.version) {
        sendError(response, 409, "CONFLICT", "Growth measurement changed.", {
          current: existing,
        });
        return;
      }
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [removed] = await transaction
          .update(growthMeasurement)
          .set({
            deletedAt: now,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${growthMeasurement.version} + 1`,
            rev,
            hasPhoto: false,
          })
          .where(
            and(
              eq(growthMeasurement.id, mid),
              eq(growthMeasurement.familyId, access.profile.familyId),
              eq(growthMeasurement.version, body.version),
              isNull(growthMeasurement.deletedAt),
            ),
          )
          .returning();
        if (!removed) throw new Error("Growth measurement delete lost a race.");
        await transaction
          .delete(growthPhoto)
          .where(eq(growthPhoto.measurementId, mid));
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "growth_measurement",
          mid,
          "delete",
          { deletedAt: now },
          now,
        );
      });
      response.status(204).end();
    }),
  );

  router.get(
    "/children/:cid/vaccines",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      await ensureExistingChildHealthRecords(
        database,
        cid,
        userId,
        new Date().toISOString(),
      );
      const [rows, options] = await Promise.all([
        database
          .select({
            vaccine: childVaccine,
            definition: vaccineDefinition,
          })
          .from(childVaccine)
          .leftJoin(
            vaccineDefinition,
            eq(childVaccine.definitionId, vaccineDefinition.id),
          )
          .where(
            and(
              eq(childVaccine.familyId, access.profile.familyId),
              eq(childVaccine.childId, cid),
              isNull(childVaccine.deletedAt),
            ),
          )
          .orderBy(childVaccine.dueDate),
        database
          .select()
          .from(childVaccineOption)
          .where(eq(childVaccineOption.childId, cid)),
      ]);
      const today = familyDate(new Date().toISOString(), access.familyTimezone);
      const items = rows.map(({ vaccine, definition }) => ({
        ...vaccine,
        status: vaccineStatus(vaccine, today),
        notesId: definition?.notesId ?? null,
        notesEn: definition?.notesEn ?? null,
        comboHintId: definition?.comboHintId ?? null,
        comboHintEn: definition?.comboHintEn ?? null,
      }));
      const active = items.filter(
        (item) => item.category !== "optional_endemic",
      );
      const optional = items.filter(
        (item) => item.category === "optional_endemic",
      );
      response.json({
        items,
        options: Object.fromEntries(
          options.map((option) => [option.optionGroup, option.optionValue]),
        ),
        counts: {
          done: active.filter((item) => item.status === "done").length,
          total: active.length,
          late: items.filter(
            (item) =>
              item.status === "late" &&
              (item.category !== "optional_endemic" || item.followOptional),
          ).length,
          optional: optional.length,
        },
        disclaimer:
          "Jadwal berdasarkan rekomendasi IDAI 2024. Ikuti jadwal dari dokter anak Anda.",
        sourceReviewRequired: true,
      });
    }),
  );

  router.post(
    "/children/:cid/vaccines",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, CreateCustomVaccineSchema);
      if (!body) return;
      const now = new Date().toISOString();
      const id = createUuidV7();
      const [created] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .insert(childVaccine)
          .values({
            id,
            familyId: access.profile.familyId,
            childId: cid,
            vaccineCode: "CUSTOM",
            customName: body.name,
            doseLabelId: body.doseLabel,
            doseLabelEn: body.doseLabel,
            category: "custom",
            dueDate: body.dueDate,
            windowEndDate: body.windowEndDate,
            note: body.note,
            isCustom: true,
            createdBy: userId,
            updatedBy: userId,
            createdAt: now,
            updatedAt: now,
            rev,
          })
          .returning();
        if (!row) throw new Error("Custom vaccine was not created.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "child_vaccine",
          id,
          "create",
          body,
          now,
        );
        return [row];
      });
      response.status(201).json(created);
    }),
  );

  router.patch(
    "/children/:cid/vaccines/:vid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const vid = routeParam(request, "vid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(vid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, UpdateVaccineSchema);
      if (!body) return;
      const [existing] = await database
        .select()
        .from(childVaccine)
        .where(
          and(
            eq(childVaccine.id, vid),
            eq(childVaccine.familyId, access.profile.familyId),
            eq(childVaccine.childId, cid),
            isNull(childVaccine.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        sendError(response, 404, "NOT_FOUND", "Vaccine not found.");
        return;
      }
      if (existing.version !== body.version) {
        sendError(response, 409, "CONFLICT", "Vaccine record changed.", {
          current: existing,
        });
        return;
      }
      if (
        body.action === "mark_done" &&
        body.givenDate &&
        (body.givenDate < access.profile.dateOfBirth ||
          body.givenDate >
            familyDate(new Date().toISOString(), access.familyTimezone))
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Vaccination date must be between birth and today.",
        );
        return;
      }
      if (
        body.action === "follow_optional" &&
        existing.category !== "optional_endemic"
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Only optional vaccines can be followed or unfollowed.",
        );
        return;
      }
      const today = familyDate(new Date().toISOString(), access.familyTimezone);
      const now = new Date().toISOString();
      const changes: Record<string, unknown> = {};
      if (body.action === "mark_done") {
        Object.assign(changes, {
          givenDate: body.givenDate ?? today,
          givenPlace: body.givenPlace ?? null,
          batchNumber: body.batchNumber ?? null,
          note: body.note ?? existing.note,
          statusOverride: null,
        });
      } else if (body.action === "undo_done") {
        Object.assign(changes, {
          givenDate: null,
          givenPlace: null,
          batchNumber: null,
        });
      } else if (body.action === "skip") {
        Object.assign(changes, {
          statusOverride: "skipped",
          givenDate: null,
          givenPlace: null,
          batchNumber: null,
        });
      } else if (body.action === "undo_skip") {
        Object.assign(changes, { statusOverride: null });
      } else if (body.action === "reschedule") {
        Object.assign(changes, {
          dueDate: body.dueDate,
          windowEndDate: body.windowEndDate,
        });
      } else {
        Object.assign(changes, { followOptional: body.followOptional });
      }
      const [updated] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .update(childVaccine)
          .set({
            ...changes,
            updatedBy: userId,
            updatedAt: now,
            version: sql`${childVaccine.version} + 1`,
            rev,
          })
          .where(
            and(
              eq(childVaccine.id, vid),
              eq(childVaccine.familyId, access.profile.familyId),
              eq(childVaccine.version, body.version),
              isNull(childVaccine.deletedAt),
            ),
          )
          .returning();
        if (!row) throw new Error("Vaccine update lost a race.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "child_vaccine",
          vid,
          "update",
          { action: body.action, ...changes },
          now,
        );
        return [row];
      });
      response.json(updated);
    }),
  );

  router.delete(
    "/children/:cid/vaccines/:vid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const vid = routeParam(request, "vid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(vid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, DeleteVersionSchema);
      if (!body) return;
      const [existing] = await database
        .select()
        .from(childVaccine)
        .where(
          and(
            eq(childVaccine.id, vid),
            eq(childVaccine.familyId, access.profile.familyId),
            eq(childVaccine.childId, cid),
            isNull(childVaccine.deletedAt),
          ),
        )
        .limit(1);
      if (!existing || !existing.isCustom) {
        sendError(response, 404, "NOT_FOUND", "Custom vaccine not found.");
        return;
      }
      if (existing.version !== body.version) {
        sendError(response, 409, "CONFLICT", "Vaccine record changed.", {
          current: existing,
        });
        return;
      }
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [removed] = await transaction
          .update(childVaccine)
          .set({
            deletedAt: now,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${childVaccine.version} + 1`,
            rev,
          })
          .where(
            and(
              eq(childVaccine.id, vid),
              eq(childVaccine.familyId, access.profile.familyId),
              eq(childVaccine.version, body.version),
              isNull(childVaccine.deletedAt),
            ),
          )
          .returning();
        if (!removed) throw new Error("Custom vaccine delete lost a race.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "child_vaccine",
          vid,
          "delete",
          { deletedAt: now },
          now,
        );
      });
      response.status(204).end();
    }),
  );

  router.put(
    "/children/:cid/vaccine-options",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, SetVaccineOptionsSchema);
      if (!body) return;
      await ensureExistingChildHealthRecords(
        database,
        cid,
        userId,
        new Date().toISOString(),
      );
      const allGroupDefinitions = await database
        .select()
        .from(vaccineDefinition)
        .where(
          and(
            eq(vaccineDefinition.scheduleVersion, "IDAI-2024"),
            eq(vaccineDefinition.optionGroup, body.group),
          ),
        );
      const selectedDefinitions = vaccineDefinitionsForOptions(
        allGroupDefinitions,
        { [body.group]: body.value },
      );
      const now = new Date().toISOString();
      const [option] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const definitionIds = allGroupDefinitions.map(({ id }) => id);
        if (definitionIds.length > 0) {
          await transaction
            .update(childVaccine)
            .set({
              deletedAt: now,
              updatedAt: now,
              updatedBy: userId,
              version: sql`${childVaccine.version} + 1`,
              rev,
            })
            .where(
              and(
                eq(childVaccine.familyId, access.profile.familyId),
                eq(childVaccine.childId, cid),
                inArray(childVaccine.definitionId, definitionIds),
                isNull(childVaccine.givenDate),
                isNull(childVaccine.deletedAt),
              ),
            );
        }
        const [current] = await transaction
          .select()
          .from(childVaccineOption)
          .where(
            and(
              eq(childVaccineOption.childId, cid),
              eq(childVaccineOption.optionGroup, body.group),
            ),
          )
          .limit(1);
        const [savedOption] = current
          ? await transaction
              .update(childVaccineOption)
              .set({
                optionValue: body.value,
                updatedBy: userId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(childVaccineOption.childId, cid),
                  eq(childVaccineOption.optionGroup, body.group),
                ),
              )
              .returning()
          : await transaction
              .insert(childVaccineOption)
              .values({
                childId: cid,
                optionGroup: body.group,
                optionValue: body.value,
                updatedBy: userId,
                updatedAt: now,
              })
              .returning();
        if (!savedOption) throw new Error("Vaccine option was not saved.");
        if (selectedDefinitions.length > 0) {
          await transaction.insert(childVaccine).values(
            selectedDefinitions.map((definition) => ({
              id: createUuidV7(),
              familyId: access.profile.familyId,
              childId: cid,
              definitionId: definition.id,
              vaccineCode: definition.vaccineCode,
              doseLabelId: definition.doseLabelId,
              doseLabelEn: definition.doseLabelEn,
              category: definition.category,
              dueDate: addOffset(
                access.profile.dateOfBirth,
                definition.dueOffset,
              ),
              windowEndDate: addOffset(
                access.profile.dateOfBirth,
                definition.windowEndOffset,
              ),
              createdBy: userId,
              updatedBy: userId,
              createdAt: now,
              updatedAt: now,
              rev,
            })),
          );
        }
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "child_vaccine_option",
          cid,
          "update",
          { group: body.group, value: body.value },
          now,
        );
        return [savedOption];
      });
      response.json(option);
    }),
  );

  router.get(
    "/children/:cid/milestones",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      if (!UuidSchema.safeParse(cid).success) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      await ensureExistingChildHealthRecords(
        database,
        cid,
        userId,
        new Date().toISOString(),
      );
      const rows = await database
        .select({ milestone: childMilestone, definition: milestoneDefinition })
        .from(childMilestone)
        .innerJoin(
          milestoneDefinition,
          eq(childMilestone.definitionId, milestoneDefinition.id),
        )
        .where(
          and(
            eq(childMilestone.familyId, access.profile.familyId),
            eq(childMilestone.childId, cid),
            isNull(childMilestone.deletedAt),
          ),
        )
        .orderBy(
          milestoneDefinition.ageMonths,
          milestoneDefinition.domain,
          milestoneDefinition.sortOrder,
        );
      const today = familyDate(new Date().toISOString(), access.familyTimezone);
      const age = correctedAgeMonths(access.profile, today);
      const checkpoints = [2, 4, 6, 9, 12, 15, 18, 24];
      const prior = checkpoints.filter((checkpoint) => checkpoint <= age);
      const currentCheckpoint = prior.at(-1) ?? checkpoints[0]!;
      const previousCheckpoint =
        prior.length > 1 ? prior[prior.length - 2]! : null;
      response.json({
        ageMonths: age,
        isPremature: (access.profile.gestationalAgeWeeks ?? 40) < 37,
        currentCheckpoint,
        previousCheckpoint,
        items: rows.map(({ milestone, definition }) => ({
          ...milestone,
          ageMonths: definition.ageMonths,
          domain: definition.domain,
          textId: definition.textId,
          textEn: definition.textEn,
          source: definition.source,
          sourceUrl: definition.sourceUrl,
        })),
        skillLossInfo:
          "Jika anak kehilangan kemampuan yang sebelumnya sudah dimiliki, bicarakan dengan dokter.",
        sourceReviewRequired: true,
      });
    }),
  );

  router.patch(
    "/children/:cid/milestones/:mid",
    handler(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const cid = routeParam(request, "cid");
      const mid = routeParam(request, "mid");
      if (
        !UuidSchema.safeParse(cid).success ||
        !UuidSchema.safeParse(mid).success
      ) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getAccess(database, cid, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const body = parseBody(request, response, UpdateMilestoneSchema);
      if (!body) return;
      if (
        body.achievedOn &&
        (body.achievedOn < access.profile.dateOfBirth ||
          body.achievedOn > new Date().toISOString().slice(0, 10))
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Achievement date must be between birth and today.",
        );
        return;
      }
      const [existing] = await database
        .select()
        .from(childMilestone)
        .where(
          and(
            eq(childMilestone.id, mid),
            eq(childMilestone.familyId, access.profile.familyId),
            eq(childMilestone.childId, cid),
            isNull(childMilestone.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        sendError(response, 404, "NOT_FOUND", "Milestone not found.");
        return;
      }
      if (existing.version !== body.version) {
        sendError(response, 409, "CONFLICT", "Milestone record changed.", {
          current: existing,
        });
        return;
      }
      const now = new Date().toISOString();
      const { version, ...values } = body;
      const [updated] = await database.transaction(async (transaction) => {
        const rev = await bumpRevision(transaction, access.profile.familyId);
        const [row] = await transaction
          .update(childMilestone)
          .set({
            ...values,
            achievedOn: body.achieved ? (body.achievedOn ?? null) : null,
            updatedBy: userId,
            updatedAt: now,
            version: sql`${childMilestone.version} + 1`,
            rev,
          })
          .where(
            and(
              eq(childMilestone.id, mid),
              eq(childMilestone.familyId, access.profile.familyId),
              eq(childMilestone.version, version),
              isNull(childMilestone.deletedAt),
            ),
          )
          .returning();
        if (!row) throw new Error("Milestone update lost a race.");
        await addAudit(
          transaction,
          access.profile.familyId,
          userId,
          "child_milestone",
          mid,
          "update",
          values,
          now,
        );
        return [row];
      });
      response.json(updated);
    }),
  );

  return router;
}
