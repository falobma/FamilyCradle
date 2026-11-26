import { randomUUID } from "node:crypto";
import { MAX_GROWTH_PHOTO_BYTES } from "@familycradle/shared";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import pino from "pino";
import request from "supertest";
import { createApp } from "../app.js";
import {
  auditLog,
  child,
  childMilestone,
  childVaccine,
  family,
  familyMember,
  familyRevCounter,
  growthMeasurement,
  growthPhoto,
  schema,
  user,
  userProfile,
} from "../db/schema.js";
import { createUuidV7 } from "../ids.js";
import { createHealthRouter } from "./health.js";
import { createSyncRouter } from "./sync.js";

const parentId = "019ac600-0000-7000-8000-000000000101";
const caregiverId = "019ac600-0000-7000-8000-000000000102";
const outsiderId = "019ac600-0000-7000-8000-000000000103";
const familyId = "019ac600-0000-7000-8000-000000000104";
const childId = "019ac600-0000-7000-8000-000000000105";
const databasePath = join(tmpdir(), `family-health-${randomUUID()}.db`);
const client = createClient({
  url: `file:${databasePath.replaceAll("\\", "/")}`,
});
const database = drizzle(client, { schema });
const app = createApp({
  apiAuthMiddleware: (request, response, next) => {
    const userId = request.header("x-test-user");
    if (userId) response.locals.session = { user: { id: userId } };
    next();
  },
  apiRouter: createHealthRouter(database),
  checkDatabase: async () => undefined,
  logger: pino({ level: "silent" }),
});
const syncApp = createApp({
  apiAuthMiddleware: (request, response, next) => {
    const userId = request.header("x-test-user");
    if (userId) response.locals.session = { user: { id: userId } };
    next();
  },
  apiRouter: createSyncRouter(database),
  checkDatabase: async () => undefined,
  logger: pino({ level: "silent" }),
});
const now = new Date().toISOString();
const today = now.slice(0, 10);
const millisecondsPerDay = 86_400_000;

