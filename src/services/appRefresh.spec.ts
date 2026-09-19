import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareAppRefresh, refreshApp } from "./appRefresh";

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
