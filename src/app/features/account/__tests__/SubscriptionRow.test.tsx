import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import SubscriptionRow from "../SubscriptionRow";
import { useSubscription } from "../../../core/context/SubscriptionContext";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));
const mockOpenPaywall = jest.fn();
jest.mock("../../subscription/usePaywall", () => ({ usePaywall: () => mockOpenPaywall }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const restore = jest.fn();
const showCustomerCenter = jest.fn();
const writeText = jest.fn();
let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

function mount(sub: { isPro: boolean; appUserId: string | null }) {
  (useSubscription as jest.Mock).mockReturnValue({ ...sub, restore, showCustomerCenter });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<SubscriptionRow />));
}

const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

beforeEach(() => {
  localStorage.clear();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ID = "$RCAnonymousID:0123456789abcdef";

it("shows active + Manage for Pro and opens the Customer Center", async () => {
  showCustomerCenter.mockResolvedValue(undefined);
  mount({ isPro: true, appUserId: ID });
  expect(host.textContent).toContain("رفيق برو — مفعّل");
  expect(button("عرض الاشتراك")).toBeUndefined();
  expect(button("استعادة المشتريات")).toBeUndefined();
  await act(async () => button("إدارة الاشتراك")!.click());
  expect(showCustomerCenter).toHaveBeenCalled();
  expect(mockPresentToast).not.toHaveBeenCalled();
});

it("says so when the Customer Center can't open", async () => {
  showCustomerCenter.mockRejectedValue(new Error("offline"));
  mount({ isPro: true, appUserId: ID });
  await act(async () => button("إدارة الاشتراك")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "تعذّر فتح إدارة الاشتراك، تحقّق من الاتصال" }),
  );
});

it("shows Free + View subscription + Restore for non-Pro", async () => {
  restore.mockResolvedValue(false);
  mount({ isPro: false, appUserId: ID });
  expect(host.textContent).toContain("مجاني");
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "لم يُعثر على اشتراك سابق" }),
  );
  act(() => button("عرض الاشتراك")!.click());
  expect(mockOpenPaywall).toHaveBeenCalled();
});

it("says the store couldn't be reached when Restore fails, not that nothing was found", async () => {
  restore.mockRejectedValue(new Error("network"));
  mount({ isPro: false, appUserId: ID });
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "تعذّر الاتصال بالمتجر، تحقّق من الاتصال وحاول مرة أخرى" }),
  );
});

it("shows a shortened Support ID and copies the full app-user id", async () => {
  mount({ isPro: false, appUserId: ID });
  expect(host.textContent).toContain("89abcdef");
  expect(host.textContent).not.toContain(ID);
  await act(async () => button("معرّف الدعم")!.click());
  await flush();
  expect(writeText).toHaveBeenCalledWith(ID);
  expect(mockPresentToast).toHaveBeenCalledWith(expect.objectContaining({ message: "تم النسخ" }));
});

it("hides Support ID when there is no app-user id", () => {
  mount({ isPro: false, appUserId: null });
  expect(host.textContent).not.toContain("معرّف الدعم");
});
