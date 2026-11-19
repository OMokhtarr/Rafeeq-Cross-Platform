/**
 * Selecting a mushaf: cached pages are per mushaf, and switching drops them.
 */

import {
  getPage,
  applyMushafSelection,
  reconcileMushafSelection,
  getSurahVersesList,
} from "../quran.service";
import { isNetworkReachable } from "../../api/network.service";
import { getActivePageLayout, setActivePageLayout } from "../metadata.service";
import { idb } from "../../storage/idb.service";
import { fetchVersesByPage } from "../../api/quran-data-provider";

jest.mock("../../storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), clear: jest.fn() },
}));
jest.mock("../../api/quran-data-provider", () => ({
  fetchVersesByPage: jest.fn(),
}));
jest.mock("../../api/quran-api.client", () => ({
  isLikelyOffline: () => false,
}));
jest.mock("../../api/network.service", () => ({
  isNetworkReachable: jest.fn(),
}));
jest.mock("../page-layout", () => ({ readPageLayout: jest.fn() }));

const mockGet = idb.get as jest.Mock;
const mockPut = idb.put as jest.Mock;
const mockClear = idb.clear as jest.Mock;
const mockFetch = fetchVersesByPage as jest.Mock;
const mockReachable = isNetworkReachable as jest.Mock;

const cachedVerse = { verse_key: "1:1", words: [] };

function select(mushaf: string) {
  localStorage.setItem("rafiq_settings_v1", JSON.stringify({ mushaf }));
}

beforeEach(() => {
  jest.resetAllMocks();
  localStorage.clear();
  mockPut.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
  mockFetch.mockResolvedValue([]);
  mockReachable.mockResolvedValue(false);
  setActivePageLayout("1421");
});

describe("per-mushaf page cache", () => {
  it("refetches a page cached for another mushaf", async () => {
    select("madani_1405_tajweed");
    mockGet.mockResolvedValue({
      page: 5,
      mushaf: "qpc_v4_tajweed",
      verses: [cachedVerse],
      fetchedAt: Date.now(),
    });
    await getPage(5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("treats a record with no mushaf field as qpc_v4_tajweed", async () => {
    select("madani_1405_tajweed");
    mockGet.mockResolvedValue({
      page: 6,
      verses: [cachedVerse],
      fetchedAt: Date.now(),
    });
    await getPage(6);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    select("qpc_v4_tajweed");
    mockGet.mockResolvedValue({
      page: 7,
      verses: [cachedVerse],
      fetchedAt: Date.now(),
    });
    const verses = await getPage(7);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(verses).toEqual([cachedVerse]);
  });

  it("stores the mushaf with a fetched page", async () => {
    select("madani_1405_tajweed");
    mockGet.mockResolvedValue(undefined);
    await getPage(8);
    expect(mockPut).toHaveBeenCalledWith(
      "pages",
      expect.objectContaining({ page: 8, mushaf: "madani_1405_tajweed" }),
    );
  });
});

describe("applyMushafSelection", () => {
  it("switches the page layout and keeps the cached pages", async () => {
    await applyMushafSelection("madani_1405_tajweed");
    expect(getActivePageLayout()).toBe("1405");
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("still never serves the other mushaf's cached record after a switch", async () => {
    select("madani_1405_tajweed");
    await applyMushafSelection("madani_1405_tajweed");
    mockGet.mockResolvedValue({
      page: 12,
      mushaf: "qpc_v4_tajweed",
      verses: [cachedVerse],
      fetchedAt: Date.now(),
    });
    await getPage(12);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("preloads the pages of the new mushaf when online", async () => {
    mockReachable.mockResolvedValue(true);
    mockGet.mockResolvedValue(undefined);
    select("madani_1405_tajweed");
    await applyMushafSelection("madani_1405_tajweed");
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).toHaveBeenCalled();
    // Stop the loop so it cannot leak into later tests.
    mockReachable.mockResolvedValue(false);
    await applyMushafSelection("qpc_v4_tajweed");
  });

  it("does not preload offline", async () => {
    await applyMushafSelection("madani_1405_tajweed");
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("reconcileMushafSelection", () => {
  it("applies a mushaf written to the settings from outside, once", async () => {
    select("qpc_v4_tajweed");
    reconcileMushafSelection();
    expect(getActivePageLayout()).toBe("1421");

    select("madani_1405_tajweed");
    reconcileMushafSelection();
    expect(getActivePageLayout()).toBe("1405");

    // Already in line: a second call changes nothing and doesn't re-preload.
    mockReachable.mockClear();
    reconcileMushafSelection();
    expect(getActivePageLayout()).toBe("1405");
    expect(mockReachable).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("getSurahVersesList", () => {
  it("follows the active layout's pages: surah 80 reaches page 586 under 1421", async () => {
    select("qpc_v4_tajweed");
    mockGet.mockResolvedValue(undefined);
    const fetched: number[] = [];
    mockFetch.mockImplementation(async (page: number) => {
      fetched.push(page);
      return [];
    });
    await getSurahVersesList(80);
    expect(fetched).toEqual([585, 586]);
  });
});

describe("fetch in flight across a mushaf switch", () => {
  it("never serves the old mushaf's page under the new one", async () => {
    select("qpc_v4_tajweed");
    mockGet.mockResolvedValue(undefined);
    let release: (v: unknown[]) => void = () => {};
    mockFetch.mockImplementationOnce(
      () => new Promise((res) => (release = res)),
    );
    const oldFetch = getPage(9);
    await new Promise((r) => setTimeout(r, 0));

    select("madani_1405_tajweed");
    await applyMushafSelection("madani_1405_tajweed");
    release([
      { verse_key: "1:11", verse_number: 11, chapter_id: 1, words: [] },
    ]);
    await oldFetch;

    mockFetch.mockResolvedValueOnce([
      { verse_key: "1:22", verse_number: 22, chapter_id: 1, words: [] },
    ]);
    const verses = await getPage(9);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(verses)).toContain('"aya":22');
    expect(JSON.stringify(verses)).not.toContain('"aya":11');
  });
});
