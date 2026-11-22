import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { toNodeHandler } from "better-auth/node";
import pino from "pino";
import request from "supertest";
import { Resend } from "resend";
import { createAuth } from "./auth.js";
import { readEnvironment } from "./config.js";
import { createApp } from "./app.js";
import { schema, user, userProfile } from "./db/schema.js";
import { createUserProfile } from "./db/user-profile.js";
import { requireSession } from "./middleware/require-session.js";

const environment = readEnvironment({
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "a-development-secret-that-is-at-least-32-bytes",
  TURSO_DATABASE_URL: "libsql://familycradle-dev-example.turso.io",
  TURSO_AUTH_TOKEN: "development-token",
  RESEND_API_KEY: "re_development_key",
  EMAIL_FROM: "FamilyCradle <no-reply@example.com>",
  INTERNAL_JOB_AUDIENCE: "https://example.com/internal/jobs",
  INTERNAL_JOB_SA_EMAIL:
    "familycradle-scheduler@example-project.iam.gserviceaccount.com",
});

const client = createClient({ url: "file::memory:" });
const database = drizzle(client, { schema });
const logger = pino({ level: "silent" });
const resend = new Resend("re_test");
const auth = createAuth(environment, database, resend, logger);
const app = createApp({
  apiAuthMiddleware: requireSession(auth),
  authHandler: toNodeHandler(auth),
  checkDatabase: async () => undefined,
  logger,
});

beforeAll(async () => {
  await migrate(database, {
    migrationsFolder: fileURLToPath(
      new URL("./db/migrations", import.meta.url),
    ),
  });
  await client.execute("SELECT 1 FROM auth_email_rate_limit LIMIT 1");
});

afterAll(async () => {
  await client.close();
});

describe("authentication rate limits", () => {
  it("requires a valid session for non-auth API routes", async () => {
    const response = await request(app).get("/api/private");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
      },
    });
  });

  it("requires consent and eligibility confirmations before sign-up", async () => {
    const response = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", environment.APP_URL)
      .send({
        name: "Parent",
        email: "parent@example.com",
        password: "A-strong-password-123",
        termsAccepted: false,
        privacyAccepted: false,
        adultConfirmed: false,
        authorizedCaregiver: false,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/confirmations are required/);
  });

  it("records accepted policy details when initializing the user profile", async () => {
    const acceptedAt = new Date("2026-01-02T03:04:05.000Z");
    const id = "profile-user";
    await database.insert(user).values({
      id,
      name: "Parent One",
      email: "profile-parent@example.com",
      emailVerified: false,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: acceptedAt,
      tosVersion: "terms-1/privacy-1",
    });

    await createUserProfile(
      database,
      {
        id,
        name: "Parent One",
        tosAcceptedAt: acceptedAt,
        tosVersion: "terms-1/privacy-1",
      },
      "id-ID",
    );

    const [profile] = await database
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, id));
    expect(profile).toMatchObject({
      displayName: "Parent One",
      language: "id",
      tosAcceptedAt: acceptedAt.toISOString(),
      tosVersion: "terms-1/privacy-1",
    });
  });

  it("limits sign-in by the IP and normalized email pair", async () => {
    const signIn = (email: string) =>
      request(app)
        .post("/api/auth/sign-in/email")
        .set("Origin", environment.APP_URL)
        .send({ email, password: "incorrect-password" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn("parent@example.com")).status).not.toBe(429);
    }

    expect((await signIn("parent@example.com")).status).toBe(429);
    expect((await signIn("another@example.com")).status).not.toBe(429);
  });

  it("limits password reset requests by normalized email", async () => {
    const requestReset = (email: string) =>
      request(app)
        .post("/api/auth/request-password-reset")
        .set("Origin", environment.APP_URL)
        .send({ email });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await requestReset("parent@example.com")).status).not.toBe(429);
    }

    expect((await requestReset("PARENT@example.com")).status).toBe(429);
    expect((await requestReset("another@example.com")).status).not.toBe(429);
  });
});
