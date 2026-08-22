import {
  SYNC_OVERDUE_MS,
  isSyncOverdue,
  relativeDays,
} from "./sync-status";

const DAY = 24 * 60 * 60 * 1000;

const S = {
  syncToday: "Today",
  syncYesterday: "Yesterday",
  syncDaysAgo: (n: number) => `${n} days ago`,
};

describe("isSyncOverdue", () => {
  it("pins the threshold to the 7-day obligation in the QF terms", () => {
    // Not a style choice: §3.1(3)(b) requires a re-sync at least every 7 days.
    expect(SYNC_OVERDUE_MS).toBe(7 * DAY);
  });

  it("is not overdue just inside seven days", () => {
    expect(isSyncOverdue(Date.now() - (7 * DAY - 60_000))).toBe(false);
  });

  it("is overdue just past seven days", () => {
    expect(isSyncOverdue(Date.now() - (7 * DAY + 60_000))).toBe(true);
  });

  it("treats never-synced as not overdue", () => {
    // The row already reads "Not synced yet"; adding "due a sync" would be
    // redundant noise rather than information.
    expect(isSyncOverdue(null)).toBe(false);
  });
});

describe("relativeDays", () => {
  it("reads Today for a sync minutes ago", () => {
    expect(relativeDays(Date.now() - 60_000, S)).toBe("Today");
  });

  it("reads Yesterday at one day", () => {
    expect(relativeDays(Date.now() - DAY - 1000, S)).toBe("Yesterday");
  });

  it("counts whole days beyond that", () => {
    expect(relativeDays(Date.now() - 5 * DAY - 1000, S)).toBe("5 days ago");
  });

  it("never renders a negative age from a clock skew", () => {
    // A future timestamp (device clock moved backwards) must not read
    // "-3 days ago".
    expect(relativeDays(Date.now() + 3 * DAY, S)).toBe("Today");
  });
});
