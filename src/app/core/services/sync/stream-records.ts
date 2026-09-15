/**
 * Reading a large snapshot without holding it all in memory.
 *
 * The mushafs:19 snapshot is ~1.1 MB on the wire (the API serves brotli) but
 * 22.1 MB of JSON once decoded, carrying 84,270 objects — to produce rows
 * that are only ~2.5 MB. `await res.json()` holds the decoded string AND the
 * whole object graph live at the same time, and on a 1–2 GB Android device
 * that peak is where the WebView is killed. An OOM is a process kill, not a
 * catchable exception, so it cannot be recovered from after the fact; the
 * only fix is not to build the peak.
 *
 * This walks the body as it arrives and yields records in batches, so the
 * caller can map and discard them incrementally. Memory stays proportional to
 * one batch, not to the snapshot.
 *
 * WHY HAND-WRITTEN. It parses exactly one shape — a top-level object with a
 * `records` array — by tracking string/escape/depth state and calling
 * JSON.parse on each complete element. That is enough for this endpoint and
 * avoids adding a streaming-JSON dependency for one call site.
 *
 * ReadableStream and TextDecoder are both far below the app's WebView 79
 * floor (see docs/webview-compat-audit.md).
 */

export interface RecordBatch {
  records: unknown[];
  /** Present on the batch where the value was seen; may precede or follow the array. */
  syncSequence?: number;
}

const RECORDS_KEY = '"records"';

/**
 * Yield the snapshot's `records` in batches of at most `batchSize`.
 *
 * Throws if the body contains no `records` array or ends mid-array — both
 * mean the snapshot is unusable, and yielding zero records instead would
 * leave the resource marked bootstrapped while holding nothing.
 */
export async function* streamRecords(
  res: Response,
  batchSize = 2000,
): AsyncGenerator<RecordBatch> {
  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body (a mock, or a very old engine): fall back to the
    // whole-body parse. Correctness first; the memory win is best-effort.
    const body = (await res.json()) as {
      records?: unknown[];
      sync_sequence?: number;
    };
    if (!Array.isArray(body?.records)) {
      throw new Error("snapshot has no records array");
    }
    for (let i = 0; i < body.records.length; i += batchSize) {
      yield {
        records: body.records.slice(i, i + batchSize),
        syncSequence: i === 0 ? body.sync_sequence : undefined,
      };
    }
    if (body.records.length === 0) {
      yield { records: [], syncSequence: body.sync_sequence };
    }
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";
  let inArray = false;
  let done = false;
  let batch: unknown[] = [];
  let syncSequence: number | undefined;
  /** Text seen before the array opened, plus everything after it closed. */
  let outside = "";

  const readChunk = async (): Promise<boolean> => {
    const { done: finished, value } = await reader.read();
    if (finished) {
      buf += decoder.decode();
      return false;
    }
    buf += decoder.decode(value, { stream: true });
    return true;
  };

  let more = true;
  while (more || buf.length > 0) {
    if (!inArray) {
      const at = buf.indexOf(RECORDS_KEY);
      if (at === -1) {
        // Keep a tail long enough that the key can't be split across reads.
        outside += buf.slice(0, Math.max(0, buf.length - RECORDS_KEY.length));
        buf = buf.slice(Math.max(0, buf.length - RECORDS_KEY.length));
        if (!more) break;
        more = await readChunk();
        continue;
      }
      const open = buf.indexOf("[", at);
      if (open === -1) {
        if (!more) break;
        more = await readChunk();
        continue;
      }
      outside += buf.slice(0, at);
      buf = buf.slice(open + 1);
      inArray = true;
    }

    const consumed = takeElements(buf, batch, batchSize);
    buf = consumed.rest;

    if (batch.length >= batchSize) {
      yield { records: batch, syncSequence };
      syncSequence = undefined;
      batch = [];
    }

    if (consumed.closed) {
      done = true;
      outside += buf;
      buf = "";
      break;
    }

    if (!more) break;
    more = await readChunk();
  }

  // Drain anything still buffered after the stream ended.
  while (!done && buf.length > 0) {
    const consumed = takeElements(buf, batch, Number.MAX_SAFE_INTEGER);
    buf = consumed.rest;
    if (consumed.closed) {
      done = true;
      outside += buf;
      break;
    }
    break;
  }

  if (!inArray) throw new Error("snapshot has no records array");
  if (!done) throw new Error("snapshot body ended inside the records array");

  const seq = readSyncSequence(outside);
  if (seq !== undefined) syncSequence = seq;

  if (batch.length > 0 || syncSequence !== undefined) {
    yield { records: batch, syncSequence };
  }
}

/**
 * Pull whole top-level elements off the front of `buf` into `out`.
 *
 * Tracks string and escape state so a `{`, `}` or `"` inside a string value
 * cannot be mistaken for structure.
 */
function takeElements(
  buf: string,
  out: unknown[],
  limit: number,
): { rest: string; closed: boolean } {
  let i = 0;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  while (i < buf.length) {
    const ch = buf[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      i++;
      continue;
    }

    if (ch === '"') {
      if (depth === 0 && start === -1) start = i;
      inString = true;
      i++;
      continue;
    }

    if (ch === "{" || ch === "[") {
      if (depth === 0) start = i;
      depth++;
      i++;
      continue;
    }

    if (ch === "}" || ch === "]") {
      if (depth === 0) {
        // The array's own closing bracket.
        return { rest: buf.slice(i + 1), closed: true };
      }
      depth--;
      i++;
      if (depth === 0 && start !== -1) {
        out.push(JSON.parse(buf.slice(start, i)));
        start = -1;
        if (out.length >= limit) return { rest: buf.slice(i), closed: false };
      }
      continue;
    }

    if (depth === 0 && (ch === "," || ch <= " ")) {
      if (start !== -1) {
        // A bare scalar element (number, true, null, or a string) ended here.
        out.push(JSON.parse(buf.slice(start, i)));
        start = -1;
        if (out.length >= limit) {
          return { rest: buf.slice(i + 1), closed: false };
        }
      }
      i++;
      continue;
    }

    if (depth === 0 && start === -1) start = i;
    i++;
  }

  // Nothing more can be completed from what we hold; keep the partial element.
  return { rest: start === -1 ? "" : buf.slice(start), closed: false };
}

/** `sync_sequence` from the text outside the records array, if present. */
function readSyncSequence(text: string): number | undefined {
  const m = /"sync_sequence"\s*:\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : undefined;
}
