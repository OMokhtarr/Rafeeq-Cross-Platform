/**
 * Drives Content Sync from the app lifecycle.
 *
 * Mounted once at the app root. Runs on cold start and whenever the app comes
 * back to the foreground; runSync() throttles to once per 24 h, so firing on
 * both the Capacitor resume and the WebView becoming visible is harmless.
 *
 * The adapter imports below are load-bearing: importing them is what registers
 * them with the engine.
 */

import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { runSync } from "../services/sync/content-sync.service";
import { ensureMushafLayoutTracked } from "../services/sync/mushaf-bootstrap";
import "../services/sync/adapters/tafsirs.adapter";
import "../services/sync/adapters/recitations.adapter";
import "../services/sync/adapters/mushafs.adapter";

export function useContentSync(): void {
  useEffect(() => {
    const attempt = () => {
      // The mushaf layout has no user-facing "download" moment the way a
      // tafsir does, so first-run bootstrap is driven from here. It resolves
      // immediately once tracked and never rejects.
      ensureMushafLayoutTracked();
      runSync().catch(() => {
        /* state records the failure; never surface it as a crash */
      });
    };

    attempt();

    const onVisible = () => {
      if (document.visibilityState === "visible") attempt();
    };
    document.addEventListener("visibilitychange", onVisible);

    let handle: { remove: () => void } | undefined;
    CapApp.addListener("resume", attempt)
      .then((h) => {
        handle = h;
      })
      .catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      handle?.remove();
    };
  }, []);
}
