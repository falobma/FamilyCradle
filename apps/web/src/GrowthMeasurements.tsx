import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CreateGrowthTargetSchema,
  parseLocalizedDecimal,
} from "@familycradle/shared";
import { healthApi, HealthRequestError } from "./healthApi";
import { encodeGrowthPhoto } from "./growth-photo";
import type { GrowthTarget } from "./growth-trends";

const GrowthTrends = lazy(() => import("./GrowthTrends"));

type Child = {
  id: string;
  name: string;
  dateOfBirth: string;
  sex: "male" | "female";
};
type GrowthData = {
  birthPoint: {
    weightG: number;
    lengthMm: number | null;
    headCircMm: number | null;
  };
  items: Array<{
    id: string;
    version: number;
    measuredAt: string;
    createdAt: string;
    weightG: number | null;
    lengthMm: number | null;
    headCircMm: number | null;
    place: "home" | "posyandu" | "clinic_doctor" | "hospital" | "other" | null;
    note: string | null;
    hasPhoto: boolean;
    createdByName: string;
    updatedByName: string;
    previousWeightDeltaG: number | null;
    daysSincePrevious: number | null;
    averageWeightDeltaGPerDay: number | null;
  }>;
  targets: GrowthTarget[];
};

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function numericValue(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = parseLocalizedDecimal(raw);
  if (parsed === null || parsed <= 0) throw new Error(`${label}: ${raw}`);
  return parsed;
}

export function GrowthMeasurements({
  child,
  revision = 0,
  onSaved,
  showTrends = false,
  historyOnly = false,
}: {
  child: Child;
  revision?: number;
  onSaved?: () => Promise<void>;
  showTrends?: boolean;
  historyOnly?: boolean;
}) {
  return (
    <ChildGrowthMeasurements
      key={child.id}
      child={child}
      revision={revision}
      onSaved={onSaved}
      showTrends={showTrends}
      historyOnly={historyOnly}
    />
  );
}

