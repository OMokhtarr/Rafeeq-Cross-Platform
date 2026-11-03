/**
 * SYNC CONTEXT
 *
 * Runs Rafeeq Pro cloud sync while it is allowed (accounts on, signed in, Pro)
 * and tells the UI how it is going. Triggers: becoming active, the app coming
 * back to the foreground, the network coming back, and local edits (debounced).
 *
 * When Pro lapses or the person signs out the provider simply stops; the sync
 * state and the cloud data are left alone, so resubscribing merges normally.
 *
 * One sync runs at a time. A trigger that arrives while one is running (a
 * local edit, or a different account becoming active) schedules one more run
 * after it settles, so the running result is never trusted for later changes.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "./AuthContext";
import { useSubscription } from "./SubscriptionContext";
import { onLocalChange } from "../services/sync/local-changes";
import { getLastSyncedAt, syncNow as runSync } from "../services/sync/sync.service";

export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error";

interface SyncCtx {
  active: boolean;
  status: SyncStatus;
  lastSyncedAt: string | null;
  /** Starts a sync now; does nothing while sync is not active. */
  syncNow: () => void;
}

/** Quiet time after the last local edit before it is synced. */
const DEBOUNCE_MS = 5000;

const Ctx = createContext<SyncCtx>({ active: false, status: "off", lastSyncedAt: null, syncNow: () => {} });

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { enabled, user } = useAuth();
  const { isPro, ready } = useSubscription();
  const userId = user?.id ?? null;
  const active = enabled && !!userId && isPro && ready;

  const [status, setStatus] = useState<SyncStatus>("off");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const activeUserRef = useRef<string | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  // Starts a sync for the user active right now; null while inactive.
  const startRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !userId) {
      activeUserRef.current = null;
      startRef.current = null;
      setStatus("off");
      return;
    }
    activeUserRef.current = userId;
    setLastSyncedAt(getLastSyncedAt(userId));

    const start = () => {
      if (running.current) {
        again.current = true;
        setStatus("syncing");
        return;
      }
      running.current = true;
      setStatus("syncing");
      void runSync(userId).then((result) => {
        running.current = false;
        // Not active any more: the result belongs to nobody on screen.
        if (activeUserRef.current === null) {
          again.current = false;
          return;
        }
        if (again.current) {
          again.current = false;
          startRef.current?.();
          return;
        }
        if (result.status === "synced") {
          setLastSyncedAt(getLastSyncedAt(activeUserRef.current));
        }
        setStatus(result.status);
      });
    };
    startRef.current = start;
    // A run left over from before this effect (Pro lapsed, another account) was
    // not for this activation: run once more when it settles.
    start();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(start, DEBOUNCE_MS);
    };
    const unsubscribe = onLocalChange(onChange);
    const onOnline = () => start();
    window.addEventListener("online", onOnline);
    const resume = CapApp.addListener("resume", () => start());

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      resume.then((h) => h.remove()).catch(() => {});
    };
  }, [active, userId]);

  const syncNow = useCallback(() => startRef.current?.(), []);

  const value = useMemo<SyncCtx>(
    () => ({ active, status: active ? status : "off", lastSyncedAt, syncNow }),
    [active, status, lastSyncedAt, syncNow],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useSync = (): SyncCtx => useContext(Ctx);
