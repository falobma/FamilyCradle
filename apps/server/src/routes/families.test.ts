import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import pino from "pino";
import request from "supertest";
import { createApp } from "../app.js";
import { auditLog, family, schema, user, userProfile } from "../db/schema.js";
import { createFamilyRouter } from "./families.js";

const parentId = "019ac600-0000-7000-8000-000000000001";
const secondUserId = "019ac600-0000-7000-8000-000000000002";
const databasePath = join(tmpdir(), `family-onboarding-${randomUUID()}.db`);
const client = createClient({
  url: `file:${databasePath.replaceAll("\\", "/")}`,
});
const database = drizzle(client, { schema });
const app = createApp({
  appOrigin: "http://localhost:5173",
  apiAuthMiddleware: (_request, response, next) => {
    _request.headers.origin ??= "http://localhost:5173";
    const userId = _request.header("x-test-user");
    if (userId) response.locals.session = { user: { id: userId } };
    next();
  },
  apiRouter: createFamilyRouter(database),
  checkDatabase: async () => undefined,
  logger: pino({ level: "silent" }),
});

beforeAll(async () => {
  await migrate(database, {
    migrationsFolder: fileURLToPath(
      new URL("../db/migrations", import.meta.url),
    ),
  });
  const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
  await database.insert(user).values([
    {
      id: parentId,
      name: "Parent",
      email: "parent@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: acceptedAt,
      tosVersion: "terms-1/privacy-1",
    },
    {
      id: secondUserId,
      name: "Caregiver",
      email: "caregiver@example.com",
      emailVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: acceptedAt,
      tosVersion: "terms-1/privacy-1",
    },
  ]);
  await database.insert(userProfile).values([
    {
      userId: parentId,
      displayName: "Parent",
      tosAcceptedAt: acceptedAt.toISOString(),
      tosVersion: "terms-1/privacy-1",
    },
    {
      userId: secondUserId,
      displayName: "Caregiver",
      tosAcceptedAt: acceptedAt.toISOString(),
      tosVersion: "terms-1/privacy-1",
    },
  ]);
});

afterAll(async () => {
  await client.close();
});

function asUser(userId: string) {
  return { "x-test-user": userId };
}

