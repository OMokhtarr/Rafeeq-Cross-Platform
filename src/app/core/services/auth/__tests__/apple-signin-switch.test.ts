import { Capacitor } from "@capacitor/core";
import { isAppleSignInOn } from "../apple-signin-switch";
import { isProGateOn } from "../../subscription/pro-gate";
import { isAuthConfigured } from "../supabase.client";

jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: jest.fn() },
}));
jest.mock("../supabase.client", () => ({ isAuthConfigured: jest.fn() }));

const platform = Capacitor.getPlatform as jest.Mock;
const configured = isAuthConfigured as jest.Mock;
const KEYS = ["REACT_APP_APPLE_SIGNIN", "REACT_APP_PRO_GATE"];

beforeEach(() => {
  KEYS.forEach((k) => delete process.env[k]);
  platform.mockReturnValue("android");
  configured.mockReturnValue(true);
});

afterAll(() => {
  KEYS.forEach((k) => delete process.env[k]);
});

describe("isProGateOn", () => {
  it("is off when unset", () => {
    expect(isProGateOn()).toBe(false);
  });

  it("is on when PRO_GATE is on and Supabase is configured", () => {
    process.env.REACT_APP_PRO_GATE = "on";
    expect(isProGateOn()).toBe(true);
  });

  it("is off when PRO_GATE is on but Supabase isn't configured", () => {
    process.env.REACT_APP_PRO_GATE = "on";
    configured.mockReturnValue(false);
    expect(isProGateOn()).toBe(false);
  });
});

describe("isAppleSignInOn", () => {
  it("is always on for iOS", () => {
    platform.mockReturnValue("ios");
    expect(isAppleSignInOn()).toBe(true);
  });

  it("is off on Android without the opt-in", () => {
    expect(isAppleSignInOn()).toBe(false);
  });

  it("is on for Android with the opt-in", () => {
    process.env.REACT_APP_APPLE_SIGNIN = "on";
    expect(isAppleSignInOn()).toBe(true);
  });
});
