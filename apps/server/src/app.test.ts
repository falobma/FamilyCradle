import { describe, expect, it, vi } from "vitest";
import type { RequestHandler } from "express";
import pino from "pino";
import request from "supertest";
import { createApp } from "./app.js";

const logger = pino({ level: "silent" });

describe("health endpoints", () => {
  it("mounts Better Auth before JSON body parsing", async () => {
    const authHandler: RequestHandler = (request, response) => {
      expect(request.body).toBeUndefined();
      response.status(200).json({ status: "auth" });
    };

    const response = await request(
      createApp({
        authHandler,
        checkDatabase: async () => undefined,
        logger,
      }),
    )
      .post("/api/auth/sign-up/email")
      .send({ email: "parent@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "auth" });
  });

  it("reports liveness without checking the database", async () => {
    const checkDatabase = vi.fn<() => Promise<void>>();
    const response = await request(createApp({ checkDatabase, logger })).get(
      "/healthz",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(Number.isFinite(Date.parse(response.headers.date ?? ""))).toBe(true);
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("uses the documented browser security headers in development", async () => {
    const response = await request(
      createApp({ checkDatabase: async () => undefined, logger }),
    ).get("/healthz");

    expect(response.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  it("reports readiness when the database check succeeds", async () => {
    const response = await request(
      createApp({ checkDatabase: async () => undefined, logger }),
    ).get("/readyz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });

  it("returns not ready when the database check fails", async () => {
    const response = await request(
      createApp({
        logger,
        checkDatabase: async () => {
          throw new Error("database unavailable");
        },
      }),
    ).get("/readyz");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready" });
  });

  it("returns a structured validation error for malformed JSON", async () => {
    const response = await request(
      createApp({ checkDatabase: async () => undefined, logger }),
    )
      .post("/api/example")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body must be valid JSON.",
      },
    });
  });
});
