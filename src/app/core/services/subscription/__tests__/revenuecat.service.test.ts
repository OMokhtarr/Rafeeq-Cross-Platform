export {};

jest.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: jest.fn(), DEBUG: false } }));
jest.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: { configure: jest.fn(), logIn: jest.fn(), logOut: jest.fn(), isAnonymous: jest.fn(), getCustomerInfo: jest.fn() } }));
jest.mock("@revenuecat/purchases-capacitor-ui", () => ({
  RevenueCatUI: { presentPaywall: jest.fn() },
  PAYWALL_RESULT: {
    NOT_PRESENTED: "NOT_PRESENTED",
    ERROR: "ERROR",
    CANCELLED: "CANCELLED",
    PURCHASED: "PURCHASED",
    RESTORED: "RESTORED",
  },
}));

const realAndroidKey = process.env.REACT_APP_REVENUECAT_ANDROID_KEY;

afterEach(() => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = realAndroidKey;
});

// configureRevenueCat memoises its first call, so each case loads a fresh copy.
function load({ debug = false } = {}) {
  let mod!: typeof import("../revenuecat.service");
  let sdk!: { Purchases: Record<"configure" | "logIn" | "logOut" | "isAnonymous" | "getCustomerInfo", jest.Mock> };
  let ui!: { RevenueCatUI: { presentPaywall: jest.Mock } };
  let core!: { Capacitor: { getPlatform: jest.Mock; DEBUG: boolean } };
  jest.isolateModules(() => {
    mod = require("../revenuecat.service");
    sdk = require("@revenuecat/purchases-capacitor");
    ui = require("@revenuecat/purchases-capacitor-ui");
    core = require("@capacitor/core");
  });
  core.Capacitor.getPlatform.mockReturnValue("android");
  core.Capacitor.DEBUG = debug;
  sdk.Purchases.configure.mockResolvedValue(undefined);
  return { mod, sdk, configure: sdk.Purchases.configure, presentPaywall: ui.RevenueCatUI.presentPaywall };
}

it("sends nothing to RevenueCat when the build has no key", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "";
  const { mod, configure } = load();
  await expect(mod.configureRevenueCat()).rejects.toThrow("RevenueCat is not configured");
  expect(configure).not.toHaveBeenCalled();
});

it("configures once with the platform key", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_public_key";
  const { mod, configure } = load();
  await mod.configureRevenueCat();
  await mod.configureRevenueCat();
  expect(configure).toHaveBeenCalledTimes(1);
  expect(configure).toHaveBeenCalledWith({ apiKey: "goog_public_key" });
});

it("refuses a Test Store key in a release build instead of letting the SDK crash it", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "test_store_key";
  const { mod, configure } = load({ debug: false });
  await expect(mod.configureRevenueCat()).rejects.toThrow("Test Store key only works in debug builds");
  expect(configure).not.toHaveBeenCalled();
});

it("uses a Test Store key in a debug build", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "test_store_key";
  const { mod, configure } = load({ debug: true });
  await mod.configureRevenueCat();
  expect(configure).toHaveBeenCalledWith({ apiKey: "test_store_key" });
});

it("reads Pro from the com_rafeeq_quranquiz_pro entitlement only", () => {
  const { mod } = load();
  const withEntitlements = (active: object) => ({ entitlements: { active } }) as never;
  expect(mod.isProFromCustomerInfo(withEntitlements({ com_rafeeq_quranquiz_pro: {} }))).toBe(true);
  expect(mod.isProFromCustomerInfo(withEntitlements({ pro: {} }))).toBe(false);
});

it.each([
  ["PURCHASED", "purchased"],
  ["RESTORED", "restored"],
  ["ERROR", "error"],
  ["CANCELLED", "cancelled"],
  ["NOT_PRESENTED", "cancelled"],
])("maps paywall result %s to %s", async (native, expected) => {
  const { mod, presentPaywall } = load();
  presentPaywall.mockResolvedValue({ result: native });
  await expect(mod.presentPaywall()).resolves.toBe(expected);
});

it("configures with the account id when one is given", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_public_key";
  const { mod, configure } = load();
  await mod.configureRevenueCat("u1");
  await mod.configureRevenueCat("u2");
  expect(configure).toHaveBeenCalledTimes(1);
  expect(configure).toHaveBeenCalledWith({ apiKey: "goog_public_key", appUserID: "u1" });
});

it("logs in and returns the customer info", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_public_key";
  const { mod, sdk } = load();
  sdk.Purchases.logIn.mockResolvedValue({ customerInfo: { id: "ci" }, created: false });
  await expect(mod.logInRevenueCat("u1")).resolves.toEqual({ id: "ci" });
  expect(sdk.Purchases.logIn).toHaveBeenCalledWith({ appUserID: "u1" });
});

it("logs out an identified user", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_public_key";
  const { mod, sdk } = load();
  sdk.Purchases.isAnonymous.mockResolvedValue({ isAnonymous: false });
  sdk.Purchases.logOut.mockResolvedValue({ customerInfo: { id: "out" } });
  await expect(mod.logOutRevenueCat()).resolves.toEqual({ id: "out" });
});

it("skips logOut for an anonymous user, which would throw", async () => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = "goog_public_key";
  const { mod, sdk } = load();
  sdk.Purchases.isAnonymous.mockResolvedValue({ isAnonymous: true });
  sdk.Purchases.getCustomerInfo.mockResolvedValue({ customerInfo: { id: "current" } });
  await expect(mod.logOutRevenueCat()).resolves.toEqual({ id: "current" });
  expect(sdk.Purchases.logOut).not.toHaveBeenCalled();
});
