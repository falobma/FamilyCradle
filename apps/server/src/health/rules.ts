import {
  child,
  growthMeasurement,
  logEntry,
  vaccineDefinition,
} from "../db/schema.js";

type Child = typeof child.$inferSelect;
type GrowthMeasurement = typeof growthMeasurement.$inferSelect;
type LogEntry = typeof logEntry.$inferSelect;
type VaccineDefinition = typeof vaccineDefinition.$inferSelect;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function differenceInCalendarDays(later: string, earlier: string): number {
  return Math.round(
    (parseDate(later).getTime() - parseDate(earlier).getTime()) / DAY_MS,
  );
}

type ChildProfile = Pick<
  Child,
  | "dateOfBirth"
  | "gestationalAgeWeeks"
  | "gestationalAgeDays"
  | "birthWeightG"
  | "feedingMode"
  | "milkTargetMode"
  | "milkTargetManualMl"
>;

type VaccineStatus =
  "skipped" | "done" | "upcoming" | "due_soon" | "due" | "late";

export function addOffset(date: string, offset: string): string {
  const parsed = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(-?\d+)D)?$/.exec(
    offset,
  );
  if (!parsed) throw new Error(`Unsupported date offset: ${offset}`);

  const result = parseDate(date);
  const years = Number(parsed[1] ?? 0);
  const months = Number(parsed[2] ?? 0) + years * 12;
  const weeks = Number(parsed[3] ?? 0);
  const days = Number(parsed[4] ?? 0) + weeks * 7;

  if (months > 0) {
    const targetMonth = result.getUTCMonth() + months;
    const targetYear = result.getUTCFullYear() + Math.floor(targetMonth / 12);
    const monthIndex = targetMonth % 12;
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCFullYear(targetYear, monthIndex, 1);
    const lastDay = new Date(
      Date.UTC(targetYear, monthIndex + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  }
  result.setUTCDate(result.getUTCDate() + days);
  return dateString(result);
}

export function correctedAgeDays(
  child: Pick<
    ChildProfile,
    "dateOfBirth" | "gestationalAgeWeeks" | "gestationalAgeDays"
  >,
  onDate: string,
): number {
  const chronological = differenceInCalendarDays(onDate, child.dateOfBirth);
  if (chronological < 0) return chronological;
  const birth = correctedBirthDate(child, onDate);
  return Math.max(0, differenceInCalendarDays(onDate, birth));
}

function correctedBirthDate(
  child: Pick<
    ChildProfile,
    "dateOfBirth" | "gestationalAgeWeeks" | "gestationalAgeDays"
  >,
  onDate: string,
): string {
  if (ageMonths(child.dateOfBirth, onDate) >= 24) return child.dateOfBirth;
  const weeks = child.gestationalAgeWeeks ?? 40;
  const days = child.gestationalAgeDays ?? 0;
  const correction = weeks < 37 ? Math.max(0, 280 - (weeks * 7 + days)) : 0;
  return addOffset(child.dateOfBirth, `P${correction}D`);
}

export function ageMonths(birthDate: string, onDate: string): number {
  const birth = parseDate(birthDate);
  const current = parseDate(onDate);
  let months =
    (current.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    current.getUTCMonth() -
    birth.getUTCMonth();
  if (dateString(current) < addOffset(birthDate, `P${months}M`)) months -= 1;
  return Math.max(0, months);
}

export function vaccineStatus(
  vaccine: {
    dueDate: string;
    windowEndDate: string;
    givenDate: string | null;
    statusOverride: "skipped" | null;
  },
  today: string,
): VaccineStatus {
  if (vaccine.givenDate) return "done";
  if (vaccine.statusOverride === "skipped") return "skipped";
  const weekBeforeDue = addOffset(vaccine.dueDate, "P-7D");
  if (today < weekBeforeDue) return "upcoming";
  if (today < vaccine.dueDate) return "due_soon";
  if (today <= vaccine.windowEndDate) return "due";
  return "late";
}

export function vaccineDefinitionsForOptions(
  definitions: VaccineDefinition[],
  options: Record<string, string>,
): VaccineDefinition[] {
  return definitions.filter(
    (definition) =>
      !definition.optionGroup ||
      options[definition.optionGroup] === definition.optionValue,
  );
}

export function growthChangeConfirmation(
  measurement: Pick<GrowthMeasurement, "measuredAt" | "weightG">,
  previous: Pick<GrowthMeasurement, "measuredAt" | "weightG"> | undefined,
): { required: boolean; percentChange: number | null; days: number | null } {
  if (!measurement.weightG || !previous?.weightG) {
    return { required: false, percentChange: null, days: null };
  }
  const days = differenceInCalendarDays(
    measurement.measuredAt,
    previous.measuredAt,
  );
  if (days < 0 || days > 7) {
    return { required: false, percentChange: null, days: null };
  }
  const percentChange = Math.round(
    ((measurement.weightG - previous.weightG) / previous.weightG) * 100,
  );
  return {
    required: Math.abs(percentChange) > 20,
    percentChange,
    days,
  };
}

export type MilkTargetResult = {
  targetMl: number | null;
  mode: "auto" | "manual" | "frequency";
  feedingMode: ChildProfile["feedingMode"];
  ageDays: number;
  ageMonths: number;
  weightG: number;
  weightMeasuredAt: string | null;
  weightIsStale: boolean;
  rangeMinMl: number | null;
  rangeMaxMl: number | null;
  feedsPerDay: number;
  suggestedPerFeedMl: number | null;
  consumedMlToday: number;
  feedingCountToday: number;
  progressPercent: number | null;
  disclaimer: string;
};

function familyDateTime(
  instant: string,
  timeZone: string,
): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function consumedBottleMl(entry: LogEntry): number {
  if (entry.type !== "bottle" || entry.status !== "completed") return 0;
  let leftoverMl = 0;
  try {
    const details: unknown = JSON.parse(entry.details);
    if (
      typeof details === "object" &&
      details !== null &&
      "leftoverMl" in details &&
      typeof details.leftoverMl === "number"
    ) {
      leftoverMl = details.leftoverMl;
    }
  } catch {
    throw new Error(`Invalid stored bottle details for ${entry.id}.`);
  }
  return Math.max(0, (entry.amountMl ?? 0) - leftoverMl);
}

export function correctedAgeMonths(
  child: Pick<
    ChildProfile,
    "dateOfBirth" | "gestationalAgeWeeks" | "gestationalAgeDays"
  >,
  onDate: string,
): number {
  return ageMonths(correctedBirthDate(child, onDate), onDate);
}

export function correctedAgeRemainderDays(
  child: Pick<
    ChildProfile,
    "dateOfBirth" | "gestationalAgeWeeks" | "gestationalAgeDays"
  >,
  onDate: string,
): number {
  const birth = correctedBirthDate(child, onDate);
  const months = ageMonths(birth, onDate);
  return Math.max(
    0,
    differenceInCalendarDays(onDate, addOffset(birth, `P${months}M`)),
  );
}

export function familyDate(instant: string, timeZone: string): string {
  return familyDateTime(instant, timeZone).date;
}

export function calculateMilkTarget({
  child,
  measurements,
  bottleEntries,
  now,
  timeZone,
}: {
  child: ChildProfile;
  measurements: GrowthMeasurement[];
  bottleEntries: LogEntry[];
  now: string;
  timeZone: string;
}): MilkTargetResult {
  const familyToday = familyDateTime(now, timeZone).date;
  const correctedBirth = correctedBirthDate(child, familyToday);
  const ageDays = differenceInCalendarDays(familyToday, correctedBirth);
  const weight = measurements
    .filter((measurement) => measurement.weightG !== null)
    .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0];
  const weightG = weight?.weightG ?? child.birthWeightG;
  const weightMeasuredAt = weight?.measuredAt ?? child.dateOfBirth;
  const ageMonthsAtToday = ageMonths(correctedBirth, familyToday);
  const todaysEntries = bottleEntries.filter(
    (entry) => familyDateTime(entry.startedAt, timeZone).date === familyToday,
  );
  const consumedMlToday = todaysEntries.reduce(
    (total, entry) => total + consumedBottleMl(entry),
    0,
  );
  const recentBottle = bottleEntries.some((entry) => {
    const entryDate = familyDateTime(entry.startedAt, timeZone).date;
    return (
      entry.type === "bottle" &&
      entry.status === "completed" &&
      differenceInCalendarDays(familyToday, entryDate) <= 2
    );
  });

  let targetMl: number | null = null;
  let mode: MilkTargetResult["mode"] = "auto";
  let rangeMinMl: number | null = null;
  let rangeMaxMl: number | null = null;
  let feedsPerDay = 8;

  if (child.milkTargetMode === "manual" && child.milkTargetManualMl !== null) {
    targetMl = child.milkTargetManualMl;
    mode = "manual";
  } else if (child.feedingMode === "breastmilk" && !recentBottle) {
    mode = "frequency";
  } else if (ageDays >= 0 && ageDays < 3) {
    targetMl = Math.round((weightG * [60, 90, 120][ageDays]!) / 1000 / 10) * 10;
    feedsPerDay = 8;
  } else if (ageMonthsAtToday < 6) {
    targetMl = Math.min(1000, Math.round((weightG * 150) / 1000 / 10) * 10);
    feedsPerDay = ageMonthsAtToday < 1 ? 8 : ageMonthsAtToday < 4 ? 7 : 6;
  } else if (ageMonthsAtToday < 9) {
    targetMl = 700;
    rangeMinMl = 600;
    rangeMaxMl = 800;
    feedsPerDay = 5;
  } else if (ageMonthsAtToday < 12) {
    targetMl = 600;
    rangeMinMl = 500;
    rangeMaxMl = 700;
    feedsPerDay = 4;
  } else if (ageMonthsAtToday <= 24) {
    targetMl = 400;
    rangeMinMl = 300;
    rangeMaxMl = 500;
    feedsPerDay = 3;
  }
  const feedingCountToday = todaysEntries.filter(
    (entry) => entry.type === "breastfeed" || entry.status === "completed",
  ).length;
  if (mode === "frequency") feedsPerDay = 8;
  const todayParts = familyDateTime(now, timeZone);
  const weightAgeDays = differenceInCalendarDays(
    todayParts.date,
    weightMeasuredAt,
  );
  return {
    targetMl,
    mode,
    feedingMode: child.feedingMode,
    ageDays,
    ageMonths: ageMonthsAtToday,
    weightG,
    weightMeasuredAt,
    weightIsStale: ageMonthsAtToday < 6 && weightAgeDays > 14,
    rangeMinMl,
    rangeMaxMl,
    feedsPerDay,
    suggestedPerFeedMl: targetMl
      ? Math.round(targetMl / feedsPerDay / 10) * 10
      : null,
    consumedMlToday,
    feedingCountToday,
    progressPercent: targetMl
      ? Math.round((consumedMlToday / targetMl) * 100)
      : null,
    disclaimer: "Target ini perkiraan umum. Ikuti saran dokter/bidan.",
  };
}

export type WakeWindowSuggestion = {
  windowMinMinutes: number;
  windowMaxMinutes: number;
  suggestedStart: string | null;
  suggestedEnd: string | null;
  ageMonths: number;
  typicalNapsPerDay: string;
  typicalSleepHours: string;
};

function roundToFive(date: Date): Date {
  const rounded = new Date(date);
  rounded.setUTCMinutes(Math.round(rounded.getUTCMinutes() / 5) * 5, 0, 0);
  return rounded;
}

export function calculateWakeWindow(
  child: Pick<
    ChildProfile,
    "dateOfBirth" | "gestationalAgeWeeks" | "gestationalAgeDays"
  >,
  lastSleepEnd: string | null,
  now: string,
): WakeWindowSuggestion {
  const today = now.slice(0, 10);
  const correctedBirth = correctedBirthDate(child, today);
  const months = ageMonths(correctedBirth, today);
  const ageDays = differenceInCalendarDays(today, correctedBirth);
  const band =
    ageDays < 28
      ? { min: 35, max: 60, naps: "4–8", sleep: "14–17" }
      : months < 3
        ? { min: 60, max: 90, naps: "4–5", sleep: "14–17" }
        : months < 5
          ? { min: 75, max: 120, naps: "3–4", sleep: "12–16" }
          : months < 7
            ? { min: 120, max: 180, naps: "2–3", sleep: "12–16" }
            : months < 11
              ? { min: 150, max: 210, naps: "2", sleep: "12–16" }
              : months < 14
                ? { min: 180, max: 240, naps: "1–2", sleep: "11–14" }
                : { min: 240, max: 360, naps: "1", sleep: "11–14" };
  const lastWake = lastSleepEnd ? new Date(lastSleepEnd) : null;
  const start = lastWake
    ? new Date(lastWake.getTime() + band.min * 60_000)
    : null;
  const end = lastWake
    ? new Date(lastWake.getTime() + band.max * 60_000)
    : null;

  return {
    windowMinMinutes: band.min,
    windowMaxMinutes: band.max,
    suggestedStart: start ? roundToFive(start).toISOString() : null,
    suggestedEnd: end ? roundToFive(end).toISOString() : null,
    ageMonths: months,
    typicalNapsPerDay: band.naps,
    typicalSleepHours: band.sleep,
  };
}
