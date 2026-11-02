import { TextEncoder as NodeTextEncoder } from "util";
import { pullSince, push, SyncError, SyncOfflineError } from "../sync-remote";
import type { SyncRow } from "../types";

const mockGetSupabase = jest.fn();
jest.mock("../../auth/supabase.client", () => ({
  getSupabase: () => mockGetSupabase(),
}));

const mockGt = jest.fn();
const mockLimit = jest.fn();
const mockRpc = jest.fn();

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

  it("pages until a short page, advancing by the exact last server_at string", async () => {
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
    expect(mockGt).toHaveBeenCalledTimes(1);
    expect(mockGt).toHaveBeenCalledWith("server_at", lastStamp);
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

  it("skips values over 256 KB with a warning and does not send them", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: [], error: null });
    const big = localRow("huge", "x".repeat(262145));
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
    // 100k euro signs are 3 bytes each: 300k bytes, but only 100k characters.
    await push([localRow("wide", "\u20ac".repeat(100000))]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

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

  it("classifies a PostgREST error as SyncError", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "too many items", code: "22023" },
    });
    await expect(push([localRow("a")])).rejects.toBeInstanceOf(SyncError);
  });
});
