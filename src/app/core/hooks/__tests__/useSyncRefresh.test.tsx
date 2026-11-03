import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useStreakRefresh, useSyncRefresh } from "../useSyncRefresh";
import { SYNC_APPLIED_EVENT } from "../../services/sync/sync-events";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const applied = (...collections: string[]) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections } }));
  });

it("reloads with the latest callback when a watched collection is applied, and stops on unmount", async () => {
  const first = jest.fn();
  const second = jest.fn();
  const Probe: React.FC<{ reload: () => void }> = ({ reload }) => {
    useSyncRefresh(["notes", "bookmarks"], reload);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe reload={first} />));
  await act(async () => root.render(<Probe reload={second} />));

  await applied("theme");
  expect(second).not.toHaveBeenCalled();

  await applied("theme", "bookmarks");
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);

  act(() => root.unmount());
  await applied("notes");
  expect(second).toHaveBeenCalledTimes(1);
});

it("re-renders a streak card when the streak stores change", async () => {
  let renders = 0;
  const Probe = () => {
    useStreakRefresh();
    renders++;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  const before = renders;

  await act(async () => {
    window.dispatchEvent(new CustomEvent("hifz-streak-changed"));
  });

  expect(renders).toBe(before + 1);
  act(() => root.unmount());
});
