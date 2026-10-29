import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { RevenueCatUI } from "@revenuecat/purchases-capacitor-ui";
import { SubscriptionProvider, useSubscription } from "../SubscriptionContext";
import { LanguageProvider, useLang } from "../LanguageContext";

// isNativePlatform/registerPlugin serve LanguageContext's widget sync, which
// stays a no-op here.
jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: jest.fn(), isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));
jest.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getAppUserID: jest.fn(),
    restorePurchases: jest.fn(),
    overridePreferredUILocale: jest.fn(),
  },
}));
jest.mock("@revenuecat/purchases-capacitor-ui", () => ({
  RevenueCatUI: { presentPaywall: jest.fn(), presentCustomerCenter: jest.fn() },
  PAYWALL_RESULT: {
    NOT_PRESENTED: "NOT_PRESENTED",
    ERROR: "ERROR",
    CANCELLED: "CANCELLED",
    PURCHASED: "PURCHASED",
    RESTORED: "RESTORED",
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A build with a RevenueCat key; without one the SDK is never started.
process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_test_key";

const platform = Capacitor.getPlatform as jest.Mock;
const rc = Purchases as unknown as Record<string, jest.Mock>;
const ui = RevenueCatUI as unknown as Record<string, jest.Mock>;

const info = (pro: boolean) => ({
  customerInfo: {
    entitlements: {
      active: pro ? { com_rafeeq_quranquiz_pro: { identifier: "com_rafeeq_quranquiz_pro" } } : {},
    },
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
  listener = null;
  platform.mockReturnValue("android");
  rc.configure.mockResolvedValue(undefined);
  rc.getCustomerInfo.mockResolvedValue(info(false));
  rc.addCustomerInfoUpdateListener.mockImplementation(async (cb: (ci: unknown) => void) => {
    listener = cb;
    return "cb-1";
  });
  rc.removeCustomerInfoUpdateListener.mockResolvedValue({ wasRemoved: true });
  rc.overridePreferredUILocale.mockResolvedValue(undefined);
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
});

it("exposes the app-user id", async () => {
  await mount();
  expect(sub.appUserId).toBe("$RCAnonymousID:abc");
});

it("markNotPro flips isPro for the session without touching the cache", async () => {
  rc.getCustomerInfo.mockResolvedValue(info(true));
  await mount();
  expect(sub.isPro).toBe(true);
  act(() => sub.markNotPro());
  expect(sub.isPro).toBe(false);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");
});

it("reports a paywall purchase as subscribed and caches it", async () => {
  await mount();
  ui.presentPaywall.mockResolvedValue({ result: "PURCHASED" });
  rc.getCustomerInfo.mockResolvedValue(info(true));
  let outcome: string | undefined;
  await act(async () => {
    outcome = await sub.showPaywall();
  });
  expect(outcome).toBe("subscribed");
  expect(sub.isPro).toBe(true);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");
});

it("reports a restore that found no subscription as dismissed", async () => {
  await mount();
  ui.presentPaywall.mockResolvedValue({ result: "RESTORED" });
  let outcome: string | undefined;
  await act(async () => {
    outcome = await sub.showPaywall();
  });
  expect(outcome).toBe("dismissed");
  expect(sub.isPro).toBe(false);
});

it.each([
  ["CANCELLED", "dismissed"],
  ["ERROR", "failed"],
])("reports a %s paywall as %s", async (native, expected) => {
  await mount();
  ui.presentPaywall.mockResolvedValue({ result: native });
  let outcome: string | undefined;
  await act(async () => {
    outcome = await sub.showPaywall();
  });
  expect(outcome).toBe(expected);
});

it("reports the paywall unavailable when it can't be shown", async () => {
  await mount();
  ui.presentPaywall.mockRejectedValue(new Error("no offering"));
  let outcome: string | undefined;
  await act(async () => {
    outcome = await sub.showPaywall();
  });
  expect(outcome).toBe("unavailable");
});

it("refreshes the Pro state after the Customer Center closes", async () => {
  rc.getCustomerInfo.mockResolvedValue(info(true));
  await mount();
  ui.presentCustomerCenter.mockResolvedValue(undefined);
  rc.getCustomerInfo.mockResolvedValue(info(false));
  await act(async () => {
    await sub.showCustomerCenter();
  });
  await flush();
  expect(ui.presentCustomerCenter).toHaveBeenCalled();
  expect(sub.isPro).toBe(false);
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

it("keeps the cached Pro flag when the live check fails offline", async () => {
  localStorage.setItem("rafiq_pro_v1", "1");
  rc.getCustomerInfo.mockRejectedValue(new Error("offline"));
  await mount();
  expect(sub.isPro).toBe(true);
  expect(localStorage.getItem("rafiq_pro_v1")).toBe("1");
});

it("shows RevenueCat's screens in the app's language and follows a switch", async () => {
  let setLang!: (l: "ar" | "en") => void;
  const LangProbe = () => {
    setLang = useLang().setLang;
    return null;
  };
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      <LanguageProvider>
        <SubscriptionProvider>
          <LangProbe />
        </SubscriptionProvider>
      </LanguageProvider>,
    );
  });
  await flush();
  expect(rc.overridePreferredUILocale).toHaveBeenLastCalledWith({ locale: "ar" });
  await act(async () => setLang("en"));
  await flush();
  expect(rc.overridePreferredUILocale).toHaveBeenLastCalledWith({ locale: "en" });
});
