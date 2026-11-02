// Pure merge rules for Pro sync: given this device's copy and the cloud's copy
// of one item, decide which side wins. No I/O, no storage.

import type { HifzPlan, PlanSession } from "../../../features/hifz/hifz.service";
import { MAX_FREEZES } from "../storage/streak-freeze.service";
import type { FreezePool } from "../storage/streak-freeze.service";
import { localDateStr } from "../../utils/local-date.util";
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

/**
 * Instants, not strings: Postgres emits microseconds and `+00:00`, JS emits `Z`.
 * An unparseable value maps to -Infinity so a corrupt side always loses.
 */
function instant(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
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

function unionDays(...lists: unknown[][]): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const item of lists.flat()) byKey.set(stableStringify(item), item);
  return [...byKey.keys()].sort().map((k) => byKey.get(k));
}

function mergeDays(local: Versioned | undefined, remote: Versioned | undefined): VersionedMerge {
  // Days are only ever added to, never removed: a tombstone contributes its
  // days, and the result is a tombstone only when no side is live.
  const tombstone = (editedAt: string): Versioned => ({ value: null, editedAt, deleted: true });
  if (!local && !remote) throw new Error("mergeVersioned: both sides are missing");
  if (!local || !remote) {
    const only = (local ?? remote) as Versioned;
    const winner = only.deleted ? tombstone(only.editedAt) : only;
    const live = !only.deleted;
    return { winner, pushLocal: live && !!local, applyRemote: live && !!remote };
  }

  const editedAt = instant(local.editedAt) > instant(remote.editedAt) ? local.editedAt : remote.editedAt;
  const sides = [local, remote];
  const liveSides = sides.filter((x) => !x.deleted);
  if (liveSides.length === 0) {
    return { winner: tombstone(editedAt), pushLocal: false, applyRemote: false };
  }
  const value = liveSides.every((x) => Array.isArray(x.value))
    ? unionDays(...sides.map((x) => (Array.isArray(x.value) ? x.value : [])))
    : true;
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
  if (kind === "hifzPlan" || kind === "freezePool") {
    throw new Error(`mergeVersioned: "${kind}" has its own merge function`);
  }
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

/** Day-granular, local-time key: `doneDate` is a date-only local string, `createdAt` an instant. */
function dayKey(plan: HifzPlan): string {
  let latest = "";
  for (const s of plan.sessions) {
    if (s.doneDate && s.doneDate > latest) latest = s.doneDate;
  }
  if (latest) return latest;
  const created = new Date(plan.createdAt);
  return Number.isNaN(created.getTime()) ? "" : localDateStr(created);
}

function earliestDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b || undefined;
  if (!b) return a;
  return instant(b) < instant(a) ? b : a;
}

function mergeSession(newer: PlanSession, older: PlanSession | undefined): PlanSession {
  if (!older) return newer;
  const done = newer.done || older.done;
  const { doneDate: _drop, ...rest } = newer;
  const merged: PlanSession = { ...rest, done };
  const date = done ? earliestDate(newer.doneDate, older.doneDate) : undefined;
  if (date) merged.doneDate = date;
  return merged;
}

/**
 * `newer` is the copy with the greater `editedAt` (the caller decides).
 * The same plan on both devices keeps every completed session; two different
 * plans keep the one with the latest activity and archive the other.
 * Call only when both sides changed since the last sync; there is no common
 * ancestor, so a one-sided change must be taken as is instead.
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
  return dayKey(older) > dayKey(newer)
    ? { current: older, archived: newer }
    : { current: newer, archived: older };
}

// ─── Streak freezes ──────────────────────────────────────────────────────────

function cleanPool(pool: Partial<FreezePool> | undefined): FreezePool {
  const count = Number.isFinite(pool?.count) ? Math.floor(pool?.count as number) : 0;
  const earnedOn: Record<string, number> = {};
  for (const [day, n] of Object.entries(pool?.earnedOn ?? {})) {
    if (typeof n === "number" && Number.isFinite(n)) earnedOn[day] = n;
  }
  const spentOn = Array.isArray(pool?.spentOn)
    ? pool.spentOn.filter((d): d is string => typeof d === "string")
    : [];
  return { count: Math.max(0, Math.min(MAX_FREEZES, count)), earnedOn, spentOn };
}

/**
 * Malformed input is sanitized first (a missing count is 0, never a full
 * pool). `count` takes the lower of the two so a merge never mints freezes. The
 * cost: a freeze earned concurrently on both devices can be lost, which is
 * acceptable for a safety net.
 * Call only when both sides changed since the last sync; there is no common
 * ancestor, so a one-sided change must be taken as is instead.
 */
export function mergeFreezePool(localPool: FreezePool, remotePool: FreezePool): FreezePool {
  const local = cleanPool(localPool);
  const remote = cleanPool(remotePool);
  const earnedOn: Record<string, number> = { ...local.earnedOn };
  for (const [day, n] of Object.entries(remote.earnedOn)) {
    earnedOn[day] = Math.max(earnedOn[day] ?? n, n);
  }
  return {
    count: Math.min(local.count, remote.count),
    earnedOn,
    spentOn: [...new Set([...local.spentOn, ...remote.spentOn])].sort(),
  };
}
