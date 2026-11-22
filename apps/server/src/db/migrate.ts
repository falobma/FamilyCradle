import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { loadEnvironmentFile, readEnvironment } from "../config.js";
import { createDatabase } from "./client.js";
import { schema } from "./schema.js";

loadEnvironmentFile();
const environment = readEnvironment();
const { client } = createDatabase(environment);
const database = drizzle(client, { schema });

try {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  });
} finally {
  client.close();
}
