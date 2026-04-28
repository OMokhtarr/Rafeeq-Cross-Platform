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
const DB_VERSION = 2;

export class IDBService {
  private db: IDBDatabase | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;

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
