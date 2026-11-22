import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import pino from "pino";
import request from "supertest";
import { createApp } from "../app.js";
import {
  child,
  family,
  familyMember,
  familyRevCounter,
  logEntry,
  schema,
  user,
  userProfile,
} from "../db/schema.js";
import { createSyncRouter } from "./sync.js";

const userId = "019ac600-0000-7000-8000-000000000051";
const outsiderId = "019ac600-0000-7000-8000-000000000052";
const familyId = "019ac600-0000-7000-8000-000000000053";
const childId = "019ac600-0000-7000-8000-000000000054";
const now = new Date().toISOString();
const dbPath = join(tmpdir(), `family-sync-${randomUUID()}.db`);
const client = createClient({ url: `file:${dbPath.replaceAll("\\", "/")}` });
const db = drizzle(client, { schema });
const app = createApp({
  apiAuthMiddleware: (req, res, next) => {
    if (req.header("x-test-user"))
      res.locals.session = { user: { id: req.header("x-test-user") } };
    next();
  },
  apiRouter: createSyncRouter(db),
  checkDatabase: async () => undefined,
  logger: pino({ level: "silent" }),
});

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
      email: "sync-parent@example.com",
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
      email: "sync-outsider@example.com",
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
      userId: outsiderId,
      displayName: "Outsider",
      tosAcceptedAt: now,
      tosVersion: "test",
    },
  ]);
  await db.insert(family).values({
    id: familyId,
    name: "Family",
    timezone: "Asia/Jakarta",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    updatedBy: userId,
  });
  await db.insert(familyMember).values({
    id: "019ac600-0000-7000-8000-000000000055",
    familyId,
    userId,
    role: "mom",
    joinedAt: now,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    updatedBy: userId,
  });
  await db.insert(familyRevCounter).values({ familyId, rev: 502 });
  await db.insert(child).values({
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
  });
  await db.insert(logEntry).values(
    Array.from({ length: 501 }, (_, index) => ({
      id: `019ac600-0000-7000-8000-${(1000 + index).toString().padStart(12, "0")}`,
      familyId,
      childId,
      type: "diaper" as const,
      status: "completed" as const,
      startedAt: now,
      endedAt: now,
      details: "{}",
      source: "manual" as const,
      createdBy: userId,
      updatedBy: userId,
      version: 1,
      rev: index + 2,
      deletedAt: index === 0 ? now : null,
      createdAt: now,
      updatedAt: now,
    })),
  );
});

afterAll(async () => {
  await client.close();
});

describe("family delta sync", () => {
  it("validates the cursor and requires active family membership", async () => {
    const invalid = await request(app)
      .get(`/api/families/${familyId}/sync`)
      .query({ since: "nope" })
      .set("x-test-user", userId);
    expect(invalid.status).toBe(400);

    const forbidden = await request(app)
      .get(`/api/families/${familyId}/sync`)
      .query({ since: "0" })
      .set("x-test-user", outsiderId);
    expect(forbidden.status).toBe(404);
  });

  it("returns tombstones and pages changes without skipping revisions", async () => {
    const first = await request(app)
      .get(`/api/families/${familyId}/sync`)
      .query({ since: "1" })
      .set("x-test-user", userId);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(500);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.rev).toBe(501);
    expect(first.body.items[0]).toMatchObject({
      table: "log_entry",
      row: { rev: 2, deletedAt: now },
    });

    const second = await request(app)
      .get(`/api/families/${familyId}/sync`)
      .query({ since: String(first.body.rev) })
      .set("x-test-user", userId);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.rev).toBe(502);
  });
});
