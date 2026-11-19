const mockIdbDelete = jest.fn();
jest.mock("../../storage/idb.service", () => ({
  idb: { delete: (...args: unknown[]) => mockIdbDelete(...args) },
}));

import { forgetRetiredFonts } from "../font.loader";

describe("forgetRetiredFonts", () => {
  it("deletes the cached Uthmanic Hafs font the old 1405 renderer used", async () => {
    mockIdbDelete.mockResolvedValue(undefined);
    await forgetRetiredFonts();
    expect(mockIdbDelete).toHaveBeenCalledWith("fonts", -1);
  });

  it("does not fail when the delete fails", async () => {
    mockIdbDelete.mockRejectedValue(new Error("quota"));
    await expect(forgetRetiredFonts()).resolves.toBeUndefined();
  });
});
