import { describe, expect, it } from "vitest";
import { readEnvironment } from "./config.js";

const validEnvironment = {
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
};

describe("server environment", () => {
  it("accepts a libSQL URL and ignores unrelated process variables", () => {
    const environment = readEnvironment({
      ...validEnvironment,
      PATH: "ignored",
    });

    expect(environment.TURSO_DATABASE_URL).toBe(
      "libsql://familycradle-dev-example.turso.io",
    );
    expect(environment.PORT).toBe(8080);
  });

  it("rejects auth URLs that do not match the app origin", () => {
    expect(() =>
      readEnvironment({
        ...validEnvironment,
        BETTER_AUTH_URL: "http://localhost:8080",
      }),
    ).toThrow("Must match APP_URL");
  });

  it("requires trusted proxy ranges in production", () => {
    expect(() =>
      readEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow("At least one trusted proxy");
    expect(
      readEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        TRUSTED_PROXIES: "192.0.2.0/24",
      }).TRUSTED_PROXIES,
    ).toBe("192.0.2.0/24");
  });
});
