import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { toNodeHandler } from "better-auth/node";
import pino from "pino";
import request from "supertest";
import { createAuth } from "./auth.js";
import { readEnvironment } from "./config.js";
import { createApp } from "./app.js";
import { schema, user, userProfile } from "./db/schema.js";
import { rateLimit } from "./db/auth-schema.js";
import { createUserProfile } from "./db/user-profile.js";
import { requireSession } from "./middleware/require-session.js";

const environment = readEnvironment({
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "a-development-secret-that-is-at-least-32-bytes",
  TURSO_DATABASE_URL: "libsql://familycradle-dev-example.turso.io",
  TURSO_AUTH_TOKEN: "development-token",
  SMTP_USER: "familycradle.sender@example.com",
  SMTP_APP_PASSWORD: "development-app-password",
  INTERNAL_JOB_AUDIENCE: "https://example.com/internal/jobs",
  INTERNAL_JOB_SA_EMAIL:
    "familycradle-scheduler@example-project.iam.gserviceaccount.com",
});

const databasePath = join(tmpdir(), `family-auth-${randomUUID()}.db`);
const client = createClient({
  url: `file:${databasePath.replaceAll("\\", "/")}`,
});
const database = drizzle(client, { schema });
const logger = pino({ level: "silent" });
const emailTransport = {
  sendMail: vi.fn(async () => ({ messageId: "test-message" })),
};
const auth = createAuth(environment, database, emailTransport, logger);
const app = createApp({
  appOrigin: environment.APP_URL,
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

  it("logs SMTP error codes without exposing provider messages", async () => {
    const emailLogger = pino({ level: "silent" });
    const logError = vi.spyOn(emailLogger, "error");
    const failingTransport = {
      sendMail: vi.fn(async () => {
        throw Object.assign(new Error("Sensitive provider details"), {
          code: "EAUTH",
        });
      }),
    };
    const emailAuth = createAuth(
      environment,
      database,
      failingTransport,
      emailLogger,
    );
    const emailApp = createApp({
      appOrigin: environment.APP_URL,
      authHandler: toNodeHandler(emailAuth),
      checkDatabase: async () => undefined,
      logger: emailLogger,
    });

    await database.insert(user).values({
      id: "email-test-user",
      name: "Email Test",
      email: "email-test@example.com",
      emailVerified: false,
      termsAccepted: true,
      privacyAccepted: true,
      adultConfirmed: true,
      authorizedCaregiver: true,
      tosAcceptedAt: new Date(),
      tosVersion: "terms-1/privacy-1",
    });

    const response = await request(emailApp)
      .post("/api/auth/send-verification-email")
      .set("Origin", environment.APP_URL)
      .send({ email: "email-test@example.com" });

    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(logError).toHaveBeenCalledWith(
        {
          provider: "gmail-smtp",
          code: "EAUTH",
          errorType: "Error",
        },
        "Authentication email delivery failed; the user can request another email",
      ),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(
      "Sensitive provider details",
    );
  });

  it("completes password recovery through the emailed app link", async () => {
    const sentMessages: Array<{
      from: string;
      to: string;
      subject: string;
      text: string;
    }> = [];
    const resetTransport = {
      sendMail: vi.fn(async (message: (typeof sentMessages)[number]) => {
        sentMessages.push(message);
        return { messageId: "reset-message" };
      }),
    };
    const resetAuth = createAuth(environment, database, resetTransport, logger);
    const resetApp = createApp({
      appOrigin: environment.APP_URL,
      authHandler: toNodeHandler(resetAuth),
      checkDatabase: async () => undefined,
      logger,
    });
    const signUpResponse = await request(resetApp)
      .post("/api/auth/sign-up/email")
      .set("Origin", environment.APP_URL)
      .send({
        name: "Reset User",
        email: "reset-user@example.com",
        password: "A-temporary-password-123",
        termsAccepted: true,
        privacyAccepted: true,
        adultConfirmed: true,
        authorizedCaregiver: true,
      });

    expect(signUpResponse.status).toBe(200);
    await database
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, "reset-user@example.com"));
    const resetRequest = await request(resetApp)
      .post("/api/auth/request-password-reset")
      .set("Origin", environment.APP_URL)
      .send({
        email: "reset-user@example.com",
        redirectTo: `${environment.APP_URL}/reset-password`,
      });

    expect(resetRequest.status).toBe(200);
    expect(resetRequest.body.message).toMatch(/If this email exists/);
    await vi.waitFor(() =>
      expect(
        sentMessages.some((message) => message.subject.includes("Reset")),
      ).toBe(true),
    );
    const resetEmail = sentMessages.find((message) =>
      message.subject.includes("Reset"),
    );
    expect(resetEmail?.from).toBe(
      "FamilyCradle <familycradle.sender@example.com>",
    );
    const link = new URL(resetEmail!.text.split("\n").at(-1)!);
    expect(link.pathname).toMatch(/\/api\/auth\/reset-password\/.+/);
    const callback = await request(resetApp).get(
      `${link.pathname}${link.search}`,
    );
    expect(callback.status).toBe(302);
    const resetPage = new URL(callback.headers.location!, environment.APP_URL);
    expect(resetPage.pathname).toBe("/reset-password");
    const token = resetPage.searchParams.get("token");
    expect(token).toBeTruthy();

    const resetResponse = await request(resetApp)
      .post("/api/auth/reset-password")
      .set("Origin", environment.APP_URL)
      .send({ token, newPassword: "A-new-password-456" });
    expect(resetResponse.status).toBe(200);

    const signInResponse = await request(resetApp)
      .post("/api/auth/sign-in/email")
      .set("Origin", environment.APP_URL)
      .send({
        email: "reset-user@example.com",
        password: "A-new-password-456",
      });
    expect(signInResponse.status).toBe(200);
  });

  it("limits sign-in by the IP and normalized email pair", async () => {
    const signIn = (email: string) =>
      request(app)
        .post("/api/auth/sign-in/email")
        .set("Origin", environment.APP_URL)
        .send({ email, password: "incorrect-password" });

    for (let attempt = 0; attempt < 15; attempt += 1) {
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

  it("limits verification email requests by normalized email", async () => {
    const requestVerification = (email: string) =>
      request(app)
        .post("/api/auth/send-verification-email")
        .set("Origin", environment.APP_URL)
        .send({ email });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await database.delete(rateLimit);
      expect((await requestVerification("verify@example.com")).status).toBe(
        200,
      );
    }

    await database.delete(rateLimit);
    expect((await requestVerification("VERIFY@example.com")).status).toBe(429);
    await database.delete(rateLimit);
    expect((await requestVerification("other@example.com")).status).toBe(200);
  });
});
