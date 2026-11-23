import { evaluateRestore, restoreDaysNeeded, RestoreRecord } from "../streak-restore";

/** Consecutive days from `from`, `n` of them. */
function run(from: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) {
    const p = (x: number) => String(x).padStart(2, "0");
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// A 20-day streak ending Nov 10; Nov 11 and 12 missed.
const LOST = run("2026-10-22", 20); // ends 2026-11-10
const offered: RestoreRecord = { lostEnd: "2026-11-10", lostLength: 20, offeredOn: "2026-11-13" };

describe("restoreDaysNeeded", () => {
  it("follows the 3 / 5 / 7 tiers", () => {
    expect(restoreDaysNeeded(14)).toBe(3);
    expect(restoreDaysNeeded(49)).toBe(3);
    expect(restoreDaysNeeded(50)).toBe(5);
    expect(restoreDaysNeeded(100)).toBe(7);
  });
});

describe("evaluateRestore", () => {
  it("offers a restore once the one-day repair has passed", () => {
    const r = evaluateRestore(new Set(LOST), null, "2026-11-13", true);
    expect(r.record).toEqual(offered);
    expect(r.state).toEqual({
      kind: "available",
      lostLength: 20,
      needed: 3,
      progress: 0,
      startBy: "2026-11-14",
    });
  });

  it("does not offer while yesterday's miss can still be repaired", () => {
    expect(evaluateRestore(new Set(LOST), null, "2026-11-12", true).state.kind).toBe("none");
  });

  it("does not offer for a streak shorter than 14 days", () => {
    const short = run("2026-10-29", 13); // ends 2026-11-10
    expect(evaluateRestore(new Set(short), null, "2026-11-13", true).record).toBeNull();
  });

  it("does not offer a break older than a week", () => {
    expect(evaluateRestore(new Set(LOST), null, "2026-11-20", true).record).toBeNull();
  });

  it("counts the days done in a row since the restart", () => {
    const active = new Set([...LOST, ...run("2026-11-13", 2)]);
    const r = evaluateRestore(active, offered, "2026-11-15", true);
    expect(r.state).toMatchObject({ kind: "inProgress", progress: 2, needed: 3 });
  });

  it("restores with the restore days on top: the missed days are filled", () => {
    const active = new Set([...LOST, ...run("2026-11-13", 3)]);
    const r = evaluateRestore(active, offered, "2026-11-15", true);
    expect(r.fill).toEqual(["2026-11-11", "2026-11-12"]);
    expect(r.record?.outcome).toBe("restored");
    expect(r.state.kind).toBe("none");
  });

  it("waits for Pro instead of restoring", () => {
    const active = new Set([...LOST, ...run("2026-11-13", 3)]);
    const r = evaluateRestore(active, offered, "2026-11-15", false);
    expect(r.fill).toEqual([]);
    expect(r.state).toMatchObject({ kind: "complete", progress: 3 });
    expect(r.record?.outcome).toBeUndefined();
  });

  it("ends the attempt when a day is missed after the repair window", () => {
    const active = new Set([...LOST, "2026-11-13"]);
    // Nov 14 missed; on the 15th the one-day repair could still bridge it.
    expect(evaluateRestore(active, offered, "2026-11-15", true).state.kind).toBe("none");
    // From the 16th the newer break is the latest one, so the old offer is
    // gone for good — the 1-day run left over is far below 14 days.
    for (const day of ["2026-11-16", "2026-11-17", "2026-11-20"]) {
      const r = evaluateRestore(active, offered, day, true);
      expect(r.state.kind).toBe("none");
      expect(r.fill).toEqual([]);
    }
  });

  it("expires when the first session comes after the day after the offer", () => {
    const r = evaluateRestore(new Set(LOST), offered, "2026-11-15", true);
    expect(r.record?.outcome).toBe("expired");
    const late = new Set([...LOST, "2026-11-15"]);
    expect(evaluateRestore(late, offered, "2026-11-15", true).record?.outcome).toBe("expired");
  });

  it("lets a session the day after the offer start it", () => {
    const active = new Set([...LOST, "2026-11-14"]);
    const r = evaluateRestore(active, offered, "2026-11-14", true);
    expect(r.state).toMatchObject({ kind: "inProgress", progress: 1 });
  });
});
