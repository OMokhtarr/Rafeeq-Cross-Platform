import { createBackup, parseBackup, restoreBackup } from "../backup.service";
import { PRESETS_KEY } from "../../../../features/quiz/services/quiz-presets.service";
import { resetSyncState } from "../../sync/sync.service";
import { freezeCount, MAX_FREEZES } from "../streak-freeze.service";

jest.mock("../../sync/sync.service", () => ({ resetSyncState: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
});

describe("backup carries freeze state", () => {
  it("round-trips the freeze pool and session counts", async () => {
    // Drain the pool to a distinctive value so a default cannot pass.
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: { "2026-08-01": 1 }, spentOn: ["2026-08-02"] }),
    );
    localStorage.setItem(
      "rafiq_hifz_session_counts_v1",
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );

    const backup = await createBackup();
    const json = JSON.stringify(backup);

    localStorage.clear();
    // Without a restore this reads as the full default.
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);

    await restoreBackup(parseBackup(json));

    expect(freezeCount("hifz")).toBe(1);
    expect(localStorage.getItem("rafiq_hifz_session_counts_v1")).toBe(
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );
  });
});

describe("backup carries the worship tracker", () => {
  it("round-trips the days, settings and start date", async () => {
    localStorage.setItem("rafeeq.tracker.days", JSON.stringify({ "2026-03-02": ["fajr"] }));
    localStorage.setItem("rafeeq.tracker.settings", JSON.stringify({ azkar: false }));
    localStorage.setItem("rafeeq.tracker.since", "2026-03-01");

    const json = JSON.stringify(await createBackup());
    localStorage.clear();
    await restoreBackup(parseBackup(json));

    expect(localStorage.getItem("rafeeq.tracker.days")).toBe(JSON.stringify({ "2026-03-02": ["fajr"] }));
    expect(localStorage.getItem("rafeeq.tracker.settings")).toBe(JSON.stringify({ azkar: false }));
    expect(localStorage.getItem("rafeeq.tracker.since")).toBe("2026-03-01");
  });
});

describe("restoring a backup", () => {
  it("resets sync state so the next sync is a first merge that deletes nothing", async () => {
    localStorage.setItem("rafeeq.tracker.since", "2026-03-01");
    const json = JSON.stringify(await createBackup());
    await restoreBackup(parseBackup(json));
    expect(resetSyncState).toHaveBeenCalledTimes(1);
  });

  it("still resets sync state when a step fails after the stores were overwritten", async () => {
    const data = new Proxy({ "rafeeq.tracker.since": "2026-03-01" } as Record<string, string>, {
      get: (target, key) => {
        if (key === PRESETS_KEY) throw new Error("boom");
        return Reflect.get(target, key);
      },
    });
    await expect(restoreBackup({ version: 1, exportedAt: "", data } as never)).rejects.toThrow("boom");
    expect(localStorage.getItem("rafeeq.tracker.since")).toBe("2026-03-01");
    expect(resetSyncState).toHaveBeenCalledTimes(1);
  });
});
