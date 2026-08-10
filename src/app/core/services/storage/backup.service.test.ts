import { createBackup, parseBackup, restoreBackup } from "./backup.service";
import { freezeCount, MAX_FREEZES } from "./streak-freeze.service";
import { recordQuizCompletion } from "./quiz-streak.service";
import { todayStr } from "../../utils/local-date.util";

beforeEach(() => {
  localStorage.clear();
});

describe("backup carries freeze state", () => {
  it("round-trips freeze pools and session counts", async () => {
    // Drain the quiz pool to a distinctive value so a default cannot pass.
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: { "2026-08-01": 1 }, spentOn: [] }),
    );
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: ["2026-08-02"] }),
    );
    localStorage.setItem(
      "rafiq_hifz_session_counts_v1",
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );

    const backup = await createBackup();
    const json = JSON.stringify(backup);

    localStorage.clear();
    // Without a restore these read as the full default.
    expect(freezeCount("quiz")).toBe(MAX_FREEZES);

    await restoreBackup(parseBackup(json));

    expect(freezeCount("quiz")).toBe(1);
    expect(freezeCount("hifz")).toBe(0);
    expect(localStorage.getItem("rafiq_hifz_session_counts_v1")).toBe(
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );
  });

  it("keeps a freeze earned through the quiz flow across a migration", async () => {
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
    recordQuizCompletion(todayStr());
    recordQuizCompletion(todayStr()); // earns one
    expect(freezeCount("quiz")).toBe(1);

    const json = JSON.stringify(await createBackup());
    localStorage.clear();
    await restoreBackup(parseBackup(json));

    expect(freezeCount("quiz")).toBe(1);
  });
});
