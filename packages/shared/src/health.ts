import { z } from "zod";

export const HealthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.valueOf()) &&
      date.toISOString().slice(0, 10) === value
    );
  });

const GrowthMeasurementFields = z.strictObject({
  measuredAt: HealthDateSchema,
  weightG: z.number().int().min(400).max(25_000).nullable().optional(),
  lengthMm: z.number().int().min(300).max(1_100).nullable().optional(),
  headCircMm: z.number().int().min(200).max(550).nullable().optional(),
  place: z
    .enum(["home", "posyandu", "clinic_doctor", "hospital", "other"])
    .nullable()
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

function requireGrowthValue(
  value: z.infer<typeof GrowthMeasurementFields>,
  context: z.RefinementCtx,
) {
  if (
    (value.weightG === undefined || value.weightG === null) &&
    (value.lengthMm === undefined || value.lengthMm === null) &&
    (value.headCircMm === undefined || value.headCircMm === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["weightG"],
      message: "At least one measurement is required.",
    });
  }
}

export const CreateGrowthMeasurementSchema = GrowthMeasurementFields.extend({
  id: z.uuid(),
  confirmLargeChange: z.boolean().optional(),
}).superRefine(requireGrowthValue);
export const UpdateGrowthMeasurementSchema = GrowthMeasurementFields.extend({
  version: z.number().int().min(1),
  confirmLargeChange: z.boolean().optional(),
}).superRefine(requireGrowthValue);

export const CreateCustomVaccineSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    doseLabel: z.string().trim().min(1).max(60),
    dueDate: HealthDateSchema,
    windowEndDate: HealthDateSchema,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.windowEndDate < value.dueDate) {
      context.addIssue({
        code: "custom",
        path: ["windowEndDate"],
        message: "Window end date cannot be before the due date.",
      });
    }
  });

export const UpdateVaccineSchema = z
  .strictObject({
    action: z.enum([
      "mark_done",
      "undo_done",
      "skip",
      "undo_skip",
      "reschedule",
      "follow_optional",
    ]),
    version: z.number().int().min(1),
    givenDate: HealthDateSchema.optional(),
    givenPlace: z.string().trim().max(80).nullable().optional(),
    batchNumber: z.string().trim().max(80).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    dueDate: HealthDateSchema.optional(),
    windowEndDate: HealthDateSchema.optional(),
    followOptional: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.action === "reschedule" &&
      (!value.dueDate || !value.windowEndDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Both dates are required when rescheduling.",
      });
    }
    if (
      value.action === "reschedule" &&
      value.dueDate &&
      value.windowEndDate &&
      value.windowEndDate < value.dueDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["windowEndDate"],
        message: "Window end date cannot be before the due date.",
      });
    }
    if (
      value.action === "follow_optional" &&
      value.followOptional === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["followOptional"],
        message: "A follow choice is required.",
      });
    }
  });

export const SetVaccineOptionsSchema = z
  .strictObject({
    group: z.enum(["DTP_SCHEDULE", "ROTA_PRODUCT"]),
    value: z.string().trim().min(1).max(16),
  })
  .superRefine((value, context) => {
    const validValues =
      value.group === "DTP_SCHEDULE" ? ["2-3-4", "2-4-6"] : ["RV1", "RV5"];
    if (!validValues.includes(value.value)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Option is not valid for this vaccine group.",
      });
    }
  });

export const UpdateMilestoneSchema = z
  .strictObject({
    achieved: z.boolean(),
    achievedOn: HealthDateSchema.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    version: z.number().int().min(1),
  })
  .superRefine((value, context) => {
    if (!value.achieved && value.achievedOn) {
      context.addIssue({
        code: "custom",
        path: ["achievedOn"],
        message: "An unchecked milestone cannot have an achievement date.",
      });
    }
  });

export function parseLocalizedDecimal(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
