import { describe, expect, it } from "vitest";
import { estimateServerClockOffsetMs } from "@familycradle/shared";

describe("server clock offset", () => {
  it("estimates offset from the response Date header and request midpoint", () => {
    expect(
      estimateServerClockOffsetMs(
        "Thu, 01 Jan 1970 00:00:20 GMT",
        10_000,
        10_200,
      ),
    ).toBe(10_400);
    expect(
      estimateServerClockOffsetMs(
        "Thu, 01 Jan 1970 00:00:10 GMT",
        20_000,
        20_200,
      ),
    ).toBe(-9_600);
  });

  it("ignores missing or invalid Date headers and request timings", () => {
    expect(estimateServerClockOffsetMs(null, 10_000, 10_200)).toBeNull();
    expect(
      estimateServerClockOffsetMs("not a date", 10_000, 10_200),
    ).toBeNull();
    expect(
      estimateServerClockOffsetMs(
        "Thu, 01 Jan 1970 00:00:20 GMT",
        20_000,
        10_000,
      ),
    ).toBeNull();
  });
});
