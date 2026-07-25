/**
 * Guard for features that cannot work without a network.
 *
 * Being offline is a state, not an error — the app is offline-first by design
 * and most of it keeps working. So the notice is styled as a calm gold-bordered
 * card in the app's own visual language rather than a red failure banner, and
 * it says what needs a connection instead of apologising.
 *
 * Usage:
 *   const { guard } = useOfflineGuard();
 *   const onDownload = () => guard(t.offline.download, () => startDownload());
 */

import { useCallback } from "react";
import { useIonToast } from "@ionic/react";
import { useLang } from "../context/LanguageContext";
import { isNetworkReachable } from "../services/api/network.service";

import "./useOfflineGuard.css";

export function useOfflineGuard() {
  const [presentToast] = useIonToast();
  const { t } = useLang();

  /** Shows the offline notice. `message` defaults to the generic wording. */
  const notifyOffline = useCallback(
    (message?: string) => {
      presentToast({
        message: message ?? t.offline.message,
        duration: 3000,
        position: "bottom",
        cssClass: "rafeeq-offline-toast",
      });
    },
    [presentToast, t],
  );

  /**
   * Runs `action` only when the network is reachable, otherwise shows the
   * notice. Returns true when the action ran.
   */
  const guard = useCallback(
    async (
      message: string | undefined,
      action: () => unknown,
    ): Promise<boolean> => {
      if (!(await isNetworkReachable())) {
        notifyOffline(message);
        return false;
      }
      await action();
      return true;
    },
    [notifyOffline],
  );

  return { guard, notifyOffline };
}
