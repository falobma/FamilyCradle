import { createHash } from "node:crypto";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { betterAuth } from "better-auth";
import { haveIBeenPwned } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { lte, sql } from "drizzle-orm";
import type { Resend } from "resend";
import type { Logger } from "pino";
import type { Environment } from "./config.js";
import type { createDatabase } from "./db/client.js";
import { authEmailRateLimit, familyAuthSchema } from "./db/schema.js";
import { createUserProfile } from "./db/user-profile.js";

type Database = ReturnType<typeof createDatabase>["db"];
type SyntheticUserParameters = {
  coreFields: {
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  additionalFields: Record<string, unknown>;
  id: string;
};
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

function rateLimitKey(scope: string) {
  return createHash("sha256").update(scope).digest("hex");
}

type AuthEmailKind = "verification" | "password-reset";

function localizedEmail(
  kind: AuthEmailKind,
  url: string,
  acceptLanguage: string | null,
) {
  const isIndonesian = acceptLanguage?.toLowerCase().startsWith("id") ?? false;
  const messages = {
    verification: isIndonesian
      ? {
          subject: "Verifikasi email FamilyCradle",
          body: `Verifikasi alamat email Anda dengan membuka tautan ini:\n${url}`,
        }
      : {
          subject: "Verify your FamilyCradle email",
          body: `Verify your email address by opening this link:\n${url}`,
        },
    "password-reset": isIndonesian
      ? {
          subject: "Atur ulang kata sandi FamilyCradle",
          body: `Atur ulang kata sandi Anda dengan membuka tautan ini:\n${url}`,
        }
      : {
          subject: "Reset your FamilyCradle password",
          body: `Reset your password by opening this link:\n${url}`,
        },
  };

  return messages[kind];
}

export function createAuth(
  environment: Environment,
  database: Database,
  resend: Resend,
  logger: Logger,
) {
  async function sendAuthEmail(
    to: string,
    kind: AuthEmailKind,
    url: string,
    acceptLanguage: string | null,
  ) {
    const message = localizedEmail(kind, url, acceptLanguage);
    const { error } = await resend.emails.send({
      from: environment.EMAIL_FROM,
      to,
      subject: message.subject,
      text: message.body,
    });
    if (error) {
      logger.error(
        { provider: "resend", code: error.name, statusCode: error.statusCode },
        "Authentication email delivery failed; Resend rejected the request",
      );
    }
  }

  function dispatchAuthEmail(
    to: string,
    kind: AuthEmailKind,
    url: string,
    acceptLanguage: string | null,
  ) {
    void sendAuthEmail(to, kind, url, acceptLanguage).catch(
      (error: unknown) => {
        logger.error(
          { errorType: error instanceof Error ? error.name : "UnknownError" },
          "Authentication email delivery failed; the user can request another email",
        );
      },
    );
  }

  async function enforceEmailRateLimit(
    scope: string,
    max: number,
    windowSeconds: number,
  ) {
    const now = Date.now();
    const resetBefore = now - windowSeconds * 1000;
    await database
      .delete(authEmailRateLimit)
      .where(
        lte(authEmailRateLimit.windowStartedAt, now - RATE_LIMIT_RETENTION_MS),
      );

    const [result] = await database
      .insert(authEmailRateLimit)
      .values({
        key: rateLimitKey(scope),
        count: 1,
        windowStartedAt: now,
      })
      .onConflictDoUpdate({
        target: authEmailRateLimit.key,
        set: {
          count: sql`CASE WHEN ${authEmailRateLimit.windowStartedAt} <= ${resetBefore} THEN 1 ELSE ${authEmailRateLimit.count} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${authEmailRateLimit.windowStartedAt} <= ${resetBefore} THEN ${now} ELSE ${authEmailRateLimit.windowStartedAt} END`,
        },
      })
      .returning({ count: authEmailRateLimit.count });

    if (!result || result.count > max) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many authentication attempts. Try again later.",
      });
    }
  }

  return betterAuth({
    appName: "FamilyCradle",
    baseURL: environment.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.APP_URL],
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: familyAuthSchema,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      customSyntheticUser: ({
        coreFields,
        additionalFields,
        id,
      }: SyntheticUserParameters) => ({
        ...coreFields,
        ...additionalFields,
        termsAccepted: true,
        privacyAccepted: true,
        adultConfirmed: true,
        authorizedCaregiver: true,
        tosAcceptedAt: new Date(),
        tosVersion: "terms-1/privacy-1",
        id,
      }),
      sendResetPassword: async ({ user, url }, request) => {
        dispatchAuthEmail(
          user.email,
          "password-reset",
          url,
          request?.headers.get("accept-language") ?? null,
        );
      },
    },
    emailVerification: {
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }, request) => {
        dispatchAuthEmail(
          user.email,
          "verification",
          url,
          request?.headers.get("accept-language") ?? null,
        );
      },
    },
    user: {
      additionalFields: {
        termsAccepted: {
          type: "boolean",
          required: true,
          input: true,
          returned: false,
        },
        privacyAccepted: {
          type: "boolean",
          required: true,
          input: true,
          returned: false,
        },
        adultConfirmed: {
          type: "boolean",
          required: true,
          input: true,
          returned: false,
        },
        authorizedCaregiver: {
          type: "boolean",
          required: true,
          input: true,
          returned: false,
        },
        tosAcceptedAt: {
          type: "date",
          required: true,
          input: false,
          returned: false,
          defaultValue: () => new Date(),
        },
        tosVersion: {
          type: "string",
          required: true,
          input: false,
          returned: false,
          defaultValue: "terms-1/privacy-1",
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            if (!(user.tosAcceptedAt instanceof Date)) {
              throw new Error("Missing server-recorded terms acceptance time");
            }
            if (typeof user.tosVersion !== "string") {
              throw new Error("Missing server-recorded terms version");
            }

            await createUserProfile(
              database,
              {
                id: user.id,
                name: user.name,
                tosAcceptedAt: user.tosAcceptedAt,
                tosVersion: user.tosVersion,
              },
              context?.request?.headers.get("accept-language") ?? null,
            );
          },
        },
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 60 * 60,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 5 * 60,
      max: 300,
      customRules: {
        "/sign-up/email": {
          window: 60 * 60,
          max: 5,
        },
        "/sign-in/email": false,
        "/request-password-reset": false,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === "/sign-up/email") {
          if (
            context.body?.termsAccepted !== true ||
            context.body?.privacyAccepted !== true ||
            context.body?.adultConfirmed !== true ||
            context.body?.authorizedCaregiver !== true
          ) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Terms, privacy, age, and caregiver confirmations are required.",
            });
          }
          if (
            typeof context.body.name !== "string" ||
            context.body.name.trim().length < 1 ||
            context.body.name.trim().length > 40
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Display name must be between 1 and 40 characters.",
            });
          }
          return;
        }

        if (
          context.path !== "/sign-in/email" &&
          context.path !== "/request-password-reset" &&
          context.path !== "/send-verification-email"
        ) {
          return;
        }

        const email =
          typeof context.body?.email === "string"
            ? context.body.email.trim().toLowerCase()
            : "";
        const ipAddress = context.request
          ? getIP(context.request, context.context.options)
          : null;

        if (context.path === "/sign-in/email") {
          await enforceEmailRateLimit(
            `sign-in:${ipAddress ?? "unknown"}:${email}`,
            5,
            15 * 60,
          );
          return;
        }

        const scope =
          context.path === "/send-verification-email"
            ? "verification-email"
            : "password-reset";
        await enforceEmailRateLimit(
          `${scope}:${email || ipAddress || "unknown"}`,
          3,
          60 * 60,
        );
      }),
    },
    advanced: {
      useSecureCookies: environment.NODE_ENV === "production",
      ipAddress: {
        trustedProxies: environment.TRUSTED_PROXIES.split(",")
          .map((proxy) => proxy.trim())
          .filter(Boolean),
      },
    },
    plugins: [haveIBeenPwned()],
  });
}
