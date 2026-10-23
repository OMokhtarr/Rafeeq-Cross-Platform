import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { usePaywall } from "../usePaywall";
import { useSubscription } from "../../../core/context/SubscriptionContext";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showPaywall = jest.fn();
let openPaywall: () => Promise<void>;
const Probe = () => {
  openPaywall = usePaywall();
  return null;
};

let root: Root;
beforeEach(() => {
  localStorage.clear();
  (useSubscription as jest.Mock).mockReturnValue({ showPaywall });
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
});
afterEach(() => act(() => root.unmount()));

it.each([
  ["unavailable", "خطط الاشتراك غير متاحة الآن"],
  ["failed", "تعذّر إتمام الاشتراك، حاول مرة أخرى"],
])("toasts when the paywall is %s", async (outcome, message) => {
  showPaywall.mockResolvedValue(outcome);
  await act(() => openPaywall());
  expect(mockPresentToast).toHaveBeenCalledWith(expect.objectContaining({ message }));
});

it.each(["subscribed", "dismissed"])("stays quiet when the paywall is %s", async (outcome) => {
  showPaywall.mockResolvedValue(outcome);
  await act(() => openPaywall());
  expect(mockPresentToast).not.toHaveBeenCalled();
});
