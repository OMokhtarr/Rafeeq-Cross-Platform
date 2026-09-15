/**
 * The refresh duty for the data Content Sync does NOT carry.
 *
 * QF's 2026-09-14 answer (docs/licensing-decisions.md §1a) left two things
 * outside Content Sync — the per-page COLRv1 fonts and the word-level Uthmani
 * text from /verses/by_page/ — and attached a condition to keeping them
 * cached: re-fetch at least every 7 days, ideally on the existing 24 h tick.
 *
 * The sync engine refreshes REGISTERED RESOURCES only, so it does nothing for
 * either of these. This module is the policy that discharges that obligation.
 */

import {
  isStale,
  REFRESH_INTERVAL_MS,
  MAX_CACHE_AGE_MS,
} from "../cache-freshness";

const DAY = 24 * 60 * 60 * 1000;

describe("cache freshness policy", () => {
  it("refreshes on the 24 h cadence QF asked for", () => {
    expect(REFRESH_INTERVAL_MS).toBe(DAY);
  });

  it("never lets the hard limit exceed the 7 days QF requires", () => {
    expect(MAX_CACHE_AGE_MS).toBeLessThanOrEqual(7 * DAY);
  });

  it("leaves the refresh interval with headroom under the hard limit", () => {
    // Six missed windows of slack, matching SYNC_INTERVAL_MS's reasoning.
    expect(REFRESH_INTERVAL_MS).toBeLessThan(MAX_CACHE_AGE_MS);
  });

  it("treats a freshly fetched entry as current", () => {
    expect(isStale(Date.now(), Date.now())).toBe(false);
  });

  it("treats an entry older than the refresh interval as stale", () => {
    const now = Date.now();
    expect(isStale(now - REFRESH_INTERVAL_MS - 1, now)).toBe(true);
  });

  it("treats an entry with no recorded fetch time as stale", () => {
    // Everything cached before this shipped has no timestamp. It must be
    // refreshed rather than trusted forever.
    expect(isStale(undefined, Date.now())).toBe(true);
    expect(isStale(null, Date.now())).toBe(true);
  });

  it("treats a timestamp from the future as stale", () => {
    // A device clock moved backwards would otherwise pin an entry as fresh
    // indefinitely.
    expect(isStale(Date.now() + 10 * DAY, Date.now())).toBe(true);
  });
});
