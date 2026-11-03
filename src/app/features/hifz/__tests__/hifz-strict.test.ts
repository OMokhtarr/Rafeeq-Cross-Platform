/**
 * Strict Hifz loaders/savers used by sync: null only for genuinely absent
 * data, throw on any other failure.
 */
import {
  loadPlanStrict,
  savePlanStrict,
  clearPlanStrict,
  loadHifzReadingSessionStrict,
  type HifzPlan,
} from "../hifz.service";
import { idb } from "../../../core/services/storage/idb.service";

jest.mock("../../../core/services/storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const plan = { memorized: [], goal: {}, sessions: [], createdAt: "2026-10-01" } as unknown as HifzPlan;

beforeEach(() => {
  localStorage.clear();
  (idb.get as jest.Mock).mockResolvedValue(undefined);
  (idb.put as jest.Mock).mockResolvedValue(undefined);
  (idb.delete as jest.Mock).mockResolvedValue(undefined);
});

describe("strict Hifz loaders", () => {
  it("returns null when nothing is stored anywhere", async () => {
    expect(await loadPlanStrict()).toBeNull();
    expect(await loadHifzReadingSessionStrict()).toBeNull();
  });

  it("reads the platform store", async () => {
    (idb.get as jest.Mock).mockResolvedValue({ data: JSON.stringify(plan) });
    expect(await loadPlanStrict()).toEqual(plan);
  });

  it("falls back to the localStorage copy when the platform store is empty", async () => {
    localStorage.setItem("rafiq_hifz_v2", JSON.stringify(plan));
    expect(await loadPlanStrict()).toEqual(plan);
  });

  it("throws when the platform store fails", async () => {
    (idb.get as jest.Mock).mockRejectedValue(new Error("idb down"));
    await expect(loadPlanStrict()).rejects.toThrow("idb down");
  });

  it("throws on a corrupt record", async () => {
    (idb.get as jest.Mock).mockResolvedValue({ data: "{oops" });
    await expect(loadPlanStrict()).rejects.toThrow();
  });
});

describe("strict Hifz writers", () => {
  it("dual-writes localStorage and the platform store", async () => {
    await savePlanStrict(plan);
    expect(JSON.parse(localStorage.getItem("rafiq_hifz_v2") as string)).toEqual(plan);
    expect(idb.put).toHaveBeenCalledWith(expect.anything(), { id: "plan", data: JSON.stringify(plan) });
  });

  it("throws when the platform write fails", async () => {
    (idb.put as jest.Mock).mockRejectedValue(new Error("disk full"));
    await expect(savePlanStrict(plan)).rejects.toThrow("disk full");
  });

  it("clears both copies and throws when the platform clear fails", async () => {
    localStorage.setItem("rafiq_hifz_v2", "{}");
    await clearPlanStrict();
    expect(localStorage.getItem("rafiq_hifz_v2")).toBeNull();
    expect(idb.delete).toHaveBeenCalled();
    (idb.delete as jest.Mock).mockRejectedValue(new Error("idb down"));
    await expect(clearPlanStrict()).rejects.toThrow("idb down");
  });
});
