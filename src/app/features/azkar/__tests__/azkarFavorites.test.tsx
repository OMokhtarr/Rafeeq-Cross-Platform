import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { useAzkarFavorites } from "../azkarFavorites";
import { SYNC_APPLIED_EVENT } from "../../../core/services/sync/sync-events";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "azkar:favorites";
let latest: ReturnType<typeof useAzkarFavorites>;
let root: Root;

const Probe = () => {
  latest = useAzkarFavorites();
  return null;
};

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem(KEY, JSON.stringify(["a"]));
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});

afterEach(() => act(() => root.unmount()));

it("a toggle keeps a favourite another phone added, even before the page refreshed", () => {
  localStorage.setItem(KEY, JSON.stringify(["a", "remote"]));

  act(() => latest.toggleFavorite("mine"));

  expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual(["a", "remote", "mine"]);
  expect(latest.favorites).toEqual(["a", "remote", "mine"]);
});

it("shows favourites sync applied", async () => {
  localStorage.setItem(KEY, JSON.stringify(["a", "remote"]));

  await act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections: ["azkarFavorites"] } }));
  });

  expect(latest.favorites).toEqual(["a", "remote"]);
});
