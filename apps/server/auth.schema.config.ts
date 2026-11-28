import "dotenv/config";
import pino from "pino";
import { readEnvironment } from "./src/config.js";
import { createDatabase } from "./src/db/client.js";
import { createAuth } from "./src/auth.js";
import { createEmailTransport } from "./src/email.js";

const environment = readEnvironment();
const database = createDatabase(environment);

export const auth = createAuth(
  environment,
  database.db,
  createEmailTransport(environment),
  pino({ level: "silent" }),
);
