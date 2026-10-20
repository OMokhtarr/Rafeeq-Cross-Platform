export {};

jest.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: jest.fn() } }));
jest.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: { configure: jest.fn() } }));

const realAndroidKey = process.env.REACT_APP_REVENUECAT_ANDROID_KEY;

afterEach(() => {
  process.env.REACT_APP_REVENUECAT_ANDROID_KEY = realAndroidKey;
});

// configureRevenueCat memoises its first call, so each case loads a fresh copy.
function load() {
  let mod!: typeof import("../revenuecat.service");
  let sdk!: { Purchases: { configure: jest.Mock } };
  let core!: { Capacitor: { getPlatform: jest.Mock } };
  jest.isolateModules(() => {
    mod = require("../revenuecat.service");
    sdk = require("@revenuecat/purchases-capacitor");
    core = require("@capacitor/core");
  });
  core.Capacitor.getPlatform.mockReturnValue("android");
  sdk.Purchases.configure.mockResolvedValue(undefined);
  return { mod, configure: sdk.Purchases.configure };
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
