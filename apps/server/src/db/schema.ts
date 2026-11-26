import {
  account,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema.js";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export {
  account,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};

export const userProfile = sqliteTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  language: text("language", { enum: ["id", "en", "mixed"] })
    .notNull()
    .default("id"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  nightMode: text("night_mode", { enum: ["auto", "on", "off"] })
    .notNull()
    .default("auto"),
  nightStart: text("night_start").notNull().default("19:00"),
  nightEnd: text("night_end").notNull().default("06:00"),
  lastActiveFamilyId: text("last_active_family_id"),
  lastActiveChildId: text("last_active_child_id"),
  tosAcceptedAt: text("tos_accepted_at").notNull(),
  tosVersion: text("tos_version").notNull(),
});

export const authEmailRateLimit = sqliteTable("auth_email_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
});

export const familyAuthSchema = {
  account,
  rateLimit,
  session,
  user,
  verification,
};

export const family = sqliteTable("family", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  pumpingSideMode: text("pumping_side_mode", {
    enum: ["combined", "separate"],
  })
    .notNull()
    .default("combined"),
  aiConsent: integer("ai_consent", { mode: "boolean" })
    .notNull()
    .default(false),
  aiConsentBy: text("ai_consent_by"),
  aiConsentAt: text("ai_consent_at"),
  quickBottleMl: text("quick_bottle_ml").notNull().default("[60,90,120,150]"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  version: integer("version").notNull().default(1),
  rev: integer("rev").notNull().default(1),
  deletedAt: text("deleted_at"),
  purgeAfter: text("purge_after"),
});

export const familyRevCounter = sqliteTable("family_rev_counter", {
  familyId: text("family_id")
    .primaryKey()
    .references(() => family.id, { onDelete: "cascade" }),
  rev: integer("rev").notNull().default(0),
});

export const logEntry = sqliteTable(
  "log_entry",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id").references(() => child.id, {
      onDelete: "cascade",
    }),
    type: text("type", {
      enum: [
        "bottle",
        "breastfeed",
        "diaper",
        "sleep",
        "mpasi",
        "pumping",
        "medicine",
      ],
    }).notNull(),
    status: text("status", { enum: ["completed", "running", "paused"] })
      .notNull()
      .default("completed"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    amountMl: integer("amount_ml"),
    durationSec: integer("duration_sec"),
    details: text("details").notNull(),
    note: text("note"),
    batchId: text("batch_id"),
    source: text("source", { enum: ["manual", "timer", "quick"] })
      .notNull()
      .default("manual"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("log_entry_family_rev_idx").on(table.familyId, table.rev),
    index("log_entry_child_type_started_idx").on(
      table.childId,
      table.type,
      table.startedAt,
    ),
    index("log_entry_child_started_idx").on(table.childId, table.startedAt),
    index("log_entry_family_type_status_idx").on(
      table.familyId,
      table.type,
      table.status,
    ),
    uniqueIndex("log_entry_one_running_child_timer")
      .on(table.childId, table.type)
      .where(
        sql`${table.status} IN ('running', 'paused') AND ${table.type} IN ('sleep', 'breastfeed') AND ${table.deletedAt} IS NULL`,
      ),
    uniqueIndex("log_entry_one_running_pump_per_user")
      .on(table.familyId, table.createdBy)
      .where(
        sql`${table.status} IN ('running', 'paused') AND ${table.type} = 'pumping' AND ${table.deletedAt} IS NULL`,
      ),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action", {
      enum: ["create", "update", "delete", "restore"],
    }).notNull(),
    changes: text("changes").notNull(),
    at: text("at").notNull(),
  },
  (table) => [
    index("audit_log_entity_idx").on(
      table.familyId,
      table.entityType,
      table.entityId,
      table.at,
    ),
  ],
);

