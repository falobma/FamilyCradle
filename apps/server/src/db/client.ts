import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Environment } from "../config.js";
import { schema } from "./schema.js";

export function createDatabase(environment: Environment) {
  const client = createClient({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