function ChildGrowthMeasurements({
  child,
  revision,
  onSaved,
  showTrends,
  historyOnly,
}: {
  child: Child;
  revision: number;
  onSaved: (() => Promise<void>) | undefined;
  showTrends: boolean;
  historyOnly: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [editing, setEditing] = useState<GrowthData["items"][number] | null>(
    null,
  );
  const [conflict, setConflict] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const photoDialogRef = useRef<HTMLDialogElement>(null);
  const photoDialogTitleId = useId();
  const path = `/api/children/${child.id}/growth`;

  useEffect(() => {
    const dialog = photoDialogRef.current;
    if (!dialog) return;
    if (openPhotoId && !dialog.open) dialog.showModal();
    else if (!openPhotoId && dialog.open) dialog.close();
  }, [openPhotoId]);

  function showPhoto(id: string) {
    setPhotoError(false);
    setOpenPhotoId(id);
  }

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    healthApi<GrowthData>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
          setRefreshFailed(false);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setRefreshFailed(true);
          setError(
            requestError instanceof Error
              ? requestError.message
              : t("requestError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision, retry, t, editing]);

  function measurementFields(form: FormData) {
    const weightKg = numericValue(form.get("weightKg"), t("weightKg"));
    const lengthCm = numericValue(form.get("lengthCm"), t("lengthCm"));
    const headCm = numericValue(form.get("headCm"), t("headCircumference"));
    if (weightKg === null && lengthCm === null && headCm === null) {
      throw new Error(t("growthNeedsMeasurement"));
    }
    return {
      measuredAt: form.get("measuredAt"),
      weightG: weightKg === null ? null : Math.round(weightKg * 1000),
      lengthMm: lengthCm === null ? null : Math.round(lengthCm * 10),
      headCircMm: headCm === null ? null : Math.round(headCm * 10),
      place: form.get("place") || null,
      note: String(form.get("note") ?? "").trim() || null,
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setNotice("");
    let payload: Record<string, unknown>;
    try {
      payload = {
        id: crypto.randomUUID(),
        ...measurementFields(form),
      };
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : t("requestError"),
      );
      return;
    }

    setBusy(true);
    try {
      if (selectedPhoto) {
        try {
          payload.photo = await encodeGrowthPhoto(selectedPhoto);
        } catch {
          setError(t("growthPhotoInvalid"));
          return;
        }
      }
      try {
        await healthApi(path, "POST", payload);
      } catch (requestError) {
        if (
          !(requestError instanceof HealthRequestError) ||
          requestError.code !== "CONFIRM_REQUIRED"
        ) {
          throw requestError;
        }
        const percent = requestError.details?.percentChange ?? 0;
        const days = requestError.details?.days ?? 0;
        if (!window.confirm(t("growthConfirm", { percent, days }))) return;
        await healthApi(path, "POST", { ...payload, confirmLargeChange: true });
      }
      formElement.reset();
      setSelectedPhoto(null);
      setNotice(t("growthSaved"));
      setData(await healthApi<GrowthData>(path));
      await onSaved?.();
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

  async function updateMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError("");
    setNotice("");
    setConflict(false);
    let payload: ReturnType<typeof measurementFields> & { version: number };
    try {
      payload = {
        ...measurementFields(new FormData(event.currentTarget)),
        version: editing.version,
      };
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : t("requestError"),
      );
      return;
    }
    setBusy(true);
    let updated = false;
    try {
      const itemPath = `${path}/${editing.id}`;
      try {
        await healthApi(itemPath, "PATCH", payload);
      } catch (requestError) {
        if (
          !(requestError instanceof HealthRequestError) ||
          requestError.code !== "CONFIRM_REQUIRED"
        )
          throw requestError;
        const percent = requestError.details?.percentChange ?? 0;
        const days = requestError.details?.days ?? 0;
        if (!window.confirm(t("growthConfirm", { percent, days }))) return;
        await healthApi(itemPath, "PATCH", {
          ...payload,
          confirmLargeChange: true,
        });
      }
      updated = true;
      setEditing(null);
      setNotice(t("growthUpdated"));
      setData(await healthApi<GrowthData>(path));
      await onSaved?.();
    } catch (requestError) {
      if (updated) {
        setRefreshFailed(true);
        setError(t("growthRefreshFailed"));
        return;
      }
      const isConflict =
        requestError instanceof HealthRequestError &&
        (requestError.code === "CONFLICT" || requestError.code === "NOT_FOUND");
      setConflict(isConflict);
      setError(
        isConflict
          ? t("growthMeasurementConflict")
          : requestError instanceof Error
            ? requestError.message
            : t("requestError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteMeasurement(item: GrowthData["items"][number]) {
    if (
      !window.confirm(
        t(item.hasPhoto ? "growthDeletePhotoConfirm" : "growthDeleteConfirm", {
          date: item.measuredAt,
        }),
      )
    )
      return;
    setError("");
    setNotice("");
    setConflict(false);
    setBusy(true);
    let deleted = false;
    try {
      await healthApi(`${path}/${item.id}`, "DELETE", {
        version: item.version,
      });
      deleted = true;
      if (editing?.id === item.id) setEditing(null);
      setNotice(t("growthDeleted"));
      setData(await healthApi<GrowthData>(path));
      await onSaved?.();
    } catch (requestError) {
      if (deleted) {
        setRefreshFailed(true);
        setError(t("growthRefreshFailed"));
        return;
      }
      const isConflict =
        requestError instanceof HealthRequestError &&
        (requestError.code === "CONFLICT" || requestError.code === "NOT_FOUND");
      setConflict(isConflict);
      setError(
        isConflict
          ? t("growthMeasurementConflict")
          : requestError instanceof Error
            ? requestError.message
            : t("requestError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setNotice("");
    let payload: ReturnType<typeof CreateGrowthTargetSchema.parse>;
    try {
      const weightMin = numericValue(
        form.get("weightMin"),
        t("growthWeightMin"),
      );
      const weightMax = numericValue(
        form.get("weightMax"),
        t("growthWeightMax"),
      );
      const lengthMin = numericValue(
        form.get("lengthMin"),
        t("growthLengthMin"),
      );
      const lengthMax = numericValue(
        form.get("lengthMax"),
        t("growthLengthMax"),
      );
      if (
        (
          [
            [weightMin, 1000],
            [weightMax, 1000],
            [lengthMin, 10],
            [lengthMax, 10],
          ] as const
        ).some(
          ([value, factor]) =>
            value !== null &&
            Math.abs(value * factor - Math.round(value * factor)) > 1e-7,
        )
      ) {
        throw new Error(t("growthTargetPrecision"));
      }
      const result = CreateGrowthTargetSchema.safeParse({
        id: crypto.randomUUID(),
        targetDate: form.get("targetDate"),
        weightMinG: weightMin === null ? null : Math.round(weightMin * 1000),
        weightMaxG: weightMax === null ? null : Math.round(weightMax * 1000),
        lengthMinMm: lengthMin === null ? null : Math.round(lengthMin * 10),
        lengthMaxMm: lengthMax === null ? null : Math.round(lengthMax * 10),
      });
      if (
        !result.success ||
        (weightMin !== null && weightMax !== null && weightMin > weightMax) ||
        (lengthMin !== null && lengthMax !== null && lengthMin > lengthMax)
      ) {
        throw new Error(t("growthTargetInvalid"));
      }
      payload = result.data;
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : t("requestError"),
      );
      return;
    }
    setBusy(true);
    try {
      await healthApi(
        `/api/children/${child.id}/growth-targets`,
        "POST",
        payload,
      );
      formElement.reset();
      setData(await healthApi<GrowthData>(path));
      setNotice(t("growthTargetSaved"));
      await onSaved?.();
    } catch (requestError) {
      setError(
        requestError instanceof HealthRequestError &&
          requestError.code === "CONFLICT"
          ? t("growthTargetConflict")
          : requestError instanceof Error
            ? requestError.message
            : t("requestError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeTarget(target: GrowthTarget) {
    if (
      !window.confirm(
        t("growthTargetRemoveConfirm", { date: target.targetDate }),
      )
    )
      return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await healthApi(
        `/api/children/${child.id}/growth-targets/${target.id}`,
        "DELETE",
        { version: target.version },
      );
      setData(await healthApi<GrowthData>(path));
      setNotice(t("growthTargetRemoved"));
      await onSaved?.();
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

  return (
    <div className="health-card">
      <h3>{t("growthTitle")}</h3>
      {error && !editing && (
        <p className="portal-message portal-error" role="alert">
          {error}
        </p>
      )}
      {error && (!data || refreshFailed) && (
        <button
          className="portal-secondary"
          type="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          {t("retry")}
        </button>
      )}
      {conflict && !editing && (
        <button
          className="portal-secondary"
          type="button"
          onClick={() => {
            setEditing(null);
            setConflict(false);
            setRetry((value) => value + 1);
          }}
        >
          {t("growthReloadDiscard")}
        </button>
      )}
      {notice && (
        <p className="portal-message portal-notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p role="status">{t("loading")}</p>}
      {data && (
        <>
          {showTrends && (
            <Suspense fallback={<p role="status">{t("loading")}</p>}>
              <GrowthTrends
                birthDate={child.dateOfBirth}
                sex={child.sex}
                birth={data.birthPoint}
                measurements={data.items}
                targets={data.targets}
                childId={child.id}
                onOpenPhoto={showPhoto}
              />
            </Suspense>
          )}
          {!historyOnly && (
            <p>
              {t("birthPoint")}: {data.birthPoint.weightG} g
              {data.birthPoint.lengthMm !== null &&
                ` · ${data.birthPoint.lengthMm / 10} cm`}
              {data.birthPoint.headCircMm !== null &&
                ` · ${data.birthPoint.headCircMm / 10} cm`}
            </p>
          )}
          {!historyOnly && (
            <form
              className="health-form"
              onSubmit={(event) => void save(event)}
            >
              <label>
                {t("measurementDate")}
                <input
                  defaultValue={localDate()}
                  max={localDate()}
                  min={child.dateOfBirth}
                  name="measuredAt"
                  required
                  type="date"
                />
              </label>
              <label>
                {t("weightKg")}
                <input
                  inputMode="decimal"
                  name="weightKg"
                  placeholder="7,45"
                  type="text"
                />
              </label>
              <label>
                {t("lengthCm")}
                <input
                  inputMode="decimal"
                  name="lengthCm"
                  placeholder="65,0"
                  type="text"
                />
              </label>
              <label>
                {t("headCircumference")}
                <input
                  inputMode="decimal"
                  name="headCm"
                  placeholder="42,0"
                  type="text"
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
              <label>
                {t("growthPhotoChoose")}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedPhoto(event.currentTarget.files?.[0] ?? null);
                  }}
                />
              </label>
              <small>{t("growthPhotoHint")}</small>
              {selectedPhoto && (
                <small>
                  {t("growthPhotoSelected", { name: selectedPhoto.name })}
                </small>
              )}
              <button className="portal-primary" disabled={busy}>
                {t("saveMeasurement")}
              </button>
            </form>
          )}
          {data.items.length === 0 && <p>{t("noGrowthMeasurements")}</p>}
          <ul className="health-list">
            {(historyOnly ? [...data.items].reverse() : data.items).map(
              (item) => (
                <li key={item.id}>
                  <strong>{item.measuredAt}</strong>
                  {item.weightG !== null && (
                    <span>
                      {t("weightKg")}: {(item.weightG / 1000).toFixed(2)}
                    </span>
                  )}
                  {item.lengthMm !== null && (
                    <span>
                      {t("lengthCm")}: {(item.lengthMm / 10).toFixed(1)}
                    </span>
                  )}
                  {item.headCircMm !== null && (
                    <span>
                      {t("headCircumference")}:{" "}
                      {(item.headCircMm / 10).toFixed(1)}
                    </span>
                  )}
                  {item.previousWeightDeltaG !== null && (
                    <small>
                      {t("growthDelta", {
                        delta: item.previousWeightDeltaG,
                        days: item.daysSincePrevious,
                        perDay: item.averageWeightDeltaGPerDay ?? 0,
                      })}
                    </small>
                  )}
                  {historyOnly && editing?.id !== item.id && (
                    <div className="health-actions">
                      <button
                        className="portal-secondary"
                        type="button"
                        disabled={busy || editing !== null || refreshFailed}
                        onClick={() => {
                          setError("");
                          setNotice("");
                          setConflict(false);
                          setEditing(item);
                        }}
                      >
                        {t("editChild")}
                      </button>
                      <button
                        className="portal-secondary"
                        type="button"
                        disabled={busy || editing !== null || refreshFailed}
                        onClick={() => void deleteMeasurement(item)}
                      >
                        {t("growthDelete")}
                      </button>
                    </div>
                  )}
                  {historyOnly && editing?.id === item.id && (
                    <form
                      className="health-form"
                      onSubmit={(event) => void updateMeasurement(event)}
                    >
                      {error && (
                        <p className="portal-message portal-error" role="alert">
                          {error}
                        </p>
                      )}
                      {conflict && (
                        <button
                          className="portal-secondary"
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setConflict(false);
                            setRetry((value) => value + 1);
                          }}
                        >
                          {t("growthReloadDiscard")}
                        </button>
                      )}
                      <label>
                        {t("measurementDate")}
                        <input
                          name="measuredAt"
                          type="date"
                          defaultValue={editing.measuredAt}
                          min={child.dateOfBirth}
                          max={localDate()}
                          required
                        />
                      </label>
                      <label>
                        {t("weightKg")}
                        <input
                          name="weightKg"
                          type="text"
                          inputMode="decimal"
                          defaultValue={
                            editing.weightG === null
                              ? ""
                              : editing.weightG / 1000
                          }
                        />
                      </label>
                      <label>
                        {t("lengthCm")}
                        <input
                          name="lengthCm"
                          type="text"
                          inputMode="decimal"
                          defaultValue={
                            editing.lengthMm === null
                              ? ""
                              : editing.lengthMm / 10
                          }
                        />
                      </label>
                      <label>
                        {t("headCircumference")}
                        <input
                          name="headCm"
                          type="text"
                          inputMode="decimal"
                          defaultValue={
                            editing.headCircMm === null
                              ? ""
                              : editing.headCircMm / 10
                          }
                        />
                      </label>
                      <label>
                        {t("measurementPlace")}
                        <select name="place" defaultValue={editing.place ?? ""}>
                          <option value="">
                            {t("growthPlaceUnspecified")}
                          </option>
                          <option value="home">{t("home")}</option>
                          <option value="posyandu">Posyandu</option>
                          <option value="clinic_doctor">{t("clinic")}</option>
                          <option value="hospital">{t("hospital")}</option>
                          <option value="other">{t("other")}</option>
                        </select>
                      </label>
                      <label>
                        {t("note")}
                        <textarea
                          name="note"
                          maxLength={500}
                          defaultValue={editing.note ?? ""}
                        />
                      </label>
                      <div className="health-actions">
                        <button
                          className="portal-primary"
                          disabled={busy || conflict}
                        >
                          {t("save")}
                        </button>
                        <button
                          className="portal-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditing(null);
                            setError("");
                            setConflict(false);
                          }}
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </form>
                  )}
                  {item.note && <small>{item.note}</small>}
                  {item.hasPhoto && (
                    <button
                      className="portal-secondary"
                      type="button"
                      onClick={() => showPhoto(item.id)}
                    >
                      {t("growthPhotoViewDate", { date: item.measuredAt })}
                    </button>
                  )}
                  <small>
                    {t("createdBy")} {item.createdByName}
                    {item.updatedByName !== item.createdByName &&
                      ` · ${t("editedBy")} ${item.updatedByName}`}
                  </small>
                </li>
              ),
            )}
          </ul>
          {showTrends && (
            <details>
              <summary>{t("growthTargets")}</summary>
              <p>{t("growthTargetInstructions")}</p>
              <form
                className="health-form"
                onSubmit={(event) => void saveTarget(event)}
              >
                <label>
                  {t("growthTargetDate")}
                  <input
                    name="targetDate"
                    type="date"
                    min={child.dateOfBirth}
                    required
                  />
                </label>
                <label>
                  {t("growthWeightMin")}
                  <input
                    name="weightMin"
                    type="text"
                    inputMode="decimal"
                    placeholder="5,0"
                  />
                </label>
                <label>
                  {t("growthWeightMax")}
                  <input
                    name="weightMax"
                    type="text"
                    inputMode="decimal"
                    placeholder="6,0"
                  />
                </label>
                <label>
                  {t("growthLengthMin")}
                  <input
                    name="lengthMin"
                    type="text"
                    inputMode="decimal"
                    placeholder="55,0"
                  />
                </label>
                <label>
                  {t("growthLengthMax")}
                  <input
                    name="lengthMax"
                    type="text"
                    inputMode="decimal"
                    placeholder="60,0"
                  />
                </label>
                <button className="portal-primary" disabled={busy}>
                  {t("growthTargetSave")}
                </button>
              </form>
              {data.targets.length > 0 && (
                <ul className="health-list">
                  {data.targets.map((target) => (
                    <li key={target.id}>
                      <strong>{target.targetDate}</strong>
                      {target.weightMinG !== null &&
                        target.weightMaxG !== null && (
                          <span>
                            {t("weightKg")}: {target.weightMinG / 1000}–
                            {target.weightMaxG / 1000}
                          </span>
                        )}
                      {target.lengthMinMm !== null &&
                        target.lengthMaxMm !== null && (
                          <span>
                            {t("lengthCm")}: {target.lengthMinMm / 10}–
                            {target.lengthMaxMm / 10}
                          </span>
                        )}
                      <button
                        className="portal-secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => void removeTarget(target)}
                      >
                        {t("growthTargetRemove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
        </>
      )}
      <dialog
        ref={photoDialogRef}
        className="journal-detail-dialog"
        aria-labelledby={photoDialogTitleId}
        onClose={() => setOpenPhotoId(null)}
      >
        {openPhotoId && (
          <div className="growth-photo-dialog">
            <h3 id={photoDialogTitleId}>{t("growthPhotoTitle")}</h3>
            {photoError ? (
              <p role="alert">{t("growthPhotoLoadError")}</p>
            ) : (
              <img
                src={`${path}/${openPhotoId}/photo`}
                alt={t("growthPhotoAlt")}
                onError={() => setPhotoError(true)}
              />
            )}
            <button
              type="button"
              className="portal-secondary"
              onClick={() => setOpenPhotoId(null)}
            >
              {t("close")}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
