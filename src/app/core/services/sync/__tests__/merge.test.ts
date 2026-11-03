import {
  mergeFreezePool,
  mergeHifzPlan,
  mergeVersioned,
  stableStringify,
} from "../merge";
import type { Versioned } from "../types";
import type { HifzPlan, PlanSession } from "../../../../features/hifz/hifz.service";

const v = (value: unknown, editedAt: string, deleted = false): Versioned => ({
  value,
  editedAt,
  deleted,
});

describe("stableStringify", () => {
  it("ignores key order but keeps array order", () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe.each(["items", "object"] as const)(
  "mergeVersioned (%s, last write wins)",
  (kind) => {
    it("newer local wins and must be pushed", () => {
      const local = v("L", "2026-10-02T00:00:00Z");
      const remote = v("R", "2026-10-01T00:00:00Z");
      expect(mergeVersioned(kind, local, remote)).toEqual({
        winner: local,
        pushLocal: true,
        applyRemote: false,
      });
    });

    it("newer remote wins and must be applied", () => {
      const local = v("L", "2026-10-01T00:00:00Z");
      const remote = v("R", "2026-10-02T00:00:00Z");
      expect(mergeVersioned(kind, local, remote)).toEqual({
        winner: remote,
        pushLocal: false,
        applyRemote: true,
      });
    });

    it("a tie goes to the remote", () => {
      const local = v("L", "2026-10-01T00:00:00Z");
      const remote = v("R", "2026-10-01T00:00:00Z");
      const r = mergeVersioned(kind, local, remote);
      expect(r.winner).toBe(remote);
      expect(r.pushLocal).toBe(false);
      expect(r.applyRemote).toBe(true);
    });

    it("compares instants, not strings (Postgres +00:00 microseconds vs JS Z)", () => {
      const local = v("L", "2026-10-01T10:00:00.500Z");
      const older = v("R", "2026-10-01T10:00:00.123456+00:00");
      expect(mergeVersioned(kind, local, older).winner).toBe(local);
      const sameInstant = v("R", "2026-10-01T10:00:00.500000+00:00");
      expect(mergeVersioned(kind, local, sameInstant).winner).toBe(sameInstant);
    });

    it("an identical tie needs neither push nor apply", () => {
      const local = v({ a: 1, b: 2 }, "2026-10-01T00:00:00Z");
      const remote = v({ b: 2, a: 1 }, "2026-10-01T00:00:00.000+00:00");
      expect(mergeVersioned(kind, local, remote)).toEqual({
        winner: remote,
        pushLocal: false,
        applyRemote: false,
      });
    });

    it("a differing deleted flag counts as different", () => {
      const local = v("x", "2026-10-02T00:00:00Z", true);
      const remote = v("x", "2026-10-01T00:00:00Z", false);
      expect(mergeVersioned(kind, local, remote).pushLocal).toBe(true);
    });

    it("a local delete newer than a remote edit yields a deleted winner", () => {
      const local = v(null, "2026-10-02T00:00:00Z", true);
      const remote = v("edit", "2026-10-01T00:00:00Z");
      const r = mergeVersioned(kind, local, remote);
      expect(r.winner.deleted).toBe(true);
      expect(r.pushLocal).toBe(true);
      expect(r.applyRemote).toBe(false);
    });

    it("a remote delete older than a local edit loses: the note comes back", () => {
      const local = v("edit", "2026-10-02T00:00:00Z");
      const remote = v(null, "2026-10-01T00:00:00Z", true);
      const r = mergeVersioned(kind, local, remote);
      expect(r.winner.deleted).toBe(false);
      expect(r.winner.value).toBe("edit");
      expect(r.pushLocal).toBe(true);
    });

    it("a newer remote delete wins over a local edit", () => {
      const local = v("edit", "2026-10-01T00:00:00Z");
      const remote = v(null, "2026-10-02T00:00:00Z", true);
      const r = mergeVersioned(kind, local, remote);
      expect(r.winner.deleted).toBe(true);
      expect(r.applyRemote).toBe(true);
    });

    it("local only is pushed; remote only is applied", () => {
      const x = v("x", "2026-10-01T00:00:00Z");
      expect(mergeVersioned(kind, x, undefined)).toEqual({
        winner: x,
        pushLocal: true,
        applyRemote: false,
      });
      expect(mergeVersioned(kind, undefined, x)).toEqual({
        winner: x,
        pushLocal: false,
        applyRemote: true,
      });
    });

    it("throws when both sides are missing", () => {
      expect(() => mergeVersioned(kind, undefined, undefined)).toThrow();
    });
  },
);

describe("mergeVersioned (days)", () => {
  it("unions arrays, de-duplicated and sorted", () => {
    const r = mergeVersioned(
      "days",
      v(["2026-10-03", "2026-10-01"], "2026-10-01T00:00:00Z"),
      v(["2026-10-02", "2026-10-01"], "2026-10-02T00:00:00Z"),
    );
    expect(r.winner.value).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(r.winner.editedAt).toBe("2026-10-02T00:00:00Z");
    expect(r.winner.deleted).toBe(false);
    expect(r.pushLocal).toBe(true);
    expect(r.applyRemote).toBe(true);
  });

  it("gives both days for two single-day arrays", () => {
    const r = mergeVersioned(
      "days",
      v(["2026-10-01"], "2026-10-01T00:00:00Z"),
      v(["2026-10-02"], "2026-10-01T00:00:00Z"),
    );
    expect(r.winner.value).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("ignores a remote delete", () => {
    const r = mergeVersioned(
      "days",
      v(["2026-10-01"], "2026-10-01T00:00:00Z"),
      v(null, "2026-10-05T00:00:00Z", true),
    );
    expect(r.winner.deleted).toBe(false);
    expect(r.winner.value).toEqual(["2026-10-01"]);
    expect(r.winner.editedAt).toBe("2026-10-05T00:00:00Z");
  });

  it("becomes true when either side is not an array", () => {
    const r = mergeVersioned(
      "days",
      v(true, "2026-10-01T00:00:00Z"),
      v(["2026-10-01"], "2026-10-01T00:00:00Z"),
    );
    expect(r.winner.value).toBe(true);
  });

  it("returns the only side as is when it is live", () => {
    const x = v(["2026-10-01"], "2026-10-01T00:00:00Z");
    expect(mergeVersioned("days", x, undefined)).toEqual({
      winner: x,
      pushLocal: true,
      applyRemote: false,
    });
    expect(mergeVersioned("days", undefined, x)).toEqual({
      winner: x,
      pushLocal: false,
      applyRemote: true,
    });
  });

  it("is a no-op when both sides already agree", () => {
    const a = v(["2026-10-01"], "2026-10-01T00:00:00Z");
    const b = { ...a, editedAt: "2026-10-01T00:00:00.000+00:00" };
    const r = mergeVersioned("days", a, b);
    expect(r.pushLocal).toBe(false);
    expect(r.applyRemote).toBe(false);
  });

  it("throws when both sides are missing", () => {
    expect(() => mergeVersioned("days", undefined, undefined)).toThrow();
  });
});

const session = (id: string, over: Partial<PlanSession> = {}): PlanSession => ({
  id,
  label: `s${id}`,
  fromPage: 1,
  toPage: 2,
  done: false,
  ...over,
});

const plan = (
  createdAt: string,
  sessions: PlanSession[],
  over: Record<string, unknown> = {},
): HifzPlan =>
  ({ memorized: [], goal: { type: "x" }, sessions, createdAt, ...over }) as unknown as HifzPlan;

describe("mergeHifzPlan", () => {
  const created = "2026-09-01T00:00:00Z";

  it("keeps both devices' completed sessions", () => {
    const local = plan(created, [
      session("5", { done: true, doneDate: "2026-10-01" }),
      session("6"),
    ]);
    const remote = plan(created, [
      session("5"),
      session("6", { done: true, doneDate: "2026-10-02" }),
    ]);
    const { current, archived } = mergeHifzPlan(local, remote);
    expect(archived).toBeNull();
    expect(current.sessions.map((s) => [s.id, s.done])).toEqual([
      ["5", true],
      ["6", true],
    ]);
  });

  it("a done session stays done when the newer side has it undone", () => {
    const newer = plan(created, [session("5")]);
    const older = plan(created, [session("5", { done: true, doneDate: "2026-10-01" })]);
    const s = mergeHifzPlan(newer, older).current.sessions[0];
    expect(s.done).toBe(true);
    expect(s.doneDate).toBe("2026-10-01");
  });

  it("uses the earliest non-empty doneDate", () => {
    const newer = plan(created, [session("5", { done: true, doneDate: "2026-10-05" })]);
    const older = plan(created, [session("5", { done: true, doneDate: "2026-10-02" })]);
    expect(mergeHifzPlan(newer, older).current.sessions[0].doneDate).toBe("2026-10-02");
    const noDate = plan(created, [session("5", { done: true })]);
    expect(mergeHifzPlan(noDate, older).current.sessions[0].doneDate).toBe("2026-10-02");
    expect(mergeHifzPlan(noDate, noDate).current.sessions[0].doneDate).toBeUndefined();
  });

  it("takes every other field from newer and drops older-only sessions", () => {
    const newer = plan(created, [session("1", { label: "new" })], { goal: { type: "new" } });
    const older = plan(created, [session("1", { label: "old" }), session("2")], {
      goal: { type: "old" },
    });
    const { current } = mergeHifzPlan(newer, older);
    expect(current.sessions).toHaveLength(1);
    expect(current.sessions[0].label).toBe("new");
    expect((current.goal as unknown as { type: string }).type).toBe("new");
  });

  it("keeps newer-only sessions as they are", () => {
    const newer = plan(created, [
      session("1"),
      session("2", { done: true, doneDate: "2026-10-01" }),
    ]);
    const older = plan(created, [session("1")]);
    expect(mergeHifzPlan(newer, older).current.sessions[1].done).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const newer = plan(created, [session("5")]);
    const older = plan(created, [session("5", { done: true, doneDate: "2026-10-01" })]);
    mergeHifzPlan(newer, older);
    expect(newer.sessions[0].done).toBe(false);
  });

  it("treats the same createdAt in different formats as the same plan", () => {
    const newer = plan("2026-09-01T00:00:00Z", [session("5")]);
    const older = plan("2026-09-01T00:00:00.000+00:00", [
      session("5", { done: true, doneDate: "2026-10-01" }),
    ]);
    const r = mergeHifzPlan(newer, older);
    expect(r.archived).toBeNull();
    expect(r.current.sessions[0].done).toBe(true);
  });

  it("different plans: the later-active one is current, the other archived", () => {
    const a = plan("2026-09-01T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-10" }),
    ]);
    const b = plan("2026-09-15T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-01" }),
    ]);
    const r1 = mergeHifzPlan(b, a);
    expect(r1.current).toBe(a);
    expect(r1.archived).toBe(b);
    const r2 = mergeHifzPlan(a, b);
    expect(r2.current).toBe(a);
    expect(r2.archived).toBe(b);
  });

  it("uses the latest doneDate across sessions, not the first", () => {
    const a = plan("2026-09-01T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-01" }),
      session("2", { done: true, doneDate: "2026-10-20" }),
    ]);
    const b = plan("2026-09-15T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-10" }),
    ]);
    expect(mergeHifzPlan(b, a).current).toBe(a);
  });

  it("different plans with no done session fall back to createdAt", () => {
    const a = plan("2026-09-01T00:00:00Z", [session("1")]);
    const b = plan("2026-09-15T00:00:00Z", [session("1")]);
    const r = mergeHifzPlan(a, b);
    expect(r.current).toBe(b);
    expect(r.archived).toBe(a);
  });

  it("compares createdAt as a local calendar day against date-only doneDates (UTC+3)", () => {
    // Local calendar fields as seen in UTC+3, whatever the machine's own zone.
    const shifted = (d: Date) => new Date(d.getTime() + 3 * 3600_000);
    const spies = [
      jest
        .spyOn(Date.prototype, "getFullYear")
        .mockImplementation(function (this: Date) {
          return shifted(this).getUTCFullYear();
        }),
      jest
        .spyOn(Date.prototype, "getMonth")
        .mockImplementation(function (this: Date) {
          return shifted(this).getUTCMonth();
        }),
      jest
        .spyOn(Date.prototype, "getDate")
        .mockImplementation(function (this: Date) {
          return shifted(this).getUTCDate();
        }),
    ];
    try {
      const old = plan("2026-09-01T00:00:00Z", [
        session("1", { done: true, doneDate: "2026-11-02" }),
      ]);
      // 21:30Z on 11-01 is 00:30 on 11-02 local: same day as old's last activity.
      const fresh = plan("2026-11-01T21:30:00Z", [session("1")]);
      const r = mergeHifzPlan(fresh, old);
      expect(r.current).toBe(fresh);
      expect(r.archived).toBe(old);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it("only keeps doneDate when the merged session is done", () => {
    const newer = plan(created, [session("5", { doneDate: "2026-10-05" })]);
    const older = plan(created, [session("5", { doneDate: "2026-10-02" })]);
    expect(mergeHifzPlan(newer, older).current.sessions[0].doneDate).toBeUndefined();
  });

  it("different plans with equal activity keep newer as current", () => {
    const newer = plan("2026-09-01T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-01" }),
    ]);
    const older = plan("2026-09-02T00:00:00Z", [
      session("1", { done: true, doneDate: "2026-10-01" }),
    ]);
    const r = mergeHifzPlan(newer, older);
    expect(r.current).toBe(newer);
    expect(r.archived).toBe(older);
  });
});

