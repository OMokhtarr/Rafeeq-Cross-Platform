import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { useProGate } from "../useProGate";
import { useSubscription } from "../../../core/context/SubscriptionContext";
import { isProGateOn } from "../../../core/services/subscription/pro-gate";
import { NOT_SUBSCRIBED_MESSAGE } from "../../../core/services/audio/stt/broker";

jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));
jest.mock("../../../core/services/subscription/pro-gate", () => ({ isProGateOn: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openNote = jest.fn();
const markNotPro = jest.fn();

function setup(gateOn: boolean, isPro: boolean) {
  (isProGateOn as jest.Mock).mockReturnValue(gateOn);
  (useSubscription as jest.Mock).mockReturnValue({ isPro, openNote, markNotPro });
}

let gate: ReturnType<typeof useProGate>;
const Probe = () => {
  gate = useProGate();
  return null;
};
let root: Root;
const mount = () => {
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
};
afterEach(() => act(() => root.unmount()));

it("is not locked when the switch is off, even for non-Pro", () => {
  setup(false, false);
  mount();
  const start = jest.fn();
  expect(gate.locked).toBe(false);
  gate.requirePro(start);
  expect(start).toHaveBeenCalledTimes(1);
  expect(openNote).not.toHaveBeenCalled();
});

it("opens the note instead of starting when locked", () => {
  setup(true, false);
  mount();
  const start = jest.fn();
  expect(gate.locked).toBe(true);
  gate.requirePro(start);
  expect(start).not.toHaveBeenCalled();
  expect(openNote).toHaveBeenCalledTimes(1);
});

it("starts for Pro users with the switch on", () => {
  setup(true, true);
  mount();
  const start = jest.fn();
  expect(gate.locked).toBe(false);
  gate.requirePro(start);
  expect(start).toHaveBeenCalledTimes(1);
});

it("turns a not-subscribed error into the note, even with the switch off", () => {
  setup(false, true);
  mount();
  expect(gate.handleNotSubscribed(NOT_SUBSCRIBED_MESSAGE)).toBe(true);
  expect(markNotPro).toHaveBeenCalledTimes(1);
  expect(openNote).toHaveBeenCalledTimes(1);
});

it("ignores other errors", () => {
  setup(true, false);
  mount();
  expect(gate.handleNotSubscribed("Recording error")).toBe(false);
  expect(gate.handleNotSubscribed(null)).toBe(false);
  expect(openNote).not.toHaveBeenCalled();
  expect(markNotPro).not.toHaveBeenCalled();
});