describe("family onboarding API", () => {
  it("creates a family with its creator as parent and enforces membership", async () => {
    const create = await request(app)
      .post("/api/families")
      .set(asUser(parentId))
      .send({ name: "Keluarga Pagi", myRole: "mom" });

    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({
      name: "Keluarga Pagi",
      myRole: "mom",
      timezone: "Asia/Jakarta",
    });

    const familyId = create.body.id as string;
    const familyDetails = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(parentId));
    expect(familyDetails.status).toBe(200);
    expect(familyDetails.body.members).toHaveLength(1);
    expect(familyDetails.body.members[0]).toMatchObject({
      role: "mom",
      isMe: true,
    });

    const hiddenFromNonMember = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(secondUserId));
    expect(hiddenFromNonMember.status).toBe(404);
  });

  it("creates hashed single-use invites and blocks caregiver administration", async () => {
    const [existingFamily] = await database
      .select({ id: userProfile.lastActiveFamilyId })
      .from(userProfile)
      .where(eq(userProfile.userId, parentId));
    const familyId = existingFamily?.id;
    expect(familyId).toBeTruthy();

    const created = await request(app)
      .post(`/api/families/${familyId}/invites`)
      .set(asUser(parentId))
      .send({ targetRole: "caregiver" });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
    );

    const activeInvites = await request(app)
      .get(`/api/families/${familyId}/invites`)
      .set(asUser(parentId));
    expect(activeInvites.status).toBe(200);
    expect(activeInvites.body.items[0]).not.toHaveProperty("code");
    expect(activeInvites.body.items[0]).not.toHaveProperty("codeHash");

    const preview = await request(app)
      .post("/api/invites/preview")
      .set(asUser(secondUserId))
      .send({ code: created.body.code });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      familyName: "Keluarga Pagi",
      targetRole: "caregiver",
    });

    const redeemed = await request(app)
      .post("/api/invites/redeem")
      .set(asUser(secondUserId))
      .send({ code: created.body.code });
    expect(redeemed.status).toBe(201);
    expect(redeemed.body).toMatchObject({
      familyId,
      role: "caregiver",
    });

    const replay = await request(app)
      .post("/api/invites/preview")
      .set(asUser(parentId))
      .send({ code: created.body.code });
    expect(replay.status).toBe(404);
    expect(replay.body.error.message).toBe(
      "Kode tidak valid atau sudah kedaluwarsa",
    );

    const forbidden = await request(app)
      .post(`/api/families/${familyId}/invites`)
      .set(asUser(secondUserId))
      .send({ targetRole: "parent" });
    expect(forbidden.status).toBe(403);
  });

  it("allows only parents to change AI consent and records each change", async () => {
    const [profile] = await database
      .select({ familyId: userProfile.lastActiveFamilyId })
      .from(userProfile)
      .where(eq(userProfile.userId, parentId));
    const familyId = profile?.familyId;
    expect(familyId).toBeTruthy();

    const path = `/api/families/${familyId}/ai-consent`;
    expect((await request(app).put(path).send({ enabled: true })).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .put(path)
          .set(asUser(secondUserId))
          .send({ enabled: true })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(path)
          .set(asUser("019ac600-0000-7000-8000-000000000099"))
          .send({ enabled: true })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(path)
          .set(asUser(parentId))
          .send({ enabled: "yes" })
      ).status,
    ).toBe(400);

    const before = await database
      .select()
      .from(family)
      .where(eq(family.id, familyId!))
      .get();
    expect(before?.aiConsent).toBe(false);
    const enabled = await request(app)
      .put(path)
      .set(asUser(parentId))
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({
      enabled: true,
      changedBy: parentId,
      changedAt: expect.any(String),
      version: before!.version + 1,
      rev: before!.rev + 1,
    });

    const repeated = await request(app)
      .put(path)
      .set(asUser(parentId))
      .send({ enabled: true });
    expect(repeated.body).toEqual(enabled.body);

    const withdrawn = await request(app)
      .put(path)
      .set(asUser(parentId))
      .send({ enabled: false });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body).toMatchObject({
      enabled: false,
      changedBy: parentId,
      version: enabled.body.version + 1,
      rev: enabled.body.rev + 1,
    });
    const audit = await database
      .select()
      .from(auditLog)
      .where(eq(auditLog.familyId, familyId!));
    expect(audit.map((item) => JSON.parse(item.changes))).toEqual([
      { aiConsent: true },
      { aiConsent: false },
    ]);
  });

  it("validates child profiles and supports parent-only soft-delete restore", async () => {
    const [activeFamily] = await database
      .select({ id: userProfile.lastActiveFamilyId })
      .from(userProfile)
      .where(eq(userProfile.userId, parentId));
    const familyId = activeFamily?.id;
    expect(familyId).toBeTruthy();

    const invalid = await request(app)
      .post(`/api/families/${familyId}/children`)
      .set(asUser(parentId))
      .send({
        name: "Baby",
        sex: "female",
        dateOfBirth: "2099-01-01",
        birthWeightG: 3400,
      });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post(`/api/families/${familyId}/children`)
      .set(asUser(parentId))
      .send({
        name: "Baby",
        sex: "female",
        dateOfBirth: "2025-01-01",
        birthWeightG: 3400,
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Baby",
      feedingMode: "mixed",
      milkTargetMode: "auto",
    });

    const invalidUpdate = await request(app)
      .patch(`/api/children/${created.body.id}`)
      .set(asUser(parentId))
      .send({ version: 1, milkTargetMode: "manual" });
    expect(invalidUpdate.status).toBe(400);

    const updated = await request(app)
      .patch(`/api/children/${created.body.id}`)
      .set(asUser(parentId))
      .send({ version: 1, name: "Baby One" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "Baby One", version: 2 });

    const staleUpdate = await request(app)
      .patch(`/api/children/${created.body.id}`)
      .set(asUser(parentId))
      .send({ version: 1, name: "Stale edit" });
    expect(staleUpdate.status).toBe(409);

    const caregiverEdit = await request(app)
      .patch(`/api/children/${created.body.id}`)
      .set(asUser(secondUserId))
      .send({ name: "Changed", version: 2 });
    expect(caregiverEdit.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/children/${created.body.id}`)
      .set(asUser(parentId));
    expect(deleted.status).toBe(204);

    const recentlyDeleted = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(parentId));
    expect(recentlyDeleted.body.role).toBe(recentlyDeleted.body.myRole);
    expect(["mom", "dad"]).toContain(recentlyDeleted.body.role);
    expect(recentlyDeleted.body.deletedChildren).toHaveLength(1);
    expect(recentlyDeleted.body.deletedChildren[0].id).toBe(created.body.id);

    const hiddenFromCaregiver = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(secondUserId));
    expect(hiddenFromCaregiver.body.deletedChildren).toEqual([]);

    const restored = await request(app)
      .post(`/api/children/${created.body.id}/restore`)
      .set(asUser(parentId));
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();

    const activeAgain = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(parentId));
    expect(activeAgain.body.children).toHaveLength(1);
    expect(activeAgain.body.deletedChildren).toEqual([]);
  });

  it("lets any member edit quick bottle shortcuts but keeps other settings parent-only", async () => {
    const [existingFamily] = await database
      .select({ id: userProfile.lastActiveFamilyId })
      .from(userProfile)
      .where(eq(userProfile.userId, parentId));
    const familyId = existingFamily?.id;
    expect(familyId).toBeTruthy();

    const caregiverShortcuts = await request(app)
      .patch(`/api/families/${familyId}`)
      .set(asUser(secondUserId))
      .send({ quickBottleMl: [50, 100, 150] });
    expect(caregiverShortcuts.status).toBe(200);

    const details = await request(app)
      .get(`/api/families/${familyId}`)
      .set(asUser(parentId));
    expect(details.body.quickBottleMl).toEqual([50, 100, 150]);

    const caregiverRename = await request(app)
      .patch(`/api/families/${familyId}`)
      .set(asUser(secondUserId))
      .send({ name: "Renamed by caregiver" });
    expect(caregiverRename.status).toBe(403);

    const tooMany = await request(app)
      .patch(`/api/families/${familyId}`)
      .set(asUser(parentId))
      .send({ quickBottleMl: [10, 20, 30, 40, 50, 60, 70] });
    expect(tooMany.status).toBe(400);
  });
});