describe("mergeVersioned (edge cases)", () => {
  it("an unparseable editedAt always loses, in both directions", () => {
    const bad = v("bad", "not-a-date");
    const good = v("good", "2020-01-01T00:00:00Z");
    expect(mergeVersioned("items", bad, good).winner).toBe(good);
    expect(mergeVersioned("items", good, bad).winner).toBe(good);
  });

  it("days: unions array values even from a tombstone, both-deleted yields a tombstone", () => {
    const r = mergeVersioned(
      "days",
      v(["2026-10-01"], "2026-10-01T00:00:00Z", true),
      v(["2026-10-02"], "2026-10-02T00:00:00Z"),
    );
    expect(r.winner.value).toEqual(["2026-10-01", "2026-10-02"]);
    const both = mergeVersioned(
      "days",
      v(null, "2026-10-01T00:00:00Z", true),
      v(null, "2026-10-02T00:00:00Z", true),
    );
    expect(both.winner).toEqual({ value: null, editedAt: "2026-10-02T00:00:00Z", deleted: true });
    expect(both.pushLocal).toBe(false);
    expect(both.applyRemote).toBe(false);
  });

  it("days: a remote-only tombstone with a null value stays a tombstone", () => {
    const r = mergeVersioned("days", undefined, v(null, "2026-10-02T00:00:00Z", true));
    expect(r.winner.deleted).toBe(true);
    expect(r.winner.value).toBeNull();
    expect(r.applyRemote).toBe(false);
    expect(r.pushLocal).toBe(false);
  });

  it("throws for kinds that have their own merge function", () => {
    const x = v("x", "2026-10-01T00:00:00Z");
    expect(() => mergeVersioned("hifzPlan", x, x)).toThrow();
    expect(() => mergeVersioned("freezePool", x, x)).toThrow();
  });
});

