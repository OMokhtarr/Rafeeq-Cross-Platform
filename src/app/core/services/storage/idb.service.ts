/**
 * INDEXEDDB SERVICE
 * Thin wrapper around the browser IndexedDB API. Used by quran.service.ts
 * to persist the 6,236 verse records across all platforms (web, Electron,
 * iOS WebView, Android WebView) so quran-text.json is not re-parsed on
 * every launch.
 */

const DB_NAME = "rafeeq-quran";
// v2: added `pages` (cached API responses, key=pageNumber) and `fonts`
//     (QPC V1 .ttf blobs from jsDelivr, key=pageNumber).
// v3: added `translations` (cached translation pages, key=`${editionId}:${page}`).
// v4: added `audio` (cached per-ayah audio blobs, key=`${reciter}:${sura}:${aya}`).
// v5: switched renderer from QPC V1 to QPC V4 Tajweed. The `pages` records
//     cached pre-v5 carry `codeV1` strings that will not render in V4 fonts,
//     and the `fonts` records hold V1 TTF blobs. Both stores are wiped on
//     upgrade so the next read repopulates them with V4 data.
const DB_VERSION = 5;

export class IDBService {
  private db: IDBDatabase | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = (e.target as IDBOpenDBRequest).transaction;
        const oldVersion = e.oldVersion;

        // verses store: keyed by "sura:aya" string e.g. "2:255"
        if (!db.objectStoreNames.contains("verses")) {
          db.createObjectStore("verses", { keyPath: "id" });
        }

        // meta store: small key-value flags (e.g. seeded = "1")
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }

        // pages store: cached API verse-by-page payloads.
        // record shape: { page: number, verses: Verse[] }
        if (!db.objectStoreNames.contains("pages")) {
          db.createObjectStore("pages", { keyPath: "page" });
        }

        // fonts store: cached QPC V1 .ttf bytes per page.
        // record shape: { page: number, blob: Blob }
        if (!db.objectStoreNames.contains("fonts")) {
          db.createObjectStore("fonts", { keyPath: "page" });
        }

        // translations store: cached translation payloads per (edition, page).
        // record shape: { id: `${editionId}:${page}`, edition, page, items }
        if (!db.objectStoreNames.contains("translations")) {
          db.createObjectStore("translations", { keyPath: "id" });
        }

        // audio store: cached per-ayah recitation blobs.
        // record shape: { id: `${reciter}:${sura}:${aya}`, blob: Blob, mime: string }
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", { keyPath: "id" });
        }

        // v5: switching from QPC V1 to V4 invalidates `pages` (verses now
        // carry codeV2 instead of codeV1) and `fonts` (V1 TTFs → V4 woff2).
        // Wipe both so the next read repopulates with V4 data. Only triggers
        // for existing installs; fresh installs (oldVersion === 0) skip.
        if (oldVersion > 0 && oldVersion < 5 && tx) {
          if (db.objectStoreNames.contains("pages")) {
            tx.objectStore("pages").clear();
          }
          if (db.objectStoreNames.contains("fonts")) {
            tx.objectStore("fonts").clear();
          }
        }
      };

      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async get<T>(store: string, key: string | number): Promise<T | null> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll<T>(store: string): Promise<T[]> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async count(store: string): Promise<number> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readonly");
      const req = tx.objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  async put<T>(store: string, item: T): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Bulk insert items in chunks of `chunkSize` per transaction.
   * Chunking avoids "transaction too large" errors on some browsers.
   *
   * Benchmark: ~6,236 verses ≈ 400–600 ms on mid-range hardware (one-time).
   */
  async bulkPut<T>(store: string, items: T[], chunkSize = 500): Promise<void> {
    await this.open();
    for (let i = 0; i < items.length; i += chunkSize) {
      await this._putChunk(store, items.slice(i, i + chunkSize));
    }
  }

  async delete(store: string, key: string | number): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readwrite");
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(store: string): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readwrite");
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private _putChunk<T>(store: string, chunk: T[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      chunk.forEach((item) => os.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Singleton — import this wherever IndexedDB access is needed
export const idb = new IDBService();
