import { TextEncoder as NodeTextEncoder } from "util";
import { pullSince, push, SyncError, SyncOfflineError } from "../sync-remote";
import type { SyncRow } from "../types";

const mockGetSupabase = jest.fn();
jest.mock("../../auth/supabase.client", () => ({
  getSupabase: () => mockGetSupabase(),
}));

const mockGt = jest.fn();
const mockGte = jest.fn();
const mockLimit = jest.fn();
const mockRpc = jest.fn();

const originalTextEncoder = Object.getOwnPropertyDescriptor(globalThis, "TextEncoder");

afterEach(() => {
  if (originalTextEncoder) {
    Object.defineProperty(globalThis, "TextEncoder", originalTextEncoder);
  } else {
    delete (globalThis as { TextEncoder?: unknown }).TextEncoder;
  }
});

beforeEach(() => {
  // jsdom has no TextEncoder; real webviews do.
  Object.defineProperty(globalThis, "TextEncoder", {
    value: NodeTextEncoder,
    configurable: true,
  });
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn(() => chain);
  chain.gt = jest.fn((...a: unknown[]) => {
    mockGt(...a);
    return chain;
  });
  chain.gte = jest.fn((...a: unknown[]) => {
    mockGte(...a);
    return chain;
  });
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn((...a: unknown[]) => mockLimit(...a));
  mockGetSupabase.mockReturnValue({
    from: jest.fn(() => chain),
    rpc: (...a: unknown[]) => mockRpc(...a),
  });
});

function dbRow(n: number, serverAt: string) {
  return {
    user_id: "u1",
    collection: "notes",
    item_key: `k${n}`,
    value: { n },
    edited_at: "2026-11-01T10:00:00.000Z",
    deleted: false,
    server_at: serverAt,
  };
}

function localRow(key: string, value: unknown = 1): SyncRow {
  return {
    collection: "notes",
    item_key: key,
    value,
    edited_at: "2026-11-01T10:00:00.000Z",
    deleted: false,
  };
}

describe("pullSince", () => {
  it("throws SyncError when Supabase is not configured", async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(pullSince(null)).rejects.toThrow(SyncError);
  });

  it("uses no gt filter for a null cursor and returns an empty result unchanged", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const out = await pullSince(null);
    expect(mockGt).not.toHaveBeenCalled();
    expect(out).toEqual({ rows: [], cursor: null });
  });

  it("returns the input cursor unchanged when nothing comes back", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const out = await pullSince("2026-11-01T09:00:00.000Z");
    expect(mockGt).toHaveBeenCalledWith("server_at", "2026-11-01T09:00:00.000Z");
    expect(out.cursor).toBe("2026-11-01T09:00:00.000Z");
  });

  it("pages until a short page, resuming with gte from the exact last server_at string", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) =>
      dbRow(i, `2026-11-01T10:00:00.${String(i).padStart(6, "0")}+00:00`)
    );
    const lastStamp = "2026-11-01T10:00:00.000499+00:00";
    const page2 = [dbRow(900, "2026-11-01T10:00:30.123456+00:00")];
    mockLimit
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const out = await pullSince(null);

    expect(mockLimit).toHaveBeenCalledTimes(2);
    expect(mockLimit).toHaveBeenCalledWith(500);
    expect(mockGt).not.toHaveBeenCalled();
    expect(mockGte).toHaveBeenCalledTimes(1);
    expect(mockGte).toHaveBeenCalledWith("server_at", lastStamp);
    expect(out.rows).toHaveLength(501);
  });

  it("maps DB rows to SyncRow, dropping user_id", async () => {
    mockLimit.mockResolvedValue({
      data: [dbRow(1, "2026-11-01T10:00:00+00:00")],
      error: null,
    });
    const out = await pullSince(null);
    expect(out.rows[0]).toEqual({
      collection: "notes",
      item_key: "k1",
      value: { n: 1 },
      edited_at: "2026-11-01T10:00:00.000Z",
      deleted: false,
      server_at: "2026-11-01T10:00:00+00:00",
    });
    expect(out.rows[0]).not.toHaveProperty("user_id");
  });

  it("returns the max server_at minus 10 seconds as the cursor", async () => {
    mockLimit.mockResolvedValue({
      data: [
        dbRow(1, "2026-11-01T10:00:05.000000+00:00"),
        dbRow(2, "2026-11-01T10:01:00.500000+00:00"),
      ],
      error: null,
    });
    const out = await pullSince(null);
    expect(out.cursor).toBe("2026-11-01T10:00:50.500Z");
  });

  it("drops rows already returned when a server_at tie spans the page boundary", async () => {
    const stamp = "2026-11-01T10:00:00.000499+00:00";
    const page1 = Array.from({ length: 500 }, (_, i) =>
      dbRow(i, i === 499 ? stamp : `2026-11-01T10:00:00.${String(i).padStart(6, "0")}+00:00`)
    );
    // Page 2 repeats the boundary row (same key and stamp) and adds a tied new one.
    const page2 = [dbRow(499, stamp), dbRow(1000, stamp)];
    mockLimit
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });
    const out = await pullSince(null);
    expect(out.rows).toHaveLength(501);
    expect(out.rows.filter((r) => r.item_key === "k499")).toHaveLength(1);
    expect(out.rows[500].item_key).toBe("k1000");
  });

  it("derives the cursor from the last row across pages", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) =>
      dbRow(i, `2026-11-01T10:00:00.${String(i).padStart(6, "0")}+00:00`)
    );
    mockLimit
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: [dbRow(900, "2026-11-01T10:05:00+00:00")], error: null });
    const out = await pullSince(null);
    expect(out.cursor).toBe("2026-11-01T10:04:50.000Z");
  });

  it("throws SyncError for an unparseable server_at", async () => {
    mockLimit.mockResolvedValue({ data: [dbRow(1, "garbage")], error: null });
    await expect(pullSince(null)).rejects.toBeInstanceOf(SyncError);
  });

  it("treats status 0 with an unrecognised message as offline", async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: "AbortError: signal timed out", code: "" },
      status: 0,
    });
    await expect(pullSince(null)).rejects.toBeInstanceOf(SyncOfflineError);
  });

  it("does not treat a TypeError from row mapping as offline", async () => {
    mockLimit.mockResolvedValue({ data: [null], error: null });
    const err = await pullSince(null).catch((e) => e);
    expect(err).not.toBeInstanceOf(SyncOfflineError);
  });

  it("classifies a fetch failure message as SyncOfflineError", async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch", code: "" },
    });
    await expect(pullSince(null)).rejects.toBeInstanceOf(SyncOfflineError);
  });

  it("classifies a thrown TypeError as SyncOfflineError", async () => {
    mockLimit.mockRejectedValue(new TypeError("Load failed"));
    await expect(pullSince(null)).rejects.toBeInstanceOf(SyncOfflineError);
  });

  it("classifies a PostgREST error as SyncError carrying the code", async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const err = await pullSince(null).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err).not.toBeInstanceOf(SyncOfflineError);
    expect(err.message).toContain("permission denied");
    expect(err.message).toContain("42501");
  });
});

