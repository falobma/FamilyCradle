import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.TURSO_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "TURSO_DATABASE_URL is required for Drizzle schema generation.",
  );
}

export default defineConfig({
  schema: "./apps/server/src/db/schema.ts",
  out: "./apps/server/src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
