import { Resend } from "resend";
import { toNodeHandler } from "better-auth/node";
import pino from "pino";
import { Router } from "express";
import { createAuth } from "./auth.js";
import { loadEnvironmentFile, readEnvironment } from "./config.js";
import { createApp } from "./app.js";
import { createDatabase } from "./db/client.js";
import { requireSession } from "./middleware/require-session.js";
import { createFamilyRouter } from "./routes/families.js";
import { createLogRouter } from "./routes/logs.js";
import { createHealthRouter } from "./routes/health.js";
import { createSyncRouter } from "./routes/sync.js";

loadEnvironmentFile();
const environment = readEnvironment();
const logger = pino({ level: environment.LOG_LEVEL });
const database = createDatabase(environment);
const auth = createAuth(
  environment,
  database.db,
  new Resend(environment.RESEND_API_KEY),
  logger,
);
const apiRouter = Router();
apiRouter.use(createFamilyRouter(database.db));
apiRouter.use(createLogRouter(database.db));
apiRouter.use(createHealthRouter(database.db));
apiRouter.use(createSyncRouter(database.db));
const app = createApp({
  apiAuthMiddleware: requireSession(auth),
  apiRouter,
  authHandler: toNodeHandler(auth),
  logger,
  trustedProxies: environment.TRUSTED_PROXIES.split(",")
    .map((proxy) => proxy.trim())
    .filter(Boolean),
  checkDatabase: async () => {
    await database.db.run("SELECT 1");
  },
  isProduction: environment.NODE_ENV === "production",
});

const server = app.listen(environment.PORT, () => {
  logger.info({ port: environment.PORT }, "FamilyCradle API listening");
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    database.client.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
