import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { useReciteMicError } from "../useReciteMicError";
import { useProGate } from "../useProGate";
import { NOT_SUBSCRIBED_MESSAGE } from "../../../core/services/audio/stt/broker";

jest.mock("../useProGate", () => ({ useProGate: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handleNotSubscribed = jest.fn();
const onError = jest.fn();

const Probe = ({ micError }: { micError: string | null }) => {
  useReciteMicError(micError, onError);
  return null;
};

let root: Root;
const render = (micError: string | null) => act(() => root.render(<Probe micError={micError} />));

beforeEach(() => {
  handleNotSubscribed.mockImplementation((m: string | null) => m === NOT_SUBSCRIBED_MESSAGE);
  (useProGate as jest.Mock).mockReturnValue({ handleNotSubscribed });
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

it("opens the subscriber note and shows no error for a not-subscribed refusal", () => {
  render(NOT_SUBSCRIBED_MESSAGE);
  expect(handleNotSubscribed).toHaveBeenCalledWith(NOT_SUBSCRIBED_MESSAGE);
  expect(onError).not.toHaveBeenCalled();
});

it("passes any other error to the page's own handler", () => {
  render("Microphone access denied");
  expect(onError).toHaveBeenCalledWith("Microphone access denied");
});

it("does nothing without an error", () => {
  render(null);
  expect(handleNotSubscribed).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
