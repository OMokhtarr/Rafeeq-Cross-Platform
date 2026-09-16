/**
 * Regression test for the "first tafsir download is invisible on failure"
 * bug: handleSave() in TafsirSettings.tsx used to call addDownloadedTafsir(id)
 * only AFTER `await bootstrapResource(...)` resolved. A failed first download
 * then tracked the resource but never entered the downloaded list, so it
 * never appeared in the Downloaded section and the "download incomplete"
 * resume UI (which exists precisely for this case, driven by
 * isTafsirAvailableOffline) never got a chance to fire.
 *
 * downloadTafsir() is the fix: it centralizes the ordering TafsirSettings.tsx
 * must follow (add to the downloaded list, THEN await the bootstrap), so it
 * is covered directly rather than only through the component.
 *
 * Follows the same "mock the sync import" pattern as audio-cache.service.test.ts.
 */

import {
  downloadTafsir,
  getDownloadedTafsirIds,
} from "../tafsir-cache.service";
import { bootstrapResource } from "../../sync/content-sync.service";

jest.mock("../../sync/content-sync.service", () => ({
  bootstrapResource: jest.fn(),
  // tafsirs.adapter.ts calls registerAdapter() at module load time (it is
  // imported transitively via tafsir-cache.service -> hasCachedTafsir).
  registerAdapter: jest.fn(),
}));

jest.mock("../../sync/sync-store.service", () => ({
  readResourceRows: jest.fn().mockResolvedValue([]),
}));

const mockBootstrap = bootstrapResource as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("downloadTafsir", () => {
  it("adds the id to the downloaded list even when the bootstrap fails", async () => {
    mockBootstrap.mockRejectedValue(new Error("offline"));

    await expect(downloadTafsir("169")).rejects.toThrow("offline");

    // Must already be in the list so the Downloaded section and the
    // "incomplete" resume affordance can find it — a failed first download
    // must not be invisible.
    expect(getDownloadedTafsirIds()).toContain("169");
  });

  it("adds the id to the downloaded list on a successful download", async () => {
    mockBootstrap.mockResolvedValue(undefined);

    await downloadTafsir("169");

    expect(getDownloadedTafsirIds()).toContain("169");
    expect(mockBootstrap).toHaveBeenCalledWith(
      "tafsirs",
      169,
      undefined,
    );
  });

  it("adds to the list before the bootstrap promise settles, not after", async () => {
    let idWasListedDuringBootstrap = false;
    mockBootstrap.mockImplementation(async () => {
      idWasListedDuringBootstrap = getDownloadedTafsirIds().includes("169");
    });

    await downloadTafsir("169");

    expect(idWasListedDuringBootstrap).toBe(true);
  });

  it("forwards progress callbacks through to bootstrapResource", async () => {
    mockBootstrap.mockResolvedValue(undefined);
    const onProgress = jest.fn();

    await downloadTafsir("169", onProgress);

    expect(mockBootstrap).toHaveBeenCalledWith("tafsirs", 169, onProgress);
  });
});
