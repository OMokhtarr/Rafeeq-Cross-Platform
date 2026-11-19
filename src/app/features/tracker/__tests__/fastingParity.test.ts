import fs from "fs";
import path from "path";
import { fastingOccasion } from "../trackerLogic";

// The fasting reminders (Android, FastingCalendar.kt) port fastingOccasion().
// This fixture is the contract between the two: FastingCalendarTest checks the
// Kotlin port against the same file, so a rule changed on one side only fails.
const FIXTURE = path.resolve(
  __dirname,
  "../../../../../android/app/src/test/resources/fasting-occasions.json",
);

describe("fasting-occasions fixture", () => {
  const expected: Record<string, string | null> = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

  it("covers two full years", () => {
    expect(Object.keys(expected)).toHaveLength(730);
  });

  it("matches fastingOccasion() on every day", () => {
    const mismatches = Object.entries(expected).filter(([key, occasion]) => {
      const [y, m, d] = key.split("-").map(Number);
      return fastingOccasion(new Date(y, m - 1, d, 12)) !== occasion;
    });
    expect(mismatches).toEqual([]);
  });
});
