import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  isProduction?: boolean;
  logger?: Logger;
}

export function createApp({
  checkDatabase,
  isProduction = false,
  logger,
}: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      hsts: isProduction ? {} : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  app.use(logger ? pinoHttp({ logger }) : pinoHttp());
  app.use(express.json({ limit: "100kb", strict: true }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", async (request, response) => {
    try {
      await checkDatabase();
      response.status(200).json({ status: "ready" });
    } catch (error) {
      request.log.error({ err: error }, "Database readiness check failed");
      response.status(503).json({ status: "not_ready" });
    }
  });

  const webBuild = resolve(process.cwd(), "apps/web/dist");
  if (existsSync(webBuild)) {
    app.use(
      express.static(webBuild, {
        index: false,
        maxAge: isProduction ? "1y" : 0,
      }),
    );
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.sendFile(resolve(webBuild, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  return app;
}
