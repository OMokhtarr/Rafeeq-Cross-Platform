import { useEffect } from "react";

export function useWakeLock(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let sentinel: any = null;

    async function acquire() {
      try {
        sentinel = await (navigator as any).wakeLock.request("screen");
      } catch {
        // Silently ignore — e.g. battery saver mode, low power state
      }
    }

    // Re-acquire after the page becomes visible again (required by the spec)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release();
    };
  }, [enabled]);
}
