import { describe, expect, it } from "vitest";
import {
  compareTarget,
  growthChartData,
  growthSeries,
  measurementAge,
  targetRanges,
} from "./growth-trends";
import { indonesianReference } from "./indonesian-growth-reference";

describe("growthSeries", () => {
  it("calculates chronological age at each date, including month ends and leap days", () => {
    const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
    expect(measurementAge("2024-01-31", time("2024-01-31"))).toEqual({
      months: 0,
      days: 0,
    });
    expect(measurementAge("2024-01-31", time("2024-02-29"))).toEqual({
      months: 1,
      days: 0,
    });
    expect(measurementAge("2024-01-31", time("2024-03-30"))).toEqual({
      months: 1,
      days: 30,
    });
    expect(measurementAge("2024-02-29", time("2025-02-28"))).toEqual({
      months: 12,
      days: 0,
    });
    expect(measurementAge("2024-02-29", time("2024-02-28"))).toBeNull();
  });

  it("orders observations by date and creation time, including birth", () => {
    const result = growthSeries(
      "2026-01-01",
      { weightG: 3000, lengthMm: 490 },
      [
        {
          id: "c",
          measuredAt: "2026-02-01",
          createdAt: "2",
          weightG: 4100,
          lengthMm: null,
        },
        {
          id: "a",
          measuredAt: "2026-01-01",
          createdAt: "1",
          weightG: 3100,
          lengthMm: 500,
        },
        {
          id: "b",
          measuredAt: "2026-02-01",
          createdAt: "1",
          weightG: 4000,
          lengthMm: 550,
        },
      ],
    );
    expect(result.weight.map(({ id, value }) => [id, value])).toEqual([
      ["birth", 3],
      ["a", 3.1],
      ["b", 4],
      ["c", 4.1],
    ]);
    expect(result.length.map(({ id, value }) => [id, value])).toEqual([
      ["birth", 49],
      ["a", 50],
      ["b", 55],
    ]);
    expect(result.weight[0]?.time).toBe(Date.UTC(2026, 0, 1));
  });

  describe("Indonesian reference points", () => {
    it("keeps the P50 reference at shared dates without inventing intermediate values", () => {
      const points = [
        { id: "birth", date: "2026-01-01", time: 0, value: 3 },
        {
          id: "same-day",
          date: "2026-01-01",
          time: 0,
          value: 3.1,
          photoId: "same-day",
        },
        {
          id: "later",
          date: "2026-02-01",
          time: 1,
          value: 4,
          photoId: "later",
        },
      ];
      const reference = [
        { time: 0, values: [2, 3.4, 4] as const },
        { time: 2, values: [5, 6, 7] as const },
      ];
      const targets = [
        { id: "shared", date: "2026-01-01", time: 0, min: 2, max: 4 },
        { id: "separate", date: "2026-02-02", time: 1.5, min: 3, max: 5 },
      ];
      expect(growthChartData(points, targets, reference)).toEqual([
        { time: 0, value: 3, p50: 3.4, photoIds: ["same-day"] },
        { time: 0, value: 3.1, p50: null, photoIds: ["same-day"] },
        { time: 1, value: 4, p50: null, photoIds: ["later"] },
        { time: 1.5, value: null, p50: null, photoIds: [] },
        { time: 2, value: null, p50: 6, photoIds: [] },
      ]);
    });

    it("uses the child's sex and the requested metric without inventing intermediate ages", () => {
      const boys = indonesianReference("male", "2024-02-29", "weight");
      const girls = indonesianReference("female", "2024-02-29", "height");
      expect(boys.map((row) => row.ageYears)).toEqual([
        0, 0.25, 0.5, 0.75, 1, 1.5, 2,
      ]);
      expect(boys[0]?.values).toEqual([2.61, 3.46, 4.35]);
      expect(girls[1]?.values).toEqual([53.67, 58.07, 62.47]);
      expect(boys[0]?.time).toBe(Date.UTC(2024, 1, 29));
      expect(boys[1]!.time - boys[0]!.time).toBe(0.25 * 365.25 * 86_400_000);
      expect(boys.at(-1)!.time - boys[0]!.time).toBe(2 * 365.25 * 86_400_000);
    });
  });

  describe("clinician targets", () => {
    const targets = [
      {
        id: "target",
        version: 1,
        targetDate: "2026-02-01",
        weightMinG: 4000,
        weightMaxG: 5000,
        lengthMinMm: null,
        lengthMaxMm: null,
      },
    ];
    const points = [
      { id: "earlier", date: "2026-01-31", time: 0, value: 4.5 },
      { id: "first", date: "2026-02-01", time: 1, value: 4.5 },
      { id: "latest", date: "2026-02-01", time: 1, value: 3.8 },
    ];

    it("uses the last measurement on the target date and reports distance to the nearest bound", () => {
      const [range] = targetRanges(targets, "weight");
      expect(range).toBeDefined();
      expect(compareTarget(range!, points)).toMatchObject({
        status: "below",
        difference: expect.closeTo(0.2),
        measurement: { id: "latest" },
      });
      expect(
        compareTarget(range!, [{ ...points[2]!, value: 5.2 }]),
      ).toMatchObject({ status: "above", difference: expect.closeTo(0.2) });
      expect(
        compareTarget(range!, [{ ...points[2]!, value: 4 }]),
      ).toMatchObject({ status: "within", difference: 0 });
      expect(compareTarget(range!, [points[0]!])).toBeNull();
      expect(targetRanges(targets, "length")).toEqual([]);
    });
  });

  it("does not invent missing length or weight observations", () => {
    const result = growthSeries(
      "2026-01-01",
      { weightG: 3200, lengthMm: null },
      [
        {
          id: "x",
          measuredAt: "2026-01-02",
          createdAt: "1",
          weightG: null,
          lengthMm: 510,
        },
      ],
    );
    expect(result.weight.map((point) => point.id)).toEqual(["birth"]);
    expect(result.length.map((point) => point.id)).toEqual(["x"]);
  });
});
