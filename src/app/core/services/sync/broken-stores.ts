/**
 * Collections whose local store was found unreadable, until they have merged again.
 *
 * Apps read a broken store as empty and the next write replaces it, so by the
 * time sync looks the store reads fine but is missing everything: a first merge
 * (which deletes nothing) is the only safe way back. Whoever sees the damage
 * marks the collection here; sync treats marked collections as not merged and
 * clears the mark once one has merged.
 *
 * Dependency-free on purpose: storage loaders import it, so it imports nothing.
 * Never throws. The key belongs to no collection, so writes to it are not stamped.
 */

const BROKEN_KEY = "rafiq_sync_broken_v1";

/** Ids of the marked collections. */
export function brokenStores(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROKEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(BROKEN_KEY);
    else localStorage.setItem(BROKEN_KEY, JSON.stringify(ids));
  } catch {
    // Storage full: the mark is lost, which is no worse than before it existed.
  }
}

export function markStoreBroken(collectionId: string): void {
  const ids = brokenStores();
  if (!ids.includes(collectionId)) save([...ids, collectionId]);
}

export function clearBroken(collectionIds: string[]): void {
  const ids = brokenStores();
  const left = ids.filter((id) => !collectionIds.includes(id));
  if (left.length !== ids.length) save(left);
}
