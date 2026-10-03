import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { Switch } from "../Switch";
import { Segmented } from "../Segmented";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe("Switch", () => {
  it("is a labelled switch that reports its state", () => {
    act(() => root.render(<Switch checked label="Vibrate" onChange={() => {}} />));
    const input = document.querySelector("input")!;
    expect(input.getAttribute("role")).toBe("switch");
    expect(input.getAttribute("aria-label")).toBe("Vibrate");
    expect(input.checked).toBe(true);
  });

  it("asks for the opposite state when tapped", () => {
    const onChange = jest.fn();
    act(() => root.render(<Switch checked={false} label="Vibrate" onChange={onChange} />));
    act(() => document.querySelector("input")!.click());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing when disabled", () => {
    const onChange = jest.fn();
    act(() => root.render(<Switch checked={false} label="Vibrate" disabled onChange={onChange} />));
    act(() => document.querySelector("input")!.click());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Segmented", () => {
  const options = [
    { value: 5, label: "5 min" },
    { value: 10, label: "10 min" },
    { value: 15, label: "15 min" },
  ];

  it("marks only the chosen option as pressed", () => {
    act(() => root.render(<Segmented label="Snooze" options={options} value={10} onChange={() => {}} />));
    const pressed = Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "true", "false"]);
    expect(document.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Snooze");
  });

  it("reports the tapped option's value", () => {
    const onChange = jest.fn();
    act(() => root.render(<Segmented label="Snooze" options={options} value={10} onChange={onChange} />));
    act(() => (Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "15 min") as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("can show no option as chosen", () => {
    act(() => root.render(<Segmented label="Direction" options={options} value={null} onChange={() => {}} />));
    expect(document.querySelectorAll('[aria-pressed="true"]').length).toBe(0);
  });
});
