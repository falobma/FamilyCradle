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

const HTTP_DATE_PRECISION_MS = 1000;

export function estimateServerClockOffsetMs(
  dateHeader: string | null,
  requestStartedAt: number,
  responseReceivedAt: number,
): number | null {
  if (
    dateHeader === null ||
    !Number.isFinite(requestStartedAt) ||
    !Number.isFinite(responseReceivedAt) ||
    responseReceivedAt < requestStartedAt
  ) {
    return null;
  }
  const serverTimestamp = Date.parse(dateHeader);
  if (!Number.isFinite(serverTimestamp)) return null;

  const roundTripMs = responseReceivedAt - requestStartedAt;
  const clientMidpoint = requestStartedAt + roundTripMs / 2;
  return serverTimestamp + HTTP_DATE_PRECISION_MS / 2 - clientMidpoint;
}

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const NoteSchema = z.string().trim().max(500).nullable().optional();
export const LogEntryDetailsSchemas = {
  bottle: z.strictObject({
    milkType: z.enum(["formula", "asip", "mixed"]),
    formulaBrand: z.string().trim().max(60).optional(),
    leftoverMl: z.number().int().min(0).max(400).optional(),
  }),
  breastfeed: z
    .strictObject({
      segments: z
        .array(
          z.strictObject({
            side: z.enum(["left", "right"]),
            startedAt: IsoDateTimeSchema,
            endedAt: IsoDateTimeSchema.optional(),
          }),
        )
        .optional(),
      leftSec: z.number().int().min(0).max(7200).optional(),
      rightSec: z.number().int().min(0).max(7200).optional(),
      lastSide: z.enum(["left", "right"]),
    })
    .superRefine((value, context) => {
      if (value.segments !== undefined) return;
      if (value.leftSec === undefined && value.rightSec === undefined) return;
      const total = (value.leftSec ?? 0) + (value.rightSec ?? 0);
      if (total < 1 || total > 7200) {
        context.addIssue({
          code: "custom",
          path: ["leftSec"],
          message: "Manual breastfeeding duration must be 1–120 minutes.",
        });
      }
    }),
  diaper: z.strictObject({
    kind: z.enum(["wet", "pup", "mixed", "dry"]),
    pupAmount: z.enum(["banyak", "sedang", "sedikit", "cepirit"]).optional(),
    consistency: z
      .enum(["cair", "lembek", "normal", "keras", "berbiji"])
      .optional(),
    color: z
      .enum([
        "kuning",
        "hijau",
        "coklat",
        "hitam",
        "merah",
        "pucat_putih",
        "lainnya",
      ])
      .optional(),
    rash: z.boolean().optional(),
  }),
  sleep: z.strictObject({
    category: z.enum(["nap", "night"]),
    location: z
      .enum(["crib", "cosleep", "contact", "stroller", "car", "swing", "other"])
      .optional(),
    fallAsleepMethod: z
      .enum(["self", "nursing", "bottle", "rocking", "pacifier", "other"])
      .optional(),
    quality: z.enum(["nyenyak", "gelisah", "sering_bangun"]).optional(),
    pauses: z
      .array(
        z.strictObject({
          startedAt: IsoDateTimeSchema,
          endedAt: IsoDateTimeSchema.optional(),
        }),
      )
      .optional(),
  }),
  mpasi: z
    .strictObject({
      mealType: z.enum(["sarapan", "makan_siang", "makan_malam", "selingan"]),
      texture: z.enum([
        "puree_halus",
        "saring_lumat",
        "cincang_halus",
        "cincang_kasar",
        "finger_food",
        "makanan_keluarga",
      ]),
      foodIds: z.array(UuidSchema).max(15).default([]),
      foodNames: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
      newFoodIds: z.array(UuidSchema).default([]),
      portionEaten: z
        .enum(["habis", "sebagian_besar", "setengah", "sedikit", "menolak"])
        .optional(),
      spoons: z.number().positive().optional(),
      reaction: z
        .strictObject({
          kind: z.enum([
            "none",
            "ruam",
            "muntah",
            "diare",
            "bengkak",
            "gatal",
            "lainnya",
          ]),
          foodIds: z.array(UuidSchema).optional(),
          note: z.string().max(300).optional(),
        })
        .optional(),
    })
    .superRefine((value, context) => {
      if (value.foodIds.length === 0 && !value.foodNames?.length) {
        context.addIssue({
          code: "custom",
          path: ["foodIds"],
          message: "At least one food is required.",
        });
      }
    }),
  pumping: z.strictObject({
    sideMode: z.enum(["combined", "separate"]),
    leftMl: z.number().int().min(0).max(1000).optional(),
    rightMl: z.number().int().min(0).max(1000).optional(),
    pumpedBy: z.string().optional(),
  }),
  medicine: z.strictObject({
    name: z.string().trim().min(1).max(60),
    dose: z.number().positive(),
    unit: z.enum([
      "ml",
      "mg",
      "tetes",
      "tablet",
      "sachet",
      "puff",
      "oles",
      "lainnya",
    ]),
    route: z
      .enum([
        "oral",
        "tetes_hidung",
        "tetes_mata",
        "tetes_telinga",
        "oles",
        "supositoria",
        "inhalasi",
        "lainnya",
      ])
      .optional(),
    reason: z.string().trim().max(100).optional(),
    nextDoseInHours: z.number().int().min(1).max(48).optional(),
  }),
};
export const LogDetailsSchema = z.union([
  LogEntryDetailsSchemas.bottle,
  LogEntryDetailsSchemas.breastfeed,
  LogEntryDetailsSchemas.diaper,
  LogEntryDetailsSchemas.sleep,
  LogEntryDetailsSchemas.mpasi,
  LogEntryDetailsSchemas.pumping,
  LogEntryDetailsSchemas.medicine,
]);
export const CreateLogEntrySchema = z.discriminatedUnion("type", [
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    childIds: z.array(UuidSchema).min(1).max(10).optional(),
    type: z.literal("bottle"),
    startedAt: IsoDateTimeSchema,
    amountMl: z.number().int().min(1).max(400),
    details: LogEntryDetailsSchemas.bottle,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    type: z.literal("breastfeed"),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.optional(),
    details: LogEntryDetailsSchemas.breastfeed,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    childIds: z.array(UuidSchema).min(1).max(10).optional(),
    type: z.literal("diaper"),
    startedAt: IsoDateTimeSchema,
    details: LogEntryDetailsSchemas.diaper,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    childIds: z.array(UuidSchema).min(1).max(10).optional(),
    type: z.literal("sleep"),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.optional(),
    details: LogEntryDetailsSchemas.sleep,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    childIds: z.array(UuidSchema).min(1).max(10).optional(),
    type: z.literal("mpasi"),
    startedAt: IsoDateTimeSchema,
    amountMl: z.number().int().min(0).optional(),
    details: LogEntryDetailsSchemas.mpasi,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: z.null().optional(),
    type: z.literal("pumping"),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.optional(),
    amountMl: z.number().int().min(0).max(2000),
    details: LogEntryDetailsSchemas.pumping,
    note: NoteSchema,
    source: z.enum(["manual", "quick"]).optional(),
  }),
  z.strictObject({
    id: UuidSchema,
    childId: UuidSchema,
    childIds: z.array(UuidSchema).min(1).max(10).optional(),
    type: z.literal("medicine"),
    startedAt: IsoDateTimeSchema,
    details: LogEntryDetailsSchemas.medicine,
    note: NoteSchema,
    batchId: UuidSchema.optional(),
    source: z.enum(["manual", "quick"]).optional(),
  }),
]);
export const UpdateLogEntrySchema = z.strictObject({
  version: z.number().int().min(1),
  startedAt: IsoDateTimeSchema.optional(),
  endedAt: IsoDateTimeSchema.nullable().optional(),
  amountMl: z.number().int().min(0).max(2000).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  note: NoteSchema,
});
export const CreateMpasiFoodSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  foodGroup: z
    .enum([
      "grain",
      "protein_animal",
      "protein_plant",
      "vegetable",
      "fruit",
      "dairy",
      "fat_oil",
      "other",
    ])
    .default("other"),
  isCommonAllergen: z.boolean().optional(),
});
export const UpdateMpasiFoodSchema = z.strictObject({
  reactionStatus: z.enum(["none", "suspected", "confirmed_avoid"]),
});

