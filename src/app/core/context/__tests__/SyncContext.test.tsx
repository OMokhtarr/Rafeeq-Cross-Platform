import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { App as CapApp } from "@capacitor/app";
import { SyncProvider, useSync } from "../SyncContext";
import { getLastSyncedAt, resetSyncState, syncNow } from "../../services/sync/sync.service";
import { onLocalChange } from "../../services/sync/local-changes";

jest.mock("@capacitor/app", () => ({ App: { addListener: jest.fn() } }));
jest.mock("../../services/sync/sync.service", () => ({
  syncNow: jest.fn(),
  resetSyncState: jest.fn(),
  getLastSyncedAt: jest.fn(),
}));
const mockAuth: { current: { enabled: boolean; user: { id: string } | null } } = {
  current: { enabled: true, user: { id: "u1" } },
};
const mockSub: { current: { isPro: boolean; ready: boolean } } = { current: { isPro: true, ready: true } };
jest.mock("../../services/sync/local-changes", () => ({ onLocalChange: jest.fn() }));
jest.mock("../AuthContext", () => ({ useAuth: () => mockAuth.current }));
jest.mock("../SubscriptionContext", () => ({ useSubscription: () => mockSub.current }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sync = syncNow as jest.Mock;
let root: Root;
let host: HTMLDivElement;
let latest: ReturnType<typeof useSync>;
let resume: () => void;
let changeListeners: Set<() => void>;

const Probe = () => {
  latest = useSync();
  return null;
};
const render = () =>
  act(async () =>
    root.render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    ),
  );
/** Lets pending promise callbacks run. */
const flush = () => act(async () => {});
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const edit = () =>
  act(async () => {
    changeListeners.forEach((cb) => cb());
  });
const fire = (event: string) =>
  act(async () => {
    window.dispatchEvent(new Event(event));
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockAuth.current = { enabled: true, user: { id: "u1" } };
  mockSub.current = { isPro: true, ready: true };
  sync.mockResolvedValue({ status: "synced", appliedCollections: [] });
  (getLastSyncedAt as jest.Mock).mockReturnValue("2026-11-01T00:00:00.000Z");
  changeListeners = new Set();
  (onLocalChange as jest.Mock).mockImplementation((cb: () => void) => {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
  });
  (CapApp.addListener as jest.Mock).mockImplementation((_event: string, cb: () => void) => {
    resume = cb;
    return Promise.resolve({ remove: jest.fn() });
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

describe("SyncProvider", () => {
  it("does nothing and reports off when the user is not Pro", async () => {
    mockSub.current = { isPro: false, ready: true };
    await render();
    await edit();
    await advance(6000);
    expect(sync).not.toHaveBeenCalled();
    expect(latest.active).toBe(false);
    expect(latest.status).toBe("off");
  });

  it("syncs once when Pro starts while signed in, and exposes the result", async () => {
    mockSub.current = { isPro: false, ready: true };
    await render();
    mockSub.current = { isPro: true, ready: true };
    await render();
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith("u1");
    expect(latest.status).toBe("synced");
    expect(latest.lastSyncedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("syncs 5 s after a local change, and three changes inside 5 s make one sync", async () => {
    await render();
    await flush();
    sync.mockClear();
    await edit();
    await advance(4000);
    expect(sync).not.toHaveBeenCalled();
    await edit();
    await advance(2000);
    await edit();
    await advance(4999);
    expect(sync).not.toHaveBeenCalled();
    await advance(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("syncs when the app resumes and when the network returns", async () => {
    await render();
    await flush();
    sync.mockClear();
    await act(async () => resume());
    expect(sync).toHaveBeenCalledTimes(1);
    await flush();
    await fire("online");
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("stops when Pro lapses without resetting the state, and merges again on resubscribe", async () => {
    await render();
    await flush();
    mockSub.current = { isPro: false, ready: true };
    await render();
    sync.mockClear();
    await edit();
    await advance(6000);
    await fire("online");
    expect(sync).not.toHaveBeenCalled();
    expect(latest.status).toBe("off");
    expect(resetSyncState).not.toHaveBeenCalled();

    mockSub.current = { isPro: true, ready: true };
    await render();
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(resetSyncState).not.toHaveBeenCalled();
  });

  it("reports offline and error results", async () => {
    sync.mockResolvedValue({ status: "offline" });
    await render();
    await flush();
    expect(latest.status).toBe("offline");
    sync.mockResolvedValue({ status: "error", message: "boom" });
    await act(async () => latest.syncNow());
    await flush();
    expect(latest.status).toBe("error");
  });

  it("syncs the new account after the run in flight for the old one settles", async () => {
    let finishFirst: (r: unknown) => void = () => {};
    sync.mockImplementationOnce(() => new Promise((res) => (finishFirst = res)));
    await render();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenLastCalledWith("u1");

    mockAuth.current = { enabled: true, user: { id: "u2" } };
    await render();
    // The engine would hand the second call the first run, so it is not made yet.
    expect(sync).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe("syncing");

    await act(async () => finishFirst({ status: "synced", appliedCollections: [] }));
    await flush();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenLastCalledWith("u2");
    expect(latest.status).toBe("synced");
  });

  it("runs once more after the run in flight when a local change lands during it", async () => {
    let finishFirst: (r: unknown) => void = () => {};
    sync.mockImplementationOnce(() => new Promise((res) => (finishFirst = res)));
    await render();
    await edit();
    await advance(5000);
    expect(sync).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst({ status: "synced", appliedCollections: [] }));
    await flush();
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
