import { describe, expect, it } from "vitest";
import {
  addOffset,
  calculateMilkTarget,
  calculateWakeWindow,
  correctedAgeDays,
  correctedAgeMonths,
  growthChangeConfirmation,
  vaccineStatus,
} from "./rules.js";

describe("health reference rules", () => {
  it("uses calendar vaccine offsets and clamps month-end dates", () => {
    expect(addOffset("2024-01-31", "P1M")).toBe("2024-02-29");
    expect(addOffset("2026-03-10", "P-7D")).toBe("2026-03-03");
    expect(addOffset("2026-01-01", "P24W")).toBe("2026-06-18");
  });

  it("subtracts prematurity correction from age and detects rapid growth changes", () => {
    const prematureChild = {
      dateOfBirth: "2024-01-01",
      gestationalAgeWeeks: 32,
      gestationalAgeDays: 0,
    };
    expect(correctedAgeDays(prematureChild, "2024-04-11")).toBe(45);
    expect(correctedAgeMonths(prematureChild, "2025-12-31")).toBeLessThan(24);
    expect(correctedAgeMonths(prematureChild, "2026-01-01")).toBe(24);
    expect(
      growthChangeConfirmation(
        { measuredAt: "2026-04-10", weightG: 6500 },
        { measuredAt: "2026-04-08", weightG: 5000 },
      ),
    ).toEqual({ required: true, percentChange: 30, days: 2 });
  });

  it("computes vaccine statuses around the seven-day due boundary", () => {
    const vaccine = {
      dueDate: "2026-06-10",
      windowEndDate: "2026-06-20",
      givenDate: null,
      statusOverride: null,
    } as const;
    expect(vaccineStatus(vaccine, "2026-06-02")).toBe("upcoming");
    expect(vaccineStatus(vaccine, "2026-06-03")).toBe("due_soon");
    expect(vaccineStatus(vaccine, "2026-06-10")).toBe("due");
    expect(vaccineStatus(vaccine, "2026-06-21")).toBe("late");
    expect(
      vaccineStatus({ ...vaccine, givenDate: "2026-06-10" }, "2026-06-21"),
    ).toBe("done");
    expect(
      vaccineStatus({ ...vaccine, statusOverride: "skipped" }, "2026-06-21"),
    ).toBe("skipped");
  });

  it("uses an age-band milk target and rounds wake suggestions to five minutes", () => {
    const childProfile = {
      dateOfBirth: "2025-12-10",
      gestationalAgeWeeks: null,
      gestationalAgeDays: null,
      birthWeightG: 3200,
      feedingMode: "formula",
      milkTargetMode: "auto",
      milkTargetManualMl: null,
    } as const;
    const target = calculateMilkTarget({
      child: childProfile,
      measurements: [],
      bottleEntries: [],
      now: "2026-06-10T12:00:00.000Z",
      timeZone: "Asia/Jakarta",
    });
    expect(target).toMatchObject({
      targetMl: 700,
      rangeMinMl: 600,
      rangeMaxMl: 800,
      feedsPerDay: 5,
      ageMonths: 6,
    });

    const wake = calculateWakeWindow(
      childProfile,
      "2026-06-10T08:03:00.000Z",
      "2026-06-10T12:00:00.000Z",
    );
    expect(wake).toMatchObject({
      windowMinMinutes: 120,
      windowMaxMinutes: 180,
      suggestedStart: "2026-06-10T10:05:00.000Z",
      suggestedEnd: "2026-06-10T11:05:00.000Z",
    });
  });

  it("uses chronological age for premature children at 24 months", () => {
    const prematureChild = {
      dateOfBirth: "2024-01-01",
      gestationalAgeWeeks: 32,
      gestationalAgeDays: 0,
      birthWeightG: 3200,
      feedingMode: "formula",
      milkTargetMode: "auto",
      milkTargetManualMl: null,
    } as const;
    const target = calculateMilkTarget({
      child: prematureChild,
      measurements: [],
      bottleEntries: [],
      now: "2026-01-01T12:00:00.000Z",
      timeZone: "Asia/Jakarta",
    });

    expect(target.ageMonths).toBe(24);
    expect(target.targetMl).toBe(400);
  });

  it("uses feeding frequency for breastmilk without a recent bottle", () => {
    const childProfile = {
      dateOfBirth: "2026-05-20",
      gestationalAgeWeeks: null,
      gestationalAgeDays: null,
      birthWeightG: 3200,
      feedingMode: "breastmilk",
      milkTargetMode: "auto",
      milkTargetManualMl: null,
    } as const;
    const target = calculateMilkTarget({
      child: childProfile,
      measurements: [],
      bottleEntries: [],
      now: "2026-06-10T12:00:00.000Z",
      timeZone: "Asia/Jakarta",
    });

    expect(target).toMatchObject({
      targetMl: null,
      mode: "frequency",
      feedingMode: "breastmilk",
      ageMonths: 0,
      feedingCountToday: 0,
    });
  });
});
