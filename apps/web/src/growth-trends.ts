type Measurement = {
  id: string;
  measuredAt: string;
  createdAt: string;
  weightG: number | null;
  lengthMm: number | null;
  hasPhoto?: boolean;
};

export type GrowthPoint = {
  id: string;
  date: string;
  time: number;
  value: number;
  photoId?: string;
};

export type GrowthTarget = {
  id: string;
  version: number;
  targetDate: string;
  weightMinG: number | null;
  weightMaxG: number | null;
  lengthMinMm: number | null;
  lengthMaxMm: number | null;
};

export type TargetRange = {
  id: string;
  date: string;
  time: number;
  min: number;
  max: number;
};

export function growthChartData(
  points: GrowthPoint[],
  targets: TargetRange[],
  reference: Array<{ time: number; values: readonly [number, number, number] }>,
) {
  const photosByTime = new Map<number, string[]>();
  for (const point of points) {
    if (point.photoId) {
      const photos = photosByTime.get(point.time) ?? [];
      photos.push(point.photoId);
      photosByTime.set(point.time, photos);
    }
  }
  const rows: Array<{
    time: number;
    value: number | null;
    p50: number | null;
    photoIds: string[];
  }> = points.map((point) => ({
    time: point.time,
    value: point.value,
    p50: null,
    photoIds: photosByTime.get(point.time) ?? [],
  }));

  for (const row of reference) {
    const existing = rows.find((point) => point.time === row.time);
    if (existing) existing.p50 = row.values[1];
    else
      rows.push({
        time: row.time,
        value: null,
        p50: row.values[1],
        photoIds: [],
      });
  }
  for (const target of targets) {
    if (!rows.some((row) => row.time === target.time)) {
      rows.push({ time: target.time, value: null, p50: null, photoIds: [] });
    }
  }
  return rows.sort((a, b) => a.time - b.time);
}

export function measurementAge(birthDate: string, time: number) {
  const date = new Date(time).toISOString().slice(0, 10);
  if (date < birthDate) return null;
  const months = ageMonths(birthDate, date);
  const monthDate = addOffset(birthDate, `P${months}M`);
  const days =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${monthDate}T00:00:00Z`)) /
    86_400_000;
  return { months, days };
}

export function targetRanges(
  targets: GrowthTarget[],
  metric: "weight" | "length",
): TargetRange[] {
  return targets.flatMap((target) => {
    const min = metric === "weight" ? target.weightMinG : target.lengthMinMm;
    const max = metric === "weight" ? target.weightMaxG : target.lengthMaxMm;
    if (min === null || max === null) return [];
    const divisor = metric === "weight" ? 1000 : 10;
    return [
      {
        id: target.id,
        date: target.targetDate,
        time: Date.parse(`${target.targetDate}T00:00:00Z`),
        min: min / divisor,
        max: max / divisor,
      },
    ];
  });
}

export function compareTarget(target: TargetRange, points: GrowthPoint[]) {
  const measurement = points.findLast((point) => point.date === target.date);
  if (!measurement) return null;
  if (measurement.value < target.min)
    return {
      status: "below" as const,
      difference: target.min - measurement.value,
      measurement,
    };
  if (measurement.value > target.max)
    return {
      status: "above" as const,
      difference: measurement.value - target.max,
      measurement,
    };
  return { status: "within" as const, difference: 0, measurement };
}

export function growthSeries(
  birthDate: string,
  birth: { weightG: number; lengthMm: number | null },
  measurements: Measurement[],
): { weight: GrowthPoint[]; length: GrowthPoint[] } {
  const rows = [
    { id: "birth", measuredAt: birthDate, createdAt: "", ...birth },
    ...measurements,
  ].sort(
    (a, b) =>
      a.measuredAt.localeCompare(b.measuredAt) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const series = (field: "weightG" | "lengthMm", divisor: number) =>
    rows.flatMap((row) => {
      const value = row[field];
      return value === null
        ? []
        : [
            {
              id: row.id,
              date: row.measuredAt,
              time: Date.parse(`${row.measuredAt}T00:00:00Z`),
              value: value / divisor,
              ...("hasPhoto" in row && row.hasPhoto ? { photoId: row.id } : {}),
            },
          ];
    });
  return {
    weight: series("weightG", 1000),
    length: series("lengthMm", 10),
  };
}
import { addOffset, ageMonths } from "@familycradle/shared";
