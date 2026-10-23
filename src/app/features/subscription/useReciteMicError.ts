import { useEffect, useRef } from "react";
import { useProGate } from "./useProGate";

/**
 * Surfaces a recite session's error once, when it occurs. The broker's
 * not-subscribed refusal opens the subscriber note instead of an error
 * toast; anything else goes to the page's own handler (each recite surface
 * words its errors differently).
 */
export function useReciteMicError(
  micError: string | null,
  onError: (message: string) => void,
): void {
  const { handleNotSubscribed } = useProGate();
  // The page's handler is usually an inline closure; reading it through a
  // ref keeps the effect keyed on the error alone, so it fires once per error.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!micError) return;
    if (handleNotSubscribed(micError)) return;
    onErrorRef.current(micError);
  }, [micError, handleNotSubscribed]);
}
