import { z } from "zod";

const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    APP_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    TRUSTED_PROXIES: z.string().default(""),
    TURSO_DATABASE_URL: z.url(),
    TURSO_AUTH_TOKEN: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    INTERNAL_JOB_AUDIENCE: z.string().min(1),
    INTERNAL_JOB_SA_EMAIL: z.email(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .refine(
    (environment) => environment.APP_URL === environment.BETTER_AUTH_URL,
    {
      path: ["BETTER_AUTH_URL"],
      message: "Must match APP_URL for same-origin authentication.",
    },
  )
  .refine(
    (environment) =>
      environment.NODE_ENV !== "production" ||
      environment.TRUSTED_PROXIES.split(",").some((proxy) => proxy.trim()),
    {
      path: ["TRUSTED_PROXIES"],
      message:
        "At least one trusted proxy IP or CIDR is required in production.",
    },
  );

export type Environment = z.infer<typeof EnvironmentSchema>;

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const parsed = EnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  return parsed.data;
}
