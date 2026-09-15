/**
 * Streaming the records array out of a large snapshot body.
 *
 * The mushafs:19 snapshot is ~1.1 MB on the wire (brotli) but 22.1 MB of
 * JSON once decompressed, holding 84,270 objects. `await res.json()` keeps
 * the whole decoded string AND the whole object graph live at once, to
 * produce rows that are only ~2.5 MB. On a 1–2 GB device that peak is where
 * an OOM kills the WebView process — and an OOM is a process kill, not a
 * catchable error, so it cannot be handled after the fact.
 *
 * This parser walks the body as it arrives and yields records in batches, so
 * the full decoded string is never resident.
 */

// jsdom ships none of the streaming primitives the browser has. Pull the real
// Node implementations in rather than hand-rolling fakes, so these tests
// exercise the same decode/chunk behaviour a WebView would.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from "util";
import { ReadableStream as NodeReadableStream } from "stream/web";

const g = global as unknown as Record<string, unknown>;
if (typeof g.TextEncoder === "undefined") g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === "undefined") g.TextDecoder = NodeTextDecoder;
if (typeof g.ReadableStream === "undefined") g.ReadableStream = NodeReadableStream;

import { streamRecords } from "../stream-records";

/**
 * A Response whose body streams `chunks` in order, as the network would.
 *
 * Built by hand rather than with `new Response(stream)`: jsdom's Response
 * does not accept a stream body and stringifies it instead. Only `body`
 * (with getReader) and `json()` are used by the parser, so this stands in
 * faithfully for the parts under test.
 */
function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const reader = {
    read: async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined },
  };
  return {
    body: { getReader: () => reader },
    json: async () => JSON.parse(chunks.join("")),
  } as unknown as Response;
}

async function collect(res: Response, batchSize = 2) {
  const out: unknown[][] = [];
  let sequence: number | undefined;
  for await (const batch of streamRecords(res, batchSize)) {
    if (batch.syncSequence !== undefined) sequence = batch.syncSequence;
    if (batch.records.length) out.push(batch.records);
  }
  return { batches: out, sequence };
}

const BODY =
  '{"resource_group":"mushafs","resource_id":19,"sync_sequence":1399,' +
  '"records":[{"id":1,"text":"a"},{"id":2,"text":"b"},{"id":3,"text":"c"}]}';

describe("streamRecords", () => {
  it("yields every record from a whole-body chunk", async () => {
    const { batches } = await collect(streamingResponse([BODY]));
    expect(batches.flat()).toEqual([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
      { id: 3, text: "c" },
    ]);
  });

  it("yields the same records when the body is split mid-object", async () => {
    // The real failure mode: network chunks land anywhere, including inside
    // a string or between a key and its value.
    const mid = Math.floor(BODY.length / 2);
    const { batches } = await collect(
      streamingResponse([BODY.slice(0, mid), BODY.slice(mid)]),
    );
    expect(batches.flat()).toHaveLength(3);
    expect(batches.flat()[2]).toEqual({ id: 3, text: "c" });
  });

  it("survives being split into single characters", async () => {
    const { batches } = await collect(streamingResponse(BODY.split("")));
    expect(batches.flat()).toHaveLength(3);
  });

  it("batches records rather than yielding one at a time", async () => {
    const { batches } = await collect(streamingResponse([BODY]), 2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it("reports sync_sequence even though it precedes the records", async () => {
    const { sequence } = await collect(streamingResponse([BODY]));
    expect(sequence).toBe(1399);
  });

  it("reports sync_sequence when it comes after the records array", async () => {
    const tail =
      '{"records":[{"id":1}],"sync_sequence":7}';
    const { sequence, batches } = await collect(streamingResponse([tail]));
    expect(batches.flat()).toHaveLength(1);
    expect(sequence).toBe(7);
  });

  it("handles strings containing braces and escaped quotes", async () => {
    // Arabic glyph payloads are plain, but a naive brace-counter would still
    // be broken by any string holding { } or \" — worth not being naive.
    const tricky =
      '{"sync_sequence":1,"records":[{"t":"a{b}c"},{"t":"say \\"hi\\""},{"t":"back\\\\slash"}]}';
    const { batches } = await collect(streamingResponse([tricky]));
    expect(batches.flat()).toEqual([
      { t: "a{b}c" },
      { t: 'say "hi"' },
      { t: "back\\slash" },
    ]);
  });

  it("yields nothing for an empty records array", async () => {
    const { batches } = await collect(
      streamingResponse(['{"sync_sequence":3,"records":[]}']),
    );
    expect(batches).toEqual([]);
  });

  it("rejects a body with no records array rather than silently yielding none", async () => {
    // Silently returning zero records would mark the resource bootstrapped
    // while holding nothing — the exact failure the engine's recovery pass
    // exists to catch.
    await expect(
      collect(streamingResponse(['{"error":"nope"}'])),
    ).rejects.toThrow(/records/i);
  });

  it("rejects when the body ends mid-array", async () => {
    await expect(
      collect(streamingResponse(['{"records":[{"id":1},{"id":'])),
    ).rejects.toThrow();
  });
});
