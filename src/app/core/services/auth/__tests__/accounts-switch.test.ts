import { Capacitor } from "@capacitor/core";
import { isAccountsOn, isAppleSignInOn } from "../accounts-switch";
import { isProGateOn } from "../../subscription/pro-gate";

jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: jest.fn() },
}));

const platform = Capacitor.getPlatform as jest.Mock;
const KEYS = ["REACT_APP_ACCOUNTS", "REACT_APP_APPLE_SIGNIN", "REACT_APP_PRO_GATE"];

beforeEach(() => {
  KEYS.forEach((k) => delete process.env[k]);
  platform.mockReturnValue("android");
});

afterAll(() => {
  KEYS.forEach((k) => delete process.env[k]);
});

describe("isAccountsOn", () => {
  it("is off when unset or 'off'", () => {
    expect(isAccountsOn()).toBe(false);
    process.env.REACT_APP_ACCOUNTS = "off";
    expect(isAccountsOn()).toBe(false);
  });

  it("is on for 'on'", () => {
    process.env.REACT_APP_ACCOUNTS = "on";
    expect(isAccountsOn()).toBe(true);
  });
});

describe("isProGateOn", () => {
  it("is off when PRO_GATE is on but accounts are not", () => {
    process.env.REACT_APP_PRO_GATE = "on";
    expect(isProGateOn()).toBe(false);
  });

  it("is on when both switches are on", () => {
    process.env.REACT_APP_PRO_GATE = "on";
    process.env.REACT_APP_ACCOUNTS = "on";
    expect(isProGateOn()).toBe(true);
  });
});

describe("isAppleSignInOn", () => {
  it("is on for iOS when accounts are on", () => {
    process.env.REACT_APP_ACCOUNTS = "on";
    platform.mockReturnValue("ios");
    expect(isAppleSignInOn()).toBe(true);
  });

  it("is off on Android without the opt-in", () => {
    process.env.REACT_APP_ACCOUNTS = "on";
    expect(isAppleSignInOn()).toBe(false);
  });

  it("is on for Android with the opt-in", () => {
    process.env.REACT_APP_ACCOUNTS = "on";
    process.env.REACT_APP_APPLE_SIGNIN = "on";
    expect(isAppleSignInOn()).toBe(true);
  });

  it("is always off when accounts are off", () => {
    process.env.REACT_APP_APPLE_SIGNIN = "on";
    platform.mockReturnValue("ios");
    expect(isAppleSignInOn()).toBe(false);
  });
});
