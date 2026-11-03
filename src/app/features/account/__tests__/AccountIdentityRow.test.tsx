import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import AccountIdentityRow from "../AccountIdentityRow";
import { useAuth } from "../../../core/context/AuthContext";
import { useSync } from "../../../core/context/SyncContext";

jest.mock("../../../core/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../../core/context/SyncContext", () => ({ useSync: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const syncNow = jest.fn();
const requestSignIn = jest.fn();
const signOut = jest.fn();
let host: HTMLDivElement;
let root: Root;

type AuthState = {
  enabled: boolean;
  user: { id: string; email: string | null; name: string | null; provider: "google" | "apple" } | null;
};

function mount(auth: AuthState, onDelete?: () => void) {
  (useAuth as jest.Mock).mockReturnValue({ ...auth, requestSignIn, signOut });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<AccountIdentityRow onDelete={onDelete} />));
}

function setSync(sync: { active?: boolean; status?: string; lastSyncedAt?: string | null }) {
  (useSync as jest.Mock).mockReturnValue({ active: false, status: "off", lastSyncedAt: null, syncNow, ...sync });
}

const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

const USER = { id: "u1", email: "sara@example.com", name: "Sara", provider: "google" as const };

beforeEach(() => {
  setSync({});
  requestSignIn.mockResolvedValue(true);
  signOut.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders nothing when accounts are disabled", () => {
  mount({ enabled: false, user: null });
  expect(host.innerHTML).toBe("");
});

it("offers Sign in when signed out, and it requests sign-in", async () => {
  mount({ enabled: true, user: null });
  expect(button("تسجيل الخروج")).toBeUndefined();
  await act(async () => button("تسجيل الدخول")!.click());
  expect(requestSignIn).toHaveBeenCalled();
});

it("shows the name, email and provider when signed in", () => {
  mount({ enabled: true, user: USER }, jest.fn());
  expect(host.textContent).toContain("Sara");
  expect(host.textContent).toContain("sara@example.com");
  expect(host.textContent).toContain("Google");
  expect(button("تسجيل الدخول")).toBeUndefined();
  expect(button("تسجيل الخروج")).toBeDefined();
  expect(button("حذف الحساب")).toBeDefined();
});

it("labels Apple accounts", () => {
  mount({ enabled: true, user: { ...USER, provider: "apple" } });
  expect(host.textContent).toContain("Apple");
});

it("labels the identity with the provider when there is no name or email", () => {
  mount({ enabled: true, user: { ...USER, name: null, email: null, provider: "apple" } });
  expect(host.querySelector(".ac-row--static .ac-row-label")!.textContent).toBe("Apple");
});

it("signs out", async () => {
  mount({ enabled: true, user: USER });
  await act(async () => button("تسجيل الخروج")!.click());
  expect(signOut).toHaveBeenCalled();
});

it("calls onDelete from the Delete account row, and hides it when no handler is given", () => {
  const onDelete = jest.fn();
  mount({ enabled: true, user: USER }, onDelete);
  act(() => button("حذف الحساب")!.click());
  expect(onDelete).toHaveBeenCalled();
  act(() => root.unmount());
  host.remove();
  mount({ enabled: true, user: USER });
  expect(button("حذف الحساب")).toBeUndefined();
});

it("never shows the email when signed out", () => {
  mount({ enabled: true, user: null });
  expect(host.textContent).not.toContain("@");
});

describe("sync status row", () => {
  const rows = () => Array.from(host.querySelectorAll("button")).map((b) => b.textContent);

  it("is absent when sync is not active", () => {
    setSync({ active: false, status: "synced", lastSyncedAt: new Date().toISOString() });
    mount({ enabled: true, user: USER });
    expect(host.textContent).not.toContain("تمت المزامنة");
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it.each([
    ["synced", "تمت المزامنة · الآن"],
    ["syncing", "جارٍ المزامنة…"],
    ["offline", "بانتظار الاتصال"],
    ["error", "تعذّرت المزامنة، اضغط للمحاولة مرة أخرى"],
  ])("shows the %s label", (status, label) => {
    setSync({ active: true, status, lastSyncedAt: new Date().toISOString() });
    mount({ enabled: true, user: USER });
    expect(rows()).toContain(label);
  });

  it("shows Syncing while active but not yet run, and a time once known", () => {
    setSync({ active: true, status: "off", lastSyncedAt: null });
    mount({ enabled: true, user: USER });
    expect(button("جارٍ المزامنة…")).toBeDefined();
    act(() => root.unmount());
    host.remove();
    setSync({ active: true, status: "off", lastSyncedAt: new Date(Date.now() - 3 * 3600000).toISOString() });
    mount({ enabled: true, user: USER });
    expect(host.textContent).toMatch(/تمت المزامنة · .*3|تمت المزامنة · .*٣/);
  });

  it("tapping it syncs now", () => {
    setSync({ active: true, status: "error", lastSyncedAt: null });
    mount({ enabled: true, user: USER });
    act(() => button("تعذّرت المزامنة")!.click());
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
