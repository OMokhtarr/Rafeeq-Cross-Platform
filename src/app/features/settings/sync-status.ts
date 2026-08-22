/**
 * Sync freshness helpers.
 *
 * Kept out of Settings.tsx so they can be unit-tested: importing that
 * component pulls in @ionic/react, whose ESM build Jest cannot transform in
 * this project.
 */

/**
 * The QF Developer Terms require retained content to be re-synced at least
 * every 7 days. Past that the cached content is genuinely overdue, which is
 * worth telling the user about — a bare date cannot distinguish "synced
 * Tuesday" from "three weeks stale".
 */
export const SYNC_OVERDUE_MS = 7 * 24 * 60 * 60 * 1000;

export function isSyncOverdue(lastSyncedAt: number | null): boolean {
  if (lastSyncedAt === null) return false; // "Never" already says enough.
  return Date.now() - lastSyncedAt > SYNC_OVERDUE_MS;
}

/** Whole days elapsed, rendered in the active language. */
export function relativeDays(
  ts: number,
  strings: {
    syncToday: string;
    syncYesterday: string;
    syncDaysAgo: (n: number) => string;
  },
): string {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return strings.syncToday;
  if (days === 1) return strings.syncYesterday;
  return strings.syncDaysAgo(days);
}
