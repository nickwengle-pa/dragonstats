/** Sent as "app:before-refresh" before a pull-down refresh. A screen calls
 *  preventDefault() to veto it. A screen whose own veto already covers
 *  everything unsaved on it sets `screenGuarded`, so the generic "you typed
 *  here" check does not second-guess it. */
export interface BeforeRefreshDetail {
  screenGuarded: boolean;
}

export function claimRefreshGuard(event: Event) {
  const detail = (event as CustomEvent<BeforeRefreshDetail | null>).detail;
  if (detail) detail.screenGuarded = true;
}

/** A control the operator types into or sets, as opposed to a button. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !["button", "submit", "reset", "image", "hidden"].includes(target.type);
  return target.isContentEditable;
}

export type RefreshGate = "vetoed" | "confirm" | "refresh";

/** Whether a pull may reload now. Typing on a screen that does not guard
 *  itself may be an unsaved form, so it asks first; a veto always wins. */
export function refreshGate(o: { vetoed: boolean; screenGuarded: boolean; edited: boolean; confirmed: boolean }): RefreshGate {
  if (o.vetoed) return "vetoed";
  if (o.edited && !o.screenGuarded && !o.confirmed) return "confirm";
  return "refresh";
}

/** Install the current app shell before reloading. Never delete offline data. */
export async function prepareAppRefresh(container?: ServiceWorkerContainer): Promise<void> {
  const registration = await container?.getRegistration();
  if (!registration) {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to reach the app server.");
    return;
  }
  // Bypass the HTTP cache for both the worker and its imported scripts.
  const scriptURL = (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL;
  if (scriptURL) await container!.register(scriptURL, { scope: registration.scope, updateViaCache: "none" });
  await registration.update();
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("The app update is not ready. Try again.");
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      container!.removeEventListener("controllerchange", check);
    };
    const check = () => {
      if (worker.state === "redundant") {
        cleanup();
        reject(new Error("The update could not finish. Try again."));
      } else if (worker.state === "activated" && container!.controller === worker) {
        cleanup();
        resolve();
      } else if (worker.state === "installed") {
        worker.postMessage({ type: "SKIP_WAITING" });
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The update is taking too long. Try again with a stronger connection."));
    }, 25000);
    worker.addEventListener("statechange", check);
    container!.addEventListener("controllerchange", check);
    check();
  });
}

export async function refreshApp(): Promise<void> {
  if (!navigator.onLine) throw new Error("Connect to the internet to check for an update.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prepareAppRefresh("serviceWorker" in navigator ? navigator.serviceWorker : undefined),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Unable to check for updates. Try again with a stronger connection.")), 30000);
      }),
    ]);
    // Query, game id and route all survive. IndexedDB and auth storage remain.
    window.location.reload();
  } finally {
    clearTimeout(timeout);
  }
}
