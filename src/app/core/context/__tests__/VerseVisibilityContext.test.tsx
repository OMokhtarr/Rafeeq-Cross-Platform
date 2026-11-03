import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VerseVisibilityProvider, useVerseVisibility } from "../VerseVisibilityContext";
import { SYNC_APPLIED_EVENT } from "../../services/sync/sync-events";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const applied = (...collections: string[]) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections } }));
  });

it("re-reads hidden verses when sync applies the hiddenVerses collection, and ignores other collections", async () => {
  localStorage.setItem("rafiq_hidden_verses_v1", JSON.stringify(["1:1"]));
  let hidden: string[] = [];
  const Probe = () => {
    hidden = Array.from(useVerseVisibility().hidden);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <VerseVisibilityProvider>
        <Probe />
      </VerseVisibilityProvider>,
    ),
  );
  expect(hidden).toEqual(["1:1"]);

  localStorage.setItem("rafiq_hidden_verses_v1", JSON.stringify(["1:1", "2:5"]));
  await applied("notes");
  expect(hidden).toEqual(["1:1"]);
  await applied("hiddenVerses");
  expect(hidden).toEqual(["1:1", "2:5"]);
  act(() => root.unmount());
});
