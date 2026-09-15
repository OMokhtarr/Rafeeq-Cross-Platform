/**
 * Dropping the derived page cache when the synced layout is replaced.
 *
 * The `pages` store holds verses ALREADY MERGED with the layout that was
 * current when they were fetched. When Content Sync replaces mushafs:19, every
 * one of those entries is stale — and because getPage() reads `pages` before
 * it ever looks at the layout row, a stale entry would be served indefinitely.
 */

import { clearDerivedPageCache } from "../page-cache";
import { idb } from "../../storage/idb.service";

jest.mock("../../storage/idb.service", () => ({
  idb: { clear: jest.fn() },
}));

const mockClear = idb.clear as jest.MockedFunction<typeof idb.clear>;

beforeEach(() => {
  mockClear.mockReset();
  mockClear.mockResolvedValue(undefined as never);
});

describe("clearDerivedPageCache", () => {
  it("clears the pages store", async () => {
    await clearDerivedPageCache();
    expect(mockClear).toHaveBeenCalledWith("pages");
  });

  it("does not throw when the store cannot be cleared", async () => {
    // Invalidation runs inside a sync; failing to clear must not abort the
    // sync run, which would leave the checkpoint unadvanced.
    mockClear.mockRejectedValue(new Error("quota"));
    await expect(clearDerivedPageCache()).resolves.toBeUndefined();
  });
});
