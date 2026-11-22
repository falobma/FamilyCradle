import { createHash, randomBytes } from "node:crypto";
import {
  CreateFamilySchema,
  CreateInviteSchema,
  ChildProfileSchema,
  PreviewInviteSchema,
  RedeemInviteSchema,
  ReorderChildrenSchema,
  UpdateChildProfileSchema,
  UpdateFamilySchema,
  UuidSchema,
} from "@familycradle/shared";
import { and, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { createDatabase } from "../db/client.js";
import {
  child,
  family,
  familyInvite,
  familyMember,
  familyRevCounter,
  inviteRateLimit,
  user,
  userProfile,
} from "../db/schema.js";
import { createUuidV7 } from "../ids.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const FAMILY_LIMIT = 5;
const MEMBER_LIMIT = 10;
const CHILD_LIMIT = 10;
const ACTIVE_INVITE_LIMIT = 5;
const SOFT_DELETE_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
const MemberRoleSchema = z.strictObject({ role: z.enum(["mom", "dad"]) });
const ConfirmFamilyNameSchema = z.strictObject({
  confirmName: z.string().trim().min(1).max(60),
});

function sessionUserId(response: Response): string | null {
  const session: unknown = response.locals.session;
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }
  const sessionUser = session.user;
  if (
    typeof sessionUser !== "object" ||
    sessionUser === null ||
    !("id" in sessionUser) ||
    typeof sessionUser.id !== "string"
  ) {
    return null;
  }
  return sessionUser.id;
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  response.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function parseBody<T extends import("zod").ZodType>(
  request: Request,
  response: Response,
  schema: T,
): import("zod").output<T> | null {
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

function validParam(value: string) {
  return UuidSchema.safeParse(value).success;
}

function parseQuickBottleMl(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "number")
    ) {
      return parsed;
    }
  } catch {
    // fall through to the default
  }
  return [60, 90, 120, 150];
}

function routeParam(request: Request, key: string) {
  return request.params[key] ?? "";
}

async function getMembership(
  database: Database,
  familyId: string,
  userId: string,
  allowDeletedFamily = false,
) {
  return database
    .select({ member: familyMember, family })
    .from(familyMember)
    .innerJoin(family, eq(familyMember.familyId, family.id))
    .where(
      and(
        eq(familyMember.familyId, familyId),
        eq(familyMember.userId, userId),
        isNull(familyMember.removedAt),
        ...(allowDeletedFamily ? [] : [isNull(family.deletedAt)]),
      ),
    )
    .get();
}

async function bumpFamilyRev(transaction: Transaction, familyId: string) {
  const [counter] = await transaction
    .update(familyRevCounter)
    .set({ rev: sql`${familyRevCounter.rev} + 1` })
    .where(eq(familyRevCounter.familyId, familyId))
    .returning({ rev: familyRevCounter.rev });
  if (!counter) {
    throw new Error("Family revision counter is missing.");
  }
  return counter.rev;
}

function normalizeInviteCode(code: string) {
  return code.replaceAll("-", "").toUpperCase();
}

function hashInviteCode(code: string) {
  return createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}