describe("push", () => {
  it("chunks 450 rows into 3 rpc calls of at most 200 and returns stored rows", async () => {
    mockRpc.mockImplementation((_fn: string, args: { items: SyncRow[] }) =>
      Promise.resolve({
        data: args.items.map((r) => ({ ...dbRow(0, "2026-11-01T10:00:00+00:00"), item_key: r.item_key })),
        error: null,
      })
    );
    const rows = Array.from({ length: 450 }, (_, i) => localRow(`k${i}`));
    const out = await push(rows);
    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(mockRpc.mock.calls.map((c) => c[1].items.length)).toEqual([200, 200, 50]);
    expect(mockRpc.mock.calls[0][0]).toBe("sync_push");
    expect(out).toHaveLength(450);
    expect(out[0]).not.toHaveProperty("user_id");
  });

  it("skips values over 512 KB with a warning and does not send them", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: [], error: null });
    const big = localRow("huge", "x".repeat(524289));
    await push([big, localRow("small")]);
    const sent = mockRpc.mock.calls[0][1].items as SyncRow[];
    expect(sent.map((r) => r.item_key)).toEqual(["small"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("notes"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("huge"));
    warn.mockRestore();
  });

  it("measures size in UTF-8 bytes, not characters", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: [], error: null });
    // 200k euro signs are 3 bytes each: 600k bytes, but only 200k characters.
    await push([localRow("wide", "\u20ac".repeat(200000))]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sends exactly the five server columns", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const withExtra = { ...localRow("a"), server_at: "2026-11-01T10:00:00+00:00" };
    await push([withExtra]);
    expect(Object.keys(mockRpc.mock.calls[0][1].items[0]).sort()).toEqual(
      ["collection", "deleted", "edited_at", "item_key", "value"]
    );
  });

  it("skips rows whose collection or item_key length is out of bounds", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: [], error: null });
    await push([
      { ...localRow("x".repeat(257)) },
      { ...localRow("a"), collection: "c".repeat(65) },
      { ...localRow(""), collection: "notes" },
      { ...localRow("ok") },
    ]);
    expect((mockRpc.mock.calls[0][1].items as SyncRow[]).map((r) => r.item_key)).toEqual(["ok"]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it.each(["23514", "22001"])(
    "retries a chunk failing with %s one item at a time and skips the bad item",
    async (code) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      mockRpc.mockImplementation((_fn: string, args: { items: SyncRow[] }) => {
        const bad = args.items.some((r) => r.item_key === "bad");
        if (bad) {
          return Promise.resolve({ data: null, error: { message: "violates check", code } });
        }
        return Promise.resolve({
          data: args.items.map((r) => ({ ...dbRow(0, "2026-11-01T10:00:00+00:00"), item_key: r.item_key })),
          error: null,
        });
      });
      const out = await push([localRow("a"), localRow("bad"), localRow("b")]);
      expect(out.map((r) => r.item_key)).toEqual(["a", "b"]);
      expect(mockRpc).toHaveBeenCalledTimes(4);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("bad"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(code));
      warn.mockRestore();
    }
  );

  it("makes no rpc call for an empty list", async () => {
    expect(await push([])).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("classifies a network failure as SyncOfflineError", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "TypeError: fetch failed", code: "" },
    });
    await expect(push([localRow("a")])).rejects.toBeInstanceOf(SyncOfflineError);
  });

  it("still throws SyncError for a non-constraint error during per-item retry", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "violates check", code: "23514" } })
      .mockResolvedValueOnce({ data: null, error: { message: "boom", code: "XX000" } });
    await expect(push([localRow("a"), localRow("b")])).rejects.toBeInstanceOf(SyncError);
  });

  it("classifies a PostgREST error as SyncError", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "too many items", code: "22023" },
    });
    await expect(push([localRow("a")])).rejects.toBeInstanceOf(SyncError);
  });
});
