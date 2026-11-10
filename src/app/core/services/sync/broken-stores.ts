/**
 * Collections whose local store was found unreadable, until they have merged again.
 *
 * Apps read a broken store as empty and the next write replaces it, so by the
 * time sync looks the store reads fine but is missing everything: a first merge
 * (which deletes nothing) is the only safe way back. Whoever sees the damage
 * marks the collection here; sync treats marked collections as not merged and
 * clears the mark once one has merged.
 *
 * Each mark keeps a sequence number, raised every time it is made, so a run
 * clears only the marks made before it started: damage seen again during a run
 * keeps its mark for the next run. A mark storage can't hold (full) is kept in
 * memory for this session.
 *
 * Dependency-free on purpose: storage loaders import it, so it imports nothing.
 * Never throws. The key belongs to no collection, so writes to it are not stamped.
 */

const BROKEN_KEY = "rafiq_sync_broken_v1";

/** collectionId -> sequence number of the latest mark. */
type Marks = Record<string, number>;

/** Marks the last save could not store. */
let unsaved: Marks = {};

function readSaved(): Marks {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BROKEN_KEY) ?? "{}");
    const marks: Marks = {};
    // Older builds saved a plain list of ids; those marks predate every run.
    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === "string") marks[id] = 0;
    } else if (parsed && typeof parsed === "object") {
      for (const [id, seq] of Object.entries(parsed)) {
        if (typeof seq === "number" && Number.isFinite(seq)) marks[id] = seq;
      }
    }
    return marks;
  } catch {
    return {};
  }
}

const readMarks = (): Marks => ({ ...readSaved(), ...unsaved });

function save(marks: Marks): void {
  try {
    if (Object.keys(marks).length === 0) localStorage.removeItem(BROKEN_KEY);
    else localStorage.setItem(BROKEN_KEY, JSON.stringify(marks));
    unsaved = {};
  } catch {
    unsaved = marks;
  }
}

const latest = (marks: Marks): number => Math.max(0, ...Object.values(marks));

/** Ids of the marked collections. */
export function brokenStores(): string[] {
  return Object.keys(readMarks());
}

/** The latest mark's sequence number: marks made after this call have a higher one. */
export function markSequence(): number {
  return latest(readMarks());
}

export function markStoreBroken(collectionId: string): void {
  const marks = readMarks();
  save({ ...marks, [collectionId]: latest(marks) + 1 });
}

/** Clears the marks of `collectionIds` up to sequence `upTo` (from markSequence); later ones stay. */
export function clearBroken(collectionIds: string[], upTo: number): void {
  const marks = readMarks();
  let changed = false;
  for (const id of collectionIds) {
    if (id in marks && marks[id] <= upTo) {
      delete marks[id];
      changed = true;
    }
  }
  if (changed) save(marks);
}
