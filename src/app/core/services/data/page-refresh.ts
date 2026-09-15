/**
 * When a cached page must be re-fetched from /verses/by_page/.
 *
 * The `pages` store holds word-level Uthmani text, which Content Sync does not
 * carry (QF, 2026-09-14 — docs/licensing-decisions.md §1a). Keeping it offline
 * is permitted on the condition that it is refreshed at least every 7 days, so
 * getPage() cannot simply serve the store forever.
 *
 * Offline is the deliberate exception: §1 allows cached script to stay
 * readable with no connectivity, so a stale page is still shown. The refresh
 * happens the next time the device can reach the network.
 */

import { isStale } from "../sync/cache-freshness";

export interface PageCacheState {
  /** Epoch ms of the last successful fetch; undefined for pre-timestamp rows. */
  fetchedAt?: number | null;
  /** Whether the app currently believes it has a network. */
  online: boolean;
}

export function shouldRefetchPage(
  state: PageCacheState,
  now: number = Date.now(),
): boolean {
  if (!state.online) return false;
  return isStale(state.fetchedAt, now);
}
