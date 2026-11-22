import { eq, sql } from "drizzle-orm";
import type { createDatabase } from "../db/client.js";
import {
  child,
  childMilestone,
  childVaccine,
  childVaccineOption,
  familyRevCounter,
  milestoneDefinition,
  vaccineDefinition,
} from "../db/schema.js";
import { createUuidV7 } from "../ids.js";
import { ensureHealthDefinitions } from "./definitions.js";
import { addOffset, vaccineDefinitionsForOptions } from "./rules.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ChildProfile = {
  id: string;
  familyId: string;
  dateOfBirth: string;
};

export async function createChildHealthRecords(
  transaction: Transaction,
  child: ChildProfile,
  userId: string,
  now: string,
  rev: number,
) {
  const options = { DTP_SCHEDULE: "2-3-4", ROTA_PRODUCT: "RV1" };
  await transaction.insert(childVaccineOption).values([
    {
      childId: child.id,
      optionGroup: "DTP_SCHEDULE",
      optionValue: options.DTP_SCHEDULE,
      updatedBy: userId,
      updatedAt: now,
    },
    {
      childId: child.id,
      optionGroup: "ROTA_PRODUCT",
      optionValue: options.ROTA_PRODUCT,
      updatedBy: userId,
      updatedAt: now,
    },
  ]);
  const definitions = await transaction
    .select()
    .from(vaccineDefinition)
    .where(eq(vaccineDefinition.scheduleVersion, "IDAI-2024"));
  const selectedDefinitions = vaccineDefinitionsForOptions(
    definitions,
    options,
  );
  await transaction.insert(childVaccine).values(
    selectedDefinitions.map((definition) => ({
      id: createUuidV7(),
      familyId: child.familyId,
      childId: child.id,
      definitionId: definition.id,
      vaccineCode: definition.vaccineCode,
      doseLabelId: definition.doseLabelId,
      doseLabelEn: definition.doseLabelEn,
      category: definition.category,
      dueDate: addOffset(child.dateOfBirth, definition.dueOffset),
      windowEndDate: addOffset(child.dateOfBirth, definition.windowEndOffset),
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      rev,
    })),
  );

  const milestoneRows = await transaction.select().from(milestoneDefinition);
  if (milestoneRows.length > 0) {
    await transaction.insert(childMilestone).values(
      milestoneRows.map((definition) => ({
        id: createUuidV7(),
        familyId: child.familyId,
        childId: child.id,
        definitionId: definition.id,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
        rev,
      })),
    );
  }
}

export async function ensureExistingChildHealthRecords(
  database: Database,
  childId: string,
  userId: string,
  now: string,
) {
  await ensureHealthDefinitions(database);
  const [profile] = await database
    .select({
      id: child.id,
      familyId: child.familyId,
      dateOfBirth: child.dateOfBirth,
      gestationalAgeWeeks: child.gestationalAgeWeeks,
      gestationalAgeDays: child.gestationalAgeDays,
      deletedAt: child.deletedAt,
    })
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);
  if (!profile || profile.deletedAt) return;

  await database.transaction(async (transaction) => {
    const options = await transaction
      .select()
      .from(childVaccineOption)
      .where(eq(childVaccineOption.childId, childId));
    const defaults = {
      DTP_SCHEDULE: "2-3-4",
      ROTA_PRODUCT: "RV1",
    } as const;
    const selectedOptions: Record<string, string> = { ...defaults };
    for (const option of options) {
      selectedOptions[option.optionGroup] = option.optionValue;
    }
    const missingOptions = Object.entries(defaults).filter(
      ([group]) => !options.some((option) => option.optionGroup === group),
    );
    const [existingVaccine] = await transaction
      .select({ id: childVaccine.id })
      .from(childVaccine)
      .where(eq(childVaccine.childId, childId))
      .limit(1);
    const [existingMilestone] = await transaction
      .select({ id: childMilestone.id })
      .from(childMilestone)
      .where(eq(childMilestone.childId, childId))
      .limit(1);
    const vaccineRows = existingVaccine
      ? []
      : await transaction
          .select()
          .from(vaccineDefinition)
          .where(eq(vaccineDefinition.scheduleVersion, "IDAI-2024"));
    const milestoneRows = existingMilestone
      ? []
      : await transaction.select().from(milestoneDefinition);
    const selectedVaccineRows = vaccineDefinitionsForOptions(
      vaccineRows,
      selectedOptions,
    );
    const changed =
      missingOptions.length > 0 ||
      (!existingVaccine && selectedVaccineRows.length > 0) ||
      (!existingMilestone && milestoneRows.length > 0);
    if (!changed) return;

    const [counter] = await transaction
      .update(familyRevCounter)
      .set({ rev: sql`${familyRevCounter.rev} + 1` })
      .where(eq(familyRevCounter.familyId, profile.familyId))
      .returning({ rev: familyRevCounter.rev });
    if (!counter) throw new Error("Missing family revision counter.");
    const rev = counter.rev;

    if (missingOptions.length > 0) {
      const optionRows = missingOptions.map(([group, optionValue]) => ({
        childId,
        optionGroup: group as "DTP_SCHEDULE" | "ROTA_PRODUCT",
        optionValue,
        updatedBy: userId,
        updatedAt: now,
      }));
      await transaction.insert(childVaccineOption).values(optionRows);
    }
    if (!existingVaccine && selectedVaccineRows.length > 0) {
      await transaction.insert(childVaccine).values(
        selectedVaccineRows.map((definition) => ({
          id: createUuidV7(),
          familyId: profile.familyId,
          childId,
          definitionId: definition.id,
          vaccineCode: definition.vaccineCode,
          doseLabelId: definition.doseLabelId,
          doseLabelEn: definition.doseLabelEn,
          category: definition.category,
          dueDate: addOffset(profile.dateOfBirth, definition.dueOffset),
          windowEndDate: addOffset(
            profile.dateOfBirth,
            definition.windowEndOffset,
          ),
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
          rev,
        })),
      );
    }
    if (!existingMilestone && milestoneRows.length > 0) {
      await transaction.insert(childMilestone).values(
        milestoneRows.map((definition) => ({
          id: createUuidV7(),
          familyId: profile.familyId,
          childId,
          definitionId: definition.id,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
          rev,
        })),
      );
    }
  });
}
