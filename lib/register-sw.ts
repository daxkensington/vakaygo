import { logger } from "@/lib/logger";
export async function registerServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV !== "production"
  ) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Check for updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // New version available — dispatch custom event for toast
          window.dispatchEvent(
            new CustomEvent("sw-update-available", {
              detail: { registration },
            })
          );
        }
      });
    });

    return registration;
  } catch (error) {
    logger.error("Service worker registration failed", error);
    return null;
  }
}

export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return;

  // Reload only after the new SW has actually taken control. Reloading
  // before then would re-fetch under the old SW and the user wouldn't see
  // the new version.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  waiting.postMessage({ type: "SKIP_WAITING" });
}
