import { Filesystem } from "@capacitor/filesystem";
import { brokenStores } from "../../../core/services/sync/broken-stores";
import { loadBestPlanAsync, loadPlanAsync } from "../hifz.service";

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
jest.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn(), deleteFile: jest.fn() },
}));
// hifz.service imports it; only its functions use it, and its API client warns on load.
jest.mock("../../../core/services/data/metadata.service", () => ({}));
jest.mock("../../../core/services/storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  (Filesystem.writeFile as jest.Mock).mockResolvedValue(undefined);
  (Filesystem.mkdir as jest.Mock).mockResolvedValue(undefined);
});

describe("Android Hifz loaders", () => {
  it("an unreadable plan file marks the store, so sync merges instead of replacing the cloud plan", async () => {
    (Filesystem.readFile as jest.Mock).mockRejectedValue(new Error("I/O error"));
    expect(await loadPlanAsync()).toBeNull();
    expect(await loadBestPlanAsync()).toBeNull();
    expect(brokenStores()).toEqual(["hifzPlan", "hifzBest"]);
  });

  it("a missing file is just absent", async () => {
    (Filesystem.readFile as jest.Mock).mockRejectedValue(new Error("File does not exist."));
    expect(await loadPlanAsync()).toBeNull();
    expect(brokenStores()).toEqual([]);
  });

  it("an unreadable file still falls back to the localStorage copy", async () => {
    (Filesystem.readFile as jest.Mock).mockRejectedValue(new Error("I/O error"));
    const plan = { memorized: [], goal: {}, sessions: [], createdAt: "2026-10-01T00:00:00.000Z" };
    localStorage.setItem("rafiq_hifz_v2", JSON.stringify(plan));
    expect(await loadPlanAsync()).toEqual(plan);
  });
});
