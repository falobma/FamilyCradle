import { randomUUID } from "node:crypto";
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
  schema,
  user,
  userProfile,
} from "../db/schema.js";
import { createUuidV7 } from "../ids.js";
import { createHealthRouter } from "./health.js";

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
