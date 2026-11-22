import "dotenv/config";
import pino from "pino";
import { readEnvironment } from "./config.js";
import { createApp } from "./app.js";
import { createDatabase } from "./db/client.js";

const environment = readEnvironment();
const logger = pino({ level: environment.LOG_LEVEL });
const database = createDatabase(environment);
const app = createApp({
  logger,
  checkDatabase: async () => {
    await database.execute("SELECT 1");
  },
  isProduction: environment.NODE_ENV === "production",
});

const server = app.listen(environment.PORT, () => {
  logger.info({ port: environment.PORT }, "FamilyCradle API listening");
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
