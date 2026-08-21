import "fake-indexeddb/auto";

// Polyfill structuredClone for fake-indexeddb in Jest
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import {
  putRows,
  deleteRow,
  readResourceRows,
  replaceResourceRows,
  purgeResource,
  countResourceRows,
} from "./sync-store.service";
import { SyncRow } from "./content-sync.types";
import { idb } from "../storage/idb.service";

function row(resourceId: number, key: string, text: string): SyncRow {
  return {
    id: `tafsirs:${resourceId}:tafsir:${key}`,
    resourceGroup: "tafsirs",
    resourceId,
    recordType: "tafsir",
    recordKey: key,
    data: { text },
    sequence: 1,
  };
}

beforeEach(async () => {
  await idb.clear("content_sync");
});

describe("sync store", () => {
  it("writes and reads back a resource's rows", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(2);
  });

  it("isolates resources from each other", async () => {
    await putRows([row(169, "1:1", "a"), row(15, "1:1", "b")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("a");
  });

  it("upserts a row by composite key rather than duplicating", async () => {
    await putRows([row(169, "1:1", "old")]);
    await putRows([row(169, "1:1", "new")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("new");
  });

  it("deletes a single row", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await deleteRow("tafsirs", 169, "tafsir", "1:1");
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows.map((r) => r.recordKey)).toEqual(["1:2"]);
  });

  it("replaceResourceRows drops rows absent from the new set", async () => {
    // A shrinking resource must not leave orphans — this is what
    // RESOURCE_INVALIDATE's "replace all local rows" means.
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await replaceResourceRows("tafsirs", 169, [row(169, "1:1", "fresh")]);
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    expect((rows[0].data as { text: string }).text).toBe("fresh");
  });

  it("replaceResourceRows leaves other resources untouched", async () => {
    await putRows([row(15, "1:1", "keep")]);
    await replaceResourceRows("tafsirs", 169, [row(169, "1:1", "new")]);
    expect(await countResourceRows("tafsirs", 15)).toBe(1);
  });

  it("purges a resource entirely", async () => {
    await putRows([row(169, "1:1", "a"), row(169, "1:2", "b")]);
    await purgeResource("tafsirs", 169);
    expect(await countResourceRows("tafsirs", 169)).toBe(0);
  });
});
