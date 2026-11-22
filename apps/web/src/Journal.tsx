import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Child = { id: string; name: string; dateOfBirth: string };
type Entry = {
  id: string;
  type: string;
  childId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  amountMl: number | null;
  details: Record<string, unknown>;
  note: string | null;
  createdBy: string;
  createdByDisplayName?: string;
  updatedBy: string;
  updatedByDisplayName?: string;
  version: number;
  durationSec: number | null;
};
type HistoryItem = {
  action: string;
  changes: Record<string, unknown>;
  at: string;
  actorDisplayName: string;
};
const types = [
  "bottle",
  "breastfeed",
  "diaper",
  "sleep",
  "mpasi",
  "pumping",
  "medicine",
] as const;
const labels: Record<string, string> = {
  bottle: "Susu",
  breastfeed: "DBF",
  diaper: "Popok",
  sleep: "Tidur",
  mpasi: "MPASI",
  pumping: "Pumping",
  medicine: "Obat",
};
function uuidV7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Date.now();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time & 0xff;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function localDateTimeInput(value = new Date()) {
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
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
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export function Journal({
  familyId,
  children,
  pumpingSideMode,
  quickBottleMl,
  familyTimezone,
  members,
}: {
  familyId: string;
  children: Child[];
  pumpingSideMode: "combined" | "separate";
  quickBottleMl: number[];
  familyTimezone: string;
  members: Array<{
    userId: string;
    displayName: string;
    role: "mom" | "dad" | "caregiver";
  }>;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [deletedEntries, setDeletedEntries] = useState<Entry[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>(
    children[0] ? [children[0].id] : [],
  );
  const [kind, setKind] = useState<(typeof types)[number] | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [pumpingMode, setPumpingMode] = useState<"combined" | "separate">(
    pumpingSideMode,
  );
  const [lastPumpingSideMode, setLastPumpingSideMode] =
    useState(pumpingSideMode);
  if (lastPumpingSideMode !== pumpingSideMode) {
    setLastPumpingSideMode(pumpingSideMode);
    setPumpingMode(pumpingSideMode);
  }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recentlyDeleted, setRecentlyDeleted] = useState<Entry | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [history, setHistory] = useState<{
    id: string;
    items: HistoryItem[];
  } | null>(null);
  const [defaultTime, setDefaultTime] = useState(() => localDateTimeInput());
  const [noteOpen, setNoteOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(defaultTime);
  const [foodCatalog, setFoodCatalog] = useState<
    Array<{
      id: string;
      name: string;
      isCommonAllergen: boolean;
      reactionStatus: string;
      firstIntroducedAt: string | null;
    }>
  >([]);
  const [selectedFoodIds, setSelectedFoodIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => localDate());
  const [selectedTypes, setSelectedTypes] = useState<string[]>([...types]);
  const [newestFirst, setNewestFirst] = useState(true);

  const refresh = useCallback(async () => {
    const [response, deleted] = await Promise.all([
      api<{ items: Entry[] }>(`/api/families/${familyId}/logs`),
      api<{ items: Entry[] }>(`/api/families/${familyId}/logs/deleted`),
    ]);
    setEntries(response.items);
    setDeletedEntries(deleted.items);
  }, [familyId]);
  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch(() => setMessage(t("requestError"))),
      0,
    );
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh, t]);
  useEffect(() => {
    if (!entries.some((entry) => entry.status === "running")) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [entries]);

  function openSheet(type: (typeof types)[number], entry: Entry | null) {
    setEditingEntry(entry);
    setKind(type);
    setNoteOpen(Boolean(entry?.note));
    setSelectedFoodIds(
      type === "mpasi" && entry
        ? ((entry.details.foodIds as string[] | undefined) ?? [])
        : [],
    );
    const nextTime = entry
      ? localDateTimeInput(new Date(entry.startedAt))
      : localDateTimeInput();
    setDefaultTime(nextTime);
    setTimeValue(nextTime);
    if (type === "pumping")
      setPumpingMode(
        (entry?.details.sideMode as "combined" | "separate") ?? pumpingSideMode,
      );
    if (type === "mpasi") {
      const childId = entry?.childId ?? selectedChildren[0] ?? children[0]?.id;
      if (childId)
        void api<{ items: typeof foodCatalog }>(
          `/api/children/${childId}/foods`,
        )
          .then((result) => setFoodCatalog(result.items))
          .catch(() => setFoodCatalog([]));
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    if (kind !== "pumping" && selectedChildren.length === 0) {
      setMessage(t("selectChild"));
      return;
    }
    const form = new FormData(event.currentTarget);
    const startedAt = new Date(String(form.get("time"))).toISOString();
    const data = (name: string) => String(form.get(name) ?? "");
    let details: Record<string, unknown> = {};
    let amountMl: number | undefined;
    let endedAt: string | undefined;
    if (kind === "bottle") {
      amountMl = Number(data("amountMl"));
      details = {
        milkType: data("milkType"),
        ...(data("brand") ? { formulaBrand: data("brand") } : {}),
        ...(data("leftoverMl")
          ? { leftoverMl: Number(data("leftoverMl")) }
          : {}),
      };
    }
    if (kind === "breastfeed") {
      const leftSec = Number(data("leftMinutes") || 0) * 60;
      const rightSec = Number(data("rightMinutes") || 0) * 60;
      const manual = data("mode") === "manual";
      if (manual)
        endedAt = new Date(
          new Date(startedAt).valueOf() + (leftSec + rightSec) * 1000,
        ).toISOString();
      details = {
        lastSide: data("lastSide"),
        ...(manual ? { leftSec, rightSec } : {}),
      };
    }
    if (kind === "diaper")
      details = {
        kind: data("diaperKind"),
        ...(data("pupAmount") ? { pupAmount: data("pupAmount") } : {}),
        ...(data("consistency") ? { consistency: data("consistency") } : {}),
        ...(data("color") ? { color: data("color") } : {}),
        ...(data("rash") ? { rash: true } : {}),
      };
    if (kind === "sleep") {
      details = {
        category: data("category"),
        ...(data("location") ? { location: data("location") } : {}),
        ...(data("fallAsleepMethod")
          ? { fallAsleepMethod: data("fallAsleepMethod") }
          : {}),
        ...(data("quality") ? { quality: data("quality") } : {}),
      };
      if (data("endTime")) endedAt = new Date(data("endTime")).toISOString();
    }
    if (kind === "mpasi")
      details = {
        mealType: data("mealType"),
        texture: data("texture"),
        foodIds: [],
        newFoodIds: [],
        ...(data("portionEaten") ? { portionEaten: data("portionEaten") } : {}),
        ...(data("spoons") ? { spoons: Number(data("spoons")) } : {}),
        ...(data("reaction") && data("reaction") !== "none"
          ? { reaction: { kind: data("reaction"), foodIds: [] } }
          : {}),
      };
    if (kind === "pumping") {
      const sideMode = data("sideMode") || "combined";
      const leftMl = Number(data("leftMl") || 0);
      const rightMl = Number(data("rightMl") || 0);
      amountMl =
        sideMode === "separate"
          ? leftMl + rightMl
          : Number(data("amountMl") || 0);
      details = {
        sideMode,
        ...(sideMode === "separate" ? { leftMl, rightMl } : {}),
        ...(data("pumpedBy") ? { pumpedBy: data("pumpedBy") } : {}),
      };
      if (data("endTime")) endedAt = new Date(data("endTime")).toISOString();
    }
    if (kind === "medicine")
      details = {
        name: data("medicine"),
        dose: Number(data("dose")),
        unit: data("unit"),
        ...(data("route") ? { route: data("route") } : {}),
        ...(data("reason") ? { reason: data("reason") } : {}),
        ...(data("nextDoseInHours")
          ? { nextDoseInHours: Number(data("nextDoseInHours")) }
          : {}),
      };
    if (editingEntry && kind === "mpasi") {
      details = {
        ...details,
        foodIds: selectedFoodIds.length
          ? selectedFoodIds
          : editingEntry.details.foodIds,
        newFoodIds: editingEntry.details.newFoodIds ?? [],
        ...(details.reaction && typeof details.reaction === "object"
          ? {
              reaction: {
                ...(details.reaction as Record<string, unknown>),
                foodIds:
                  (
                    editingEntry.details.reaction as
                      { foodIds?: string[] } | undefined
                  )?.foodIds ?? editingEntry.details.foodIds,
              },
            }
          : {}),
      };
    }
    if (
      editingEntry &&
      kind === "breastfeed" &&
      Array.isArray(editingEntry.details.segments)
    )
      details = editingEntry.details;
    if (editingEntry && kind === "sleep" && editingEntry.details.pauses)
      details = { ...details, pauses: editingEntry.details.pauses };
    setBusy(true);
    setMessage("");
    try {
      if (editingEntry) {
        await api(`/api/logs/${editingEntry.id}`, "PATCH", {
          version: editingEntry.version,
          startedAt,
          ...(endedAt ? { endedAt } : {}),
          note: data("note") || null,
          details,
          ...(amountMl !== undefined ? { amountMl } : {}),
        });
        setKind(null);
        setEditingEntry(null);
        await refresh();
        return;
      }
      const targets = kind === "pumping" ? [null] : selectedChildren;
      const baseId = uuidV7();
      const batchId = targets.length > 1 ? baseId : undefined;
      if (kind === "bottle") {
        const shortcuts = data("quickBottleMl")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter(
            (value) => Number.isInteger(value) && value >= 1 && value <= 400,
          )
          .slice(0, 6);
        if (shortcuts.length > 0)
          await api(`/api/families/${familyId}`, "PATCH", {
            quickBottleMl: shortcuts,
          }).catch(() => undefined);
      }
      const foodNames =
        kind === "mpasi"
          ? data("foods")
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean)
          : [];
      const result = await api<{
        allergyWatch?: boolean;
        commonAllergenNames?: string[];
        diaperDoctorNote?: boolean;
      }>(`/api/families/${familyId}/logs`, "POST", {
        id: baseId,
        ...(kind === "pumping"
          ? {}
          : targets.length > 1
            ? { childId: targets[0], childIds: targets }
            : { childId: targets[0] }),
        type: kind,
        startedAt,
        ...(endedAt ? { endedAt } : {}),
        ...(amountMl !== undefined ? { amountMl } : {}),
        details:
          kind === "mpasi"
            ? { ...details, foodIds: selectedFoodIds, foodNames }
            : details,
        note: data("note") || null,
        ...(batchId ? { batchId } : {}),
      });
      const warnings = [
        ...(result.allergyWatch ? [t("allergyWatch")] : []),
        ...(result.diaperDoctorNote ? [t("diaperDoctorNote")] : []),
        ...[...new Set(result.commonAllergenNames ?? [])].map(
          (name) => `${name} · ${t("commonAllergen")}`,
        ),
      ];
      if (warnings.length) setMessage(warnings.join(" · "));
      setKind(null);
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }

  async function stop(entry: Entry) {
    setBusy(true);
    try {
      await api(`/api/logs/${entry.id}/timer/stop`, "POST", {});
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  async function timerAction(
    entry: Entry,
    action: "pause" | "resume" | "switch",
  ) {
    setBusy(true);
    try {
      await api(`/api/logs/${entry.id}/timer/action`, "POST", { action });
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  async function updateFoodReaction(foodId: string, reactionStatus: string) {
    try {
      await api(`/api/foods/${foodId}`, "PATCH", { reactionStatus });
      setFoodCatalog((current) =>
        current.map((food) =>
          food.id === foodId ? { ...food, reactionStatus } : food,
        ),
      );
    } catch {
      setMessage(t("requestError"));
    }
  }
  async function openHistory(entry: Entry) {
    try {
      const result = await api<{ items: HistoryItem[] }>(
        `/api/logs/${entry.id}/history`,
      );
      setHistory({ id: entry.id, items: result.items });
    } catch {
      setMessage(t("requestError"));
    }
  }
  function elapsed(entry: Entry) {
    if (entry.status === "completed" && entry.durationSec !== null)
      return entry.durationSec;
    if (entry.type === "breastfeed" && Array.isArray(entry.details.segments)) {
      return (
        entry.details.segments as Array<{ startedAt: string; endedAt?: string }>
      ).reduce(
        (sum, segment) =>
          sum +
          Math.max(
            0,
            Math.floor(
              ((segment.endedAt ? new Date(segment.endedAt).valueOf() : clock) -
                new Date(segment.startedAt).valueOf()) /
                1000,
            ),
          ),
        0,
      );
    }
    const wall = Math.max(
      0,
      Math.floor((clock - new Date(entry.startedAt).valueOf()) / 1000),
    );
    const pauses = Array.isArray(entry.details.pauses)
      ? (entry.details.pauses as Array<{ startedAt: string; endedAt?: string }>)
      : [];
    return Math.max(
      0,
      wall -
        pauses.reduce(
          (sum, pause) =>
            sum +
            Math.max(
              0,
              Math.floor(
                ((pause.endedAt ? new Date(pause.endedAt).valueOf() : clock) -
                  new Date(pause.startedAt).valueOf()) /
                  1000,
              ),
            ),
          0,
        ),
    );
  }
  function formatElapsed(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
  }
  function sleepDurationForDay(entry: Entry) {
    const dayStart = new Date(`${selectedDate}T00:00:00`).valueOf();
    const dayEndDate = new Date(dayStart);
    dayEndDate.setDate(dayEndDate.getDate() + 1);
    const start = Math.max(dayStart, new Date(entry.startedAt).valueOf());
    const end = Math.min(
      dayEndDate.valueOf(),
      entry.endedAt ? new Date(entry.endedAt).valueOf() : clock,
    );
    const sleepWall = Math.max(0, Math.floor((end - start) / 1000));
    const pauses = Array.isArray(entry.details.pauses)
      ? (entry.details.pauses as Array<{ startedAt: string; endedAt?: string }>)
      : [];
    const paused = pauses.reduce((sum, pause) => {
      const pauseStart = Math.max(
        dayStart,
        new Date(pause.startedAt).valueOf(),
      );
      const pauseEnd = Math.min(
        dayEndDate.valueOf(),
        pause.endedAt ? new Date(pause.endedAt).valueOf() : clock,
      );
      return sum + Math.max(0, Math.floor((pauseEnd - pauseStart) / 1000));
    }, 0);
    return Math.max(0, sleepWall - paused);
  }
  function detailSummary(entry: Entry) {
    const d = entry.details;
    if (entry.type === "bottle")
      return `${entry.amountMl ?? 0} ml · ${String(d.milkType ?? "")}`;
    if (entry.type === "breastfeed") return String(d.lastSide ?? "");
    if (entry.type === "diaper")
      return [d.kind, d.color].filter(Boolean).join(" · ");
    if (entry.type === "sleep")
      return [d.category, d.location].filter(Boolean).join(" · ");
    if (entry.type === "mpasi")
      return [d.mealType, d.texture].filter(Boolean).join(" · ");
    if (entry.type === "pumping") return `${entry.amountMl ?? 0} ml`;
    if (entry.type === "medicine")
      return `${String(d.name ?? "")} · ${String(d.dose ?? "")} ${String(d.unit ?? "")}`;
    return "";
  }
  async function duplicate(entry: Entry) {
    setBusy(true);
    try {
      const details = { ...entry.details };
      if (entry.type === "mpasi") details.newFoodIds = [];
      await api(`/api/families/${familyId}/logs`, "POST", {
        id: uuidV7(),
        ...(entry.childId ? { childId: entry.childId } : {}),
        type: entry.type,
        startedAt: new Date().toISOString(),
        ...(entry.amountMl !== null ? { amountMl: entry.amountMl } : {}),
        details,
        note: entry.note,
      });
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  async function quickLog(type: "bottle" | "diaper", amountMl?: number) {
    const childId = selectedChildren[0] ?? children[0]?.id;
    if (!childId) {
      setMessage(t("selectChild"));
      return;
    }
    setBusy(true);
    try {
      const entry = await api<Entry>(`/api/families/${familyId}/logs`, "POST", {
        id: uuidV7(),
        childId,
        type,
        startedAt: new Date().toISOString(),
        ...(type === "bottle"
          ? { amountMl, details: { milkType: "asip" }, source: "quick" }
          : {
              details: { kind: amountMl === undefined ? "wet" : "pup" },
              source: "quick",
            }),
      });
      setRecentlyDeleted(entry);
      setMessage(t("quickSaved"));
      await refresh();
      window.setTimeout(
        () =>
          setRecentlyDeleted((current) =>
            current?.id === entry.id ? null : current,
          ),
        5000,
      );
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  async function remove(entry: Entry) {
    setBusy(true);
    try {
      await api(`/api/logs/${entry.id}`, "DELETE");
      setRecentlyDeleted(entry);
      await refresh();
      setMessage(t("entryDeleted"));
      window.setTimeout(
        () =>
          setRecentlyDeleted((current) =>
            current?.id === entry.id ? null : current,
          ),
        5000,
      );
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }

  async function undoDelete() {
    if (!recentlyDeleted) return;
    setBusy(true);
    try {
      await api(`/api/logs/${recentlyDeleted.id}/restore`, "POST", {});
      setRecentlyDeleted(null);
      setMessage("");
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }
  async function restoreEntry(entry: Entry) {
    setBusy(true);
    try {
      await api(`/api/logs/${entry.id}/restore`, "POST", {});
      await refresh();
    } catch {
      setMessage(t("requestError"));
    } finally {
      setBusy(false);
    }
  }

  const dayEntries = entries.filter((entry) => {
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const startedAt = new Date(entry.startedAt);
    const endedAt = entry.endedAt ? new Date(entry.endedAt) : new Date(clock);
    const overlaps =
      entry.type === "sleep"
        ? startedAt < nextDay && endedAt > dayStart
        : localDate(startedAt) === selectedDate;
    return (
      overlaps &&
      (selectedChildren.length === 0 ||
        entry.childId === null ||
        selectedChildren.includes(entry.childId))
    );
  });
  const bottleMl = dayEntries
    .filter((entry) => entry.type === "bottle")
    .reduce(
      (total, entry) =>
        total +
        Math.max(
          0,
          (entry.amountMl ?? 0) - Number(entry.details.leftoverMl ?? 0),
        ),
      0,
    );
  const latestOf = (type: string) =>
    dayEntries.find((entry) => entry.type === type);
  const wetCount = dayEntries.filter(
    (entry) =>
      entry.type === "diaper" &&
      ["wet", "mixed"].includes(String(entry.details.kind)),
  ).length;
  const pupCount = dayEntries.filter(
    (entry) =>
      entry.type === "diaper" &&
      ["pup", "mixed"].includes(String(entry.details.kind)),
  ).length;
  const sleepTotal = dayEntries
    .filter((entry) => entry.type === "sleep")
    .reduce((total, entry) => total + sleepDurationForDay(entry), 0);
  const pumpTotal = dayEntries
    .filter((entry) => entry.type === "pumping")
    .reduce((total, entry) => total + (entry.amountMl ?? 0), 0);
  const latestBreastfeed = latestOf("breastfeed");
  const lastSideUsed = entries.find(
    (entry) =>
      entry.type === "breastfeed" && entry.childId === selectedChildren[0],
  );
  const nextSide = lastSideUsed?.details.lastSide === "left" ? "right" : "left";
  const hourAtDefault = new Date().getHours();
  const sleepCategoryDefault =
    hourAtDefault >= 19 || hourAtDefault < 6 ? "night" : "nap";
  const latestSleep = latestOf("sleep");
  const latestPup = dayEntries.find(
    (entry) =>
      entry.type === "diaper" &&
      ["pup", "mixed"].includes(String(entry.details.kind)),
  );
  const nextMedicine = dayEntries.find(
    (entry) =>
      entry.type === "medicine" &&
      typeof entry.details.nextDoseInHours === "number",
  );
  const nextMedicineAt = nextMedicine
    ? new Date(
        new Date(nextMedicine.startedAt).valueOf() +
          Number(nextMedicine.details.nextDoseInHours) * 3600_000,
      )
    : null;
  const runningTimers = entries.filter(
    (entry) => entry.status === "running" || entry.status === "paused",
  );
  const longRunningTimer = runningTimers.find((entry) => {
    const seconds = elapsed(entry);
    return (
      (entry.type === "breastfeed" && seconds > 90 * 60) ||
      (entry.type === "sleep" && seconds > 14 * 3600)
    );
  });
  const viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const timezoneMismatch =
    Boolean(familyTimezone) && viewerTimezone !== familyTimezone;
  const selectedChild = children.find(
    (child) => child.id === selectedChildren[0],
  );
  const mpasiUnderSixMonths = (() => {
    if (!selectedChild) return false;
    const dob = new Date(`${selectedChild.dateOfBirth}T00:00:00`);
    const months = (clock - dob.valueOf()) / (30.44 * 24 * 3600 * 1000);
    return months < 6;
  })();
  const visibleEntries = dayEntries
    .filter((entry) => selectedTypes.includes(entry.type))
    .sort((a, b) =>
      newestFirst
        ? b.startedAt.localeCompare(a.startedAt)
        : a.startedAt.localeCompare(b.startedAt),
    );

  return (
    <section className="journal" aria-label={t("today")}>
      <div className="journal-heading">
        <div>
          <p className="portal-kicker">{t("today")}</p>
          <h2>{t("timeline")}</h2>
        </div>
        <div className="journal-day-picker">
          <button
            className="portal-inline-button"
            type="button"
            onClick={() =>
              setSelectedDate((date) => {
                const d = new Date(`${date}T12:00:00`);
                d.setDate(d.getDate() - 1);
                return localDate(d);
              })
            }
            aria-label={t("previousDay")}
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button
            className="portal-inline-button"
            type="button"
            onClick={() =>
              setSelectedDate((date) => {
                const d = new Date(`${date}T12:00:00`);
                d.setDate(d.getDate() + 1);
                return localDate(d);
              })
            }
            aria-label={t("nextDay")}
          >
            ›
          </button>
        </div>
        {children.length > 1 && (
          <fieldset className="journal-child-select">
            <legend>{t("logForChildren")}</legend>
            <label>
              <input
                type="checkbox"
                checked={selectedChildren.length === children.length}
                onChange={(event) =>
                  setSelectedChildren(
                    event.target.checked
                      ? children.map((child) => child.id)
                      : children[0]
                        ? [children[0].id]
                        : [],
                  )
                }
              />
              {t("allChildren")}
            </label>
            {children.map((child) => (
              <label key={child.id}>
                <input
                  type="checkbox"
                  checked={selectedChildren.includes(child.id)}
                  onChange={(event) =>
                    setSelectedChildren((current) =>
                      event.target.checked
                        ? [...new Set([...current, child.id])]
                        : current.length <= 1
                          ? current
                          : current.filter((id) => id !== child.id),
                    )
                  }
                />
                {child.name}
              </label>
            ))}
          </fieldset>
        )}
      </div>
      <div className="journal-actions">
        {types.map((type) => (
          <button
            className="portal-secondary"
            key={type}
            type="button"
            onClick={() => openSheet(type, null)}
          >
            {labels[type]}
          </button>
        ))}
      </div>
      <div className="journal-quick-actions">
        <span>{t("quickBottle")}</span>
        {quickBottleMl.map((ml) => (
          <button
            key={ml}
            className="portal-secondary"
            disabled={busy}
            onClick={() => void quickLog("bottle", ml)}
            type="button"
          >
            {ml} ml
          </button>
        ))}
        <button
          className="portal-secondary"
          disabled={busy}
          onClick={() => void quickLog("diaper")}
          type="button"
        >
          {t("quickWet")}
        </button>
        <button
          className="portal-secondary"
          disabled={busy}
          onClick={() => void quickLog("diaper", 1)}
          type="button"
        >
          {t("quickPup")}
        </button>
      </div>
      {runningTimers.length > 0 && (
        <div className="journal-sticky-timers" role="status">
          {runningTimers.map((entry) => (
            <div key={entry.id}>
              <strong>{labels[entry.type] ?? entry.type}</strong> ·{" "}
              {formatElapsed(elapsed(entry))} ·{" "}
              {entry.createdByDisplayName ?? ""}
              <button
                className="portal-inline-button"
                disabled={busy}
                onClick={() => void stop(entry)}
                type="button"
              >
                {t("stopTimer")}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="journal-status-grid">
        <article>
          <h3>{t("bottleTotal")}</h3>
          <strong>{bottleMl} ml</strong>
          <span>
            {latestOf("bottle")
              ? `${t("lastEntry")}: ${new Date(latestOf("bottle")!.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : t("noEntries")}
          </span>
        </article>
        <article>
          <h3>DBF</h3>
          <strong>
            {latestBreastfeed
              ? `${latestBreastfeed.details.lastSide === "left" ? t("left") : t("right")}`
              : "—"}
          </strong>
          <span>
            {latestBreastfeed
              ? `${t("lastEntry")}: ${new Date(latestBreastfeed.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : t("noEntries")}
          </span>
        </article>
        <article>
          <h3>{t("sleep")}</h3>
          <strong>{formatElapsed(sleepTotal)}</strong>
          <span>
            {latestSleep?.status === "running"
              ? t("timerRunning")
              : `${dayEntries.filter((entry) => entry.type === "sleep").length} ${t("sessions")}`}
          </span>
        </article>
        <article>
          <h3>{t("diaperKind")}</h3>
          <strong>
            {t("wet")}: {wetCount} · {t("pup")}: {pupCount}
          </strong>
          <span>
            {latestPup
              ? `${t("lastPup")}: ${new Date(latestPup.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : t("noEntries")}
          </span>
        </article>
        <article>
          <h3>{t("pumping")}</h3>
          <strong>{pumpTotal} ml</strong>
          <span>
            {dayEntries.filter((entry) => entry.type === "pumping").length}{" "}
            {t("sessions")}
          </span>
        </article>
        {nextMedicine && (
          <article>
            <h3>{t("medicineName")}</h3>
            <strong>{String(nextMedicine.details.name)}</strong>
            <span>
              {t("nextDoseAt")}:{" "}
              {nextMedicineAt
                ? nextMedicineAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </article>
        )}
      </div>
      {timezoneMismatch && (
        <p className="portal-muted">
          {t("familyTimezoneHint")}: {familyTimezone}
        </p>
      )}
      {longRunningTimer && (
        <p role="status" className="portal-message">
          {longRunningTimer.type === "breastfeed"
            ? t("stillNursing")
            : t("stillSleeping")}
          <button
            className="portal-inline-button"
            disabled={busy}
            onClick={() => void stop(longRunningTimer)}
            type="button"
          >
            {t("stopTimer")}
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="portal-message">
          {message}
          {recentlyDeleted && (
            <button
              className="portal-inline-button"
              type="button"
              disabled={busy}
              onClick={() => void undoDelete()}
            >
              {t("undo")}
            </button>
          )}
        </p>
      )}
      {kind && (
        <form
          className="portal-form journal-sheet"
          key={editingEntry?.id ?? kind}
          onSubmit={(event) => void save(event)}
        >
          <h3>{labels[kind]}</h3>
          <label>
            {t("time")}
            <input
              name="time"
              type="datetime-local"
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
              required
            />
          </label>
          {!editingEntry && (
            <div className="journal-time-chips">
              {[5, 15, 30].map((minutes) => (
                <button
                  className="portal-inline-button"
                  key={minutes}
                  type="button"
                  onClick={() =>
                    setTimeValue(
                      localDateTimeInput(
                        new Date(Date.now() - minutes * 60000),
                      ),
                    )
                  }
                >
                  -{minutes}m
                </button>
              ))}
            </div>
          )}
          {editingEntry?.amountMl !== null && editingEntry && (
            <label>
              {t("amountMl")}
              <input
                name="amountMl"
                type="number"
                min="0"
                max="2000"
                defaultValue={editingEntry.amountMl ?? 0}
              />
            </label>
          )}
          {kind === "bottle" && (
            <>
              <label>
                {t("amountMl")}
                <input
                  name="amountMl"
                  type="number"
                  min="1"
                  max="400"
                  step="10"
                  required
                  defaultValue={editingEntry?.amountMl ?? undefined}
                />
              </label>
              <div className="journal-time-chips">
                {quickBottleMl.map((ml) => (
                  <button
                    className="portal-inline-button"
                    key={ml}
                    type="button"
                    onClick={(event) => {
                      const input = event.currentTarget
                        .closest("form")
                        ?.querySelector<HTMLInputElement>(
                          'input[name="amountMl"]',
                        );
                      if (input) input.value = String(ml);
                    }}
                  >
                    {ml} ml
                  </button>
                ))}
              </div>
              <label>
                {t("quickBottleShortcuts")}
                <input
                  name="quickBottleMl"
                  defaultValue={quickBottleMl.join(",")}
                  placeholder="60,90,120,150"
                />
              </label>
              <label>
                {t("milkType")}
                <select
                  name="milkType"
                  defaultValue={String(
                    editingEntry?.details.milkType ?? "asip",
                  )}
                >
                  <option value="asip">ASIP</option>
                  <option value="formula">{t("formula")}</option>
                  <option value="mixed">{t("mixedMilk")}</option>
                </select>
              </label>
              <label>
                {t("leftoverMl")}
                <input
                  name="leftoverMl"
                  type="number"
                  min="0"
                  max="400"
                  defaultValue={Number(editingEntry?.details.leftoverMl ?? "")}
                />
              </label>
              <label>
                {t("brand")}
                <input
                  name="brand"
                  maxLength={60}
                  defaultValue={String(
                    editingEntry?.details.formulaBrand ?? "",
                  )}
                />
              </label>
            </>
          )}
          {kind === "breastfeed" && (
            <>
              <label>
                {t("mode")}
                <select
                  name="mode"
                  defaultValue={
                    editingEntry?.details.leftSec !== undefined ||
                    editingEntry?.details.rightSec !== undefined
                      ? "manual"
                      : "timer"
                  }
                >
                  <option value="timer">{t("timer")}</option>
                  <option value="manual">{t("manual")}</option>
                </select>
              </label>
              <label>
                {t("lastSide")}
                <select
                  name="lastSide"
                  defaultValue={String(
                    editingEntry?.details.lastSide ?? nextSide,
                  )}
                >
                  <option value="left">{t("left")}</option>
                  <option value="right">{t("right")}</option>
                </select>
              </label>
              <div className="portal-form-row">
                <label>
                  {t("leftMinutes")}
                  <input
                    name="leftMinutes"
                    type="number"
                    min="0"
                    max="120"
                    defaultValue={
                      Number(editingEntry?.details.leftSec ?? 0) / 60
                    }
                  />
                </label>
                <label>
                  {t("rightMinutes")}
                  <input
                    name="rightMinutes"
                    type="number"
                    min="0"
                    max="120"
                    defaultValue={
                      Number(editingEntry?.details.rightSec ?? 0) / 60
                    }
                  />
                </label>
              </div>
            </>
          )}
          {kind === "diaper" && (
            <>
              <label>
                {t("diaperKind")}
                <select
                  name="diaperKind"
                  defaultValue={String(editingEntry?.details.kind ?? "wet")}
                >
                  {["wet", "pup", "mixed", "dry"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="portal-form-row">
                <label>
                  {t("pupAmount")}
                  <select
                    name="pupAmount"
                    defaultValue={String(editingEntry?.details.pupAmount ?? "")}
                  >
                    <option value="">—</option>
                    {["banyak", "sedang", "sedikit", "cepirit"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("consistency")}
                  <select
                    name="consistency"
                    defaultValue={String(
                      editingEntry?.details.consistency ?? "",
                    )}
                  >
                    <option value="">—</option>
                    {["cair", "lembek", "normal", "keras", "berbiji"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label>
                {t("color")}
                <select
                  name="color"
                  defaultValue={String(editingEntry?.details.color ?? "")}
                >
                  <option value="">—</option>
                  {[
                    "kuning",
                    "hijau",
                    "coklat",
                    "hitam",
                    "merah",
                    "pucat_putih",
                    "lainnya",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  name="rash"
                  defaultChecked={editingEntry?.details.rash === true}
                />
                {t("rash")}
              </label>
            </>
          )}
          {kind === "sleep" && (
            <>
              <label>
                {t("sleepCategory")}
                <select
                  name="category"
                  defaultValue={String(
                    editingEntry?.details.category ?? sleepCategoryDefault,
                  )}
                >
                  <option value="nap">{t("nap")}</option>
                  <option value="night">{t("night")}</option>
                </select>
              </label>
              <label>
                {t("endTimeOptional")}
                <input
                  name="endTime"
                  type="datetime-local"
                  defaultValue={
                    editingEntry?.endedAt
                      ? new Date(
                          new Date(editingEntry.endedAt).valueOf() -
                            new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
              <label>
                {t("location")}
                <select
                  name="location"
                  defaultValue={String(editingEntry?.details.location ?? "")}
                >
                  <option value="">—</option>
                  {[
                    "crib",
                    "cosleep",
                    "contact",
                    "stroller",
                    "car",
                    "swing",
                    "other",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("fallAsleepMethod")}
                <select
                  name="fallAsleepMethod"
                  defaultValue={String(
                    editingEntry?.details.fallAsleepMethod ?? "",
                  )}
                >
                  <option value="">—</option>
                  {[
                    "self",
                    "nursing",
                    "bottle",
                    "rocking",
                    "pacifier",
                    "other",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("quality")}
                <select
                  name="quality"
                  defaultValue={String(editingEntry?.details.quality ?? "")}
                >
                  <option value="">—</option>
                  {["nyenyak", "gelisah", "sering_bangun"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {kind === "mpasi" && (
            <>
              {mpasiUnderSixMonths && (
                <p className="portal-message">{t("mpasiUnderSixMonths")}</p>
              )}
              <fieldset className="journal-food-catalog">
                <legend>{t("foods")}</legend>
                {foodCatalog.length === 0 && <p>{t("noFoods")}</p>}
                {foodCatalog.map((food) => (
                  <label
                    key={food.id}
                    className={
                      food.reactionStatus === "confirmed_avoid"
                        ? "journal-food-avoid"
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedFoodIds.includes(food.id)}
                      onChange={(event) =>
                        setSelectedFoodIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, food.id])]
                            : current.filter((id) => id !== food.id),
                        )
                      }
                    />
                    {food.name}
                    {food.isCommonAllergen && (
                      <span className="journal-chip">
                        {t("commonAllergen")}
                      </span>
                    )}
                    {food.reactionStatus === "confirmed_avoid" && (
                      <span className="journal-chip">
                        {t("confirmedAvoid")}
                      </span>
                    )}
                    <select
                      aria-label={t("reactionStatus")}
                      value={food.reactionStatus}
                      onChange={(event) =>
                        void updateFoodReaction(food.id, event.target.value)
                      }
                    >
                      <option value="none">{t("reactionNone")}</option>
                      <option value="suspected">
                        {t("reactionSuspected")}
                      </option>
                      <option value="confirmed_avoid">
                        {t("reactionConfirmedAvoid")}
                      </option>
                    </select>
                  </label>
                ))}
              </fieldset>
              {!editingEntry && (
                <label>
                  {t("newFoods")}
                  <input name="foods" placeholder={t("foodsPlaceholder")} />
                </label>
              )}
              {foodCatalog.some(
                (food) =>
                  selectedFoodIds.includes(food.id) &&
                  food.reactionStatus === "confirmed_avoid",
              ) && <p className="portal-message">{t("avoidWarning")}</p>}
              <label>
                {t("mealType")}
                <select
                  name="mealType"
                  defaultValue={String(
                    editingEntry?.details.mealType ?? "sarapan",
                  )}
                >
                  {["sarapan", "makan_siang", "makan_malam", "selingan"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                {t("texture")}
                <select
                  name="texture"
                  defaultValue={String(
                    editingEntry?.details.texture ?? "puree_halus",
                  )}
                >
                  {[
                    "puree_halus",
                    "saring_lumat",
                    "cincang_halus",
                    "cincang_kasar",
                    "finger_food",
                    "makanan_keluarga",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="portal-form-row">
                <label>
                  {t("portionEaten")}
                  <select
                    name="portionEaten"
                    defaultValue={String(
                      editingEntry?.details.portionEaten ?? "",
                    )}
                  >
                    <option value="">—</option>
                    {[
                      "habis",
                      "sebagian_besar",
                      "setengah",
                      "sedikit",
                      "menolak",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("spoons")}
                  <input
                    name="spoons"
                    type="number"
                    min="0.1"
                    step="0.1"
                    defaultValue={Number(editingEntry?.details.spoons ?? "")}
                  />
                </label>
              </div>
              <label>
                {t("reaction")}
                <select
                  name="reaction"
                  defaultValue={String(
                    (
                      editingEntry?.details.reaction as
                        { kind?: string } | undefined
                    )?.kind ?? "none",
                  )}
                >
                  <option value="none">{t("none")}</option>
                  {[
                    "ruam",
                    "muntah",
                    "diare",
                    "bengkak",
                    "gatal",
                    "lainnya",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {kind === "pumping" && (
            <>
              <label>
                {t("sideMode")}
                <select
                  name="sideMode"
                  value={
                    editingEntry
                      ? String(editingEntry.details.sideMode ?? pumpingMode)
                      : pumpingMode
                  }
                  onChange={(event) =>
                    setPumpingMode(
                      event.target.value as "combined" | "separate",
                    )
                  }
                >
                  <option value="combined">{t("combined")}</option>
                  <option value="separate">{t("separate")}</option>
                </select>
              </label>
              {pumpingMode === "combined" ? (
                <label>
                  {t("amountMl")}
                  <input
                    name="amountMl"
                    type="number"
                    min="0"
                    max="2000"
                    defaultValue={editingEntry?.amountMl ?? 0}
                  />
                </label>
              ) : (
                <div className="portal-form-row">
                  <label>
                    {t("leftMl")}
                    <input
                      name="leftMl"
                      type="number"
                      min="0"
                      max="1000"
                      defaultValue={Number(editingEntry?.details.leftMl ?? 0)}
                    />
                  </label>
                  <label>
                    {t("rightMl")}
                    <input
                      name="rightMl"
                      type="number"
                      min="0"
                      max="1000"
                      defaultValue={Number(editingEntry?.details.rightMl ?? 0)}
                    />
                  </label>
                </div>
              )}
              {!editingEntry && (
                <label>
                  {t("endTimeOptional")}
                  <input name="endTime" type="datetime-local" />
                </label>
              )}
              <label>
                {t("pumpedBy")}
                <select
                  name="pumpedBy"
                  defaultValue={String(editingEntry?.details.pumpedBy ?? "")}
                >
                  <option value="">—</option>
                  {members
                    .filter((member) => member.role === "mom")
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {kind === "medicine" && (
            <>
              <label>
                {t("medicineName")}
                <input
                  name="medicine"
                  maxLength={60}
                  required
                  defaultValue={String(editingEntry?.details.name ?? "")}
                />
              </label>
              <div className="portal-form-row">
                <label>
                  {t("dose")}
                  <input
                    name="dose"
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    defaultValue={Number(editingEntry?.details.dose ?? "")}
                  />
                </label>
                <label>
                  {t("unit")}
                  <select
                    name="unit"
                    defaultValue={String(editingEntry?.details.unit ?? "ml")}
                  >
                    {[
                      "ml",
                      "mg",
                      "tetes",
                      "tablet",
                      "sachet",
                      "puff",
                      "oles",
                      "lainnya",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t("route")}
                <select
                  name="route"
                  defaultValue={String(editingEntry?.details.route ?? "")}
                >
                  <option value="">—</option>
                  {[
                    "oral",
                    "tetes_hidung",
                    "tetes_mata",
                    "tetes_telinga",
                    "oles",
                    "supositoria",
                    "inhalasi",
                    "lainnya",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("reason")}
                <input
                  name="reason"
                  maxLength={100}
                  defaultValue={String(editingEntry?.details.reason ?? "")}
                />
              </label>
              <label>
                {t("nextDoseHours")}
                <input
                  name="nextDoseInHours"
                  type="number"
                  min="1"
                  max="48"
                  defaultValue={Number(
                    editingEntry?.details.nextDoseInHours ?? "",
                  )}
                />
              </label>
            </>
          )}
          {noteOpen ? (
            <label>
              {t("note")}
              <textarea
                name="note"
                maxLength={500}
                defaultValue={editingEntry?.note ?? ""}
              />
            </label>
          ) : (
            <button
              className="portal-inline-button"
              type="button"
              onClick={() => setNoteOpen(true)}
            >
              + {t("note")}
            </button>
          )}
          <div className="portal-actions">
            <button className="portal-primary" disabled={busy} type="submit">
              {t("save")}
            </button>
            <button
              className="portal-secondary"
              type="button"
              onClick={() => {
                setKind(null);
                setEditingEntry(null);
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
      <div className="journal-summary">
        <span>
          {t("bottleTotal")}: <strong>{bottleMl} ml</strong>
        </span>
        <span>
          {t("diaperCount")}:{" "}
          <strong>
            {dayEntries.filter((entry) => entry.type === "diaper").length}
          </strong>
        </span>
        <span>
          {t("sleepCount")}:{" "}
          <strong>
            {dayEntries.filter((entry) => entry.type === "sleep").length}
          </strong>
        </span>
      </div>
      <div className="journal-summary-extra">
        <span>
          {t("feedCount")}:{" "}
          <strong>
            {
              dayEntries.filter((entry) =>
                ["bottle", "breastfeed"].includes(entry.type),
              ).length
            }
          </strong>
        </span>
        <span>
          {t("pumpTotal")}: <strong>{pumpTotal} ml</strong>
        </span>
        <span>
          {t("mpasiCount")}:{" "}
          <strong>
            {dayEntries.filter((entry) => entry.type === "mpasi").length}
          </strong>
        </span>
      </div>
      <div className="journal-filters">
        <div>
          {types.map((type) => (
            <button
              className="portal-inline-button"
              aria-pressed={selectedTypes.includes(type)}
              key={type}
              type="button"
              onClick={() =>
                setSelectedTypes((current) =>
                  current.includes(type)
                    ? current.filter((value) => value !== type)
                    : [...current, type],
                )
              }
            >
              {labels[type]}
            </button>
          ))}
        </div>
        <button
          className="portal-inline-button"
          type="button"
          onClick={() => setNewestFirst((value) => !value)}
        >
          {newestFirst ? t("oldestFirst") : t("newestFirst")}
        </button>
      </div>
      <ol className="journal-timeline">
        {visibleEntries.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{labels[entry.type] ?? entry.type}</strong>
              <span>
                {t("loggedBy")} {entry.createdByDisplayName ?? ""}
              </span>
              {entry.updatedBy !== entry.createdBy && (
                <span>
                  {t("editedBy")} {entry.updatedByDisplayName ?? ""}
                </span>
              )}
              <time>
                {new Date(entry.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {entry.type === "sleep" &&
                localDate(new Date(entry.startedAt)) !== selectedDate && (
                  <span className="journal-continuation">
                    {t("continuation")}
                  </span>
                )}
              <span>{detailSummary(entry)}</span>
              {entry.amountMl !== null && <span>{entry.amountMl} ml</span>}
              {entry.status === "running" && <span>{t("timerRunning")}</span>}
              {(entry.status === "running" || entry.status === "paused") && (
                <span className="journal-timer">
                  {formatElapsed(elapsed(entry))}
                </span>
              )}
              {entry.note && <p>{entry.note}</p>}
            </div>
            <div className="portal-child-actions">
              {entry.status === "completed" && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() =>
                    openSheet(entry.type as (typeof types)[number], entry)
                  }
                  type="button"
                >
                  {t("editChild")}
                </button>
              )}
              <button
                className="portal-inline-button"
                type="button"
                onClick={() => void openHistory(entry)}
              >
                {t("history")}
              </button>
              {entry.status === "completed" && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void duplicate(entry)}
                  type="button"
                >
                  {t("duplicate")}
                </button>
              )}
              {history?.id === entry.id && (
                <div className="journal-history">
                  <ul>
                    {history.items.map((item, index) => (
                      <li key={`${item.at}-${index}`}>
                        <strong>{item.actorDisplayName}</strong> · {item.action}{" "}
                        ·{" "}
                        {new Date(item.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="portal-inline-button"
                    type="button"
                    onClick={() => setHistory(null)}
                  >
                    {t("close")}
                  </button>
                </div>
              )}
              {entry.status === "running" && entry.type === "breastfeed" && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void timerAction(entry, "switch")}
                  type="button"
                >
                  {t("switchSide")}
                </button>
              )}
              {entry.status === "running" && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void timerAction(entry, "pause")}
                  type="button"
                >
                  {t("pauseTimer")}
                </button>
              )}
              {entry.status === "paused" && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void timerAction(entry, "resume")}
                  type="button"
                >
                  {t("resumeTimer")}
                </button>
              )}
              {(entry.status === "running" || entry.status === "paused") && (
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void stop(entry)}
                  type="button"
                >
                  {t("stopTimer")}
                </button>
              )}
              <button
                className="portal-inline-button"
                disabled={busy}
                onClick={() => void remove(entry)}
                type="button"
              >
                {t("deleteChild")}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {deletedEntries.length > 0 && (
        <div className="journal-deleted">
          <h3>{t("recentlyDeleted")}</h3>
          <ul>
            {deletedEntries.map((entry) => (
              <li key={entry.id}>
                <span>
                  {labels[entry.type] ?? entry.type} ·{" "}
                  {new Date(entry.startedAt).toLocaleString()}
                </span>
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void restoreEntry(entry)}
                  type="button"
                >
                  {t("restoreChild")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
