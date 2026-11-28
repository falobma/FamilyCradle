import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import pino from "pino";
import request from "supertest";
import { createApp } from "../app.js";
import {
  auditLog,
  child,
  family,
  familyMember,
  familyRevCounter,
  logEntry,
  mpasiFood,
  schema,
  user,
  userProfile,
} from "../db/schema.js";
import { createUuidV5 } from "../ids.js";
import { createLogRouter } from "./logs.js";

const userId = "019ac600-0000-7000-8000-000000000011";
const caregiverId = "019ac600-0000-7000-8000-000000000021";
const outsiderId = "019ac600-0000-7000-8000-000000000031";
const familyId = "019ac600-0000-7000-8000-000000000012";
const otherFamilyId = "019ac600-0000-7000-8000-000000000041";
const childId = "019ac600-0000-7000-8000-000000000013";
const secondChildId = "019ac600-0000-7000-8000-000000000023";
const otherChildId = "019ac600-0000-7000-8000-000000000042";
const dbPath = join(tmpdir(), `family-logs-${randomUUID()}.db`);
const client = createClient({ url: `file:${dbPath.replaceAll("\\", "/")}` });
const db = drizzle(client, { schema });
const app = createApp({
  appOrigin: "http://localhost:5173",
  apiAuthMiddleware: (req, res, next) => {
    req.headers.origin ??= "http://localhost:5173";
    if (req.header("x-test-user"))
      res.locals.session = { user: { id: req.header("x-test-user") } };
    next();
  },
  apiRouter: createLogRouter(db),
  checkDatabase: async () => undefined,
  logger: pino({ level: "silent" }),
});
const now = new Date().toISOString();

function iso(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(
      new URL("../db/migrations", import.meta.url),
    ),
  });
  await db.insert(user).values([
    {
      id: userId,
      name: "Parent",
      email: "logs@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: new Date(),
      tosVersion: "test",
    },
    {
      id: caregiverId,
      name: "Caregiver",
      email: "caregiver@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: new Date(),
      tosVersion: "test",
    },
    {
      id: outsiderId,
      name: "Outsider",
      email: "outsider@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: new Date(),
      tosVersion: "test",
    },
  ]);
  await db.insert(userProfile).values([
    { userId, displayName: "Parent", tosAcceptedAt: now, tosVersion: "test" },
    {
      userId: caregiverId,
      displayName: "Caregiver",
      tosAcceptedAt: now,
      tosVersion: "test",
    },
    {
      userId: outsiderId,
      displayName: "Outsider",
      tosAcceptedAt: now,
      tosVersion: "test",
    },
  ]);
  await db.insert(family).values([
    {
      id: familyId,
      name: "Family",
      timezone: "Asia/Jakarta",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    },
    {
      id: otherFamilyId,
      name: "Other family",
      timezone: "Asia/Jakarta",
      createdBy: outsiderId,
      createdAt: now,
      updatedAt: now,
      updatedBy: outsiderId,
    },
  ]);
  await db.insert(familyMember).values([
    {
      id: "019ac600-0000-7000-8000-000000000014",
      familyId,
      userId,
      role: "mom",
      joinedAt: now,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    },
    {
      id: "019ac600-0000-7000-8000-000000000024",
      familyId,
      userId: caregiverId,
      role: "caregiver",
      joinedAt: now,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    },
    {
      id: "019ac600-0000-7000-8000-000000000043",
      familyId: otherFamilyId,
      userId: outsiderId,
      role: "mom",
      joinedAt: now,
      createdBy: outsiderId,
      createdAt: now,
      updatedAt: now,
      updatedBy: outsiderId,
    },
  ]);
  await db.insert(familyRevCounter).values([
    { familyId, rev: 0 },
    { familyId: otherFamilyId, rev: 0 },
  ]);
  await db.insert(child).values([
    {
      id: childId,
      familyId,
      name: "Baby",
      sex: "female",
      dateOfBirth: "2026-01-01",
      birthWeightG: 3000,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    },
    {
      id: secondChildId,
      familyId,
      name: "Twin",
      sex: "male",
      dateOfBirth: "2026-01-01",
      birthWeightG: 3100,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    },
    {
      id: otherChildId,
      familyId: otherFamilyId,
      name: "Other baby",
      sex: "female",
      dateOfBirth: "2026-01-01",
      birthWeightG: 3200,
      createdBy: outsiderId,
      createdAt: now,
      updatedAt: now,
      updatedBy: outsiderId,
    },
  ]);
});
afterAll(async () => {
  await client.close();
});

