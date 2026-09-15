/**
 * The layout half of getPage(): read the synced mushafs:19 row for one page.
 *
 * Kept separate from quran.service so the lookup can be tested without
 * dragging in the whole data layer (metadata, search corpus, recite matcher).
 * quran.service consumes readPageLayout() and mergeLayoutIntoVerses() together.
 */

import { readPageLayout } from "../page-layout";
import { readRow } from "../../sync/sync-store.service";
import type { VerseWord } from "../../../../shared/models/verse.model";

jest.mock("../../sync/sync-store.service", () => ({
  readRow: jest.fn(),
}));

const mockReadRow = readRow as jest.MockedFunction<typeof readRow>;

function layoutWord(codeV2: string, line: number): VerseWord {
  return {
    position: 0,
    charType: "word",
    text_uthmani: "",
    codeV2,
    lineNumber: line,
    pageNumber: 50,
  };
}

beforeEach(() => {
  mockReadRow.mockReset();
});

describe("readPageLayout", () => {
  it("returns the words stored on the page row", async () => {
    const words = [layoutWord("ﱁ", 3), layoutWord("ﱂ", 3)];
    mockReadRow.mockResolvedValue({
      id: "mushafs:19:mushaf_page:50",
      resourceGroup: "mushafs",
      resourceId: 19,
      recordType: "mushaf_page",
      recordKey: "50",
      data: { pageNumber: 50, verseMapping: {}, words },
      sequence: 1399,
    });

    expect(await readPageLayout(50)).toEqual(words);
    expect(mockReadRow).toHaveBeenCalledWith("mushafs", 19, "mushaf_page", "50");
  });

  it("returns null before the resource has been bootstrapped", async () => {
    // Every page falls back to the API until the snapshot has landed.
    mockReadRow.mockResolvedValue(null);
    expect(await readPageLayout(50)).toBeNull();
  });

  it("returns null when the row holds no words", async () => {
    mockReadRow.mockResolvedValue({
      id: "mushafs:19:mushaf_page:50",
      resourceGroup: "mushafs",
      resourceId: 19,
      recordType: "mushaf_page",
      recordKey: "50",
      data: { pageNumber: 50, verseMapping: {}, words: [] },
      sequence: 1399,
    });
    expect(await readPageLayout(50)).toBeNull();
  });

  it("never throws when the store fails", async () => {
    // A layout read failing must degrade to the API path, not break the page.
    mockReadRow.mockRejectedValue(new Error("idb unavailable"));
    expect(await readPageLayout(50)).toBeNull();
  });
});