function createInviteCode() {
  let code = "";
  while (code.length < 8) {
    for (const byte of randomBytes(16)) {
      if (byte < 248) {
        code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
        if (code.length === 8) break;
      }
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

async function enforceInviteRateLimit(
  database: Database,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const resetBefore = now - windowMs;
  await database
    .delete(inviteRateLimit)
    .where(lte(inviteRateLimit.windowStartedAt, now - RATE_LIMIT_RETENTION_MS));
  const [result] = await database
    .insert(inviteRateLimit)
    .values({
      key: createHash("sha256").update(key).digest("hex"),
      count: 1,
      windowStartedAt: now,
    })
    .onConflictDoUpdate({
      target: inviteRateLimit.key,
      set: {
        count: sql`CASE WHEN ${inviteRateLimit.windowStartedAt} <= ${resetBefore} THEN 1 ELSE ${inviteRateLimit.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${inviteRateLimit.windowStartedAt} <= ${resetBefore} THEN ${now} ELSE ${inviteRateLimit.windowStartedAt} END`,
      },
    })
    .returning({ count: inviteRateLimit.count });

  if (!result || result.count > limit) {
    return false;
  }
  return true;
}

function route(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (
    request: Request,
    response: Response,
    next: (error?: unknown) => void,
  ) => {
    void handler(request, response).catch(next);
  };
}

export function createFamilyRouter(database: Database) {
  const router = Router();

  router.get(
    "/families",
    route(async (_request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const memberships = await database
        .select({ member: familyMember, family })
        .from(familyMember)
        .innerJoin(family, eq(familyMember.familyId, family.id))
        .where(
          and(
            eq(familyMember.userId, userId),
            isNull(familyMember.removedAt),
            isNull(family.deletedAt),
          ),
        );
      response.json({
        items: memberships.map(({ member, family: item }) => ({
          id: item.id,
          name: item.name,
          timezone: item.timezone,
          role: member.role,
          memberId: member.id,
        })),
      });
    }),
  );

  router.get(
    "/families/deleted",
    route(async (_request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const items = await database
        .select({
          id: family.id,
          name: family.name,
          timezone: family.timezone,
          role: familyMember.role,
          purgeAfter: family.purgeAfter,
        })
        .from(familyMember)
        .innerJoin(family, eq(familyMember.familyId, family.id))
        .where(
          and(
            eq(familyMember.userId, userId),
            isNull(familyMember.removedAt),
            isNotNull(family.deletedAt),
            gt(family.purgeAfter, new Date().toISOString()),
          ),
        );
      response.json({
        items: items.filter((item) => item.role !== "caregiver"),
      });
    }),
  );

  router.post(
    "/families",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const body = parseBody(request, response, CreateFamilySchema);
      if (!body) return;

      const [profile] = await database
        .select({ timezone: userProfile.timezone })
        .from(userProfile)
        .where(eq(userProfile.userId, userId));
      const timezone = body.timezone ?? profile?.timezone ?? "Asia/Jakarta";
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid IANA timezone.");
        return;
      }

      const currentFamilies = await database
        .select({ id: family.id })
        .from(familyMember)
        .innerJoin(family, eq(familyMember.familyId, family.id))
        .where(
          and(
            eq(familyMember.userId, userId),
            isNull(familyMember.removedAt),
            isNull(family.deletedAt),
          ),
        );
      if (currentFamilies.length >= FAMILY_LIMIT) {
        sendError(response, 409, "CONFLICT", "Family limit reached.");
        return;
      }

      const id = createUuidV7();
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        await transaction.insert(family).values({
          id,
          name: body.name,
          timezone,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
        });
        await transaction.insert(familyRevCounter).values({
          familyId: id,
          rev: 1,
        });
        await transaction.insert(familyMember).values({
          id: createUuidV7(),
          familyId: id,
          userId,
          role: body.myRole,
          joinedAt: now,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
        });
        await transaction
          .update(userProfile)
          .set({ lastActiveFamilyId: id, lastActiveChildId: null })
          .where(eq(userProfile.userId, userId));
      });

      response.status(201).json({
        id,
        name: body.name,
        timezone,
        myRole: body.myRole,
      });
    }),
  );

  router.get(
    "/families/:fid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      const members = await database
        .select({
          id: familyMember.id,
          userId: familyMember.userId,
          role: familyMember.role,
          joinedAt: familyMember.joinedAt,
          displayName: userProfile.displayName,
          name: user.name,
        })
        .from(familyMember)
        .innerJoin(user, eq(familyMember.userId, user.id))
        .leftJoin(userProfile, eq(familyMember.userId, userProfile.userId))
        .where(
          and(
            eq(familyMember.familyId, familyId),
            isNull(familyMember.removedAt),
          ),
        );
      const children = await database
        .select()
        .from(child)
        .where(and(eq(child.familyId, familyId), isNull(child.deletedAt)))
        .orderBy(child.sortOrder);
      const deletedChildren =
        access.member.role === "caregiver"
          ? []
          : await database
              .select()
              .from(child)
              .where(
                and(
                  eq(child.familyId, familyId),
                  isNotNull(child.deletedAt),
                  gt(child.purgeAfter, new Date().toISOString()),
                ),
              )
              .orderBy(child.sortOrder);
      response.json({
        ...access.family,
        quickBottleMl: parseQuickBottleMl(access.family.quickBottleMl),
        myRole: access.member.role,
        members: members.map((member) => ({
          id: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
          displayName: member.displayName ?? member.name,
          isMe: member.userId === userId,
        })),
        children,
        deletedChildren,
      });
    }),
  );

  router.post(
    "/families/:fid/select",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      await database
        .update(userProfile)
        .set({ lastActiveFamilyId: familyId, lastActiveChildId: null })
        .where(eq(userProfile.userId, userId));
      response.json({ familyId });
    }),
  );

  router.patch(
    "/families/:fid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, UpdateFamilySchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      const onlyQuickBottle =
        Object.keys(body).length === 1 && body.quickBottleMl !== undefined;
      if (access.member.role === "caregiver" && !onlyQuickBottle) {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      if (body.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: body.timezone });
        } catch {
          sendError(
            response,
            400,
            "VALIDATION_ERROR",
            "Invalid IANA timezone.",
          );
          return;
        }
      }

      const now = new Date().toISOString();
      const updated = await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        const { quickBottleMl, ...rest } = body;
        const [row] = await transaction
          .update(family)
          .set({
            ...rest,
            ...(quickBottleMl
              ? { quickBottleMl: JSON.stringify(quickBottleMl) }
              : {}),
            updatedAt: now,
            updatedBy: userId,
            version: sql`${family.version} + 1`,
            rev,
          })
          .where(and(eq(family.id, familyId), isNull(family.deletedAt)))
          .returning();
        return row;
      });
      response.json(updated);
    }),
  );

  router.post(
    "/families/:fid/leave",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      const parentCount = await database
        .select({ id: familyMember.id })
        .from(familyMember)
        .where(
          and(
            eq(familyMember.familyId, familyId),
            isNull(familyMember.removedAt),
            inArray(familyMember.role, ["mom", "dad"]),
          ),
        );
      if (access.member.role !== "caregiver" && parentCount.length <= 1) {
        sendError(response, 409, "CONFLICT", "The last parent cannot leave.");
        return;
      }

      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction
          .update(familyMember)
          .set({
            removedAt: now,
            removedBy: userId,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${familyMember.version} + 1`,
            rev,
          })
          .where(eq(familyMember.id, access.member.id));
        await transaction
          .update(userProfile)
          .set({ lastActiveFamilyId: null, lastActiveChildId: null })
          .where(
            and(
              eq(userProfile.userId, userId),
              eq(userProfile.lastActiveFamilyId, familyId),
            ),
          );
      });
      response.status(204).end();
    }),
  );

  router.delete(
    "/families/:fid/members/:mid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      const memberId = routeParam(request, "mid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId) || !validParam(memberId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const [target] = await database
        .select()
        .from(familyMember)
        .where(
          and(
            eq(familyMember.id, memberId),
            eq(familyMember.familyId, familyId),
            isNull(familyMember.removedAt),
          ),
        );
      if (!target || target.role !== "caregiver") {
        sendError(response, 404, "NOT_FOUND", "Member not found.");
        return;
      }

      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction
          .update(familyMember)
          .set({
            removedAt: now,
            removedBy: userId,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${familyMember.version} + 1`,
            rev,
          })
          .where(eq(familyMember.id, memberId));
        await transaction
          .update(userProfile)
          .set({ lastActiveFamilyId: null, lastActiveChildId: null })
          .where(
            and(
              eq(userProfile.userId, target.userId),
              eq(userProfile.lastActiveFamilyId, familyId),
            ),
          );
      });
      response.status(204).end();
    }),
  );

  router.patch(
    "/families/:fid/members/me",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, MemberRoleSchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(
          response,
          403,
          "FORBIDDEN",
          "A caregiver cannot become a parent.",
        );
        return;
      }
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction
          .update(familyMember)
          .set({
            role: body.role,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${familyMember.version} + 1`,
            rev,
          })
          .where(eq(familyMember.id, access.member.id));
      });
      response.json({ role: body.role });
    }),
  );

  router.delete(
    "/families/:fid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, ConfirmFamilyNameSchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      if (body.confirmName !== access.family.name) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Family name did not match.",
        );
        return;
      }
      const now = new Date();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction
          .update(family)
          .set({
            deletedAt: now.toISOString(),
            purgeAfter: new Date(now.valueOf() + SOFT_DELETE_MS).toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: userId,
            version: sql`${family.version} + 1`,
            rev,
          })
          .where(eq(family.id, familyId));
        await transaction
          .update(userProfile)
          .set({ lastActiveFamilyId: null, lastActiveChildId: null })
          .where(
            and(
              eq(userProfile.userId, userId),
              eq(userProfile.lastActiveFamilyId, familyId),
            ),
          );
      });
      response.status(204).end();
    }),
  );

  router.post(
    "/families/:fid/restore",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId, true);
      if (!access || !access.family.deletedAt) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      if (
        !access.family.purgeAfter ||
        access.family.purgeAfter <= new Date().toISOString()
      ) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction
          .update(family)
          .set({
            deletedAt: null,
            purgeAfter: null,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
            version: sql`${family.version} + 1`,
            rev,
          })
          .where(eq(family.id, familyId));
      });
      response.json({ id: familyId, restored: true });
    }),
  );

  router.post(
    "/families/:fid/invites",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, CreateInviteSchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const now = new Date();
      const activeInvites = await database
        .select({ id: familyInvite.id })
        .from(familyInvite)
        .where(
          and(
            eq(familyInvite.familyId, familyId),
            isNull(familyInvite.usedAt),
            isNull(familyInvite.revokedAt),
            gt(familyInvite.expiresAt, now.toISOString()),
          ),
        );
      if (activeInvites.length >= ACTIVE_INVITE_LIMIT) {
        sendError(response, 409, "CONFLICT", "Active invite limit reached.");
        return;
      }
      const code = createInviteCode();
      const id = createUuidV7();
      const createdAt = now.toISOString();
      const expiresAt = new Date(
        now.valueOf() + 72 * 60 * 60 * 1000,
      ).toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        await transaction.insert(familyInvite).values({
          id,
          familyId,
          codeHash: hashInviteCode(code),
          targetRole: body.targetRole,
          createdBy: userId,
          createdAt,
          expiresAt,
        });
        await transaction
          .update(family)
          .set({ rev, updatedAt: createdAt, updatedBy: userId })
          .where(eq(family.id, familyId));
      });
      response.status(201).json({
        id,
        code,
        targetRole: body.targetRole,
        createdAt,
        expiresAt,
      });
    }),
  );

  router.get(
    "/families/:fid/invites",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const items = await database
        .select({
          id: familyInvite.id,
          targetRole: familyInvite.targetRole,
          createdAt: familyInvite.createdAt,
          expiresAt: familyInvite.expiresAt,
          createdBy: userProfile.displayName,
          usedAt: familyInvite.usedAt,
          revokedAt: familyInvite.revokedAt,
        })
        .from(familyInvite)
        .leftJoin(userProfile, eq(familyInvite.createdBy, userProfile.userId))
        .where(eq(familyInvite.familyId, familyId))
        .orderBy(sql`${familyInvite.createdAt} DESC`);
      response.json({
        items: items.map((item) => ({
          ...item,
          status: item.revokedAt
            ? "revoked"
            : item.usedAt
              ? "used"
              : item.expiresAt <= new Date().toISOString()
                ? "expired"
                : "active",
        })),
      });
    }),
  );

  router.delete(
    "/families/:fid/invites/:iid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      const inviteId = routeParam(request, "iid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId) || !validParam(inviteId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid resource ID.");
        return;
      }
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        const [revoked] = await transaction
          .update(familyInvite)
          .set({ revokedAt: now })
          .where(
            and(
              eq(familyInvite.id, inviteId),
              eq(familyInvite.familyId, familyId),
              isNull(familyInvite.usedAt),
              isNull(familyInvite.revokedAt),
            ),
          )
          .returning({ id: familyInvite.id });
        if (revoked) {
          await transaction
            .update(family)
            .set({ rev, updatedAt: now, updatedBy: userId })
            .where(eq(family.id, familyId));
        }
      });
      response.status(204).end();
    }),
  );

  router.post(
    "/invites/preview",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const body = parseBody(request, response, PreviewInviteSchema);
      if (!body) return;
      const ipAddress = request.ip ?? request.socket.remoteAddress ?? "unknown";
      if (
        !(await enforceInviteRateLimit(
          database,
          `user:${userId}`,
          5,
          15 * 60 * 1000,
        )) ||
        !(await enforceInviteRateLimit(
          database,
          `ip:${ipAddress}`,
          20,
          60 * 60 * 1000,
        ))
      ) {
        sendError(response, 429, "RATE_LIMITED", "Too many invite attempts.");
        return;
      }
      const [invite] = await database
        .select({ invite: familyInvite, family })
        .from(familyInvite)
        .innerJoin(family, eq(familyInvite.familyId, family.id))
        .where(
          and(
            eq(familyInvite.codeHash, hashInviteCode(body.code)),
            isNull(familyInvite.usedAt),
            isNull(familyInvite.revokedAt),
            gt(familyInvite.expiresAt, new Date().toISOString()),
            isNull(family.deletedAt),
          ),
        );
      if (!invite) {
        sendError(
          response,
          404,
          "NOT_FOUND",
          "Kode tidak valid atau sudah kedaluwarsa",
        );
        return;
      }
      const [existing] = await database
        .select({ id: familyMember.id })
        .from(familyMember)
        .where(
          and(
            eq(familyMember.familyId, invite.family.id),
            eq(familyMember.userId, userId),
            isNull(familyMember.removedAt),
          ),
        );
      if (existing) {
        sendError(
          response,
          404,
          "NOT_FOUND",
          "Kode tidak valid atau sudah kedaluwarsa",
        );
        return;
      }
      response.json({
        familyName: invite.family.name,
        targetRole: invite.invite.targetRole,
      });
    }),
  );

  router.post(
    "/invites/redeem",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const body = parseBody(request, response, RedeemInviteSchema);
      if (!body) return;
      const ipAddress = request.ip ?? request.socket.remoteAddress ?? "unknown";
      if (
        !(await enforceInviteRateLimit(
          database,
          `user:${userId}`,
          5,
          15 * 60 * 1000,
        )) ||
        !(await enforceInviteRateLimit(
          database,
          `ip:${ipAddress}`,
          20,
          60 * 60 * 1000,
        ))
      ) {
        sendError(response, 429, "RATE_LIMITED", "Too many invite attempts.");
        return;
      }

      const now = new Date().toISOString();
      try {
        const joined = await database.transaction(async (transaction) => {
          const [match] = await transaction
            .select({ invite: familyInvite, family })
            .from(familyInvite)
            .innerJoin(family, eq(familyInvite.familyId, family.id))
            .where(
              and(
                eq(familyInvite.codeHash, hashInviteCode(body.code)),
                isNull(familyInvite.usedAt),
                isNull(familyInvite.revokedAt),
                gt(familyInvite.expiresAt, now),
                isNull(family.deletedAt),
              ),
            );
          if (!match) return null;

          const currentMemberships = await transaction
            .select({ id: familyMember.id })
            .from(familyMember)
            .innerJoin(family, eq(familyMember.familyId, family.id))
            .where(
              and(
                eq(familyMember.userId, userId),
                isNull(familyMember.removedAt),
                isNull(family.deletedAt),
              ),
            );
          const [existing] = await transaction
            .select({ id: familyMember.id })
            .from(familyMember)
            .where(
              and(
                eq(familyMember.familyId, match.family.id),
                eq(familyMember.userId, userId),
                isNull(familyMember.removedAt),
              ),
            );
          const members = await transaction
            .select({ id: familyMember.id })
            .from(familyMember)
            .where(
              and(
                eq(familyMember.familyId, match.family.id),
                isNull(familyMember.removedAt),
              ),
            );
          if (
            existing ||
            currentMemberships.length >= FAMILY_LIMIT ||
            members.length >= MEMBER_LIMIT ||
            (match.invite.targetRole === "parent" && !body.role) ||
            (match.invite.targetRole === "caregiver" && body.role)
          ) {
            return null;
          }

          const role =
            match.invite.targetRole === "caregiver"
              ? "caregiver"
              : body.role === "mom" || body.role === "dad"
                ? body.role
                : null;
          if (!role) return null;

          const [used] = await transaction
            .update(familyInvite)
            .set({ usedBy: userId, usedAt: now })
            .where(
              and(
                eq(familyInvite.id, match.invite.id),
                isNull(familyInvite.usedAt),
                isNull(familyInvite.revokedAt),
                gt(familyInvite.expiresAt, now),
              ),
            )
            .returning({ id: familyInvite.id });
          if (!used) return null;

          const rev = await bumpFamilyRev(transaction, match.family.id);
          await transaction.insert(familyMember).values({
            id: createUuidV7(),
            familyId: match.family.id,
            userId,
            role,
            joinedAt: now,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            rev,
          });
          await transaction
            .update(family)
            .set({ rev, updatedAt: now, updatedBy: userId })
            .where(eq(family.id, match.family.id));
          await transaction
            .update(userProfile)
            .set({
              lastActiveFamilyId: match.family.id,
              lastActiveChildId: null,
            })
            .where(eq(userProfile.userId, userId));
          return {
            familyId: match.family.id,
            familyName: match.family.name,
            role,
          };
        });
        if (!joined) {
          sendError(
            response,
            404,
            "NOT_FOUND",
            "Kode tidak valid atau sudah kedaluwarsa",
          );
          return;
        }
        response.status(201).json(joined);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("UNIQUE constraint") ||
            error.message.includes("unique constraint"))
        ) {
          sendError(
            response,
            404,
            "NOT_FOUND",
            "Kode tidak valid atau sudah kedaluwarsa",
          );
          return;
        }
        throw error;
      }
    }),
  );

  router.post(
    "/families/:fid/children",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, ChildProfileSchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const currentChildren = await database
        .select({ id: child.id })
        .from(child)
        .where(and(eq(child.familyId, familyId), isNull(child.deletedAt)));
      if (currentChildren.length >= CHILD_LIMIT) {
        sendError(response, 409, "CONFLICT", "Child limit reached.");
        return;
      }
      const now = new Date().toISOString();
      const id = createUuidV7();
      const created = await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        const [row] = await transaction
          .insert(child)
          .values({
            ...body,
            id,
            familyId,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            rev,
          })
          .returning();
        return row;
      });
      response.status(201).json(created);
    }),
  );

  router.patch(
    "/children/:cid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const childId = routeParam(request, "cid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(childId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const body = parseBody(request, response, UpdateChildProfileSchema);
      if (!body) return;
      const [current] = await database
        .select()
        .from(child)
        .where(and(eq(child.id, childId), isNull(child.deletedAt)));
      if (!current) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const access = await getMembership(database, current.familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      if (body.version !== current.version) {
        sendError(response, 409, "CONFLICT", "Child has changed.", {
          current,
        });
        return;
      }
      const { version, ...changes } = body;
      const validatedProfile = ChildProfileSchema.safeParse({
        name: changes.name ?? current.name,
        nickname:
          changes.nickname !== undefined ? changes.nickname : current.nickname,
        sex: changes.sex ?? current.sex,
        dateOfBirth: changes.dateOfBirth ?? current.dateOfBirth,
        timeOfBirth:
          changes.timeOfBirth !== undefined
            ? changes.timeOfBirth
            : current.timeOfBirth,
        gestationalAgeWeeks:
          changes.gestationalAgeWeeks !== undefined
            ? changes.gestationalAgeWeeks
            : current.gestationalAgeWeeks,
        gestationalAgeDays:
          changes.gestationalAgeDays !== undefined
            ? changes.gestationalAgeDays
            : current.gestationalAgeDays,
        birthWeightG: changes.birthWeightG ?? current.birthWeightG,
        birthLengthMm:
          changes.birthLengthMm !== undefined
            ? changes.birthLengthMm
            : current.birthLengthMm,
        birthHeadCircMm:
          changes.birthHeadCircMm !== undefined
            ? changes.birthHeadCircMm
            : current.birthHeadCircMm,
        feedingMode: changes.feedingMode ?? current.feedingMode,
        milkTargetMode: changes.milkTargetMode ?? current.milkTargetMode,
        milkTargetManualMl:
          changes.milkTargetManualMl !== undefined
            ? changes.milkTargetManualMl
            : current.milkTargetManualMl,
        allergiesNote:
          changes.allergiesNote !== undefined
            ? changes.allergiesNote
            : current.allergiesNote,
        avatar: changes.avatar ?? current.avatar,
        color: changes.color ?? current.color,
        sortOrder: changes.sortOrder ?? current.sortOrder,
      });
      if (!validatedProfile.success) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
          {
            issues: validatedProfile.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        );
        return;
      }
      const now = new Date().toISOString();
      const updated = await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, current.familyId);
        const [row] = await transaction
          .update(child)
          .set({
            ...changes,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${child.version} + 1`,
            rev,
          })
          .where(
            and(
              eq(child.id, childId),
              eq(child.version, version),
              isNull(child.deletedAt),
            ),
          )
          .returning();
        return row;
      });
      if (!updated) {
        sendError(response, 409, "CONFLICT", "Child has changed.", {
          current,
        });
        return;
      }
      response.json(updated);
    }),
  );

  router.patch(
    "/families/:fid/children/order",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const familyId = routeParam(request, "fid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(familyId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid family ID.");
        return;
      }
      const body = parseBody(request, response, ReorderChildrenSchema);
      if (!body) return;
      const access = await getMembership(database, familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Family not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const activeChildren = await database
        .select({ id: child.id })
        .from(child)
        .where(and(eq(child.familyId, familyId), isNull(child.deletedAt)));
      if (
        activeChildren.length !== body.childIds.length ||
        new Set(body.childIds).size !== body.childIds.length ||
        !activeChildren.every((item) => body.childIds.includes(item.id))
      ) {
        sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "Child order is incomplete.",
        );
        return;
      }
      const now = new Date().toISOString();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, familyId);
        for (const [sortOrder, id] of body.childIds.entries()) {
          await transaction
            .update(child)
            .set({
              sortOrder,
              updatedAt: now,
              updatedBy: userId,
              version: sql`${child.version} + 1`,
              rev,
            })
            .where(and(eq(child.id, id), eq(child.familyId, familyId)));
        }
      });
      response.status(204).end();
    }),
  );

  router.delete(
    "/children/:cid",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const childId = routeParam(request, "cid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(childId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const [current] = await database
        .select()
        .from(child)
        .where(and(eq(child.id, childId), isNull(child.deletedAt)));
      if (!current) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const access = await getMembership(database, current.familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      const now = new Date();
      await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, current.familyId);
        await transaction
          .update(child)
          .set({
            deletedAt: now.toISOString(),
            purgeAfter: new Date(now.valueOf() + SOFT_DELETE_MS).toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: userId,
            version: sql`${child.version} + 1`,
            rev,
          })
          .where(eq(child.id, childId));
      });
      response.status(204).end();
    }),
  );

  router.post(
    "/children/:cid/restore",
    route(async (request, response) => {
      const userId = sessionUserId(response);
      const childId = routeParam(request, "cid");
      if (!userId) {
        sendError(response, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      if (!validParam(childId)) {
        sendError(response, 400, "VALIDATION_ERROR", "Invalid child ID.");
        return;
      }
      const [current] = await database
        .select()
        .from(child)
        .where(and(eq(child.id, childId), sql`${child.deletedAt} IS NOT NULL`));
      if (!current) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const access = await getMembership(database, current.familyId, userId);
      if (!access) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      if (access.member.role === "caregiver") {
        sendError(response, 403, "FORBIDDEN", "Parent permission required.");
        return;
      }
      if (
        !current.purgeAfter ||
        current.purgeAfter <= new Date().toISOString()
      ) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      const activeChildren = await database
        .select({ id: child.id })
        .from(child)
        .where(
          and(eq(child.familyId, current.familyId), isNull(child.deletedAt)),
        );
      if (activeChildren.length >= CHILD_LIMIT) {
        sendError(response, 409, "CONFLICT", "Child limit reached.");
        return;
      }
      const now = new Date().toISOString();
      const restored = await database.transaction(async (transaction) => {
        const rev = await bumpFamilyRev(transaction, current.familyId);
        const [row] = await transaction
          .update(child)
          .set({
            deletedAt: null,
            purgeAfter: null,
            updatedAt: now,
            updatedBy: userId,
            version: sql`${child.version} + 1`,
            rev,
          })
          .where(and(eq(child.id, childId), isNotNull(child.deletedAt)))
          .returning();
        return row;
      });
      if (!restored) {
        sendError(response, 404, "NOT_FOUND", "Child not found.");
        return;
      }
      response.json(restored);
    }),
  );

  return router;
}