describe("log entry routes", () => {
  it("creates an audited entry and increments the family revision", async () => {
    const response = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000015",
        childId,
        type: "diaper",
        startedAt: new Date().toISOString(),
        details: { kind: "wet" },
      });
    expect(response.status).toBe(201);
    expect(response.body.createdBy).toBe(userId);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, response.body.id)),
    ).toHaveLength(1);
    expect(
      (
        await db
          .select()
          .from(familyRevCounter)
          .where(eq(familyRevCounter.familyId, familyId))
      )[0]?.rev,
    ).toBe(1);
  });

  it("rejects a child from another family and starts timer entries at server time", async () => {
    const badChild = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000016",
        childId: "019ac600-0000-7000-8000-000000000099",
        type: "sleep",
        startedAt: "2026-01-02T00:00:00.000Z",
        details: { category: "nap" },
      });
    expect(badChild.status).toBe(404);
    const before = Date.now();
    const timer = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000017",
        childId,
        type: "sleep",
        startedAt: "2026-01-02T00:00:00.000Z",
        details: { category: "nap" },
      });
    expect(timer.status).toBe(201);
    expect(timer.body.status).toBe("running");
    expect(new Date(timer.body.startedAt).valueOf()).toBeGreaterThanOrEqual(
      before,
    );
    const stopped = await request(app)
      .post(`/api/logs/${timer.body.id}/timer/stop`)
      .set("x-test-user", userId)
      .send({});
    expect(stopped.status).toBe(200);
    expect(stopped.body.status).toBe("completed");
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(0);
  });

  it("shares a running timer across family members and lets the other member stop it", async () => {
    const timer = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000091",
        childId,
        type: "sleep",
        startedAt: "2026-01-02T00:00:00.000Z",
        details: { category: "nap" },
      });
    expect(timer.status).toBe(201);
    expect(timer.body.status).toBe("running");

    const visibleToCaregiver = await request(app)
      .get(`/api/families/${familyId}/logs`)
      .set("x-test-user", caregiverId);
    expect(visibleToCaregiver.status).toBe(200);
    expect(visibleToCaregiver.body.items).toContainEqual(
      expect.objectContaining({
        id: timer.body.id,
        status: "running",
        startedAt: timer.body.startedAt,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const stopped = await request(app)
      .post(`/api/logs/${timer.body.id}/timer/stop`)
      .set("x-test-user", caregiverId)
      .send({});
    expect(stopped.status).toBe(200);
    expect(stopped.body.status).toBe("completed");
    expect(stopped.body.endedAt).toBeTruthy();
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(0);
    const elapsedSec = Math.floor(
      (Date.parse(stopped.body.endedAt) - Date.parse(timer.body.startedAt)) /
        1000,
    );
    expect(elapsedSec).toBeGreaterThanOrEqual(1);
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(1);
    expect(Math.abs(stopped.body.durationSec - elapsedSec)).toBeLessThanOrEqual(
      1,
    );
  });

  it("tracks new MPASI foods and returns the three-day allergy watch", async () => {
    const firstFood = await request(app)
      .post(`/api/children/${childId}/foods`)
      .set("x-test-user", userId)
      .send({ name: "egg" });
    const first = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000018",
        childId,
        type: "mpasi",
        startedAt: new Date().toISOString(),
        details: {
          mealType: "sarapan",
          texture: "puree_halus",
          foodIds: [firstFood.body.id],
        },
      });
    expect(first.status).toBe(201);
    expect(first.body.details.newFoodIds).toContain(firstFood.body.id);

    const secondFood = await request(app)
      .post(`/api/children/${childId}/foods`)
      .set("x-test-user", userId)
      .send({ name: "peanut" });
    const second = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000019",
        childId,
        type: "mpasi",
        startedAt: new Date().toISOString(),
        details: {
          mealType: "sarapan",
          texture: "puree_halus",
          foodIds: [secondFood.body.id],
        },
      });
    expect(second.status).toBe(201);
    expect(second.body.allergyWatch).toBe(true);
  });

  it("enforces membership and allows caregivers to log", async () => {
    const outsider = await request(app)
      .get(`/api/families/${familyId}/logs`)
      .set("x-test-user", outsiderId);
    expect(outsider.status).toBe(404);

    const caregiver = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", caregiverId)
      .send({
        id: "019ac600-0000-7000-8000-000000000051",
        childId,
        type: "diaper",
        startedAt: new Date().toISOString(),
        details: { kind: "pup" },
      });
    expect(caregiver.status).toBe(201);
    expect(caregiver.body.createdBy).toBe(caregiverId);
  });

  it("validates entry times and manual breastfeeding durations", async () => {
    const future = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000052",
        childId,
        type: "diaper",
        startedAt: iso(10 * 60_000),
        details: { kind: "wet" },
      });
    expect(future.status).toBe(400);

    const beforeDob = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000053",
        childId,
        type: "diaper",
        startedAt: "2025-12-31T00:00:00.000Z",
        details: { kind: "wet" },
      });
    expect(beforeDob.status).toBe(400);

    const zeroDuration = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000054",
        childId,
        type: "breastfeed",
        startedAt: new Date().toISOString(),
        details: { lastSide: "left", leftSec: 0, rightSec: 0 },
      });
    expect(zeroDuration.status).toBe(400);

    const tooLong = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000055",
        childId,
        type: "breastfeed",
        startedAt: new Date().toISOString(),
        details: { lastSide: "left", leftSec: 4000, rightSec: 4000 },
      });
    expect(tooLong.status).toBe(400);

    const endBeforeStart = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000056",
        childId,
        type: "sleep",
        startedAt: iso(-60 * 60_000),
        endedAt: iso(-120 * 60_000),
        details: { category: "nap" },
      });
    expect(endBeforeStart.status).toBe(400);
  });

  it("runs the DBF timer state machine and excludes pauses from the duration", async () => {
    const started = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000057",
        childId,
        type: "breastfeed",
        startedAt: new Date().toISOString(),
        details: { lastSide: "left" },
      });
    expect(started.status).toBe(201);
    expect(started.body.status).toBe("running");

    const switched = await request(app)
      .post(`/api/logs/${started.body.id}/timer/action`)
      .set("x-test-user", userId)
      .send({ action: "switch" });
    expect(switched.status).toBe(200);
    expect(switched.body.details.lastSide).toBe("right");

    const paused = await request(app)
      .post(`/api/logs/${started.body.id}/timer/action`)
      .set("x-test-user", userId)
      .send({ action: "pause" });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");

    const doublePause = await request(app)
      .post(`/api/logs/${started.body.id}/timer/action`)
      .set("x-test-user", userId)
      .send({ action: "pause" });
    expect(doublePause.status).toBe(409);

    const resumed = await request(app)
      .post(`/api/logs/${started.body.id}/timer/action`)
      .set("x-test-user", userId)
      .send({ action: "resume" });
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("running");

    const stopped = await request(app)
      .post(`/api/logs/${started.body.id}/timer/stop`)
      .set("x-test-user", userId)
      .send({});
    expect(stopped.status).toBe(200);
    expect(stopped.body.status).toBe("completed");
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(0);
  });

  it("subtracts paused time from a stopped sleep timer", async () => {
    const started = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000058",
        childId,
        type: "sleep",
        startedAt: new Date().toISOString(),
        details: { category: "nap" },
      });
    expect(started.status).toBe(201);
    await db
      .update(logEntry)
      .set({
        startedAt: iso(-100_000),
        details: JSON.stringify({
          category: "nap",
          pauses: [{ startedAt: iso(-80_000), endedAt: iso(-40_000) }],
        }),
      })
      .where(eq(logEntry.id, started.body.id));
    const stopped = await request(app)
      .post(`/api/logs/${started.body.id}/timer/stop`)
      .set("x-test-user", userId)
      .send({});
    expect(stopped.status).toBe(200);
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(55);
    expect(stopped.body.durationSec).toBeLessThanOrEqual(65);
  });

  it("prevents overlapping sleep entries on create and update", async () => {
    const first = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000059",
        childId,
        type: "sleep",
        startedAt: iso(-3 * 3600_000),
        endedAt: iso(-2 * 3600_000),
        details: { category: "nap" },
      });
    expect(first.status).toBe(201);

    const overlap = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000060",
        childId,
        type: "sleep",
        startedAt: iso(-2.5 * 3600_000),
        endedAt: iso(-1.5 * 3600_000),
        details: { category: "nap" },
      });
    expect(overlap.status).toBe(409);

    const separate = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000061",
        childId,
        type: "sleep",
        startedAt: iso(-1.5 * 3600_000),
        endedAt: iso(-1 * 3600_000),
        details: { category: "nap" },
      });
    expect(separate.status).toBe(201);

    const patchOverlap = await request(app)
      .patch(`/api/logs/${separate.body.id}`)
      .set("x-test-user", userId)
      .send({
        version: separate.body.version,
        startedAt: iso(-2.5 * 3600_000),
        endedAt: iso(-2.2 * 3600_000),
      });
    expect(patchOverlap.status).toBe(409);
  });

  it("increments version and revision on update and rejects stale versions", async () => {
    const created = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000062",
        childId,
        type: "bottle",
        startedAt: new Date().toISOString(),
        amountMl: 120,
        details: { milkType: "asip" },
      });
    expect(created.status).toBe(201);
    const revBefore = (
      await db
        .select()
        .from(familyRevCounter)
        .where(eq(familyRevCounter.familyId, familyId))
    )[0]!.rev;

    const updated = await request(app)
      .patch(`/api/logs/${created.body.id}`)
      .set("x-test-user", caregiverId)
      .send({ version: created.body.version, amountMl: 150 });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(created.body.version + 1);
    expect(updated.body.updatedBy).toBe(caregiverId);
    expect(
      (
        await db
          .select()
          .from(familyRevCounter)
          .where(eq(familyRevCounter.familyId, familyId))
      )[0]!.rev,
    ).toBe(revBefore + 1);
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityId, created.body.id),
            eq(auditLog.action, "update"),
          ),
        ),
    ).toHaveLength(1);

    const stale = await request(app)
      .patch(`/api/logs/${created.body.id}`)
      .set("x-test-user", userId)
      .send({ version: created.body.version, amountMl: 90 });
    expect(stale.status).toBe(409);
  });

  it("creates deterministic UUIDv5 siblings for multi-child entries", async () => {
    const baseId = "019ac600-0000-7000-8000-000000000063";
    const response = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: baseId,
        childId,
        childIds: [childId, secondChildId],
        batchId: baseId,
        type: "diaper",
        startedAt: new Date().toISOString(),
        details: { kind: "wet" },
      });
    expect(response.status).toBe(201);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].id).toBe(baseId);
    expect(response.body.items[1].id).toBe(createUuidV5(baseId, secondChildId));
    expect(response.body.items[0].batchId).toBe(baseId);
    expect(response.body.items[1].batchId).toBe(baseId);
    expect(response.body.items[0].childId).toBe(childId);
    expect(response.body.items[1].childId).toBe(secondChildId);

    const missingBatch = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000064",
        childId,
        childIds: [childId, secondChildId],
        type: "diaper",
        startedAt: new Date().toISOString(),
        details: { kind: "wet" },
      });
    expect(missingBatch.status).toBe(400);
  });

  it("flags allergens and marks foods suspected on reaction", async () => {
    const food = await request(app)
      .post(`/api/children/${childId}/foods`)
      .set("x-test-user", userId)
      .send({ name: "shrimp" });
    expect(food.status).toBe(201);
    expect(food.body.isCommonAllergen).toBe(true);

    const logged = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000065",
        childId,
        type: "mpasi",
        startedAt: new Date().toISOString(),
        details: {
          mealType: "makan_siang",
          texture: "cincang_halus",
          foodIds: [food.body.id],
          reaction: { kind: "ruam", foodIds: [food.body.id] },
        },
      });
    expect(logged.status).toBe(201);
    expect(logged.body.commonAllergenNames).toContain("shrimp");
    const stored = await db
      .select()
      .from(mpasiFood)
      .where(eq(mpasiFood.id, food.body.id));
    expect(stored[0]?.reactionStatus).toBe("suspected");
  });

  it("soft deletes, lists recently deleted, and restores entries", async () => {
    const created = await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000066",
        childId,
        type: "medicine",
        startedAt: new Date().toISOString(),
        details: { name: "Paracetamol", dose: 2.5, unit: "ml" },
      });
    expect(created.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/logs/${created.body.id}`)
      .set("x-test-user", userId);
    expect(removed.status).toBe(204);

    const deleted = await request(app)
      .get(`/api/families/${familyId}/logs/deleted`)
      .set("x-test-user", userId);
    expect(
      deleted.body.items.some(
        (item: { id: string }) => item.id === created.body.id,
      ),
    ).toBe(true);

    const restored = await request(app)
      .post(`/api/logs/${created.body.id}/restore`)
      .set("x-test-user", userId)
      .send({});
    expect(restored.status).toBe(200);

    const history = await request(app)
      .get(`/api/logs/${created.body.id}/history`)
      .set("x-test-user", userId);
    expect(history.status).toBe(200);
    expect(
      history.body.items.map((item: { action: string }) => item.action),
    ).toEqual(expect.arrayContaining(["create", "delete", "restore"]));
  });

  it("returns medicine history filtered by name", async () => {
    await request(app)
      .post(`/api/families/${familyId}/logs`)
      .set("x-test-user", userId)
      .send({
        id: "019ac600-0000-7000-8000-000000000067",
        childId,
        type: "medicine",
        startedAt: new Date().toISOString(),
        details: { name: "Ibuprofen", dose: 1, unit: "ml" },
      });
    const history = await request(app)
      .get(`/api/children/${childId}/medicines/history?name=ibuprofen`)
      .set("x-test-user", userId);
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].details.name).toBe("Ibuprofen");

    const outsider = await request(app)
      .get(`/api/children/${childId}/medicines/history`)
      .set("x-test-user", outsiderId);
    expect(outsider.status).toBe(404);
  });
});
