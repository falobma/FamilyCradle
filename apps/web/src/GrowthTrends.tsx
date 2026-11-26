import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  DefaultTooltipContent,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  compareTarget,
  growthChartData,
  growthSeries,
  measurementAge,
  targetRanges,
} from "./growth-trends";
import type { GrowthPoint, GrowthTarget, TargetRange } from "./growth-trends";
import { indonesianReference } from "./indonesian-growth-reference";

type Props = {
  birthDate: string;
  sex: "male" | "female";
  birth: { weightG: number; lengthMm: number | null };
  measurements: Array<{
    id: string;
    measuredAt: string;
    createdAt: string;
    weightG: number | null;
    lengthMm: number | null;
    hasPhoto: boolean;
  }>;
  targets: GrowthTarget[];
  childId: string;
  onOpenPhoto: (id: string) => void;
};

function PhotoPreview({
  childId,
  photoId,
  label,
  onOpenPhoto,
}: {
  childId: string;
  photoId: string;
  label: string;
  onOpenPhoto: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="growth-photo-preview"
      type="button"
      onClick={() => onOpenPhoto(photoId)}
      aria-label={label}
    >
      {failed ? (
        <span>{t("growthPhotoLoadError")}</span>
      ) : (
        <img
          className="growth-photo-thumbnail"
          src={`/api/children/${childId}/growth/${photoId}/photo`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
      {t("growthPhotoView")}
    </button>
  );
}

function TrendChart({
  title,
  unit,
  points,
  targets,
  reference,
  birthDate,
  childId,
  onOpenPhoto,
}: {
  title: string;
  unit: string;
  points: GrowthPoint[];
  targets: TargetRange[];
  reference: ReturnType<typeof indonesianReference>;
  birthDate: string;
  childId: string;
  onOpenPhoto: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "id" ? "id-ID" : "en-US";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const latest = points.at(-1);
  const previous = points.at(-2);
  const delta = latest && previous ? latest.value - previous.value : null;
  const signedDelta =
    delta === null ? "" : `${delta > 0 ? "+" : ""}${number.format(delta)}`;
  const ageLabel = (time: number) => {
    const age = measurementAge(birthDate, time);
    if (!age) return t("growthAgeBeforeBirth");
    return t("growthAge", {
      months: number.format(age.months),
      monthUnit: t("growthAgeMonth", { count: age.months }),
      days: number.format(age.days),
      dayUnit: t("growthAgeDay", { count: age.days }),
    });
  };
  const times = [
    ...points.map((point) => point.time),
    ...reference.map((row) => row.time),
    ...targets.flatMap((target) => [
      target.time - 43200000,
      target.time + 43200000,
    ]),
  ];
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const chartData = growthChartData(points, targets, reference);

  return (
    <article className="growth-trend-card">
      <h4>{title}</h4>
      {latest ? (
        <>
          <p>
            {t("growthLatest", {
              value: number.format(latest.value),
              unit,
              date: date.format(latest.time),
            })}
          </p>
          <p>{ageLabel(latest.time)}</p>
          {previous && delta !== null ? (
            <p>
              {t("growthChange", {
                value: signedDelta,
                unit,
                from: date.format(previous.time),
                to: date.format(latest.time),
              })}
            </p>
          ) : (
            <p>{t("growthNeedTwo")}</p>
          )}
        </>
      ) : (
        <p>{t("growthNoMetric")}</p>
      )}
      {targets.map((target) => {
        const comparison = compareTarget(target, points);
        return (
          <div key={target.id}>
            <p>
              {t("growthTargetRange", {
                date: date.format(target.time),
                min: number.format(target.min),
                max: number.format(target.max),
                unit,
              })}
            </p>
            <p>
              {comparison
                ? t(
                    `growthTarget${comparison.status === "within" ? "Within" : comparison.status === "below" ? "Below" : "Above"}`,
                    {
                      value: number.format(comparison.measurement.value),
                      difference: number.format(comparison.difference),
                      unit,
                    },
                  )
                : t("growthTargetNoMeasurement")}
            </p>
          </div>
        );
      })}
      {times.length > 0 && (
        <div className="growth-trend-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              accessibilityLayer
              aria-label={t("growthChartLabel", { metric: title })}
              data={chartData}
              margin={{ top: 10, right: 16, bottom: 10, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                domain={
                  minTime === maxTime
                    ? [minTime - 86400000, maxTime + 86400000]
                    : [minTime, maxTime]
                }
                tickFormatter={(value: number) => date.format(value)}
                minTickGap={45}
                fontSize={11}
              />
              <YAxis
                domain={[0, "auto"]}
                unit={` ${unit}`}
                width={68}
                fontSize={11}
                tickFormatter={(value: number) => number.format(value)}
              />
              <Tooltip
                contentStyle={{ whiteSpace: "normal", maxWidth: 200 }}
                wrapperStyle={{ pointerEvents: "none" }}
                isAnimationActive={false}
                position={{ x: 0, y: 0 }}
                content={(props) => {
                  const raw: unknown = props.payload.find(
                    (entry) => entry.dataKey === "value",
                  )?.payload;
                  const photoIds =
                    typeof raw === "object" &&
                    raw !== null &&
                    "photoIds" in raw &&
                    Array.isArray(raw.photoIds)
                      ? raw.photoIds.filter(
                          (id): id is string => typeof id === "string",
                        )
                      : [];
                  return (
                    <div
                      className="growth-chart-tooltip"
                      onMouseMove={(event) => event.stopPropagation()}
                    >
                      <DefaultTooltipContent {...props} />
                      {props.active && photoIds.length > 0 && (
                        <div className="growth-photo-previews">
                          {photoIds.map((photoId, index) => (
                            <PhotoPreview
                              key={photoId}
                              childId={childId}
                              photoId={photoId}
                              onOpenPhoto={onOpenPhoto}
                              label={t("growthPhotoViewNumber", {
                                date: date.format(Number(props.label)),
                                number: index + 1,
                              })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }}
                labelFormatter={(value) =>
                  `${date.format(Number(value))} · ${ageLabel(Number(value))}`
                }
                formatter={(value, name) => [
                  typeof value === "number"
                    ? `${number.format(value)} ${unit}`
                    : "",
                  name,
                ]}
              />
              {targets.map((target) => (
                <ReferenceArea
                  key={target.id}
                  x1={target.time - 43200000}
                  x2={target.time + 43200000}
                  y1={target.min}
                  y2={target.max}
                  ifOverflow="extendDomain"
                  fill="#8a9e77"
                  fillOpacity={0.3}
                  stroke="#536f43"
                />
              ))}
              {reference.flatMap((row) =>
                [0, 2].map((index) => (
                  <ReferenceDot
                    key={`${row.ageYears}-${index}`}
                    x={row.time}
                    y={row.values[index]!}
                    r={3}
                    fill="#fffdfa"
                    stroke="#315a78"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                )),
              )}
              <Line
                type="linear"
                dataKey="p50"
                name={t("growthReferenceP50")}
                stroke="#386b45"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 4, fill: "#386b45" }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="value"
                name={title}
                stroke="#795136"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <details>
        <summary>{t("growthReferenceTable")}</summary>
        <div className="growth-reference-table-wrap">
          <table className="growth-reference-table">
            <caption>
              {t("growthReferenceTableCaption", { metric: title, unit })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("growthReferenceAge")}</th>
                <th scope="col">P3</th>
                <th scope="col">P50</th>
                <th scope="col">P97</th>
              </tr>
            </thead>
            <tbody>
              {reference.map((row) => (
                <tr key={row.ageYears}>
                  <th scope="row">{number.format(row.ageYears)}</th>
                  {row.values.map((value, index) => (
                    <td key={index}>{number.format(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}

export default function GrowthTrends({
  birthDate,
  sex,
  birth,
  measurements,
  targets,
  childId,
  onOpenPhoto,
}: Props) {
  const { t } = useTranslation();
  const series = growthSeries(birthDate, birth, measurements);
  return (
    <section className="growth-trends" aria-labelledby="growth-trends-title">
      <h3 id="growth-trends-title">{t("growthTrends")}</h3>
      <p>{t("growthTrendsExplanation")}</p>
      <p>{t("growthReferenceExplanation", { sex: t(sex) })}</p>
      <p>
        {t("growthReferenceSource")}{" "}
        <a
          href="https://actascientific.com/ASPE/ASPE-01-0006.php"
          target="_blank"
          rel="noreferrer"
        >
          Pulungan et al. (2018), Indonesian National Synthetic Growth Charts
        </a>
        {" · Creative Commons Attribution"}
      </p>
      <TrendChart
        title={t("weightKg")}
        unit="kg"
        points={series.weight}
        targets={targetRanges(targets, "weight")}
        reference={indonesianReference(sex, birthDate, "weight")}
        birthDate={birthDate}
        childId={childId}
        onOpenPhoto={onOpenPhoto}
      />
      <TrendChart
        title={t("lengthCm")}
        unit="cm"
        points={series.length}
        targets={targetRanges(targets, "length")}
        reference={indonesianReference(sex, birthDate, "height")}
        birthDate={birthDate}
        childId={childId}
        onOpenPhoto={onOpenPhoto}
      />
    </section>
  );
}
