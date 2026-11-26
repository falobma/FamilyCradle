import { describe, expect, it } from "vitest";
import { lmsValueAtZ, lmsZScore, percentileFromZ } from "./growth-lms.js";

describe("LMS growth calculations", () => {
  it("calculates z-scores and inverse reference values including L=0", () => {
    expect(lmsZScore(12, { l: 1, m: 10, s: 0.1 })).toBeCloseTo(2, 10);
    expect(lmsZScore(8, { l: 1, m: 10, s: 0.1 })).toBeCloseTo(-2, 10);
    for (const parameters of [
      { l: 0.5, m: 10, s: 0.1 },
      { l: 0, m: 10, s: 0.1 },
      { l: -0.5, m: 10, s: 0.1 },
    ]) {
      for (const z of [-3, -2, 0, 2, 3]) {
        expect(lmsZScore(lmsValueAtZ(parameters, z), parameters)).toBeCloseTo(
          z,
          10,
        );
      }
    }
  });

  it("matches the WHO restricted-score worked example", () => {
    // WHO 5–19 years worked example, not a 0–24 month reference fixture:
    // https://www.who.int/docs/default-source/child-growth/growth-reference-5-19-years/calcule.pdf
    expect(
      lmsZScore(30, { l: -1.7862, m: 16.9392, s: 0.1107 }, true),
    ).toBeCloseTo(3.35, 2);
  });

  it("uses the restricted adjustment on either side of three SD", () => {
    const parameters = { l: 0, m: 10, s: 0.1 };
    const upper3 = lmsValueAtZ(parameters, 3);
    const upper2 = lmsValueAtZ(parameters, 2);
    const lower3 = lmsValueAtZ(parameters, -3);
    const lower2 = lmsValueAtZ(parameters, -2);
    expect(
      lmsZScore(upper3 + (upper3 - upper2) / 2, parameters, true),
    ).toBeCloseTo(3.5, 10);
    expect(
      lmsZScore(lower3 - (lower2 - lower3) / 2, parameters, true),
    ).toBeCloseTo(-3.5, 10);
    expect(lmsZScore(upper3, parameters, true)).toBeCloseTo(3, 10);
    expect(lmsZScore(lower3, parameters, true)).toBeCloseTo(-3, 10);
  });

  it("converts standard-normal z-scores to percentiles", () => {
    expect(percentileFromZ(0)).toBe(50);
    expect(percentileFromZ(1)).toBeCloseTo(84.1345, 3);
    expect(percentileFromZ(-1)).toBeCloseTo(15.8655, 3);
    expect(percentileFromZ(3)).toBeCloseTo(99.865, 3);
  });

  it("rejects invalid measurements and LMS domains", () => {
    expect(() => lmsZScore(0, { l: 0, m: 10, s: 0.1 })).toThrow(RangeError);
    expect(() => lmsZScore(NaN, { l: 0, m: 10, s: 0.1 })).toThrow(RangeError);
    expect(() => lmsZScore(1, { l: 0, m: 0, s: 0.1 })).toThrow(RangeError);
    expect(() => lmsValueAtZ({ l: -1, m: 10, s: 1 }, 3)).toThrow(RangeError);
    expect(() => percentileFromZ(Infinity)).toThrow(RangeError);
  });
});
