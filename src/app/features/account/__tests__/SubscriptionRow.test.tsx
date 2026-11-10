import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import SubscriptionRow from "../SubscriptionRow";
import { useSubscription } from "../../../core/context/SubscriptionContext";
import type { ProPlan } from "../../../core/services/subscription/revenuecat.service";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));
let mockUser: { id: string } | null = { id: "u1" };
jest.mock("@capacitor/core", () => ({
  registerPlugin: () => ({}),
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => false },
}));
jest.mock("../../../core/context/AuthContext", () => ({
  useAuth: () => ({ enabled: true, user: mockUser, requestSignIn: jest.fn() }),
}));
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

function mount(sub: { isPro: boolean; appUserId: string | null; proPlan?: ProPlan | null }) {
  (useSubscription as jest.Mock).mockReturnValue({ proPlan: null, ...sub, restore, showCustomerCenter });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<SubscriptionRow />));
}

const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

beforeEach(() => {
  mockUser = { id: "u1" };
  localStorage.clear();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ID = "$RCAnonymousID:0123456789abcdef";

it("is hidden while signed out, since Pro always lives on an account", () => {
  mockUser = null;
  mount({ isPro: false, appUserId: ID });
  expect(host.innerHTML).toBe("");
});

it("shows active + Manage for Pro and opens the Customer Center", async () => {
  showCustomerCenter.mockResolvedValue(undefined);
  mount({ isPro: true, appUserId: ID });
  expect(host.querySelector(".ac-pro--active")).not.toBeNull();
  expect(host.querySelector(".ac-plan-pill--pro")?.textContent).toBe("مفعّل");
  expect(button("عرض الخطط")).toBeUndefined();
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

it("offers See plans + Restore when signed in without Pro", async () => {
  restore.mockResolvedValue(false);
  mount({ isPro: false, appUserId: ID });
  expect(host.querySelector(".ac-pro--active")).toBeNull();
  expect(host.querySelector(".ac-plan-pill--pro")).toBeNull();
  expect(button("إدارة الاشتراك")).toBeUndefined();
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "لم يُعثر على اشتراك سابق" }),
  );
  act(() => button("عرض الخطط")!.click());
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

const plan = (over: Partial<ProPlan>): ProPlan => ({
  period: "yearly",
  trial: false,
  willRenew: true,
  endsAt: "2026-12-12T10:00:00Z",
  billingIssue: false,
  ...over,
});
const planLine = () => host.querySelector(".ac-pro-plan");

it("names the plan and its renewal date for a subscriber", () => {
  mount({ isPro: true, appUserId: ID, proPlan: plan({}) });
  expect(planLine()?.textContent).toMatch(/^الخطة السنوية، تتجدد في /);
  expect(planLine()?.classList.contains("ac-pro-plan--attention")).toBe(false);
});

it("flags a plan that won't renew", () => {
  mount({ isPro: true, appUserId: ID, proPlan: plan({ period: "monthly", willRenew: false }) });
  expect(planLine()?.textContent).toMatch(/^الخطة الشهرية، تنتهي في /);
  expect(planLine()?.classList.contains("ac-pro-plan--attention")).toBe(true);
});

it("shows a trial's first payment date", () => {
  mount({ isPro: true, appUserId: ID, proPlan: plan({ trial: true }) });
  expect(planLine()?.textContent).toMatch(/^فترة تجريبية مجانية، أول دفعة في /);
});

it("shows lifetime access for a grant that never expires", () => {
  mount({ isPro: true, appUserId: ID, proPlan: plan({ period: "lifetime", endsAt: null }) });
  expect(planLine()?.textContent).toBe("اشتراك دائم");
});

it("puts a billing problem ahead of the renewal date", () => {
  mount({ isPro: true, appUserId: ID, proPlan: plan({ billingIssue: true }) });
  expect(planLine()?.textContent).toContain("إدارة الاشتراك");
  expect(planLine()?.classList.contains("ac-pro-plan--attention")).toBe(true);
});

it("shows no plan line without plan details", () => {
  mount({ isPro: true, appUserId: ID });
  expect(planLine()).toBeNull();
});
