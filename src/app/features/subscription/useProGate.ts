/**
 * PRO GATE
 *
 * The one place recite surfaces ask "may this person start listening?".
 * Only the action that STARTS listening is gated — arming recite mode,
 * stopping a session, and playback never are.
 *
 * `locked` drives the PRO badge. It is true only when the app-side switch is
 * on and the person isn't subscribed. A broker refusal (402) is handled even
 * with the switch off: if the server says no, the person gets the
 * subscriber note, not a raw error.
 */

import { useCallback } from "react";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { isProGateOn } from "../../core/services/subscription/pro-gate";
import { NOT_SUBSCRIBED_MESSAGE } from "../../core/services/audio/stt/broker";

export interface ProGate {
  locked: boolean;
  /** Runs `start` when allowed; otherwise opens the subscriber note. */
  requirePro: (start: () => void) => void;
  /** True (and opens the note) when `message` is the broker's
   *  not-subscribed refusal; false for any other error. */
  handleNotSubscribed: (message: string | null) => boolean;
}

export function useProGate(): ProGate {
  const { isPro, openNote, markNotPro } = useSubscription();
  const locked = isProGateOn() && !isPro;

  const requirePro = useCallback(
    (start: () => void) => {
      if (locked) openNote();
      else start();
    },
    [locked, openNote],
  );

  const handleNotSubscribed = useCallback(
    (message: string | null) => {
      if (message !== NOT_SUBSCRIBED_MESSAGE) return false;
      markNotPro();
      openNote();
      return true;
    },
    [markNotPro, openNote],
  );

  return { locked, requirePro, handleNotSubscribed };
}