export const mpasiFood = sqliteTable(
  "mpasi_food",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    foodGroup: text("food_group", {
      enum: [
        "grain",
        "protein_animal",
        "protein_plant",
        "vegetable",
        "fruit",
        "dairy",
        "fat_oil",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    isCommonAllergen: integer("is_common_allergen", { mode: "boolean" })
      .notNull()
      .default(false),
    firstIntroducedAt: text("first_introduced_at"),
    reactionStatus: text("reaction_status", {
      enum: ["none", "suspected", "confirmed_avoid"],
    })
      .notNull()
      .default("none"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("mpasi_food_child_name_unique").on(table.childId, table.name),
  ],
);

export const familyMember = sqliteTable(
  "family_member",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["mom", "dad", "caregiver"] }).notNull(),
    joinedAt: text("joined_at").notNull(),
    removedAt: text("removed_at"),
    removedBy: text("removed_by").references(() => user.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
  },
  (table) => [
    uniqueIndex("family_member_active_unique")
      .on(table.familyId, table.userId)
      .where(sql`${table.removedAt} IS NULL`),
    index("family_member_user_idx").on(table.userId, table.removedAt),
    index("family_member_family_idx").on(table.familyId, table.removedAt),
  ],
);

export const familyInvite = sqliteTable(
  "family_invite",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    targetRole: text("target_role", {
      enum: ["parent", "caregiver"],
    }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedBy: text("used_by").references(() => user.id),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("family_invite_family_idx").on(table.familyId, table.expiresAt),
  ],
);

export const inviteRateLimit = sqliteTable("invite_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
});

export const child = sqliteTable(
  "child",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nickname: text("nickname"),
    sex: text("sex", { enum: ["male", "female"] }).notNull(),
    dateOfBirth: text("date_of_birth").notNull(),
    timeOfBirth: text("time_of_birth"),
    gestationalAgeWeeks: integer("gestational_age_weeks"),
    gestationalAgeDays: integer("gestational_age_days"),
    birthWeightG: integer("birth_weight_g").notNull(),
    birthLengthMm: integer("birth_length_mm"),
    birthHeadCircMm: integer("birth_head_circ_mm"),
    feedingMode: text("feeding_mode", {
      enum: ["breastmilk", "formula", "mixed"],
    })
      .notNull()
      .default("mixed"),
    milkTargetMode: text("milk_target_mode", { enum: ["auto", "manual"] })
      .notNull()
      .default("auto"),
    milkTargetManualMl: integer("milk_target_manual_ml"),
    allergiesNote: text("allergies_note"),
    avatar: text("avatar").notNull().default("initials"),
    color: text("color").notNull().default("sage"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    deletedAt: text("deleted_at"),
    purgeAfter: text("purge_after"),
  },
  (table) => [
    index("child_family_order_idx").on(
      table.familyId,
      table.deletedAt,
      table.sortOrder,
    ),
  ],
);

export const vaccineDefinition = sqliteTable("vaccine_definition", {
  id: text("id").primaryKey(),
  scheduleVersion: text("schedule_version").notNull(),
  vaccineCode: text("vaccine_code").notNull(),
  doseLabelId: text("dose_label_id").notNull(),
  doseLabelEn: text("dose_label_en").notNull(),
  dueOffset: text("due_offset").notNull(),
  windowEndOffset: text("window_end_offset").notNull(),
  category: text("category", {
    enum: ["core", "annual", "optional_endemic"],
  }).notNull(),
  optionGroup: text("option_group"),
  optionValue: text("option_value"),
  notesId: text("notes_id"),
  notesEn: text("notes_en"),
  comboHintId: text("combo_hint_id"),
  comboHintEn: text("combo_hint_en"),
});

