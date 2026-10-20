import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import Subscribe from "../Subscribe";
import { useSubscription } from "../../../core/context/SubscriptionContext";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass, useIonToast: () => [mockPresentToast] };
});
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const annual = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: { priceString: "EGP 600.00", price: 600, title: "Rafeeq Pro (yearly)" },
};
const monthly = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: { priceString: "EGP 80.00", price: 80, title: "Rafeeq Pro (monthly)" },
};

const purchase = jest.fn();
const restore = jest.fn();
let path = "";
let host: HTMLDivElement;
let root: Root;

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

function mount(packages: unknown[]) {
  (useSubscription as jest.Mock).mockReturnValue({ packages, purchase, restore, isPro: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/viewer", "/subscribe"]} initialIndex={1}>
        <Route exact path="/subscribe" component={Subscribe} />
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
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("lists packages with store price strings and preselects yearly", () => {
  mount([monthly, annual]);
  expect(host.textContent).toContain("EGP 600.00");
  expect(host.textContent).toContain("EGP 80.00");
  const selected = host.querySelector('[aria-checked="true"]');
  expect(selected?.textContent).toContain("سنوي");
});

it("shows the save tag only when yearly is cheaper per month", () => {
  mount([monthly, annual]);
  expect(host.querySelectorAll(".subscribe-save")).toHaveLength(1);
  act(() => root.unmount());
  host.remove();
  mount([monthly, { ...annual, product: { ...annual.product, price: 1200 } }]);
  expect(host.querySelectorAll(".subscribe-save")).toHaveLength(0);
});

it("closes after a successful purchase of the selected plan", async () => {
  purchase.mockResolvedValue("purchased");
  mount([monthly, annual]);
  await act(async () => button("اشترك الآن")!.click());
  await flush();
  expect(purchase).toHaveBeenCalledWith(annual);
  expect(path).toBe("/viewer");
});

it("stays open with no toast when the purchase is cancelled", async () => {
  purchase.mockResolvedValue("cancelled");
  mount([monthly, annual]);
  await act(async () => button("اشترك الآن")!.click());
  await flush();
  expect(path).toBe("/subscribe");
  expect(mockPresentToast).not.toHaveBeenCalled();
});

it("toasts on a failed purchase", async () => {
  purchase.mockRejectedValue(new Error("store unavailable"));
  mount([monthly, annual]);
  await act(async () => button("اشترك الآن")!.click());
  await flush();
  expect(path).toBe("/subscribe");
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "تعذّر إتمام الاشتراك، حاول مرة أخرى" }),
  );
});

it("buys the monthly plan when it is chosen", async () => {
  purchase.mockResolvedValue("purchased");
  mount([monthly, annual]);
  const monthlyOption = Array.from(host.querySelectorAll('[role="radio"]')).find((el) =>
    el.textContent?.includes("شهري"),
  ) as HTMLElement;
  act(() => monthlyOption.click());
  await act(async () => button("اشترك الآن")!.click());
  await flush();
  expect(purchase).toHaveBeenCalledWith(monthly);
});

it("closes after a restore that finds Pro, and toasts when it finds nothing", async () => {
  restore.mockResolvedValue(false);
  mount([monthly, annual]);
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: "لم يُعثر على اشتراك سابق" }),
  );
  expect(path).toBe("/subscribe");

  restore.mockResolvedValue(true);
  await act(async () => button("استعادة المشتريات")!.click());
  await flush();
  expect(path).toBe("/viewer");
});

it("disables Subscribe when there are no packages", () => {
  mount([]);
  expect(button("اشترك الآن")!.disabled).toBe(true);
  expect(host.textContent).toContain("خطط الاشتراك غير متاحة الآن");
});
