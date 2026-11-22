import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App.tsx";
import { registerSW } from "virtual:pwa-register";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new Event("pwa-update-available"));
  },
});
