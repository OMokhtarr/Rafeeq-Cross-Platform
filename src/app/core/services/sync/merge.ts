// Pure merge rules for Pro sync: given this device's copy and the cloud's copy
// of one item, decide which side wins. No I/O, no storage.

import type { HifzPlan, PlanSession } from "../../../features/hifz/hifz.service";
import type { FreezePool } from "../storage/streak-freeze.service";
import type { SyncKind, Versioned } from "./types";

export interface VersionedMerge {
  winner: Versioned;
  /** The local copy won and the cloud should be updated to it. */
  pushLocal: boolean;
  /** The remote copy won and this device should adopt it. */
  applyRemote: boolean;
}

/** JSON with object keys sorted, so equal values compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

/** Instants, not strings: Postgres emits microseconds and `+00:00`, JS emits `Z`. */
function instant(iso: string): number {
  return Date.parse(iso);
}

function differs(a: Versioned | undefined, b: Versioned | undefined): boolean {
  if (!a || !b) return a !== b;
  return a.deleted !== b.deleted || stableStringify(a.value) !== stableStringify(b.value);
}

function mergeLastWriteWins(local: Versioned, remote: Versioned): VersionedMerge {
  // A delete is an edit. On a tie the remote wins: the server keeps the stored
  // row on a tie, so every device settles on the same copy.
  const localWins = instant(local.editedAt) > instant(remote.editedAt);
  const changed = differs(local, remote);
  return localWins
    ? { winner: local, pushLocal: changed, applyRemote: false }
    : { winner: remote, pushLocal: false, applyRemote: changed };
}

function unionDays(a: unknown[], b: unknown[]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const item of [...a, ...b]) byKey.set(stableStringify(item), item);
  return [...byKey.keys()].sort().map((k) => byKey.get(k));
}

function mergeDays(local: Versioned | undefined, remote: Versioned | undefined): VersionedMerge {
  // Days are only ever added to, never deleted, so a deleted flag is ignored.
  const live = (x: Versioned): Versioned => ({ ...x, deleted: false });
  if (!local && remote) {
    return { winner: live(remote), pushLocal: false, applyRemote: true };
  }
  if (local && !remote) {
    return { winner: live(local), pushLocal: true, applyRemote: false };
  }
  if (!local || !remote) throw new Error("mergeVersioned: both sides are missing");

  // A deleted side carries no days; take the other side's value.
  const localValue = local.deleted ? remote.value : local.value;
  const remoteValue = remote.deleted ? local.value : remote.value;
  const value =
    Array.isArray(localValue) && Array.isArray(remoteValue)
      ? unionDays(localValue, remoteValue)
      : true;
  const editedAt = instant(local.editedAt) > instant(remote.editedAt) ? local.editedAt : remote.editedAt;
  const winner: Versioned = { value, editedAt, deleted: false };
  return {
    winner,
    pushLocal: differs(winner, remote),
    applyRemote: differs(winner, local),
  };
}

export function mergeVersioned(
  kind: SyncKind,
  local: Versioned | undefined,
  remote: Versioned | undefined,
): VersionedMerge {
  if (!local && !remote) throw new Error("mergeVersioned: both sides are missing");
  if (kind === "days") return mergeDays(local, remote);
  if (!local && remote) return { winner: remote, pushLocal: false, applyRemote: true };
  if (local && !remote) return { winner: local, pushLocal: true, applyRemote: false };
  return mergeLastWriteWins(local as Versioned, remote as Versioned);
}

// ─── Hifz plan ───────────────────────────────────────────────────────────────

function sameInstant(a: string, b: string): boolean {
  const ta = instant(a);
  const tb = instant(b);
  return Number.isNaN(ta) || Number.isNaN(tb) ? a === b : ta === tb;
}

/** Latest session `doneDate` of a plan, or its `createdAt` when nothing is done. */
function lastActiveAt(plan: HifzPlan): number {
  let latest = NaN;
  for (const s of plan.sessions) {
    if (!s.doneDate) continue;
    const t = instant(s.doneDate);
    if (!Number.isNaN(t) && !(t <= latest)) latest = t;
  }
  return Number.isNaN(latest) ? instant(plan.createdAt) : latest;
}

function earliestDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return instant(b) < instant(a) ? b : a;
}

function mergeSession(newer: PlanSession, older: PlanSession | undefined): PlanSession {
  if (!older) return newer;
  const done = newer.done || older.done;
  const merged: PlanSession = { ...newer, done };
  const doneDate = earliestDate(newer.doneDate, older.doneDate);
  if (doneDate) merged.doneDate = doneDate;
  return merged;
}

/**
 * `newer` is the copy with the greater `editedAt` (the caller decides).
 * The same plan on both devices keeps every completed session; two different
 * plans keep the one with the latest activity and archive the other.
 */
export function mergeHifzPlan(
  newer: HifzPlan,
  older: HifzPlan,
): { current: HifzPlan; archived: HifzPlan | null } {
  if (sameInstant(newer.createdAt, older.createdAt)) {
    const olderById = new Map(older.sessions.map((s) => [s.id, s]));
    // newer's session list is authoritative: older-only sessions are dropped.
    const sessions = newer.sessions.map((s) => mergeSession(s, olderById.get(s.id)));
    return { current: { ...newer, sessions }, archived: null };
  }
  return lastActiveAt(older) > lastActiveAt(newer)
    ? { current: older, archived: newer }
    : { current: newer, archived: older };
}

// ─── Streak freezes ──────────────────────────────────────────────────────────

/**
 * `count` takes the lower of the two so a merge never mints freezes. The cost:
 * a freeze earned concurrently on both devices can be lost, which is acceptable
 * for a safety net.
 */
export function mergeFreezePool(local: FreezePool, remote: FreezePool): FreezePool {
  const earnedOn: Record<string, number> = { ...local.earnedOn };
  for (const [day, n] of Object.entries(remote.earnedOn)) {
    earnedOn[day] = Math.max(earnedOn[day] ?? n, n);
  }
  return {
    count: Math.min(local.count, remote.count),
    earnedOn,
    spentOn: [...new Set([...local.spentOn, ...remote.spentOn])],
  };
}
