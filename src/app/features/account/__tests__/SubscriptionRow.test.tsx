import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import SubscriptionRow from "../SubscriptionRow";
import { useSubscription } from "../../../core/context/SubscriptionContext";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const restore = jest.fn();
const writeText = jest.fn();
const open = jest.fn();
let path = "";
let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

function mount(sub: { isPro: boolean; managementUrl: string | null; appUserId: string | null }) {
  (useSubscription as jest.Mock).mockReturnValue({ ...sub, restore });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/account"]}>
        <SubscriptionRow />
        <Route
          path="*"
          render={({ location }) => {
            path = location.pathname;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
}

const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

beforeEach(() => {
  localStorage.clear();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
  window.open = open as unknown as typeof window.open;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ID = "$RCAnonymousID:0123456789abcdef";

it("shows active + Manage for Pro and opens the management URL", () => {
  mount({ isPro: true, managementUrl: "https://play.google.com/store/account/subscriptions", appUserId: ID });
  expect(host.textContent).toContain("رفيق برو — مفعّل");
  expect(button("عرض الاشتراك")).toBeUndefined();
  act(() => button("إدارة الاشتراك")!.click());
  expect(open).toHaveBeenCalledWith("https://play.google.com/store/account/subscriptions", "_system");
});

it("hides Manage when the store gave no management URL", () => {
  mount({ isPro: true, managementUrl: null, appUserId: ID });
  expect(button("إدارة الاشتراك")).toBeUndefined();
});

it("shows Free + View subscription + Restore for non-Pro", async () => {
  restore.mockResolvedValue(false);
  mount({ isPro: false, managementUrl: null, appUserId: ID });
  expect(host.textContent).toContain("مجاني");
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "لم يُعثر على اشتراك سابق" }),
  );
  act(() => button("عرض الاشتراك")!.click());
  expect(path).toBe("/subscribe");
});

it("shows a shortened Support ID and copies the full app-user id", async () => {
  mount({ isPro: false, managementUrl: null, appUserId: ID });
  expect(host.textContent).toContain("89abcdef");
  expect(host.textContent).not.toContain(ID);
  await act(async () => button("معرّف الدعم")!.click());
  await flush();
  expect(writeText).toHaveBeenCalledWith(ID);
  expect(mockPresentToast).toHaveBeenCalledWith(expect.objectContaining({ message: "تم النسخ" }));
});

it("hides Support ID when there is no app-user id", () => {
  mount({ isPro: false, managementUrl: null, appUserId: null });
  expect(host.textContent).not.toContain("معرّف الدعم");
});
