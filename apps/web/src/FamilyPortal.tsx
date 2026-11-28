import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Journal } from "./Journal";

type User = { id: string; name: string; email: string };
type FamilySummary = {
  id: string;
  name: string;
  role: "mom" | "dad" | "caregiver";
};
type Child = {
  id: string;
  name: string;
  sex: "male" | "female";
  dateOfBirth: string;
  birthWeightG: number;
  birthLengthMm: number | null;
  birthHeadCircMm: number | null;
  feedingMode: "breastmilk" | "formula" | "mixed";
  milkTargetMode: "auto" | "manual";
  milkTargetManualMl: number | null;
  version: number;
};
type FamilyDetails = FamilySummary & {
  myRole: "mom" | "dad" | "caregiver";
  timezone: string;
  pumpingSideMode: "combined" | "separate";
  quickBottleMl: number[];
  version: number;
  members: Array<{
    id: string;
    userId: string;
    displayName: string;
    role: "mom" | "dad" | "caregiver";
    isMe: boolean;
  }>;
  children: Child[];
  deletedChildren: Child[];
};
type FamilyInvite = {
  id: string;
  targetRole: "parent" | "caregiver";
  createdBy: string | null;
  expiresAt: string;
};
type PortalPhase =
  "loading" | "signed-out" | "families" | "new-family" | "family";

class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const options: RequestInit = { method, credentials: "same-origin" };
  if (body) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
          ? payload.message
          : `Request failed (${response.status}).`;
    const code =
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : undefined;
    throw new ApiRequestError(message, response.status, code);
  }
  return payload as T;
}

function isParentRole(role: FamilySummary["role"]) {
  return role === "mom" || role === "dad";
}

