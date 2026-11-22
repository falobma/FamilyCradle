import type { createDatabase } from "./client.js";
import { userProfile } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];

interface ProfileSource {
  id: string;
  name: string;
  tosAcceptedAt: Date;
  tosVersion: string;
}

export async function createUserProfile(
  database: Database,
  user: ProfileSource,
  acceptLanguage: string | null,
) {
  const language = acceptLanguage?.toLowerCase().startsWith("id") ? "id" : "en";

  await database.insert(userProfile).values({
    userId: user.id,
    displayName: user.name,
    language,
    tosAcceptedAt: user.tosAcceptedAt.toISOString(),
    tosVersion: user.tosVersion,
  });
}
