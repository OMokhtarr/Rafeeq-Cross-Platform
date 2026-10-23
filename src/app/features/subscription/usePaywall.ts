import { useCallback } from "react";
import { useIonToast } from "@ionic/react";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";

/**
 * Opens RevenueCat's Paywall. The paywall shows its own purchase and restore
 * feedback, so only the cases it can't speak for get a toast: it couldn't be
 * shown at all, or the store reported an error. A purchase leaves the person
 * where they were; they tap the mic again to recite.
 */
export function usePaywall(): () => Promise<void> {
  const { showPaywall } = useSubscription();
  const { t } = useLang();
  const [presentToast] = useIonToast();

  return useCallback(async () => {
    const outcome = await showPaywall();
    const message =
      outcome === "unavailable"
        ? t.subscription.noPlans
        : outcome === "failed"
          ? t.subscription.purchaseFailed
          : null;
    if (message) void presentToast({ message, duration: 2500, position: "bottom" });
  }, [showPaywall, t, presentToast]);
}
