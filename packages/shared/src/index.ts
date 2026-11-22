import { z } from "zod";

export const LanguageSchema = z.enum(["id", "en", "mixed"]);
export type Language = z.infer<typeof LanguageSchema>;

export const FamilyRoleSchema = z.enum(["mom", "dad", "caregiver"]);
export type FamilyRole = z.infer<typeof FamilyRoleSchema>;

export const LogEntryTypeSchema = z.enum([
  "bottle",
  "breastfeed",
  "diaper",
  "sleep",
  "mpasi",
  "pumping",
  "medicine",
]);
export type LogEntryType = z.infer<typeof LogEntryTypeSchema>;

export const UuidSchema = z.uuid();

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "FORBIDDEN",
      "CONFLICT",
      "RATE_LIMITED",
      "UNAUTHENTICATED",
      "INTERNAL",
    ]),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
