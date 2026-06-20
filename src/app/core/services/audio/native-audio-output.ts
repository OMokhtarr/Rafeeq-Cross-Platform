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
 * Push the whole resolved queue to native so cold-start car playback can begin
 * instantly from the persisted list. Resolves each verse to its file:// URI.
 * Best-effort: if some verses aren't cached yet they're skipped from the cold list
 * (they'll still play live when the brain reaches them).
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
        return await getNativeAudioUri(reciter, sura, aya);
      } catch {
        return "";
      }
    }),
  );
  await DrivingMode.setNativeQueue({
    urls: uris.filter((u) => u.length > 0),
    startIndex,
    title,
    autoplay: false,
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
