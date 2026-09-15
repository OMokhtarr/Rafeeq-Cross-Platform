/**
 * Bringing the QCF V4 page layout under Content Sync.
 *
 * tafsirs and recitations are bootstrapped when the user picks one. The mushaf
 * layout has no such moment — every reader of the default mushaf needs it — so
 * it is kicked off from the app lifecycle instead (useContentSync).
 *
 * Fire-and-forget by design: the app stays fully usable while this runs and if
 * it never succeeds. getPage() falls back to /verses/by_page/ whenever no
 * layout row exists, so a failure here costs the authoritative line breaks,
 * not the page.
 */

import { isTracked } from "./sync-state.service";
import { bootstrapResource } from "./content-sync.service";
import { LAYOUT_MUSHAF_RESOURCE_ID } from "../data/page-layout";

/**
 * Guards against a cold start and a resume both firing one. The snapshot is
 * ~23 MB, so a duplicate fetch is a real cost on a phone.
 */
let inflight: Promise<void> | null = null;

/** Bootstrap `mushafs:19` once. Never rejects. */
export function ensureMushafLayoutTracked(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (await isTracked("mushafs", LAYOUT_MUSHAF_RESOURCE_ID)) return;
      await bootstrapResource("mushafs", LAYOUT_MUSHAF_RESOURCE_ID);
    } catch {
      // Offline on a cold start is the common case. The resource is left
      // untracked (or tracked-but-empty, which the engine's recovery pass
      // picks up), and the next launch tries again.
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
