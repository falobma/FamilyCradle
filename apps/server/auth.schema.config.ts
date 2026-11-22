import "dotenv/config";
import pino from "pino";
import { Resend } from "resend";
import { readEnvironment } from "./src/config.js";
import { createDatabase } from "./src/db/client.js";
import { createAuth } from "./src/auth.js";

const environment = readEnvironment();
const database = createDatabase(environment);

export const auth = createAuth(
  environment,
  database.db,
  new Resend(environment.RESEND_API_KEY),
  pino({ level: "silent" }),
);
