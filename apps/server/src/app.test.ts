import { describe, expect, it, vi } from "vitest";
import { Router } from "express";
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
        appOrigin: "http://localhost:5173",
        authHandler,
        checkDatabase: async () => undefined,
        logger,
      }),
    )
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:5173")
      .send({ email: "parent@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "auth" });
  });

  it("allows same-origin API mutations and rejects missing or foreign origins", async () => {
    const apiRouter = Router();
    apiRouter.post("/origin-check", (_request, response) => {
      response.status(204).end();
    });
    const app = createApp({
      appOrigin: "http://localhost:5173",
      apiRouter,
      checkDatabase: async () => undefined,
      logger,
    });

    const missingOrigin = await request(app).post("/api/origin-check");
    const foreignOrigin = await request(app)
      .post("/api/origin-check")
      .set("Origin", "https://attacker.example");
    const sameOrigin = await request(app)
      .post("/api/origin-check")
      .set("Origin", "http://localhost:5173");

    expect(missingOrigin.status).toBe(403);
    expect(foreignOrigin.status).toBe(403);
    expect(sameOrigin.status).toBe(204);
  });

  it("reports liveness without checking the database", async () => {
    const checkDatabase = vi.fn<() => Promise<void>>();
    const response = await request(
      createApp({
        appOrigin: "http://localhost:5173",
        checkDatabase,
        logger,
      }),
    ).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(Number.isFinite(Date.parse(response.headers.date ?? ""))).toBe(true);
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it("uses the documented browser security headers in development", async () => {
    const response = await request(
      createApp({
        appOrigin: "http://localhost:5173",
        checkDatabase: async () => undefined,
        logger,
      }),
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
      createApp({
        appOrigin: "http://localhost:5173",
        checkDatabase: async () => undefined,
        logger,
      }),
    ).get("/readyz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });

  it("returns not ready when the database check fails", async () => {
    const response = await request(
      createApp({
        appOrigin: "http://localhost:5173",
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
      createApp({
        appOrigin: "http://localhost:5173",
        checkDatabase: async () => undefined,
        logger,
      }),
    )
      .post("/api/example")
      .set("Origin", "http://localhost:5173")
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
