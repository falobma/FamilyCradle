// Pulungan et al., Indonesian National Synthetic Growth Charts (2018), Tables 3 and 4.
// https://actascientific.com/ASPE/ASPE-01-0006.php — Creative Commons Attribution.
// Selected published p3, p50 and p97 values; no interpolation.

type ReferenceRow = {
  ageYears: number;
  weight: readonly [number, number, number];
  height: readonly [number, number, number];
};

const reference: Record<"male" | "female", readonly ReferenceRow[]> = {
  male: [
    { ageYears: 0, weight: [2.61, 3.46, 4.35], height: [46.03, 49.84, 53.66] },
    {
      ageYears: 0.25,
      weight: [4.89, 6.33, 7.88],
      height: [55.14, 59.73, 64.32],
    },
    { ageYears: 0.5, weight: [6.3, 7.76, 9.35], height: [61.36, 66.06, 70.76] },
    { ageYears: 0.75, weight: [7.01, 8.55, 10.25], height: [65, 69.92, 74.83] },
    { ageYears: 1, weight: [7.68, 9.17, 10.83], height: [68.08, 73.39, 78.71] },
    {
      ageYears: 1.5,
      weight: [8.63, 10.24, 12.17],
      height: [72.66, 78.73, 84.8],
    },
    { ageYears: 2, weight: [9.43, 11.22, 13.43], height: [77.2, 83.97, 90.74] },
  ],
  female: [
    { ageYears: 0, weight: [2.59, 3.39, 4.18], height: [46.13, 49.83, 53.53] },
    {
      ageYears: 0.25,
      weight: [4.3, 5.64, 7.04],
      height: [53.67, 58.07, 62.47],
    },
    {
      ageYears: 0.5,
      weight: [5.79, 7.31, 8.96],
      height: [60.63, 65.25, 69.86],
    },
    { ageYears: 0.75, weight: [6.53, 8.11, 9.9], height: [64.07, 68.98, 73.9] },
    { ageYears: 1, weight: [7.06, 8.62, 10.43], height: [66.92, 72.09, 77.26] },
    { ageYears: 1.5, weight: [8, 9.76, 11.81], height: [71.31, 77.3, 83.3] },
    {
      ageYears: 2,
      weight: [8.87, 10.86, 13.19],
      height: [75.48, 82.12, 88.76],
    },
  ],
};

export function indonesianReference(
  sex: "male" | "female",
  birthDate: string,
  metric: "weight" | "height",
) {
  const birthTime = Date.parse(`${birthDate}T00:00:00Z`);
  return reference[sex].map((row) => ({
    ageYears: row.ageYears,
    time: birthTime + row.ageYears * 365.25 * 86_400_000,
    values: row[metric],
  }));
}
