import { createBackup, parseBackup, restoreBackup } from "./backup.service";
import { freezeCount, MAX_FREEZES } from "./streak-freeze.service";

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
