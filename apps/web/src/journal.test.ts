import { describe, expect, it } from "vitest";
import {
  breastfeedEditedStart,
  breastfeedManualDuration,
  incrementBreastfeedMinutes,
  incrementPumpingAmount,
  sleepDurationBetween,
} from "./Journal";

describe("pumping amount shortcuts", () => {
  it("adds to a side or combined amount, including an empty field", () => {
    expect(incrementPumpingAmount("", 5, 1000)).toBe("5");
    expect(incrementPumpingAmount("25", 10, 1000)).toBe("35");
    expect(incrementPumpingAmount("1990", 10, 2000)).toBe("2000");
  });

  it("disables increments for invalid amounts and amounts over the limit", () => {
    expect(incrementPumpingAmount("-1", 5, 1000)).toBeNull();
    expect(incrementPumpingAmount("1.5", 5, 1000)).toBeNull();
    expect(incrementPumpingAmount("996", 5, 1000)).toBeNull();
    expect(incrementPumpingAmount("1996", 5, 2000)).toBeNull();
  });
});

describe("breastfeeding duration shortcuts", () => {
  it("adds minutes to the existing value or an empty field", () => {
    expect(incrementBreastfeedMinutes("", 5)).toBe("5");
    expect(incrementBreastfeedMinutes("5", 10)).toBe("15");
    expect(incrementBreastfeedMinutes("110", 10)).toBe("120");
  });

  it("disables increments for invalid values or values above the limit", () => {
    expect(incrementBreastfeedMinutes("-1", 5)).toBeNull();
    expect(incrementBreastfeedMinutes("1.5", 5)).toBeNull();
    expect(incrementBreastfeedMinutes("116", 5)).toBeNull();
  });
});

describe("manual breastfeeding duration", () => {
  it("accepts either side and the maximum combined duration", () => {
    expect(breastfeedManualDuration("0", "1")).toBe(1);
    expect(breastfeedManualDuration("60", "60")).toBe(120);
  });

  it("rejects empty, zero, fractional, negative, and excessive durations", () => {
    expect(breastfeedManualDuration("", "1")).toBeNull();
    expect(breastfeedManualDuration("0", "0")).toBeNull();
    expect(breastfeedManualDuration("1.5", "0")).toBeNull();
    expect(breastfeedManualDuration("-1", "5")).toBeNull();
    expect(breastfeedManualDuration("60", "61")).toBeNull();
  });
});

describe("timer-backed breastfeeding edits", () => {
  it("preserves seconds when the displayed start time has not changed", () => {
    const original = "2026-11-28T04:41:50.265Z";
    const date = new Date(original);
    const displayed = new Date(
      date.valueOf() - date.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    expect(breastfeedEditedStart(original, displayed)).toBe(original);
    expect(breastfeedEditedStart(original, "2026-11-28T10:30")).toBe(
      new Date("2026-11-28T10:30").toISOString(),
    );
  });
});

describe("sleep duration", () => {
  it("calculates an overnight sleep using both dates", () => {
    expect(sleepDurationBetween("2026-11-27T23:30", "2026-11-28T01:00")).toBe(
      90 * 60 * 1000,
    );
  });

  it("rejects missing, invalid, equal, and earlier end times", () => {
    const start = "2026-11-28T10:00";
    expect(sleepDurationBetween(start, "")).toBeNull();
    expect(sleepDurationBetween(start, "invalid")).toBeNull();
    expect(sleepDurationBetween(start, start)).toBeNull();
    expect(sleepDurationBetween(start, "2026-11-28T09:00")).toBeNull();
  });
});
