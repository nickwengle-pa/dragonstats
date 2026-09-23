import { afterEach, describe, expect, it, vi } from "vitest";
import { claimRefreshGuard, prepareAppRefresh, refreshApp, refreshGate, type BeforeRefreshDetail } from "./appRefresh";

class Worker extends EventTarget {
  state = "installing";
  scriptURL = "https://dragonstats.app/sw.js";
  postMessage = vi.fn();
  transition(state: string) { this.state = state; this.dispatchEvent(new Event("statechange")); }
}
function setup(state = "installing") {
  const worker = new Worker();
  worker.state = state;
  const registration = { scope: "https://dragonstats.app/", active: state === "activated" ? worker : null, installing: state === "installing" ? worker : null, waiting: state === "installed" ? worker : null, update: vi.fn().mockResolvedValue(undefined) };
  const container = Object.assign(new EventTarget(), {
    controller: state === "activated" ? worker : null,
    getRegistration: vi.fn().mockResolvedValue(registration),
    register: vi.fn().mockResolvedValue(registration),
  });
  return { worker, registration, container, api: container as unknown as ServiceWorkerContainer };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("app update refresh", () => {
  it("waits for the new worker to control the page, rather than reloading the old shell", async () => {
    const { api, worker, container } = setup();
    let ready = false;
    const pending = prepareAppRefresh(api).then(() => { ready = true; });
    await vi.waitFor(() => expect(container.register).toHaveBeenCalledWith(worker.scriptURL, { scope: "https://dragonstats.app/", updateViaCache: "none" }));
    expect(ready).toBe(false);
    worker.transition("installed");
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    worker.transition("activated");
    expect(ready).toBe(false);
    container.controller = worker;
    container.dispatchEvent(new Event("controllerchange"));
    await pending;
    expect(ready).toBe(true);
  });
  it("refreshes when already running the current version", async () => {
    const { api, registration } = setup("activated");
    await prepareAppRefresh(api);
    expect(registration.update).toHaveBeenCalledOnce();
  });
  it("activates an update already waiting", async () => {
    const { api, worker, container } = setup("installed");
    const pending = prepareAppRefresh(api);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    container.controller = worker;
    worker.transition("activated");
    await pending;
  });
  it("does not reload when offline", async () => {
    const reload = vi.fn();
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("window", { location: { reload } });
    await expect(refreshApp()).rejects.toThrow("Connect to the internet");
    expect(reload).not.toHaveBeenCalled();
  });
  it("reports an installation failure without reloading", async () => {
    const { api, worker, registration } = setup();
    const pending = prepareAppRefresh(api);
    const failure = expect(pending).rejects.toThrow("could not finish");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalled());
    worker.transition("redundant");
    await failure;
  });
  it("reloads the current URL exactly once after the update is ready", async () => {
    const { api } = setup("activated");
    const reload = vi.fn();
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: api });
    vi.stubGlobal("window", { location: { reload } });
    await refreshApp();
    expect(reload).toHaveBeenCalledOnce();
  });
});

/* Film review, schedule, roster and settings save on a button. A pull that
   reloads one of them silently threw away whatever had been typed. */
describe("pull-to-refresh with unsaved typing", () => {
  const gate = (o: Partial<Parameters<typeof refreshGate>[0]>) =>
    refreshGate({ vetoed: false, screenGuarded: false, edited: false, confirmed: false, ...o });

  it("refreshes straight away when nothing was typed", () => {
    expect(gate({})).toBe("refresh");
  });
  it("asks first when something was typed on a screen that does not guard itself", () => {
    expect(gate({ edited: true })).toBe("confirm");
    expect(gate({ edited: true, confirmed: true })).toBe("refresh");
  });
  it("leaves a self-guarding screen to its own judgement", () => {
    expect(gate({ edited: true, screenGuarded: true })).toBe("refresh");
  });
  it("never refreshes over a veto, even after the operator confirms", () => {
    expect(gate({ vetoed: true, edited: true, confirmed: true })).toBe("vetoed");
  });
  it("lets a screen claim the guard through the event it is sent", () => {
    const event = new CustomEvent<BeforeRefreshDetail>("app:before-refresh", { detail: { screenGuarded: false } });
    claimRefreshGuard(event);
    expect(event.detail.screenGuarded).toBe(true);
    // The same handler also hears a plain Event (the sync-discard guard).
    expect(() => claimRefreshGuard(new Event("app:before-sync-discard"))).not.toThrow();
  });
});
