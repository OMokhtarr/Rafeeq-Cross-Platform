/**
 * Selecting a mushaf: cached pages are per mushaf, and switching drops them.
 */

import { getPage, applyMushafSelection } from "../quran.service";
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
jest.mock("../page-layout", () => ({ readPageLayout: jest.fn() }));

const mockGet = idb.get as jest.Mock;
const mockPut = idb.put as jest.Mock;
const mockClear = idb.clear as jest.Mock;
const mockFetch = fetchVersesByPage as jest.Mock;

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
  it("switches the page layout and clears the pages store", async () => {
    await applyMushafSelection("madani_1405_tajweed");
    expect(getActivePageLayout()).toBe("1405");
    expect(mockClear).toHaveBeenCalledWith("pages");
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
