import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { SubscriptionProvider, useSubscription } from "../SubscriptionContext";
import { brokerHeaders, setBrokerUserId } from "../../services/audio/stt/broker";

jest.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: jest.fn() } }));
jest.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getOfferings: jest.fn(),
    getAppUserID: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A build with a RevenueCat key; without one the SDK is never started.
process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_test_key";

const platform = Capacitor.getPlatform as jest.Mock;
const rc = Purchases as unknown as Record<string, jest.Mock>;

const info = (pro: boolean) => ({
  customerInfo: {
    entitlements: { active: pro ? { pro: { identifier: "pro" } } : {} },
    managementURL: pro ? "https://play.google.com/store/account/subscriptions" : null,
  },
});

type Sub = ReturnType<typeof useSubscription>;
let sub: Sub;
const Probe = () => {
  sub = useSubscription();
  return null;
};

let root: Root;
let listener: ((ci: unknown) => void) | null;

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

async function mount() {
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  setBrokerUserId(null);
  listener = null;
  platform.mockReturnValue("android");
  rc.configure.mockResolvedValue(undefined);
  rc.getCustomerInfo.mockResolvedValue(info(false));
  rc.addCustomerInfoUpdateListener.mockImplementation(async (cb: (ci: unknown) => void) => {
    listener = cb;
    return "cb-1";
  });
  rc.removeCustomerInfoUpdateListener.mockResolvedValue({ wasRemoved: true });
  rc.getOfferings.mockResolvedValue({ current: { availablePackages: [] } });
  rc.getAppUserID.mockResolvedValue({ appUserID: "$RCAnonymousID:abc" });
});

afterEach(() => {
  act(() => root.unmount());
});

it("is Pro on web without configuring RevenueCat", async () => {
  platform.mockReturnValue("web");
  await mount();
  expect(sub.isPro).toBe(true);
  expect(rc.configure).not.toHaveBeenCalled();
});

it("starts from the cached Pro flag on native", async () => {
  localStorage.setItem("rafiq_pro_v1", "1");
  rc.getCustomerInfo.mockReturnValue(new Promise(() => {}));
  await mount();
  expect(sub.isPro).toBe(true);
  expect(sub.ready).toBe(false);
});

it("replaces the cache with the live answer and writes it", async () => {
  localStorage.setItem("rafiq_pro_v1", "1");
  await mount();
  expect(sub.isPro).toBe(false);
  expect(sub.ready).toBe(true);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("0");
});

it("applies listener updates live", async () => {
  await mount();
  expect(sub.isPro).toBe(false);
  await act(async () => listener?.(info(true).customerInfo));
  expect(sub.isPro).toBe(true);
  expect(sub.managementUrl).toBe("https://play.google.com/store/account/subscriptions");
});

it("exposes the app-user id and hands it to the broker", async () => {
  await mount();
  expect(sub.appUserId).toBe("$RCAnonymousID:abc");
  expect(brokerHeaders()).toEqual({ "x-rafeeq-user": "$RCAnonymousID:abc" });
});

it("markNotPro flips isPro for the session without touching the cache", async () => {
  rc.getCustomerInfo.mockResolvedValue(info(true));
  await mount();
  expect(sub.isPro).toBe(true);
  act(() => sub.markNotPro());
  expect(sub.isPro).toBe(false);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");
});

it("sets Pro straight from a purchase result and reports a cancel", async () => {
  await mount();
  rc.purchasePackage.mockResolvedValue({ customerInfo: info(true).customerInfo });
  let outcome: string | undefined;
  await act(async () => {
    outcome = await sub.purchase({ identifier: "$rc_annual" } as never);
  });
  expect(outcome).toBe("purchased");
  expect(sub.isPro).toBe(true);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");

  rc.purchasePackage.mockRejectedValue({ userCancelled: true, code: "1" });
  await act(async () => {
    outcome = await sub.purchase({ identifier: "$rc_annual" } as never);
  });
  expect(outcome).toBe("cancelled");
});

it("restore returns the new Pro state", async () => {
  await mount();
  rc.restorePurchases.mockResolvedValue({ customerInfo: info(false).customerInfo });
  let found: boolean | undefined;
  await act(async () => {
    found = await sub.restore();
  });
  expect(found).toBe(false);
  rc.restorePurchases.mockResolvedValue({ customerInfo: info(true).customerInfo });
  await act(async () => {
    found = await sub.restore();
  });
  expect(found).toBe(true);
  expect(sub.isPro).toBe(true);
});

it("opens and closes the note", async () => {
  await mount();
  expect(sub.noteOpen).toBe(false);
  act(() => sub.openNote());
  expect(sub.noteOpen).toBe(true);
  act(() => sub.closeNote());
  expect(sub.noteOpen).toBe(false);
});

it("loads the plans again on demand after an offline start", async () => {
  rc.getOfferings.mockRejectedValue(new Error("offline"));
  await mount();
  expect(sub.packages).toEqual([]);
  rc.getOfferings.mockResolvedValue({ current: { availablePackages: [{ identifier: "$rc_annual" }] } });
  await act(async () => {
    await sub.refreshPackages();
  });
  expect(sub.packages).toEqual([{ identifier: "$rc_annual" }]);
});

it("keeps the cached Pro flag when the live check fails offline", async () => {
  localStorage.setItem("rafiq_pro_v1", "1");
  rc.getCustomerInfo.mockRejectedValue(new Error("offline"));
  await mount();
  expect(sub.isPro).toBe(true);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");
});