const FamilyNameSchema = z.string().trim().min(1).max(60);
const TimezoneSchema = z.string().trim().min(1).max(80);

export const CreateFamilySchema = z.strictObject({
  name: FamilyNameSchema,
  myRole: z.enum(["mom", "dad"]),
  timezone: TimezoneSchema.optional(),
});

export const UpdateFamilySchema = z
  .strictObject({
    name: FamilyNameSchema.optional(),
    timezone: TimezoneSchema.optional(),
    pumpingSideMode: z.enum(["combined", "separate"]).optional(),
    quickBottleMl: z
      .array(z.number().int().min(1).max(400))
      .min(1)
      .max(6)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const CreateInviteSchema = z.strictObject({
  targetRole: z.enum(["parent", "caregiver"]),
});

export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

export const PreviewInviteSchema = z.strictObject({ code: InviteCodeSchema });
export const RedeemInviteSchema = z.strictObject({
  code: InviteCodeSchema,
  role: z.enum(["mom", "dad"]).optional(),
});

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  })
  .refine((value) => value <= new Date().toISOString().slice(0, 10))
  .refine((value) => {
    const earliest = new Date();
    earliest.setUTCFullYear(earliest.getUTCFullYear() - 5);
    return value >= earliest.toISOString().slice(0, 10);
  });