function JoinFamilyPanel({
  onJoined,
}: {
  onJoined: (familyId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{
    familyName: string;
    targetRole: "parent" | "caregiver";
  } | null>(null);
  const [role, setRole] = useState<"mom" | "dad">("mom");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    action: (code: string) => Promise<void>,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("inviteCode") ?? "");
    setBusy(true);
    setError("");
    try {
      await action(code);
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
    <div className="portal-card">
      <h2>{t("joinFamily")}</h2>
      {error && (
        <p className="portal-message portal-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="portal-form"
        onSubmit={(event) =>
          void handleSubmit(event, async (inviteCode) => {
            setCode(inviteCode);
            const result = await apiRequest<{
              familyName: string;
              targetRole: "parent" | "caregiver";
            }>("/api/invites/preview", "POST", { code: inviteCode });
            setPreview(result);
          })
        }
      >
        <label>
          {t("inviteCode")}
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={9}
            name="inviteCode"
            onChange={(event) =>
              setCode(event.currentTarget.value.toUpperCase())
            }
            pattern="[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}"
            placeholder="ABCD-EFGH"
            required
            value={code}
          />
        </label>
        <button className="portal-secondary" disabled={busy} type="submit">
          {t("previewInvite")}
        </button>
      </form>
      {preview && (
        <div className="portal-invite-preview">
          <p>
            {t("joiningFamily")} <strong>{preview.familyName}</strong>
          </p>
          {preview.targetRole === "parent" && (
            <label className="portal-role-field">
              {t("yourRole")}
              <select
                onChange={(event) => {
                  const selectedRole = event.currentTarget.value;
                  if (selectedRole === "mom" || selectedRole === "dad") {
                    setRole(selectedRole);
                  }
                }}
                value={role}
              >
                <option value="mom">{t("mom")}</option>
                <option value="dad">{t("dad")}</option>
              </select>
            </label>
          )}
          <button
            className="portal-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void apiRequest<{ familyId: string }>(
                "/api/invites/redeem",
                "POST",
                {
                  code,
                  ...(preview.targetRole === "parent" ? { role } : {}),
                },
              )
                .then((result) => onJoined(result.familyId))
                .catch((requestError: unknown) =>
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : t("requestError"),
                  ),
                )
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            {t("joinFamily")}
          </button>
        </div>
      )}
    </div>
  );
}

export function FamilyPortal({
  view = "account",
  onSessionChange,
  resetToken,
  onReturnToSignIn,
}: {
  view?: "account" | "today" | "settings" | "reset-password";
  onSessionChange?: (signedIn: boolean) => void;
  resetToken?: string | null;
  onReturnToSignIn?: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<PortalPhase>("loading");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [resetRequestOpen, setResetRequestOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [deletedFamilies, setDeletedFamilies] = useState<
    Array<FamilySummary & { purgeAfter: string | null }>
  >([]);
  const [familyDetails, setFamilyDetails] = useState<FamilyDetails | null>(
    null,
  );
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [childFormOpen, setChildFormOpen] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [inviteFormOpen, setInviteFormOpen] = useState(false);
  const [dateBounds] = useState(() => {
    const now = new Date();
    const earliest = new Date(now);
    earliest.setUTCFullYear(earliest.getUTCFullYear() - 5);
    return {
      max: now.toISOString().slice(0, 10),
      min: earliest.toISOString().slice(0, 10),
    };
  });

  const selectFamily = useCallback(async (familyId: string) => {
    await apiRequest(`/api/families/${familyId}/select`, "POST", {});
    const details = await apiRequest<FamilyDetails>(
      `/api/families/${familyId}`,
    );
    setFamilyDetails(
      details.role ? details : { ...details, role: details.myRole },
    );
    if (isParentRole(details.role)) {
      const activeInvites = await apiRequest<{
        items: Array<FamilyInvite & { status: string }>;
      }>(`/api/families/${familyId}/invites`);
      setInvites(
        activeInvites.items.filter((invite) => invite.status === "active"),
      );
    } else {
      setInvites([]);
    }
    setPhase("family");
  }, []);

  const loadFamilies = useCallback(async () => {
    const [result, deleted] = await Promise.all([
      apiRequest<{ items: FamilySummary[] }>("/api/families"),
      apiRequest<{
        items: Array<FamilySummary & { purgeAfter: string | null }>;
      }>("/api/families/deleted"),
    ]);
    setFamilies(result.items);
    setDeletedFamilies(deleted.items);
    if (result.items.length === 0) {
      setFamilyDetails(null);
      setInvites([]);
      setPhase("new-family");
    } else if (result.items.length === 1 && result.items[0]) {
      await selectFamily(result.items[0].id);
    } else {
      setPhase("families");
    }
  }, [selectFamily]);

  const initialize = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const session = await apiRequest<{ user?: User } | null>(
        "/api/auth/get-session",
      );
      if (!session?.user) {
        onSessionChange?.(false);
        setPhase("signed-out");
        return;
      }
      setUser(session.user);
      onSessionChange?.(true);
      await loadFamilies();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("requestError"),
      );
      setPhase("signed-out");
    }
  }, [loadFamilies, t, onSessionChange]);

  useEffect(() => {
    if (view === "reset-password") return;
    void Promise.resolve().then(initialize);
  }, [initialize, view]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: () => Promise<void>,
  ) {
    event.preventDefault();
    await runAction(action);
  }

  async function runAction(action: () => Promise<void>) {
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

  async function signIn(form: FormData) {
    setVerificationEmail(null);
    const email = String(form.get("email") ?? "").trim();
    try {
      await apiRequest("/api/auth/sign-in/email", "POST", {
        email,
        password: form.get("password"),
      });
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.code === "EMAIL_NOT_VERIFIED"
      ) {
        setVerificationEmail(email);
        setError(t("verifyEmail"));
        return;
      }
      throw requestError;
    }
    await initialize();
  }

  async function signUp(form: FormData) {
    setVerificationEmail(null);
    const email = String(form.get("email") ?? "").trim();
    const result = await apiRequest<{ user?: User }>(
      "/api/auth/sign-up/email",
      "POST",
      {
        name: form.get("name"),
        email,
        password: form.get("password"),
        termsAccepted: true,
        privacyAccepted: true,
        adultConfirmed: true,
        authorizedCaregiver: true,
      },
    );
    setVerificationEmail(email);
    if (result.user) {
      setNotice(t("verifyEmail"));
      setAuthMode("sign-in");
    } else {
      setNotice(t("verifyEmail"));
    }
  }

  async function resendVerificationEmail(email: string) {
    try {
      await apiRequest("/api/auth/send-verification-email", "POST", { email });
      setNotice(t("verificationRequested"));
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.status === 429
      ) {
        setError(t("verificationRateLimited"));
        return;
      }
      throw requestError;
    }
  }

  async function requestPasswordReset(email: string) {
    await apiRequest("/api/auth/request-password-reset", "POST", {
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setNotice(t("resetEmailRequested"));
    setResetRequestOpen(false);
  }

  async function resetPassword(form: FormData) {
    if (!resetToken) {
      throw new Error(t("resetLinkInvalid"));
    }
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) {
      throw new Error(t("passwordsDoNotMatch"));
    }
    await apiRequest("/api/auth/reset-password", "POST", {
      newPassword,
      token: resetToken,
    });
    setNotice(t("passwordResetSuccess"));
    onReturnToSignIn?.();
  }

  async function createFamily(form: FormData) {
    const result = await apiRequest<{ id: string }>("/api/families", "POST", {
      name: form.get("familyName"),
      myRole: form.get("role"),
    });
    const refreshed = await apiRequest<{ items: FamilySummary[] }>(
      "/api/families",
    );
    setFamilies(refreshed.items);
    await selectFamily(result.id);
  }

  async function joinFamily(familyId: string) {
    const result = await apiRequest<{ items: FamilySummary[] }>(
      "/api/families",
    );
    setFamilies(result.items);
    await selectFamily(familyId);
  }

  async function createChild(form: FormData) {
    if (!familyDetails) return;
    await apiRequest(`/api/families/${familyDetails.id}/children`, "POST", {
      name: form.get("childName"),
      sex: form.get("sex"),
      dateOfBirth: form.get("dateOfBirth"),
      birthWeightG: Number(form.get("birthWeightG")),
    });
    const updated = await apiRequest<FamilyDetails>(
      `/api/families/${familyDetails.id}`,
    );
    setFamilyDetails(updated);
    setChildFormOpen(false);
    setNotice(t("childSaved"));
  }

  async function updateChildName(
    event: FormEvent<HTMLFormElement>,
    item: Child,
  ) {
    if (!familyDetails) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/children/${item.id}`, "PATCH", {
      name: form.get("name"),
      sex: form.get("sex"),
      dateOfBirth: form.get("dateOfBirth"),
      birthWeightG: Number(form.get("birthWeightG")),
      version: item.version,
    });
    const updated = await apiRequest<FamilyDetails>(
      `/api/families/${familyDetails.id}`,
    );
    setFamilyDetails(updated);
    setEditingChildId(null);
    setNotice(t("childSaved"));
  }

  async function deleteChild(item: Child) {
    if (!familyDetails || !window.confirm(t("confirmDeleteChild"))) return;
    await apiRequest(`/api/children/${item.id}`, "DELETE");
    const updated = await apiRequest<FamilyDetails>(
      `/api/families/${familyDetails.id}`,
    );
    setFamilyDetails(updated);
    setNotice(t("childDeleted"));
  }

  async function restoreChild(item: Child) {
    await apiRequest(`/api/children/${item.id}/restore`, "POST", {});
    if (!familyDetails) return;
    const updated = await apiRequest<FamilyDetails>(
      `/api/families/${familyDetails.id}`,
    );
    setFamilyDetails(updated);
    setNotice(t("childRestored"));
  }

  async function updateFamily(form: FormData) {
    if (!familyDetails) return;
    await apiRequest(`/api/families/${familyDetails.id}`, "PATCH", {
      name: form.get("familyName"),
      timezone: form.get("timezone"),
      pumpingSideMode: form.get("pumpingSideMode"),
    });
    await selectFamily(familyDetails.id);
    setNotice(t("familySaved"));
  }

  async function updateBottleShortcuts(form: FormData) {
    if (!familyDetails) return;
    const values = String(form.get("quickBottleMl") ?? "").split(",");
    if (
      values.length < 1 ||
      values.length > 6 ||
      values.some((value) => !/^\d+$/.test(value.trim())) ||
      values.some((value) => Number(value) < 1 || Number(value) > 400)
    ) {
      throw new Error(t("invalidBottleShortcuts"));
    }
    await apiRequest(`/api/families/${familyDetails.id}`, "PATCH", {
      quickBottleMl: values.map((value) => Number(value.trim())),
    });
    await selectFamily(familyDetails.id);
    setNotice(t("familySaved"));
  }

  async function changeMyRole(role: "mom" | "dad") {
    if (!familyDetails) return;
    await apiRequest(`/api/families/${familyDetails.id}/members/me`, "PATCH", {
      role,
    });
    await selectFamily(familyDetails.id);
  }

  async function removeMember(id: string) {
    if (!familyDetails || !window.confirm(t("confirmRemoveMember"))) return;
    await apiRequest(
      `/api/families/${familyDetails.id}/members/${id}`,
      "DELETE",
    );
    await selectFamily(familyDetails.id);
  }

  async function leaveFamily() {
    if (!familyDetails || !window.confirm(t("confirmLeaveFamily"))) return;
    await apiRequest(`/api/families/${familyDetails.id}/members/me`, "DELETE");
    await loadFamilies();
  }

  async function reorderChild(item: Child, offset: -1 | 1) {
    if (!familyDetails) return;
    const items = [...familyDetails.children];
    const index = items.findIndex((child) => child.id === item.id);
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    await apiRequest(
      `/api/families/${familyDetails.id}/children/order`,
      "PATCH",
      { childIds: items.map((child) => child.id) },
    );
    await selectFamily(familyDetails.id);
  }

  async function deleteFamily() {
    if (!familyDetails) return;
    const confirmName = window.prompt(t("confirmFamilyName"));
    if (confirmName === null) return;
    await apiRequest(`/api/families/${familyDetails.id}`, "DELETE", {
      confirmName,
    });
    await loadFamilies();
  }

  async function restoreFamily(item: FamilySummary) {
    await apiRequest(`/api/families/${item.id}/restore`, "POST", {});
    await loadFamilies();
    await selectFamily(item.id);
  }

  async function createInvite(form: FormData) {
    if (!familyDetails) return;
    const result = await apiRequest<{ code: string }>(
      `/api/families/${familyDetails.id}/invites`,
      "POST",
      { targetRole: form.get("targetRole") },
    );
    const activeInvites = await apiRequest<{
      items: Array<FamilyInvite & { status: string }>;
    }>(`/api/families/${familyDetails.id}/invites`);
    setInvites(
      activeInvites.items.filter((invite) => invite.status === "active"),
    );
    setInviteCode(result.code);
    setInviteFormOpen(false);
    setNotice(t("inviteCreated"));
  }

  async function revokeInvite(inviteId: string) {
    if (!familyDetails) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        `/api/families/${familyDetails.id}/invites/${inviteId}`,
        "DELETE",
      );
      setInvites((currentInvites) =>
        currentInvites.filter((invite) => invite.id !== inviteId),
      );
      setNotice(t("inviteRevoked"));
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

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/sign-out", "POST", {});
      setUser(null);
      setFamilies([]);
      setFamilyDetails(null);
      setPhase("signed-out");
      onSessionChange?.(false);
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

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setNotice(t("copied"));
    } catch {
      setError(t("copyFailed"));
    }
  }

  return (
    <section className="portal" aria-label={t("portalEyebrow")}>
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

      {phase === "loading" && view !== "reset-password" && (
        <p className="portal-loading" role="status">
          {t("loading")}
        </p>
      )}

      {phase === "signed-out" && view !== "reset-password" && (
        <div className="portal-card auth-card">
          {resetRequestOpen ? (
            <>
              <h2>{t("forgotPassword")}</h2>
              <form
                className="portal-form"
                onSubmit={(event) =>
                  void submit(event, () =>
                    requestPasswordReset(authEmail.trim()),
                  )
                }
              >
                <label>
                  {t("email")}
                  <input
                    autoComplete="email"
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                    type="email"
                    value={authEmail}
                  />
                </label>
                <button
                  className="portal-primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? t("loading") : t("sendResetLink")}
                </button>
                <button
                  className="portal-secondary"
                  disabled={busy}
                  onClick={() => setResetRequestOpen(false)}
                  type="button"
                >
                  {t("backToSignIn")}
                </button>
              </form>
            </>
          ) : (
            <>
              <div
                className="portal-tabs"
                role="group"
                aria-label={t("account")}
              >
                <button
                  aria-pressed={authMode === "sign-in"}
                  className="portal-tab"
                  disabled={busy}
                  onClick={() => {
                    setAuthMode("sign-in");
                    setError("");
                    setNotice("");
                    setVerificationEmail(null);
                    setResetRequestOpen(false);
                  }}
                  type="button"
                >
                  {t("signIn")}
                </button>
                <button
                  aria-pressed={authMode === "sign-up"}
                  className="portal-tab"
                  disabled={busy}
                  onClick={() => {
                    setAuthMode("sign-up");
                    setError("");
                    setNotice("");
                    setVerificationEmail(null);
                    setResetRequestOpen(false);
                  }}
                  type="button"
                >
                  {t("createAccount")}
                </button>
              </div>
              <form
                className="portal-form"
                onSubmit={(event) =>
                  void submit(event, () =>
                    authMode === "sign-in"
                      ? signIn(new FormData(event.currentTarget))
                      : signUp(new FormData(event.currentTarget)),
                  )
                }
              >
                {authMode === "sign-up" && (
                  <>
                    <label>
                      {t("name")}
                      <input autoComplete="name" name="name" required />
                    </label>
                    <label className="portal-check">
                      <input required type="checkbox" />
                      <span>{t("termsConsent")}</span>
                    </label>
                    <label className="portal-check">
                      <input required type="checkbox" />
                      <span>{t("adultConsent")}</span>
                    </label>
                    <label className="portal-check">
                      <input required type="checkbox" />
                      <span>{t("caregiverConsent")}</span>
                    </label>
                  </>
                )}
                <label>
                  {t("email")}
                  <input
                    autoComplete="email"
                    name="email"
                    onChange={(event) => {
                      setAuthEmail(event.target.value);
                      if (verificationEmail) {
                        setError("");
                        setNotice("");
                      }
                      setVerificationEmail(null);
                    }}
                    required
                    type="email"
                    value={authEmail}
                  />
                </label>
                <label>
                  {t("password")}
                  <input
                    autoComplete={
                      authMode === "sign-up"
                        ? "new-password"
                        : "current-password"
                    }
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </label>
                <button
                  className="portal-primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? t("loading")
                    : authMode === "sign-in"
                      ? t("signIn")
                      : t("createAccount")}
                </button>
                {verificationEmail &&
                  authEmail.trim() === verificationEmail && (
                    <button
                      className="portal-secondary"
                      disabled={busy}
                      onClick={() =>
                        void runAction(() =>
                          resendVerificationEmail(verificationEmail),
                        )
                      }
                      type="button"
                    >
                      {busy ? t("loading") : t("resendVerification")}
                    </button>
                  )}
                {authMode === "sign-in" && (
                  <button
                    className="portal-secondary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setResetRequestOpen(true);
                    }}
                    type="button"
                  >
                    {t("forgotPassword")}
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      )}

      {view === "reset-password" && (
        <div className="portal-card auth-card">
          <h2>{t("resetPassword")}</h2>
          {resetToken ? (
            <form
              className="portal-form"
              onSubmit={(event) =>
                void submit(event, () =>
                  resetPassword(new FormData(event.currentTarget)),
                )
              }
            >
              <label>
                {t("newPassword")}
                <input
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  name="newPassword"
                  required
                  type="password"
                />
              </label>
              <label>
                {t("confirmPassword")}
                <input
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </label>
              <button className="portal-primary" disabled={busy} type="submit">
                {busy ? t("loading") : t("resetPassword")}
              </button>
            </form>
          ) : (
            <p className="portal-message portal-error" role="alert">
              {t("resetLinkInvalid")}
            </p>
          )}
          <button
            className="portal-secondary"
            disabled={busy}
            onClick={onReturnToSignIn}
            type="button"
          >
            {t("backToSignIn")}
          </button>
        </div>
      )}
      {phase === "new-family" && (
        <div className="portal-workspace">
          <div className="portal-card">
            <h2>{t("createFamily")}</h2>
            <form
              className="portal-form"
              onSubmit={(event) =>
                void submit(event, () =>
                  createFamily(new FormData(event.currentTarget)),
                )
              }
            >
              <label>
                {t("familyName")}
                <input autoComplete="organization" name="familyName" required />
              </label>
              <label>
                {t("yourRole")}
                <select defaultValue="mom" name="role">
                  <option value="mom">{t("mom")}</option>
                  <option value="dad">{t("dad")}</option>
                </select>
              </label>
              <button className="portal-primary" disabled={busy} type="submit">
                {t("createFamily")}
              </button>
            </form>
          </div>
          <JoinFamilyPanel onJoined={joinFamily} />
        </div>
      )}

      {phase === "families" && (
        <div className="portal-card">
          <h2>{t("yourFamilies")}</h2>
          <div className="portal-family-list">
            {families.map((item) => (
              <button
                className="portal-family-option"
                disabled={busy}
                key={item.id}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void selectFamily(item.id)
                    .catch((requestError: unknown) =>
                      setError(
                        requestError instanceof Error
                          ? requestError.message
                          : t("requestError"),
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
                type="button"
              >
                <span>{item.name}</span>
                <span className="portal-role">{t(item.role)}</span>
              </button>
            ))}
          </div>
          <button
            className="portal-secondary"
            onClick={() => setPhase("new-family")}
            type="button"
          >
            {t("createFamily")}
          </button>
          <button
            className="portal-secondary"
            disabled={busy}
            onClick={() => void signOut()}
            type="button"
          >
            {t("signOut")}
          </button>
        </div>
      )}

      {phase === "family" && familyDetails && view === "today" && (
        <div className="portal-workspace">
          <Journal
            familyId={familyDetails.id}
            children={familyDetails.children}
            pumpingSideMode={familyDetails.pumpingSideMode}
            quickBottleMl={familyDetails.quickBottleMl}
            familyTimezone={familyDetails.timezone}
            members={familyDetails.members}
          />
        </div>
      )}

      {phase === "family" && familyDetails && view !== "today" && (
        <div className="portal-workspace">
          <div className="portal-card portal-family-card">
            <div className="portal-family-title">
              <div>
                <p className="portal-kicker">{t("yourFamily")}</p>
                <h2>{familyDetails.name}</h2>
              </div>
              <span className="portal-role">{t(familyDetails.role)}</span>
            </div>
            <div className="portal-section">
              <h3>{t("familyMembers")}</h3>
              <ul className="portal-member-list">
                {familyDetails.members.map((member) => (
                  <li key={member.id}>
                    <span>{member.displayName}</span>
                    <span className="portal-role">
                      {t(member.role)}
                      {member.isMe ? ` · ${t("you")}` : ""}
                    </span>
                    {!member.isMe &&
                      member.role === "caregiver" &&
                      isParentRole(familyDetails.role) && (
                        <button
                          className="portal-inline-button"
                          disabled={busy}
                          onClick={() =>
                            void runAction(() => removeMember(member.id))
                          }
                          type="button"
                        >
                          {t("removeMember")}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
              {isParentRole(familyDetails.role) && (
                <div className="portal-family-management">
                  <h3>{t("familySettings")}</h3>
                  <form
                    className="portal-form portal-nested-form"
                    onSubmit={(event) =>
                      void submit(event, () =>
                        updateFamily(new FormData(event.currentTarget)),
                      )
                    }
                  >
                    <label>
                      {t("familyName")}
                      <input
                        name="familyName"
                        defaultValue={familyDetails.name}
                        required
                        maxLength={60}
                      />
                    </label>
                    <label>
                      {t("timezone")}
                      <input
                        name="timezone"
                        defaultValue={familyDetails.timezone}
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      {t("pumpingMode")}
                      <select
                        name="pumpingSideMode"
                        defaultValue={familyDetails.pumpingSideMode}
                      >
                        <option value="combined">{t("combined")}</option>
                        <option value="separate">{t("separate")}</option>
                      </select>
                    </label>
                    <button
                      className="portal-primary"
                      disabled={busy}
                      type="submit"
                    >
                      {t("saveFamily")}
                    </button>
                  </form>
                  <label className="portal-role-field">
                    {t("myRole")}
                    <select
                      value={familyDetails.role}
                      onChange={(event) =>
                        void runAction(() =>
                          changeMyRole(event.target.value as "mom" | "dad"),
                        )
                      }
                    >
                      <option value="mom">{t("mom")}</option>
                      <option value="dad">{t("dad")}</option>
                    </select>
                  </label>
                  <button
                    className="portal-inline-button"
                    disabled={busy}
                    onClick={() => void runAction(deleteFamily)}
                    type="button"
                  >
                    {t("deleteFamily")}
                  </button>
                </div>
              )}
              <form
                className="portal-form portal-nested-form"
                onSubmit={(event) =>
                  void submit(event, () =>
                    updateBottleShortcuts(new FormData(event.currentTarget)),
                  )
                }
              >
                <label>
                  {t("quickBottleShortcuts")}
                  <input
                    name="quickBottleMl"
                    defaultValue={familyDetails.quickBottleMl.join(",")}
                    required
                  />
                </label>
                <button
                  className="portal-primary"
                  disabled={busy}
                  type="submit"
                >
                  {t("save")}
                </button>
              </form>
            </div>
            <div className="portal-section">
              <div className="portal-section-title">
                <h3>{t("children")}</h3>
                {isParentRole(familyDetails.role) && (
                  <button
                    className="portal-inline-button"
                    onClick={() => setChildFormOpen(!childFormOpen)}
                    type="button"
                  >
                    {childFormOpen ? t("cancel") : `+ ${t("addChild")}`}
                  </button>
                )}

                {phase === "family" && (
                  <JoinFamilyPanel onJoined={joinFamily} />
                )}
              </div>
              {familyDetails.children.length > 0 ? (
                <ul className="portal-child-list">
                  {familyDetails.children.map((child) => (
                    <li key={child.id}>
                      <div className="portal-child-summary">
                        <strong>{child.name}</strong>
                        <span>
                          {child.dateOfBirth} · {child.birthWeightG} g
                        </span>
                      </div>
                      {isParentRole(familyDetails.role) && (
                        <div className="portal-child-actions">
                          <button
                            className="portal-inline-button"
                            disabled={
                              busy || familyDetails.children[0]?.id === child.id
                            }
                            onClick={() =>
                              void runAction(() => reorderChild(child, -1))
                            }
                            type="button"
                            aria-label={t("moveUp")}
                          >
                            ↑
                          </button>
                          <button
                            className="portal-inline-button"
                            disabled={
                              busy ||
                              familyDetails.children.at(-1)?.id === child.id
                            }
                            onClick={() =>
                              void runAction(() => reorderChild(child, 1))
                            }
                            type="button"
                            aria-label={t("moveDown")}
                          >
                            ↓
                          </button>
                          <button
                            className="portal-inline-button"
                            onClick={() =>
                              setEditingChildId(
                                editingChildId === child.id ? null : child.id,
                              )
                            }
                            type="button"
                          >
                            {editingChildId === child.id
                              ? t("cancel")
                              : t("editChild")}
                          </button>
                          <button
                            className="portal-inline-button"
                            disabled={busy}
                            onClick={() =>
                              void runAction(() => deleteChild(child))
                            }
                            type="button"
                          >
                            {t("deleteChild")}
                          </button>
                        </div>
                      )}
                      {editingChildId === child.id && (
                        <form
                          className="portal-child-edit"
                          onSubmit={(event) =>
                            void submit(event, () =>
                              updateChildName(event, child),
                            )
                          }
                        >
                          <label>
                            {t("childName")}
                            <input
                              autoComplete="off"
                              defaultValue={child.name}
                              name="name"
                              required
                            />
                          </label>
                          <div className="portal-form-row">
                            <label>
                              {t("sex")}
                              <select name="sex" defaultValue={child.sex}>
                                <option value="female">{t("female")}</option>
                                <option value="male">{t("male")}</option>
                              </select>
                            </label>
                            <label>
                              {t("dateOfBirth")}
                              <input
                                name="dateOfBirth"
                                type="date"
                                min={dateBounds.min}
                                max={dateBounds.max}
                                defaultValue={child.dateOfBirth}
                                required
                              />
                            </label>
                          </div>
                          <label>
                            {t("birthWeight")}
                            <input
                              name="birthWeightG"
                              type="number"
                              min={400}
                              max={7000}
                              defaultValue={child.birthWeightG}
                              required
                            />
                          </label>
                          <button
                            className="portal-primary"
                            disabled={busy}
                            type="submit"
                          >
                            {t("saveChild")}
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="portal-muted">{t("noChildren")}</p>
              )}
              {childFormOpen && isParentRole(familyDetails.role) && (
                <form
                  className="portal-form portal-nested-form"
                  onSubmit={(event) =>
                    void submit(event, () =>
                      createChild(new FormData(event.currentTarget)),
                    )
                  }
                >
                  <label>
                    {t("childName")}
                    <input autoComplete="off" name="childName" required />
                  </label>
                  <div className="portal-form-row">
                    <label>
                      {t("sex")}
                      <select defaultValue="female" name="sex">
                        <option value="female">{t("female")}</option>
                        <option value="male">{t("male")}</option>
                      </select>
                    </label>
                    <label>
                      {t("dateOfBirth")}
                      <input
                        max={dateBounds.max}
                        min={dateBounds.min}
                        name="dateOfBirth"
                        required
                        type="date"
                      />
                    </label>
                  </div>
                  <label>
                    {t("birthWeight")}
                    <input
                      max={7000}
                      min={400}
                      name="birthWeightG"
                      required
                      type="number"
                    />
                  </label>
                  <button
                    className="portal-primary"
                    disabled={busy}
                    type="submit"
                  >
                    {t("saveChild")}
                  </button>
                </form>
              )}
              {familyDetails.deletedChildren.length > 0 &&
                isParentRole(familyDetails.role) && (
                  <div className="portal-deleted-children">
                    <h4>{t("recentlyDeleted")}</h4>
                    <ul className="portal-child-list">
                      {familyDetails.deletedChildren.map((child) => (
                        <li key={child.id}>
                          <div className="portal-child-summary">
                            <strong>{child.name}</strong>
                            <span>{child.dateOfBirth}</span>
                          </div>
                          <button
                            className="portal-inline-button"
                            disabled={busy}
                            onClick={() =>
                              void runAction(() => restoreChild(child))
                            }
                            type="button"
                          >
                            {t("restoreChild")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
            {isParentRole(familyDetails.role) && (
              <div className="portal-section">
                <div className="portal-section-title">
                  <h3>{t("inviteFamily")}</h3>
                  <button
                    className="portal-inline-button"
                    onClick={() => setInviteFormOpen(!inviteFormOpen)}
                    type="button"
                  >
                    {inviteFormOpen ? t("cancel") : t("createInvite")}
                  </button>
                </div>
                {inviteFormOpen && (
                  <form
                    className="portal-form portal-nested-form"
                    onSubmit={(event) =>
                      void submit(event, () =>
                        createInvite(new FormData(event.currentTarget)),
                      )
                    }
                  >
                    <label>
                      {t("inviteRole")}
                      <select defaultValue="caregiver" name="targetRole">
                        <option value="caregiver">{t("caregiver")}</option>
                        <option value="parent">{t("parent")}</option>
                      </select>
                    </label>
                    <button
                      className="portal-primary"
                      disabled={busy}
                      type="submit"
                    >
                      {t("createInvite")}
                    </button>
                  </form>
                )}
                {invites.length > 0 && (
                  <ul className="portal-invite-list">
                    {invites.map((invite) => (
                      <li key={invite.id}>
                        <div>
                          <strong>{t(invite.targetRole)}</strong>
                          <span>
                            {t("expires")}{" "}
                            {new Date(invite.expiresAt).toLocaleDateString()}
                            {invite.createdBy
                              ? ` · ${t("createdBy")} ${invite.createdBy}`
                              : ""}
                          </span>
                        </div>
                        <button
                          className="portal-inline-button"
                          disabled={busy}
                          onClick={() => void revokeInvite(invite.id)}
                          type="button"
                        >
                          {t("revoke")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {inviteCode && (
                  <div className="portal-invite-code">
                    <code>{inviteCode}</code>
                    <button
                      className="portal-secondary"
                      onClick={() => void copyInvite()}
                      type="button"
                    >
                      {t("copyCode")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="portal-actions">
            {families.length > 1 && (
              <button
                className="portal-secondary"
                onClick={() => setPhase("families")}
                type="button"
              >
                {t("switchFamily")}
              </button>
            )}
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => void signOut()}
              type="button"
            >
              {t("signOut")}
            </button>
            <button
              className="portal-secondary"
              disabled={busy}
              onClick={() => void runAction(leaveFamily)}
              type="button"
            >
              {t("leaveFamily")}
            </button>
            {user && <span className="portal-muted">{user.email}</span>}
          </div>
        </div>
      )}

      {phase === "new-family" && user && (
        <>
          <button
            className="portal-signout"
            disabled={busy}
            onClick={() => void signOut()}
            type="button"
          >
            {t("signOut")}
          </button>
        </>
      )}
      {deletedFamilies.length > 0 && (
        <div className="portal-section">
          <h3>{t("deletedFamilies")}</h3>
          <ul className="portal-child-list">
            {deletedFamilies.map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <button
                  className="portal-inline-button"
                  disabled={busy}
                  onClick={() => void runAction(() => restoreFamily(item))}
                  type="button"
                >
                  {t("restoreFamily")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
