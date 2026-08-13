/**
 * Toasts for freeze changes.
 *
 * The Account card is where freezes live, but a user who never opens it would
 * otherwise never learn the mechanic exists — a freeze would silently cover a
 * missed day and the streak would just keep going. These toasts are what make
 * earning and spending visible at the moment they happen.
 */
import { useCallback } from "react";
import { useIonToast } from "@ionic/react";
import { useLang } from "../context/LanguageContext";

export function useFreezeToast() {
  const [presentToast] = useIonToast();
  const { lang } = useLang();

  /** One or more days were covered by a freeze. */
  const toastFrozen = useCallback(
    (days: number) => {
      if (days <= 0) return;
      presentToast({
        message:
          lang === "ar"
            ? days === 1
              ? "تجميد غطّى يوماً فائتاً — سلسلتك مستمرة."
              : `تجميدان غطّيا ${days} أيام فائتة — سلسلتك مستمرة.`
            : days === 1
              ? "A freeze covered your missed day — your streak is safe."
              : `Freezes covered ${days} missed days — your streak is safe.`,
        duration: 3500,
        position: "top",
      });
    },
    [presentToast, lang],
  );

  /** Extra activity earned freezes back. */
  const toastEarned = useCallback(
    (count: number) => {
      if (count <= 0) return;
      presentToast({
        message:
          lang === "ar"
            ? "كسبت تجميد سلسلة."
            : count === 1
              ? "You earned a streak freeze."
              : `You earned ${count} streak freezes.`,
        duration: 2500,
        position: "top",
      });
    },
    [presentToast, lang],
  );

  return { toastFrozen, toastEarned };
}