const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const ChildProfileFields = z.strictObject({
  name: z.string().trim().min(1).max(60),
  nickname: z.string().trim().max(60).nullable().optional(),
  sex: z.enum(["male", "female"]),
  dateOfBirth: DateOnlySchema,
  timeOfBirth: TimeOfDaySchema.nullable().optional(),
  gestationalAgeWeeks: z.number().int().min(22).max(44).nullable().optional(),
  gestationalAgeDays: z.number().int().min(0).max(6).nullable().optional(),
  birthWeightG: z.number().int().min(400).max(7000),
  birthLengthMm: z.number().int().min(300).max(650).nullable().optional(),
  birthHeadCircMm: z.number().int().min(200).max(450).nullable().optional(),
  feedingMode: z.enum(["breastmilk", "formula", "mixed"]).default("mixed"),
  milkTargetMode: z.enum(["auto", "manual"]).default("auto"),
  milkTargetManualMl: z.number().int().min(100).max(1500).nullable().optional(),
  allergiesNote: z.string().trim().max(300).nullable().optional(),
  avatar: z.string().trim().min(1).max(40).default("initials"),
  color: z.string().trim().min(1).max(40).default("sage"),
  sortOrder: z.number().int().min(0).default(0),
});

function validateChildProfile(
  value: z.infer<typeof ChildProfileFields>,
  context: z.RefinementCtx,
) {
  if (
    value.gestationalAgeDays !== undefined &&
    value.gestationalAgeDays !== null &&
    (value.gestationalAgeWeeks === undefined ||
      value.gestationalAgeWeeks === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["gestationalAgeWeeks"],
      message: "Weeks are required when gestational days are provided.",
    });
  }
  if (
    value.milkTargetMode === "manual" &&
    (value.milkTargetManualMl === undefined ||
      value.milkTargetManualMl === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["milkTargetManualMl"],
      message: "A manual milk target is required in manual mode.",
    });
  }
  if (
    value.milkTargetMode === "auto" &&
    value.milkTargetManualMl !== undefined &&
    value.milkTargetManualMl !== null
  ) {
    context.addIssue({
      code: "custom",
      path: ["milkTargetManualMl"],
      message: "A manual milk target is only valid in manual mode.",
    });
  }
}

export const ChildProfileSchema =
  ChildProfileFields.superRefine(validateChildProfile);

export const UpdateChildProfileSchema = ChildProfileFields.partial()
  .extend({ version: z.number().int().min(1) })
  .strict();

export const ReorderChildrenSchema = z.strictObject({
  childIds: z.array(UuidSchema).min(1).max(10),
});

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

export * from "./health.ts";