export const milestoneDefinition = sqliteTable("milestone_definition", {
  id: text("id").primaryKey(),
  ageMonths: integer("age_months").notNull(),
  domain: text("domain", {
    enum: [
      "social_emotional",
      "language_communication",
      "cognitive",
      "movement_physical",
    ],
  }).notNull(),
  textId: text("text_id").notNull(),
  textEn: text("text_en").notNull(),
  sortOrder: integer("sort_order").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const growthMeasurement = sqliteTable(
  "growth_measurement",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    measuredAt: text("measured_at").notNull(),
    weightG: integer("weight_g"),
    lengthMm: integer("length_mm"),
    headCircMm: integer("head_circ_mm"),
    place: text("place", {
      enum: ["home", "posyandu", "clinic_doctor", "hospital", "other"],
    }),
    note: text("note"),
    hasPhoto: integer("has_photo", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("growth_measurement_child_date_idx").on(
      table.childId,
      table.measuredAt,
    ),
    index("growth_measurement_family_rev_idx").on(table.familyId, table.rev),
  ],
);

export const growthPhoto = sqliteTable("growth_photo", {
  measurementId: text("measurement_id")
    .primaryKey()
    .references(() => growthMeasurement.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
});

export const growthTarget = sqliteTable(
  "growth_target",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    targetDate: text("target_date").notNull(),
    weightMinG: integer("weight_min_g"),
    weightMaxG: integer("weight_max_g"),
    lengthMinMm: integer("length_min_mm"),
    lengthMaxMm: integer("length_max_mm"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("growth_target_child_date_unique")
      .on(table.childId, table.targetDate)
      .where(sql`${table.deletedAt} is null`),
    index("growth_target_family_rev_idx").on(table.familyId, table.rev),
  ],
);

export const childVaccine = sqliteTable(
  "child_vaccine",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    definitionId: text("definition_id").references(() => vaccineDefinition.id, {
      onDelete: "set null",
    }),
    vaccineCode: text("vaccine_code").notNull(),
    customName: text("custom_name"),
    doseLabelId: text("dose_label_id").notNull(),
    doseLabelEn: text("dose_label_en").notNull(),
    category: text("category", {
      enum: ["core", "annual", "optional_endemic", "custom"],
    }).notNull(),
    dueDate: text("due_date").notNull(),
    windowEndDate: text("window_end_date").notNull(),
    givenDate: text("given_date"),
    givenPlace: text("given_place"),
    batchNumber: text("batch_number"),
    note: text("note"),
    statusOverride: text("status_override", { enum: ["skipped"] }),
    isCustom: integer("is_custom", { mode: "boolean" })
      .notNull()
      .default(false),
    followOptional: integer("follow_optional", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("child_vaccine_child_definition_unique").on(
      table.childId,
      table.definitionId,
    ),
    index("child_vaccine_child_due_idx").on(table.childId, table.dueDate),
    index("child_vaccine_family_rev_idx").on(table.familyId, table.rev),
  ],
);

export const childVaccineOption = sqliteTable(
  "child_vaccine_option",
  {
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    optionGroup: text("option_group", {
      enum: ["DTP_SCHEDULE", "ROTA_PRODUCT"],
    }).notNull(),
    optionValue: text("option_value").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("child_vaccine_option_child_group_unique").on(
      table.childId,
      table.optionGroup,
    ),
  ],
);

export const childMilestone = sqliteTable(
  "child_milestone",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    definitionId: text("definition_id")
      .notNull()
      .references(() => milestoneDefinition.id, { onDelete: "cascade" }),
    achieved: integer("achieved", { mode: "boolean" }).notNull().default(false),
    achievedOn: text("achieved_on"),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    rev: integer("rev").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("child_milestone_child_definition_unique").on(
      table.childId,
      table.definitionId,
    ),
    index("child_milestone_family_rev_idx").on(table.familyId, table.rev),
  ],
);

export const schema = {
  ...familyAuthSchema,
  sessionRelations,
  authEmailRateLimit,
  child,
  childMilestone,
  childVaccine,
  childVaccineOption,
  family,
  familyInvite,
  familyMember,
  familyRevCounter,
  growthMeasurement,
  growthPhoto,
  growthTarget,
  inviteRateLimit,
  logEntry,
  milestoneDefinition,
  auditLog,
  mpasiFood,
  vaccineDefinition,
  userProfile,
  userRelations,
};
