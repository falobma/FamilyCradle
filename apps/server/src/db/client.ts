import { createClient } from "@libsql/client";
import type { Environment } from "../config.js";

export function createDatabase(environment: Environment) {
  return createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
  });
}
