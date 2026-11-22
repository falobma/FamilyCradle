import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FamilyPortal } from "./FamilyPortal";
import "./App.css";

const languages = [
  { code: "id", label: "ID" },
  { code: "en", label: "EN" },
  { code: "mixed", label: "MIX" },
] as const;

function App() {
  const { i18n, t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [view, setView] = useState<"landing" | "account" | "today" | "settings">(
    "landing",
  );
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    document.documentElement.lang =
      i18n.language === "mixed" ? "en" : i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener("pwa-update-available", showUpdate);
    return () => window.removeEventListener("pwa-update-available", showUpdate);
  }, []);

  useEffect(() => {
    void fetch("/api/auth/get-session", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { user?: unknown } | null) => {
        const isSignedIn = Boolean(session?.user);
        setSignedIn(isSignedIn);
        setView((current) =>
          isSignedIn
            ? "today"
            : current === "account"
              ? "account"
              : "landing",
        );
      })
      .catch(() => {
        setSignedIn(false);
        setView((current) => (current === "account" ? "account" : "landing"));
      });
  }, []);

  function changeLanguage(code: "id" | "en" | "mixed") {
    localStorage.setItem("familycradle.language", code);
    void i18n.changeLanguage(code);
  }

  const handleSessionChange = useCallback((isSignedIn: boolean) => {
    setSignedIn(isSignedIn);
    setView((current) =>
      isSignedIn
        ? current === "settings"
          ? "settings"
          : "today"
        : current === "account"
          ? "account"
          : "landing",
    );
  }, []);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="FamilyCradle home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M8 20.5c0-6.7 5.4-12.1 12-12.1s12 5.4 12 12.1v10H8v-10Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M13 25h14M15 30v-5m10 5v-5"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 3.5v4m13 1.8-2.8 2.8M7.8 9.3l2.8 2.8"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </span>
          <span className="brand-name">FamilyCradle</span>
        </a>

        <div className="topbar-actions">
          {signedIn && (
            <button
              className="today-nav-button"
              onClick={() => setView("today")}
              type="button"
              aria-pressed={view === "today"}
            >
              {t("today")}
            </button>
          )}
          <details className="topbar-menu">
            <summary aria-label={t("language")}>
              <span>MIX</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="topbar-menu-panel">
              <div
                className="language-picker"
                role="group"
                aria-label={t("language")}
              >
                {languages.map(({ code, label }) => (
                  <button
                    aria-pressed={i18n.resolvedLanguage === code}
                    className="language-option"
                    key={code}
                    onClick={() => changeLanguage(code)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {signedIn && (
                <button
                  className="topbar-settings-button"
                  onClick={() => setView("settings")}
                  type="button"
                >
                  {t("familySettings")}
                </button>
              )}
            </div>
          </details>
          {!signedIn && (
            <button
              className="portal-open-button"
              onClick={() => setView("account")}
              type="button"
            >
              {t("openJournal")}
            </button>
          )}
        </div>
      </header>

      {view === "account" || view === "today" || view === "settings" ? (
        <FamilyPortal
          view={
            view === "settings"
              ? "settings"
              : view === "today"
                ? "today"
                : "account"
          }
          onSessionChange={handleSessionChange}
        />
      ) : (
        <>
          <section className="hero" id="home">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" />
                {t("eyebrow")}
              </p>
              <h1>{t("headline")}</h1>
              <p className="hero-description">{t("intro")}</p>
              <a className="text-link" href="#how-it-helps">
                {t("learnMore")}
                <span aria-hidden="true">↗</span>
              </a>
              <p className="coming-note">{t("coming")}</p>
            </div>

            <div
              className="illustration"
              aria-label={t("illustrationAlt")}
              role="img"
            >
              <div className="illustration-sun" />
              <div className="illustration-orbit orbit-one" />
              <div className="illustration-orbit orbit-two" />
              <div className="cradle">
                <div className="cradle-canopy" />
                <div className="cradle-mattress">
                  <span className="cradle-pillow" />
                  <span className="cradle-blanket" />
                </div>
                <div className="cradle-rail">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="cradle-leg cradle-leg-left" />
                <div className="cradle-leg cradle-leg-right" />
              </div>
              <span className="sparkle sparkle-one">✦</span>
              <span className="sparkle sparkle-two">✦</span>
              <span className="illustration-caption">
                {t("illustrationCaption")}
              </span>
            </div>
          </section>

          <section className="help-section" id="how-it-helps">
            <div className="section-heading">
              <p className="eyebrow">{t("sectionEyebrow")}</p>
              <h2>{t("sectionTitle")}</h2>
              <p>{t("sectionIntro")}</p>
            </div>

            <div className="feature-grid">
              <article className="feature-card">
                <span
                  className="feature-icon feature-icon-milk"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M12 5h8v4l3 4v13H9V13l3-4V5Z" />
                    <path d="M12 9h8M9 15h14M16 19v5m-2.5-2.5h5" />
                  </svg>
                </span>
                <h3>{t("featureMilkTitle")}</h3>
                <p>{t("featureMilkBody")}</p>
              </article>
              <article className="feature-card">
                <span
                  className="feature-icon feature-icon-sleep"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M24.5 19.5A10 10 0 0 1 12.5 7.5 10 10 0 1 0 24.5 19.5Z" />
                    <path d="m22 6 .8 2.2L25 9l-2.2.8L22 12l-.8-2.2L19 9l2.2-.8L22 6Z" />
                  </svg>
                </span>
                <h3>{t("featureSleepTitle")}</h3>
                <p>{t("featureSleepBody")}</p>
              </article>
              <article className="feature-card">
                <span
                  className="feature-icon feature-icon-family"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 32 32" fill="none">
                    <circle cx="12" cy="11" r="3.5" />
                    <circle cx="22" cy="13" r="2.8" />
                    <path d="M5.5 25v-2.2a6.5 6.5 0 0 1 13 0V25h-13Zm14.2 0v-2a5 5 0 0 1 8.3-3.8" />
                  </svg>
                </span>
                <h3>{t("featureFamilyTitle")}</h3>
                <p>{t("featureFamilyBody")}</p>
              </article>
            </div>
          </section>

          <footer className="footer">
            <a className="brand brand-small" href="#home">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 40 40" fill="none">
                  <path
                    d="M8 20.5c0-6.7 5.4-12.1 12-12.1s12 5.4 12 12.1v10H8v-10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M13 25h14M15 30v-5m10 5v-5"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              <span className="brand-name">FamilyCradle</span>
            </a>
            <p>{t("footer")}</p>
          </footer>
        </>
      )}

      {updateAvailable && (
        <div className="update-toast" role="status">
          <span>{t("updateAvailable")}</span>
          <button type="button" onClick={() => window.location.reload()}>
            {t("reload")}
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
