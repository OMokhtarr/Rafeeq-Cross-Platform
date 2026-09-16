/**
 * Contract tests for the Content Sync "track reciter on first cache" hook in
 * downloadAndCache. These mock the two sync imports (isTracked,
 * bootstrapResource) and the file-cache module so no network or real
 * IndexedDB is needed — the point is to verify the fire-and-forget trigger
 * fires on BOTH the Android file-cache branch and the web/iOS IDB branch,
 * and that it can never make downloadAndCache reject or hang.
 */

import { downloadAndCache } from "../audio-cache.service";
import { isTracked } from "../../sync/sync-state.service";
import { bootstrapResource } from "../../sync/content-sync.service";
import { usesFileCache, ensureCachedFile } from "../audio-file-cache.service";
import { idb } from "../../storage/idb.service";
import { fetchAudioForAyah } from "../../data/quran.service";

jest.mock("../../sync/sync-state.service", () => ({
  isTracked: jest.fn(),
}));

jest.mock("../../sync/content-sync.service", () => ({
  bootstrapResource: jest.fn(),
}));

jest.mock("../audio-file-cache.service", () => ({
  usesFileCache: jest.fn(),
  ensureCachedFile: jest.fn(),
  getWebPlayableUri: jest.fn(),
  getNativeFileUri: jest.fn(),
  hasCachedFile: jest.fn(),
}));

jest.mock("../../storage/idb.service", () => ({
  idb: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    count: jest.fn(),
    getAllKeys: jest.fn(),
  },
}));

jest.mock("../../data/quran.service", () => ({
  fetchAudioForAyah: jest.fn(),
}));

const mockUsesFileCache = usesFileCache as jest.Mock;
const mockEnsureCachedFile = ensureCachedFile as jest.Mock;
const mockIsTracked = isTracked as jest.Mock;
const mockBootstrapResource = bootstrapResource as jest.Mock;
const mockIdbGet = idb.get as jest.Mock;
const mockIdbPut = idb.put as jest.Mock;
const mockFetchAudioForAyah = fetchAudioForAyah as jest.Mock;

// Flush the microtask queue so fire-and-forget .then()/.catch() chains
// scheduled inside downloadAndCache get a chance to run before assertions.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("downloadAndCache — Content Sync tracking hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTracked.mockResolvedValue(false);
    mockBootstrapResource.mockResolvedValue(undefined);
  });

  it("tracks the reciter on the Android file-cache branch after a successful download", async () => {
    mockUsesFileCache.mockReturnValue(true);
    mockEnsureCachedFile.mockResolvedValue(undefined);

    const ok = await downloadAndCache("4", 1, 1);
    expect(ok).toBe(true);

    await flushMicrotasks();

    expect(mockIsTracked).toHaveBeenCalledWith("recitations", 4);
    expect(mockBootstrapResource).toHaveBeenCalledWith("recitations", 4);
  });

  it("tracks the reciter on the web/iOS IDB branch after a genuinely new write", async () => {
    mockUsesFileCache.mockReturnValue(false);
    mockIdbGet.mockResolvedValue(undefined); // not already cached
    mockFetchAudioForAyah.mockResolvedValue("https://example.com/audio.mp3");
    const blob = new Blob(["x"], { type: "audio/mpeg" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    }) as unknown as typeof fetch;
    mockIdbPut.mockResolvedValue(undefined);

    const ok = await downloadAndCache("7", 2, 3);
    expect(ok).toBe(true);

    await flushMicrotasks();

    expect(mockIsTracked).toHaveBeenCalledWith("recitations", 7);
    expect(mockBootstrapResource).toHaveBeenCalledWith("recitations", 7);
  });

  it("does not re-bootstrap an already-tracked reciter", async () => {
    mockUsesFileCache.mockReturnValue(true);
    mockEnsureCachedFile.mockResolvedValue(undefined);
    mockIsTracked.mockResolvedValue(true);

    await downloadAndCache("4", 1, 1);
    await flushMicrotasks();

    expect(mockIsTracked).toHaveBeenCalledWith("recitations", 4);
    expect(mockBootstrapResource).not.toHaveBeenCalled();
  });

  it("swallows a bootstrapResource rejection without propagating out of downloadAndCache", async () => {
    mockUsesFileCache.mockReturnValue(true);
    mockEnsureCachedFile.mockResolvedValue(undefined);
    mockIsTracked.mockResolvedValue(false);
    mockBootstrapResource.mockRejectedValue(new Error("offline"));

    await expect(downloadAndCache("4", 1, 1)).resolves.toBe(true);

    await flushMicrotasks();

    expect(mockBootstrapResource).toHaveBeenCalledWith("recitations", 4);
    // No unhandled rejection should surface — reaching this line is the assertion.
  });

  it("ignores a non-numeric reciter id instead of tracking with NaN", async () => {
    mockUsesFileCache.mockReturnValue(true);
    mockEnsureCachedFile.mockResolvedValue(undefined);

    const ok = await downloadAndCache("default", 1, 1);
    expect(ok).toBe(true);

    await flushMicrotasks();

    expect(mockIsTracked).not.toHaveBeenCalled();
    expect(mockBootstrapResource).not.toHaveBeenCalled();
  });
});
