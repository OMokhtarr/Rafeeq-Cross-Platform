/**
 * Toasts for freeze changes.
 *
 * The Account card is where freezes live, but a user who never opens it would
 * otherwise never learn the mechanic exists — a freeze would silently cover a
 * missed day and the streak would just keep going. These toasts are what make
 * earning and spending visible at the moment they happen.
 */
import { useCallback, useEffect } from "react";
import { useIonToast } from "@ionic/react";
import { useLang } from "../context/LanguageContext";
import type { QuizFreezeChange } from "../services/storage/quiz-streak.service";

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

/**
 * Toast freeze changes from any quiz completion while this view is mounted.
 * recordQuizCompletion is a plain function called from several quiz pages, so
 * it announces its freeze changes on the `quiz-streak-changed` event rather
 * than returning them up through each page's own flow.
 */
export function useQuizFreezeToasts(): void {
  const { toastFrozen, toastEarned } = useFreezeToast();

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<QuizFreezeChange>).detail;
      if (!detail) return;
      toastFrozen(detail.frozen.length);
      toastEarned(detail.earned);
    };
    window.addEventListener("quiz-streak-changed", onChange);
    return () => window.removeEventListener("quiz-streak-changed", onChange);
  }, [toastFrozen, toastEarned]);
}
