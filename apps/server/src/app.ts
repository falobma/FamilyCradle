import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import type { Router } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  apiAuthMiddleware?: RequestHandler;
  apiRouter?: Router;
  authHandler?: RequestHandler;
  isProduction?: boolean;
  logger?: Logger;
  trustedProxies?: string[];
}

export function createApp({
  checkDatabase,
  apiAuthMiddleware,
  apiRouter,
  authHandler,
  isProduction = false,
  logger,
  trustedProxies = [],
}: AppDependencies) {
  const app = express();
  if (trustedProxies.length > 0) {
    app.set("trust proxy", trustedProxies);
  }
  const requestLoggerOptions = {
    serializers: {
      req: (request: IncomingMessage) => ({
        method: request.method,
        url: request.url?.split("?")[0],
      }),
    },
  };

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
  app.use(
    logger
      ? pinoHttp({ ...requestLoggerOptions, logger })
      : pinoHttp(requestLoggerOptions),
  );
  if (authHandler) {
    app.all("/api/auth/*", authHandler);
  }
  app.use(express.json({ limit: "100kb", strict: true }));
  if (apiAuthMiddleware) {
    app.use("/api", apiAuthMiddleware);
  }
  if (apiRouter) {
    app.use("/api", apiRouter);
  }

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

  app.use((request, response, next) => {
    if (request.path !== "/api" && !request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found.",
      },
    });
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

  app.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }

      const invalidJson =
        error instanceof SyntaxError &&
        "status" in error &&
        error.status === 400;
      request.log.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Unhandled request error",
      );
      response.status(invalidJson ? 400 : 500).json({
        error: {
          code: invalidJson ? "VALIDATION_ERROR" : "INTERNAL",
          message: invalidJson
            ? "Request body must be valid JSON."
            : "An unexpected error occurred.",
        },
      });
    },
  );

  return app;
}
