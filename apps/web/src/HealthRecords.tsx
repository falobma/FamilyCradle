import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { parseLocalizedDecimal } from "@familycradle/shared";

type Child = {
  id: string;
  name: string;
  dateOfBirth: string;
  birthWeightG: number;
  birthLengthMm: number | null;
  birthHeadCircMm: number | null;
  feedingMode: "breastmilk" | "formula" | "mixed";
  milkTargetMode: "auto" | "manual";
  milkTargetManualMl: number | null;
  version: number;
};
type HealthErrorShape = {
  error?: {
    code?: string;
    message?: string;
    details?: { percentChange?: number; days?: number };
  };
};
class HealthRequestError extends Error {
  readonly code: string;
  readonly details: { percentChange?: number; days?: number } | undefined;

  constructor(
    message: string,
    code: string,
    details?: { percentChange?: number; days?: number },
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
type GrowthItem = {
  id: string;
  measuredAt: string;
  weightG: number | null;
  lengthMm: number | null;
  headCircMm: number | null;
  note: string | null;
  version: number;
  createdByName: string;
  updatedByName: string;
  previousWeightDeltaG: number | null;
  daysSincePrevious: number | null;
  averageWeightDeltaGPerDay: number | null;
};
type VaccineItem = {
  id: string;
  definitionId: string | null;
  vaccineCode: string;
  customName: string | null;
  doseLabelId: string;
  doseLabelEn: string;
  category: "core" | "annual" | "optional_endemic" | "custom";
  dueDate: string;
  windowEndDate: string;
  givenDate: string | null;
  givenPlace: string | null;
  batchNumber: string | null;
  note: string | null;
  statusOverride: "skipped" | null;
  followOptional: boolean;
  isCustom: boolean;
  version: number;
  status: "skipped" | "done" | "upcoming" | "due_soon" | "due" | "late";
  notesId: string | null;
  notesEn: string | null;
  comboHintId: string | null;
  comboHintEn: string | null;
};
type MilestoneItem = {
  id: string;
  ageMonths: number;
  domain: string;
  textId: string;
  textEn: string;
  achieved: boolean;
  achievedOn: string | null;
  note: string | null;
  version: number;
};
type Summary = {
  today: string;
  ageDays: number;
  correctedAgeMonths: number;
  correctedAgeRemainderDays: number;
  isPremature: boolean;
  milkTarget: {
    targetMl: number | null;
    mode: "auto" | "manual" | "frequency";
    feedingMode: "breastmilk" | "formula" | "mixed";
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
  wakeWindow: {
    windowMinMinutes: number;
    windowMaxMinutes: number;
    suggestedStart: string | null;
    suggestedEnd: string | null;
    typicalNapsPerDay: string;
    typicalSleepHours: string;
  };
};
type HealthData = {
  summary: Summary;
  growth: {
    birthPoint: {
      measuredAt: string;
      weightG: number;
      lengthMm: number | null;
      headCircMm: number | null;
    };
    items: GrowthItem[];
  };
  vaccines: {
    items: VaccineItem[];
    options: Record<string, string>;
    counts: { done: number; total: number; late: number; optional: number };
    disclaimer: string;
  };
  milestones: {
    ageMonths: number;
    isPremature: boolean;
    currentCheckpoint: number;
    previousCheckpoint: number | null;
    items: MilestoneItem[];
    skillLossInfo: string;
  };
};

type Props = {
  children: Child[];
  role: "mom" | "dad" | "caregiver";
  onChildUpdated: () => Promise<void>;
};

const healthTabs = ["overview", "growth", "vaccines", "milestones"] as const;
type HealthTab = (typeof healthTabs)[number];
const domainKeys = [
  "social_emotional",
  "language_communication",
  "cognitive",
  "movement_physical",
] as const;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const options: RequestInit = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as HealthErrorShape | null;
    throw new HealthRequestError(
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.code ?? "",
      payload?.error?.details,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

async function fetchHealthData(childId: string): Promise<HealthData> {
  const [summary, growth, vaccines, milestones] = await Promise.all([
    api<Summary>(`/api/children/${childId}/health-summary`),
    api<HealthData["growth"]>(`/api/children/${childId}/growth`),
    api<HealthData["vaccines"]>(`/api/children/${childId}/vaccines`),
    api<HealthData["milestones"]>(`/api/children/${childId}/milestones`),
  ]);
  return { summary, growth, vaccines, milestones };
}

function numericValue(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = parseLocalizedDecimal(raw);
  if (parsed === null || parsed <= 0) {
    throw new Error(`${label}: ${raw}`);
  }
  return parsed;
}

export function HealthRecords({ children, role, onChildUpdated }: Props) {
  const { t, i18n } = useTranslation();
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<HealthTab>("overview");
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(children.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkpoint, setCheckpoint] = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [lengthInput, setLengthInput] = useState("");
  const [headInput, setHeadInput] = useState("");
  const [measurementDate, setMeasurementDate] = useState(localDate);
  const [customVaccineOpen, setCustomVaccineOpen] = useState(false);
  const [targetValue, setTargetValue] = useState("");
  const [milestoneDrafts, setMilestoneDrafts] = useState<
    Record<string, { achieved: boolean; achievedOn: string; note: string }>
  >({});

  const selectedChild = children.find((item) => item.id === selectedChildId);
  const canEditChild = role === "mom" || role === "dad";
  const language = i18n.resolvedLanguage?.startsWith("id") ? "id" : "en";
  const milkTarget = data?.summary.milkTarget;
  const milkProgressPercent = milkTarget?.progressPercent ?? 0;
  const milkProgressStatus =
    milkProgressPercent < 50
      ? "neutral"
      : milkProgressPercent < 100
        ? "amber"
        : "complete";
  const milkCelebrationStorageKey = data
    ? `familycradle:milk-target:${selectedChildId}:${data.summary.today}`
    : null;
  const showMilkTargetCelebration = Boolean(
    milkTarget &&
    milkTarget.targetMl !== null &&
    milkProgressPercent >= 100 &&
    milkCelebrationStorageKey &&
    localStorage.getItem(milkCelebrationStorageKey) !== "shown",
  );

  useEffect(() => {
    if (!showMilkTargetCelebration || !milkCelebrationStorageKey) return;
    localStorage.setItem(milkCelebrationStorageKey, "shown");
  }, [milkCelebrationStorageKey, showMilkTargetCelebration]);

  async function loadHealth(childId: string) {
    if (!childId) return;
    setLoading(true);
    setError("");
    try {
      const nextData = await fetchHealthData(childId);
      setData(nextData);
      setCheckpoint(null);
      setMilestoneDrafts(
        Object.fromEntries(
          nextData.milestones.items.map((item) => [
            item.id,
            {
              achieved: item.achieved,
              achievedOn: item.achievedOn ?? "",
              note: item.note ?? "",
            },
          ]),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("requestError"),
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedChildExists = children.some(
    (item) => item.id === selectedChildId,
  );
  if (!selectedChildExists) {
    const nextChildId = children[0]?.id ?? "";
    if (selectedChildId !== nextChildId) {
      setSelectedChildId(nextChildId);
      setLoading(Boolean(nextChildId));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadSelectedChild() {
      if (!selectedChildId) return;
      try {
        const nextData = await fetchHealthData(selectedChildId);
        if (cancelled) return;
        setData(nextData);
        setError("");
        setCheckpoint(null);
        setMilestoneDrafts(
          Object.fromEntries(
            nextData.milestones.items.map((item) => [
              item.id,
              {
                achieved: item.achieved,
                achievedOn: item.achievedOn ?? "",
                note: item.note ?? "",
              },
            ]),
          ),
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : t("requestError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSelectedChild();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, t]);

  const currentCheckpoints = useMemo(() => {
    if (!data) return [];
    return [
      data.milestones.currentCheckpoint,
      ...(data.milestones.previousCheckpoint
        ? [data.milestones.previousCheckpoint]
        : []),
    ];
  }, [data]);
  const visibleCheckpoints =
    checkpoint === null ? currentCheckpoints : [checkpoint];

  const nextVaccine = data?.vaccines.items
    .filter(
      (vaccine) =>
        vaccine.status !== "done" &&
        vaccine.status !== "skipped" &&
        (vaccine.category !== "optional_endemic" || vaccine.followOptional),
    )
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("requestError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveGrowth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChildId) return;
    const form = new FormData(event.currentTarget);
    let payload: Record<string, unknown>;
    try {
      const weightKg = numericValue(form.get("weightKg"), t("weightKg"));
      const lengthCm = numericValue(form.get("lengthCm"), t("lengthCm"));
      const headCm = numericValue(form.get("headCm"), t("headCircumference"));
      if (weightKg === null && lengthCm === null && headCm === null) {
        throw new Error(t("growthNeedsMeasurement"));
      }
      payload = {
        id: crypto.randomUUID(),
        measuredAt: measurementDate,
        weightG: weightKg === null ? null : Math.round(weightKg * 1000),
        lengthMm: lengthCm === null ? null : Math.round(lengthCm * 10),
        headCircMm: headCm === null ? null : Math.round(headCm * 10),
        place: form.get("place") || null,
        note: String(form.get("note") ?? "").trim() || null,
      };
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : t("requestError"),
      );
      return;
    }
    await perform(async () => {
      try {
        await api(`/api/children/${selectedChildId}/growth`, "POST", payload);
      } catch (requestError) {
        if (
          requestError instanceof HealthRequestError &&
          requestError.code === "CONFIRM_REQUIRED"
        ) {
          const percent = requestError.details?.percentChange ?? 0;
          const days = requestError.details?.days ?? 0;
          if (!window.confirm(t("growthConfirm", { percent, days }))) return;
          await api(`/api/children/${selectedChildId}/growth`, "POST", {
            ...payload,
            confirmLargeChange: true,
          });
        } else {
          throw requestError;
        }
      }
      setWeightInput("");
      setLengthInput("");
      setHeadInput("");
      setNotice(t("growthSaved"));
      await loadHealth(selectedChildId);
    });
  }

  async function updateVaccine(
    vaccine: VaccineItem,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    if (!selectedChildId) return;
    await perform(async () => {
      await api(
        `/api/children/${selectedChildId}/vaccines/${vaccine.id}`,
        "PATCH",
        { action, version: vaccine.version, ...extra },
      );
      await loadHealth(selectedChildId);
    });
  }

  async function switchVaccineOption(group: string, value: string) {
    if (!selectedChildId) return;
    await perform(async () => {
      await api(`/api/children/${selectedChildId}/vaccine-options`, "PUT", {
        group,
        value,
      });
      await loadHealth(selectedChildId);
    });
  }

  async function saveCustomVaccine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChildId) return;
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await api(`/api/children/${selectedChildId}/vaccines`, "POST", {
        name: form.get("name"),
        doseLabel: form.get("doseLabel"),
        dueDate: form.get("dueDate"),
        windowEndDate: form.get("windowEndDate"),
        note: form.get("note") || null,
      });
      setCustomVaccineOpen(false);
      setNotice(t("customVaccineSaved"));
      await loadHealth(selectedChildId);
    });
  }

  async function saveMilestone(item: MilestoneItem) {
    if (!selectedChildId) return;
    const draft = milestoneDrafts[item.id];
    if (!draft) return;
    await perform(async () => {
      await api(
        `/api/children/${selectedChildId}/milestones/${item.id}`,
        "PATCH",
        {
          version: item.version,
          achieved: draft.achieved,
          achievedOn: draft.achieved ? draft.achievedOn || null : null,
          note: draft.note.trim() || null,
        },
      );
      await loadHealth(selectedChildId);
    });
  }

  async function saveMilkTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChild) return;
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("milkTargetMode"));
    const target = mode === "manual" ? Number(form.get("targetMl")) : null;
    await perform(async () => {
      await api(`/api/children/${selectedChild.id}`, "PATCH", {
        version: selectedChild.version,
        milkTargetMode: mode,
        milkTargetManualMl: target,
      });
      await onChildUpdated();
      await loadHealth(selectedChild.id);
      setNotice(t("targetSaved"));
    });
  }

  function displayDateTime(value: string | null) {
    if (!value) return t("notAvailable");
    return new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function renderVaccine(vaccine: VaccineItem) {
    return (
      <li key={vaccine.id} className={`health-vaccine ${vaccine.status}`}>
        <div className="health-list-heading">
          <strong>
            {vaccine.customName ??
              (language === "id" ? vaccine.doseLabelId : vaccine.doseLabelEn)}
          </strong>
          <span className={`health-status ${vaccine.status}`}>
            {t(`vaccineStatus_${vaccine.status}`)}
          </span>
        </div>
        <span>
          {t("dueDate")}: {vaccine.dueDate}
          {vaccine.givenDate && ` · ${t("givenDate")}: ${vaccine.givenDate}`}
        </span>
        {vaccine.givenPlace && (
          <small>
            {t("givenPlace")}: {vaccine.givenPlace}
          </small>
        )}
        {vaccine.batchNumber && (
          <small>
            {t("batchNumber")}: {vaccine.batchNumber}
          </small>
        )}
        {vaccine.note && <small>{vaccine.note}</small>}
        {(language === "id" ? vaccine.notesId : vaccine.notesEn) && (
          <small>{language === "id" ? vaccine.notesId : vaccine.notesEn}</small>
        )}
        {(language === "id" ? vaccine.comboHintId : vaccine.comboHintEn) && (
          <small>
            {language === "id" ? vaccine.comboHintId : vaccine.comboHintEn}
          </small>
        )}
        {vaccine.category === "optional_endemic" && (
          <button
            className="portal-inline-button"
            disabled={busy}
            onClick={() =>
              void updateVaccine(vaccine, "follow_optional", {
                followOptional: !vaccine.followOptional,
              })
            }
            type="button"
          >
            {vaccine.followOptional
              ? t("stopFollowingOptional")
              : t("followOptional")}
          </button>
        )}
        <div className="health-actions">
          {vaccine.status === "done" ? (
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => void updateVaccine(vaccine, "undo_done")}
              type="button"
            >
              {t("undoDone")}
            </button>
          ) : vaccine.status === "skipped" ? (
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => void updateVaccine(vaccine, "undo_skip")}
              type="button"
            >
              {t("undoSkip")}
            </button>
          ) : (
            <>
              <details>
                <summary>{t("markDone")}</summary>
                <form
                  className="health-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void updateVaccine(vaccine, "mark_done", {
                      givenDate: form.get("givenDate"),
                      givenPlace:
                        String(form.get("givenPlace") ?? "").trim() || null,
                      batchNumber:
                        String(form.get("batchNumber") ?? "").trim() || null,
                      note: String(form.get("note") ?? "").trim() || null,
                    });
                  }}
                >
                  <label>
                    {t("givenDate")}
                    <input
                      defaultValue={localDate()}
                      max={localDate()}
                      name="givenDate"
                      required
                      type="date"
                    />
                  </label>
                  <label>
                    {t("givenPlace")}
                    <input maxLength={120} name="givenPlace" />
                  </label>
                  <label>
                    {t("batchNumber")}
                    <input maxLength={80} name="batchNumber" />
                  </label>
                  <label>
                    {t("note")}
                    <textarea maxLength={500} name="note" />
                  </label>
                  <button className="portal-secondary" disabled={busy}>
                    {t("save")}
                  </button>
                </form>
              </details>
              <button
                className="portal-secondary"
                disabled={busy}
                onClick={() => void updateVaccine(vaccine, "skip")}
                type="button"
              >
                {t("markSkipped")}
              </button>
            </>
          )}
          {vaccine.isCustom && (
            <button
              className="portal-inline-button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await api(
                    `/api/children/${selectedChildId}/vaccines/${vaccine.id}`,
                    "DELETE",
                    { version: vaccine.version },
                  );
                  await loadHealth(selectedChildId);
                })
              }
              type="button"
            >
              {t("delete")}
            </button>
          )}
        </div>
        <details>
          <summary>{t("reschedule")}</summary>
          <form
            className="health-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void updateVaccine(vaccine, "reschedule", {
                dueDate: form.get("dueDate"),
                windowEndDate: form.get("windowEndDate"),
              });
            }}
          >
            <label>
              {t("dueDate")}
              <input
                defaultValue={vaccine.dueDate}
                name="dueDate"
                required
                type="date"
              />
            </label>
            <label>
              {t("windowEndDate")}
              <input
                defaultValue={vaccine.windowEndDate}
                name="windowEndDate"
                required
                type="date"
              />
            </label>
            <button className="portal-secondary" disabled={busy}>
              {t("save")}
            </button>
          </form>
        </details>
      </li>
    );
  }

  if (children.length === 0) return null;

  return (
    <section className="health-records" aria-labelledby="health-title">
      <div className="health-heading">
        <div>
          <p className="eyebrow">{t("healthEyebrow")}</p>
          <h2 id="health-title">{t("healthTitle")}</h2>
        </div>
        <label>
          {t("healthChild")}
          <select
            value={selectedChildId}
            onChange={(event) => {
              setLoading(true);
              setError("");
              setSelectedChildId(event.currentTarget.value);
            }}
          >
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="health-tabs" role="tablist" aria-label={t("healthTitle")}>
        {healthTabs.map((tab) => (
          <button
            key={tab}
            aria-selected={activeTab === tab}
            className="portal-secondary"
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {t(`healthTab_${tab}`)}
          </button>
        ))}
      </div>
      {error && (
        <p className="portal-message portal-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="portal-message portal-notice" role="status">
          {notice}
        </p>
      )}
      {loading && (
        <p className="portal-loading" role="status">
          {t("loading")}
        </p>
      )}
      {data && (
        <>
          {data.summary.isPremature && data.summary.correctedAgeMonths < 24 && (
            <p className="health-corrected-age">
              {t("correctedAgeBadge", {
                months: data.summary.correctedAgeMonths,
                days: data.summary.correctedAgeRemainderDays,
              })}
            </p>
          )}
          {activeTab === "overview" && (
            <>
              <p className="health-review-warning">
                {t("medicalReviewNeeded")}
              </p>
              <div className="health-grid">
                <article className="health-card">
                  <h3>{t("milkTargetTitle")}</h3>
                  {data.summary.milkTarget.targetMl === null ? (
                    <>
                      <p>
                        {t("feedingFrequency", {
                          count: data.summary.milkTarget.feedingCountToday,
                        })}
                      </p>
                      {data.summary.milkTarget.feedingMode === "breastmilk" &&
                        data.summary.milkTarget.ageMonths < 1 && (
                          <small>{t("feedingFrequencyReference")}</small>
                        )}
                    </>
                  ) : (
                    <>
                      <strong>
                        {t("mlPerDay", {
                          amount: data.summary.milkTarget.targetMl,
                        })}
                      </strong>
                      <p>
                        {t("milkProgress", {
                          consumed: data.summary.milkTarget.consumedMlToday,
                          target: data.summary.milkTarget.targetMl,
                          percent: data.summary.milkTarget.progressPercent ?? 0,
                        })}
                      </p>
                      <div
                        aria-label={t("milkTargetTitle")}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.min(
                          100,
                          Math.max(0, milkProgressPercent),
                        )}
                        className={`health-progress ${milkProgressStatus}`}
                        role="meter"
                      >
                        <span
                          style={{
                            width: `${Math.min(100, Math.max(0, milkProgressPercent))}%`,
                          }}
                        />
                      </div>
                      {showMilkTargetCelebration && (
                        <p className="health-goal-reached" role="status">
                          {t("milkTargetReached")}
                        </p>
                      )}
                      {data.summary.milkTarget.rangeMinMl !== null && (
                        <p>
                          {t("milkRange", {
                            min: data.summary.milkTarget.rangeMinMl,
                            max: data.summary.milkTarget.rangeMaxMl,
                          })}
                        </p>
                      )}
                      {data.summary.milkTarget.suggestedPerFeedMl !== null && (
                        <p>
                          {t("suggestedPerFeed", {
                            amount: data.summary.milkTarget.suggestedPerFeedMl,
                          })}
                        </p>
                      )}
                    </>
                  )}
                  {data.summary.milkTarget.feedingMode === "mixed" && (
                    <small>{t("mixedMilkTargetHint")}</small>
                  )}
                  {data.summary.milkTarget.weightIsStale && (
                    <p className="health-warning">{t("staleWeight")}</p>
                  )}
                  <small>{data.summary.milkTarget.disclaimer}</small>
                  {canEditChild && selectedChild && (
                    <form
                      className="health-inline-form"
                      onSubmit={saveMilkTarget}
                    >
                      <label>
                        {t("targetMode")}
                        <select
                          defaultValue={selectedChild.milkTargetMode}
                          name="milkTargetMode"
                          onChange={(event) =>
                            setTargetValue(event.currentTarget.value)
                          }
                        >
                          <option value="auto">{t("automatic")}</option>
                          <option value="manual">{t("manual")}</option>
                        </select>
                      </label>
                      {(targetValue || selectedChild.milkTargetMode) ===
                        "manual" && (
                        <label>
                          {t("manualTargetMl")}
                          <input
                            defaultValue={
                              selectedChild.milkTargetManualMl ?? ""
                            }
                            max={1500}
                            min={100}
                            name="targetMl"
                            required
                            type="number"
                          />
                        </label>
                      )}
                      <button className="portal-secondary" disabled={busy}>
                        {t("save")}
                      </button>
                    </form>
                  )}
                </article>
                <article className="health-card">
                  <h3>{t("wakeWindowTitle")}</h3>
                  <p>
                    {t("wakeWindowRange", {
                      min: data.summary.wakeWindow.windowMinMinutes,
                      max: data.summary.wakeWindow.windowMaxMinutes,
                    })}
                  </p>
                  {data.summary.wakeWindow.suggestedStart && (
                    <p>
                      {t("nextSleepSuggestion", {
                        start: displayDateTime(
                          data.summary.wakeWindow.suggestedStart,
                        ),
                        end: displayDateTime(
                          data.summary.wakeWindow.suggestedEnd,
                        ),
                      })}
                    </p>
                  )}
                  <small>
                    {t("typicalSleep", {
                      naps: data.summary.wakeWindow.typicalNapsPerDay,
                      hours: data.summary.wakeWindow.typicalSleepHours,
                    })}
                  </small>
                </article>
                <article className="health-card">
                  <h3>{t("growthTitle")}</h3>
                  <p>
                    {t("birthPoint")}: {data.growth.birthPoint.weightG} g
                    {data.growth.birthPoint.lengthMm !== null &&
                      ` · ${data.growth.birthPoint.lengthMm / 10} cm`}
                  </p>
                  <p>{t("growthCount", { count: data.growth.items.length })}</p>
                </article>
                <article className="health-card">
                  <h3>{t("vaccineTitle")}</h3>
                  <p>
                    {t("vaccineCounts", {
                      done: data.vaccines.counts.done,
                      total: data.vaccines.counts.total,
                      late: data.vaccines.counts.late,
                    })}
                  </p>
                  <small>{data.vaccines.disclaimer}</small>
                </article>
              </div>
            </>
          )}
          {activeTab === "growth" && (
            <div className="health-card">
              <h3>{t("growthTitle")}</h3>
              <p>
                {t("birthPoint")}: {data.growth.birthPoint.weightG} g
              </p>
              <form className="health-form" onSubmit={saveGrowth}>
                <label>
                  {t("measurementDate")}
                  <input
                    max={localDate()}
                    min={selectedChild?.dateOfBirth}
                    onChange={(event) =>
                      setMeasurementDate(event.currentTarget.value)
                    }
                    required
                    type="date"
                    value={measurementDate}
                  />
                </label>
                <label>
                  {t("weightKg")}
                  <input
                    inputMode="decimal"
                    name="weightKg"
                    onChange={(event) =>
                      setWeightInput(event.currentTarget.value)
                    }
                    placeholder="7,45"
                    type="text"
                    value={weightInput}
                  />
                </label>
                <label>
                  {t("lengthCm")}
                  <input
                    inputMode="decimal"
                    name="lengthCm"
                    onChange={(event) =>
                      setLengthInput(event.currentTarget.value)
                    }
                    placeholder="65,0"
                    type="text"
                    value={lengthInput}
                  />
                </label>
                <label>
                  {t("headCircumference")}
                  <input
                    inputMode="decimal"
                    name="headCm"
                    onChange={(event) =>
                      setHeadInput(event.currentTarget.value)
                    }
                    placeholder="42,0"
                    type="text"
                    value={headInput}
                  />
                </label>
                <label>
                  {t("measurementPlace")}
                  <select defaultValue="home" name="place">
                    <option value="home">{t("home")}</option>
                    <option value="posyandu">Posyandu</option>
                    <option value="clinic_doctor">{t("clinic")}</option>
                    <option value="hospital">{t("hospital")}</option>
                    <option value="other">{t("other")}</option>
                  </select>
                </label>
                <label>
                  {t("note")}
                  <textarea maxLength={500} name="note" />
                </label>
                <button className="portal-primary" disabled={busy}>
                  {t("saveMeasurement")}
                </button>
              </form>
              <ul className="health-list">
                {data.growth.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.measuredAt}</strong>
                    <span>
                      {item.weightG === null
                        ? ""
                        : `${(item.weightG / 1000).toFixed(2)} kg`}
                      {item.lengthMm === null
                        ? ""
                        : ` · ${(item.lengthMm / 10).toFixed(1)} cm`}
                      {item.headCircMm === null
                        ? ""
                        : ` · ${(item.headCircMm / 10).toFixed(1)} cm`}
                    </span>
                    {item.previousWeightDeltaG !== null && (
                      <small>
                        {t("growthDelta", {
                          delta: item.previousWeightDeltaG,
                          days: item.daysSincePrevious,
                          perDay: item.averageWeightDeltaGPerDay ?? 0,
                        })}
                      </small>
                    )}
                    {item.note && <small>{item.note}</small>}
                    <small>
                      {t("createdBy")} {item.createdByName}
                      {item.updatedByName !== item.createdByName &&
                        ` · ${t("editedBy")} ${item.updatedByName}`}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activeTab === "vaccines" && (
            <div className="health-card">
              <h3>{t("vaccineTitle")}</h3>
              <p className="health-review-warning">
                {t("medicalReviewNeeded")}
              </p>
              <p>{t("vaccineDisclaimer")}</p>
              <p>
                {t("vaccineCounts", {
                  done: data.vaccines.counts.done,
                  total: data.vaccines.counts.total,
                  late: data.vaccines.counts.late,
                })}
                {nextVaccine &&
                  ` · ${t("vaccineNextDose", {
                    name:
                      language === "id"
                        ? nextVaccine.doseLabelId
                        : nextVaccine.doseLabelEn,
                    date: nextVaccine.dueDate,
                  })}`}
              </p>
              <div className="health-option-row">
                <label>
                  {t("dtpSchedule")}
                  <select
                    value={data.vaccines.options.DTP_SCHEDULE ?? "2-3-4"}
                    onChange={(event) =>
                      void switchVaccineOption(
                        "DTP_SCHEDULE",
                        event.currentTarget.value,
                      )
                    }
                  >
                    <option value="2-3-4">2–3–4</option>
                    <option value="2-4-6">2–4–6</option>
                  </select>
                </label>
                <label>
                  {t("rotavirusProduct")}
                  <select
                    value={data.vaccines.options.ROTA_PRODUCT ?? "RV1"}
                    onChange={(event) =>
                      void switchVaccineOption(
                        "ROTA_PRODUCT",
                        event.currentTarget.value,
                      )
                    }
                  >
                    <option value="RV1">RV1</option>
                    <option value="RV5">RV5</option>
                  </select>
                </label>
                <button
                  className="portal-secondary"
                  onClick={() => setCustomVaccineOpen(!customVaccineOpen)}
                  type="button"
                >
                  {t("addCustomVaccine")}
                </button>
              </div>
              {customVaccineOpen && (
                <form className="health-form" onSubmit={saveCustomVaccine}>
                  <label>
                    {t("vaccineName")}
                    <input maxLength={80} name="name" required />
                  </label>
                  <label>
                    {t("doseLabel")}
                    <input maxLength={60} name="doseLabel" required />
                  </label>
                  <label>
                    {t("dueDate")}
                    <input
                      min={selectedChild?.dateOfBirth}
                      name="dueDate"
                      required
                      type="date"
                    />
                  </label>
                  <label>
                    {t("windowEndDate")}
                    <input name="windowEndDate" required type="date" />
                  </label>
                  <label>
                    {t("note")}
                    <textarea maxLength={500} name="note" />
                  </label>
                  <button className="portal-primary" disabled={busy}>
                    {t("save")}
                  </button>
                </form>
              )}
              <ul className="health-list">
                {data.vaccines.items
                  .filter((vaccine) => vaccine.category !== "optional_endemic")
                  .map(renderVaccine)}
              </ul>
              {data.vaccines.items.some(
                (vaccine) => vaccine.category === "optional_endemic",
              ) && (
                <details className="health-optional-vaccines">
                  <summary>{t("optionalEndemicVaccines")}</summary>
                  <ul className="health-list">
                    {data.vaccines.items
                      .filter(
                        (vaccine) => vaccine.category === "optional_endemic",
                      )
                      .map(renderVaccine)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {activeTab === "milestones" && (
            <div className="health-card">
              <h3>{t("milestoneTitle")}</h3>
              <p className="health-review-warning">
                {t("milestoneSourceReview")}
              </p>
              <p>{t("skillLossInfo")}</p>
              <div className="health-checkpoint-row">
                <button
                  aria-pressed={checkpoint === null}
                  className="portal-secondary"
                  onClick={() => setCheckpoint(null)}
                  type="button"
                >
                  {t("milestoneCurrentAndPrevious")}
                </button>
                {currentCheckpoints.map((age) => (
                  <button
                    key={age}
                    aria-pressed={checkpoint === age}
                    className="portal-secondary"
                    onClick={() => setCheckpoint(age)}
                    type="button"
                  >
                    {t("checkpointMonths", { age })}
                  </button>
                ))}
              </div>
              {visibleCheckpoints.map((age) => (
                <section className="health-checkpoint-group" key={age}>
                  <h4>{t("checkpointMonths", { age })}</h4>
                  {domainKeys.map((domain) => {
                    const items = data.milestones.items.filter(
                      (item) =>
                        item.ageMonths === age && item.domain === domain,
                    );
                    if (items.length === 0) return null;
                    return (
                      <section
                        className="health-milestone-group"
                        key={`${age}-${domain}`}
                      >
                        <h5>{t(`milestoneDomain_${domain}`)}</h5>
                        <ul className="health-list">
                          {items.map((item) => {
                            const draft = milestoneDrafts[item.id] ?? {
                              achieved: item.achieved,
                              achievedOn: item.achievedOn ?? "",
                              note: item.note ?? "",
                            };
                            return (
                              <li key={item.id}>
                                <label className="health-checkbox">
                                  <input
                                    checked={draft.achieved}
                                    onChange={(event) =>
                                      setMilestoneDrafts((current) => ({
                                        ...current,
                                        [item.id]: {
                                          ...draft,
                                          achieved: event.currentTarget.checked,
                                          achievedOn: event.currentTarget
                                            .checked
                                            ? draft.achievedOn || localDate()
                                            : "",
                                        },
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  <span>
                                    {language === "id"
                                      ? item.textId
                                      : item.textEn}
                                  </span>
                                </label>
                                {draft.achieved && (
                                  <label>
                                    {t("achievedOn")}
                                    <input
                                      max={localDate()}
                                      min={selectedChild?.dateOfBirth}
                                      onChange={(event) =>
                                        setMilestoneDrafts((current) => ({
                                          ...current,
                                          [item.id]: {
                                            ...draft,
                                            achievedOn:
                                              event.currentTarget.value,
                                          },
                                        }))
                                      }
                                      type="date"
                                      value={draft.achievedOn}
                                    />
                                  </label>
                                )}
                                <label>
                                  {t("note")}
                                  <input
                                    maxLength={500}
                                    onChange={(event) =>
                                      setMilestoneDrafts((current) => ({
                                        ...current,
                                        [item.id]: {
                                          ...draft,
                                          note: event.currentTarget.value,
                                        },
                                      }))
                                    }
                                    value={draft.note}
                                  />
                                </label>
                                <button
                                  className="portal-secondary"
                                  disabled={busy}
                                  onClick={() => void saveMilestone(item)}
                                  type="button"
                                >
                                  {t("save")}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
