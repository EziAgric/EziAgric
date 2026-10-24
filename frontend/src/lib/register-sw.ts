import { logger } from "./logger";

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        logger.info("[SW] Service worker registered");
      })
      .catch((err) => {
        logger.warn("[SW] Service worker registration failed:", err);
      });
  });
}
