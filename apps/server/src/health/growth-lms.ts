export type LmsParameters = {
  l: number;
  m: number;
  s: number;
};

function validateParameters({ l, m, s }: LmsParameters): void {
  if (
    !Number.isFinite(l) ||
    !Number.isFinite(m) ||
    !Number.isFinite(s) ||
    m <= 0 ||
    s <= 0
  ) {
    throw new RangeError(
      "LMS parameters must be finite, with M and S positive.",
    );
  }
}

export function lmsValueAtZ(parameters: LmsParameters, z: number): number {
  validateParameters(parameters);
  if (!Number.isFinite(z)) throw new RangeError("Z-score must be finite.");
  const { l, m, s } = parameters;
  const base = 1 + l * s * z;
  if (l !== 0 && base <= 0) {
    throw new RangeError("Z-score is outside the LMS distribution domain.");
  }
  const value = m * Math.exp(l === 0 ? s * z : Math.log1p(l * s * z) / l);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("LMS reference value is outside the numeric range.");
  }
  return value;
}

export function lmsZScore(
  value: number,
  parameters: LmsParameters,
  restricted = false,
): number {
  validateParameters(parameters);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Measurement must be finite and positive.");
  }
  const { l, m, s } = parameters;
  const logRatio = Math.log(value / m);
  const z = l === 0 ? logRatio / s : Math.expm1(l * logRatio) / (l * s);
  if (!Number.isFinite(z)) {
    throw new RangeError("Z-score is outside the numeric range.");
  }
  if (!restricted || Math.abs(z) <= 3) return z;

  const positive = z > 3;
  const sd3 = lmsValueAtZ(parameters, positive ? 3 : -3);
  const sd2 = lmsValueAtZ(parameters, positive ? 2 : -2);
  const step = positive ? sd3 - sd2 : sd2 - sd3;
  const adjusted = (positive ? 3 : -3) + (value - sd3) / step;
  if (step <= 0 || !Number.isFinite(adjusted)) {
    throw new RangeError("Restricted z-score is outside the numeric range.");
  }
  return adjusted;
}

export function percentileFromZ(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError("Z-score must be finite.");
  if (z === 0) return 50;
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const tail =
    (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return (z < 0 ? tail : 1 - tail) * 100;
}
