/**
 * NATIVE AUDIO OUTPUT (Android)
 *
 * A thin bridge that lets the JS playback brain (usePlaybackQueue) drive the native
 * ExoPlayer instead of the WebView <audio> element on Android. The brain stays the
 * single source of truth for queue/repeat/range/page logic; this only handles OUTPUT:
 * "play this resolved file/URL", "pause", "seek", and "tell me when the track ended".
 *
 * Why: ExoPlayer plays reliably from the native side, which is what makes Android Auto
 * cold-start playback work without a running WebView. On web/iOS this module is unused
 * (isNativeOutput() returns false) and the <audio> element plays as before.
 */

import { Capacitor } from "@capacitor/core";
import { DrivingMode } from "../native/driving-mode.plugin";
import { getNativeAudioUri } from "./audio-cache.service";
import { getColdStartUri } from "./audio-file-cache.service";

/** True only on Android, where playback output goes through ExoPlayer. */
export function isNativeOutput(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Resolve a verse to its native file:// URI and play it on ExoPlayer.
 * `index` is the queue index (echoed back in nativeTrackEnded so the brain knows
 * which track finished).
 */
export async function nativePlayVerse(
  reciter: string,
  sura: number,
  aya: number,
  index: number,
  title: string,
  signal?: AbortSignal,
): Promise<void> {
  const uri = await getNativeAudioUri(reciter, sura, aya, signal);
  await DrivingMode.loadNativeTrack({ url: uri, index, title, autoplay: true });
}

/**
 * Push the whole resolved queue to native so cold-start car playback can begin instantly
 * from the persisted list. Each verse resolves to a cached file:// URI if available, else
 * its remote https:// URL (ExoPlayer streams https directly). We must NOT drop uncached
 * verses — when this runs, the live path has only just started downloading, so most aren't
 * cached yet. Dropping them would persist a near-empty list and cold start would play
 * nothing (the exact bug we're fixing). One bad resolution is replaced with "" and only
 * trailing/leading empties are trimmed; gaps would misalign indices, so we keep order and
 * let ExoPlayer skip an occasional bad item.
 */
export async function pushNativeQueue(
  reciter: string,
  queue: Array<{ sura: number; aya: number }>,
  startIndex: number,
  title: string,
): Promise<void> {
  const uris = await Promise.all(
    queue.map(async ({ sura, aya }) => {
      try {
        return await getColdStartUri(reciter, sura, aya);
      } catch {
        return "";
      }
    }),
  );
  // Keep index alignment: only drop entries if ALL are empty (nothing resolved).
  const anyResolved = uris.some((u) => u.length > 0);
  if (!anyResolved) return; // nothing to persist; leave any prior queue intact
  await DrivingMode.setNativeQueue({
    urls: uris,
    startIndex,
    title,
    autoplay: false,
    // The surah of this (single-surah) queue, so native can restore page-nav / repeat-page /
    // duration if it has to self-advance after the app/brain is closed.
    sura: queue[0]?.sura ?? 0,
  });
}

/**
 * Play the bismillah (1:1) as a one-shot intro on ExoPlayer and resolve when it ends.
 * Uses a one-time listener on the 'nativeIntroEnded' carAction. Falls back to a timeout
 * so a missing/failed intro never blocks the first verse.
 */
export async function nativeBismillahIntro(reciter: string): Promise<void> {
  let uri: string;
  try {
    uri = await getNativeAudioUri(reciter, 1, 1);
  } catch {
    return; // can't fetch bismillah — skip silently
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      handle?.remove();
      clearTimeout(timer);
      resolve();
    };
    let handle: { remove: () => void } | undefined;
    // Safety timeout: bismillah is short; never wait more than 15s.
    const timer = setTimeout(finish, 15000);
    void DrivingMode.addListener("carAction", (event) => {
      if (event.action === "nativeIntroEnded") finish();
    }).then((h) => {
      handle = h;
      if (settled) h.remove();
    });
    void DrivingMode.playNativeIntro({ url: uri }).catch(() => finish());
  });
}

export function nativePause(): void {
  void DrivingMode.nativePause().catch(() => {});
}

export function nativeResume(): void {
  void DrivingMode.nativePlay().catch(() => {});
}

export function nativeSeek(positionMs: number): void {
  void DrivingMode.nativeSeek({ positionMs }).catch(() => {});
}

export function nativeSetSpeed(speed: number): void {
  void DrivingMode.nativeSetSpeed({ speed }).catch(() => {});
}
