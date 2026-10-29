import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import DeleteAccountSheet from "../DeleteAccountSheet";
import { useAuth } from "../../../core/context/AuthContext";
import { useSubscription } from "../../../core/context/SubscriptionContext";
import { closeTopOverlay } from "../../../core/utils/overlay-registry";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const deleteAccount = jest.fn();
const showCustomerCenter = jest.fn();
const onClose = jest.fn();
let historyRef: { push: (p: string) => void } | null = null;
let host: HTMLDivElement;
let root: Root;

function mount(open: boolean, isPro = false) {
  (useAuth as jest.Mock).mockReturnValue({ deleteAccount });
  (useSubscription as jest.Mock).mockReturnValue({ isPro, showCustomerCenter });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/account"]}>
        <DeleteAccountSheet open={open} onClose={onClose} />
        <Route
          path="*"
          render={({ history }) => {
            historyRef = history;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
}

// The sheet portals to <body>, so look there rather than in `host`.
const sheet = () => document.body.querySelector(".delacct-sheet");
const buttons = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>(".delacct-sheet button"));
const button = (text: string) => buttons().find((b) => b.textContent === text);
const DELETE = "حذف الحساب";
const MANAGE = "إدارة الاشتراك";

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders nothing while closed and does not take Back", () => {
  mount(false);
  expect(sheet()).toBeNull();
  expect(closeTopOverlay()).toBe(false);
});

it("lists what gets deleted: the account, synced data and the subscription record", () => {
  mount(true);
  const items = Array.from(sheet()!.querySelectorAll("li"), (li) => li.textContent);
  expect(items).toEqual(["حسابك في رفيق", "بياناتك المتزامنة", "سجل اشتراكك"]);
});

it("says deleting does not cancel the store subscription", () => {
  mount(true);
  expect(sheet()!.textContent).toContain("حذف الحساب لا يُلغي اشتراكك في Google Play أو App Store");
});

it("offers Manage subscription before Delete only when Pro", async () => {
  showCustomerCenter.mockResolvedValue(undefined);
  mount(true, false);
  expect(button(MANAGE)).toBeUndefined();
  act(() => root.unmount());
  host.remove();

  mount(true, true);
  const labels = buttons().map((b) => b.textContent);
  expect(labels.indexOf(MANAGE)).toBeGreaterThan(-1);
  expect(labels.indexOf(MANAGE)).toBeLessThan(labels.indexOf(DELETE));
  await act(async () => button(MANAGE)!.click());
  expect(showCustomerCenter).toHaveBeenCalled();
  expect(deleteAccount).not.toHaveBeenCalled();
});

it("deletes on confirm, then closes and confirms with a toast", async () => {
  deleteAccount.mockResolvedValue(undefined);
  mount(true);
  await act(async () => button(DELETE)!.click());
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalled();
  expect(mockPresentToast).toHaveBeenCalledWith(expect.objectContaining({ message: "تم حذف الحساب" }));
});

it("on failure shows an error, stays open and lets Delete be tapped again", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  deleteAccount.mockRejectedValueOnce(new Error("502")).mockResolvedValueOnce(undefined);
  mount(true);
  await act(async () => button(DELETE)!.click());
  expect(sheet()!.querySelector("[role='alert']")!.textContent).toContain("تعذّر حذف حسابك");
  expect(onClose).not.toHaveBeenCalled();
  expect(mockPresentToast).not.toHaveBeenCalled();
  expect(button(DELETE)!.disabled).toBe(false);

  await act(async () => button(DELETE)!.click());
  expect(deleteAccount).toHaveBeenCalledTimes(2);
  expect(onClose).toHaveBeenCalled();
  spy.mockRestore();
});

it("disables Delete while a deletion is in flight", async () => {
  let finish!: () => void;
  deleteAccount.mockReturnValue(new Promise<void>((r) => (finish = r)));
  mount(true);
  await act(async () => button(DELETE)!.click());
  const busy = buttons().find((b) => b.classList.contains("delacct-delete"))!;
  expect(busy.disabled).toBe(true);
  await act(async () => busy.click());
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

it("closes from the backdrop, the close button, Keep account, Back and a route change", () => {
  mount(true);
  act(() => (document.body.querySelector(".delacct-backdrop") as HTMLElement).click());
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => (document.body.querySelector(".delacct-close") as HTMLElement).click());
  expect(onClose).toHaveBeenCalledTimes(2);
  act(() => button("الإبقاء على الحساب")!.click());
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(closeTopOverlay()).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(4);
  act(() => historyRef!.push("/quiz-list"));
  expect(onClose).toHaveBeenCalledTimes(5);
});