function daysAgo(days: number) {
  return new Date(Date.now() - days * millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
}

beforeAll(async () => {
  await migrate(database, {
    migrationsFolder: fileURLToPath(
      new URL("../db/migrations", import.meta.url),
    ),
  });
  await database.insert(user).values([
    {
      id: parentId,
      name: "Parent",
      email: "health-parent@example.com",
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
      email: "health-caregiver@example.com",
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
      email: "health-outsider@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: new Date(),
      tosVersion: "test",
    },
  ]);
  await database.insert(userProfile).values([
    {
      userId: parentId,
      displayName: "Parent",
      tosAcceptedAt: now,
      tosVersion: "test",
    },
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
  await database.insert(family).values({
    id: familyId,
    name: "Health family",
    timezone: "Asia/Jakarta",
    createdBy: parentId,
    createdAt: now,
    updatedAt: now,
    updatedBy: parentId,
  });
  await database.insert(familyMember).values([
    {
      id: createUuidV7(),
      familyId,
      userId: parentId,
      role: "mom",
      joinedAt: now,
      createdBy: parentId,
      createdAt: now,
      updatedAt: now,
      updatedBy: parentId,
    },
    {
      id: createUuidV7(),
      familyId,
      userId: caregiverId,
      role: "caregiver",
      joinedAt: now,
      createdBy: parentId,
      createdAt: now,
      updatedAt: now,
      updatedBy: parentId,
    },
  ]);
  await database.insert(familyRevCounter).values({ familyId, rev: 0 });
  await database.insert(child).values({
    id: childId,
    familyId,
    name: "Baby",
    sex: "female",
    dateOfBirth: daysAgo(20),
    birthWeightG: 3200,
    feedingMode: "formula",
    createdBy: parentId,
    createdAt: now,
    updatedAt: now,
    updatedBy: parentId,
  });
});

afterAll(async () => {
  await client.close();
});

function asUser(userId: string) {
  return { "x-test-user": userId };
}

describe("health record routes", () => {
  it("validates and syncs dated clinician targets, including removal and replacement", async () => {
    const path = `/api/children/${childId}/growth-targets`;
    const body = {
      id: randomUUID(),
      targetDate: today,
      weightMinG: 3500,
      weightMaxG: 4500,
      lengthMinMm: null,
      lengthMaxMm: null,
    };
    expect(
      (await request(app).post(path).set(asUser(outsiderId)).send(body)).status,
    ).toBe(404);
    for (const invalid of [
      { ...body, targetDate: daysAgo(21) },
      { ...body, targetDate: "2026-02-30" },
      { ...body, weightMaxG: null },
      { ...body, weightMinG: 4600 },
      { ...body, weightMinG: null, weightMaxG: null },
    ]) {
      expect(
        (await request(app).post(path).set(asUser(parentId)).send(invalid))
          .status,
      ).toBe(400);
    }
    const created = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send(body);
    expect(created.status).toBe(201);
    const createdSync = await request(syncApp)
      .get(`/api/families/${familyId}/sync?since=0`)
      .set(asUser(caregiverId));
    expect(createdSync.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "growth_target",
          row: expect.objectContaining({ id: body.id, deletedAt: null }),
        }),
      ]),
    );
    expect(
      (
        await request(app)
          .post(path)
          .set(asUser(parentId))
          .send({ ...body, id: randomUUID() })
      ).status,
    ).toBe(409);
    const read = await request(app)
      .get(`/api/children/${childId}/growth`)
      .set(asUser(caregiverId));
    expect(read.body.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: body.id, weightMinG: 3500 }),
      ]),
    );
    expect(
      (
        await request(app)
          .delete(`${path}/${body.id}`)
          .set(asUser(outsiderId))
          .send({ version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`${path}/${body.id}`)
          .set(asUser(parentId))
          .send({ version: 2 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .delete(`${path}/${body.id}`)
          .set(asUser(parentId))
          .send({ version: 1 })
      ).status,
    ).toBe(204);
    const sync = await request(syncApp)
      .get(`/api/families/${familyId}/sync?since=${created.body.rev}`)
      .set(asUser(caregiverId));
    expect(sync.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "growth_target",
          row: expect.objectContaining({
            id: body.id,
            deletedAt: expect.any(String),
          }),
        }),
      ]),
    );
    const replacement = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send({ ...body, id: randomUUID() });
    expect(replacement.status).toBe(201);
  });

  it("enforces child-family membership and lazily seeds existing children", async () => {
    const denied = await request(app)
      .get(`/api/children/${childId}/vaccines`)
      .set(asUser(outsiderId));
    expect(denied.status).toBe(404);

    const vaccines = await request(app)
      .get(`/api/children/${childId}/vaccines`)
      .set(asUser(caregiverId));
    expect(vaccines.status).toBe(200);
    expect(vaccines.body.options).toEqual({
      DTP_SCHEDULE: "2-3-4",
      ROTA_PRODUCT: "RV1",
    });
    expect(vaccines.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definitionId: "idai2024_dtp_2_234",
          dueDate: expect.any(String),
        }),
        expect.objectContaining({
          definitionId: "idai2024_rota_2_rv1",
        }),
      ]),
    );
    expect(
      vaccines.body.items.some(
        (item: { definitionId: string | null }) =>
          item.definitionId === "idai2024_dtp_2_246" ||
          item.definitionId === "idai2024_rota_1_rv5",
      ),
    ).toBe(false);

    const milestones = await request(app)
      .get(`/api/children/${childId}/milestones`)
      .set(asUser(caregiverId));
    expect(milestones.status).toBe(200);
    expect(milestones.body.items.length).toBeGreaterThan(50);
    expect(milestones.body.sourceReviewRequired).toBe(true);
    expect(milestones.body.skillLossInfo).toContain("kehilangan kemampuan");
    expect(
      await database
        .select({ id: childMilestone.id })
        .from(childMilestone)
        .where(eq(childMilestone.childId, childId)),
    ).toHaveLength(milestones.body.items.length);
  });

  it("validates growth, asks confirmation for a rapid weight change, and audits revisions", async () => {
    const invalid = await request(app)
      .post(`/api/children/${childId}/growth`)
      .set(asUser(parentId))
      .send({
        id: createUuidV7(),
        measuredAt: today,
        weightG: 0,
      });
    expect(invalid.status).toBe(400);

    const first = await request(app)
      .post(`/api/children/${childId}/growth`)
      .set(asUser(parentId))
      .send({
        id: createUuidV7(),
        measuredAt: daysAgo(4),
        weightG: 5000,
        lengthMm: 600,
      });
    expect(first.status).toBe(201);
    expect(first.body.version).toBe(1);

    const rapidChange = {
      id: createUuidV7(),
      measuredAt: daysAgo(2),
      weightG: 6500,
    };
    const confirmation = await request(app)
      .post(`/api/children/${childId}/growth`)
      .set(asUser(parentId))
      .send(rapidChange);
    expect(confirmation.status).toBe(409);
    expect(confirmation.body.error.code).toBe("CONFIRM_REQUIRED");
    expect(confirmation.body.error.details).toMatchObject({
      required: true,
      percentChange: 30,
      days: 2,
    });

    const second = await request(app)
      .post(`/api/children/${childId}/growth`)
      .set(asUser(parentId))
      .send({ ...rapidChange, confirmLargeChange: true });
    expect(second.status).toBe(201);

    const listed = await request(app)
      .get(`/api/children/${childId}/growth`)
      .set(asUser(parentId));
    expect(listed.status).toBe(200);
    expect(listed.body.birthPoint.weightG).toBe(3200);
    expect(listed.body.items[0].createdByName).toBe("Parent");
    expect(listed.body.items[1]).toMatchObject({
      previousWeightDeltaG: 1500,
      daysSincePrevious: 2,
    });

    const updated = await request(app)
      .patch(`/api/children/${childId}/growth/${second.body.id}`)
      .set(asUser(caregiverId))
      .send({
        version: 1,
        measuredAt: daysAgo(2),
        weightG: 6600,
        confirmLargeChange: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);
    const stale = await request(app)
      .patch(`/api/children/${childId}/growth/${second.body.id}`)
      .set(asUser(parentId))
      .send({
        version: 1,
        measuredAt: daysAgo(2),
        weightG: 6600,
      });
    expect(stale.status).toBe(409);

    const audits = await database
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.familyId, familyId),
          eq(auditLog.entityType, "growth_measurement"),
        ),
      );
    expect(audits.map((audit) => audit.action)).toEqual([
      "create",
      "create",
      "update",
    ]);
    const [counter] = await database
      .select({ rev: familyRevCounter.rev })
      .from(familyRevCounter)
      .where(eq(familyRevCounter.familyId, familyId));
    expect(counter?.rev).toBeGreaterThanOrEqual(3);
  });

  it("stores an optional photo with a growth record and restricts photo access", async () => {
    const path = `/api/children/${childId}/growth`;
    const id = createUuidV7();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const payload = {
      id,
      measuredAt: today,
      lengthMm: 610,
      photo: jpeg.toString("base64"),
    };
    const invalid = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send({
        ...payload,
        photo: Buffer.from("not a jpeg").toString("base64"),
      });
    expect(invalid.status).toBe(400);
    expect(
      await database
        .select()
        .from(growthMeasurement)
        .where(eq(growthMeasurement.id, id)),
    ).toHaveLength(0);

    const created = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id, hasPhoto: true });
    expect(created.body.photo).toBeUndefined();
    expect(
      (
        await database
          .select()
          .from(growthPhoto)
          .where(eq(growthPhoto.measurementId, id))
      )[0]?.data,
    ).toBe(payload.photo);

    const listed = await request(app).get(path).set(asUser(caregiverId));
    expect(listed.body.items).toContainEqual(
      expect.objectContaining({ id, hasPhoto: true }),
    );
    const photoPath = `${path}/${id}/photo`;
    const photo = await request(app).get(photoPath).set(asUser(caregiverId));
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toMatch(/^image\/jpeg/);
    expect(photo.headers["cache-control"]).toBe("private, no-store");
    expect(photo.body).toEqual(jpeg);
    expect((await request(app).get(photoPath)).status).toBe(401);
    expect(
      (await request(app).get(photoPath).set(asUser(outsiderId))).status,
    ).toBe(404);

    const updated = await request(app)
      .patch(`${path}/${id}`)
      .set(asUser(caregiverId))
      .send({ version: 1, measuredAt: today, lengthMm: 620, note: "updated" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      version: 2,
      lengthMm: 620,
      hasPhoto: true,
    });
    expect(
      (await request(app).get(photoPath).set(asUser(parentId))).body,
    ).toEqual(jpeg);
    expect(
      (
        await request(app)
          .delete(`${path}/${id}`)
          .set(asUser(parentId))
          .send({ version: 1 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch(`${path}/${id}`)
          .set(asUser(outsiderId))
          .send({ version: 2, measuredAt: today, lengthMm: 620 })
      ).status,
    ).toBe(404);

    const sync = await request(syncApp)
      .get(`/api/families/${familyId}/sync?since=0`)
      .set(asUser(caregiverId));
    const item = sync.body.items.find(
      (entry: { table: string; row: { id: string } }) =>
        entry.table === "growth_measurement" && entry.row.id === id,
    );
    expect(item.row.hasPhoto).toBe(true);
    expect(JSON.stringify(item)).not.toContain(payload.photo);
    const audits = await database
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, id));
    expect(audits[0]?.changes).not.toContain(payload.photo);

    const removed = await request(app)
      .delete(`${path}/${id}`)
      .set(asUser(parentId))
      .send({ version: 2 });
    expect(removed.status).toBe(204);
    expect(
      (await request(app).get(photoPath).set(asUser(caregiverId))).status,
    ).toBe(404);
    expect(
      await database
        .select()
        .from(growthPhoto)
        .where(eq(growthPhoto.measurementId, id)),
    ).toHaveLength(0);
  });

  it("enforces the stored photo and request size limits", async () => {
    const path = `/api/children/${childId}/growth`;
    const bytes = Buffer.alloc(MAX_GROWTH_PHOTO_BYTES);
    bytes.set([0xff, 0xd8, 0xff], 0);
    bytes.set([0xff, 0xd9], bytes.length - 2);
    const base = { id: createUuidV7(), measuredAt: today, lengthMm: 610 };
    const accepted = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send({ ...base, photo: bytes.toString("base64") });
    expect(accepted.status).toBe(201);
    const oversized = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send({
        ...base,
        id: createUuidV7(),
        photo: Buffer.concat([bytes, Buffer.from([0])]).toString("base64"),
      });
    expect(oversized.status).toBe(400);
    const tooLarge = await request(app)
      .post(path)
      .set(asUser(parentId))
      .send({ ...base, photo: "A".repeat(530_000) });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe("TOO_LARGE");
  });

  it("tracks vaccine completion and regenerates only unfinished option doses", async () => {
    const initial = await request(app)
      .get(`/api/children/${childId}/vaccines`)
      .set(asUser(parentId));
    const firstDose = initial.body.items.find(
      (item: { definitionId: string }) =>
        item.definitionId === "idai2024_dtp_1",
    );
    expect(firstDose).toBeTruthy();

    const completed = await request(app)
      .patch(`/api/children/${childId}/vaccines/${firstDose.id}`)
      .set(asUser(parentId))
      .send({
        action: "mark_done",
        version: firstDose.version,
        givenDate: today,
      });
    expect(completed.status).toBe(200);
    expect(completed.body.givenDate).toBe(today);
    expect(completed.body.statusOverride).toBeNull();

    const changedOption = await request(app)
      .put(`/api/children/${childId}/vaccine-options`)
      .set(asUser(caregiverId))
      .send({ group: "DTP_SCHEDULE", value: "2-4-6" });
    expect(changedOption.status).toBe(200);
    expect(changedOption.body.optionValue).toBe("2-4-6");
    const afterSwitch = await request(app)
      .get(`/api/children/${childId}/vaccines`)
      .set(asUser(parentId));
    expect(afterSwitch.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definitionId: "idai2024_dtp_2_246",
          dueDate: expect.any(String),
        }),
        expect.objectContaining({
          definitionId: "idai2024_dtp_1",
          status: "done",
        }),
      ]),
    );
    expect(
      afterSwitch.body.items.some(
        (item: { definitionId: string | null }) =>
          item.definitionId === "idai2024_dtp_2_234",
      ),
    ).toBe(false);
    const deletedAlternatives = await database
      .select({ id: childVaccine.id })
      .from(childVaccine)
      .where(
        and(
          eq(childVaccine.childId, childId),
          eq(childVaccine.definitionId, "idai2024_dtp_2_234"),
          isNull(childVaccine.givenDate),
          isNull(childVaccine.deletedAt),
        ),
      );
    expect(deletedAlternatives).toHaveLength(0);

    const custom = await request(app)
      .post(`/api/children/${childId}/vaccines`)
      .set(asUser(parentId))
      .send({
        name: "Travel vaccine",
        doseLabel: "Travel 1",
        dueDate: today,
        windowEndDate: today,
      });
    expect(custom.status).toBe(201);
    expect(custom.body.customName).toBe("Travel vaccine");
    expect(custom.body.isCustom).toBe(true);
  });

  it("updates milestones for members and excludes other families", async () => {
    const denied = await request(app)
      .get(`/api/children/${childId}/milestones`)
      .set(asUser(outsiderId));
    expect(denied.status).toBe(404);

    const list = await request(app)
      .get(`/api/children/${childId}/milestones`)
      .set(asUser(parentId));
    const milestone = list.body.items[0] as {
      id: string;
      version: number;
    };
    const updated = await request(app)
      .patch(`/api/children/${childId}/milestones/${milestone.id}`)
      .set(asUser(caregiverId))
      .send({
        version: milestone.version,
        achieved: true,
        achievedOn: today,
        note: "Observed at home",
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      achieved: true,
      achievedOn: today,
      version: milestone.version + 1,
      updatedBy: caregiverId,
    });
  });

  it("computes milk target from recent weight and returns wake-window guidance", async () => {
    const weightDate = daysAgo(1);
    await database.insert(growthMeasurement).values({
      id: createUuidV7(),
      familyId,
      childId,
      measuredAt: weightDate,
      weightG: 5000,
      createdBy: parentId,
      updatedBy: parentId,
      createdAt: now,
      updatedAt: now,
    });
    const summary = await request(app)
      .get(`/api/children/${childId}/health-summary`)
      .set(asUser(parentId));
    expect(summary.status).toBe(200);
    expect(summary.body.milkTarget).toMatchObject({
      targetMl: 750,
      weightG: 5000,
      weightMeasuredAt: weightDate,
      feedsPerDay: 8,
      disclaimer: expect.stringContaining("dokter"),
    });
    expect(summary.body.wakeWindow).toMatchObject({
      windowMinMinutes: 35,
      windowMaxMinutes: 60,
      suggestedStart: null,
    });
  });
});
