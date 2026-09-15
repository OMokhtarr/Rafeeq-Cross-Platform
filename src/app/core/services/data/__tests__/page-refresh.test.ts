/**
 * Discharging the refresh duty for cached /verses/by_page/ word text.
 *
 * getPage() serves the `pages` store before it goes to the network, with no
 * age check — so without this a page fetched once was served forever. QF's
 * 2026-09-14 answer requires a re-fetch at least every 7 days for this data
 * (docs/licensing-decisions.md §1a).
 */

import { shouldRefetchPage } from "../page-refresh";
import { REFRESH_INTERVAL_MS } from "../../sync/cache-freshness";

const now = 1_700_000_000_000;

describe("shouldRefetchPage", () => {
  it("serves a recently fetched page from cache", () => {
    expect(
      shouldRefetchPage({ fetchedAt: now - 1000, online: true }, now),
    ).toBe(false);
  });

  it("re-fetches a page past the refresh interval", () => {
    expect(
      shouldRefetchPage(
        { fetchedAt: now - REFRESH_INTERVAL_MS - 1, online: true },
        now,
      ),
    ).toBe(true);
  });

  it("re-fetches a page cached before timestamps existed", () => {
    expect(shouldRefetchPage({ fetchedAt: undefined, online: true }, now)).toBe(
      true,
    );
  });

  it("serves stale content while offline rather than withholding it", () => {
    // The point of the permission: cached script stays readable with no
    // connectivity. Staleness means "refresh when able", never "hide it".
    expect(
      shouldRefetchPage(
        { fetchedAt: now - 30 * 24 * 60 * 60 * 1000, online: false },
        now,
      ),
    ).toBe(false);
  });
});