describe("mergeFreezePool", () => {
  it("is order independent", () => {
    const a = { count: 1, earnedOn: { a: 1 }, spentOn: ["z", "x"] };
    const b = { count: 2, earnedOn: { b: 2 }, spentOn: ["y", "x"] };
    expect(stableStringify(mergeFreezePool(a, b))).toBe(stableStringify(mergeFreezePool(b, a)));
    expect(mergeFreezePool(a, b).spentOn).toEqual(["x", "y", "z"]);
  });

  it("sanitizes malformed input without throwing and never mints freezes", () => {
    const good = { count: 2, earnedOn: { a: 1 }, spentOn: ["x"] };
    const r = mergeFreezePool(good, {} as never);
    expect(r).toEqual({ count: 0, earnedOn: { a: 1 }, spentOn: ["x"] });
    const junk = mergeFreezePool(good, {
      count: NaN,
      earnedOn: { a: Infinity, b: "q", c: 3 },
      spentOn: ["y", 5, null],
    } as never);
    expect(junk).toEqual({ count: 0, earnedOn: { a: 1, c: 3 }, spentOn: ["x", "y"] });
    expect(mergeFreezePool({ count: 99, earnedOn: {}, spentOn: [] }, { count: 99, earnedOn: {}, spentOn: [] }).count).toBe(2);
    expect(mergeFreezePool({ count: -4, earnedOn: {}, spentOn: [] }, good).count).toBe(0);
  });

  it("takes max earnedOn per day, unions spentOn, and the lower count", () => {
    expect(
      mergeFreezePool(
        { count: 2, earnedOn: { a: 1 }, spentOn: ["x"] },
        { count: 3, earnedOn: { a: 2, b: 1 }, spentOn: ["y"] },
      ),
    ).toEqual({ count: 2, earnedOn: { a: 2, b: 1 }, spentOn: ["x", "y"] });
  });

  it("de-duplicates spentOn and never mints freezes", () => {
    const r = mergeFreezePool(
      { count: 0, earnedOn: {}, spentOn: ["x", "y"] },
      { count: 2, earnedOn: {}, spentOn: ["y", "z"] },
    );
    expect(r.count).toBe(0);
    expect(r.spentOn).toEqual(["x", "y", "z"]);
  });
});
