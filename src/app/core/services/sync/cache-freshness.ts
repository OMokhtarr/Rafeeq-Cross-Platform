/**
 * Freshness policy for the QF content that Content Sync does NOT carry.
 *
 * Content Sync keeps registered resources current, which covers tafsirs,
 * recitations and — since mushafs:19 — the page layout. Two things sit outside
 * it, confirmed by QF on 2026-09-14 (docs/licensing-decisions.md §1a):
 *
 *   - the per-page COLRv1 V4 fonts, cached by font.loader.ts from the QF CDN
 *   - word-level Uthmani text from /verses/by_page/, cached in the `pages` store
 *
 * QF's answer allows both to stay cached for offline reading under the express
 * permission of 2026-08-21, on the condition that they are re-fetched at least
 * every 7 days, ideally on the app's existing 24 h cadence. The sync engine
 * will not do this for them, so this policy exists to make it happen.
 *
 * DELIBERATELY NOT AN EXPIRY. Nothing here deletes content or withholds it
 * from a reader who is offline: §1 explicitly allows cached script to remain
 * readable without connectivity. "Stale" means "re-fetch when you next can",
 * not "stop showing it".
 */

/**
 * Re-fetch anything older than this. Matches SYNC_INTERVAL_MS so the refresh
 * rides the sync tick the app already runs.
 */
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The obligation itself: 7 days, straight from the Developer Terms and QF's
 * answer. REFRESH_INTERVAL_MS leaves six missed windows of headroom beneath
 * it, the same slack the sync engine allows.
 */
export const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether a cached entry is due a re-fetch.
 *
 * A missing timestamp counts as stale: everything cached before this shipped
 * has none, and those entries are exactly the ones that have never been
 * refreshed. A future timestamp also counts as stale — a device clock that
 * moved backwards would otherwise pin an entry as fresh forever.
 */
export function isStale(
  fetchedAt: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return true;
  if (fetchedAt > now) return true;
  return now - fetchedAt > REFRESH_INTERVAL_MS;
}
