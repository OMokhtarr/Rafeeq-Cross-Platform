import "fake-indexeddb/auto";

// Polyfill structuredClone for fake-indexeddb in Jest
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import { recitationRowsFrom, evictRecitation } from "../recitations.adapter";
import { idb } from "../../../storage/idb.service";

jest.mock("../../../audio/audio-file-cache.service", () => ({
  __esModule: true,
  usesFileCache: () => false,
}));

beforeEach(async () => {
  await idb.clear("content_sync");
  await idb.clear("audio");
});

describe("recitationRowsFrom", () => {
  it("maps one row per verse, keyed by verse_key", () => {
    const rows = recitationRowsFrom(
      [
        { recitation_id: 7, verse_key: "1:1", url: "Alafasy/mp3/001001.mp3", duration: 6 },
        { recitation_id: 7, verse_key: "1:2", url: "Alafasy/mp3/001002.mp3", duration: 4 },
      ],
      7,
      3,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("recitations:7:audio_file:1:1");
    expect(rows[0].recordType).toBe("audio_file");
    expect((rows[0].data as { url: string }).url).toBe("Alafasy/mp3/001001.mp3");
  });

  it("skips records with no verse key", () => {
    expect(recitationRowsFrom([{ url: "x.mp3" }], 7, 1)).toHaveLength(0);
  });
});

describe("evictRecitation", () => {
  it("deletes only the named reciter's cached blobs", async () => {
    // Audio blob keys are `${reciter}:${sura}:${aya}` — see audio-cache.service.
    await idb.put("audio", { id: "7:1:1", blob: null, mime: "audio/mpeg" });
    await idb.put("audio", { id: "7:1:2", blob: null, mime: "audio/mpeg" });
    await idb.put("audio", { id: "4:1:1", blob: null, mime: "audio/mpeg" });

    await evictRecitation(7);

    const keys = await idb.getAllKeys("audio");
    expect(keys).toEqual(["4:1:1"]);
  });
});
